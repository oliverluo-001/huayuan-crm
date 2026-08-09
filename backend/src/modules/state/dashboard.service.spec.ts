import { DashboardService } from './dashboard.service';

function queryBuilder(result: { many?: any[]; count?: number } = {}) {
  return {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(result.many || []),
    getCount: jest.fn().mockResolvedValue(result.count || 0),
  };
}

describe('DashboardService analytics', () => {
  it('returns scoped trends, sales funnel, email performance and accurate todo counts', async () => {
    const now = new Date();
    const scopedCustomersQb = queryBuilder({
      many: [{ id: 1, customerId: 'cus_1', createdAt: now, journeyStage: 'qualified' }],
    });
    const newCustomersQb = queryBuilder({ count: 1 });
    const opportunityQb = queryBuilder({
      many: [
        { stage: 'proposal', amount: 1000, probability: 50 },
        { stage: 'won', amount: 500, probability: 100 },
        { stage: 'lost', amount: 250, probability: 0 },
      ],
    });
    const customers = {
      createQueryBuilder: jest.fn()
        .mockReturnValueOnce(scopedCustomersQb)
        .mockReturnValueOnce(newCustomersQb),
    };
    const opportunities = { createQueryBuilder: jest.fn(() => opportunityQb) };
    const todos = {
      find: jest.fn().mockResolvedValue([{ id: 1, title: 'Follow up', dueAt: now, customer: { company: 'Acme' } }]),
      count: jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(3),
    };
    const logs = [
      { id: 1, status: 'sent', templateName: 'Intro', sentAt: now, recipientEmail: 'a@example.test' },
      { id: 2, status: 'bounced', templateName: 'Intro', sentAt: now, recipientEmail: 'b@example.test' },
      { id: 3, status: 'failed', templateName: 'Follow up', sentAt: now, recipientEmail: 'c@example.test' },
    ];
    const emailLogs = { find: jest.fn().mockResolvedValueOnce(logs).mockResolvedValueOnce(logs) };
    const emailTasks = { find: jest.fn().mockResolvedValue([]) };
    const leadTasks = { find: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]) };
    const service = new DashboardService(
      customers as any,
      opportunities as any,
      todos as any,
      emailLogs as any,
      emailTasks as any,
      leadTasks as any,
    );

    const result = await service.getDashboard({ sub: 7, role: 'sales' });

    expect(result.scope).toBe('owned');
    expect(scopedCustomersQb.where).toHaveBeenCalledWith(
      expect.stringContaining('customer.collaborator_ids'),
      { ownerId: '7' },
    );
    expect(newCustomersQb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('customer.collaborator_ids'),
      { ownerId: '7' },
    );
    expect(opportunityQb.where).toHaveBeenCalledWith(
      expect.stringContaining('customer.collaborator_ids'),
      { ownerId: '7' },
    );
    expect(result.metrics).toMatchObject({ openTodoCount: 12, overdueTodoCount: 3 });
    expect(result.trends.days30).toHaveLength(30);
    expect(result.trends.days30.at(-1)).toMatchObject({ customers: 1, sent: 1, failed: 1, bounced: 1 });
    expect(result.salesFunnel).toMatchObject({ openValue: 1000, weightedValue: 500, wonValue: 500, winRate: 50 });
    expect(result.emailPerformance).toEqual({ total: 3, sent: 1, failed: 1, bounced: 1, deliveryRate: 33, bounceRate: 33 });
  });
});
