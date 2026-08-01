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
    expect(queries.some((query) => query.includes('sales OR enquiry OR procurement'))).toBe(true);
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
});
