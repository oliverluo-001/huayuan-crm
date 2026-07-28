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
  path: string;
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
      return this.findByTag(queryFilters.tag, skip, take);
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

  private async findByTag(tagName: string, skip: number, take: number) {
    const qb = this.customerRepository
      .createQueryBuilder('customer')
      .leftJoinAndSelect('customer.tags', 'tag')
      .where('tag.name = :tagName', { tagName })
      .orderBy('customer.createdAt', 'DESC');

    if (take > 0) qb.skip(skip).take(take);
    const [customers, total] = await qb.getManyAndCount();
    return { customers, total };
  }

  async bulkDelete(bulkDeleteDto: BulkDeleteDto) {
    const ids = bulkDeleteDto.ids;
    for (const id of ids) {
      await this.customerRepository.softDelete(id);
    }
    return { deleted: ids.length };
  }

  async bulkTags(bulkTagsDto: BulkTagsDto) {
    const { ids, action, tag } = bulkTagsDto;
    const tagEntity = await this.getOrCreateTags([tag]);
    const customers = await this.customerRepository.find({
      where: { id: In(ids) },
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

  async bulkTier(bulkTierDto: BulkTierDto) {
    const result = await this.customerRepository.update(
      { id: In(bulkTierDto.ids) },
      { tier: bulkTierDto.tier as any },
    );
    return { updated: result.affected || 0, tier: bulkTierDto.tier };
  }

  async getCustomer360(id: number) {
    const customer = await this.findOne(id);
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

  async findContacts(customerId: number) {
    await this.findOne(customerId);
    return this.contactRepository.find({
      where: { customerId },
      order: { isPrimary: 'DESC', name: 'ASC' },
    });
  }

  async createContact(customerId: number, createContactDto: CreateContactDto) {
    await this.findOne(customerId);

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

  async updateContact(id: number, updateContactDto: UpdateContactDto) {
    const contact = await this.contactRepository.findOne({ where: { id } });
    if (!contact) throw new NotFoundException('联系人不存在');

    if (updateContactDto.isPrimary) {
      await this.contactRepository.update(
        { customerId: contact.customerId },
        { isPrimary: false },
      );
    }

    Object.assign(contact, updateContactDto);
    return this.contactRepository.save(contact);
  }

  async deleteContact(id: number) {
    const result = await this.contactRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException('联系人不存在');
    return { deleted: true };
  }

  // ==================== Activities ====================

  async findActivities(customerId: number) {
    await this.findOne(customerId);
    return this.activityRepository.find({
      where: { customerId },
      order: { createdAt: 'DESC' },
    });
  }

  async createActivity(customerId: number, createActivityDto: CreateActivityDto) {
    await this.findOne(customerId);
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
    return this.opportunityRepository.find({
      where,
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

  // ==================== Import/Export ====================

  async parseAndPreview(file: UploadedFile) {
    const filePath = file.path || '';
    const rows = await this.parseExcelFile(filePath);
    const customers = await this.customerRepository.find();
    const existingEmails = new Set(
      customers.filter((c) => c.email).map((c) => c.email.toLowerCase()),
    );

    const duplicates: any[] = [];
    const duplicateUploadEmails = new Set<string>();
    const seenUploadEmails = new Set<string>();

    for (const row of rows) {
      const email = (row.email || row.Email || '').toLowerCase();
      if (!email) continue;
      if (seenUploadEmails.has(email)) {
        duplicateUploadEmails.add(email);
      }
      seenUploadEmails.add(email);
      if (existingEmails.has(email)) {
        duplicates.push({
          email,
          existingCompany: customers.find((c) => c.email?.toLowerCase() === email)?.company || '',
          incomingCompany: row.company || row.Company || '',
        });
      }
    }

    return {
      total: rows.length,
      withEmail: rows.filter((r) => r.email || r.Email).length,
      duplicateCount: duplicates.length,
      duplicateUploadCount: duplicateUploadEmails.size,
      duplicates: duplicates.slice(0, 20),
      duplicateUploadEmails: [...duplicateUploadEmails].slice(0, 20),
    };
  }

  async parseAndImport(file: UploadedFile) {
    const filePath = file.path || '';
    const rows = await this.parseExcelFile(filePath);
    let created = 0;
    let updated = 0;

    for (const row of rows) {
      const data = this.normalizeImportRow(row);
      const existing = data.email
        ? await this.customerRepository.findOne({ where: { email: data.email } })
        : null;

      if (existing) {
        Object.assign(existing, data);
        await this.customerRepository.save(existing);
        updated++;
      } else {
        const customer = this.customerRepository.create({
          ...data,
          customerId: this.generateId('cus'),
        });
        await this.customerRepository.save(customer);
        created++;
      }
    }

    return { created, updated, total: rows.length };
  }

  private async parseExcelFile(filePath: string): Promise<any[]> {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet);
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

  // ==================== Customer Views ====================

  async findViews() {
    return this.customerViewRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async createView(createDto: CreateCustomerViewDto) {
    const view = this.customerViewRepository.create({
      ...createDto,
      viewId: this.generateId('view'),
    });
    return this.customerViewRepository.save(view);
  }

  async updateView(id: number, updateDto: UpdateCustomerViewDto) {
    const view = await this.customerViewRepository.findOne({ where: { id } });
    if (!view) throw new NotFoundException('视图不存在');
    Object.assign(view, updateDto);
    return this.customerViewRepository.save(view);
  }

  async deleteView(id: number) {
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