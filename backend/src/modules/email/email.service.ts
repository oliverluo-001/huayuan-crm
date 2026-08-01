import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createTransport, Transporter } from 'nodemailer';
import { In, IsNull, LessThanOrEqual, MoreThanOrEqual, Repository } from 'typeorm';
import {
  EmailLog,
  EmailTask,
  EmailTaskRecipient,
  EmailTemplate,
} from './entities';
import {
  CreateEmailTaskDto,
  CreateTemplateDto,
  UpdateEmailTaskDto,
  UpdateTemplateDto,
} from './dto';
import { CustomersService } from '../customers/customers.service';
import { SettingsService } from '../settings/settings.service';
import { SuppressionService } from '../suppression/suppression.service';
import { createUnsubscribeToken } from '../../common/utils/unsubscribe';
import {
  bodyToHtml,
  checkSendWindow,
  delay,
  isValidEmail,
  normalizeEmail,
  renderTemplate,
} from './email-utils';

const MAX_SEND_ATTEMPTS = 3;
const SCHEDULER_INTERVAL_MS = 15_000;

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly processingTasks = new Set<number>();
  private scheduler?: NodeJS.Timeout;
  private lastSendAt = 0;
  private sendLock: Promise<void> = Promise.resolve();

  constructor(
    @InjectRepository(EmailTemplate)
    private templateRepository: Repository<EmailTemplate>,
    @InjectRepository(EmailTask)
    private taskRepository: Repository<EmailTask>,
    @InjectRepository(EmailLog)
    private logRepository: Repository<EmailLog>,
    @InjectRepository(EmailTaskRecipient)
    private recipientRepository: Repository<EmailTaskRecipient>,
    private customersService: CustomersService,
    private settingsService: SettingsService,
    private suppressionService: SuppressionService,
  ) {}

  onModuleInit() {
    this.scheduler = setInterval(() => {
      void this.processDueTasks();
    }, SCHEDULER_INTERVAL_MS);
    this.scheduler.unref?.();
    void this.processDueTasks();
  }

  onModuleDestroy() {
    if (this.scheduler) clearInterval(this.scheduler);
  }

  // ==================== Templates ====================

  async findAllTemplates() {
    return this.templateRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOneTemplate(id: number) {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('模板不存在');
    return template;
  }

  async createTemplate(createDto: CreateTemplateDto) {
    const template = this.templateRepository.create({
      ...createDto,
      templateId: this.generateId('tmpl'),
    });
    return this.templateRepository.save(template);
  }

  async updateTemplate(id: number, updateDto: UpdateTemplateDto) {
    const template = await this.findOneTemplate(id);
    Object.assign(template, updateDto);
    return this.templateRepository.save(template);
  }

  async removeTemplate(id: number) {
    const result = await this.templateRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('模板不存在');
    return { deleted: true };
  }

  // ==================== Tasks ====================

  private formatTask(task: EmailTask) {
    const customerIds = this.parseCustomerIds(task.customerIds);
    return {
      ...task,
      customerIds,
      completedRuns: task.runsCompleted,
    };
  }

  async findAllTasks(filters: Record<string, any> = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.ownerId) where.ownerId = filters.ownerId;
    const tasks = await this.taskRepository.find({ where, order: { createdAt: 'DESC' } });
    return tasks.map((task) => this.formatTask(task));
  }

  async findOneTask(idOrEmailTaskId: string, ownerId?: string) {
    return this.formatTask(await this.findTaskEntity(idOrEmailTaskId, ownerId));
  }

  async createTask(createDto: CreateEmailTaskDto, ownerId = '') {
    const customerIds = (createDto.customerIds || []).map((id) => String(id));
    if (customerIds.length === 0) throw new BadRequestException('请至少选择一个收件客户');
    if (!createDto.templateId) throw new BadRequestException('请选择邮件模板');

    const template = await this.findTemplateByIdentifier(createDto.templateId);
    const startAt = createDto.startAt ? new Date(createDto.startAt) : null;
    if (startAt && Number.isNaN(startAt.getTime())) throw new BadRequestException('指定开始时间无效');

    const task = this.taskRepository.create({
      ...createDto,
      ownerId,
      emailTaskId: this.generateId('etask'),
      customerIds: JSON.stringify(customerIds),
      subject: createDto.subject || template.subject,
      body: createDto.body || template.body,
      taskMode: createDto.taskMode === 'scheduled' ? 'scheduled' : 'once',
      totalRuns: Math.max(1, Number(createDto.totalRuns || 1)),
      batchSize: Math.max(0, Number(createDto.batchSize || 0)),
      intervalMinutes: Math.max(1, Number(createDto.intervalMinutes || 1440)),
      scheduledAt: createDto.scheduledAt ? new Date(createDto.scheduledAt) : null,
      startAt,
      status: 'pending',
      runsCompleted: 0,
      successfulSendCount: 0,
      failedSendCount: 0,
      skippedSendCount: 0,
      lastMessage: '等待开始任务',
    } as EmailTask);
    return this.formatTask(await this.taskRepository.save(task));
  }

  async updateTask(idOrEmailTaskId: string, updateDto: UpdateEmailTaskDto, ownerId?: string) {
    const task = await this.findTaskEntity(idOrEmailTaskId, ownerId);
    const { customerIds, scheduledAt, startAt, ...rest } = updateDto;
    Object.assign(task, rest);
    if (customerIds) task.customerIds = JSON.stringify(customerIds.map((id: string | number) => String(id)));
    if (scheduledAt) task.scheduledAt = new Date(scheduledAt);
    if (startAt) task.startAt = new Date(startAt);
    return this.formatTask(await this.taskRepository.save(task));
  }

  async removeTask(idOrEmailTaskId: string, ownerId?: string) {
    const task = await this.findTaskEntity(idOrEmailTaskId, ownerId);
    if (['sending', 'active'].includes(task.status)) {
      throw new BadRequestException('请先取消运行中的邮件任务');
    }
    await this.recipientRepository.delete({ taskId: task.id });
    await this.taskRepository.delete(task.id);
    return { deleted: true };
  }

  async runTask(idOrEmailTaskId: string, ownerId?: string) {
    const task = await this.findTaskEntity(idOrEmailTaskId, ownerId);
    if (['active', 'sending'].includes(task.status)) return this.formatTask(task);
    if (task.status === 'cancelled') throw new BadRequestException('已取消任务不能重新启动');

    const recipientCount = await this.ensureTaskRecipients(task);
    if (recipientCount === 0) throw new BadRequestException('所选客户没有可用邮箱');

    const now = new Date();
    const startAt = task.startAt;
    const startsLater = Boolean(startAt && startAt.getTime() > now.getTime());
    task.status = 'active';
    task.nextRunAt = startsLater ? task.startAt : now;
    task.lastMessage = startsLater
      ? `任务已启动，将于 ${startAt!.toLocaleString()} 开始发送`
      : '任务已启动，等待发送';
    await this.taskRepository.save(task);
    if (!startsLater) void this.processTask(task.id);
    return this.formatTask(task);
  }

  async cancelTask(idOrEmailTaskId: string, ownerId?: string) {
    const task = await this.findTaskEntity(idOrEmailTaskId, ownerId);
    task.status = 'cancelled';
    task.nextRunAt = null;
    task.lastMessage = '任务已取消';
    await this.taskRepository.save(task);
    return this.formatTask(task);
  }

  // ==================== Logs ====================

  private formatLog(log: EmailLog) {
    return {
      id: log.logId || String(log.id),
      email: log.recipientEmail,
      customerId: log.customerId,
      customerName: log.customerName || '',
      contactId: log.contactId || '',
      templateId: log.templateId || '',
      templateName: log.templateName || '',
      taskId: log.emailTaskId || '',
      taskName: log.taskName || '',
      status: log.status,
      message: log.errorMessage || '',
      messageId: log.messageId || '',
      attempt: log.attempt || 1,
      createdAt: log.sentAt,
    };
  }

  async findAllLogs(filters: Record<string, any> = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.ownerId) where.ownerId = filters.ownerId;
    const logs = await this.logRepository.find({ where, order: { sentAt: 'DESC' } });
    return logs.map((log) => this.formatLog(log));
  }

  async removeLog(idOrLogId: string, ownerId?: string) {
    const numericId = Number(idOrLogId);
    const log = await this.logRepository.findOne({
      where: Number.isInteger(numericId) && numericId > 0
        ? [{ id: numericId }, { logId: idOrLogId }]
        : { logId: idOrLogId },
    });
    if (!log) throw new NotFoundException('发送日志不存在');
    if (ownerId && log.ownerId !== ownerId) throw new NotFoundException('发送日志不存在');
    await this.logRepository.remove(log);
    return { deleted: true };
  }

  async createLog(data: Partial<EmailLog> & Pick<EmailLog, 'recipientEmail' | 'subject' | 'status'>) {
    const log = this.logRepository.create({ ...data, logId: this.generateId('log') });
    return this.logRepository.save(log);
  }

  // ==================== Bounce Check ====================

  async checkBounces() {
    return {
      ok: true,
      checked: 0,
      bounced: 0,
      message: 'SMTP 发送已恢复；IMAP 退信与回复同步将在下一阶段启用',
    };
  }

  // ==================== Execution ====================

  private async processDueTasks() {
    const now = new Date();
    const tasks = await this.taskRepository.find({
      where: [
        { status: In(['active', 'sending']), nextRunAt: IsNull() },
        { status: In(['active', 'sending']), nextRunAt: LessThanOrEqual(now) },
      ],
      order: { nextRunAt: 'ASC' },
      take: 10,
    });
    for (const task of tasks) await this.processTask(task.id);
  }

  private async processTask(taskId: number) {
    if (this.processingTasks.has(taskId)) return;
    this.processingTasks.add(taskId);
    try {
      const task = await this.taskRepository.findOne({ where: { id: taskId } });
      if (!task || !['active', 'sending'].includes(task.status)) return;

      const now = new Date();
      if (task.startAt && task.startAt > now) {
        task.status = 'active';
        task.nextRunAt = task.startAt;
        await this.taskRepository.save(task);
        return;
      }

      const [template, smtp, policy] = await Promise.all([
        this.findTemplateByIdentifier(task.templateId),
        this.settingsService.getSmtpCredentials(),
        this.settingsService.getEmailPolicy(),
      ]);
      const transporter = this.createSmtpTransport(smtp);
      await transporter.verify();

      task.status = 'sending';
      task.lastMessage = '正在发送邮件';
      await this.taskRepository.save(task);

      const queued = await this.recipientRepository.find({
        where: { taskId, status: 'queued' },
        order: { id: 'ASC' },
      });
      if (queued.length === 0) {
        await this.finishTask(task);
        return;
      }

      const batchSize = Number(task.batchSize || 0);
      const targetSuccess = task.taskMode === 'once'
        ? queued.length
        : batchSize > 0
          ? batchSize
          : queued.length;
      let successfulThisRun = 0;
      let deferred = 0;
      let rateLimitedUntil: Date | null = null;

      for (const recipient of queued) {
        if (successfulThisRun >= targetSuccess) break;
        const latest = await this.taskRepository.findOne({ where: { id: taskId } });
        if (!latest || latest.status === 'cancelled') return;

        if (!isValidEmail(recipient.email)) {
          await this.skipRecipient(recipient, '邮箱格式无效');
          continue;
        }
        if (await this.suppressionService.isSuppressed(recipient.email)) {
          await this.skipRecipient(recipient, '邮箱在退订或抑制名单中');
          continue;
        }

        const window = checkSendWindow(recipient.timezone, new Date(), policy);
        if (!window.allowed) {
          if (window.reason?.includes('缺失') || window.reason?.includes('无效')) {
            await this.skipRecipient(recipient, window.reason);
          } else {
            recipient.lastError = window.reason || '客户当地时间不允许发送';
            await this.recipientRepository.save(recipient);
            deferred++;
          }
          continue;
        }

        const rateWait = await this.getRateLimitWait(policy);
        if (rateWait > 0) {
          rateLimitedUntil = new Date(Date.now() + rateWait);
          break;
        }

        const sent = await this.sendRecipient(task, template, recipient, transporter, smtp, policy);
        if (sent) successfulThisRun++;
      }

      if (task.taskMode === 'scheduled' && successfulThisRun > 0) task.runsCompleted += 1;
      await this.refreshTaskCounts(task);

      const remaining = await this.recipientRepository.count({ where: { taskId, status: 'queued' } });
      const totalRuns = Math.max(1, Number(task.totalRuns || 1));
      const reachedRunLimit = task.taskMode === 'scheduled' && task.runsCompleted >= totalRuns;

      if (remaining === 0 || reachedRunLimit) {
        await this.finishTask(task);
      } else {
        task.status = 'active';
        task.nextRunAt = rateLimitedUntil || new Date(
          Date.now() + (successfulThisRun > 0
            ? Math.max(1, Number(task.intervalMinutes || 1)) * 60_000
            : 30 * 60_000),
        );
        task.lastMessage = rateLimitedUntil
          ? '达到发送限额，任务已自动延后'
          : deferred > 0 && successfulThisRun === 0
            ? '客户当地时间不适合发送，任务已自动延后'
            : `本轮成功 ${successfulThisRun} 封，等待下一轮`;
        await this.taskRepository.save(task);
      }
    } catch (error: any) {
      this.logger.error(`邮件任务 ${taskId} 执行失败`, error?.stack || error);
      const task = await this.taskRepository.findOne({ where: { id: taskId } });
      if (task && task.status !== 'cancelled') {
        task.status = 'failed';
        task.errorMessage = this.errorMessage(error);
        task.lastMessage = `任务失败：${task.errorMessage}`;
        task.nextRunAt = null;
        await this.taskRepository.save(task);
      }
    } finally {
      this.processingTasks.delete(taskId);
    }
  }

  private async sendRecipient(
    task: EmailTask,
    template: EmailTemplate,
    recipient: EmailTaskRecipient,
    transporter: Transporter,
    smtp: Record<string, any>,
    policy: Record<string, any>,
  ) {
    const customer = recipient.customerId
      ? await this.customersService.findOne(recipient.customerId)
      : null;
    const variables = {
      company: recipient.company || customer?.company || '',
      contact: recipient.name || customer?.contact || '',
      product: customer?.product || '',
      email: recipient.email,
    };
    const subject = renderTemplate(task.subject || template.subject, variables);
    const body = renderTemplate(task.body || template.body, variables);
    const secret = await this.settingsService.getOrCreateUnsubscribeSecret();
    const unsubscribeToken = createUnsubscribeToken(recipient.email, secret);
    const baseUrl = String(
      process.env.PUBLIC_BASE_URL || `http://localhost:${process.env.PORT || 5178}`,
    ).replace(/\/$/, '');
    const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`;
    const prepared = this.prepareTemplateBody(body, template.images || [], unsubscribeUrl);

    for (let attempt = recipient.attempts + 1; attempt <= MAX_SEND_ATTEMPTS; attempt++) {
      recipient.status = 'sending';
      recipient.attempts = attempt;
      recipient.lastError = null;
      await this.recipientRepository.save(recipient);
      try {
        const info = await this.serializedSend(async () => {
          await this.waitForMinimumDelay(Number(policy.minDelaySeconds || 0));
          return transporter.sendMail({
            from: smtp.smtpFrom || smtp.smtpUser,
            to: recipient.email,
            subject,
            text: body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
            html: prepared.html,
            attachments: prepared.attachments,
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          });
        });

        recipient.status = 'sent';
        recipient.sentAt = new Date();
        await this.recipientRepository.save(recipient);
        await this.createLog({
          ownerId: task.ownerId,
          customerId: customer?.customerId || '',
          contactId: recipient.contactId ? String(recipient.contactId) : '',
          customerName: recipient.company,
          emailTaskId: task.emailTaskId,
          taskName: task.name,
          templateId: template.templateId,
          templateName: template.name,
          recipientEmail: recipient.email,
          subject,
          status: 'sent',
          messageId: info.messageId || '',
          attempt,
        });
        if (recipient.customerId) {
          await this.customersService.markEmailSent(recipient.customerId, subject, recipient.email);
        }
        return true;
      } catch (error: any) {
        recipient.lastError = this.errorMessage(error);
        if (attempt < MAX_SEND_ATTEMPTS) {
          recipient.status = 'queued';
          await this.recipientRepository.save(recipient);
          await delay(attempt * 2_000);
          continue;
        }
        recipient.status = 'failed';
        await this.recipientRepository.save(recipient);
        await this.createLog({
          ownerId: task.ownerId,
          customerId: customer?.customerId || '',
          contactId: recipient.contactId ? String(recipient.contactId) : '',
          customerName: recipient.company,
          emailTaskId: task.emailTaskId,
          taskName: task.name,
          templateId: template.templateId,
          templateName: template.name,
          recipientEmail: recipient.email,
          subject,
          status: 'failed',
          errorMessage: recipient.lastError,
          attempt,
        });
      }
    }
    return false;
  }

  private async ensureTaskRecipients(task: EmailTask) {
    const existing = await this.recipientRepository.count({ where: { taskId: task.id } });
    if (existing > 0) return existing;

    const seen = new Set<string>();
    for (const rawId of this.parseCustomerIds(task.customerIds)) {
      try {
        const value = String(rawId);
        if (value.startsWith('contact:')) {
          const contact = await this.customersService.findContactByIdentifier(value.slice(8));
          const customer = await this.customersService.findOne(contact.customerId);
          await this.addRecipient(task, {
            recipientKey: `contact:${contact.contactId || contact.id}`,
            customerId: customer.id,
            contactId: contact.id,
            email: contact.email,
            name: contact.name,
            company: customer.company,
            timezone: customer.timezone,
          }, seen);
        } else {
          const customerId = value.startsWith('customer:') ? value.slice(9) : value;
          const customer = await this.customersService.findByIdentifier(customerId);
          await this.addRecipient(task, {
            recipientKey: `customer:${customer.customerId || customer.id}`,
            customerId: customer.id,
            contactId: null,
            email: customer.email,
            name: customer.contact || customer.company,
            company: customer.company,
            timezone: customer.timezone,
          }, seen);
        }
      } catch (error: any) {
        this.logger.warn(`忽略无效收件人 ${rawId}: ${this.errorMessage(error)}`);
      }
    }
    return this.recipientRepository.count({ where: { taskId: task.id } });
  }

  private async addRecipient(
    task: EmailTask,
    data: Omit<EmailTaskRecipient, 'id' | 'taskId' | 'status' | 'attempts' | 'lastError' | 'sentAt' | 'createdAt' | 'updatedAt'>,
    seen: Set<string>,
  ) {
    const email = normalizeEmail(data.email);
    if (!email || seen.has(email)) return;
    seen.add(email);
    const recipient = this.recipientRepository.create({
      ...data,
      email,
      taskId: task.id,
      status: 'queued',
      attempts: 0,
      lastError: null,
      sentAt: null,
    });
    await this.recipientRepository.save(recipient);
  }

  private async skipRecipient(recipient: EmailTaskRecipient, reason: string) {
    recipient.status = 'skipped';
    recipient.lastError = reason;
    await this.recipientRepository.save(recipient);
  }

  private async refreshTaskCounts(task: EmailTask) {
    const [sent, failed, skipped] = await Promise.all([
      this.recipientRepository.count({ where: { taskId: task.id, status: 'sent' } }),
      this.recipientRepository.count({ where: { taskId: task.id, status: 'failed' } }),
      this.recipientRepository.count({ where: { taskId: task.id, status: 'skipped' } }),
    ]);
    task.successfulSendCount = sent;
    task.failedSendCount = failed;
    task.skippedSendCount = skipped;
  }

  private async finishTask(task: EmailTask) {
    await this.refreshTaskCounts(task);
    task.status = task.successfulSendCount === 0 && task.failedSendCount > 0 ? 'failed' : 'completed';
    task.nextRunAt = null;
    task.lastRunAt = new Date();
    task.lastMessage = `任务结束：成功 ${task.successfulSendCount} 封，失败 ${task.failedSendCount} 封，跳过 ${task.skippedSendCount} 封`;
    await this.taskRepository.save(task);
  }

  private async getRateLimitWait(policy: Record<string, any>) {
    const now = Date.now();
    const [hourCount, dayCount] = await Promise.all([
      this.logRepository.count({
        where: { status: 'sent', sentAt: MoreThanOrEqual(new Date(now - 60 * 60_000)) },
      }),
      this.logRepository.count({
        where: { status: 'sent', sentAt: MoreThanOrEqual(new Date(now - 24 * 60 * 60_000)) },
      }),
    ]);
    if (Number(policy.maxPerDay || 0) > 0 && dayCount >= Number(policy.maxPerDay)) return 60 * 60_000;
    if (Number(policy.maxPerHour || 0) > 0 && hourCount >= Number(policy.maxPerHour)) return 15 * 60_000;
    return 0;
  }

  private async waitForMinimumDelay(seconds: number) {
    const wait = Math.max(0, seconds * 1_000 - (Date.now() - this.lastSendAt));
    if (wait > 0) await delay(wait);
    this.lastSendAt = Date.now();
  }

  private async serializedSend<T>(callback: () => Promise<T>): Promise<T> {
    const previous = this.sendLock;
    let release!: () => void;
    this.sendLock = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await callback();
    } finally {
      release();
    }
  }

  private prepareTemplateBody(
    body: string,
    images: Array<{ id: string; name?: string; dataUrl: string }>,
    unsubscribeUrl: string,
  ) {
    let html = bodyToHtml(body);
    const attachments: Array<Record<string, any>> = [];
    for (const image of images || []) {
      const match = String(image.dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
      if (!match) continue;
      const cid = `template-${image.id}@huayuan-crm`;
      html = html.replaceAll(`template-image:${image.id}`, `cid:${cid}`);
      attachments.push({
        filename: image.name || `${image.id}.${this.extensionForMime(match[1])}`,
        content: Buffer.from(match[2], 'base64'),
        contentType: match[1],
        cid,
      });
    }
    html += `<br><br><p style="font-size:12px;color:#777">不希望继续接收此类邮件？<a href="${unsubscribeUrl}">点击退订</a></p>`;
    return { html, attachments };
  }

  private createSmtpTransport(profile: Record<string, any>) {
    if (!profile.smtpHost || !profile.smtpUser || !profile.pass) {
      throw new BadRequestException('SMTP 配置不完整，请前往设置补充');
    }
    return createTransport({
      host: profile.smtpHost,
      port: Number(profile.smtpPort || 587),
      secure: Boolean(profile.smtpSecure),
      auth: { user: profile.smtpUser, pass: profile.pass },
    });
  }

  private async findTaskEntity(idOrEmailTaskId: string, ownerId?: string) {
    const numericId = Number(idOrEmailTaskId);
    const task = await this.taskRepository.findOne({
      where: Number.isInteger(numericId) && numericId > 0
        ? [{ id: numericId }, { emailTaskId: idOrEmailTaskId }]
        : { emailTaskId: idOrEmailTaskId },
    });
    if (!task) throw new NotFoundException('邮件任务不存在');
    if (ownerId && task.ownerId !== ownerId) throw new NotFoundException('邮件任务不存在');
    return task;
  }

  private async findTemplateByIdentifier(identifier: string) {
    const numericId = Number(identifier);
    const template = await this.templateRepository.findOne({
      where: Number.isInteger(numericId) && numericId > 0
        ? [{ id: numericId }, { templateId: identifier }]
        : { templateId: identifier },
    });
    if (!template) throw new NotFoundException('邮件模板不存在');
    return template;
  }

  private parseCustomerIds(value: string | null | undefined): string[] {
    if (!value) return [];
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
      return [];
    }
  }

  private extensionForMime(mime: string) {
    return ({ 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp' } as Record<string, string>)[mime] || 'jpg';
  }

  private errorMessage(error: any) {
    return String(error?.response || error?.message || error || '未知错误').slice(0, 2000);
  }

  private generateId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
  }
}
