import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ImapFlow } from 'imapflow';
import { simpleParser, ParsedMail } from 'mailparser';
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
import { formatSmtpError } from './smtp-error';
import { resolveCustomerTimezone } from './customer-timezone';

const MAX_SEND_ATTEMPTS = 3;
const SCHEDULER_INTERVAL_MS = 15_000;
const BOUNCE_MONITOR_INTERVAL_MS = 5 * 60_000;
const MAX_BOUNCE_SCAN_LIMIT = 500;

@Injectable()
export class EmailService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailService.name);
  private readonly processingTasks = new Set<number>();
  private scheduler?: NodeJS.Timeout;
  private schedulerRun?: Promise<void>;
  private bounceScheduler?: NodeJS.Timeout;
  private bounceSchedulerRun?: Promise<void>;
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
      this.runScheduler();
    }, SCHEDULER_INTERVAL_MS);
    this.scheduler.unref?.();
    this.runScheduler();
    this.bounceScheduler = setInterval(() => {
      this.runBounceMonitor();
    }, BOUNCE_MONITOR_INTERVAL_MS);
    this.bounceScheduler.unref?.();
  }

  async onModuleDestroy() {
    if (this.scheduler) clearInterval(this.scheduler);
    if (this.bounceScheduler) clearInterval(this.bounceScheduler);
    await this.schedulerRun;
    await this.bounceSchedulerRun;
  }

  private runScheduler() {
    if (this.schedulerRun) return;
    const execution = this.processDueTasks()
      .catch((error: any) => {
        this.logger.error('邮件任务调度检查失败', error?.stack || error);
      })
      .finally(() => {
        if (this.schedulerRun === execution) this.schedulerRun = undefined;
      });
    this.schedulerRun = execution;
  }

  private runBounceMonitor() {
    if (this.bounceSchedulerRun) return;
    const execution = this.checkAllEnabledMailboxBounces()
      .then(() => undefined)
      .catch((error: any) => {
        this.logger.error('邮件退信监控失败', error?.stack || error);
      })
      .finally(() => {
        if (this.bounceSchedulerRun === execution) this.bounceSchedulerRun = undefined;
      });
    this.bounceSchedulerRun = execution;
  }

  // ==================== Templates ====================

  async findAllTemplates(ownerId?: string) {
    return this.templateRepository.find({
      where: ownerId ? { ownerId: In(['', ownerId]) } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async findOneTemplate(id: number, ownerId?: string) {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) throw new NotFoundException('模板不存在');
    if (ownerId && !['', ownerId].includes(template.ownerId || '')) {
      throw new NotFoundException('邮件模板不存在');
    }
    return template;
  }

  async createTemplate(createDto: CreateTemplateDto, ownerId = '') {
    const template = this.templateRepository.create({
      ...createDto,
      ownerId,
      templateId: this.generateId('tmpl'),
    });
    return this.templateRepository.save(template);
  }

  async updateTemplate(id: number, updateDto: UpdateTemplateDto, ownerId?: string) {
    const template = await this.findOneTemplate(id, ownerId);
    if (ownerId && template.ownerId !== ownerId) {
      throw new NotFoundException('邮件模板不存在');
    }
    Object.assign(template, updateDto);
    return this.templateRepository.save(template);
  }

  async removeTemplate(id: number, ownerId?: string) {
    if (ownerId) {
      const template = await this.findOneTemplate(id, ownerId);
      if (template.ownerId !== ownerId) throw new NotFoundException('邮件模板不存在');
    }
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
    return Promise.all(tasks.map((task) => this.formatTaskWithSkipReasons(task)));
  }

  async findOneTask(idOrEmailTaskId: string, ownerId?: string) {
    return this.formatTaskWithSkipReasons(
      await this.findTaskEntity(idOrEmailTaskId, ownerId),
    );
  }

  async createTask(createDto: CreateEmailTaskDto, ownerId = '') {
    const customerIds = [...new Set((createDto.customerIds || []).map((id) => String(id)))];
    if (customerIds.length === 0) throw new BadRequestException('请至少选择一个收件人');
    if (!createDto.templateId) throw new BadRequestException('请选择邮件模板');

    const taskMode = createDto.taskMode === 'scheduled' ? 'scheduled' : 'once';
    const startAt = createDto.startAt ? new Date(createDto.startAt) : null;
    if (startAt && Number.isNaN(startAt.getTime())) throw new BadRequestException('指定开始时间无效');
    const batchSize = taskMode === 'scheduled' ? Number(createDto.batchSize || 0) : 0;
    const totalRuns = taskMode === 'scheduled' ? Number(createDto.totalRuns || 0) : 1;
    const intervalMinutes = taskMode === 'scheduled' ? Number(createDto.intervalMinutes || 0) : 1;
    if (taskMode === 'scheduled') {
      if (!startAt) throw new BadRequestException('定时任务必须指定开始时间');
      if (!Number.isInteger(batchSize) || batchSize < 1) {
        throw new BadRequestException('每轮邮件数量必须大于 0');
      }
      if (!Number.isInteger(totalRuns) || totalRuns < 1) {
        throw new BadRequestException('总轮数必须大于 0');
      }
      if (!Number.isInteger(intervalMinutes) || intervalMinutes < 1) {
        throw new BadRequestException('轮次间隔必须大于 0 分钟');
      }
      if (customerIds.length > batchSize * totalRuns) {
        throw new BadRequestException(
          `已选 ${customerIds.length} 个收件人，但当前计划最多可发送 ${batchSize * totalRuns} 封，请增加每轮数量或总轮数`,
        );
      }
    }

    const template = await this.findTemplateByIdentifier(createDto.templateId, ownerId || undefined);
    const autoStart = taskMode === 'scheduled' && createDto.autoStart !== false;
    const task = this.taskRepository.create({
      name: createDto.name || '',
      customerId: createDto.customerId || '',
      templateId: createDto.templateId,
      region: createDto.region || null,
      business: createDto.business || null,
      ownerId,
      emailTaskId: this.generateId('etask'),
      customerIds: JSON.stringify(customerIds),
      subject: createDto.subject || template.subject,
      body: createDto.body || template.body,
      taskMode,
      totalRuns,
      batchSize,
      intervalMinutes,
      scheduledAt: taskMode === 'scheduled' ? startAt : null,
      startAt,
      status: autoStart ? 'active' : 'pending',
      nextRunAt: autoStart ? startAt : null,
      runsCompleted: 0,
      successfulSendCount: 0,
      failedSendCount: 0,
      skippedSendCount: 0,
      lastMessage: autoStart
        ? `定时任务已启用，将于 ${startAt!.toLocaleString()} 开始第 1 轮`
        : '任务已创建，等待手动启动',
    } as EmailTask);
    await this.taskRepository.save(task);

    if (autoStart) {
      const recipientCount = await this.ensureTaskRecipients(task);
      if (recipientCount === 0) {
        await this.recipientRepository.delete({ taskId: task.id });
        await this.taskRepository.delete(task.id);
        throw new BadRequestException('所选联系人没有可用且允许营销邮件的邮箱');
      }
      if (startAt!.getTime() <= Date.now()) void this.processTask(task.id);
    }

    return this.formatTask(task);
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

    if (['completed', 'failed'].includes(task.status)) {
      await this.requeueRetryableRecipients(task);
      await this.refreshTaskCounts(task);
      if (task.taskMode === 'scheduled') task.runsCompleted = 0;
    }

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

  async checkBounces(ownerId?: string) {
    return this.scanMailboxForBounces(ownerId);
  }

  private async checkAllEnabledMailboxBounces() {
    const profiles = await this.settingsService.listEnabledImapCredentials();
    const results = [];
    for (const { userId } of profiles) {
      try {
        results.push(await this.scanMailboxForBounces(userId));
      } catch (error: any) {
        this.logger.warn(`账号 ${userId || 'admin'} 邮箱退信监控失败：${this.errorMessage(error)}`);
      }
    }
    return results;
  }

  private async scanMailboxForBounces(ownerId?: string) {
    const profile: Record<string, any> | null = await this.settingsService.getImapCredentials(ownerId);
    if (!profile?.imapEnabled) {
      throw new BadRequestException('请先在设置中启用 IMAP 收信配置');
    }
    this.assertImapProfile(profile);

    const client = this.createImapClient(profile);
    let checked = 0;
    let bounced = 0;
    let latestUid = Number(profile.imapLastSeenUid || 0);
    try {
      await client.connect();
      const mailbox = await client.mailboxOpen(profile.imapMailbox || 'INBOX');
      const uidValidity = String(mailbox.uidValidity || '');
      const previousUidValidity = String(profile.imapUidValidity || '');
      const lastSeenUid = previousUidValidity && previousUidValidity === uidValidity
        ? Number(profile.imapLastSeenUid || 0)
        : 0;
      const range = this.mailboxScanRange(
        mailbox.exists || 0,
        mailbox.uidNext || 0,
        lastSeenUid,
        profile.imapScanLimit,
      );
      if (!range) {
        await this.settingsService.updateImapMonitorState(ownerId, {
          imapUidValidity: uidValidity,
          imapLastCheckedAt: new Date().toISOString(),
          imapLastCheckStatus: 'ok',
          imapLastCheckMessage: '没有需要检查的新邮件',
        });
        return { ok: true, checked: 0, bounced: 0, message: '没有需要检查的新邮件' };
      }

      const messages = await client.fetchAll(range, {
        uid: true,
        envelope: true,
        source: { maxLength: 1024 * 1024 },
      }, { uid: true });
      checked = messages.length;
      for (const message of messages) {
        latestUid = Math.max(latestUid, Number(message.uid || 0));
        if (!message.source) continue;
        const parsed = await simpleParser(message.source as Buffer);
        const bounce = this.extractBounceInfo(parsed, message.envelope);
        if (!bounce.isBounce) continue;
        const updated = await this.applyBounceInfo(bounce, ownerId);
        if (updated) bounced++;
      }

      const message = `已检查 ${checked} 封邮件，识别退信 ${bounced} 封`;
      await this.settingsService.updateImapMonitorState(ownerId, {
        imapUidValidity: uidValidity,
        imapLastSeenUid: latestUid,
        imapLastCheckedAt: new Date().toISOString(),
        imapLastCheckStatus: 'ok',
        imapLastCheckMessage: message,
      });
      return { ok: true, checked, bounced, message };
    } catch (error: any) {
      const message = this.formatImapError(error);
      await this.settingsService.updateImapMonitorState(ownerId, {
        imapLastCheckedAt: new Date().toISOString(),
        imapLastCheckStatus: 'error',
        imapLastCheckMessage: message,
      });
      throw new BadRequestException(message);
    } finally {
      try {
        await client.logout();
      } catch {
        client.close();
      }
    }
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
        this.findTemplateByIdentifier(task.templateId, task.ownerId || undefined),
        this.settingsService.getSmtpCredentials(task.ownerId || undefined),
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
      const batchLimit = task.taskMode === 'once'
        ? queued.length
        : batchSize > 0
          ? batchSize
          : queued.length;
      let successfulThisRun = 0;
      let processedThisRun = 0;
      let deferred = 0;
      let rateLimitedUntil: Date | null = null;

      for (const recipient of queued) {
        if (processedThisRun >= batchLimit) break;
        const latest = await this.taskRepository.findOne({ where: { id: taskId } });
        if (!latest || latest.status === 'cancelled') return;

        if (task.ownerId) {
          if (!recipient.customerId) {
            await this.skipRecipient(recipient, '收件人未关联授权客户');
            processedThisRun++;
            continue;
          }
          try {
            await this.customersService.assertCustomerOwner(recipient.customerId, task.ownerId);
          } catch {
            await this.skipRecipient(recipient, '当前账号已无权访问该客户');
            processedThisRun++;
            continue;
          }
        }

        if (!isValidEmail(recipient.email)) {
          await this.skipRecipient(recipient, '邮箱格式无效');
          processedThisRun++;
          continue;
        }
        if (await this.suppressionService.isSuppressed(recipient.email)) {
          await this.skipRecipient(recipient, '邮箱在退订或抑制名单中');
          processedThisRun++;
          continue;
        }

        const window = checkSendWindow(recipient.timezone, new Date(), policy);
        if (!window.allowed) {
          if (window.reason?.includes('缺失') || window.reason?.includes('无效')) {
            await this.skipRecipient(recipient, window.reason);
            processedThisRun++;
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
        processedThisRun++;
        if (sent) successfulThisRun++;
      }

      if (task.taskMode === 'scheduled' && processedThisRun > 0) task.runsCompleted += 1;
      if (processedThisRun > 0) task.lastRunAt = new Date();
      await this.refreshTaskCounts(task);

      const remaining = await this.recipientRepository.count({ where: { taskId, status: 'queued' } });
      const totalRuns = Math.max(1, Number(task.totalRuns || 1));
      const reachedRunLimit = task.taskMode === 'scheduled' && task.runsCompleted >= totalRuns;

      if (reachedRunLimit && remaining > 0) {
        await this.skipQueuedRecipients(task.id, '已达到计划总轮数，未进入发送批次');
      }

      if (remaining === 0 || reachedRunLimit) {
        await this.finishTask(task);
      } else {
        const retryDelayMinutes = processedThisRun > 0
          ? Math.max(1, Number(task.intervalMinutes || 1))
          : 30;
        const plannedNextRunAt = new Date(Date.now() + retryDelayMinutes * 60_000);
        task.status = 'active';
        task.nextRunAt = rateLimitedUntil
          ? new Date(Math.max(rateLimitedUntil.getTime(), plannedNextRunAt.getTime()))
          : plannedNextRunAt;
        task.lastMessage = rateLimitedUntil
          ? '达到发送限额，任务已自动延后'
          : deferred > 0 && processedThisRun === 0
            ? '客户当地时间不适合发送，任务已自动延后'
            : `第 ${task.runsCompleted} 轮已处理 ${processedThisRun} 封，成功 ${successfulThisRun} 封，等待下一轮`;
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
          messageId: this.normalizeMessageId(info.messageId || ''),
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
        const hardFailure = this.isHardDeliveryFailure(recipient.lastError || '');
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
        if (recipient.customerId && hardFailure) {
          await this.customersService.markEmailDeliveryFailed(
            recipient.customerId,
            subject,
            recipient.email,
            recipient.lastError || 'SMTP 发送失败',
            true,
          );
        }
      }
    }
    return false;
  }

  private mailboxScanRange(
    exists: number,
    uidNext: number,
    lastSeenUid: number,
    rawLimit: unknown,
  ) {
    if (exists <= 0) return '';
    const limit = Math.min(
      MAX_BOUNCE_SCAN_LIMIT,
      Math.max(1, Number(rawLimit || 50) || 50),
    );
    const maxUid = Math.max(0, Number(uidNext || 0) - 1);
    if (maxUid <= 0) return '';
    const startFromLastSeen = Number(lastSeenUid || 0) > 0
      ? Number(lastSeenUid) + 1
      : Math.max(1, maxUid - limit + 1);
    const startUid = Math.max(1, Math.min(startFromLastSeen, maxUid));
    if (startUid > maxUid) return '';
    return `${startUid}:*`;
  }

  private extractBounceInfo(parsed: ParsedMail, envelope?: any) {
    const subject = String(parsed.subject || envelope?.subject || '');
    const text = [parsed.text, typeof parsed.html === 'string' ? parsed.html : '']
      .filter(Boolean)
      .join('\n');
    const haystack = `${subject}\n${text}`.toLowerCase();
    const fromEmails = this.addressesFrom(parsed.from).concat(
      (envelope?.from || []).map((item: any) => item.address).filter(Boolean),
    );
    const failedRecipient = this.firstValueFromHeaders(parsed, [
      'x-failed-recipients',
      'final-recipient',
      'original-recipient',
    ]);
    const code = this.firstValueFromHeaders(parsed, ['status', 'diagnostic-code']);
    const originalMessageId =
      this.normalizeMessageId(this.firstValueFromHeaders(parsed, ['x-original-message-id', 'original-message-id'])) ||
      this.normalizeMessageId(String(envelope?.inReplyTo || '')) ||
      this.extractFirstMessageId(parsed.references) ||
      this.extractFirstMessageId(text);
    const recipientEmail =
      this.extractFirstEmail(failedRecipient) ||
      this.extractFirstEmail(text);
    const diagnostic = this.shortMessage(
      this.firstValueFromHeaders(parsed, ['diagnostic-code']) ||
      this.extractDiagnosticLine(text) ||
      subject,
    );
    const isBounce =
      fromEmails.some((email) => /mailer-daemon|postmaster|mail delivery|bounce/i.test(email)) ||
      /delivery status notification|undeliver|delivery failure|mail delivery failed|returned mail|failure notice|退信|未送达/i.test(subject) ||
      /final-recipient|diagnostic-code|status:\s*[245]\.\d+\.\d+/i.test(text);

    return {
      isBounce,
      originalMessageId,
      recipientEmail: normalizeEmail(recipientEmail || ''),
      code: this.extractBounceCode(`${code}\n${text}`),
      diagnostic,
      hardFailure: this.isHardDeliveryFailure(`${code}\n${diagnostic}\n${haystack}`),
      bounceMessageId: this.normalizeMessageId(String(envelope?.messageId || '')),
    };
  }

  private async applyBounceInfo(
    bounce: ReturnType<EmailService['extractBounceInfo']>,
    ownerId?: string,
  ) {
    const log = await this.findBounceTargetLog(bounce, ownerId);
    if (!log) return false;
    if (log.status === 'bounced' && log.bounceMessageId === bounce.bounceMessageId) return false;

    log.status = 'bounced';
    log.errorMessage = bounce.diagnostic || '收到退信通知';
    log.bounceCode = bounce.code || '';
    log.bounceMessageId = bounce.bounceMessageId || '';
    log.monitoredAt = new Date();
    await this.logRepository.save(log);

    const task = await this.updateTaskRecipientForBounce(log, bounce);
    if (log.customerId) {
      try {
        const customer = await this.customersService.findByIdentifier(log.customerId);
        await this.customersService.markEmailDeliveryFailed(
          customer.id,
          log.subject || '邮件退信',
          log.recipientEmail,
          log.errorMessage || '收到退信通知',
          bounce.hardFailure,
        );
        await this.customersService.refreshEmailSentSummary(customer.id);
      } catch (error: any) {
        this.logger.warn(`退信已记录，但客户状态同步失败：${this.errorMessage(error)}`);
      }
    }
    if (task) {
      await this.refreshTaskCounts(task);
      task.lastMessage = `收到退信：${log.recipientEmail}${log.errorMessage ? `；${log.errorMessage}` : ''}`;
      if (task.successfulSendCount === 0 && task.failedSendCount > 0) task.status = 'failed';
      await this.taskRepository.save(task);
    }
    if (bounce.hardFailure && log.recipientEmail) {
      await this.suppressionService.add({
        email: normalizeEmail(log.recipientEmail),
        reason: `退信自动抑制：${log.errorMessage || '硬退信'}`,
      });
    }
    return true;
  }

  private async findBounceTargetLog(
    bounce: ReturnType<EmailService['extractBounceInfo']>,
    ownerId?: string,
  ) {
    const scopedOwnerId = ownerId || '';
    const baseWhere = { ownerId: scopedOwnerId };
    if (bounce.originalMessageId) {
      const messageIds = [
        bounce.originalMessageId,
        `<${bounce.originalMessageId}>`,
      ];
      const exact = await this.logRepository.findOne({
        where: {
          ...baseWhere,
          messageId: In(messageIds),
        },
        order: { sentAt: 'DESC' },
      } as any);
      if (exact) return exact;
    }
    if (bounce.recipientEmail) {
      return this.logRepository.findOne({
        where: {
          ...baseWhere,
          recipientEmail: bounce.recipientEmail,
          status: 'sent',
        } as any,
        order: { sentAt: 'DESC' },
      });
    }
    return null;
  }

  private async updateTaskRecipientForBounce(
    log: EmailLog,
    bounce: ReturnType<EmailService['extractBounceInfo']>,
  ) {
    if (!log.emailTaskId) return null;
    const task = await this.taskRepository.findOne({
      where: { emailTaskId: log.emailTaskId, ownerId: log.ownerId || '' },
    });
    if (!task) return null;
    const recipient = await this.recipientRepository.findOne({
      where: {
        taskId: task.id,
        email: normalizeEmail(log.recipientEmail),
      } as any,
    });
    if (!recipient) return task;
    recipient.status = 'failed';
    recipient.lastError = bounce.diagnostic || '收到退信通知';
    await this.recipientRepository.save(recipient);
    return task;
  }

  private firstValueFromHeaders(parsed: ParsedMail, keys: string[]) {
    for (const key of keys) {
      const raw = parsed.headers.get(key);
      const value = this.headerValueToText(raw);
      if (value) return value;
    }
    return '';
  }

  private headerValueToText(value: unknown): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map((item) => this.headerValueToText(item)).filter(Boolean).join(' ');
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if ('text' in value && typeof (value as any).text === 'string') return (value as any).text;
      if ('value' in value && typeof (value as any).value === 'string') return (value as any).value;
      if ('address' in value && typeof (value as any).address === 'string') return (value as any).address;
    }
    return String(value || '');
  }

  private addressesFrom(addressObject: unknown) {
    const values = Array.isArray(addressObject)
      ? addressObject
      : addressObject
        ? [addressObject]
        : [];
    return values
      .flatMap((item: any) => item?.value || item?.address || [])
      .map((item: any) => normalizeEmail(item?.address || item))
      .filter(Boolean);
  }

  private normalizeMessageId(value: string) {
    return String(value || '').trim().replace(/^<|>$/g, '');
  }

  private extractFirstMessageId(value: unknown) {
    const text = Array.isArray(value) ? value.join(' ') : String(value || '');
    const match = text.match(/<([^<>@\s]+@[^<>\s]+)>/);
    return this.normalizeMessageId(match ? match[1] : '');
  }

  private extractFirstEmail(value: string) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0] : '';
  }

  private extractBounceCode(value: string) {
    const match = String(value || '').match(/\b[245]\.\d{1,3}\.\d{1,3}\b|\b[45]\d{2}\b/);
    return match ? match[0] : '';
  }

  private extractDiagnosticLine(value: string) {
    const match = String(value || '').match(/(?:Diagnostic-Code|Reason|Error|Status):\s*([^\r\n]+)/i);
    return match ? match[1] : '';
  }

  private isHardDeliveryFailure(value: string) {
    return /\b5\.\d+\.\d+\b|\b5\d{2}\b|user unknown|mailbox unavailable|no such user|does not exist|recipient address rejected|permanent/i.test(
      String(value || ''),
    );
  }

  private shortMessage(value: string) {
    return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 1000);
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
          if (contact.marketingAllowed === false) {
            this.logger.warn(`跳过未允许营销邮件的联系人 ${contact.contactId || contact.id}`);
            continue;
          }
          const customer = await this.customersService.findOne(contact.customerId);
          if (task.ownerId) {
            await this.customersService.assertCustomerOwner(customer.id, task.ownerId);
          }
          await this.addRecipient(task, {
            recipientKey: `contact:${contact.contactId || contact.id}`,
            customerId: customer.id,
            contactId: contact.id,
            email: contact.email,
            name: contact.name,
            company: customer.company,
            timezone: resolveCustomerTimezone(
              customer.timezone,
              customer.region,
              customer.country,
            ),
          }, seen);
        } else {
          const customerId = value.startsWith('customer:') ? value.slice(9) : value;
          const customer = await this.customersService.findByIdentifier(customerId);
          if (task.ownerId) {
            await this.customersService.assertCustomerOwner(customer.id, task.ownerId);
          }
          if (!(await this.customersService.isCustomerEmailMarketingAllowed(customer.id, customer.email))) {
            this.logger.warn(`跳过未允许营销邮件的客户主邮箱 ${customer.customerId || customer.id}`);
            continue;
          }
          await this.addRecipient(task, {
            recipientKey: `customer:${customer.customerId || customer.id}`,
            customerId: customer.id,
            contactId: null,
            email: customer.email,
            name: customer.contact || customer.company,
            company: customer.company,
            timezone: resolveCustomerTimezone(
              customer.timezone,
              customer.region,
              customer.country,
            ),
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
    task.status = task.successfulSendCount === 0
      && (task.failedSendCount > 0 || task.skippedSendCount > 0)
      ? 'failed'
      : 'completed';
    task.nextRunAt = null;
    task.lastRunAt = new Date();
    const skipReasons = await this.getSkipReasonSummary(task.id);
    task.lastMessage = `任务结束：成功 ${task.successfulSendCount} 封，失败 ${task.failedSendCount} 封，跳过 ${task.skippedSendCount} 封${skipReasons ? `；跳过原因：${skipReasons}` : ''}`;
    await this.taskRepository.save(task);
  }

  private async skipQueuedRecipients(taskId: number, reason: string) {
    const queued = await this.recipientRepository.find({
      where: { taskId, status: 'queued' },
    });
    for (const recipient of queued) await this.skipRecipient(recipient, reason);
  }

  private async formatTaskWithSkipReasons(task: EmailTask) {
    const formatted = this.formatTask(task);
    if (!task.skippedSendCount || String(task.lastMessage || '').includes('跳过原因：')) {
      return formatted;
    }
    const skipReasons = await this.getSkipReasonSummary(task.id);
    return skipReasons
      ? { ...formatted, lastMessage: `${task.lastMessage || ''}；跳过原因：${skipReasons}` }
      : formatted;
  }

  private async getSkipReasonSummary(taskId: number) {
    const recipients = await this.recipientRepository.find({
      where: { taskId, status: 'skipped' },
      take: 50,
    });
    const counts = new Map<string, number>();
    for (const recipient of recipients) {
      const reason = recipient.lastError || '原因未知';
      counts.set(reason, (counts.get(reason) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([reason, count]) => `${reason}${count > 1 ? `（${count} 封）` : ''}`)
      .join('；');
  }

  private async requeueRetryableRecipients(task: EmailTask) {
    const recipients = await this.recipientRepository.find({
      where: { taskId: task.id, status: In(['failed', 'skipped']) },
    });
    for (const recipient of recipients) {
      if (recipient.customerId) {
        try {
          const customer = await this.customersService.findOne(recipient.customerId);
          recipient.timezone = resolveCustomerTimezone(
            customer.timezone,
            customer.region,
            customer.country,
          );
        } catch {
          // 保留原始收件人信息，后续校验会展示具体跳过原因。
        }
      }
      recipient.status = 'queued';
      recipient.attempts = 0;
      recipient.lastError = null;
      recipient.sentAt = null;
      await this.recipientRepository.save(recipient);
    }
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
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });
  }

  private createImapClient(profile: Record<string, any>) {
    return new ImapFlow({
      host: profile.imapHost,
      port: Number(profile.imapPort || 993),
      secure: profile.imapSecure !== false,
      auth: {
        user: profile.imapUser,
        pass: profile.pass,
      },
      logger: false,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    } as any);
  }

  private assertImapProfile(profile: Record<string, any>) {
    if (!profile.imapHost || !profile.imapUser || !profile.pass) {
      throw new BadRequestException('IMAP 配置不完整，请前往设置补充');
    }
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

  private async findTemplateByIdentifier(identifier: string, ownerId?: string) {
    const numericId = Number(identifier);
    const template = await this.templateRepository.findOne({
      where: Number.isInteger(numericId) && numericId > 0
        ? [{ id: numericId }, { templateId: identifier }]
        : { templateId: identifier },
    });
    if (!template) throw new NotFoundException('邮件模板不存在');
    if (ownerId && !['', ownerId].includes(template.ownerId || '')) {
      throw new NotFoundException('邮件模板不存在');
    }
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
    return formatSmtpError(error);
  }

  private formatImapError(error: any) {
    const message = String(error?.response || error?.message || error || '').trim();
    if (/auth|login|password|credential|535|534|invalid/i.test(message)) {
      return 'IMAP 认证失败，请核对用户名和邮箱授权码';
    }
    if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
      return 'IMAP 连接超时，请核对服务器、端口和安全连接方式';
    }
    if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|network/i.test(message)) {
      return 'IMAP 服务器无法连接，请核对服务器地址和网络';
    }
    return message || 'IMAP 检查失败';
  }

  private generateId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).substring(2, 8)}`;
  }
}
