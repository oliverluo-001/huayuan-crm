import { BadRequestException } from '@nestjs/common';
import { AuditEntry } from '../audit/entities/audit.entity';
import { CustomerAttachment } from '../attachments/customer-attachment.entity';
import { EmailLog, EmailTask, EmailTaskRecipient } from '../email/entities';
import { Lead } from '../leads/entities';
import { CustomerDuplicatesService } from './customer-duplicates.service';
import {
  Activity,
  Contact,
  Customer,
  CustomerMergeHistory,
  Opportunity,
  Quote,
  Sample,
  Todo,
} from './entities';

const date = new Date('2026-08-10T08:00:00.000Z');

function customer(data: Partial<Customer> & Pick<Customer, 'id' | 'customerId' | 'company'>): Customer {
  return {
    contact: '',
    email: '',
    phone: '',
    website: '',
    region: '',
    country: '',
    address: '',
    business: '',
    product: '',
    customerType: '',
    mainMarkets: [],
    annualPurchaseAmount: 0,
    preferredCurrency: 'USD',
    preferredIncoterm: '',
    tier: '',
    journeyStage: 'new',
    notes: '',
    timezone: '',
    emailStatus: 'unknown',
    emailFailureReason: '',
    emailFailedAt: null as any,
    source: '',
    sourceHistory: [],
    ownerId: '7',
    collaboratorIds: [],
    mergedIntoId: null,
    mergedAt: null,
    health: '',
    lastActivityAt: null as any,
    lastActivityType: '',
    nextTodoAt: null as any,
    nextTodoTitle: '',
    openOpportunityCount: 0,
    openOpportunityValue: 0,
    tags: [],
    deletedAt: null as any,
    createdAt: date,
    updatedAt: date,
    toJSON: jest.fn(),
    ...data,
  } as Customer;
}

function repository(extra: Record<string, any> = {}) {
  return {
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn(async (value) => value),
    create: jest.fn((value) => value),
    update: jest.fn().mockResolvedValue({ affected: 0 }),
    softDelete: jest.fn().mockResolvedValue({ affected: 0 }),
    ...extra,
  };
}

function setup(customers: Customer[] = []) {
  const dataSource = { transaction: jest.fn() };
  const customersService = {
    findAll: jest.fn().mockResolvedValue({ customers, total: customers.length }),
    assertCustomerOwner: jest.fn(async (id: number) => customers.find((item) => item.id === id)),
  };
  const customerRepository = repository({ find: jest.fn().mockResolvedValue(customers) });
  const contactRepository = repository();
  const activityRepository = repository();
  const todoRepository = repository();
  const opportunityRepository = repository();
  const quoteRepository = repository();
  const sampleRepository = repository();
  const emailLogRepository = repository();
  const attachmentRepository = repository();
  const emailRecipientRepository = repository();
  const leadRepository = repository();
  const historyRepository = repository();
  const service = new CustomerDuplicatesService(
    dataSource as any,
    customersService as any,
    customerRepository as any,
    contactRepository as any,
    activityRepository as any,
    todoRepository as any,
    opportunityRepository as any,
    quoteRepository as any,
    sampleRepository as any,
    emailLogRepository as any,
    attachmentRepository as any,
    emailRecipientRepository as any,
    leadRepository as any,
    historyRepository as any,
  );
  return {
    service,
    dataSource,
    customersService,
    repositories: {
      customerRepository,
      contactRepository,
      activityRepository,
      todoRepository,
      opportunityRepository,
      quoteRepository,
      sampleRepository,
      emailLogRepository,
      attachmentRepository,
      emailRecipientRepository,
      leadRepository,
      historyRepository,
    },
  };
}

describe('CustomerDuplicatesService', () => {
  it('detects normalized email, corporate domain, phone and company matches without grouping public mailbox domains', async () => {
    const customers = [
      customer({ id: 1, customerId: 'CUS-1', company: 'Acme Co., Ltd.', email: ' SALES@ACME.COM ', phone: '+66 (0) 2123-4567' }),
      customer({ id: 2, customerId: 'CUS-2', company: 'ACME Company Limited', email: 'sales@acme.com', phone: '0066021234567' }),
      customer({ id: 3, customerId: 'CUS-3', company: 'First Buyer', email: 'one@gmail.com' }),
      customer({ id: 4, customerId: 'CUS-4', company: 'Second Buyer', email: 'two@gmail.com' }),
    ];
    const { service } = setup(customers);

    const result = await service.findDuplicateGroups({ userId: '1', username: 'admin', role: 'admin' });

    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].members.map((item) => item.id)).toEqual([1, 2]);
    expect(result.groups[0].matches.map((item) => item.type)).toEqual(
      expect.arrayContaining(['email', 'domain', 'phone', 'company']),
    );
    expect(result.groups[0].matches).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'domain', value: 'gmail.com' })]),
    );
  });

  it('builds a field-by-field preview and blocks sales from merging another owner records', async () => {
    const customers = [
      customer({ id: 1, customerId: 'CUS-1', company: 'Acme Ltd', email: 'owner@acme.test', source: 'exhibition', ownerId: '7' }),
      customer({ id: 2, customerId: 'CUS-2', company: 'Acme Company Limited', email: 'sales@acme.test', source: 'website', ownerId: '8', collaboratorIds: ['7'] }),
    ];
    const { service } = setup(customers);

    const preview = await service.previewMerge(
      { primaryCustomerId: 1, duplicateCustomerIds: [2] },
      { userId: '7', username: 'sales7', role: 'sales' },
    );

    expect(preview.mergeAllowed).toBe(false);
    expect(preview.fields.find((field) => field.key === 'source')?.conflict).toBe(true);
    expect(preview.warnings.join(' ')).toContain('只有管理员');
    expect(preview.previewToken).toMatch(/^[a-f0-9]{64}$/);
  });

  it('requires explicit acknowledgement before replacing a non-empty primary field', async () => {
    const customers = [
      customer({ id: 1, customerId: 'CUS-1', company: 'Acme Ltd', email: 'primary@acme.test', source: 'exhibition' }),
      customer({ id: 2, customerId: 'CUS-2', company: 'Acme Company Limited', email: 'source@acme.test', source: 'website' }),
    ];
    const { service, dataSource } = setup(customers);
    const actor = { userId: '7', username: 'sales7', role: 'sales' as const };
    const preview = await service.previewMerge({ primaryCustomerId: 1, duplicateCustomerIds: [2] }, actor);

    await expect(service.merge({
      primaryCustomerId: 1,
      duplicateCustomerIds: [2],
      previewToken: preview.previewToken,
      fieldSelections: { ...preview.defaultFieldSelections, source: 2 },
      primaryContactSelection: preview.defaultPrimaryContactSelection,
      acknowledgeConflicts: false,
    }, actor)).rejects.toThrow(BadRequestException);
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('moves related records in one transaction and writes merge history plus audit details', async () => {
    const customers = [
      customer({ id: 1, customerId: 'CUS-1', company: 'Acme Ltd', email: 'primary@acme.test', source: 'exhibition' }),
      customer({ id: 2, customerId: 'CUS-2', company: 'Acme Company Limited', email: 'source@acme.test', source: 'website' }),
    ];
    const { service, dataSource } = setup(customers);
    const actor = { userId: '7', username: 'sales7', role: 'sales' as const };
    const preview = await service.previewMerge({ primaryCustomerId: 1, duplicateCustomerIds: [2] }, actor);

    const lockQb = {
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue(customers),
    };
    const txCustomerRepository = repository({
      createQueryBuilder: jest.fn(() => lockQb),
      find: jest.fn().mockResolvedValue(customers),
      findOne: jest.fn(async () => customers[0]),
      softDelete: jest.fn().mockResolvedValue({ affected: 1 }),
    });
    const txContactRepository = repository();
    const txActivityRepository = repository();
    const txTodoRepository = repository();
    const txOpportunityRepository = repository();
    const taskQb = {
      where: jest.fn().mockReturnThis(),
      orWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const txEmailTaskRepository = repository({ createQueryBuilder: jest.fn(() => taskQb) });
    const historyRepository = repository();
    const auditRepository = repository();
    const manager = {
      getRepository: jest.fn((entity) => {
        if (entity === Customer) return txCustomerRepository;
        if (entity === Contact) return txContactRepository;
        if (entity === Activity) return txActivityRepository;
        if (entity === Todo) return txTodoRepository;
        if (entity === Opportunity) return txOpportunityRepository;
        if (entity === EmailTask) return txEmailTaskRepository;
        if (entity === CustomerMergeHistory) return historyRepository;
        if (entity === AuditEntry) return auditRepository;
        return repository();
      }),
      update: jest.fn(async (entity) => ({ affected: entity === Activity ? 2 : entity === Opportunity ? 1 : entity === Quote ? 1 : entity === EmailLog ? 3 : entity === CustomerAttachment ? 1 : entity === EmailTaskRecipient ? 1 : entity === Lead ? 1 : entity === Sample ? 1 : entity === Todo ? 1 : 0 })),
    };
    dataSource.transaction.mockImplementation(async (callback: any) => callback(manager));

    const result = await service.merge({
      primaryCustomerId: 1,
      duplicateCustomerIds: [2],
      previewToken: preview.previewToken,
      fieldSelections: preview.defaultFieldSelections,
      primaryContactSelection: 'summary:2',
      acknowledgeConflicts: true,
    }, actor);

    expect(result.mergedCustomerIds).toEqual(['CUS-2']);
    expect(result.movedRelations).toEqual(expect.objectContaining({ activities: 2, opportunities: 1, quotes: 1, emailLogs: 3 }));
    expect(customers[1].mergedIntoId).toBe(1);
    expect(customers[1].email).toContain('@invalid.local');
    expect(customers[0].sourceHistory).toEqual(expect.arrayContaining([expect.objectContaining({ customerId: 'CUS-2', source: 'website' })]));
    expect(txContactRepository.save).toHaveBeenCalledWith(expect.objectContaining({ email: 'source@acme.test', isPrimary: true }));
    expect(historyRepository.save).toHaveBeenCalledWith(expect.objectContaining({ primaryCustomerKey: 'CUS-1', mergedCustomerKeys: ['CUS-2'], primaryContactSelection: 'summary:2' }));
    expect(auditRepository.save).toHaveBeenCalledWith(expect.objectContaining({ action: 'MERGE_CUSTOMERS', username: 'sales7' }));
    expect(txCustomerRepository.softDelete).toHaveBeenCalled();
  });
});
