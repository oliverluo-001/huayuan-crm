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

  it('fills blank imported profile data without silently overwriting existing business fields', async () => {
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
      company: 'Original Company',
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
    findOne: jest.fn(),
    delete: jest.fn(),
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
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    customerRepository.findOne.mockResolvedValue({ id: 1, company: 'Buyer Co' });
    quoteRepository.count.mockResolvedValue(0);
    quoteRepository.findOne.mockResolvedValue({
      id: 1,
      customerId: 1,
      quoteNo: 'Q-001',
      currency: 'USD',
      freight: 0,
      taxRate: 0,
      items: [{ productName: 'Weld Neck Flange', quantity: 1, unitPrice: 100, discount: 0, subtotal: 100 }],
    });
    quoteRepository.delete.mockResolvedValue({ affected: 1 });
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

  it('recalculates totals when a quote is edited', async () => {
    const result = await service.updateQuote(1, {
      freight: 25,
      taxRate: 5,
      items: [{ productName: 'Weld Neck Flange', quantity: 3, unitPrice: 80, discount: 0 }],
    });

    expect(result).toMatchObject({
      subtotal: 240,
      freight: 25,
      taxAmount: 12,
      total: 277,
    });
  });

  it('deletes an existing quote', async () => {
    await expect(service.deleteQuote(1)).resolves.toEqual({ deleted: true });
    expect(quoteRepository.delete).toHaveBeenCalledWith(1);
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

describe('CustomersService customer summary refresh', () => {
  let customer: any;
  let todos: any[];
  let nextTodoId: number;

  const customerRepository = {
    findOne: jest.fn(async () => customer),
    save: jest.fn(async (value) => value),
  };
  const activityRepository = {
    create: jest.fn((value) => ({ id: 1, type: 'note', ...value })),
    save: jest.fn(async (value) => ({ ...value, createdAt: new Date('2026-08-09T01:00:00Z') })),
  };
  const todoRepository = {
    create: jest.fn((value) => ({ id: nextTodoId++, status: 'open', ...value })),
    save: jest.fn(async (value) => {
      const index = todos.findIndex((todo) => todo.id === value.id);
      if (index >= 0) todos[index] = value;
      else todos.push(value);
      return value;
    }),
    find: jest.fn(async ({ where }: any) => todos.filter((todo) => (
      todo.customerId === where.customerId && todo.status === where.status
    ))),
    findOne: jest.fn(async ({ where }: any) => todos.find((todo) => todo.id === where.id) || null),
    delete: jest.fn(async (id: number) => {
      const before = todos.length;
      todos = todos.filter((todo) => todo.id !== id);
      return { affected: before - todos.length };
    }),
  };
  const service = new CustomersService(
    customerRepository as any,
    {} as any,
    activityRepository as any,
    todoRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    nextTodoId = 1;
    todos = [];
    customer = {
      id: 1,
      customerId: 'cus_1',
      company: 'Buyer Co',
      health: '',
      nextTodoAt: null,
      nextTodoTitle: '',
    };
  });

  it('refreshes the latest activity summary when a follow-up is recorded', async () => {
    await service.createActivity(1, { type: 'call', subject: '确认技术参数' });

    expect(customer).toMatchObject({
      lastActivityAt: new Date('2026-08-09T01:00:00Z'),
      lastActivityType: 'call',
      health: 'good',
    });
  });

  it('refreshes next todo and customer health after create, complete, reopen and delete', async () => {
    const future = await service.createTodo({ customerId: 1, title: '发送报价', dueAt: '2099-01-02' });
    const overdue = await service.createTodo({ customerId: 1, title: '确认询盘', dueAt: '2000-01-01' });

    expect(customer).toMatchObject({ nextTodoTitle: '确认询盘', health: 'critical' });

    await service.updateTodo(overdue.id, { status: 'done' });
    expect(customer).toMatchObject({ nextTodoTitle: '发送报价', health: 'warning' });
    expect(overdue.completedAt).toBeInstanceOf(Date);

    await service.updateTodo(overdue.id, { status: 'open' });
    expect(overdue.completedAt).toBeNull();
    expect(customer).toMatchObject({ nextTodoTitle: '确认询盘', health: 'critical' });

    await service.updateTodo(overdue.id, { status: 'done' });
    await service.deleteTodo(future.id);
    expect(customer).toMatchObject({ nextTodoAt: null, nextTodoTitle: '', health: 'good' });
  });
});

describe('CustomersService sample and customer 360 contracts', () => {
  const customer = { id: 1, customerId: 'cus_1', company: 'Buyer Co', ownerId: '7', tags: [] };
  const customerRepository = {
    findOne: jest.fn(async () => customer),
  };
  const emptyRepository = { find: jest.fn(async () => []) };
  const sampleRepository = {
    find: jest.fn(async () => []),
    findOne: jest.fn(),
    create: jest.fn((value) => ({ id: 1, status: 'pending', ...value })),
    save: jest.fn(async (value) => value),
  };
  const emailLogRepository = {
    find: jest.fn(async () => [{
      id: 8,
      logId: 'log_8',
      customerId: 'cus_1',
      customerName: 'Buyer Co',
      recipientEmail: 'buyer@example.com',
      subject: 'Quotation Q-001',
      status: 'sent',
      sentAt: new Date('2026-08-09T02:00:00Z'),
    }]),
  };
  const service = new CustomersService(
    customerRepository as any,
    emptyRepository as any,
    emptyRepository as any,
    emptyRepository as any,
    emptyRepository as any,
    emptyRepository as any,
    sampleRepository as any,
    emptyRepository as any,
    emptyRepository as any,
    emailLogRepository as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('fills sample milestone dates when its status advances', async () => {
    const sample = await service.createSample({
      customerId: 1,
      productName: 'Weld Neck Flange',
      status: 'delivered',
    });

    expect(sample.sentAt).toBeInstanceOf(Date);
    expect(sample.deliveredAt).toBeInstanceOf(Date);
  });

  it('updates sample status and fills missing milestone dates', async () => {
    const sample = {
      id: 1,
      customerId: 1,
      productName: 'Weld Neck Flange',
      status: 'pending',
      sentAt: null,
      deliveredAt: null,
    };
    sampleRepository.findOne.mockResolvedValue(sample);

    const result = await service.updateSample(1, { status: 'delivered' });

    expect(result.status).toBe('delivered');
    expect(result.sentAt).toBeInstanceOf(Date);
    expect(result.deliveredAt).toBeInstanceOf(Date);
  });

  it('returns normalized customer email history in the 360 view', async () => {
    const result = await service.getCustomer360(1, '7');

    expect(result.sendLogs).toEqual([expect.objectContaining({
      id: 'log_8',
      email: 'buyer@example.com',
      subject: 'Quotation Q-001',
      status: 'sent',
      createdAt: new Date('2026-08-09T02:00:00Z'),
    })]);
    expect(emailLogRepository.find).toHaveBeenCalledWith(expect.objectContaining({
      where: { customerId: 'cus_1' },
    }));
  });
});

describe('CustomersService contact summary synchronization', () => {
  let customer: any;
  let contacts: any[];
  let nextId: number;
  const customerRepository = {
    findOne: jest.fn(async () => customer),
    save: jest.fn(async (value) => value),
  };
  const contactRepository = {
    create: jest.fn((value) => ({ ...value })),
    save: jest.fn(async (value) => {
      if (!value.id) value.id = nextId++;
      const index = contacts.findIndex((item) => item.id === value.id);
      if (index >= 0) contacts[index] = value;
      else contacts.push(value);
      return value;
    }),
    update: jest.fn(async (where, update) => {
      contacts.filter((item) => item.customerId === where.customerId).forEach((item) => Object.assign(item, update));
      return { affected: contacts.length };
    }),
    findOne: jest.fn(async ({ where, order }: any) => {
      if (where.id) return contacts.find((item) => item.id === where.id) || null;
      let matches = contacts.filter((item) => item.customerId === where.customerId);
      if (where.isPrimary !== undefined) matches = matches.filter((item) => item.isPrimary === where.isPrimary);
      if (order?.createdAt === 'ASC') matches = [...matches].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      return matches[0] || null;
    }),
    delete: jest.fn(async (id) => {
      const before = contacts.length;
      contacts = contacts.filter((item) => item.id !== id);
      return { affected: before - contacts.length };
    }),
  };
  const service = new CustomersService(
    customerRepository as any,
    contactRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    nextId = 1;
    contacts = [];
    customer = { id: 1, customerId: 'cus_1', company: 'Buyer Co', ownerId: '7', tags: [] };
  });

  it('keeps customer summary aligned when the primary contact changes or is deleted', async () => {
    const first = await service.createContact(1, {
      name: 'Anna',
      email: 'anna@example.com',
      phone: '+1 100',
      isPrimary: true,
    }, '7');
    const second = await service.createContact(1, {
      name: 'Ben',
      email: 'ben@example.com',
      phone: '+1 200',
    }, '7');
    expect(customer).toMatchObject({ contact: 'Anna', email: 'anna@example.com', phone: '+1 100' });

    await service.updateContact(second.id, { isPrimary: true }, '7');
    expect(first.isPrimary).toBe(false);
    expect(customer).toMatchObject({ contact: 'Ben', email: 'ben@example.com', phone: '+1 200' });

    await service.deleteContact(second.id, '7');
    expect(first.isPrimary).toBe(true);
    expect(customer).toMatchObject({ contact: 'Anna', email: 'anna@example.com', phone: '+1 100' });
  });
});

describe('CustomersService authorized sales scope', () => {
  const queryBuilder = () => ({
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue([]),
  });
  const todoQb = queryBuilder();
  const opportunityQb = queryBuilder();
  const quoteQb = queryBuilder();
  const sampleQb = queryBuilder();
  const service = new CustomersService(
    {} as any,
    {} as any,
    {} as any,
    { createQueryBuilder: jest.fn(() => todoQb) } as any,
    { createQueryBuilder: jest.fn(() => opportunityQb) } as any,
    { createQueryBuilder: jest.fn(() => quoteQb) } as any,
    { createQueryBuilder: jest.fn(() => sampleQb) } as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('includes collaborator access in todo, opportunity, quote and sample lists', async () => {
    await service.findTodos({ ownerId: '7' });
    await service.findOpportunities({ ownerId: '7' });
    await service.findQuotes({ ownerId: '7' });
    await service.findSamples({ ownerId: '7' });

    for (const qb of [todoQb, opportunityQb, quoteQb, sampleQb]) {
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('customer.collaboratorIds'),
        { customerAccessUserId: '7' },
      );
    }
  });
});
