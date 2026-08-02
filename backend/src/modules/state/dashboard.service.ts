import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThan, Repository } from 'typeorm';
import { Customer, Opportunity, Todo } from '../customers/entities';
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
    @InjectRepository(Opportunity) private readonly opportunities: Repository<Opportunity>,
    @InjectRepository(Todo) private readonly todos: Repository<Todo>,
    @InjectRepository(EmailLog) private readonly emailLogs: Repository<EmailLog>,
    @InjectRepository(EmailTask) private readonly emailTasks: Repository<EmailTask>,
    @InjectRepository(LeadTask) private readonly leadTasks: Repository<LeadTask>,
  ) {}

  async getDashboard(user: DashboardUser) {
    const ownerId = user.role === 'sales' ? String(user.sub) : undefined;
    const customerQb = this.customers.createQueryBuilder('customer');
    if (ownerId) customerQb.where('customer.owner_id = :ownerId', { ownerId });
    const scopedCustomers = await customerQb
      .select(['customer.id', 'customer.customerId', 'customer.createdAt', 'customer.journeyStage'])
      .getMany();
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
    const opportunityQb = this.opportunities.createQueryBuilder('opportunity')
      .leftJoin('opportunity.customer', 'customer');
    if (ownerId) opportunityQb.where('customer.owner_id = :ownerId', { ownerId });

    const [newCustomers7d, openTodos, openTodoCount, overdueTodoCount, recentLogs, activeLeadTasks, activeEmailTasks, allLeadTasks, allLogs, allOpportunities] = await Promise.all([
      newCustomerQb.getCount(),
      this.todos.find({ where: todoWhere, relations: ['customer'], order: { dueAt: 'ASC' }, take: 8 }),
      this.todos.count({ where: todoWhere }),
      this.todos.count({
        where: ownerId
          ? customerIds.length ? { status: 'open', dueAt: LessThan(new Date()), customerId: In(customerIds) } : { id: -1 }
          : { status: 'open', dueAt: LessThan(new Date()) },
      }),
      this.emailLogs.find({ where: logWhere, order: { sentAt: 'DESC' }, take: 8 }),
      this.leadTasks.find({ where: { ...taskWhere, status: In(['draft', 'ready', 'running', 'paused']) }, order: { updatedAt: 'DESC' }, take: 5 }),
      this.emailTasks.find({ where: { ...taskWhere, status: In(['pending', 'active', 'sending']) }, order: { updatedAt: 'DESC' }, take: 5 }),
      this.leadTasks.find({ where: taskWhere, select: ['rawLeadCount', 'cleanedLeadCount'] }),
      this.emailLogs.find({ where: logWhere, select: ['status', 'templateName', 'sentAt'] }),
      opportunityQb.getMany(),
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
    const trendStart = new Date();
    trendStart.setUTCHours(0, 0, 0, 0);
    trendStart.setUTCDate(trendStart.getUTCDate() - 29);
    const dailyTrend = Array.from({ length: 30 }, (_, index) => {
      const date = new Date(trendStart);
      date.setUTCDate(date.getUTCDate() + index);
      return { date: date.toISOString().slice(0, 10), customers: 0, sent: 0, failed: 0, bounced: 0 };
    });
    const trendByDate = new Map(dailyTrend.map((item) => [item.date, item]));
    for (const customer of scopedCustomers) {
      const item = trendByDate.get(new Date(customer.createdAt).toISOString().slice(0, 10));
      if (item) item.customers += 1;
    }
    for (const log of allLogs) {
      const item = trendByDate.get(new Date(log.sentAt).toISOString().slice(0, 10));
      if (!item) continue;
      if (log.status === 'sent') item.sent += 1;
      else if (log.status === 'bounced') item.bounced += 1;
      else item.failed += 1;
    }

    const stageOrder: Opportunity['stage'][] = ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'];
    const salesStages = stageOrder.map((stage) => {
      const matches = allOpportunities.filter((opportunity) => opportunity.stage === stage);
      return {
        stage,
        count: matches.length,
        value: matches.reduce((sum, opportunity) => sum + Number(opportunity.amount || 0), 0),
        weightedValue: matches.reduce(
          (sum, opportunity) => sum + Number(opportunity.amount || 0) * Number(opportunity.probability || 0) / 100,
          0,
        ),
      };
    });
    const won = salesStages.find((item) => item.stage === 'won')!;
    const lost = salesStages.find((item) => item.stage === 'lost')!;
    const closedCount = won.count + lost.count;
    const openStages = salesStages.filter((item) => !['won', 'lost'].includes(item.stage));
    const logs30d = allLogs.filter((log) => new Date(log.sentAt) >= thirtyDaysAgo);
    const emailSent30d = logs30d.filter((log) => log.status === 'sent').length;
    const emailBounced30d = logs30d.filter((log) => log.status === 'bounced').length;
    const emailFailed30d = logs30d.filter((log) => log.status === 'failed').length;

    return {
      generatedAt: new Date().toISOString(),
      scope: ownerId ? 'owned' : 'all',
      metrics: {
        customerTotal: scopedCustomers.length, newCustomers7d, leadTotal, highConfidenceLeads,
        contactableLeads: highConfidenceLeads, sentTotal, failedTotal,
        openTodoCount,
        overdueTodoCount,
      },
      emailActivity: {
        days7: emailWindow(sevenDaysAgo), days30: emailWindow(thirtyDaysAgo),
        byTemplate: [...templateMap.values()]
          .map((item) => ({ ...item, rate: item.total ? Math.round((item.sent / item.total) * 100) : 0 }))
          .sort((a, b) => b.total - a.total).slice(0, 8),
      },
      trends: { days30: dailyTrend },
      salesFunnel: {
        stages: salesStages,
        openValue: openStages.reduce((sum, item) => sum + item.value, 0),
        weightedValue: openStages.reduce((sum, item) => sum + item.weightedValue, 0),
        wonValue: won.value,
        winRate: closedCount ? Math.round((won.count / closedCount) * 100) : 0,
      },
      emailPerformance: {
        total: logs30d.length,
        sent: emailSent30d,
        failed: emailFailed30d,
        bounced: emailBounced30d,
        deliveryRate: logs30d.length ? Math.round((emailSent30d / logs30d.length) * 100) : 0,
        bounceRate: logs30d.length ? Math.round((emailBounced30d / logs30d.length) * 100) : 0,
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
