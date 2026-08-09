import * as xlsx from 'xlsx';
import { CustomersService } from './customers.service';

function upload(rows: Record<string, unknown>[]) {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows), 'Customers');
  return {
    fieldname: 'file',
    originalname: 'customers.xlsx',
    encoding: '7bit',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    size: 1,
  } as any;
}

describe('CustomersService imports', () => {
  const customerRepository = {
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  const service = new CustomersService(
    customerRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('reads in-memory Excel uploads and detects normalized duplicate emails', async () => {
    customerRepository.find.mockResolvedValue([
      { id: 1, company: 'Existing Co', email: 'sales@example.com' },
    ]);

    const result = await service.parseAndPreview(upload([
      { 公司名称: '新公司', 邮箱: ' SALES@EXAMPLE.COM ' },
      { Company: 'Second row', Email: 'sales@example.com' },
    ]));

    expect(result.total).toBe(2);
    expect(result.withEmail).toBe(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.duplicateUploadCount).toBe(1);
  });

  it('preserves international company names exactly as imported', async () => {
    customerRepository.find.mockResolvedValue([]);

    const result = await service.parseAndImport(upload([
      { Company: 'PT. Batam Pratama Mandiri', Email: 'sales@bpm.co.id' },
      { Company: 'Sun Hydraulics (Thailand) Co., Ltd.', Email: 'sales@sunhydraulics.co.th' },
    ]));

    expect(result).toEqual({ created: 2, updated: 0, skipped: 0, total: 2 });
    expect(customerRepository.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      company: 'PT. Batam Pratama Mandiri',
    }));
    expect(customerRepository.create).toHaveBeenNthCalledWith(2, expect.objectContaining({
      company: 'Sun Hydraulics (Thailand) Co., Ltd.',
    }));
  });

  it('merges non-empty imported profile data without resetting CRM state', async () => {
    const existing = {
      id: 1,
      customerId: 'cus_1',
      company: 'Original Company',
      contact: 'Original Contact',
      email: 'sales@example.com',
      phone: '123',
      journeyStage: 'contacted',
      ownerId: 'user_1',
      emailStatus: 'valid',
      source: 'manual',
    };
    customerRepository.find.mockResolvedValue([existing]);

    const result = await service.parseAndImport(upload([
      {
        Company: 'Updated Company',
        Email: ' SALES@EXAMPLE.COM ',
        Phone: '',
        Website: 'https://example.com',
      },
    ]));

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, total: 1 });
    expect(existing).toMatchObject({
      company: 'Updated Company',
      contact: 'Original Contact',
      phone: '123',
      website: 'https://example.com',
      journeyStage: 'contacted',
      ownerId: 'user_1',
      emailStatus: 'valid',
    });
  });

  it('does not overwrite a duplicate email owned by another salesperson', async () => {
    const existing = {
      id: 2,
      customerId: 'cus_2',
      company: 'Protected Account',
      email: 'buyer@example.com',
      ownerId: '8',
    };
    customerRepository.find.mockResolvedValue([existing]);

    const result = await service.parseAndImport(upload([
      { Company: 'Incoming Override', Email: 'buyer@example.com' },
    ]), '7');

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1, total: 1 });
    expect(existing.company).toBe('Protected Account');
    expect(customerRepository.save).not.toHaveBeenCalled();
  });
});

describe('CustomersService quote contracts', () => {
  const customerRepository = {
    findOne: jest.fn(),
  };
  const quoteRepository = {
    count: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };
  const service = new CustomersService(
    customerRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    quoteRepository as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    customerRepository.findOne.mockResolvedValue({ id: 1, company: 'Buyer Co' });
    quoteRepository.count.mockResolvedValue(0);
  });

  it('calculates line totals, tax, freight and grand total on the server', async () => {
    const quote = await service.createQuote({
      customerId: 1,
      currency: 'USD',
      subtotal: 999999,
      taxAmount: 999999,
      total: 999999,
      freight: 20,
      taxRate: 10,
      items: [{
        productName: 'Weld Neck Flange',
        quantity: 2,
        unitPrice: 100,
        discount: 10,
      }],
    });

    expect(quote).toMatchObject({
      subtotal: 180,
      freight: 20,
      taxRate: 10,
      taxAmount: 18,
      total: 218,
      items: [{ quantity: 2, unitPrice: 100, discount: 10, subtotal: 180 }],
    });
  });
});

describe('CustomersService opportunity lifecycle sync', () => {
  let customer: any;
  let opportunities: any[];
  let nextId: number;
  let clock: number;

  const customerRepository = {
    findOne: jest.fn(async () => customer),
    save: jest.fn(async (value) => value),
  };
  const opportunityRepository = {
    find: jest.fn(async () => [...opportunities].sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.id - a.id
    )),
    findOne: jest.fn(async ({ where }: any) => opportunities.find((item) => item.id === where.id) || null),
    create: jest.fn((value) => ({ id: nextId++, amount: 0, ...value, updatedAt: new Date(clock++) })),
    save: jest.fn(async (value) => {
      value.updatedAt = new Date(clock++);
      const index = opportunities.findIndex((item) => item.id === value.id);
      if (index >= 0) opportunities[index] = value;
      else opportunities.push(value);
      return value;
    }),
    delete: jest.fn(async (id) => {
      const before = opportunities.length;
      opportunities = opportunities.filter((item) => item.id !== id);
      return { affected: before - opportunities.length };
    }),
  };
  const service = new CustomersService(
    customerRepository as any,
    {} as any,
    {} as any,
    {} as any,
    opportunityRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    nextId = 1;
    clock = Date.parse('2026-08-08T00:00:00Z');
    opportunities = [];
    customer = {
      id: 1,
      customerId: 'cus_1',
      company: 'Buyer Co',
      journeyStage: 'qualified',
      openOpportunityCount: 0,
      openOpportunityValue: 0,
      tags: [],
    };
  });

  it('moves the customer into opportunity stage and refreshes metrics when an opportunity is created', async () => {
    await service.createOpportunity({ customerId: 1, name: 'First order', amount: 2500 });

    expect(customer).toMatchObject({
      journeyStage: 'opportunity',
      openOpportunityCount: 1,
      openOpportunityValue: 2500,
    });
  });

  it('updates customer 360 when the current opportunity stage changes', async () => {
    const opportunity = await service.createOpportunity({ customerId: 1, name: 'First order', amount: 2500 });
    await service.updateOpportunity(opportunity.id, { stage: 'negotiation' });

    expect(opportunity).toMatchObject({ stage: 'negotiation', probability: 80 });
    expect(customer.journeyStage).toBe('negotiation');
  });

  it('updates the current opportunity when the customer journey stage changes', async () => {
    const opportunity = await service.createOpportunity({ customerId: 1, name: 'First order' });
    await service.update(1, { journeyStage: 'proposal' });

    expect(opportunity).toMatchObject({ stage: 'proposal', probability: 60 });
    expect(customer.journeyStage).toBe('proposal');
  });

  it('creates a default opportunity when a customer is converted to opportunity stage', async () => {
    customer.journeyStage = 'replied';
    await service.update(1, { journeyStage: 'opportunity' });

    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      customerId: 1,
      name: 'Buyer Co - 商机',
      stage: 'prospecting',
      probability: 10,
    });
    expect(customer.openOpportunityCount).toBe(1);
  });

  it('prevents an early customer stage from silently diverging from an existing opportunity', async () => {
    await service.createOpportunity({ customerId: 1, name: 'First order' });
    await expect(service.update(1, { journeyStage: 'contacted' })).rejects.toThrow(
      '该客户已有商机，请在商机看板调整阶段',
    );
  });

  it('clears opportunity metrics and returns to qualified when the final opportunity is deleted', async () => {
    const opportunity = await service.createOpportunity({ customerId: 1, name: 'First order', amount: 2500 });
    await service.deleteOpportunity(opportunity.id);

    expect(customer).toMatchObject({
      journeyStage: 'qualified',
      openOpportunityCount: 0,
      openOpportunityValue: 0,
    });
  });
});
