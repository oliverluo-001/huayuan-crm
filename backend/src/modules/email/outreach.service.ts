import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, IsNull, Not, Repository } from 'typeorm';
import { EmailTask, EmailTaskRecipient, EmailLog } from './entities';
import { OutreachReservation } from './entities/outreach-reservation.entity';
import { CustomersService } from '../customers/customers.service';
import { SettingsService } from '../settings/settings.service';
import { SuppressionService } from '../suppression/suppression.service';
import { findCustomerCountry } from '../customers/customer-geography';
import { resolveCustomerTimezone } from './customer-timezone';
import { isValidEmail, normalizeEmail } from './email-utils';
import { CreateOutreachDto, EditOutreachDraftDto, ScheduleOutreachDto } from './dto/outreach.dto';
import { NEW_CUSTOMER_STAGES, OutreachData, OutreachDraft, assertOutreachMessage } from './outreach-types';
import { evidenceExcerpt, generateOutreachMessage, outreachSummary } from './outreach-messages';
import { readPublicWebsite } from './outreach-research';

@Injectable()
export class OutreachService {
  constructor(
    @InjectRepository(EmailTask) private readonly tasks: Repository<EmailTask>,
    private readonly customers: CustomersService,
    private readonly settings: SettingsService,
    private readonly suppressions: SuppressionService,
  ) {}

  private scope(ownerId?: string) { return ownerId ? { ownerId } : {}; }

  async list(ownerId?: string) {
    const tasks = await this.tasks.find({ where: { ...this.scope(ownerId), outreachData: Not(IsNull()) }, order: { createdAt: 'DESC' }, take: 30 });
    return tasks.flatMap((task) => task.outreachData ? [{ id: task.emailTaskId, name: task.name, status: task.status, approvedAt: task.outreachData.approvedAt, ...outreachSummary(task.outreachData.drafts) }] : []);
  }

  private async task(id: string, ownerId?: string, manager?: EntityManager, lock = false) {
    const task = await (manager?.getRepository(EmailTask) || this.tasks).findOne({
      where: { emailTaskId: id, ...this.scope(ownerId) }, ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!task?.outreachData) throw new NotFoundException('客户解析草稿不存在');
    return task as EmailTask & { outreachData: OutreachData };
  }

  async detail(id: string, ownerId?: string) { return this.view(await this.task(id, ownerId)); }

  private async view(task: EmailTask) {
    if (!task.outreachData) throw new NotFoundException('客户解析草稿不存在');
    const smtp: { smtpFrom?: string; smtpUser?: string; credentialStatus?: string } | null = await this.settings.getSmtpProfile(task.ownerId || undefined);
    return {
      id: task.emailTaskId, name: task.name, status: task.status, data: task.outreachData,
      summary: outreachSummary(task.outreachData.drafts),
      schedule: { startAt: task.startAt, batchSize: task.batchSize, intervalMinutes: task.intervalMinutes, totalRuns: task.totalRuns },
      delivery: { sent: task.successfulSendCount, failed: task.failedSendCount, skipped: task.skippedSendCount, message: task.lastMessage },
      senderAccount: { from: smtp?.smtpFrom || smtp?.smtpUser || '', configured: smtp?.credentialStatus === 'saved' },
    };
  }

  private async resolve(key: string, ownerId?: string) {
    if (!/^(customer|contact):[^:\s]{1,64}$/.test(key)) throw new BadRequestException('收件人标识无效');
    const contact = key.startsWith('contact:') ? await this.customers.findContactByIdentifier(key.slice(8)) : null;
    const customer = contact ? await this.customers.findOne(contact.customerId) : await this.customers.findByIdentifier(key.slice(9));
    await this.customers.assertCustomerOwner(customer.id, ownerId);
    return { customer, contact, email: normalizeEmail(contact ? contact.email : customer.email) };
  }

  private async blocked(key: string, targetCountry: string, ownerId: string | undefined, manager: EntityManager, ignoreTaskId?: number) {
    const { customer, contact, email } = await this.resolve(key, ownerId);
    const reasons: string[] = [];
    if (!isValidEmail(email) || customer.emailStatus === 'invalid') reasons.push('邮箱无效或已标记异常');
    if (await this.suppressions.isSuppressed(email)) reasons.push('邮箱已退订或在抑制名单');
    if (contact?.marketingAllowed === false || !(await this.customers.isCustomerEmailMarketingAllowed(customer.id, email))) reasons.push('该联系人不允许营销邮件');
    if (!NEW_CUSTOMER_STAGES.includes(customer.journeyStage || '')) reasons.push('客户已进入联系或后续阶段，不适合首次开发');
    if (customer.emailSentCount > 0 || await manager.getRepository(EmailLog).findOne({ where: { recipientEmail: email, status: In(['sent', 'bounced']) } })) reasons.push('已有发送或退信记录，需另行判断跟进');
    const target = findCustomerCountry(targetCountry);
    const actual = findCustomerCountry(customer.country);
    if (!actual || actual.name !== target?.name) reasons.push('客户国家缺失或与目标市场不符，请先修正客户资料');
    const timezone = resolveCustomerTimezone(customer.timezone, customer.region, customer.country);
    if (!timezone) reasons.push('客户时区缺失');
    if (/^(hr|careers|jobs|communications|press|customercare)@/i.test(email)) reasons.push('当前邮箱为非采购职能，先核实联系渠道');
    const reserved = await manager.getRepository(OutreachReservation).findOne({ where: { email } });
    if (reserved && reserved.taskId !== ignoreTaskId) reasons.push('邮箱已被其他客户解析任务排程或处理');
    const pending = await manager.getRepository(EmailTaskRecipient).createQueryBuilder('r')
      .innerJoin(EmailTask, 't', 't.id = r.taskId').where('r.email = :email', { email })
      .andWhere('r.status IN (:...states)', { states: ['queued', 'sending'] })
      .andWhere('t.status IN (:...taskStates)', { taskStates: ['active', 'sending', 'pending'] })
      .getOne();
    if (pending && pending.taskId !== ignoreTaskId) reasons.push('邮箱已有待发送或结果待核对任务');
    return { customer, contact, email, timezone, reasons };
  }

  async create(dto: CreateOutreachDto, ownerId = '') {
    const existing = await this.tasks.findOne({ where: { emailTaskId: dto.requestId } });
    if (existing) {
      if (existing.ownerId !== ownerId) throw new NotFoundException('客户解析草稿不存在');
      return this.view(existing);
    }
    if (!findCustomerCountry(dto.targetCountry)) throw new BadRequestException('请填写明确的目标国家，如 UAE 或阿联酋');
    const keys = [...new Set(dto.recipientKeys)];
    const seen = new Set<string>(); const seenCustomers = new Set<number>();
    const drafts: OutreachDraft[] = [];
    // Bounded batches avoid an unbounded website crawler behind a single request.
    for (let index = 0; index < keys.length; index += 3) {
      const resolved = await Promise.all(keys.slice(index, index + 3).map(async (key) => {
        const state = await this.blocked(key, dto.targetCountry, ownerId || undefined, this.tasks.manager);
        let text = ''; let sourceUrl = state.customer.website || '';
        let evidenceStatus: OutreachDraft['evidence']['status'] = dto.researchWebsites === false ? 'not_requested' : 'unavailable';
        if (!state.reasons.length && dto.researchWebsites !== false && sourceUrl) {
          try {
            const page = await readPublicWebsite(sourceUrl);
            text = page.text; sourceUrl = page.url;
            if (text.length > 80) evidenceStatus = 'verified';
          } catch { /* A failed source is a visible gap, never a verified fact. */ }
        }
        const message = generateOutreachMessage(state.customer.company, `${state.customer.business || ''} ${state.customer.product || ''}`, evidenceStatus === 'verified' ? text : '', dto.sender, dto.productScope);
        return { key, state, message, text, sourceUrl, evidenceStatus };
      }));
      for (const { key, state, message, text, sourceUrl, evidenceStatus } of resolved) {
        const reasons = [...state.reasons];
        if (seen.has(state.email) || seenCustomers.has(state.customer.id)) reasons.push('本次客户或邮箱重复，仅保留一个采购联系入口');
        if (!reasons.length) { seen.add(state.email); seenCustomers.add(state.customer.id); }
        if (!assertOutreachMessage(message.subject, message.body)) throw new BadRequestException('产品描述或签名包含未填写占位符或HTML，请使用完整纯文本');
        drafts.push({ recipientKey: key, customerId: state.customer.id, contactId: state.contact?.id || null, email: state.email,
          company: state.customer.company, name: state.contact?.name || state.customer.contact || state.customer.company,
          timezone: state.timezone, ...message,
          evidence: { url: sourceUrl, checkedAt: new Date().toISOString(), excerpt: evidenceExcerpt(text), status: evidenceStatus },
          warnings: [...reasons, ...(evidenceStatus !== 'verified' ? ['官网未完成核验，邮件采用条件式探询'] : ['仅核对官网页面关键词，采购意向仍需确认'])],
          eligible: reasons.length === 0, selected: reasons.length === 0 && message.segment !== 'unknown',
        });
      }
    }
    try {
      const task = await this.tasks.manager.transaction(async (manager) => {
        return manager.save(EmailTask, manager.create(EmailTask, {
          emailTaskId: dto.requestId, name: dto.name, ownerId, templateId: '',
          taskMode: 'scheduled', status: 'pending', customerIds: '[]', subject: '客户解析：逐客邮件', body: '',
          lastMessage: '客户解析已保存，尚未启用发送',
          outreachData: { version: 1, revision: 0, targetCountry: dto.targetCountry, productScope: dto.productScope, sender: dto.sender, drafts },
        }));
      });
      return this.view(task);
    } catch (error) {
      if (error?.code === 'ER_DUP_ENTRY') return this.detail(dto.requestId, ownerId || undefined);
      throw error;
    }
  }

  async edit(id: string, key: string, dto: EditOutreachDraftDto, ownerId?: string) {
    const task = await this.tasks.manager.transaction(async (manager) => {
      const task = await this.task(id, ownerId, manager, true);
      if (task.outreachData.approvedAt || task.status !== 'pending') throw new BadRequestException('已排程的邮件不可修改，请先在发信任务中处理');
      if (task.outreachData.revision !== dto.revision) throw new ConflictException('草稿已更新，请刷新后再编辑');
      const draft = task.outreachData.drafts.find((d) => d.recipientKey === key);
      if (!draft) throw new NotFoundException('邮件草稿不存在');
      if (dto.selected && !draft.eligible) throw new BadRequestException('待核对客户不能加入发送');
      if (!assertOutreachMessage(dto.subject, dto.body)) throw new BadRequestException('请填写完整的纯文本主题和正文，移除占位符');
      Object.assign(draft, { subject: dto.subject.trim(), body: dto.body.trim(), selected: dto.selected });
      task.outreachData.revision += 1;
      return manager.save(EmailTask, task);
    });
    return this.view(task);
  }

  async schedule(id: string, dto: ScheduleOutreachDto, ownerId?: string) {
    const task = await this.tasks.manager.transaction(async (manager) => {
      const task = await this.task(id, ownerId, manager, true);
      // Repeated submissions return the existing plan, never create another one.
      if (task.outreachData.approvedAt) return task;
      if (task.status !== 'pending') throw new BadRequestException('当前状态不可排程');
      if (task.outreachData.revision !== dto.revision) throw new ConflictException('草稿已更新，请刷新后重新核对');
      const startAt = new Date(dto.startAt);
      if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(dto.startAt) || !Number.isFinite(startAt.getTime()) || startAt.getTime() < Date.now() + 60_000) throw new BadRequestException('请选择至少一分钟以后的明确开始时间，并包含时区');
      const selected = task.outreachData.drafts.filter((d) => d.selected && d.eligible);
      if (!selected.length) throw new BadRequestException('请至少选择一封可发送邮件');
      if (dto.batchSize * dto.totalRuns < selected.length) throw new BadRequestException('批次容量不足，请增加轮数或减少所选邮件');
      const smtp = await this.settings.getSmtpCredentials(task.ownerId || undefined);
      const from = String(smtp.smtpFrom || smtp.smtpUser || '').trim();
      const fromEmail = normalizeEmail(from.match(/<([^>]+)>/)?.[1] || from);
      if (!smtp.smtpHost || !smtp.pass || fromEmail !== normalizeEmail(task.outreachData.sender.email)) throw new BadRequestException('实际发件账户与签名邮箱不符或SMTP配置不完整，请前往设置核对');
      for (const draft of selected) {
        const state = await this.blocked(draft.recipientKey, task.outreachData.targetCountry, task.ownerId || undefined, manager, task.id);
        if (state.email !== draft.email || state.reasons.length) throw new BadRequestException(`${draft.company}：${state.reasons.join('；') || '邮箱已变更，请重新解析'}`);
        if (!assertOutreachMessage(draft.subject, draft.body)) throw new BadRequestException(`${draft.company}：邮件内容不完整`);
        draft.timezone = state.timezone;
        try { await manager.insert(OutreachReservation, { email: draft.email, taskId: task.id }); }
        catch (error) { if (error?.code === 'ER_DUP_ENTRY') throw new ConflictException('部分邮箱刚被其他任务排程，请重新核对'); throw error; }
        await manager.save(EmailTaskRecipient, manager.create(EmailTaskRecipient, {
          taskId: task.id, recipientKey: draft.recipientKey, customerId: draft.customerId, contactId: draft.contactId,
          email: draft.email, name: draft.name, company: draft.company, timezone: draft.timezone,
          status: 'queued', attempts: 0, lastError: null, sentAt: null,
        }));
      }
      Object.assign(task, { startAt, scheduledAt: startAt, nextRunAt: startAt, batchSize: dto.batchSize, intervalMinutes: dto.intervalMinutes,
        totalRuns: dto.totalRuns, taskMode: 'scheduled', status: 'active', customerIds: JSON.stringify(selected.map((d) => d.recipientKey)),
        lastMessage: `客户解析邮件已确认：${selected.length}封，将按指定时间分批发送` });
      task.outreachData.approvedAt = new Date().toISOString();
      task.outreachData.smtpFrom = from;
      task.outreachData.revision += 1;
      return manager.save(EmailTask, task);
    });
    return this.view(task);
  }
}
