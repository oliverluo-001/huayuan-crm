import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, FindOptionsWhere, In, Not, IsNull } from 'typeorm';
import * as xlsx from 'xlsx';
import {
  Customer,
  Contact,
  Activity,
  Todo,
  Opportunity,
  Quote,
  Sample,
  Tag,
  CustomerView,
} from './entities';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  BulkTagsDto,
  BulkDeleteDto,
  BulkTierDto,
  CreateContactDto,
  UpdateContactDto,
  CreateActivityDto,
  CreateTodoDto,
  UpdateTodoDto,
  CreateOpportunityDto,
  UpdateOpportunityDto,
  CreateQuoteDto,
  UpdateQuoteDto,
  CreateSampleDto,
  UpdateSampleDto,
  CreateCustomerViewDto,
  UpdateCustomerViewDto,
} from './dto';

interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
  path?: string;
  destination?: string;
  filename?: string;
  stream?: any;
}

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private customerRepository: Repository<Customer>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    @InjectRepository(Todo)
    private todoRepository: Repository<Todo>,
    @InjectRepository(Opportunity)
    private opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Quote)
    private quoteRepository: Repository<Quote>,
    @InjectRepository(Sample)
    private sampleRepository: Repository<Sample>,
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
    @InjectRepository(CustomerView)
    private customerViewRepository: Repository<CustomerView>,
  ) {}

  // ==================== Customer CRUD ====================

  async findAll(filters: Record<string, any> = {}) {
    const { offset, limit, ...queryFilters } = filters;
    const skip = offset ? parseInt(offset, 10) : 0;
    const take = limit ? parseInt(limit, 10) : 0;
    const where: FindOptionsWhere<Customer> = {};

    if (queryFilters.q) {
      const qb = this.customerRepository
        .createQueryBuilder('customer')
        .leftJoinAndSelect('customer.tags', 'tag')
        .where(
          `customer.company LIKE :q OR customer.contact LIKE :q OR customer.email LIKE :q OR customer.phone LIKE :q OR customer.notes LIKE :q`,
          { q: `%${queryFilters.q}%` },
        )
        .orderBy('customer.createdAt', 'DESC');

      if (queryFilters.ownerId) qb.andWhere('customer.ownerId = :ownerId', { ownerId: queryFilters.ownerId });

      if (take > 0) qb.skip(skip).take(take);
      const [customers, total] = await qb.getManyAndCount();
      return { customers, total };
    }

    if (queryFilters.region) {
      where.region = Like(`%${queryFilters.region}%`);
    }
    if (queryFilters.tier) {
      where.tier = queryFilters.tier as any;
    }
    if (queryFilters.journeyStage) {
      where.journeyStage = queryFilters.journeyStage as any;
    }
    if (queryFilters.emailStatus) {
      where.emailStatus = queryFilters.emailStatus as any;
    }
    if (queryFilters.ownerId) {
      where.ownerId = queryFilters.ownerId;
    }
    if (queryFilters.health) {
      where.health = queryFilters.health as any;
    }
    if (queryFilters.tag) {
      return this.findByTag(queryFilters.tag, skip, take, queryFilters.ownerId);
    }

    if (take > 0) {
      const [customers, total] = await this.customerRepository.findAndCount({
        where,
        order: { createdAt: 'DESC' },
        skip,
        take,
      });
      return { customers, total };
    }

    const customers = await this.customerRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
    return { customers, total: customers.length };
  }

  async findOne(id: number) {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: ['tags'],
    });
    if (!customer) {
      throw new NotFoundException('客户不存在');
    }
    return customer;
  }

  async assertCustomerOwner(id: number, ownerId?: string) {
    const customer = await this.findOne(id);
    if (ownerId && customer.ownerId !== ownerId) {
      // Do not disclose whether another salesperson owns the record.
      throw new NotFoundException('客户不存在');
    }
    return customer;
  }

  async findByIdentifier(identifier: string | number) {
    const value = String(identifier ?? '').trim();
    const numericId = Number(value);
    const customer = await this.customerRepository.findOne({
      where: Number.isInteger(numericId) && numericId > 0
        ? [{ id: numericId }, { customerId: value }]
        : { customerId: value },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    return customer;
  }

  async findContactByIdentifier(identifier: string | number) {
    const value = String(identifier ?? '').trim();
    const numericId = Number(value);
    const contact = await this.contactRepository.findOne({
      where: Number.isInteger(numericId) && numericId > 0
        ? [{ id: numericId }, { contactId: value }]
        : { contactId: value },
    });
    if (!contact) throw new NotFoundException('联系人不存在');
    return contact;
  }

  async markEmailSent(customerId: number, subject: string, recipientEmail: string) {
    const customer = await this.findOne(customerId);
    if (!['replied', 'opportunity', 'won', 'lost', 'closed'].includes(customer.journeyStage)) {
      customer.journeyStage = 'contacted';
    }
    customer.lastActivityAt = new Date();
    customer.lastActivityType = 'email';
    customer.health = 'good';
    await this.customerRepository.save(customer);
    const activity = this.activityRepository.create({
      customerId,
      activityId: this.generateId('activity'),
      type: 'email',
      subject,
      content: `邮件已发送至 ${recipientEmail}`,
    });
    await this.activityRepository.save(activity);
    return customer;
  }

  async create(createCustomerDto: CreateCustomerDto) {
    if (createCustomerDto.email) {
      const existing = await this.customerRepository.findOne({
        where: { email: createCustomerDto.email },
      });
      if (existing) {
        throw new BadRequestException('该邮箱已被其他客户使用');
      }
    }

    const { tags, ...rest } = createCustomerDto;
    const customer = this.customerRepository.create({
      ...rest,
      customerId: this.generateId('cus'),
    });

    if (tags && tags.length > 0) {
      customer.tags = await this.getOrCreateTags(tags);
    }

    return this.customerRepository.save(customer);
  }

  async update(id: number, updateCustomerDto: UpdateCustomerDto) {
    const customer = await this.findOne(id);
    const { tags, ...rest } = updateCustomerDto;

    if (rest.email && rest.email !== customer.email) {
      const existing = await this.customerRepository.findOne({
        where: { email: rest.email },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException('该邮箱已被其他客户使用');
      }
      rest.emailStatus = 'unknown';
      (rest as any).emailFailureReason = '';
      (rest as any).emailFailedAt = null;
    }

    Object.assign(customer, rest);

    if (tags) {
      customer.tags = await this.getOrCreateTags(tags);
    }

    return this.customerRepository.save(customer);
  }

  async remove(id: number) {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) throw new NotFoundException('客户不存在');
    // Soft delete
    await this.customerRepository.softDelete(id);
    return { deleted: true };
  }

  // ==================== Trash / Recycle Bin ====================

  async findTrash() {
    const customers = await this.customerRepository.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()) } as any,
      order: { deletedAt: 'DESC' },
    });
    return customers.map((c) => ({
      id: c.customerId || String(c.id),
      name: c.company,
      company: c.company,
      email: c.email,
      type: '客户',
      deletedAt: c.deletedAt,
    }));
  }

  async restore(id: number) {
    const customer = await this.customerRepository.findOne({
      withDeleted: true,
      where: { id },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    if (!customer.deletedAt) throw new BadRequestException('该客户不在回收站中');
    await this.customerRepository.restore(id);
    return { restored: true };
  }

  async deletePermanent(id: number) {
    const customer = await this.customerRepository.findOne({
      withDeleted: true,
      where: { id },
    });
    if (!customer) throw new NotFoundException('客户不存在');
    await this.customerRepository.remove(customer);
    return { deleted: true };
  }

  async findAllIds(filters: Record<string, any> = {}) {
    const result = await this.findAll(filters);
    const customers = (result as any).customers || result;
    return (Array.isArray(customers) ? customers : []).map((c: any) => c.customerId);
  }

  async deleteAll() {
    const count = await this.customerRepository.count();
    await this.customerRepository.clear();
    return { deleted: count };
  }

  async clearEmailException(id: number) {
    const customer = await this.findOne(id);
    customer.emailStatus = 'unknown' as any;
    (customer as any).emailFailureReason = '';
    (customer as any).emailFailedAt = null;
    return this.customerRepository.save(customer);
  }

  private async findByTag(tagName: string, skip: number, take: number, ownerId?: string) {
    const qb = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.tags', 'tag')
      .where('tag.name = :tagName', { tagName })
      .orderBy('customer.createdAt', 'DESC');
    if (ownerId) qb.andWhere('customer.ownerId = :ownerId', { ownerId });

    if (take > 0) qb.skip(skip).take(take);
    const [customers, total] = await qb.getManyAndCount();
    return { customers, total };
  }

  async bulkDelete(bulkDeleteDto: BulkDeleteDto, ownerId?: string) {
    const ids = bulkDeleteDto.ids;
    const result = await this.customerRepository.softDelete(
      ownerId ? { id: In(ids), ownerId } : { id: In(ids) },
    );
    return { deleted: result.affected || 0 };
  }

  async bulkTags(bulkTagsDto: BulkTagsDto, ownerId?: string) {
    const { ids, action, tag } = bulkTagsDto;
    const tagEntity = await this.getOrCreateTags([tag]);
    const customers = await this.customerRepository.find({
      where: ownerId ? { id: In(ids), ownerId } : { id: In(ids) },
      relations: ['tags'],
    });

    let updated = 0;
    for (const customer of customers) {
      if (action === 'add') {
        if (!customer.tags.some((t) => t.name === tag)) {
          customer.tags.push(tagEntity[0]);
          updated++;
        }
      } else if (action === 'remove') {
        customer.tags = customer.tags.filter((t) => t.name !== tag);
        updated++;
      }
      await this.customerRepository.save(customer);
    }

    return { updated, tag, action };
  }

  async bulkTier(bulkTierDto: BulkTierDto, ownerId?: string) {
    const result = await this.customerRepository.update(
      ownerId
        ? { id: In(bulkTierDto.ids), ownerId }
        : { id: In(bulkTierDto.ids) },
      { tier: bulkTierDto.tier as any },
    );
    return { updated: result.affected || 0, tier: bulkTierDto.tier };
  }

  async getCustomer360(id: number, ownerId?: string) {
    const customer = await this.assertCustomerOwner(id, ownerId);
    const [contacts, activities, todos, opportunities, quotes, samples] =
      await Promise.all([
        this.contactRepository.find({
          where: { customerId: id },
          order: { isPrimary: 'DESC', name: 'ASC' },
        }),
        this.activityRepository.find({
          where: { customerId: id },
          order: { createdAt: 'DESC' },
        }),
        this.todoRepository.find({
          where: { customerId: id },
          order: { status: 'ASC', dueAt: 'ASC' },
        }),
        this.opportunityRepository.find({
          where: { customerId: id },
          order: { updatedAt: 'DESC' },
        }),
        this.quoteRepository.find({
          where: { customerId: id },
          relations: ['items'],
          order: { updatedAt: 'DESC' },
        }),
        this.sampleRepository.find({
          where: { customerId: id },
          order: { updatedAt: 'DESC' },
        }),
      ]);

    return {
      customer,
      contacts,
      activities,
      todos,
      opportunities,
      quotes,
      samples,
    };
  }

  // ==================== Tags ====================

  async getAllTags() {
    const tags = await this.tagRepository.find({ order: { name: 'ASC' } });
    return tags.map((t) => t.name);
  }

  async createTag(name: string) {
    if (!name) throw new BadRequestException('请输入标签名称');
    const existing = await this.tagRepository.findOne({
      where: { name },
    });
    if (existing) return name;
    await this.tagRepository.save({ name });
    return name;
  }

  async deleteTag(name: string) {
    const result = await this.tagRepository.delete({ name });
    if (result.affected === 0) {
      throw new NotFoundException('标签不存在');
    }
    return { deleted: true };
  }

  private async getOrCreateTags(tagNames: string[]): Promise<Tag[]> {
    const tags: Tag[] = [];
    for (const name of tagNames) {
      if (!name) continue;
      let tag = await this.tagRepository.findOne({ where: { name } });
      if (!tag) {
        tag = await this.tagRepository.save({ name });
      }
      tags.push(tag);
    }
    return tags;
  }

  // ==================== Contacts ====================

  async findContacts(customerId: number, ownerId?: string) {
    await this.assertCustomerOwner(customerId, ownerId);
    return this.contactRepository.find({
      where: { customerId },
      order: { isPrimary: 'DESC', name: 'ASC' },
    });
  }

  async createContact(customerId: number, createContactDto: CreateContactDto, ownerId?: string) {
    await this.assertCustomerOwner(customerId, ownerId);

    if (createContactDto.isPrimary) {
      await this.contactRepository.update(
        { customerId },
        { isPrimary: false },
      );
    }

    const contact = this.contactRepository.create({
      ...createContactDto,
      customerId,
      contactId: this.generateId('contact'),
    });

    return this.contactRepository.save(contact);
  }

  async updateContact(id: number, updateContactDto: UpdateContactDto, ownerId?: string) {
    const contact = await this.contactRepository.findOne({ where: { id } });
    if (!contact) throw new NotFoundException('联系人不存在');

    await this.assertCustomerOwner(contact.customerId, ownerId);
    if (updateContactDto.isPrimary) {
      await this.contactRepository.update(
        { customerId: contact.customerId },
        { isPrimary: false },
      );
    }

    Object.assign(contact, updateContactDto);
    return this.contactRepository.save(contact);
  }

  async deleteContact(id: number, ownerId?: string) {
    const contact = await this.contactRepository.findOne({ where: { id } });
    if (!contact) throw new NotFoundException('联系人不存在');
    await this.assertCustomerOwner(contact.customerId, ownerId);
    const result = await this.contactRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('联系人不存在');
    return { deleted: true };
  }

  // ==================== Activities ====================

  async findActivities(customerId: number, ownerId?: string) {
    await this.assertCustomerOwner(customerId, ownerId);
    return this.activityRepository.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async createActivity(customerId: number, createActivityDto: CreateActivityDto, ownerId?: string) {
    await this.assertCustomerOwner(customerId, ownerId);
    if (!createActivityDto.subject && !createActivityDto.content) {
      throw new BadRequestException('请填写跟进内容');
    }

    const activity = this.activityRepository.create({
      ...createActivityDto,
      customerId,
      activityId: this.generateId('activity'),
    });

    return this.activityRepository.save(activity);
  }

  // ==================== Todos ====================

  async findTodos(filters: Record<string, any> = {}) {
    const where: FindOptionsWhere<Todo> = {};
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.ownerId) where.customer = { ownerId: filters.ownerId } as Customer;
    return this.todoRepository.find({
      where,
      order: { status: 'ASC', dueAt: 'ASC' },
    });
  }

  async createTodo(createTodoDto: CreateTodoDto) {
    await this.findOne(createTodoDto.customerId);
    const todo = this.todoRepository.create({
      ...createTodoDto,
      todoId: this.generateId('todo'),
    });
    return this.todoRepository.save(todo);
  }

  async updateTodo(id: number, updateTodoDto: UpdateTodoDto) {
    const todo = await this.todoRepository.findOne({ where: { id } });
    if (!todo) throw new NotFoundException('待办不存在');

    Object.assign(todo, updateTodoDto);
    if (updateTodoDto.status === 'done') {
      todo.completedAt = new Date();
    }
    return this.todoRepository.save(todo);
  }

  async deleteTodo(id: number) {
    const result = await this.todoRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('待办不存在');
    return { deleted: true };
  }

  // ==================== Opportunities ====================

  async findOpportunities(filters: Record<string, any> = {}) {
    const where: FindOptionsWhere<Opportunity> = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.ownerId) where.customer = { ownerId: filters.ownerId } as Customer;
    return this.opportunityRepository.find({
      where,
      relations: ['customer'],
      order: { updatedAt: 'DESC' },
    });
  }

  async createOpportunity(createOpportunityDto: CreateOpportunityDto) {
    await this.findOne(createOpportunityDto.customerId);
    const opportunity = this.opportunityRepository.create({
      ...createOpportunityDto,
      opportunityId: this.generateId('opp'),
    });
    return this.opportunityRepository.save(opportunity);
  }

  async updateOpportunity(id: number, updateOpportunityDto: UpdateOpportunityDto) {
    const opportunity = await this.opportunityRepository.findOne({ where: { id } });
    if (!opportunity) throw new NotFoundException('商机不存在');
    Object.assign(opportunity, updateOpportunityDto);
    return this.opportunityRepository.save(opportunity);
  }

  async deleteOpportunity(id: number) {
    const result = await this.opportunityRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('商机不存在');
    return { deleted: true };
  }

  // ==================== Quotes ====================

  async findQuotes(filters: Record<string, any> = {}) {
    const where: FindOptionsWhere<Quote> = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status as any;
    if (filters.ownerId) where.customer = { ownerId: filters.ownerId } as Customer;
    return this.quoteRepository.find({
      where,
      relations: ['items'],
      order: { updatedAt: 'DESC' },
    });
  }

  async findQuote(id: number) {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ['items'],
    });
    if (!quote) throw new NotFoundException('报价不存在');
    return quote;
  }

  async createQuote(createQuoteDto: CreateQuoteDto) {
    await this.findOne(createQuoteDto.customerId);
    if (!createQuoteDto.items || createQuoteDto.items.length === 0) {
      throw new BadRequestException('请至少添加一个报价产品');
    }

    const quote = this.quoteRepository.create({
      ...createQuoteDto,
      quoteId: this.generateId('quote'),
      quoteNo: createQuoteDto.quoteNo || (await this.generateQuoteNo()),
      items: createQuoteDto.items as any,
    });

    return this.quoteRepository.save(quote);
  }

  async updateQuote(id: number, updateQuoteDto: UpdateQuoteDto) {
    const quote = await this.findQuote(id);
    if (updateQuoteDto.items && updateQuoteDto.items.length === 0) {
      throw new BadRequestException('请至少添加一个报价产品');
    }
    Object.assign(quote, updateQuoteDto);
    return this.quoteRepository.save(quote);
  }

  async deleteQuote(id: number) {
    const result = await this.quoteRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('报价不存在');
    return { deleted: true };
  }

  private async generateQuoteNo(): Promise<string> {
    const now = new Date();
    const prefix = `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const count = await this.quoteRepository.count({
      where: { quoteNo: Like(`${prefix}%`) },
    });
    return `${prefix}-${String(count + 1).padStart(3, '0')}`;
  }

  // ==================== Samples ====================

  async findSamples(filters: Record<string, any> = {}) {
    const where: FindOptionsWhere<Sample> = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status as any;
    if (filters.ownerId) where.customer = { ownerId: filters.ownerId } as Customer;
    return this.sampleRepository.find({
      where,
      order: { updatedAt: 'DESC' },
    });
  }

  async createSample(createSampleDto: CreateSampleDto) {
    await this.findOne(createSampleDto.customerId);
    const sample = this.sampleRepository.create({
      ...createSampleDto,
      sampleId: this.generateId('sample'),
    });
    return this.sampleRepository.save(sample);
  }

  async updateSample(id: number, updateSampleDto: UpdateSampleDto) {
    const sample = await this.sampleRepository.findOne({ where: { id } });
    if (!sample) throw new NotFoundException('样品记录不存在');
    Object.assign(sample, updateSampleDto);
    return this.sampleRepository.save(sample);
  }

  async deleteSample(id: number) {
    const result = await this.sampleRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('样品记录不存在');
    return { deleted: true };
  }

  async findContactsForCustomers(customerIds: number[]) {
    if (!customerIds.length) return [];
    return this.contactRepository.find({
      where: { customerId: In(customerIds) },
      order: { isPrimary: 'DESC', name: 'ASC' },
    });
  }

  async assertTodoOwner(id: number, ownerId?: string) {
    const item = await this.todoRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('待办不存在');
    await this.assertCustomerOwner(item.customerId, ownerId);
    return item;
  }

  async assertOpportunityOwner(id: number, ownerId?: string) {
    const item = await this.opportunityRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('商机不存在');
    await this.assertCustomerOwner(item.customerId, ownerId);
    return item;
  }

  async assertQuoteOwner(id: number, ownerId?: string) {
    const item = await this.quoteRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('报价不存在');
    await this.assertCustomerOwner(item.customerId, ownerId);
    return item;
  }

  async assertSampleOwner(id: number, ownerId?: string) {
    const item = await this.sampleRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException('样品不存在');
    await this.assertCustomerOwner(item.customerId, ownerId);
    return item;
  }

  // ==================== Import/Export ====================

  async parseAndPreview(file: UploadedFile) {
    const rows = await this.parseExcelFile(file);
    const normalizedRows = rows.map((row) => this.normalizeImportedRow(row));
    const customers = await this.customerRepository.find();
    const existingEmails = new Set(
      customers.filter((c) => c.email).map((c) => this.normalizeEmail(c.email)),
    );

    const duplicates: any[] = [];
    const duplicateUploadEmails = new Set<string>();
    const seenUploadEmails = new Set<string>();

    for (const row of normalizedRows) {
      const email = row.email;
      if (!email) continue;
      if (seenUploadEmails.has(email)) {
        duplicateUploadEmails.add(email);
      }
      seenUploadEmails.add(email);
      if (existingEmails.has(email)) {
        duplicates.push({
          email,
          existingCompany: customers.find((c) => c.email?.toLowerCase() === email)?.company || '',
          incomingCompany: row.company,
        });
      }
    }

    return {
      total: rows.length,
      withEmail: normalizedRows.filter((row) => row.email).length,
      duplicateCount: duplicates.length,
      duplicateUploadCount: duplicateUploadEmails.size,
      duplicates: duplicates.slice(0, 20),
      duplicateUploadEmails: [...duplicateUploadEmails].slice(0, 20),
    };
  }

  async parseAndImport(file: UploadedFile, ownerId = '') {
    const rows = await this.parseExcelFile(file);
    let created = 0;
    let updated = 0;
    let skipped = 0;

    const existingCustomers = await this.customerRepository.find();
    const customersByEmail = new Map(
      existingCustomers
        .filter((customer) => customer.email)
        .map((customer) => [this.normalizeEmail(customer.email), customer]),
    );

    for (const row of rows) {
      const data = this.normalizeImportedRow(row);
      if (!data.email && !data.company) {
        skipped++;
        continue;
      }
      const existing = data.email ? customersByEmail.get(data.email) : undefined;

      if (existing) {
        if (ownerId && existing.ownerId !== ownerId) {
          skipped++;
          continue;
        }
        Object.assign(existing, this.mergeImportedCustomer(data));
        await this.customerRepository.save(existing);
        updated++;
      } else {
        const customer = this.customerRepository.create({
          ...data,
          ownerId,
          customerId: this.generateId('cus'),
        });
        const saved = await this.customerRepository.save(customer);
        if (saved.email) customersByEmail.set(saved.email, saved);
        created++;
      }
    }

    return { created, updated, skipped, total: rows.length };
  }

  async upsertLeadCustomer(data: Partial<Customer>, ownerId = '') {
    const email = this.normalizeEmail(data.email || '');
    const existing = email
      ? await this.customerRepository.findOne({ where: { email } })
      : null;
    const profile = this.mergeImportedCustomer({
      company: String(data.company || ''),
      contact: String(data.contact || ''),
      email,
      phone: String(data.phone || ''),
      website: String(data.website || ''),
      region: String(data.region || ''),
      country: String(data.country || ''),
      business: String(data.business || ''),
      product: String(data.product || ''),
      customerType: String(data.customerType || ''),
      timezone: String(data.timezone || ''),
      notes: String(data.notes || ''),
      source: String(data.source || 'lead'),
    });
    if (existing) {
      if (ownerId && existing.ownerId !== ownerId) {
        throw new BadRequestException('该邮箱已存在于其他负责人客户中，请联系管理员调整归属');
      }
      Object.assign(existing, profile);
      return { customer: await this.customerRepository.save(existing), created: false };
    }
    const customer = this.customerRepository.create({
      ...profile,
      ownerId,
      journeyStage: 'lead',
      customerId: this.generateId('cus'),
    });
    return { customer: await this.customerRepository.save(customer), created: true };
  }

  private async parseExcelFile(file: UploadedFile): Promise<any[]> {
    if (!file?.buffer?.length && !file?.path) {
      throw new BadRequestException('上传文件内容为空');
    }
    const workbook = file.buffer?.length
      ? xlsx.read(file.buffer, { type: 'buffer' })
      : xlsx.readFile(file.path!);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new BadRequestException('Excel/CSV 文件没有可读取的工作表');
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet, { defval: '', raw: false });
  }

  private normalizeImportRow(row: any) {
    return {
      company: row.company || row.Company || '',
      contact: row.contact || row.Contact || row['联系人'] || '',
      email: row.email || row.Email || row['邮箱'] || '',
      phone: row.phone || row.Phone || row['电话'] || '',
      website: row.website || row.Website || row['网站'] || '',
      region: row.region || row.Region || row['地区'] || '',
      country: row.country || row.Country || row['国家'] || '',
      business: row.business || row.Business || row['行业'] || '',
      product: row.product || row.Product || row['产品'] || '',
      notes: row.notes || row.Notes || row['备注'] || '',
      source: 'import',
    };
  }

  private normalizeImportedRow(row: Record<string, unknown>) {
    const value = (...keys: string[]) => {
      for (const key of keys) {
        const candidate = row[key];
        if (candidate !== undefined && candidate !== null && String(candidate).trim()) {
          return String(candidate).trim();
        }
      }
      return '';
    };
    return {
      company: value('company', 'Company', '公司', '公司名称', '客户名称'),
      contact: value('contact', 'Contact', '联系人', '联系人姓名', '姓名'),
      email: this.normalizeEmail(value('email', 'Email', '邮箱', '电子邮箱', 'E-mail', 'E-Mail')),
      phone: value('phone', 'Phone', '电话', '手机号', '联系电话'),
      website: value('website', 'Website', '官网', '网站', '网址'),
      region: value('region', 'Region', '地区', '城市', '市场区域'),
      country: value('country', 'Country', '国家', '国家/地区'),
      business: value('business', 'Business', '主营业务', '行业', '业务'),
      product: value('product', 'Product', '产品', '主营产品'),
      customerType: value('customerType', 'Customer Type', '客户类型'),
      timezone: value('timezone', 'Timezone', '时区', '客户时区'),
      notes: value('notes', 'Notes', '备注'),
      source: 'import',
    };
  }

  private mergeImportedCustomer(incoming: ReturnType<CustomersService['normalizeImportedRow']>) {
    const merged: Record<string, string> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (String(value || '').trim()) merged[key] = value;
    }
    // Profile fields merge in place, so ownership, lifecycle, email health,
    // tags, activities and historical email logs remain untouched.
    return merged;
  }

  private normalizeEmail(value: string) {
    return String(value || '').trim().toLowerCase();
  }

  // ==================== Customer Views ====================

  async findViews(ownerId?: string) {
    return this.customerViewRepository.find({
      where: ownerId ? { ownerId } : {},
      order: { createdAt: 'DESC' },
    });
  }

  async createView(createDto: CreateCustomerViewDto, ownerId = '') {
    const view = this.customerViewRepository.create({
      ...createDto,
      ownerId,
      viewId: this.generateId('view'),
    });
    return this.customerViewRepository.save(view);
  }

  async updateView(id: number, updateDto: UpdateCustomerViewDto, ownerId?: string) {
    const view = await this.customerViewRepository.findOne({ where: { id } });
    if (!view) throw new NotFoundException('视图不存在');
    if (ownerId && view.ownerId !== ownerId) throw new NotFoundException('筛选器不存在');
    Object.assign(view, updateDto);
    return this.customerViewRepository.save(view);
  }

  async deleteView(id: number, ownerId?: string) {
    const view = await this.customerViewRepository.findOne({ where: { id } });
    if (!view || (ownerId && view.ownerId !== ownerId)) throw new NotFoundException('筛选器不存在');
    const result = await this.customerViewRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('视图不存在');
    return { deleted: true };
  }

  // ==================== Utils ====================

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}${random}`;
  }
}
