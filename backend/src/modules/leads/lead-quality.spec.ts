import { LeadsService } from './leads.service';

describe('lead quality and processing', () => {
  function setup() {
    const task: any = { id: 1, taskId: 't', ownerId: 'seller', targetRegions: ['Middle East'] };
    const leads: any[] = [];
    const repository: any = { find: jest.fn(async () => leads), save: jest.fn(async (lead) => lead), count: jest.fn(async () => leads.filter((lead) => lead.status === 'converted').length) };
    const tasks: any = { findOne: jest.fn(async () => task), update: jest.fn() };
    const customers: any = { upsertLeadCustomer: jest.fn(async () => ({ created: true, customer: { customerId: 'customer-real' } })) };
    const source = jest.fn(async () => ({ status: 200, emails: leads.map((lead) => lead.email) }));
    const suppressed = jest.fn(async (_email: string) => false);
    const service = new LeadsService(repository, tasks, { inspectContactSource: source } as any, customers, { isSuppressed: suppressed } as any);
    const mx = jest.spyOn((service as any).dns, 'resolveMx').mockResolvedValue([{ priority: 10, exchange: 'mail.buyer.buyer-fixture.com' }]);
    const lead = (id: string, email: string, extra = {}) => ({ id, leadId: id, taskId: 't', company: 'Buyer', email, country: 'United Arab Emirates', website: 'https://buyer.buyer-fixture.com', sourceUrl: 'https://buyer.buyer-fixture.com/contact', sourceType: 'Contact Page', sourceHttpStatus: 200, matchedProductKeyword: 'flange', targetSegment: 'distributor', status: 'candidate', rawData: { fitScore: 95 }, ...extra });
    return { service, task, leads, repository, tasks, customers, mx, lead, source, suppressed };
  }
  it('retains different contacts, reuses domain checks and does not claim mailbox verification', async () => {
    const { service, leads, mx, lead } = setup();
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com'), lead('2', 'purchasing@buyer.buyer-fixture.com'), lead('3', 'sales@buyer.buyer-fixture.com'));
    const result = await service.cleanLeads(1, 'seller');
    expect(mx).toHaveBeenCalledTimes(1);
    expect(result.summary.readyToEmail).toBe(2); expect(result.summary.duplicatesRemoved).toBe(1);
    expect(leads[1].status).toBe('candidate'); expect(leads[1].emailStatus).toBe('domain_valid');
    expect(leads[1].cleaningNotes).toContain('投递确认');
  });
  it('requires product, buyer and target-region evidence for automatic import', async () => {
    const { service, leads, lead } = setup();
    leads.push(lead('1', 'one@buyer.buyer-fixture.com', { matchedProductKeyword: '' }), lead('2', 'two@buyer.buyer-fixture.com', { country: '' }), lead('3', 'three@buyer.buyer-fixture.com', { country: 'Germany' }), lead('4', 'four@buyer.buyer-fixture.com', { targetSegment: '' }));
    await service.cleanLeads(1, 'seller');
    expect(leads.every((item) => item.recommendedAction === 'Needs Review')).toBe(true);
    expect(leads[2].regionStatus).toBe('mismatch');
  });
  it('preserves converted history and excludes unreviewed and failed records from imported counts', async () => {
    const { service, leads, lead, customers, tasks } = setup();
    leads.push(lead('1', 'old@buyer.buyer-fixture.com', { status: 'converted', crmCustomerId: 'existing', recommendedAction: 'Ready to Email' }), lead('2', 'review@buyer.buyer-fixture.com', { country: '' }), lead('3', 'sales@buyer.buyer-fixture.com'));
    const result = await service.importToCustomers(1, { importAll: true }, 'seller');
    expect(customers.upsertLeadCustomer).toHaveBeenCalledTimes(1);
    expect(leads[0].status).toBe('converted');
    expect(result).toEqual({ imported: 1, merged: 0, skipped: 2 });
    expect(tasks.update).toHaveBeenLastCalledWith(1, { importedCustomerCount: 2 });
  });
  it('handles null MX and transient DNS failure without labeling them verified', async () => {
    const { service, mx } = setup();
    mx.mockResolvedValueOnce([{ priority: 0, exchange: '.' }]);
    expect((await (service as any).validateLeadEmail('sales@buyer.buyer-fixture.com')).hardBounce).toBe(true);
    mx.mockRejectedValueOnce(Object.assign(new Error('temporary'), { code: 'ETIMEOUT' }));
    expect(await (service as any).validateLeadEmail('sales@buyer.buyer-fixture.com')).toMatchObject({ valid: false, hardBounce: false });
  });
  it('matches country aliases without treating an unrelated country as targeted', async () => {
    const { service, task, leads, lead } = setup();
    task.targetRegions = ['USA'];
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com', { country: 'United States' }), lead('2', 'other@buyer.buyer-fixture.com', { country: 'Germany' }));
    await service.cleanLeads(1, 'seller');
    expect(leads[0].recommendedAction).toBe('Ready to Email');
    expect(leads[1].cleaningNotes).toContain('企业国家不在目标地区范围内');
  });
  it('rejects missing, placeholder and system mailboxes before source requests', async () => {
    const { service, leads, lead, source } = setup();
    leads.push(lead('1', ''), lead('2', 'sales@example.com'), lead('3', 'no-reply@buyer.buyer-fixture.com'));
    const result = await service.cleanLeads(1, 'seller');
    expect(result.summary.readyToEmail).toBe(0);
    expect(source).not.toHaveBeenCalled();
    expect(leads[0].reviewReason).toContain('未发现邮箱');
    expect(leads[1].emailStatus).toBe('invalid');
  });
  it('blocks historical hard bounces or unsubscribe suppression even when DNS passes', async () => {
    const { service, leads, lead, suppressed, source, customers } = setup();
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com', { recommendedAction: 'Ready to Email' }));
    suppressed.mockResolvedValue(true);
    expect(await service.importToCustomers(1, { ids: ['1'] }, 'seller')).toEqual({ imported: 0, merged: 0, skipped: 1 });
    expect(customers.upsertLeadCustomer).not.toHaveBeenCalled();
    expect(source).not.toHaveBeenCalled();
    expect(leads[0].emailStatus).toBe('suppressed');
  });
  it('requires the exact email on a reachable source, not a historical HTTP success', async () => {
    const { service, leads, lead, source, customers } = setup();
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com', { recommendedAction: 'Ready to Email' }));
    source.mockResolvedValueOnce({ status: 200, emails: ['different@buyer.buyer-fixture.com'] });
    await service.importToCustomers(1, { ids: ['1'] }, 'seller');
    expect(customers.upsertLeadCustomer).not.toHaveBeenCalled();
    expect(leads[0].recommendedAction).toBe('Needs Review');
    source.mockResolvedValueOnce({ status: 403, emails: [] });
    await service.cleanLeads(1, 'seller', true);
    expect(leads[0].sourceHttpStatus).toBe(403);
    expect(leads[0].recommendedAction).toBe('Needs Review');
  });
  it('shares source requests, caches recent evidence but forces a fresh check before conversion', async () => {
    const { service, leads, lead, source, customers } = setup();
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com'), lead('2', 'purchasing@buyer.buyer-fixture.com'));
    await service.cleanLeads(1, 'seller'); await service.cleanLeads(1, 'seller');
    expect(source).toHaveBeenCalledTimes(1);
    source.mockResolvedValueOnce({ status: 200, emails: [] });
    await service.importToCustomers(1, { ids: ['1'] }, 'seller');
    expect(source).toHaveBeenCalledTimes(2);
    expect(customers.upsertLeadCustomer).not.toHaveBeenCalled();
  });
  it('fails closed when the suppression lookup is unavailable', async () => {
    const { service, leads, lead, suppressed, customers } = setup();
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com'));
    suppressed.mockRejectedValueOnce(new Error('database unavailable'));
    await expect(service.importToCustomers(1, { importAll: true }, 'seller')).rejects.toThrow('database unavailable');
    expect(customers.upsertLeadCustomer).not.toHaveBeenCalled();
  });
  it('does not advertise old scores as eligible contacts and honors specific target countries', async () => {
    const { service, task, leads, lead } = setup();
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com', { recommendedAction: 'Ready to Email' }));
    expect((await service.getTaskLeads(1, { recommendedAction: 'Ready to Email' }, 'seller')).leads).toHaveLength(0);
    task.agentState = { targetCountries: ['Qatar'] };
    await service.cleanLeads(1, 'seller');
    expect(leads[0].recommendedAction).toBe('Needs Review');
  });
  it('treats missing MX as unverified rather than an observed hard bounce', async () => {
    const { service, mx } = setup();
    mx.mockRejectedValueOnce(Object.assign(new Error('no data'), { code: 'ENODATA' }));
    expect(await (service as any).validateLeadEmail('sales@buyer.buyer-fixture.com')).toMatchObject({ valid: false, hardBounce: false });
  });
  it('removes newly suppressed recipients from eligible results without waiting for a crawl', async () => {
    const { service, leads, lead, suppressed } = setup();
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com'));
    await service.cleanLeads(1, 'seller');
    suppressed.mockResolvedValue(true);
    expect((await service.getTaskLeads(1, { recommendedAction: 'Ready to Email' }, 'seller')).leads).toHaveLength(0);
  });
  it('routes the legacy conversion endpoint through the same quality gate', async () => {
    const { service, leads, lead, source, customers } = setup();
    leads.push(lead('1', 'sales@buyer.buyer-fixture.com'));
    source.mockResolvedValue({ status: 200, emails: [] });
    expect((await service.convertLeads({ ids: ['1'] }, 'seller')).count).toBe(0);
    expect(customers.upsertLeadCustomer).not.toHaveBeenCalled();
  });
});
