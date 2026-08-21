import { LeadsService } from './leads.service';

describe('LeadsService CRM conversion', () => {
  const task = {
    id: 1,
    taskId: 'task_1',
    productName: 'forged flanges',
    importedCustomerCount: 0,
    ownerId: '7',
  };
  const lead = {
    id: 2,
    leadId: 'lead_1',
    taskId: 'task_1',
    company: 'Acme PVF',
    contactName: 'Buyer',
    email: 'sales@acme.example',
    phone: '+1 555 0000',
    website: 'https://acme.example',
    region: 'USA',
    country: 'USA',
    business: 'PVF distributor',
    targetSegment: 'distributor',
    buyerType: 'distributor',
    sourceUrl: 'https://acme.example/contact',
    sourceName: 'Search API + public website',
    cleaningNotes: 'public evidence',
    recommendedAction: 'Ready to Email',
    crmCustomerId: '',
    convertedCustomerId: '',
    leadStatus: 'new',
    status: 'candidate',
  };

  const leadRepository = {
    find: jest.fn(),
    save: jest.fn(async (value) => value),
  };
  const taskRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const customers = { upsertLeadCustomer: jest.fn() };
  const service = new LeadsService(
    leadRepository as any,
    taskRepository as any,
    {} as any,
    customers as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('generates buyer-intent queries across aliases, segments and downstream industries', () => {
    const queries = service.generateSearchQueries('flange', {
      aliases: ['forged flanges'],
      segments: ['distributor'],
      regions: ['USA'],
      industries: ['Oil & Gas'],
    });
    expect(queries.some((query) => query.includes('"forged flanges"') && query.includes('"distributor"'))).toBe(true);
    expect(queries.some((query) => query.includes('procurement OR purchasing OR RFQ'))).toBe(true);
    expect(queries.some((query) => query.includes('"Oil & Gas"'))).toBe(true);
  });

  it('creates a real CRM customer and stores its real customer id on the lead', async () => {
    taskRepository.findOne.mockResolvedValue(task);
    leadRepository.find.mockResolvedValue([lead]);
    customers.upsertLeadCustomer.mockResolvedValue({
      created: true,
      customer: { customerId: 'cus_real_1' },
    });

    const result = await service.importToCustomers(1, { ids: ['lead_1'] }, '7');

    expect(customers.upsertLeadCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        company: 'Acme PVF',
        email: 'sales@acme.example',
        product: 'forged flanges',
      }),
      '7',
    );
    expect(lead.crmCustomerId).toBe('cus_real_1');
    expect(lead.convertedCustomerId).toBe('cus_real_1');
    expect(lead.leadStatus).toBe('converted');
    expect(result).toEqual({ imported: 1, merged: 0, skipped: 0 });
  });

  it('hides tasks owned by another salesperson', async () => {
    taskRepository.findOne.mockResolvedValue({ ...task, ownerId: '8' });
    await expect(service.findOneTask(1, '7')).rejects.toThrow('任务不存在');
  });

  it('does not stop when raw results reach the target and continues until a verified contact is found', async () => {
    const runtimeTask: any = {
      id: 9,
      taskId: 'task_quality',
      productName: 'flange',
      productAliases: [],
      targetSegments: ['distributor'],
      targetCount: 1,
      searchQueries: ['query without email', 'query with verified email'],
      automationCursor: 0,
      automationProgress: {},
      cancelRequested: false,
      status: 'running',
      ownerId: '7',
    };
    const savedLeads: any[] = [];
    const runtimeLeadRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(async (value) => { savedLeads.push(value); return value; }),
      count: jest.fn(async () => savedLeads.length),
    };
    const runtimeTaskRepository = {
      findOne: jest.fn(async () => runtimeTask),
      update: jest.fn(async (_id, patch) => { Object.assign(runtimeTask, patch); return { affected: 1 }; }),
    };
    const candidate = (email: string) => ({
      company: email ? 'Verified Buyer' : 'Buyer Without Email',
      email,
      website: email ? 'https://verified.example' : 'https://buyer.example',
      sourceUrl: email ? 'https://verified.example/contact' : 'https://buyer.example',
      sourceType: 'Company Website',
      sourceName: 'Search API + public website',
      sourceHttpStatus: 200,
      business: 'flange distributor',
      matchedProductKeyword: 'flange',
      targetSegment: 'distributor',
      fitNote: '产品和买家身份匹配',
      fitScore: 90,
      confidence: 'High' as const,
      evidence: ['产品匹配'],
      gaps: email ? [] : ['未发现公开邮箱'],
      rawData: {},
    });
    const search = {
      discover: jest.fn()
        .mockResolvedValueOnce({ candidates: [candidate('')], searched: 20, crawled: 1 })
        .mockResolvedValueOnce({ candidates: [candidate('sales@verified.example')], searched: 20, crawled: 1 }),
    };
    const runtimeService = new LeadsService(
      runtimeLeadRepository as any,
      runtimeTaskRepository as any,
      search as any,
      customers as any,
    );
    jest.spyOn(runtimeService, 'cleanLeads').mockResolvedValue({
      summary: { readyToEmail: 1 },
    } as any);

    await (runtimeService as any).processTaskAsync(runtimeTask);

    expect(search.discover).toHaveBeenCalledTimes(2);
    expect(runtimeTask.automationCursor).toBe(2);
    expect(runtimeTask.status).toBe('completed');
    expect(runtimeTask.automationProgress.stopReason).toBe('qualified_target_reached');
  });
});
