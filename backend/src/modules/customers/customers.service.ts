import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, Like, FindOptionsWhere, In, Not, IsNull } from "typeorm";
import * as xlsx from "xlsx";
import {
  Customer,
  Contact,
  Activity,
  Todo,
  Opportunity,
  OpportunityStageHistory,
  Quote,
  Sample,
  Tag,
  CustomerView,
} from "./entities";
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
} from "./dto";
import { EmailLog } from "../email/entities/email-log.entity";

export interface OpportunityActor {
  userId: string;
  displayName: string;
}

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
    @InjectRepository(EmailLog)
    private emailLogRepository: Repository<EmailLog>,
    @InjectRepository(OpportunityStageHistory)
    private opportunityStageHistoryRepository?: Repository<OpportunityStageHistory>,
  ) {}

  // ==================== Customer CRUD ====================

  async findAll(filters: Record<string, any> = {}) {
    const { offset, limit, ...queryFilters } = filters;
    const skip = offset ? parseInt(offset, 10) : 0;
    const take = limit ? parseInt(limit, 10) : 0;
    const where: FindOptionsWhere<Customer> = {};

    if (queryFilters.q) {
      const qb = this.customerRepository
        .createQueryBuilder("customer")
        .leftJoinAndSelect("customer.tags", "tag")
        .where(
          `customer.company LIKE :q OR customer.contact LIKE :q OR customer.email LIKE :q OR customer.phone LIKE :q OR customer.notes LIKE :q`,
          { q: `%${queryFilters.q}%` },
        )
        .orderBy("customer.createdAt", "DESC");

      if (queryFilters.ownerId)
        this.applyCustomerAccess(qb, queryFilters.ownerId);

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
    if (queryFilters.health) {
      where.health = queryFilters.health as any;
    }
    if (queryFilters.tag) {
      return this.findByTag(queryFilters.tag, skip, take, queryFilters.ownerId);
    }

    if (queryFilters.ownerId) {
      const qb = this.customerRepository
        .createQueryBuilder("customer")
        .leftJoinAndSelect("customer.tags", "tag")
        .orderBy("customer.createdAt", "DESC");
      this.applyCustomerAccess(qb, queryFilters.ownerId);
      if (queryFilters.region)
        qb.andWhere("customer.region LIKE :region", {
          region: `%${queryFilters.region}%`,
        });
      if (queryFilters.tier)
        qb.andWhere("customer.tier = :tier", { tier: queryFilters.tier });
      if (queryFilters.journeyStage)
        qb.andWhere("customer.journeyStage = :journeyStage", {
          journeyStage: queryFilters.journeyStage,
        });
      if (queryFilters.emailStatus)
        qb.andWhere("customer.emailStatus = :emailStatus", {
          emailStatus: queryFilters.emailStatus,
        });
      if (queryFilters.health)
        qb.andWhere("customer.health = :health", {
          health: queryFilters.health,
        });
      if (take > 0) qb.skip(skip).take(take);
      const [customers, total] = await qb.getManyAndCount();
      return { customers, total };
    }

    if (take > 0) {
      const [customers, total] = await this.customerRepository.findAndCount({
        where,
        order: { createdAt: "DESC" },
        skip,
        take,
      });
      return { customers, total };
    }

    const customers = await this.customerRepository.find({
      where,
      order: { createdAt: "DESC" },
    });
    return { customers, total: customers.length };
  }

  async findOne(id: number) {
    const customer = await this.customerRepository.findOne({
      where: { id },
      relations: ["tags"],
    });
    if (!customer) {
      throw new NotFoundException("客户不存在");
    }
    return customer;
  }

  async assertCustomerOwner(id: number, ownerId?: string) {
    const customer = await this.findOne(id);
    if (ownerId && !this.hasCustomerAccess(customer, ownerId)) {
      // Do not disclose whether another salesperson owns the record.
      throw new NotFoundException("客户不存在");
    }
    return customer;
  }

  async findByIdentifier(identifier: string | number) {
    const value = String(identifier ?? "").trim();
    const numericId = Number(value);
    const customer = await this.customerRepository.findOne({
      where:
        Number.isInteger(numericId) && numericId > 0
          ? [{ id: numericId }, { customerId: value }]
          : { customerId: value },
    });
    if (!customer) throw new NotFoundException("客户不存在");
    return customer;
  }

  async findContactByIdentifier(identifier: string | number) {
    const value = String(identifier ?? "").trim();
    const numericId = Number(value);
    const contact = await this.contactRepository.findOne({
      where:
        Number.isInteger(numericId) && numericId > 0
          ? [{ id: numericId }, { contactId: value }]
          : { contactId: value },
    });
    if (!contact) throw new NotFoundException("联系人不存在");
    return contact;
  }

  async markEmailSent(
    customerId: number,
    subject: string,
    recipientEmail: string,
  ) {
    const customer = await this.findOne(customerId);
    if (
      ![
        "qualified",
        "opportunity",
        "proposal",
        "negotiation",
        "won",
        "lost",
        "closed",
      ].includes(customer.journeyStage)
    ) {
      customer.journeyStage = "contacted";
    }
    customer.lastActivityAt = new Date();
    customer.lastActivityType = "email";
    if (!customer.health) customer.health = "good";
    await this.customerRepository.save(customer);
    const activity = this.activityRepository.create({
      customerId,
      activityId: this.generateId("activity"),
      type: "email",
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
        throw new BadRequestException("该邮箱已被其他客户使用");
      }
    }

    const { tags, ...rest } = createCustomerDto;
    rest.collaboratorIds = this.normalizeCollaboratorIds(
      rest.collaboratorIds,
      rest.ownerId,
    );
    const customer = this.customerRepository.create({
      ...rest,
      customerId: this.generateId("cus"),
    });

    if (tags && tags.length > 0) {
      customer.tags = await this.getOrCreateTags(tags);
    }

    return this.customerRepository.save(customer);
  }

  async update(id: number, updateCustomerDto: UpdateCustomerDto) {
    const customer = await this.findOne(id);
    const { tags, ...rest } = updateCustomerDto;
    if (rest.collaboratorIds !== undefined) {
      rest.collaboratorIds = this.normalizeCollaboratorIds(
        rest.collaboratorIds,
        rest.ownerId ?? customer.ownerId,
      );
    }

    if (rest.email && rest.email !== customer.email) {
      const existing = await this.customerRepository.findOne({
        where: { email: rest.email },
      });
      if (existing && existing.id !== id) {
        throw new BadRequestException("该邮箱已被其他客户使用");
      }
      rest.emailStatus = "unknown";
      (rest as any).emailFailureReason = "";
      (rest as any).emailFailedAt = null;
    }

    if (
      rest.journeyStage !== undefined &&
      rest.journeyStage !== customer.journeyStage
    ) {
      await this.syncCurrentOpportunityFromCustomer(
        customer,
        rest.journeyStage,
      );
    }

    Object.assign(customer, rest);

    if (tags) {
      customer.tags = await this.getOrCreateTags(tags);
    }

    return this.customerRepository.save(customer);
  }

  async remove(id: number) {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) throw new NotFoundException("客户不存在");
    // Soft delete
    await this.customerRepository.softDelete(id);
    return { deleted: true };
  }

  // ==================== Trash / Recycle Bin ====================

  async findTrash() {
    const customers = await this.customerRepository.find({
      withDeleted: true,
      where: { deletedAt: Not(IsNull()), mergedIntoId: IsNull() } as any,
      order: { deletedAt: "DESC" },
    });
    return customers.map((c) => ({
      id: c.customerId || String(c.id),
      name: c.company,
      company: c.company,
      email: c.email,
      type: "客户",
      deletedAt: c.deletedAt,
    }));
  }

  async restore(id: number) {
    const customer = await this.customerRepository.findOne({
      withDeleted: true,
      where: { id },
    });
    if (!customer) throw new NotFoundException("客户不存在");
    if (!customer.deletedAt)
      throw new BadRequestException("该客户不在回收站中");
    if (customer.mergedIntoId)
      throw new BadRequestException(
        "已合并客户不能从回收站恢复，请查看合并审计记录",
      );
    await this.customerRepository.restore(id);
    return { restored: true };
  }

  async deletePermanent(id: number) {
    const customer = await this.customerRepository.findOne({
      withDeleted: true,
      where: { id },
    });
    if (!customer) throw new NotFoundException("客户不存在");
    await this.customerRepository.remove(customer);
    return { deleted: true };
  }

  async findAllIds(filters: Record<string, any> = {}) {
    const result = await this.findAll(filters);
    const customers = (result as any).customers || result;
    return (Array.isArray(customers) ? customers : []).map(
      (c: any) => c.customerId,
    );
  }

  async deleteAll() {
    const count = await this.customerRepository.count();
    await this.customerRepository.clear();
    return { deleted: count };
  }

  async clearEmailException(id: number) {
    const customer = await this.findOne(id);
    customer.emailStatus = "unknown" as any;
    (customer as any).emailFailureReason = "";
    (customer as any).emailFailedAt = null;
    return this.customerRepository.save(customer);
  }

  private async findByTag(
    tagName: string,
    skip: number,
    take: number,
    ownerId?: string,
  ) {
    const qb = this.customerRepository
      .createQueryBuilder("customer")
      .leftJoinAndSelect("customer.tags", "tag")
      .where("tag.name = :tagName", { tagName })
      .orderBy("customer.createdAt", "DESC");
    if (ownerId) this.applyCustomerAccess(qb, ownerId);

    if (take > 0) qb.skip(skip).take(take);
    const [customers, total] = await qb.getManyAndCount();
    return { customers, total };
  }

  private applyCustomerAccess(qb: any, userId: string) {
    qb.andWhere(
      "(customer.ownerId = :customerAccessUserId OR JSON_CONTAINS(COALESCE(customer.collaboratorIds, JSON_ARRAY()), JSON_QUOTE(:customerAccessUserId)))",
      { customerAccessUserId: userId },
    );
  }

  private hasCustomerAccess(customer: Customer, userId: string) {
    return (
      customer.ownerId === userId ||
      (Array.isArray(customer.collaboratorIds) &&
        customer.collaboratorIds.includes(userId))
    );
  }

  private normalizeCollaboratorIds(ids?: string[], ownerId?: string) {
    return [
      ...new Set(
        (Array.isArray(ids) ? ids : [])
          .map((id) => String(id).trim())
          .filter((id) => id && id !== ownerId),
      ),
    ];
  }

  async bulkDelete(bulkDeleteDto: BulkDeleteDto, ownerId?: string) {
    const ids = ownerId
      ? (await this.findAccessibleCustomers(bulkDeleteDto.ids, ownerId)).map(
          (customer) => customer.id,
        )
      : bulkDeleteDto.ids;
    if (!ids.length) return { deleted: 0 };
    const result = await this.customerRepository.softDelete({ id: In(ids) });
    return { deleted: result.affected || 0 };
  }

  async bulkTags(bulkTagsDto: BulkTagsDto, ownerId?: string) {
    const { ids, action, tag } = bulkTagsDto;
    const tagEntity = await this.getOrCreateTags([tag]);
    const customers = ownerId
      ? await this.findAccessibleCustomers(ids, ownerId, true)
      : await this.customerRepository.find({
          where: { id: In(ids) },
          relations: ["tags"],
        });

    let updated = 0;
    for (const customer of customers) {
      if (action === "add") {
        if (!customer.tags.some((t) => t.name === tag)) {
          customer.tags.push(tagEntity[0]);
          updated++;
        }
      } else if (action === "remove") {
        customer.tags = customer.tags.filter((t) => t.name !== tag);
        updated++;
      }
      await this.customerRepository.save(customer);
    }

    return { updated, tag, action };
  }

  async bulkTier(bulkTierDto: BulkTierDto, ownerId?: string) {
    const ids = ownerId
      ? (await this.findAccessibleCustomers(bulkTierDto.ids, ownerId)).map(
          (customer) => customer.id,
        )
      : bulkTierDto.ids;
    if (!ids.length) return { updated: 0, tier: bulkTierDto.tier };
    const result = await this.customerRepository.update(
      { id: In(ids) },
      { tier: bulkTierDto.tier as any },
    );
    return { updated: result.affected || 0, tier: bulkTierDto.tier };
  }

  private async findAccessibleCustomers(
    ids: number[],
    userId: string,
    withTags = false,
  ) {
    if (!ids.length) return [];
    const qb = this.customerRepository
      .createQueryBuilder("customer")
      .where("customer.id IN (:...customerAccessIds)", {
        customerAccessIds: ids,
      });
    if (withTags) qb.leftJoinAndSelect("customer.tags", "tag");
    this.applyCustomerAccess(qb, userId);
    return qb.getMany();
  }

  async getCustomer360(id: number, ownerId?: string) {
    const customer = await this.assertCustomerOwner(id, ownerId);
    const [
      contacts,
      activities,
      todos,
      opportunities,
      quotes,
      samples,
      emailLogs,
    ] = await Promise.all([
      this.contactRepository.find({
        where: { customerId: id },
        order: { isPrimary: "DESC", name: "ASC" },
      }),
      this.activityRepository.find({
        where: { customerId: id },
        order: { createdAt: "DESC" },
      }),
      this.todoRepository.find({
        where: { customerId: id },
        order: { status: "ASC", dueAt: "ASC" },
      }),
      this.opportunityRepository.find({
        where: { customerId: id },
        order: { updatedAt: "DESC" },
      }),
      this.quoteRepository.find({
        where: { customerId: id },
        relations: ["items"],
        order: { updatedAt: "DESC" },
      }),
      this.sampleRepository.find({
        where: { customerId: id },
        order: { updatedAt: "DESC" },
      }),
      this.emailLogRepository.find({
        where: { customerId: customer.customerId },
        order: { sentAt: "DESC" },
        take: 100,
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
      sendLogs: emailLogs.map((log) => ({
        id: log.logId || String(log.id),
        email: log.recipientEmail,
        customerId: log.customerId,
        customerName: log.customerName || customer.company,
        contactId: log.contactId || "",
        templateId: log.templateId || "",
        templateName: log.templateName || "",
        taskId: log.emailTaskId || "",
        taskName: log.taskName || "",
        subject: log.subject || "",
        status: log.status,
        message: log.errorMessage || "",
        createdAt: log.sentAt,
      })),
    };
  }

  // ==================== Tags ====================

  async getAllTags() {
    const tags = await this.tagRepository.find({ order: { name: "ASC" } });
    return tags.map((t) => t.name);
  }

  async createTag(name: string) {
    if (!name) throw new BadRequestException("请输入标签名称");
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
      throw new NotFoundException("标签不存在");
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
      order: { isPrimary: "DESC", name: "ASC" },
    });
  }

  async createContact(
    customerId: number,
    createContactDto: CreateContactDto,
    ownerId?: string,
  ) {
    await this.assertCustomerOwner(customerId, ownerId);

    if (createContactDto.isPrimary) {
      await this.contactRepository.update({ customerId }, { isPrimary: false });
    }

    const contact = this.contactRepository.create({
      ...createContactDto,
      customerId,
      contactId: this.generateId("contact"),
    });

    const saved = await this.contactRepository.save(contact);
    await this.refreshCustomerContactSummary(customerId);
    return saved;
  }

  async updateContact(
    id: number,
    updateContactDto: UpdateContactDto,
    ownerId?: string,
  ) {
    const contact = await this.contactRepository.findOne({ where: { id } });
    if (!contact) throw new NotFoundException("联系人不存在");

    await this.assertCustomerOwner(contact.customerId, ownerId);
    if (updateContactDto.isPrimary) {
      await this.contactRepository.update(
        { customerId: contact.customerId },
        { isPrimary: false },
      );
    }

    Object.assign(contact, updateContactDto);
    const saved = await this.contactRepository.save(contact);
    await this.refreshCustomerContactSummary(contact.customerId);
    return saved;
  }

  async deleteContact(id: number, ownerId?: string) {
    const contact = await this.contactRepository.findOne({ where: { id } });
    if (!contact) throw new NotFoundException("联系人不存在");
    await this.assertCustomerOwner(contact.customerId, ownerId);
    const result = await this.contactRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("联系人不存在");
    if (contact.isPrimary) {
      const next = await this.contactRepository.findOne({
        where: { customerId: contact.customerId },
        order: { createdAt: "ASC" },
      });
      if (next) {
        next.isPrimary = true;
        await this.contactRepository.save(next);
      }
    }
    await this.refreshCustomerContactSummary(contact.customerId);
    return { deleted: true };
  }

  private async refreshCustomerContactSummary(customerId: number) {
    const customer = await this.findOne(customerId);
    const primary =
      (await this.contactRepository.findOne({
        where: { customerId, isPrimary: true },
      })) ||
      (await this.contactRepository.findOne({
        where: { customerId },
        order: { createdAt: "ASC" },
      }));
    customer.contact = primary?.name || "";
    customer.email = primary?.email || "";
    customer.phone = primary?.phone || "";
    await this.customerRepository.save(customer);
  }

  // ==================== Activities ====================

  async findActivities(customerId: number, ownerId?: string) {
    await this.assertCustomerOwner(customerId, ownerId);
    return this.activityRepository.find({
      where: { customerId },
      order: { createdAt: "DESC" },
    });
  }

  async createActivity(
    customerId: number,
    createActivityDto: CreateActivityDto,
    ownerId?: string,
  ) {
    const customer = await this.assertCustomerOwner(customerId, ownerId);
    if (!createActivityDto.subject && !createActivityDto.content) {
      throw new BadRequestException("请填写跟进内容");
    }

    const activity = this.activityRepository.create({
      ...createActivityDto,
      customerId,
      activityId: this.generateId("activity"),
    });

    const saved = await this.activityRepository.save(activity);
    customer.lastActivityAt = saved.createdAt || new Date();
    customer.lastActivityType = saved.type || "note";
    if (!customer.health) customer.health = "good";
    await this.customerRepository.save(customer);
    return saved;
  }

  // ==================== Todos ====================

  async findTodos(filters: Record<string, any> = {}) {
    if (filters.ownerId) {
      const qb = this.todoRepository
        .createQueryBuilder("todo")
        .leftJoinAndSelect("todo.customer", "customer")
        .orderBy("todo.status", "ASC")
        .addOrderBy("todo.dueAt", "ASC");
      if (filters.status)
        qb.andWhere("todo.status = :todoStatus", {
          todoStatus: filters.status,
        });
      if (filters.customerId)
        qb.andWhere("todo.customerId = :todoCustomerId", {
          todoCustomerId: filters.customerId,
        });
      this.applyCustomerAccess(qb, filters.ownerId);
      return qb.getMany();
    }
    const where: FindOptionsWhere<Todo> = {};
    if (filters.status) where.status = filters.status;
    if (filters.customerId) where.customerId = filters.customerId;
    return this.todoRepository.find({
      where,
      order: { status: "ASC", dueAt: "ASC" },
    });
  }

  async createTodo(createTodoDto: CreateTodoDto) {
    await this.findOne(createTodoDto.customerId);
    const todo = this.todoRepository.create({
      ...createTodoDto,
      todoId: this.generateId("todo"),
    });
    const saved = await this.todoRepository.save(todo);
    await this.refreshCustomerTodoSummary(saved.customerId);
    return saved;
  }

  async updateTodo(id: number, updateTodoDto: UpdateTodoDto) {
    const todo = await this.todoRepository.findOne({ where: { id } });
    if (!todo) throw new NotFoundException("待办不存在");

    Object.assign(todo, updateTodoDto);
    if (updateTodoDto.status === "done") {
      todo.completedAt = new Date();
    } else if (updateTodoDto.status === "open") {
      todo.completedAt = null as any;
    }
    const saved = await this.todoRepository.save(todo);
    await this.refreshCustomerTodoSummary(saved.customerId);
    return saved;
  }

  async deleteTodo(id: number) {
    const todo = await this.todoRepository.findOne({ where: { id } });
    if (!todo) throw new NotFoundException("待办不存在");
    const result = await this.todoRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("待办不存在");
    await this.refreshCustomerTodoSummary(todo.customerId);
    return { deleted: true };
  }

  private async refreshCustomerTodoSummary(customerId: number) {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) return;

    const openTodos = await this.todoRepository.find({
      where: { customerId, status: "open" },
      order: { createdAt: "ASC" },
    });
    const withDueDate = openTodos
      .filter((todo) => Boolean(todo.dueAt))
      .sort(
        (left, right) =>
          new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime(),
      );
    const nextTodo = withDueDate[0] || openTodos[0];

    const openOpportunity = nextTodo
      ? undefined
      : (await this.listCustomerOpportunities(customerId))
          .filter(
            (opportunity) =>
              !["won", "lost"].includes(opportunity.stage) &&
              Boolean(String(opportunity.nextStepAction || "").trim()),
          )
          .sort((left, right) => {
            const leftTime = left.nextStepDueDate
              ? new Date(left.nextStepDueDate).getTime()
              : Number.MAX_SAFE_INTEGER;
            const rightTime = right.nextStepDueDate
              ? new Date(right.nextStepDueDate).getTime()
              : Number.MAX_SAFE_INTEGER;
            return leftTime - rightTime;
          })[0];

    customer.nextTodoAt = (nextTodo?.dueAt ||
      openOpportunity?.nextStepDueDate ||
      null) as any;
    customer.nextTodoTitle =
      nextTodo?.title || openOpportunity?.nextStepAction || "";
    const nextActionOverdue = Boolean(
      openOpportunity?.nextStepDueDate &&
        new Date(openOpportunity.nextStepDueDate).getTime() < Date.now(),
    );
    customer.health =
      withDueDate.some(
        (todo) => new Date(todo.dueAt).getTime() < Date.now(),
      ) || nextActionOverdue
      ? "critical"
      : openTodos.length > 0 || openOpportunity
        ? "warning"
        : "good";
    await this.customerRepository.save(customer);
  }

  // ==================== Opportunities ====================

  async findOpportunities(filters: Record<string, any> = {}) {
    if (filters.ownerId) {
      const qb = this.opportunityRepository
        .createQueryBuilder("opportunity")
        .leftJoinAndSelect("opportunity.customer", "customer")
        .orderBy("opportunity.updatedAt", "DESC");
      if (filters.customerId)
        qb.andWhere("opportunity.customerId = :opportunityCustomerId", {
          opportunityCustomerId: filters.customerId,
        });
      this.applyCustomerAccess(qb, filters.ownerId);
      return qb.getMany();
    }
    const where: FindOptionsWhere<Opportunity> = {};
    if (filters.customerId) where.customerId = filters.customerId;
    return this.opportunityRepository.find({
      where,
      relations: ["customer"],
      order: { updatedAt: "DESC" },
    });
  }

  async createOpportunity(
    createOpportunityDto: CreateOpportunityDto,
    actor: OpportunityActor = { userId: "", displayName: "系统" },
  ) {
    const customer = await this.findOne(createOpportunityDto.customerId);
    const stage = createOpportunityDto.stage || "prospecting";
    this.assertOpportunityCanClose(
      stage,
      createOpportunityDto.winReason,
      createOpportunityDto.lossReason,
    );
    const ownerId = String(
      createOpportunityDto.ownerId || customer.ownerId || actor.userId || "",
    );
    this.assertOpportunityRequiredFields(
      stage,
      ownerId,
      createOpportunityDto.nextStepAction,
      createOpportunityDto.expectedCloseDate,
      createOpportunityDto.winReason,
      createOpportunityDto.lossReason,
    );
    const now = new Date();
    const opportunity = this.opportunityRepository.create({
      ...createOpportunityDto,
      stage,
      ownerId,
      collaboratorIds: this.normalizeCollaboratorIds(
        createOpportunityDto.collaboratorIds ?? customer.collaboratorIds,
        ownerId,
      ),
      currency: String(
        createOpportunityDto.currency || customer.preferredCurrency || "USD",
      ).toUpperCase(),
      probability: ["won", "lost"].includes(stage)
        ? this.defaultProbability(stage)
        : (createOpportunityDto.probability ?? this.defaultProbability(stage)),
      forecastCategory: this.forecastCategoryForStage(
        stage,
        createOpportunityDto.forecastCategory,
      ),
      stageEnteredAt: now,
      closedAt: ["won", "lost"].includes(stage) ? now : null,
      opportunityId: this.generateId("opp"),
    });
    const saved = await this.opportunityRepository.save(opportunity);
    await this.recordOpportunityStage(saved, null, actor, 0);
    await this.refreshCustomerOpportunityState(saved.customerId, saved);
    return saved;
  }

  async updateOpportunity(
    id: number,
    updateOpportunityDto: UpdateOpportunityDto,
    actor: OpportunityActor = { userId: "", displayName: "系统" },
  ) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
    });
    if (!opportunity) throw new NotFoundException("商机不存在");
    const targetCustomer = await this.findOne(
      updateOpportunityDto.customerId || opportunity.customerId,
    );
    const previousCustomerId = opportunity.customerId;
    const previousStage = opportunity.stage;
    const previousStageEnteredAt =
      opportunity.stageEnteredAt ||
      opportunity.updatedAt ||
      opportunity.createdAt ||
      new Date();
    const nextStage = updateOpportunityDto.stage || previousStage;
    this.assertOpportunityCanClose(
      nextStage,
      updateOpportunityDto.winReason ?? opportunity.winReason,
      updateOpportunityDto.lossReason ?? opportunity.lossReason,
    );

    const nextOwnerId = String(
      updateOpportunityDto.ownerId ||
        opportunity.ownerId ||
        targetCustomer.ownerId ||
        actor.userId ||
        "",
    );
    this.assertOpportunityRequiredFields(
      nextStage,
      nextOwnerId,
      updateOpportunityDto.nextStepAction ?? opportunity.nextStepAction,
      updateOpportunityDto.expectedCloseDate ?? opportunity.expectedCloseDate,
      updateOpportunityDto.winReason ?? opportunity.winReason,
      updateOpportunityDto.lossReason ?? opportunity.lossReason,
    );
    if (
      updateOpportunityDto.collaboratorIds !== undefined ||
      updateOpportunityDto.ownerId !== undefined
    ) {
      updateOpportunityDto.collaboratorIds = this.normalizeCollaboratorIds(
        updateOpportunityDto.collaboratorIds ?? opportunity.collaboratorIds,
        nextOwnerId,
      );
    }
    if (updateOpportunityDto.currency !== undefined) {
      updateOpportunityDto.currency = String(
        updateOpportunityDto.currency || "USD",
      ).toUpperCase();
    }

    Object.assign(opportunity, updateOpportunityDto);
    opportunity.ownerId = nextOwnerId;
    if (
      updateOpportunityDto.stage &&
      updateOpportunityDto.probability === undefined
    ) {
      opportunity.probability = this.defaultProbability(
        updateOpportunityDto.stage,
      );
    }
    if (["won", "lost"].includes(nextStage)) {
      opportunity.probability = this.defaultProbability(nextStage);
    }
    if (nextStage !== previousStage) {
      const now = new Date();
      opportunity.stageEnteredAt = now;
      opportunity.closedAt = ["won", "lost"].includes(nextStage) ? now : null;
      opportunity.forecastCategory = this.forecastCategoryForStage(
        nextStage,
        updateOpportunityDto.forecastCategory || opportunity.forecastCategory,
      );
    } else if (["won", "lost"].includes(nextStage)) {
      opportunity.closedAt = opportunity.closedAt || new Date();
      opportunity.forecastCategory = "closed";
    }

    const saved = await this.opportunityRepository.save(opportunity);
    if (nextStage !== previousStage) {
      const durationHours = Math.max(
        0,
        Math.floor(
          (saved.stageEnteredAt.getTime() -
            new Date(previousStageEnteredAt).getTime()) /
            3_600_000,
        ),
      );
      await this.recordOpportunityStage(
        saved,
        previousStage,
        actor,
        durationHours,
      );
    }
    await this.refreshCustomerOpportunityState(saved.customerId, saved);
    if (previousCustomerId !== saved.customerId) {
      await this.refreshCustomerOpportunityState(previousCustomerId);
    }
    return saved;
  }

  async findOpportunityStageHistory(id: number) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
    });
    if (!opportunity) throw new NotFoundException("商机不存在");
    if (!this.opportunityStageHistoryRepository) return [];
    return this.opportunityStageHistoryRepository.find({
      where: { opportunityPk: id },
      order: { changedAt: "DESC", id: "DESC" },
    });
  }

  async deleteOpportunity(id: number) {
    const opportunity = await this.opportunityRepository.findOne({
      where: { id },
    });
    if (!opportunity) throw new NotFoundException("商机不存在");
    const result = await this.opportunityRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("商机不存在");
    await this.refreshCustomerOpportunityState(opportunity.customerId);
    return { deleted: true };
  }

  private async syncCurrentOpportunityFromCustomer(
    customer: Customer,
    journeyStage: Customer["journeyStage"],
  ) {
    const targetStage = this.opportunityStageFromJourney(journeyStage);
    const opportunities = await this.listCustomerOpportunities(customer.id);
    const current = opportunities[0];

    if (!targetStage) {
      if (current) {
        throw new BadRequestException(
          "该客户已有商机，请在商机看板调整阶段，或先删除不再需要的商机",
        );
      }
      customer.openOpportunityCount = 0;
      customer.openOpportunityValue = 0;
      return;
    }

    if (["won", "lost"].includes(targetStage)) {
      throw new BadRequestException(
        targetStage === "won"
          ? "请在商机中填写赢单原因后再关闭商机，客户状态会自动更新"
          : "请在商机中填写输单原因后再关闭商机，客户状态会自动更新",
      );
    }

    if (!current) {
      // Qualified customers do not become opportunities until the user explicitly
      // selects "opportunity" or a later sales stage.
      if (journeyStage === "qualified") {
        customer.openOpportunityCount = 0;
        customer.openOpportunityValue = 0;
        return;
      }
      const ownerId = String(customer.ownerId || "").trim();
      const expectedCloseDate = this.defaultExpectedCloseDate();
      this.assertOpportunityRequiredFields(
        targetStage,
        ownerId,
        customer.nextTodoTitle,
        expectedCloseDate,
      );
      const opportunity = this.opportunityRepository.create({
        customerId: customer.id,
        opportunityId: this.generateId("opp"),
        name: `${customer.company || customer.contact || "客户"} - 商机`,
        stage: targetStage,
        probability: this.defaultProbability(targetStage),
        forecastCategory: this.forecastCategoryForStage(targetStage),
        ownerId,
        collaboratorIds: this.normalizeCollaboratorIds(
          customer.collaboratorIds,
          customer.ownerId,
        ),
        currency: customer.preferredCurrency || "USD",
        nextStepAction: customer.nextTodoTitle,
        nextStepDueDate: customer.nextTodoAt,
        expectedCloseDate,
        stageEnteredAt: new Date(),
      });
      const saved = await this.opportunityRepository.save(opportunity);
      await this.recordOpportunityStage(
        saved,
        null,
        { userId: "", displayName: "客户 360°" },
        0,
      );
      opportunities.unshift(saved);
    } else {
      const previousStage = current.stage;
      const previousStageEnteredAt =
        current.stageEnteredAt ||
        current.updatedAt ||
        current.createdAt ||
        new Date();
      current.stage = targetStage;
      current.probability = this.defaultProbability(targetStage);
      current.forecastCategory = this.forecastCategoryForStage(
        targetStage,
        current.forecastCategory,
      );
      current.ownerId = current.ownerId || customer.ownerId;
      current.nextStepAction =
        current.nextStepAction || customer.nextTodoTitle;
      current.nextStepDueDate =
        current.nextStepDueDate || customer.nextTodoAt;
      current.expectedCloseDate =
        current.expectedCloseDate || this.defaultExpectedCloseDate();
      this.assertOpportunityRequiredFields(
        targetStage,
        current.ownerId,
        current.nextStepAction,
        current.expectedCloseDate,
        current.winReason,
        current.lossReason,
      );
      if (previousStage !== targetStage) current.stageEnteredAt = new Date();
      const saved = await this.opportunityRepository.save(current);
      if (previousStage !== targetStage) {
        await this.recordOpportunityStage(
          saved,
          previousStage,
          { userId: "", displayName: "客户 360°" },
          Math.max(
            0,
            Math.floor(
              (saved.stageEnteredAt.getTime() -
                new Date(previousStageEnteredAt).getTime()) /
                3_600_000,
            ),
          ),
        );
      }
    }

    this.assignOpportunityMetrics(customer, opportunities);
    const activeOpportunity = opportunities.find(
      (item) => !["won", "lost"].includes(item.stage),
    );
    if (activeOpportunity && !customer.ownerId) {
      customer.ownerId = activeOpportunity.ownerId;
    }
  }

  private async refreshCustomerOpportunityState(
    customerId: number,
    preferred?: Opportunity,
  ) {
    const customer = await this.customerRepository.findOne({
      where: { id: customerId },
    });
    if (!customer) return;
    const opportunities = await this.listCustomerOpportunities(customerId);
    const current = preferred
      ? opportunities.find((item) => item.id === preferred.id) || preferred
      : opportunities[0];
    this.assignOpportunityMetrics(customer, opportunities);
    const activeOpportunity = opportunities.find(
      (item) => !["won", "lost"].includes(item.stage),
    );
    if (activeOpportunity && !customer.ownerId) {
      customer.ownerId = activeOpportunity.ownerId;
    }
    if (current) {
      customer.journeyStage = this.journeyStageFromOpportunity(current.stage);
    } else if (this.opportunityStageFromJourney(customer.journeyStage)) {
      customer.journeyStage = "qualified";
    }
    await this.customerRepository.save(customer);
    await this.refreshCustomerTodoSummary(customerId);
  }

  private listCustomerOpportunities(customerId: number) {
    return this.opportunityRepository.find({
      where: { customerId },
      order: { updatedAt: "DESC", id: "DESC" },
    });
  }

  private assignOpportunityMetrics(
    customer: Customer,
    opportunities: Opportunity[],
  ) {
    const open = opportunities.filter(
      (item) => !["won", "lost"].includes(item.stage),
    );
    customer.openOpportunityCount = open.length;
    customer.openOpportunityValue = open.reduce(
      (sum, item) => sum + Number(item.amount || 0),
      0,
    );
  }

  private journeyStageFromOpportunity(
    stage: Opportunity["stage"],
  ): Customer["journeyStage"] {
    const stages: Record<Opportunity["stage"], Customer["journeyStage"]> = {
      prospecting: "opportunity",
      qualification: "qualified",
      proposal: "proposal",
      negotiation: "negotiation",
      won: "won",
      lost: "lost",
    };
    return stages[stage];
  }

  private opportunityStageFromJourney(
    stage: Customer["journeyStage"],
  ): Opportunity["stage"] | undefined {
    const stages: Partial<
      Record<Customer["journeyStage"], Opportunity["stage"]>
    > = {
      qualified: "qualification",
      opportunity: "prospecting",
      proposal: "proposal",
      negotiation: "negotiation",
      won: "won",
      lost: "lost",
    };
    return stages[stage];
  }

  private defaultProbability(stage: Opportunity["stage"]) {
    return {
      prospecting: 10,
      qualification: 30,
      proposal: 60,
      negotiation: 80,
      won: 100,
      lost: 0,
    }[stage];
  }

  private forecastCategoryForStage(
    stage: Opportunity["stage"],
    requested?: Opportunity["forecastCategory"],
  ): Opportunity["forecastCategory"] {
    if (["won", "lost"].includes(stage)) return "closed";
    if (!requested || requested === "closed") return "pipeline";
    return requested;
  }

  private assertOpportunityCanClose(
    stage: Opportunity["stage"],
    winReason?: string | null,
    lossReason?: string | null,
  ) {
    if (stage === "won" && !String(winReason || "").trim()) {
      throw new BadRequestException("商机关闭为赢单前必须填写赢单原因");
    }
    if (stage === "lost" && !String(lossReason || "").trim()) {
      throw new BadRequestException("商机关闭为输单前必须填写输单原因");
    }
  }

  private assertOpportunityRequiredFields(
    stage: Opportunity["stage"],
    ownerId?: string | null,
    nextStepAction?: string | null,
    expectedCloseDate?: string | Date | null,
    winReason?: string | null,
    lossReason?: string | null,
  ) {
    if (!String(ownerId || "").trim()) {
      throw new BadRequestException("商机必须指定负责人");
    }
    if (!expectedCloseDate) {
      throw new BadRequestException("商机必须填写预计成交日期");
    }
    if (
      !["won", "lost"].includes(stage) &&
      !String(nextStepAction || "").trim()
    ) {
      throw new BadRequestException("未关闭商机必须填写下一步行动");
    }
    this.assertOpportunityCanClose(stage, winReason, lossReason);
  }

  private defaultExpectedCloseDate() {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 90);
    return date;
  }

  private async recordOpportunityStage(
    opportunity: Opportunity,
    fromStage: Opportunity["stage"] | null,
    actor: OpportunityActor,
    durationHours: number,
  ) {
    if (!this.opportunityStageHistoryRepository) return;
    const changeNote =
      opportunity.stage === "won"
        ? opportunity.winReason
        : opportunity.stage === "lost"
          ? opportunity.lossReason
          : opportunity.nextStepAction;
    const history = this.opportunityStageHistoryRepository.create({
      opportunityPk: opportunity.id,
      opportunityKey: opportunity.opportunityId,
      fromStage,
      toStage: opportunity.stage,
      durationHours,
      changedById: actor.userId || "",
      changedByName: actor.displayName || "系统",
      changeNote: changeNote || "",
    });
    await this.opportunityStageHistoryRepository.save(history);
  }

  // ==================== Quotes ====================

  async findQuotes(filters: Record<string, any> = {}) {
    if (filters.ownerId) {
      const qb = this.quoteRepository
        .createQueryBuilder("quote")
        .leftJoinAndSelect("quote.customer", "customer")
        .leftJoinAndSelect("quote.items", "item")
        .orderBy("quote.updatedAt", "DESC");
      if (filters.customerId)
        qb.andWhere("quote.customerId = :quoteCustomerId", {
          quoteCustomerId: filters.customerId,
        });
      if (filters.status)
        qb.andWhere("quote.status = :quoteStatus", {
          quoteStatus: filters.status,
        });
      this.applyCustomerAccess(qb, filters.ownerId);
      return qb.getMany();
    }
    const where: FindOptionsWhere<Quote> = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status as any;
    return this.quoteRepository.find({
      where,
      relations: ["customer", "items"],
      order: { updatedAt: "DESC" },
    });
  }

  async findQuote(id: number) {
    const quote = await this.quoteRepository.findOne({
      where: { id },
      relations: ["customer", "items"],
    });
    if (!quote) throw new NotFoundException("报价不存在");
    return quote;
  }

  async createQuote(createQuoteDto: CreateQuoteDto) {
    await this.findOne(createQuoteDto.customerId);
    if (!createQuoteDto.items || createQuoteDto.items.length === 0) {
      throw new BadRequestException("请至少添加一个报价产品");
    }

    const {
      items,
      subtotal: _subtotal,
      taxAmount: _taxAmount,
      total: _total,
      ...quoteFields
    } = createQuoteDto;
    const calculated = this.calculateQuote(
      items,
      quoteFields.freight,
      quoteFields.taxRate,
    );
    const quote = this.quoteRepository.create({
      ...quoteFields,
      ...calculated,
      quoteId: this.generateId("quote"),
      quoteNo: createQuoteDto.quoteNo || (await this.generateQuoteNo()),
      items: calculated.items as any,
    });

    return this.quoteRepository.save(quote);
  }

  async updateQuote(id: number, updateQuoteDto: UpdateQuoteDto) {
    const quote = await this.findQuote(id);
    if (updateQuoteDto.items && updateQuoteDto.items.length === 0) {
      throw new BadRequestException("请至少添加一个报价产品");
    }
    if (
      updateQuoteDto.customerId &&
      updateQuoteDto.customerId !== quote.customerId
    ) {
      await this.findOne(updateQuoteDto.customerId);
    }
    const { items, ...quoteFields } = updateQuoteDto;
    Object.assign(quote, quoteFields);
    const sourceItems = items
      ? items.map((item, index) => ({ ...quote.items[index], ...item }))
      : quote.items;
    const calculated = this.calculateQuote(
      sourceItems,
      quote.freight,
      quote.taxRate,
    );
    Object.assign(quote, calculated);
    return this.quoteRepository.save(quote);
  }

  private calculateQuote(
    items: CreateQuoteDto["items"],
    freight = 0,
    taxRate = 0,
  ) {
    const calculatedItems = items.map((item) => {
      const quantity = Number(item.quantity ?? 1);
      const unitPrice = Number(item.unitPrice ?? 0);
      const discount = Number(item.discount ?? 0);
      const subtotal = this.roundMoney(
        quantity * unitPrice * (1 - discount / 100),
      );
      return { ...item, quantity, unitPrice, discount, subtotal };
    });
    const subtotal = this.roundMoney(
      calculatedItems.reduce((sum, item) => sum + item.subtotal, 0),
    );
    const normalizedFreight = this.roundMoney(Number(freight || 0));
    const normalizedTaxRate = Number(taxRate || 0);
    const taxAmount = this.roundMoney((subtotal * normalizedTaxRate) / 100);
    return {
      items: calculatedItems,
      subtotal,
      freight: normalizedFreight,
      taxRate: normalizedTaxRate,
      taxAmount,
      total: this.roundMoney(subtotal + normalizedFreight + taxAmount),
    };
  }

  private roundMoney(value: number) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  async deleteQuote(id: number) {
    const result = await this.quoteRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("报价不存在");
    return { deleted: true };
  }

  private async generateQuoteNo(): Promise<string> {
    const now = new Date();
    const prefix = `Q-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
    const count = await this.quoteRepository.count({
      where: { quoteNo: Like(`${prefix}%`) },
    });
    return `${prefix}-${String(count + 1).padStart(3, "0")}`;
  }

  // ==================== Samples ====================

  async findSamples(filters: Record<string, any> = {}) {
    if (filters.ownerId) {
      const qb = this.sampleRepository
        .createQueryBuilder("sample")
        .leftJoinAndSelect("sample.customer", "customer")
        .orderBy("sample.updatedAt", "DESC");
      if (filters.customerId)
        qb.andWhere("sample.customerId = :sampleCustomerId", {
          sampleCustomerId: filters.customerId,
        });
      if (filters.status)
        qb.andWhere("sample.status = :sampleStatus", {
          sampleStatus: filters.status,
        });
      this.applyCustomerAccess(qb, filters.ownerId);
      return qb.getMany();
    }
    const where: FindOptionsWhere<Sample> = {};
    if (filters.customerId) where.customerId = filters.customerId;
    if (filters.status) where.status = filters.status as any;
    return this.sampleRepository.find({
      where,
      relations: ["customer"],
      order: { updatedAt: "DESC" },
    });
  }

  async createSample(createSampleDto: CreateSampleDto) {
    await this.findOne(createSampleDto.customerId);
    const sample = this.sampleRepository.create({
      ...createSampleDto,
      sampleId: this.generateId("sample"),
    });
    this.applySampleStatusDates(sample);
    return this.sampleRepository.save(sample);
  }

  async updateSample(id: number, updateSampleDto: UpdateSampleDto) {
    const sample = await this.sampleRepository.findOne({ where: { id } });
    if (!sample) throw new NotFoundException("样品记录不存在");
    Object.assign(sample, updateSampleDto);
    this.applySampleStatusDates(sample);
    return this.sampleRepository.save(sample);
  }

  private applySampleStatusDates(sample: Sample) {
    if (["sent", "delivered"].includes(sample.status) && !sample.sentAt) {
      sample.sentAt = new Date();
    }
    if (sample.status === "delivered" && !sample.deliveredAt) {
      sample.deliveredAt = new Date();
    }
  }

  async deleteSample(id: number) {
    const result = await this.sampleRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("样品记录不存在");
    return { deleted: true };
  }

  async findContactsForCustomers(customerIds: number[]) {
    if (!customerIds.length) return [];
    return this.contactRepository.find({
      where: { customerId: In(customerIds) },
      order: { isPrimary: "DESC", name: "ASC" },
    });
  }

  async isCustomerEmailMarketingAllowed(customerId: number, email: string) {
    const normalized = this.normalizeEmail(email);
    if (!normalized) return false;
    const contacts = await this.contactRepository.find({
      where: { customerId },
    });
    const matching = contacts.find(
      (contact) => this.normalizeEmail(contact.email) === normalized,
    );
    return matching?.marketingAllowed !== false;
  }

  async assertTodoOwner(id: number, ownerId?: string) {
    const item = await this.todoRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException("待办不存在");
    await this.assertCustomerOwner(item.customerId, ownerId);
    return item;
  }

  async assertOpportunityOwner(id: number, ownerId?: string) {
    const item = await this.opportunityRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException("商机不存在");
    await this.assertCustomerOwner(item.customerId, ownerId);
    return item;
  }

  async assertQuoteOwner(id: number, ownerId?: string) {
    const item = await this.quoteRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException("报价不存在");
    await this.assertCustomerOwner(item.customerId, ownerId);
    return item;
  }

  async assertSampleOwner(id: number, ownerId?: string) {
    const item = await this.sampleRepository.findOne({ where: { id } });
    if (!item) throw new NotFoundException("样品不存在");
    await this.assertCustomerOwner(item.customerId, ownerId);
    return item;
  }

  // ==================== Import/Export ====================

  async parseAndPreview(file: UploadedFile) {
    const rows = await this.parseExcelFile(file);
    const normalizedRows = rows.map((row) =>
      this.normalizeImportedMasterRow(row),
    );
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
          existingCompany:
            customers.find((c) => c.email?.toLowerCase() === email)?.company ||
            "",
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

  async parseAndImport(file: UploadedFile, ownerId = "") {
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
      const data = this.normalizeImportedMasterRow(row);
      if (!data.email && !data.company) {
        skipped++;
        continue;
      }
      const existing = data.email
        ? customersByEmail.get(data.email)
        : undefined;

      if (existing) {
        if (ownerId && !this.hasCustomerAccess(existing, ownerId)) {
          skipped++;
          continue;
        }
        Object.assign(existing, this.mergeImportedCustomer(data, existing));
        await this.customerRepository.save(existing);
        updated++;
      } else {
        const customer = this.customerRepository.create({
          ...data,
          ownerId,
          customerId: this.generateId("cus"),
        });
        const saved = await this.customerRepository.save(customer);
        if (saved.email) customersByEmail.set(saved.email, saved);
        created++;
      }
    }

    return { created, updated, skipped, total: rows.length };
  }

  async upsertLeadCustomer(data: Partial<Customer>, ownerId = "") {
    const email = this.normalizeEmail(data.email || "");
    const existing = email
      ? await this.customerRepository.findOne({ where: { email } })
      : null;
    const profile = this.mergeImportedCustomer({
      company: String(data.company || ""),
      contact: String(data.contact || ""),
      email,
      phone: String(data.phone || ""),
      website: String(data.website || ""),
      region: String(data.region || ""),
      country: String(data.country || ""),
      address: String(data.address || ""),
      business: String(data.business || ""),
      product: String(data.product || ""),
      customerType: String(data.customerType || ""),
      mainMarkets: Array.isArray(data.mainMarkets) ? data.mainMarkets : [],
      annualPurchaseAmount: Number(data.annualPurchaseAmount || 0),
      preferredCurrency: String(data.preferredCurrency || "USD"),
      preferredIncoterm: String(data.preferredIncoterm || ""),
      timezone: String(data.timezone || ""),
      notes: String(data.notes || ""),
      source: String(data.source || "lead"),
    });
    if (existing) {
      if (ownerId && !this.hasCustomerAccess(existing, ownerId)) {
        throw new BadRequestException(
          "该邮箱已存在于其他负责人客户中，请联系管理员调整归属",
        );
      }
      Object.assign(existing, this.mergeImportedCustomer(profile, existing));
      return {
        customer: await this.customerRepository.save(existing),
        created: false,
      };
    }
    const customer = this.customerRepository.create({
      ...profile,
      ownerId,
      journeyStage: "lead",
      customerId: this.generateId("cus"),
    });
    return {
      customer: await this.customerRepository.save(customer),
      created: true,
    };
  }

  private async parseExcelFile(file: UploadedFile): Promise<any[]> {
    if (!file?.buffer?.length && !file?.path) {
      throw new BadRequestException("上传文件内容为空");
    }
    const workbook = file.buffer?.length
      ? xlsx.read(file.buffer, { type: "buffer" })
      : xlsx.readFile(file.path!);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName)
      throw new BadRequestException("Excel/CSV 文件没有可读取的工作表");
    const sheet = workbook.Sheets[sheetName];
    return xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
  }

  private normalizeImportRow(row: any) {
    return {
      company: row.company || row.Company || "",
      contact: row.contact || row.Contact || row["联系人"] || "",
      email: row.email || row.Email || row["邮箱"] || "",
      phone: row.phone || row.Phone || row["电话"] || "",
      website: row.website || row.Website || row["网站"] || "",
      region: row.region || row.Region || row["地区"] || "",
      country: row.country || row.Country || row["国家"] || "",
      business: row.business || row.Business || row["行业"] || "",
      product: row.product || row.Product || row["产品"] || "",
      notes: row.notes || row.Notes || row["备注"] || "",
      source: "import",
    };
  }

  private normalizeImportedMasterRow(row: Record<string, unknown>) {
    const value = (...keys: string[]) => {
      for (const key of keys) {
        const candidate = row[key];
        if (
          candidate !== undefined &&
          candidate !== null &&
          String(candidate).trim()
        ) {
          return String(candidate).trim();
        }
      }
      return "";
    };
    const list = (...keys: string[]) =>
      value(...keys)
        .split(/[,，;；]/)
        .map((item) => item.trim())
        .filter(Boolean);
    const amount = (...keys: string[]) =>
      Number(value(...keys).replace(/[^0-9.-]/g, "")) || 0;

    return {
      company: value("company", "Company", "公司", "公司名称", "客户名称"),
      contact: value("contact", "Contact", "联系人", "联系人姓名", "姓名"),
      email: this.normalizeEmail(
        value("email", "Email", "邮箱", "电子邮箱", "E-mail", "E-Mail"),
      ),
      phone: value("phone", "Phone", "电话", "手机号", "联系电话"),
      website: value("website", "Website", "官网", "网站", "网址"),
      region: value("region", "Region", "地区", "城市", "市场区域"),
      country: value("country", "Country", "国家", "国家/地区"),
      address: value("address", "Address", "详细地址", "公司地址"),
      business: value("business", "Business", "主营业务", "行业", "业务"),
      product: value("product", "Product", "产品", "主营产品"),
      customerType: value(
        "customerType",
        "Customer Type",
        "公司类型",
        "客户类型",
      ),
      mainMarkets: list("mainMarkets", "Main Markets", "主要市场"),
      annualPurchaseAmount: amount(
        "annualPurchaseAmount",
        "Annual Purchase Amount",
        "年采购金额",
        "年采购规模",
      ),
      preferredCurrency:
        value("preferredCurrency", "Preferred Currency", "首选币种") || "USD",
      preferredIncoterm: value(
        "preferredIncoterm",
        "Preferred Incoterm",
        "首选贸易条款",
        "贸易条款",
      ),
      timezone: value("timezone", "Timezone", "时区", "客户时区"),
      notes: value("notes", "Notes", "备注"),
      source: value("source", "Source", "客户来源") || "import",
    };
  }

  private normalizeImportedRow(row: Record<string, unknown>) {
    const value = (...keys: string[]) => {
      for (const key of keys) {
        const candidate = row[key];
        if (
          candidate !== undefined &&
          candidate !== null &&
          String(candidate).trim()
        ) {
          return String(candidate).trim();
        }
      }
      return "";
    };
    return {
      company: value("company", "Company", "公司", "公司名称", "客户名称"),
      contact: value("contact", "Contact", "联系人", "联系人姓名", "姓名"),
      email: this.normalizeEmail(
        value("email", "Email", "邮箱", "电子邮箱", "E-mail", "E-Mail"),
      ),
      phone: value("phone", "Phone", "电话", "手机号", "联系电话"),
      website: value("website", "Website", "官网", "网站", "网址"),
      region: value("region", "Region", "地区", "城市", "市场区域"),
      country: value("country", "Country", "国家", "国家/地区"),
      business: value("business", "Business", "主营业务", "行业", "业务"),
      product: value("product", "Product", "产品", "主营产品"),
      customerType: value("customerType", "Customer Type", "客户类型"),
      timezone: value("timezone", "Timezone", "时区", "客户时区"),
      notes: value("notes", "Notes", "备注"),
      source: "import",
    };
  }

  private mergeImportedCustomer(
    incoming: Record<string, unknown>,
    existing?: object,
  ) {
    const merged: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(incoming)) {
      if (
        existing &&
        this.hasImportedProfileValue((existing as Record<string, unknown>)[key])
      )
        continue;
      if (Array.isArray(value)) {
        if (value.length) merged[key] = value;
      } else if (typeof value === "number") {
        if (value > 0) merged[key] = value;
      } else if (String(value || "").trim()) {
        merged[key] = value;
      }
    }
    // A duplicate import may fill missing profile data, but it never replaces
    // an existing non-empty business value. Conflicts must go through the
    // duplicate-customer preview and explicit field selection workflow.
    return merged;
  }

  private hasImportedProfileValue(value: unknown) {
    if (value === null || value === undefined || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return value > 0;
    return Boolean(String(value).trim());
  }

  private normalizeEmail(value: string) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  // ==================== Customer Views ====================

  async findViews(ownerId?: string) {
    return this.customerViewRepository.find({
      where: ownerId ? { ownerId } : {},
      order: { createdAt: "DESC" },
    });
  }

  async createView(createDto: CreateCustomerViewDto, ownerId = "") {
    const view = this.customerViewRepository.create({
      ...createDto,
      ownerId,
      viewId: this.generateId("view"),
    });
    return this.customerViewRepository.save(view);
  }

  async updateView(
    id: number,
    updateDto: UpdateCustomerViewDto,
    ownerId?: string,
  ) {
    const view = await this.customerViewRepository.findOne({ where: { id } });
    if (!view) throw new NotFoundException("视图不存在");
    if (ownerId && view.ownerId !== ownerId)
      throw new NotFoundException("筛选器不存在");
    Object.assign(view, updateDto);
    return this.customerViewRepository.save(view);
  }

  async deleteView(id: number, ownerId?: string) {
    const view = await this.customerViewRepository.findOne({ where: { id } });
    if (!view || (ownerId && view.ownerId !== ownerId))
      throw new NotFoundException("筛选器不存在");
    const result = await this.customerViewRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("视图不存在");
    return { deleted: true };
  }

  // ==================== Utils ====================

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}${random}`;
  }
}
