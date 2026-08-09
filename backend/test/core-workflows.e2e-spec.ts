import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { ImportController } from '../src/modules/customers/customers.controller';
import { CustomersService } from '../src/modules/customers/customers.service';
import { LeadTasksController } from '../src/modules/leads/leads.controller';
import { LeadsService } from '../src/modules/leads/leads.service';
import { EmailTasksController } from '../src/modules/email/email.controller';
import { EmailService } from '../src/modules/email/email.service';

type StoredEntity = Record<string, any> & { id?: number };

function matchesWhere(
  entity: StoredEntity,
  where: Record<string, any> | Array<Record<string, any>> | undefined,
): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((candidate) => matchesWhere(entity, candidate));
  return Object.entries(where).every(([key, value]) => entity[key] === value);
}

class MemoryRepository<T extends StoredEntity> {
  items: T[] = [];
  private nextId = 1;

  reset(items: T[] = []) {
    this.items = items.map((item) => ({ ...item }));
    this.nextId = Math.max(0, ...this.items.map((item) => Number(item.id || 0))) + 1;
  }

  create(data: Partial<T>): T {
    return { ...data } as T;
  }

  async save(entity: T): Promise<T> {
    if (!entity.id) entity.id = this.nextId++;
    const index = this.items.findIndex((item) => item.id === entity.id);
    if (index >= 0) this.items[index] = entity;
    else this.items.push(entity);
    return entity;
  }

  async find(options?: { where?: Record<string, any> | Array<Record<string, any>> }): Promise<T[]> {
    return this.items.filter((item) => matchesWhere(item, options?.where));
  }

  async findOne(options: { where: Record<string, any> | Array<Record<string, any>> }): Promise<T | null> {
    return this.items.find((item) => matchesWhere(item, options.where)) || null;
  }

  async count(options?: { where?: Record<string, any> | Array<Record<string, any>> }) {
    return (await this.find(options)).length;
  }

  async delete(criteria: number | Record<string, any>) {
    const before = this.items.length;
    this.items = this.items.filter((item) => (
      typeof criteria === 'number' ? item.id !== criteria : !matchesWhere(item, criteria)
    ));
    return { affected: before - this.items.length };
  }
}

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.user = {
      sub: Number(request.headers['x-test-user-id'] || 7),
      username: 'e2e-user',
      role: request.headers['x-test-role'] || 'sales',
    };
    return true;
  }
}

describe('core CRM workflows (HTTP e2e)', () => {
  let app: INestApplication;
  let baseUrl: string;
  let customersService: CustomersService;
  let leadsService: LeadsService;
  let emailService: EmailService;

  const customerRepository = new MemoryRepository<any>();
  const contactRepository = new MemoryRepository<any>();
  const leadRepository = new MemoryRepository<any>();
  const leadTaskRepository = new MemoryRepository<any>();
  const templateRepository = new MemoryRepository<any>();
  const emailTaskRepository = new MemoryRepository<any>();
  const emailLogRepository = new MemoryRepository<any>();
  const recipientRepository = new MemoryRepository<any>();

  beforeAll(async () => {
    const unusedRepository = () => new MemoryRepository<any>() as any;
    customersService = new CustomersService(
      customerRepository as any,
      contactRepository as any,
      unusedRepository(),
      unusedRepository(),
      unusedRepository(),
      unusedRepository(),
      unusedRepository(),
      unusedRepository(),
      unusedRepository(),
      emailLogRepository as any,
    );
    leadsService = new LeadsService(
      leadRepository as any,
      leadTaskRepository as any,
      { associateProduct: jest.fn() } as any,
      customersService,
    );
    jest.spyOn(leadsService as any, 'processTaskAsync').mockResolvedValue(undefined);

    emailService = new EmailService(
      templateRepository as any,
      emailTaskRepository as any,
      emailLogRepository as any,
      recipientRepository as any,
      customersService,
      {} as any,
      {} as any,
    );
    jest.spyOn(emailService, 'onModuleInit').mockImplementation(() => undefined);
    jest.spyOn(emailService as any, 'processTask').mockResolvedValue(undefined);

    const moduleRef = await Test.createTestingModule({
      controllers: [ImportController, LeadTasksController, EmailTasksController],
      providers: [
        { provide: CustomersService, useValue: customersService },
        { provide: LeadsService, useValue: leadsService },
        { provide: EmailService, useValue: emailService },
        { provide: APP_GUARD, useClass: TestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }));
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => app.close());
  beforeEach(() => {
    customerRepository.reset();
    contactRepository.reset();
    leadRepository.reset();
    leadTaskRepository.reset();
    templateRepository.reset();
    emailTaskRepository.reset();
    emailLogRepository.reset();
    recipientRepository.reset();
    jest.clearAllMocks();
  });

  it('parses and imports a customer CSV through multipart HTTP with salesperson ownership', async () => {
    const form = new FormData();
    form.append('file', new Blob(['company,email\nAcme,buyer@acme.test'], { type: 'text/csv' }), 'customers.csv');

    const response = await fetch(`${baseUrl}/api/import`, {
      method: 'POST',
      headers: { 'x-test-role': 'sales', 'x-test-user-id': '7' },
      body: form,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ created: 1, updated: 0, skipped: 0, total: 1 });
    expect(customerRepository.items).toEqual([
      expect.objectContaining({ company: 'Acme', email: 'buyer@acme.test', ownerId: '7' }),
    ]);
  });

  it('blocks a viewer before the customer import service mutates data', async () => {
    const form = new FormData();
    form.append('file', new Blob(['company,email\nAcme,buyer@acme.test'], { type: 'text/csv' }), 'customers.csv');
    const response = await fetch(`${baseUrl}/api/import`, {
      method: 'POST',
      headers: { 'x-test-role': 'viewer' },
      body: form,
    });
    expect(response.status).toBe(403);
    expect(customerRepository.items).toHaveLength(0);
  });

  it('creates and starts a real automated lead task with owner isolation', async () => {
    const createResponse = await fetch(`${baseUrl}/api/lead-tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': 'sales', 'x-test-user-id': '7' },
      body: JSON.stringify({
        name: 'Germany flange buyers',
        productName: 'Weld neck flange',
        targetCountries: ['Germany'],
        targetCount: 20,
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.task).toMatchObject({ id: 1, ownerId: '7', status: 'draft', targetCount: 20 });
    expect(created.queries).toContain('"Weld neck flange" "importer" "Germany" "contact us" -wikipedia -news -jobs -pdf');

    const forbiddenRun = await fetch(`${baseUrl}/api/lead-tasks/1/run`, {
      method: 'POST',
      headers: { 'x-test-role': 'sales', 'x-test-user-id': '8' },
    });
    expect(forbiddenRun.status).toBe(404);

    const runResponse = await fetch(`${baseUrl}/api/lead-tasks/1/run`, {
      method: 'POST',
      headers: { 'x-test-role': 'sales', 'x-test-user-id': '7' },
    });
    expect(runResponse.status).toBe(201);
    await expect(runResponse.json()).resolves.toEqual({ started: true });
    expect(leadTaskRepository.items[0]).toMatchObject({ ownerId: '7', status: 'running', cancelRequested: false });
    expect(leadTaskRepository.items[0].automationProgress).toMatchObject({ stage: 'starting' });
  });

  it('creates a real email task, expands recipients, and starts it with owner isolation', async () => {
    templateRepository.reset([{ id: 9, templateId: 'tmpl_9', name: 'Intro', subject: 'Hello', body: 'Hi {{company}}', images: [] }]);
    customerRepository.reset([
      { id: 101, customerId: 'cus_101', company: 'Acme', contact: 'Amy', email: 'amy@acme.test', timezone: 'UTC', ownerId: '7' },
      { id: 102, customerId: 'cus_102', company: 'Beta', contact: 'Bob', email: 'bob@beta.test', timezone: 'UTC', ownerId: '7' },
    ]);

    const createResponse = await fetch(`${baseUrl}/api/email-tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-test-role': 'sales', 'x-test-user-id': '7' },
      body: JSON.stringify({
        name: 'First outreach',
        templateId: '9',
        customerIds: ['101', '102'],
        batchSize: 20,
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({ id: 1, ownerId: '7', status: 'pending', customerIds: ['101', '102'] });

    const forbiddenRun = await fetch(`${baseUrl}/api/email-tasks/${created.emailTaskId}/run`, {
      method: 'POST',
      headers: { 'x-test-role': 'sales', 'x-test-user-id': '8' },
    });
    expect(forbiddenRun.status).toBe(404);

    const runResponse = await fetch(`${baseUrl}/api/email-tasks/${created.emailTaskId}/run`, {
      method: 'POST',
      headers: { 'x-test-role': 'sales', 'x-test-user-id': '7' },
    });
    expect(runResponse.status).toBe(200);
    await expect(runResponse.json()).resolves.toMatchObject({ status: 'active', ownerId: '7' });
    expect(recipientRepository.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ taskId: 1, email: 'amy@acme.test', status: 'queued' }),
      expect.objectContaining({ taskId: 1, email: 'bob@beta.test', status: 'queued' }),
    ]));
    expect(emailTaskRepository.items[0]).toMatchObject({ status: 'active', ownerId: '7' });
  });
});
