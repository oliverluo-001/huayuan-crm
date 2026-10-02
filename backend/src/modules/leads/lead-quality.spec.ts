import { LeadsService } from './leads.service';

describe('lead quality and processing', () => {
  function setup() {
    const task: any = { id: 1, taskId: 't', ownerId: 'seller', targetRegions: ['Middle East'] };
    const leads: any[] = [];
    const repository: any = { find: jest.fn(async () => leads), save: jest.fn(async (lead) => lead), count: jest.fn(async () => leads.filter((lead) => lead.status === 'converted').length) };
    const tasks: any = { findOne: jest.fn(async () => task), update: jest.fn() };
    const customers: any = { upsertLeadCustomer: jest.fn(async () => ({ created: true, customer: { customerId: 'customer-real' } })) };
    const service = new LeadsService(repository, tasks, {} as any, customers);
    const mx = jest.spyOn((service as any).dns, 'resolveMx').mockResolvedValue([{ priority: 10, exchange: 'mail.buyer.example' }]);
    const lead = (id: string, email: string, extra = {}) => ({ id, leadId: id, taskId: 't', company: 'Buyer', email, country: 'United Arab Emirates', website: 'https://buyer.example', sourceUrl: 'https://buyer.example/contact', sourceType: 'Contact Page', sourceHttpStatus: 200, matchedProductKeyword: 'flange', targetSegment: 'distributor', status: 'candidate', rawData: { fitScore: 95 }, ...extra });
    return { service, task, leads, repository, tasks, customers, mx, lead };
  }
  it('retains different contacts, reuses domain checks and does not claim mailbox verification', async () => {
    const { service, leads, mx, lead } = setup();
    leads.push(lead('1', 'sales@buyer.example'), lead('2', 'purchasing@buyer.example'), lead('3', 'sales@buyer.example'));
    const result = await service.cleanLeads(1, 'seller');
    expect(mx).toHaveBeenCalledTimes(1);
    expect(result.summary.readyToEmail).toBe(2); expect(result.summary.duplicatesRemoved).toBe(1);
    expect(leads[1].status).toBe('candidate'); expect(leads[1].emailStatus).toBe('domain_valid');
    expect(leads[1].cleaningNotes).toContain('投递确认');
  });
  it('requires product, buyer and target-region evidence for automatic import', async () => {
    const { service, leads, lead } = setup();
    leads.push(lead('1', 'one@buyer.example', { matchedProductKeyword: '' }), lead('2', 'two@buyer.example', { country: '' }), lead('3', 'three@buyer.example', { country: 'Germany' }), lead('4', 'four@buyer.example', { targetSegment: '' }));
    await service.cleanLeads(1, 'seller');
    expect(leads.every((item) => item.recommendedAction === 'Needs Review')).toBe(true);
    expect(leads[2].regionStatus).toBe('mismatch');
  });
  it('preserves converted history and excludes unreviewed and failed records from imported counts', async () => {
    const { service, leads, lead, customers, tasks } = setup();
    leads.push(lead('1', 'old@buyer.example', { status: 'converted', crmCustomerId: 'existing', recommendedAction: 'Ready to Email' }), lead('2', 'review@buyer.example', { country: '' }), lead('3', 'sales@buyer.example'));
    const result = await service.importToCustomers(1, { importAll: true }, 'seller');
    expect(customers.upsertLeadCustomer).toHaveBeenCalledTimes(1);
    expect(leads[0].status).toBe('converted');
    expect(result).toEqual({ imported: 1, merged: 0, skipped: 2 });
    expect(tasks.update).toHaveBeenLastCalledWith(1, { importedCustomerCount: 2 });
  });
  it('handles null MX and transient DNS failure without labeling them verified', async () => {
    const { service, mx } = setup();
    mx.mockResolvedValueOnce([{ priority: 0, exchange: '.' }]);
    expect((await (service as any).validateLeadEmail('sales@buyer.example')).hardBounce).toBe(true);
    mx.mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 'ETIMEOUT' }));
    expect(await (service as any).validateLeadEmail('sales@buyer.example')).toMatchObject({ valid: false, hardBounce: false });
  });
  it('matches country aliases without treating an unrelated country as targeted', async () => {
    const { service, task, leads, lead } = setup();
    task.targetRegions = ['USA'];
    leads.push(lead('1', 'sales@buyer.example', { country: 'United States' }), lead('2', 'other@buyer.example', { country: 'Germany' }));
    await service.cleanLeads(1, 'seller');
    expect(leads[0].recommendedAction).toBe('Ready to Email');
    expect(leads[1].cleaningNotes).toContain('企业国家不在目标地区范围内');
  });
});
