import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In } from 'typeorm';
import { EmailTemplate, EmailTask, EmailLog } from './entities';
import {
  CreateTemplateDto,
  UpdateTemplateDto,
  CreateEmailTaskDto,
  UpdateEmailTaskDto,
} from './dto';

@Injectable()
export class EmailService {
  constructor(
    @InjectRepository(EmailTemplate)
    private templateRepository: Repository<EmailTemplate>,
    @InjectRepository(EmailTask)
    private taskRepository: Repository<EmailTask>,
    @InjectRepository(EmailLog)
    private logRepository: Repository<EmailLog>,
  ) {}

  // ==================== Templates ====================

  async findAllTemplates() {
    return this.templateRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findOneTemplate(id: number) {
    const template = await this.templateRepository.findOne({ where: { id } });
    if (!template) {
      throw new NotFoundException('模板不存在');
    }
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
    if (result.affected === 0) {
      throw new NotFoundException('模板不存在');
    }
    return { deleted: true };
  }

  // ==================== Tasks ====================

  private formatTask(task: any) {
    if (!task) return task;
    return {
      ...task,
      customerIds: task.customerIds
        ? typeof task.customerIds === 'string'
          ? JSON.parse(task.customerIds)
          : task.customerIds
        : [],
    };
  }

  async findAllTasks(filters: Record<string, any> = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;

    const tasks = await this.taskRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return tasks.map((t) => this.formatTask(t));
  }

  async findOneTask(idOrEmailTaskId: string) {
    const numericId = parseInt(idOrEmailTaskId, 10);
    let task;
    if (!isNaN(numericId)) {
      task = await this.taskRepository.findOne({ where: { id: numericId } as any });
    }
    if (!task) {
      task = await this.taskRepository.findOne({ where: { emailTaskId: idOrEmailTaskId } as any });
    }
    if (!task) {
      throw new NotFoundException('邮件任务不存在');
    }
    return this.formatTask(task);
  }

  async createTask(createDto: CreateEmailTaskDto) {
    const { scheduledAt, customerIds, ...rest } = createDto;
    const task = this.taskRepository.create({
      ...rest,
      customerIds: customerIds ? JSON.stringify(customerIds) : null,
      emailTaskId: this.generateId('etask'),
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
      startAt: createDto.startAt ? new Date(createDto.startAt) : undefined,
    } as any);
    return this.taskRepository.save(task);
  }

  async updateTask(idOrEmailTaskId: string, updateDto: UpdateEmailTaskDto) {
    const task = await this.findOneTask(idOrEmailTaskId);
    Object.assign(task, updateDto);
    if (updateDto.scheduledAt) {
      (task as any).scheduledAt = new Date(updateDto.scheduledAt);
    }
    return this.taskRepository.save(task as any);
  }

  async removeTask(idOrEmailTaskId: string) {
    const numericId = parseInt(idOrEmailTaskId, 10);
    let result;
    if (!isNaN(numericId)) {
      result = await this.taskRepository.delete(numericId);
    } else {
      result = await this.taskRepository.delete({ emailTaskId: idOrEmailTaskId } as any);
    }
    if (result.affected === 0) {
      throw new NotFoundException('邮件任务不存在');
    }
    return { deleted: true };
  }

  // ==================== Logs ====================

  private formatLog(log: any) {
    if (!log) return log;
    return {
      id: log.logId || log.id,
      email: log.recipientEmail,
      customerId: log.customerId,
      customerName: log.customerName || '',
      templateId: log.templateId || '',
      templateName: log.templateName || '',
      taskId: log.emailTaskId || log.taskId || '',
      taskName: log.taskName || '',
      status: log.status,
      message: log.errorMessage || '',
      createdAt: log.sentAt || log.createdAt,
    };
  }

  async findAllLogs(filters: Record<string, any> = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;

    const logs = await this.logRepository.find({
      where,
      order: { sentAt: 'DESC' },
    });
    return logs.map((l) => this.formatLog(l));
  }

  async removeLog(idOrLogId: string) {
    // Try numeric id first, then logId string
    const numericId = parseInt(idOrLogId, 10);
    let log;
    if (!isNaN(numericId)) {
      log = await this.logRepository.findOne({ where: { id: numericId } as any });
    }
    if (!log) {
      log = await this.logRepository.findOne({ where: { logId: idOrLogId } as any });
    }
    if (!log) {
      throw new NotFoundException('发送日志不存在');
    }
    await this.logRepository.remove(log);
    return { deleted: true };
  }

  async createLog(data: {
    customerId?: string;
    emailTaskId?: string;
    recipientEmail: string;
    subject: string;
    status: 'sent' | 'failed' | 'bounced';
    errorMessage?: string;
  }) {
    const log = this.logRepository.create({
      ...data,
      logId: this.generateId('log'),
    });
    return this.logRepository.save(log);
  }

  // ==================== Bounce Check ====================

  async checkBounces() {
    // Stub: actual implementation would check IMAP for bounces
    return { ok: true, checked: 0, bounced: 0 };
  }

  // ==================== Task Run/Cancel ====================

  async runTask(idOrEmailTaskId: string) {
    const task = await this.findOneTask(idOrEmailTaskId);
    (task as any).status = 'sending';
    return this.taskRepository.save(task as any);
  }

  async cancelTask(idOrEmailTaskId: string) {
    const task = await this.findOneTask(idOrEmailTaskId);
    (task as any).status = 'failed';
    (task as any).errorMessage = '用户取消';
    return this.taskRepository.save(task as any);
  }

  // ==================== Utils ====================

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}${random}`;
  }
}