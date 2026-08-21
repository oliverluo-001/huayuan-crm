import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  Injectable,
  ValidationPipe,
} from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { Test } from "@nestjs/testing";
import { RolesGuard } from "../src/common/guards/roles.guard";
import {
  CustomersController,
  ContactsController,
  ImportController,
  OpportunitiesController,
  QuotesController,
  SamplesController,
} from "../src/modules/customers/customers.controller";
import { CustomersService } from "../src/modules/customers/customers.service";
import { QuoteOutputService } from "../src/modules/customers/quote-output.service";
import { CustomerAttachmentsController } from "../src/modules/attachments/customer-attachments.controller";
import { CustomerAttachmentsService } from "../src/modules/attachments/customer-attachments.service";
import { ProductsController } from "../src/modules/products/products.controller";
import { ProductsService } from "../src/modules/products/products.service";
import { LeadTasksController } from "../src/modules/leads/leads.controller";
import { LeadsService } from "../src/modules/leads/leads.service";
import { EmailTasksController } from "../src/modules/email/email.controller";
import { EmailService } from "../src/modules/email/email.service";

type StoredEntity = Record<string, any> & { id?: number };

function matchesValue(actual: any, expected: any): boolean {
  if (expected && typeof expected === "object" && "_type" in expected) {
    const type = expected._type;
    const value = expected._value;
    if (type === "in") return value.includes(actual);
    if (type === "like") {
      const pattern = String(value)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/%/g, ".*")
        .replace(/_/g, ".");
      return new RegExp(`^${pattern}$`, "i").test(String(actual ?? ""));
    }
    if (type === "not") return !matchesValue(actual, value);
    if (type === "isNull") return actual === null || actual === undefined;
  }
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    return matchesWhere(actual || {}, expected);
  }
  return actual === expected;
}

function matchesWhere(
  entity: StoredEntity,
  where: Record<string, any> | Array<Record<string, any>> | undefined,
): boolean {
  if (!where) return true;
  if (Array.isArray(where))
    return where.some((candidate) => matchesWhere(entity, candidate));
  return Object.entries(where).every(([key, value]) =>
    matchesValue(entity[key], value),
  );
}

class MemoryRepository<T extends StoredEntity> {
  items: T[] = [];
  private nextId = 1;

  constructor(private readonly defaults: Partial<T> = {}) {}

  reset(items: T[] = []) {
    this.items = items.map((item) => ({ ...this.defaults, ...item }));
    this.nextId =
      Math.max(0, ...this.items.map((item) => Number(item.id || 0))) + 1;
  }

  create(data: Partial<T>): T {
    return { ...this.defaults, ...data } as T;
  }

  async save(entity: T): Promise<T> {
    if (!entity.id) entity.id = this.nextId++;
    const index = this.items.findIndex((item) => item.id === entity.id);
    if (index >= 0) this.items[index] = entity;
    else this.items.push(entity);
    return entity;
  }

  async find(options?: {
    where?: Record<string, any> | Array<Record<string, any>>;
    order?: Record<string, "ASC" | "DESC">;
    skip?: number;
    take?: number;
  }): Promise<T[]> {
    let result = this.items.filter((item) =>
      matchesWhere(item, options?.where),
    );
    if (options?.order) {
      const entries = Object.entries(options.order);
      result = [...result].sort((left, right) => {
        for (const [key, direction] of entries) {
          const a = left[key] instanceof Date ? left[key].getTime() : left[key];
          const b =
            right[key] instanceof Date ? right[key].getTime() : right[key];
          if (a === b) continue;
          const comparison =
            a === undefined ? -1 : b === undefined ? 1 : a < b ? -1 : 1;
          return direction === "DESC" ? -comparison : comparison;
        }
        return 0;
      });
    }
    const start = options?.skip || 0;
    return options?.take
      ? result.slice(start, start + options.take)
      : result.slice(start);
  }

  async findOne(options: {
    where: Record<string, any> | Array<Record<string, any>>;
  }): Promise<T | null> {
    return this.items.find((item) => matchesWhere(item, options.where)) || null;
  }

  async count(options?: {
    where?: Record<string, any> | Array<Record<string, any>>;
  }) {
    return (await this.find(options)).length;
  }

  async findAndCount(options?: Parameters<MemoryRepository<T>["find"]>[0]) {
    const all = this.items.filter((item) => matchesWhere(item, options?.where));
    return [await this.find(options), all.length] as const;
  }

  async update(criteria: Record<string, any>, update: Partial<T>) {
    let affected = 0;
    this.items.forEach((item) => {
      if (matchesWhere(item, criteria)) {
        Object.assign(item, update);
        affected += 1;
      }
    });
    return { affected };
  }

  async delete(criteria: number | Record<string, any>) {
    const before = this.items.length;
    this.items = this.items.filter((item) =>
      typeof criteria === "number"
        ? item.id !== criteria
        : !matchesWhere(item, criteria),
    );
    return { affected: before - this.items.length };
  }
}

@Injectable()
class TestAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.user = {
      sub: Number(request.headers["x-test-user-id"] || 7),
      username: "e2e-user",
      role: request.headers["x-test-role"] || "sales",
    };
    return true;
  }
}

describe("core CRM workflows (HTTP e2e)", () => {
  let app: INestApplication;
  let baseUrl: string;
  let customersService: CustomersService;
  let productsService: ProductsService;
  let leadsService: LeadsService;
  let emailService: EmailService;
  let attachmentsService: CustomerAttachmentsService;
  let attachmentRoot: string;
  const quoteOutputService = {
    renderHtml: jest.fn((quote: any, customer: any) =>
      Promise.resolve(
        `<html><body>${customer.company}${(quote.items || [])
          .map((item: any) => item.productName)
          .join("")}</body></html>`,
      ),
    ),
    createPdfBuffer: jest.fn().mockResolvedValue(Buffer.from("%PDF")),
    createExcelBuffer: jest.fn().mockResolvedValue(Buffer.from("xlsx")),
    createQuotePackage: jest.fn().mockResolvedValue({
      buffer: Buffer.from("PK"),
      fileName: "quotation.zip",
    }),
    quoteFileBase: jest.fn((_quote: any, extension?: string) =>
      extension ? `quotation.${extension}` : "quotation",
    ),
  };

  const customerRepository = new MemoryRepository<any>();
  const contactRepository = new MemoryRepository<any>();
  const activityRepository = new MemoryRepository<any>({ type: "note" });
  const todoRepository = new MemoryRepository<any>({ status: "open" });
  const opportunityRepository = new MemoryRepository<any>();
  const quoteRepository = new MemoryRepository<any>({
    status: "draft",
    currency: "USD",
  });
  const sampleRepository = new MemoryRepository<any>();
  const productRepository = new MemoryRepository<any>();
  const productVariantRepository = new MemoryRepository<any>();
  const productAssetRepository = new MemoryRepository<any>();
  const tagRepository = new MemoryRepository<any>();
  const customerViewRepository = new MemoryRepository<any>();
  const leadRepository = new MemoryRepository<any>();
  const leadTaskRepository = new MemoryRepository<any>();
  const templateRepository = new MemoryRepository<any>();
  const emailTaskRepository = new MemoryRepository<any>();
  const emailLogRepository = new MemoryRepository<any>();
  const recipientRepository = new MemoryRepository<any>();
  const attachmentRepository = new MemoryRepository<any>();

  beforeAll(async () => {
    customersService = new CustomersService(
      customerRepository as any,
      contactRepository as any,
      activityRepository as any,
      todoRepository as any,
      opportunityRepository as any,
      quoteRepository as any,
      sampleRepository as any,
      tagRepository as any,
      customerViewRepository as any,
      emailLogRepository as any,
    );
    productsService = new ProductsService(
      productRepository as any,
      productVariantRepository as any,
      productAssetRepository as any,
      { get: jest.fn() } as any,
    );
    leadsService = new LeadsService(
      leadRepository as any,
      leadTaskRepository as any,
      { associateProduct: jest.fn() } as any,
      customersService,
    );
    jest
      .spyOn(leadsService as any, "processTaskAsync")
      .mockResolvedValue(undefined);

    emailService = new EmailService(
      templateRepository as any,
      emailTaskRepository as any,
      emailLogRepository as any,
      recipientRepository as any,
      customersService,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(emailService, "onModuleInit")
      .mockImplementation(() => undefined);
    jest.spyOn(emailService as any, "processTask").mockResolvedValue(undefined);
    attachmentRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "huayuan-e2e-attachments-"),
    );
    attachmentsService = new CustomerAttachmentsService(
      attachmentRepository as any,
      customersService,
      {
        get: jest.fn((key: string) =>
          key === "CUSTOMER_ATTACHMENT_DIR" ? attachmentRoot : undefined,
        ),
      } as unknown as ConfigService,
    );

    const moduleRef = await Test.createTestingModule({
      controllers: [
        CustomersController,
        ContactsController,
        CustomerAttachmentsController,
        ImportController,
        OpportunitiesController,
        QuotesController,
        SamplesController,
        ProductsController,
        LeadTasksController,
        EmailTasksController,
      ],
      providers: [
        { provide: CustomersService, useValue: customersService },
        { provide: ProductsService, useValue: productsService },
        { provide: LeadsService, useValue: leadsService },
        { provide: EmailService, useValue: emailService },
        { provide: CustomerAttachmentsService, useValue: attachmentsService },
        { provide: QuoteOutputService, useValue: quoteOutputService },
        { provide: APP_GUARD, useClass: TestAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix("api");
    await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await app?.close();
    await fs.rm(attachmentRoot, { recursive: true, force: true });
  });
  beforeEach(() => {
    customerRepository.reset();
    contactRepository.reset();
    activityRepository.reset();
    todoRepository.reset();
    opportunityRepository.reset();
    quoteRepository.reset();
    sampleRepository.reset();
    productRepository.reset();
    tagRepository.reset();
    customerViewRepository.reset();
    leadRepository.reset();
    leadTaskRepository.reset();
    templateRepository.reset();
    emailTaskRepository.reset();
    emailLogRepository.reset();
    recipientRepository.reset();
    attachmentRepository.reset();
    jest.clearAllMocks();
  });

  it("parses and imports a customer CSV through multipart HTTP with salesperson ownership", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob(["company,email\nAcme,buyer@acme.test"], { type: "text/csv" }),
      "customers.csv",
    );

    const response = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "x-test-role": "sales", "x-test-user-id": "7" },
      body: form,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      created: 1,
      updated: 0,
      skipped: 0,
      total: 1,
    });
    expect(customerRepository.items).toEqual([
      expect.objectContaining({
        company: "Acme",
        email: "buyer@acme.test",
        ownerId: "7",
      }),
    ]);
  });

  it("blocks a viewer before the customer import service mutates data", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob(["company,email\nAcme,buyer@acme.test"], { type: "text/csv" }),
      "customers.csv",
    );
    const response = await fetch(`${baseUrl}/api/import`, {
      method: "POST",
      headers: { "x-test-role": "viewer" },
      body: form,
    });
    expect(response.status).toBe(403);
    expect(customerRepository.items).toHaveLength(0);
  });

  it("creates and starts a real automated lead task with owner isolation", async () => {
    const createResponse = await fetch(`${baseUrl}/api/lead-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-role": "sales",
        "x-test-user-id": "7",
      },
      body: JSON.stringify({
        name: "Germany flange buyers",
        productName: "Weld neck flange",
        targetCountries: ["Germany"],
        targetCount: 20,
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created.task).toMatchObject({
      id: 1,
      ownerId: "7",
      status: "draft",
      targetCount: 20,
    });
    expect(created.queries).toEqual(expect.arrayContaining([
      expect.stringContaining('"Weld neck flange" "importer" "Germany"'),
      expect.stringContaining('procurement OR purchasing OR RFQ'),
    ]));

    const forbiddenRun = await fetch(`${baseUrl}/api/lead-tasks/1/run`, {
      method: "POST",
      headers: { "x-test-role": "sales", "x-test-user-id": "8" },
    });
    expect(forbiddenRun.status).toBe(404);

    const runResponse = await fetch(`${baseUrl}/api/lead-tasks/1/run`, {
      method: "POST",
      headers: { "x-test-role": "sales", "x-test-user-id": "7" },
    });
    expect(runResponse.status).toBe(201);
    await expect(runResponse.json()).resolves.toEqual({ started: true });
    expect(leadTaskRepository.items[0]).toMatchObject({
      ownerId: "7",
      status: "running",
      cancelRequested: false,
    });
    expect(leadTaskRepository.items[0].automationProgress).toMatchObject({
      stage: "starting",
    });
  });

  it("creates a real email task, expands recipients, and starts it with owner isolation", async () => {
    templateRepository.reset([
      {
        id: 9,
        templateId: "tmpl_9",
        name: "Intro",
        subject: "Hello",
        body: "Hi {{company}}",
        images: [],
      },
    ]);
    customerRepository.reset([
      {
        id: 101,
        customerId: "cus_101",
        company: "Acme",
        contact: "Amy",
        email: "amy@acme.test",
        timezone: "UTC",
        ownerId: "7",
      },
      {
        id: 102,
        customerId: "cus_102",
        company: "Beta",
        contact: "Bob",
        email: "bob@beta.test",
        timezone: "UTC",
        ownerId: "7",
      },
    ]);

    const createResponse = await fetch(`${baseUrl}/api/email-tasks`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-test-role": "sales",
        "x-test-user-id": "7",
      },
      body: JSON.stringify({
        name: "First outreach",
        templateId: "tmpl_9",
        customerIds: ["101", "102"],
        batchSize: 20,
      }),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();
    expect(created).toMatchObject({
      id: 1,
      ownerId: "7",
      status: "pending",
      templateId: "tmpl_9",
      customerIds: ["101", "102"],
    });

    const forbiddenRun = await fetch(
      `${baseUrl}/api/email-tasks/${created.emailTaskId}/run`,
      {
        method: "POST",
        headers: { "x-test-role": "sales", "x-test-user-id": "8" },
      },
    );
    expect(forbiddenRun.status).toBe(404);

    const runResponse = await fetch(
      `${baseUrl}/api/email-tasks/${created.emailTaskId}/run`,
      {
        method: "POST",
        headers: { "x-test-role": "sales", "x-test-user-id": "7" },
      },
    );
    expect(runResponse.status).toBe(200);
    await expect(runResponse.json()).resolves.toMatchObject({
      status: "active",
      ownerId: "7",
    });
    expect(recipientRepository.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId: 1,
          email: "amy@acme.test",
          status: "queued",
        }),
        expect.objectContaining({
          taskId: 1,
          email: "bob@beta.test",
          status: "queued",
        }),
      ]),
    );
    expect(emailTaskRepository.items[0]).toMatchObject({
      status: "active",
      ownerId: "7",
    });
  });

  it("creates and fully updates products, samples, opportunities, and multi-line quotes", async () => {
    customerRepository.reset([
      {
        id: 1,
        customerId: "cus_1",
        company: "Acme Flow Control",
        ownerId: "7",
      },
    ]);
    const headers = {
      "content-type": "application/json",
      "x-test-role": "sales",
      "x-test-user-id": "7",
    };

    const productResponse = await fetch(`${baseUrl}/api/products`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        sku: "WN-DN50",
        code: "WN-DN50",
        name: "Weld neck flange DN50",
        category: "Flange",
        productType: "flange",
        unit: "pcs",
        baseCost: 18,
        costCurrency: "USD",
        prices: [{ currency: "USD", referencePrice: 25 }, { currency: "EUR", referencePrice: 23 }],
        standards: ["EN 1092-1"],
        materials: ["ASTM A105"],
        descriptionTemplates: [{ name: "Standard export", content: "EN 1092-1, ASTM A105, EN 10204 3.1" }],
        variants: [{
          sku: "WN-DN50-PN16",
          standard: "EN 1092-1",
          material: "ASTM A105",
          pressureRating: "PN16",
          nominalSize: "DN50",
          facing: "RF",
          prices: [{ currency: "USD", referencePrice: 25 }],
          certificateRequirements: "EN 10204 3.1",
        }],
      }),
    });
    expect(productResponse.status).toBe(201);
    const product = await productResponse.json();
    expect(product.variants).toEqual(expect.arrayContaining([
      expect.objectContaining({ sku: "WN-DN50-PN16", quoteDescription: expect.stringContaining("EN 1092-1") }),
    ]));
    const productUpdateResponse = await fetch(
      `${baseUrl}/api/products/${product.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          code: "WN-DN50-PN16",
          name: "Weld neck flange DN50 PN16",
          category: "Forged flange",
          unit: "piece",
          price: 27.5,
          currency: "EUR",
          description: "EN 1092-1",
        }),
      },
    );
    expect(productUpdateResponse.status).toBe(200);
    await expect(productUpdateResponse.json()).resolves.toMatchObject({
      id: product.id,
      name: "Weld neck flange DN50 PN16",
      price: 27.5,
      currency: "EUR",
      description: "EN 1092-1",
    });

    const opportunityResponse = await fetch(`${baseUrl}/api/opportunities`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customerId: 1,
        name: "Acme annual order",
        amount: 10000,
        stage: "qualification",
        productName: "Weld neck flange",
        productSpecification: "ASTM A105, DN50, PN16",
        expectedQuantity: 500,
        quantityUnit: "pcs",
        targetPrice: 25,
        currency: "USD",
        budget: 15000,
        purchaseTime: "2026 Q4",
        decisionProcess: "Engineering approval, then purchasing director",
        nextStepAction: "Confirm drawing and material certificate",
        nextStepDueDate: "2026-08-20",
        expectedCloseDate: "2026-09-30",
        forecastCategory: "best_case",
        competitors: "Competitor A",
      }),
    });
    expect(opportunityResponse.status).toBe(201);
    const opportunity = await opportunityResponse.json();
    const opportunityUpdateResponse = await fetch(
      `${baseUrl}/api/opportunities/${opportunity.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          customerId: 1,
          name: "Acme 2026 annual order",
          amount: 12800,
          stage: "proposal",
          expectedCloseDate: "2026-09-30",
          description: "Two flange specifications",
        }),
      },
    );
    expect(opportunityUpdateResponse.status).toBe(200);
    await expect(opportunityUpdateResponse.json()).resolves.toMatchObject({
      name: "Acme 2026 annual order",
      amount: 12800,
      stage: "proposal",
      probability: 60,
      description: "Two flange specifications",
      productName: "Weld neck flange",
      productSpecification: "ASTM A105, DN50, PN16",
      expectedQuantity: 500,
      targetPrice: 25,
      budget: 15000,
      purchaseTime: "2026 Q4",
      decisionProcess: "Engineering approval, then purchasing director",
      nextStepAction: "Confirm drawing and material certificate",
      forecastCategory: "best_case",
      competitors: "Competitor A",
    });

    const sampleResponse = await fetch(`${baseUrl}/api/samples`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customerId: 1,
        opportunityId: opportunity.opportunityId,
        productId: product.productId,
        productName: product.name,
        quantity: 2,
        unit: "pcs",
        status: "pending",
      }),
    });
    expect(sampleResponse.status).toBe(201);
    const sample = await sampleResponse.json();
    const sampleUpdateResponse = await fetch(
      `${baseUrl}/api/samples/${sample.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          customerId: 1,
          opportunityId: null,
          productId: product.productId,
          productName: "Weld neck flange sample PN16",
          quantity: 3,
          unit: "piece",
          status: "sent",
          sentAt: "2026-08-09",
          trackingNo: "DHL-20260809",
          notes: "Material certificate included",
        }),
      },
    );
    expect(sampleUpdateResponse.status).toBe(200);
    await expect(sampleUpdateResponse.json()).resolves.toMatchObject({
      opportunityId: null,
      productName: "Weld neck flange sample PN16",
      quantity: 3,
      unit: "piece",
      status: "sent",
      trackingNo: "DHL-20260809",
      notes: "Material certificate included",
    });

    const quoteResponse = await fetch(`${baseUrl}/api/quotes`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customerId: 1,
        opportunityId: opportunity.opportunityId,
        currency: "USD",
        freight: 20,
        taxRate: 5,
        items: [
          {
            productId: product.productId,
            productName: "Weld neck flange DN50",
            variantId: product.variants[0].variantId,
            sku: "WN-DN50-PN16",
            standard: "EN 1092-1",
            material: "ASTM A105",
            pressureRating: "PN16",
            nominalSize: "DN50",
            facing: "RF",
            certificateRequirements: "EN 10204 3.1",
            description: product.variants[0].quoteDescription,
            quantity: 10,
            unit: "pcs",
            unitPrice: 25,
          },
          {
            productName: "Blind flange DN80",
            quantity: 4,
            unit: "pcs",
            unitPrice: 50,
            discount: 10,
          },
        ],
      }),
    });
    expect(quoteResponse.status).toBe(201);
    const quote = await quoteResponse.json();
    const quoteUpdateResponse = await fetch(
      `${baseUrl}/api/quotes/${quote.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          customerId: 1,
          opportunityId: null,
          status: "sent",
          currency: "EUR",
          freight: 30,
          taxRate: 10,
          notes: "Updated commercial terms",
          items: [
            {
              productId: product.productId,
              productName: "Weld neck flange DN50 PN16",
              quantity: 12,
              unit: "pcs",
              unitPrice: 27.5,
              discount: 5,
            },
            {
              productName: "Blind flange DN80 PN16",
              quantity: 6,
              unit: "pcs",
              unitPrice: 52,
              discount: 0,
            },
          ],
        }),
      },
    );
    expect(quoteUpdateResponse.status).toBe(200);
    const updatedQuote = await quoteUpdateResponse.json();
    expect(updatedQuote.items).toHaveLength(2);
    expect(updatedQuote.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productName: "Weld neck flange DN50 PN16",
          sku: "WN-DN50-PN16",
          standard: "EN 1092-1",
          certificateRequirements: "EN 10204 3.1",
          quantity: 12,
          unitPrice: 27.5,
        }),
        expect.objectContaining({
          productName: "Blind flange DN80 PN16",
          quantity: 6,
          unitPrice: 52,
        }),
      ]),
    );
    expect(updatedQuote).toMatchObject({
      opportunityId: null,
      status: "sent",
      currency: "EUR",
      subtotal: 625.5,
      taxAmount: 62.55,
      total: 718.05,
      notes: "Updated commercial terms",
    });

    const invalidCloseResponse = await fetch(
      `${baseUrl}/api/opportunities/${opportunity.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ stage: "won" }),
      },
    );
    expect(invalidCloseResponse.status).toBe(400);

    const wonResponse = await fetch(
      `${baseUrl}/api/opportunities/${opportunity.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          stage: "won",
          winReason: "Customer approved price, quality and delivery schedule",
        }),
      },
    );
    expect(wonResponse.status).toBe(200);
    await expect(wonResponse.json()).resolves.toMatchObject({
      stage: "won",
      probability: 100,
      forecastCategory: "closed",
      winReason: "Customer approved price, quality and delivery schedule",
    });
    expect(customerRepository.items[0].journeyStage).toBe("won");
  });

  it("completes the foreign-trade CRM main chain through real HTTP endpoints", async () => {
    templateRepository.reset([
      {
        id: 9,
        templateId: "tmpl_9",
        name: "Quotation follow-up",
        subject: "Your flange quotation",
        body: "Hello {{company}}",
        images: [],
      },
    ]);
    const headers = {
      "content-type": "application/json",
      "x-test-role": "sales",
      "x-test-user-id": "7",
    };

    const customerResponse = await fetch(`${baseUrl}/api/customers`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        company: "Northwind Valves GmbH",
        contact: "Anna Keller",
        email: "anna@northwind.test",
        country: "Germany",
        business: "Industrial valve distributor",
      }),
    });
    expect(customerResponse.status).toBe(201);
    const customer = await customerResponse.json();
    expect(customer).toMatchObject({
      id: 1,
      company: "Northwind Valves GmbH",
      ownerId: "7",
    });

    const contactResponse = await fetch(
      `${baseUrl}/api/customers/${customer.id}/contacts`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "Anna Keller",
          title: "Purchasing Manager",
          email: "anna@northwind.test",
          isPrimary: true,
        }),
      },
    );
    expect(contactResponse.status).toBe(201);
    const contact = await contactResponse.json();
    expect(contact).toMatchObject({
      customerId: customer.id,
      name: "Anna Keller",
      isPrimary: true,
    });

    const contactUpdateResponse = await fetch(
      `${baseUrl}/api/contacts/${contact.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          title: "Head of Purchasing",
          phone: "+49 30 1000",
          isPrimary: true,
        }),
      },
    );
    expect(contactUpdateResponse.status).toBe(200);
    await expect(contactUpdateResponse.json()).resolves.toMatchObject({
      title: "Head of Purchasing",
      phone: "+49 30 1000",
      isPrimary: true,
    });
    expect(customerRepository.items[0]).toMatchObject({
      contact: "Anna Keller",
      email: "anna@northwind.test",
      phone: "+49 30 1000",
    });

    const activityResponse = await fetch(
      `${baseUrl}/api/customers/${customer.id}/activities`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "call",
          subject: "确认 EN 1092-1 法兰需求",
          content: "客户需要两种规格，并要求本周报价。",
        }),
      },
    );
    expect(activityResponse.status).toBe(201);
    await expect(activityResponse.json()).resolves.toMatchObject({
      customerId: customer.id,
      type: "call",
    });

    const whatsappResponse = await fetch(
      `${baseUrl}/api/customers/${customer.id}/activities`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "whatsapp",
          subject: "WhatsApp 确认交期",
          content: "客户确认本周内需要正式报价。",
        }),
      },
    );
    expect(whatsappResponse.status).toBe(201);
    await expect(whatsappResponse.json()).resolves.toMatchObject({
      customerId: customer.id,
      type: "whatsapp",
    });

    const attachmentForm = new FormData();
    attachmentForm.append("category", "inquiry");
    attachmentForm.append("note", "客户原始询价单");
    attachmentForm.append(
      "file",
      new Blob(["rfq-data"], { type: "application/pdf" }),
      "Northwind-RFQ.pdf",
    );
    const attachmentResponse = await fetch(
      `${baseUrl}/api/customers/${customer.id}/attachments`,
      {
        method: "POST",
        headers: { "x-test-role": "sales", "x-test-user-id": "7" },
        body: attachmentForm,
      },
    );
    expect(attachmentResponse.status).toBe(201);
    const attachment = await attachmentResponse.json();
    expect(attachment).toMatchObject({
      customerId: customer.id,
      originalName: "Northwind-RFQ.pdf",
      category: "inquiry",
      note: "客户原始询价单",
    });

    const forbiddenAttachments = await fetch(
      `${baseUrl}/api/customers/${customer.id}/attachments`,
      {
        headers: { "x-test-role": "sales", "x-test-user-id": "8" },
      },
    );
    expect(forbiddenAttachments.status).toBe(404);

    const attachmentDownload = await fetch(
      `${baseUrl}/api/attachments/${attachment.id}/download`,
      {
        headers: { "x-test-role": "sales", "x-test-user-id": "7" },
      },
    );
    expect(attachmentDownload.status).toBe(200);
    expect(attachmentDownload.headers.get("content-disposition")).toContain(
      "Northwind-RFQ.pdf",
    );
    await expect(attachmentDownload.text()).resolves.toBe("rfq-data");

    const todoResponse = await fetch(
      `${baseUrl}/api/customers/${customer.id}/todos`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "发送正式报价并跟进",
          dueAt: "2026-08-12T09:00:00.000Z",
        }),
      },
    );
    expect(todoResponse.status).toBe(201);
    await expect(todoResponse.json()).resolves.toMatchObject({
      customerId: customer.id,
      title: "发送正式报价并跟进",
      status: "open",
    });

    const opportunityResponse = await fetch(
      `${baseUrl}/api/customers/${customer.id}/opportunities`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: "Northwind 2026 flange order",
          value: 12800,
          stage: "prospecting",
          nextStepAction: "确认正式报价并约定下一次沟通",
          nextStepDueDate: "2026-08-19",
          expectedCloseDate: "2026-09-30",
        }),
      },
    );
    expect(opportunityResponse.status).toBe(201);
    const opportunity = await opportunityResponse.json();
    expect(opportunity).toMatchObject({
      customerId: customer.id,
      amount: 12800,
      stage: "prospecting",
      nextStepAction: "确认正式报价并约定下一次沟通",
      expectedCloseDate: "2026-09-30",
    });

    const stageResponse = await fetch(
      `${baseUrl}/api/opportunities/${opportunity.id}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({ stage: "proposal" }),
      },
    );
    expect(stageResponse.status).toBe(200);
    await expect(stageResponse.json()).resolves.toMatchObject({
      stage: "proposal",
      probability: 60,
    });
    expect(customerRepository.items[0]).toMatchObject({
      journeyStage: "proposal",
      lastActivityType: "whatsapp",
      nextTodoTitle: "发送正式报价并跟进",
      openOpportunityCount: 1,
      openOpportunityValue: 12800,
    });

    const quoteResponse = await fetch(`${baseUrl}/api/quotes`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customerId: customer.id,
        opportunityId: opportunity.opportunityId,
        currency: "USD",
        freight: 20,
        taxRate: 5,
        validUntil: "2026-09-01",
        items: [
          {
            productName: "Weld neck flange DN50",
            quantity: 10,
            unit: "pcs",
            unitPrice: 25,
          },
          {
            productName: "Blind flange DN80",
            quantity: 4,
            unit: "pcs",
            unitPrice: 50,
            discount: 10,
          },
        ],
      }),
    });
    expect(quoteResponse.status).toBe(201);
    const quote = await quoteResponse.json();
    expect(quote.items).toHaveLength(2);
    expect(quote).toMatchObject({
      subtotal: 430,
      freight: 20,
      taxAmount: 21.5,
      total: 471.5,
    });

    const exportResponse = await fetch(
      `${baseUrl}/api/quotes/${quote.id}/export`,
      {
        headers: { "x-test-role": "sales", "x-test-user-id": "7" },
      },
    );
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-type")).toContain("text/html");
    expect(exportResponse.headers.get("content-disposition")).toContain(
      "attachment",
    );
    const exportedQuote = await exportResponse.text();
    expect(exportedQuote).toContain("Weld neck flange DN50");
    expect(exportedQuote).toContain("Blind flange DN80");
    expect(exportedQuote).toContain("Northwind Valves GmbH");

    const emailTaskResponse = await fetch(`${baseUrl}/api/email-tasks`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Northwind quotation follow-up",
        templateId: "9",
        customerIds: [String(customer.id)],
        batchSize: 10,
      }),
    });
    expect(emailTaskResponse.status).toBe(201);
    await expect(emailTaskResponse.json()).resolves.toMatchObject({
      ownerId: "7",
      name: "Northwind quotation follow-up",
      customerIds: [String(customer.id)],
      status: "pending",
    });

    const attachmentDelete = await fetch(
      `${baseUrl}/api/attachments/${attachment.id}`,
      {
        method: "DELETE",
        headers: { "x-test-role": "sales", "x-test-user-id": "7" },
      },
    );
    expect(attachmentDelete.status).toBe(200);
    expect(attachmentRepository.items).toHaveLength(0);
  });
});
