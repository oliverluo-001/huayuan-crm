import * as xlsx from 'xlsx';
import { CustomersService } from './customers.service';

function upload(rows: Record<string, unknown>[]) {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(
    workbook,
    xlsx.utils.json_to_sheet(rows),
    'Customers',
  );
  return {
    fieldname: 'file',
    originalname: 'customers.xlsx',
    encoding: '7bit',
    mimetype:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
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

    const result = await service.parseAndPreview(
      upload([
        { 公司名称: '新公司', 邮箱: ' SALES@EXAMPLE.COM ' },
        { Company: 'Second row', Email: 'sales@example.com' },
      ]),
    );

    expect(result.total).toBe(2);
    expect(result.withEmail).toBe(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.duplicateUploadCount).toBe(1);
  });

  it('preserves international company names exactly as imported', async () => {
    customerRepository.find.mockResolvedValue([]);

    const result = await service.parseAndImport(
      upload([
        { Company: 'PT. Batam Pratama Mandiri', Email: 'sales@bpm.co.id' },
        {
          Company: 'Sun Hydraulics (Thailand) Co., Ltd.',
          Email: 'sales@sunhydraulics.co.th',
        },
      ]),
    );

    expect(result).toEqual({
      created: 2,
      updated: 0,
      skipped: 0,
      blocked: 0,
      blockedDuplicates: [],
      total: 2,
    });
    expect(customerRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        company: 'PT. Batam Pratama Mandiri',
      }),
    );
    expect(customerRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        company: 'Sun Hydraulics (Thailand) Co., Ltd.',
      }),
    );
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

    const result = await service.parseAndImport(
      upload([
        {
          Company: 'Updated Company',
          Email: ' SALES@EXAMPLE.COM ',
          Phone: '',
          Website: 'https://example.com',
        },
      ]),
    );

    expect(result).toEqual({
      created: 0,
      updated: 1,
      skipped: 0,
      blocked: 0,
      blockedDuplicates: [],
      total: 1,
    });
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

    const result = await service.parseAndImport(
      upload([{ Company: 'Incoming Override', Email: 'buyer@example.com' }]),
      '7',
    );

    expect(result).toEqual({
      created: 0,
      updated: 0,
      skipped: 1,
      blocked: 1,
      blockedDuplicates: [
        {
          incomingCompany: 'Incoming Override',
          existingCompany: 'Protected Account',
          matchedBy: 'email',
        },
      ],
      total: 1,
    });
    expect(existing.company).toBe('Protected Account');
    expect(customerRepository.save).not.toHaveBeenCalled();
  });

  it('blocks cross-sales duplicates found by domain, phone, and company name', async () => {
    customerRepository.find.mockResolvedValue([
      {
        id: 3,
        customerId: 'cus_3',
        company: 'Acme Industrial Co., Ltd.',
        email: 'buyer@acme-industrial.com',
        phone: '+66 2 123 4567',
        website: 'https://www.acme-industrial.com',
        ownerId: '8',
      },
    ]);

    const result = await service.parseAndImport(
      upload([
        { Company: 'Domain Match', Website: 'acme-industrial.com' },
        { Company: 'Phone Match', Phone: '0066-2-123-4567' },
        { Company: 'Acme Industrial' },
      ]),
      '7',
    );

    expect(result.created).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.skipped).toBe(3);
    expect(result.blocked).toBe(3);
    expect(result.blockedDuplicates.map((item) => item.matchedBy)).toEqual([
      'domain',
      'phone',
      'company',
    ]);
    expect(customerRepository.save).not.toHaveBeenCalled();
  });
});

describe('CustomersService bulk assignment', () => {
  it('transfers selected customers and their opportunities to an active salesperson', async () => {
    const customers = [
      { id: 11, ownerId: '2', collaboratorIds: ['4'] },
      { id: 12, ownerId: '', collaboratorIds: [] },
    ];
    const customerRepository = {
      find: jest.fn().mockResolvedValue(customers),
      save: jest.fn(async (values) => values),
    };
    const opportunityRepository = { update: jest.fn().mockResolvedValue({ affected: 2 }) };
    const activityRepository = {
      create: jest.fn((value) => value),
      save: jest.fn(async (values) => values),
    };
    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        username: 'sales.7',
        displayName: '销售七组',
        role: 'sales',
        status: 'active',
        active: true,
      }),
    };
    const service = new CustomersService(
      customerRepository as any,
      {} as any,
      activityRepository as any,
      {} as any,
      opportunityRepository as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      undefined,
      undefined,
      userRepository as any,
    );

    const result = await service.bulkAssign({ ids: [11, 12], ownerId: '7' });

    expect(result).toEqual({ updated: 2, ownerId: '7', ownerName: '销售七组' });
    expect(customers).toEqual([
      { id: 11, ownerId: '7', collaboratorIds: [] },
      { id: 12, ownerId: '7', collaboratorIds: [] },
    ]);
    expect(opportunityRepository.update).toHaveBeenCalledWith(
      expect.anything(),
      { ownerId: '7', collaboratorIds: [] },
    );
    expect(activityRepository.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ customerId: 11, subject: '客户负责人已分配' }),
      ]),
    );
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
    customerRepository.findOne.mockResolvedValue({
      id: 1,
      company: 'Buyer Co',
    });
    quoteRepository.count.mockResolvedValue(0);
    quoteRepository.findOne.mockResolvedValue({
      id: 1,
      customerId: 1,
      quoteNo: 'Q-001',
      currency: 'USD',
      freight: 0,
      taxRate: 0,
      items: [
        {
          productName: 'Weld Neck Flange',
          quantity: 1,
          unitPrice: 100,
          discount: 0,
          subtotal: 100,
        },
      ],
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
      items: [
        {
          productName: 'Weld Neck Flange',
          quantity: 2,
          unitPrice: 100,
          discount: 10,
        },
      ],
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
      items: [
        {
          productName: 'Weld Neck Flange',
          quantity: 3,
          unitPrice: 80,
          discount: 0,
        },
      ],
    });

    expect(result).toMatchObject({
      subtotal: 240,
      freight: 25,
      taxAmount: 12,
      total: 277,
    });
  });

  it('adds named additional charges while preserving the configured exchange rate', async () => {
    const quote = await service.createQuote({
      customerId: 1,
      currency: 'usd',
      baseCurrency: 'cny',
      exchangeRate: 7.2,
      freight: 30,
      taxRate: 5,
      additionalCharges: [
        { label: 'Documentation', amount: 12.5 },
        { label: 'Bank charge', amount: 7.5 },
      ],
      items: [
        {
          productName: 'Blind Flange',
          quantity: 2,
          unitPrice: 100,
          discount: 0,
        },
      ],
    });

    expect(quote).toMatchObject({
      currency: 'USD',
      baseCurrency: 'CNY',
      exchangeRate: 7.2,
      subtotal: 200,
      freight: 30,
      additionalFeeTotal: 20,
      taxAmount: 10,
      total: 260,
    });
  });

  it('deletes an existing quote', async () => {
    await expect(service.deleteQuote(1)).resolves.toEqual({ deleted: true });
    expect(quoteRepository.delete).toHaveBeenCalledWith(1);
  });
});

describe('CustomersService quote term templates', () => {
  const quoteRepository = { update: jest.fn() };
  const templateRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => ({ id: 1, ...value })),
    exist: jest.fn(),
    delete: jest.fn(),
  };
  const service = new CustomersService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    quoteRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    undefined,
    templateRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    templateRepository.exist.mockResolvedValue(true);
    templateRepository.delete.mockResolvedValue({ affected: 1 });
  });

  it('creates a reusable bilingual company term template', async () => {
    await expect(service.createQuoteTermTemplate({
      name: ' Standard export terms ',
      contentZh: ' 中文条款 ',
      contentEn: ' English terms ',
    })).resolves.toMatchObject({
      id: 1,
      name: 'Standard export terms',
      contentZh: '中文条款',
      contentEn: 'English terms',
      isDefault: false,
    });
  });

  it('clears quote references before deleting a term template', async () => {
    await expect(service.deleteQuoteTermTemplate(3)).resolves.toEqual({ deleted: true });
    expect(quoteRepository.update).toHaveBeenCalledWith(
      { termTemplateId: 3 },
      { termTemplateId: null },
    );
    expect(templateRepository.delete).toHaveBeenCalledWith(3);
  });
});

describe('CustomersService opportunity lifecycle sync', () => {
  let customer: any;
  let opportunities: any[];
  let stageHistory: any[];
  let nextId: number;
  let clock: number;

  const customerRepository = {
    findOne: jest.fn(async () => customer),
    save: jest.fn(async (value) => value),
  };
  const opportunityRepository = {
    find: jest.fn(async () =>
      [...opportunities].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() ||
          b.id - a.id,
      ),
    ),
    findOne: jest.fn(
      async ({ where }: any) =>
        opportunities.find((item) => item.id === where.id) || null,
    ),
    create: jest.fn((value) => ({
      id: nextId++,
      amount: 0,
      ...value,
      updatedAt: new Date(clock++),
    })),
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
  const opportunityStageHistoryRepository = {
    create: jest.fn((value) => ({ id: stageHistory.length + 1, ...value })),
    save: jest.fn(async (value) => {
      stageHistory.push(value);
      return value;
    }),
    find: jest.fn(async ({ where }: any) =>
      stageHistory.filter((item) => item.opportunityPk === where.opportunityPk),
    ),
  };
  const todoRepository = {
    find: jest.fn(async () => []),
  };
  const service = new CustomersService(
    customerRepository as any,
    {} as any,
    {} as any,
    todoRepository as any,
    opportunityRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    opportunityStageHistoryRepository as any,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    nextId = 1;
    clock = Date.parse('2026-08-08T00:00:00Z');
    opportunities = [];
    stageHistory = [];
    customer = {
      id: 1,
      customerId: 'cus_1',
      company: 'Buyer Co',
      ownerId: '7',
      journeyStage: 'qualified',
      openOpportunityCount: 0,
      openOpportunityValue: 0,
      nextTodoTitle: '确认首单产品规格',
      nextTodoAt: new Date('2026-08-15T00:00:00Z'),
      tags: [],
    };
  });

  it('moves the customer into opportunity stage and refreshes metrics when an opportunity is created', async () => {
    await service.createOpportunity({
      customerId: 1,
      name: 'First order',
      amount: 2500,
      nextStepAction: '确认首单产品规格',
      expectedCloseDate: '2026-09-30',
    });

    expect(customer).toMatchObject({
      journeyStage: 'opportunity',
      ownerId: '7',
      nextTodoTitle: '确认首单产品规格',
      openOpportunityCount: 1,
      openOpportunityValue: 2500,
    });
  });

  it('rejects an active opportunity without a next action or expected close date', async () => {
    await expect(
      service.createOpportunity({
        customerId: 1,
        name: 'Missing close date',
        nextStepAction: '确认采购计划',
      } as any),
    ).rejects.toThrow('商机必须填写预计成交日期');

    await expect(
      service.createOpportunity({
        customerId: 1,
        name: 'Missing next action',
        expectedCloseDate: '2026-09-30',
      }),
    ).rejects.toThrow('未关闭商机必须填写下一步行动');
  });

  it('updates customer 360 when the current opportunity stage changes', async () => {
    const opportunity = await service.createOpportunity({
      customerId: 1,
      name: 'First order',
      amount: 2500,
      nextStepAction: '确认首单产品规格',
      expectedCloseDate: '2026-09-30',
    });
    await service.updateOpportunity(opportunity.id, { stage: 'negotiation' });

    expect(opportunity).toMatchObject({
      stage: 'negotiation',
      probability: 80,
    });
    expect(customer.journeyStage).toBe('negotiation');
    expect(stageHistory.map((item) => item.toStage)).toEqual([
      'prospecting',
      'negotiation',
    ]);
  });

  it('requires a result reason before closing and updates the customer after a valid win', async () => {
    const opportunity = await service.createOpportunity(
      {
        customerId: 1,
        name: 'First order',
        nextStepAction: '确认首单产品规格',
        expectedCloseDate: '2026-09-30',
      },
      { userId: '7', displayName: '销售甲' },
    );

    await expect(
      service.updateOpportunity(opportunity.id, { stage: 'won' }),
    ).rejects.toThrow('必须填写赢单原因');

    await service.updateOpportunity(
      opportunity.id,
      { stage: 'won', winReason: '客户确认价格与交期' },
      { userId: '7', displayName: '销售甲' },
    );

    expect(opportunity).toMatchObject({
      stage: 'won',
      probability: 100,
      forecastCategory: 'closed',
      winReason: '客户确认价格与交期',
    });
    expect(opportunity.closedAt).toBeInstanceOf(Date);
    expect(customer.journeyStage).toBe('won');
    expect(stageHistory.at(-1)).toMatchObject({
      fromStage: 'prospecting',
      toStage: 'won',
      changedById: '7',
      changedByName: '销售甲',
      changeNote: '客户确认价格与交期',
    });
  });

  it('requires a loss reason and blocks closing from the customer status field', async () => {
    const opportunity = await service.createOpportunity({
      customerId: 1,
      name: 'First order',
      nextStepAction: '确认首单产品规格',
      expectedCloseDate: '2026-09-30',
    });
    await expect(
      service.updateOpportunity(opportunity.id, { stage: 'lost' }),
    ).rejects.toThrow('必须填写输单原因');
    await expect(service.update(1, { journeyStage: 'lost' })).rejects.toThrow(
      '请在商机中填写输单原因',
    );
  });

  it('updates the current opportunity when the customer journey stage changes', async () => {
    const opportunity = await service.createOpportunity({
      customerId: 1,
      name: 'First order',
      nextStepAction: '确认首单产品规格',
      expectedCloseDate: '2026-09-30',
    });
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
    await service.createOpportunity({
      customerId: 1,
      name: 'First order',
      nextStepAction: '确认首单产品规格',
      expectedCloseDate: '2026-09-30',
    });
    await expect(
      service.update(1, { journeyStage: 'contacted' }),
    ).rejects.toThrow('该客户已有商机，请在商机看板调整阶段');
  });

  it('clears opportunity metrics and returns to qualified when the final opportunity is deleted', async () => {
    const opportunity = await service.createOpportunity({
      customerId: 1,
      name: 'First order',
      amount: 2500,
      nextStepAction: '确认首单产品规格',
      expectedCloseDate: '2026-09-30',
    });
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
    save: jest.fn(async (value) => ({
      ...value,
      createdAt: new Date('2026-08-09T01:00:00Z'),
    })),
  };
  const todoRepository = {
    create: jest.fn((value) => ({
      id: nextTodoId++,
      status: 'open',
      ...value,
    })),
    save: jest.fn(async (value) => {
      const index = todos.findIndex((todo) => todo.id === value.id);
      if (index >= 0) todos[index] = value;
      else todos.push(value);
      return value;
    }),
    find: jest.fn(async ({ where }: any) =>
      todos.filter(
        (todo) =>
          todo.customerId === where.customerId && todo.status === where.status,
      ),
    ),
    findOne: jest.fn(
      async ({ where }: any) =>
        todos.find((todo) => todo.id === where.id) || null,
    ),
    delete: jest.fn(async (id: number) => {
      const before = todos.length;
      todos = todos.filter((todo) => todo.id !== id);
      return { affected: before - todos.length };
    }),
  };
  const opportunityRepository = {
    find: jest.fn(async () => []),
  };
  const service = new CustomersService(
    customerRepository as any,
    {} as any,
    activityRepository as any,
    todoRepository as any,
    opportunityRepository as any,
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
    const future = await service.createTodo({
      customerId: 1,
      title: '发送报价',
      dueAt: '2099-01-02',
    });
    const overdue = await service.createTodo({
      customerId: 1,
      title: '确认询盘',
      dueAt: '2000-01-01',
    });

    expect(customer).toMatchObject({
      nextTodoTitle: '确认询盘',
      health: 'critical',
    });

    await service.updateTodo(overdue.id, { status: 'done' });
    expect(customer).toMatchObject({
      nextTodoTitle: '发送报价',
      health: 'warning',
    });
    expect(overdue.completedAt).toBeInstanceOf(Date);

    await service.updateTodo(overdue.id, { status: 'open' });
    expect(overdue.completedAt).toBeNull();
    expect(customer).toMatchObject({
      nextTodoTitle: '确认询盘',
      health: 'critical',
    });

    await service.updateTodo(overdue.id, { status: 'done' });
    await service.deleteTodo(future.id);
    expect(customer).toMatchObject({
      nextTodoAt: null,
      nextTodoTitle: '',
      health: 'good',
    });
  });
});

describe('CustomersService sample and customer 360 contracts', () => {
  const customer = {
    id: 1,
    customerId: 'cus_1',
    company: 'Buyer Co',
    ownerId: '7',
    tags: [],
  };
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
    find: jest.fn(async () => [
      {
        id: 8,
        logId: 'log_8',
        customerId: 'cus_1',
        customerName: 'Buyer Co',
        recipientEmail: 'buyer@example.com',
        subject: 'Quotation Q-001',
        status: 'sent',
        sentAt: new Date('2026-08-09T02:00:00Z'),
      },
    ]),
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

    expect(result.sendLogs).toEqual([
      expect.objectContaining({
        id: 'log_8',
        email: 'buyer@example.com',
        subject: 'Quotation Q-001',
        status: 'sent',
        createdAt: new Date('2026-08-09T02:00:00Z'),
      }),
    ]);
    expect(emailLogRepository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { customerId: 'cus_1' },
      }),
    );
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
      contacts
        .filter((item) => item.customerId === where.customerId)
        .forEach((item) => Object.assign(item, update));
      return { affected: contacts.length };
    }),
    findOne: jest.fn(async ({ where, order }: any) => {
      if (where.id)
        return contacts.find((item) => item.id === where.id) || null;
      let matches = contacts.filter(
        (item) => item.customerId === where.customerId,
      );
      if (where.isPrimary !== undefined)
        matches = matches.filter((item) => item.isPrimary === where.isPrimary);
      if (order?.createdAt === 'ASC')
        matches = [...matches].sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
        );
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
    customer = {
      id: 1,
      customerId: 'cus_1',
      company: 'Buyer Co',
      ownerId: '7',
      tags: [],
    };
  });

  it('keeps customer summary aligned when the primary contact changes or is deleted', async () => {
    const first = await service.createContact(
      1,
      {
        name: 'Anna',
        email: 'anna@example.com',
        phone: '+1 100',
        isPrimary: true,
      },
      '7',
    );
    const second = await service.createContact(
      1,
      {
        name: 'Ben',
        email: 'ben@example.com',
        phone: '+1 200',
      },
      '7',
    );
    expect(customer).toMatchObject({
      contact: 'Anna',
      email: 'anna@example.com',
      phone: '+1 100',
    });

    await service.updateContact(second.id, { isPrimary: true }, '7');
    expect(first.isPrimary).toBe(false);
    expect(customer).toMatchObject({
      contact: 'Ben',
      email: 'ben@example.com',
      phone: '+1 200',
    });

    await service.deleteContact(second.id, '7');
    expect(first.isPrimary).toBe(true);
    expect(customer).toMatchObject({
      contact: 'Anna',
      email: 'anna@example.com',
      phone: '+1 100',
    });
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
