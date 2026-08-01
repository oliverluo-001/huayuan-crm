import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Customer, Todo } from '../customers/entities';
import { EmailLog, EmailTask } from '../email/entities';
import { LeadTask } from '../leads/entities';

export interface DashboardUser {
  sub: number;
  role: 'admin' | 'sales' | 'viewer';
  username?: string;
  displayName?: string;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Todo) private readonly todos: Repository<Todo>,
    @InjectRepository(EmailLog) private readonly emailLogs: Repository<EmailLog>,
    @InjectRepository(EmailTask) private readonly emailTasks: Repository<EmailTask>,
    @InjectRepository(LeadTask) private readonly leadTasks: Repository<LeadTask>,
  ) {}

  async getDashboard(user: DashboardUser) {
    const ownerId = user.role === 'sales' ? String(user.sub) : undefined;
    const customerQb = this.customers.createQueryBuilder('customer');
    if (ownerId) customerQb.where('customer.owner_id = :ownerId', { ownerId });
    const scopedCustomers = await customerQb.select(['customer.id', 'customer.customerId']).getMany();
    const customerIds = scopedCustomers.map((customer) => customer.id);
    const externalCustomerIds = scopedCustomers.map((customer) => customer.customerId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

    const newCustomerQb = this.customers.createQueryBuilder('customer')
      .where('customer.created_at >= :sevenDaysAgo', { sevenDaysAgo });
    if (ownerId) newCustomerQb.andWhere('customer.owner_id = :ownerId', { ownerId });

    const todoWhere = ownerId
      ? customerIds.length ? { status: 'open' as const, customerId: In(customerIds) } : { id: -1 }
      : { status: 'open' as const };
    const logWhere = ownerId
      ? externalCustomerIds.length ? { customerId: In(externalCustomerIds) } : { id: -1 }
      : {};
    const taskWhere = ownerId ? { ownerId } : {};

    const [newCustomers7d, openTodos, recentLogs, activeLeadTasks, activeEmailTasks, allLeadTasks, allLogs] = await Promise.all([
      newCustomerQb.getCount(),
      this.todos.find({ where: todoWhere, relations: ['customer'], order: { dueAt: 'ASC' }, take: 8 }),
      this.emailLogs.find({ where: logWhere, order: { sentAt: 'DESC' }, take: 8 }),
      this.leadTasks.find({ where: { ...taskWhere, status: In(['draft', 'ready', 'running', 'paused']) }, order: { updatedAt: 'DESC' }, take: 5 }),
      this.emailTasks.find({ where: { ...taskWhere, status: In(['pending', 'active', 'sending']) }, order: { updatedAt: 'DESC' }, take: 5 }),
      this.leadTasks.find({ where: taskWhere, select: ['rawLeadCount', 'cleanedLeadCount'] }),
      this.emailLogs.find({ where: logWhere, select: ['status', 'templateName', 'sentAt'] }),
    ]);

    const emailWindow = (from: Date) => {
      const logs = allLogs.filter((log) => new Date(log.sentAt) >= from);
      const sent = logs.filter((log) => log.status === 'sent').length;
      const failed = logs.filter((log) => log.status === 'failed' || log.status === 'bounced').length;
      return { total: logs.length, sent, failed, rate: logs.length ? Math.round((sent / logs.length) * 100) : 0 };
    };
    const templateMap = new Map<string, { name: string; total: number; sent: number }>();
    for (const log of allLogs) {
      const name = log.templateName || '未命名模板';
      const item = templateMap.get(name) || { name, total: 0, sent: 0 };
      item.total += 1;
      if (log.status === 'sent') item.sent += 1;
      templateMap.set(name, item);
    }

    const sentTotal = allLogs.filter((log) => log.status === 'sent').length;
    const failedTotal = allLogs.filter((log) => log.status !== 'sent').length;
    const leadTotal = allLeadTasks.reduce((sum, task) => sum + Number(task.rawLeadCount || 0), 0);
    const highConfidenceLeads = allLeadTasks.reduce((sum, task) => sum + Number(task.cleanedLeadCount || 0), 0);
    const now = Date.now();

    return {
      generatedAt: new Date().toISOString(),
      scope: ownerId ? 'owned' : 'all',
      metrics: {
        customerTotal: scopedCustomers.length, newCustomers7d, leadTotal, highConfidenceLeads,
        contactableLeads: highConfidenceLeads, sentTotal, failedTotal,
        openTodoCount: openTodos.length,
        overdueTodoCount: openTodos.filter((todo) => todo.dueAt && new Date(todo.dueAt).getTime() < now).length,
      },
      emailActivity: {
        days7: emailWindow(sevenDaysAgo), days30: emailWindow(thirtyDaysAgo),
        byTemplate: [...templateMap.values()]
          .map((item) => ({ ...item, rate: item.total ? Math.round((item.sent / item.total) * 100) : 0 }))
          .sort((a, b) => b.total - a.total).slice(0, 8),
      },
      activeTasks: {
        leads: activeLeadTasks.map((task) => ({ id: task.taskId || String(task.id), name: task.name || task.productName, status: task.status, current: task.cleanedLeadCount || 0, target: task.targetCount || 0 })),
        emails: activeEmailTasks.map((task) => ({ id: task.emailTaskId || String(task.id), name: task.name, status: task.status, current: task.successfulSendCount || 0, target: task.batchSize || 0 })),
      },
      openTodos: openTodos.map((todo) => ({ id: todo.todoId || String(todo.id), title: todo.title, dueAt: todo.dueAt, customerName: todo.customer?.company || '' })),
      recentSendLogs: recentLogs.map((log) => ({ id: log.logId || String(log.id), email: log.recipientEmail, status: log.status, templateName: log.templateName, message: log.errorMessage || '', createdAt: log.sentAt })),
    };
  }
}
