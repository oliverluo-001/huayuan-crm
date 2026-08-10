import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { DataSource, In, Repository } from 'typeorm';
import { AuditEntry } from '../audit/entities/audit.entity';
import { CustomerAttachment } from '../attachments/customer-attachment.entity';
import { EmailLog, EmailTask, EmailTaskRecipient } from '../email/entities';
import { Lead } from '../leads/entities';
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
import {
  DuplicateCustomerPreviewDto,
  MergeDuplicateCustomersDto,
} from './dto';
import { CustomersService } from './customers.service';

export interface DuplicateActor {
  userId: string;
  username: string;
  role: 'admin' | 'sales' | 'viewer';
}

type MatchType = 'email' | 'domain' | 'phone' | 'company';
type MergeField = (typeof MERGE_FIELDS)[number]['key'];

const MERGE_FIELDS = [
  { key: 'company', label: '公司名称' },
  { key: 'website', label: '公司网站' },
  { key: 'region', label: '地区' },
  { key: 'country', label: '国家/地区' },
  { key: 'address', label: '详细地址' },
  { key: 'business', label: '主营业务' },
  { key: 'product', label: '关注产品' },
  { key: 'customerType', label: '公司类型' },
  { key: 'mainMarkets', label: '主要市场' },
  { key: 'annualPurchaseAmount', label: '年采购规模' },
  { key: 'preferredCurrency', label: '首选币种' },
  { key: 'preferredIncoterm', label: '首选贸易条款' },
  { key: 'tier', label: '客户分层' },
  { key: 'journeyStage', label: '客户跟进阶段' },
  { key: 'notes', label: '备注' },
  { key: 'timezone', label: '客户时区' },
  { key: 'source', label: '当前客户来源' },
] as const;

const MATCH_LABELS: Record<MatchType, string> = {
  email: '邮箱一致',
  domain: '企业域名一致',
  phone: '电话一致',
  company: '公司名称一致',
};

const MATCH_CONFIDENCE: Record<MatchType, number> = {
  email: 100,
  phone: 90,
  domain: 80,
  company: 65,
};

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'yahoo.com',
  'yahoo.co.jp',
  'icloud.com',
  'qq.com',
  '163.com',
  '126.com',
  'sina.com',
  'foxmail.com',
  'proton.me',
  'protonmail.com',
]);

@Injectable()
export class CustomerDuplicatesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly customersService: CustomersService,
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    @InjectRepository(Todo)
    private readonly todoRepository: Repository<Todo>,
    @InjectRepository(Opportunity)
    private readonly opportunityRepository: Repository<Opportunity>,
    @InjectRepository(Quote)
    private readonly quoteRepository: Repository<Quote>,
    @InjectRepository(Sample)
    private readonly sampleRepository: Repository<Sample>,
    @InjectRepository(EmailLog)
    private readonly emailLogRepository: Repository<EmailLog>,
    @InjectRepository(CustomerAttachment)
    private readonly attachmentRepository: Repository<CustomerAttachment>,
    @InjectRepository(EmailTaskRecipient)
    private readonly emailRecipientRepository: Repository<EmailTaskRecipient>,
    @InjectRepository(Lead)
    private readonly leadRepository: Repository<Lead>,
    @InjectRepository(CustomerMergeHistory)
    private readonly mergeHistoryRepository: Repository<CustomerMergeHistory>,
  ) {}

  async findDuplicateGroups(actor: DuplicateActor) {
    const result = await this.customersService.findAll(
      actor.role === 'sales' ? { ownerId: actor.userId } : {},
    );
    const customers = (result as { customers: Customer[] }).customers || [];
    const contacts = customers.length
      ? await this.contactRepository.find({
          where: { customerId: In(customers.map((customer) => customer.id)) },
        })
      : [];
    const matches = this.detectMatches(customers, contacts);
    const allGroups = this.groupMatches(customers, matches);
    const groups = allGroups.slice(0, 100);
    return {
      groups,
      summary: {
        scannedCustomers: customers.length,
        duplicateGroups: allGroups.length,
        duplicateCustomers: allGroups.reduce(
          (total, group) => total + group.members.length,
          0,
        ),
      },
    };
  }

  async previewMerge(
    dto: DuplicateCustomerPreviewDto,
    actor: DuplicateActor,
  ) {
    const ids = this.normalizeMergeIds(dto);
    const customers = await this.customerRepository.find({
      where: { id: In(ids) },
      relations: ['tags'],
      order: { createdAt: 'ASC' },
    });
    customers.sort((left, right) => left.id - right.id);
    if (customers.length !== ids.length) {
      throw new NotFoundException('部分客户不存在或已被合并');
    }
    for (const customer of customers) {
      await this.customersService.assertCustomerOwner(
        customer.id,
        actor.role === 'sales' ? actor.userId : undefined,
      );
    }

    const primary = customers.find(
      (customer) => customer.id === dto.primaryCustomerId,
    )!;
    const duplicates = customers.filter(
      (customer) => customer.id !== primary.id,
    );
    const contacts = await this.contactRepository.find({
      where: { customerId: In(ids) },
    });
    contacts.sort((left, right) => left.id - right.id);
    const matches = this.detectMatches(customers, contacts);
    if (!this.isConnectedDuplicateSet(ids, matches)) {
      throw new BadRequestException(
        '选中的客户之间没有可验证的重复特征，请重新选择重复组',
      );
    }

    const relationCounts = await this.countRelations(customers);
    const contactOptions = this.buildContactOptions(customers, contacts);
    const fields = MERGE_FIELDS.map(({ key, label }) => {
      const values = customers.map((customer) => ({
        customerId: customer.id,
        customerKey: customer.customerId,
        company: customer.company,
        value: this.cloneValue(customer[key] as unknown),
        isPrimary: customer.id === primary.id,
      }));
      const distinct = new Set(
        values
          .filter((item) => this.hasValue(item.value))
          .map((item) => this.comparable(item.value)),
      );
      const recommended = this.hasValue(primary[key] as unknown)
        ? primary.id
        : values.find((item) => this.hasValue(item.value))?.customerId ||
          primary.id;
      return {
        key,
        label,
        values,
        conflict: distinct.size > 1,
        recommendedCustomerId: recommended,
      };
    });

    const mergeAllowed =
      actor.role === 'admin' ||
      (actor.role === 'sales' &&
        customers.every((customer) => customer.ownerId === actor.userId));
    const preservedCollaborators = this.mergedCollaborators(
      primary,
      duplicates,
    );
    const warnings: string[] = [];
    if (!mergeAllowed) {
      warnings.push(
        '所选客户包含其他负责人名下的数据，只有管理员可以执行跨负责人合并。',
      );
    }
    if (fields.some((field) => field.conflict)) {
      warnings.push(
        '存在非空字段冲突。系统不会自动覆盖，请逐项选择要保留的值。',
      );
    }
    if (preservedCollaborators.length !== (primary.collaboratorIds || []).length) {
      warnings.push(
        '为避免原负责人失去访问权限，来源客户的负责人和协作者将加入主客户协作范围。',
      );
    }

    const tokenPayload = {
      customers: customers.map((customer) => ({
        id: customer.id,
        updatedAt: customer.updatedAt,
        snapshot: this.customerSnapshot(customer),
      })),
      matches,
      relationCounts,
      contacts: contacts.map((contact) => ({
        id: contact.id,
        customerId: contact.customerId,
        name: contact.name,
        email: contact.email,
        phone: contact.phone,
        isPrimary: contact.isPrimary,
        updatedAt: contact.updatedAt,
      })),
    };

    return {
      primary: this.customerSummary(primary),
      duplicates: duplicates.map((customer) =>
        this.customerSummary(customer),
      ),
      matches,
      fields,
      contactOptions,
      defaultPrimaryContactSelection:
        contactOptions.find(
          (option) => option.customerId === primary.id && option.isPrimary,
        )?.key ||
        contactOptions.find((option) => option.customerId === primary.id)?.key ||
        contactOptions.find((option) => option.isPrimary)?.key ||
        contactOptions[0]?.key ||
        'none',
      defaultFieldSelections: Object.fromEntries(
        fields.map((field) => [field.key, field.recommendedCustomerId]),
      ),
      relationCounts,
      accessPlan: {
        ownerId: primary.ownerId,
        collaboratorIds: preservedCollaborators,
      },
      mergeAllowed,
      warnings,
      previewToken: this.previewToken(tokenPayload),
    };
  }

  async merge(dto: MergeDuplicateCustomersDto, actor: DuplicateActor) {
    const preview = await this.previewMerge(dto, actor);
    if (preview.previewToken !== dto.previewToken) {
      throw new BadRequestException(
        '客户资料已发生变化，请重新生成合并预览后再操作',
      );
    }
    if (!preview.mergeAllowed) {
      throw new BadRequestException(
        '只有管理员可以合并不同负责人名下的客户',
      );
    }

    const ids = this.normalizeMergeIds(dto);
    const allowedIds = new Set(ids);
    if (
      !preview.contactOptions.some(
        (option) => option.key === dto.primaryContactSelection,
      ) &&
      dto.primaryContactSelection !== 'none'
    ) {
      throw new BadRequestException('主联系人选择无效，请重新生成合并预览');
    }
    for (const [field, customerId] of Object.entries(dto.fieldSelections || {})) {
      if (!MERGE_FIELDS.some((item) => item.key === field)) {
        throw new BadRequestException(`不支持合并字段：${field}`);
      }
      if (!allowedIds.has(Number(customerId))) {
        throw new BadRequestException(`字段 ${field} 的来源客户无效`);
      }
    }

    const overwrites = preview.fields.filter((field) => {
      const selectedId = Number(
        dto.fieldSelections[field.key] || preview.primary.id,
      );
      const primaryValue = field.values.find((value) => value.isPrimary)?.value;
      const selectedValue = field.values.find(
        (value) => value.customerId === selectedId,
      )?.value;
      return (
        selectedId !== preview.primary.id &&
        this.hasValue(primaryValue) &&
        this.comparable(primaryValue) !== this.comparable(selectedValue)
      );
    });
    if (overwrites.length && !dto.acknowledgeConflicts) {
      throw new BadRequestException(
        `请确认将覆盖主客户的以下字段：${overwrites
          .map((field) => field.label)
          .join('、')}`,
      );
    }

    return this.dataSource.transaction(async (manager) => {
      const customerRepo = manager.getRepository(Customer);
      await customerRepo
        .createQueryBuilder('customer')
        .where('customer.id IN (:...ids)', { ids })
        .setLock('pessimistic_write')
        .getMany();
      const customers = await customerRepo.find({
        where: { id: In(ids) },
        relations: ['tags'],
      });
      if (customers.length !== ids.length) {
        throw new BadRequestException(
          '客户资料已发生变化，请重新生成合并预览',
        );
      }
      const primary = customers.find(
        (customer) => customer.id === dto.primaryCustomerId,
      )!;
      const duplicates = customers.filter(
        (customer) => customer.id !== primary.id,
      );
      if (
        actor.role === 'sales' &&
        customers.some((customer) => customer.ownerId !== actor.userId)
      ) {
        throw new BadRequestException(
          '只有管理员可以合并不同负责人名下的客户',
        );
      }

      const byId = new Map(customers.map((customer) => [customer.id, customer]));
      const beforeSnapshot = this.customerSnapshot(primary);
      const sourceSnapshots = duplicates.map((customer) =>
        this.customerSnapshot(customer),
      );
      const mergedAt = new Date();

      for (const source of duplicates) {
        source.email = `merged-${source.customerId}-${source.id}@invalid.local`;
        source.mergedIntoId = primary.id;
        source.mergedAt = mergedAt;
        await customerRepo.save(source);
      }

      for (const { key } of MERGE_FIELDS) {
        const selectedId = Number(dto.fieldSelections[key] || primary.id);
        const selected = byId.get(selectedId) || primary;
        const value = selected[key] as unknown;
        if (this.hasValue(value)) {
          (primary as unknown as Record<string, unknown>)[key] =
            this.cloneValue(value);
        }
      }

      primary.collaboratorIds = this.mergedCollaborators(primary, duplicates);
      primary.tags = this.uniqueBy(
        customers.flatMap((customer) => customer.tags || []),
        (tag) => tag.id,
      );
      primary.sourceHistory = this.uniqueBy(
        [
          ...(Array.isArray(primary.sourceHistory)
            ? primary.sourceHistory
            : []),
          ...duplicates.flatMap((customer) => [
            ...(Array.isArray(customer.sourceHistory)
              ? customer.sourceHistory
              : []),
            {
              customerId: customer.customerId,
              company: customer.company,
              source: customer.source || '',
              mergedAt: mergedAt.toISOString(),
            },
          ]),
        ],
        (item) => `${item.customerId}:${item.source}:${item.mergedAt}`,
      );
      await customerRepo.save(primary);

      const sourceIds = duplicates.map((customer) => customer.id);
      const sourceKeys = duplicates.map((customer) => customer.customerId);
      const movedRelations: Record<string, number> = {};
      movedRelations.contacts = await this.moveContacts(
        manager,
        primary,
        duplicates,
        dto.primaryContactSelection,
        preview.contactOptions.find(
          (option) => option.key === dto.primaryContactSelection,
        ),
      );
      movedRelations.activities = this.affected(
        await manager.update(
          Activity,
          { customerId: In(sourceIds) },
          { customerId: primary.id },
        ),
      );
      movedRelations.todos = this.affected(
        await manager.update(
          Todo,
          { customerId: In(sourceIds) },
          { customerId: primary.id },
        ),
      );
      movedRelations.opportunities = this.affected(
        await manager.update(
          Opportunity,
          { customerId: In(sourceIds) },
          { customerId: primary.id },
        ),
      );
      movedRelations.quotes = this.affected(
        await manager.update(
          Quote,
          { customerId: In(sourceIds) },
          { customerId: primary.id },
        ),
      );
      movedRelations.samples = this.affected(
        await manager.update(
          Sample,
          { customerId: In(sourceIds) },
          { customerId: primary.id },
        ),
      );
      movedRelations.attachments = this.affected(
        await manager.update(
          CustomerAttachment,
          { customerId: In(sourceIds) },
          { customerId: primary.id },
        ),
      );
      movedRelations.emailRecipients = this.affected(
        await manager.update(
          EmailTaskRecipient,
          { customerId: In(sourceIds) },
          { customerId: primary.id, company: primary.company },
        ),
      );
      movedRelations.emailLogs = this.affected(
        await manager.update(
          EmailLog,
          { customerId: In(sourceKeys) },
          { customerId: primary.customerId, customerName: primary.company },
        ),
      );
      movedRelations.leads =
        this.affected(
          await manager.update(
            Lead,
            { crmCustomerId: In(sourceKeys) },
            { crmCustomerId: primary.customerId },
          ),
        ) +
        this.affected(
          await manager.update(
            Lead,
            { convertedCustomerId: In(sourceKeys) },
            { convertedCustomerId: primary.customerId },
          ),
        );
      movedRelations.emailTasks = await this.moveEmailTasks(
        manager,
        primary,
        duplicates,
      );

      await this.refreshPrimarySummary(manager, primary);
      await customerRepo.softDelete({ id: In(sourceIds) });
      const refreshed = await customerRepo.findOne({
        where: { id: primary.id },
        relations: ['tags'],
      });
      if (!refreshed) throw new NotFoundException('合并后的主客户不存在');

      const mergeId = `merge_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
      const history = manager.getRepository(CustomerMergeHistory).create({
        mergeId,
        primaryCustomerId: primary.id,
        primaryCustomerKey: primary.customerId,
        mergedCustomerIds: sourceIds,
        mergedCustomerKeys: sourceKeys,
        sourceSnapshots,
        primarySnapshotBefore: beforeSnapshot,
        primarySnapshotAfter: this.customerSnapshot(refreshed),
        detectionReasons: preview.matches,
        fieldSelections: Object.fromEntries(
          Object.entries(dto.fieldSelections).map(([field, id]) => [
            field,
            Number(id),
          ]),
        ),
        primaryContactSelection: dto.primaryContactSelection,
        movedRelations,
        performedById: actor.userId,
        performedByName: actor.username,
      });
      await manager.getRepository(CustomerMergeHistory).save(history);
      await manager.getRepository(AuditEntry).save(
        manager.getRepository(AuditEntry).create({
          username: actor.username,
          userId: actor.userId,
          action: 'MERGE_CUSTOMERS',
          method: 'POST',
          path: '/api/customer-duplicates/merge',
          status: 'success',
          details: JSON.stringify({
            mergeId,
            primaryCustomerId: primary.customerId,
            mergedCustomerIds: sourceKeys,
            fieldSelections: dto.fieldSelections,
            primaryContactSelection: dto.primaryContactSelection,
            movedRelations,
          }),
        }),
      );

      return {
        mergeId,
        customer: refreshed,
        mergedCustomerIds: sourceKeys,
        movedRelations,
      };
    });
  }

  async findHistory(customerId: number, actor: DuplicateActor) {
    await this.customersService.assertCustomerOwner(
      customerId,
      actor.role === 'sales' ? actor.userId : undefined,
    );
    return this.mergeHistoryRepository.find({
      where: { primaryCustomerId: customerId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  private normalizeMergeIds(dto: DuplicateCustomerPreviewDto) {
    const primaryId = Number(dto.primaryCustomerId);
    const duplicateIds = [
      ...new Set((dto.duplicateCustomerIds || []).map(Number)),
    ].filter((id) => Number.isInteger(id) && id > 0 && id !== primaryId);
    if (!Number.isInteger(primaryId) || primaryId <= 0 || !duplicateIds.length) {
      throw new BadRequestException('请选择一个主客户和至少一个重复客户');
    }
    if (duplicateIds.length > 20) {
      throw new BadRequestException('单次最多合并 20 个重复客户');
    }
    return [primaryId, ...duplicateIds];
  }

  private detectMatches(customers: Customer[], contacts: Contact[]) {
    const identifiers = new Map<
      string,
      { type: MatchType; value: string; customerIds: Set<number> }
    >();
    const add = (type: MatchType, value: string, customerId: number) => {
      if (!value) return;
      const key = `${type}:${value}`;
      const entry = identifiers.get(key) || {
        type,
        value,
        customerIds: new Set<number>(),
      };
      entry.customerIds.add(customerId);
      identifiers.set(key, entry);
    };
    const addEmail = (email: string, customerId: number) => {
      const normalized = this.normalizeEmail(email);
      if (!normalized) return;
      add('email', normalized, customerId);
      const domain = this.domainFromEmail(normalized);
      if (domain && !PUBLIC_EMAIL_DOMAINS.has(domain)) {
        add('domain', domain, customerId);
      }
    };

    for (const customer of customers) {
      addEmail(customer.email, customer.id);
      const websiteDomain = this.normalizeDomain(customer.website);
      if (websiteDomain) add('domain', websiteDomain, customer.id);
      add('phone', this.normalizePhone(customer.phone), customer.id);
      add('company', this.normalizeCompany(customer.company), customer.id);
    }
    for (const contact of contacts) {
      addEmail(contact.email, contact.customerId);
      add('phone', this.normalizePhone(contact.phone), contact.customerId);
      add('phone', this.normalizePhone(contact.whatsapp), contact.customerId);
    }

    return [...identifiers.values()]
      .filter((entry) => entry.customerIds.size > 1)
      .map((entry) => ({
        type: entry.type,
        label: MATCH_LABELS[entry.type],
        value: entry.value,
        confidence: MATCH_CONFIDENCE[entry.type],
        customerIds: [...entry.customerIds].sort((a, b) => a - b),
      }))
      .sort(
        (left, right) =>
          right.confidence - left.confidence ||
          left.type.localeCompare(right.type) ||
          left.value.localeCompare(right.value),
      );
  }

  private groupMatches(
    customers: Customer[],
    matches: ReturnType<CustomerDuplicatesService['detectMatches']>,
  ) {
    const parent = new Map(customers.map((customer) => [customer.id, customer.id]));
    const find = (id: number): number => {
      const current = parent.get(id) ?? id;
      if (current === id) return id;
      const root = find(current);
      parent.set(id, root);
      return root;
    };
    const union = (a: number, b: number) => {
      const left = find(a);
      const right = find(b);
      if (left !== right) parent.set(right, left);
    };
    for (const match of matches) {
      const [first, ...rest] = match.customerIds;
      rest.forEach((id) => union(first, id));
    }
    const groups = new Map<number, Customer[]>();
    for (const customer of customers) {
      const root = find(customer.id);
      const items = groups.get(root) || [];
      items.push(customer);
      groups.set(root, items);
    }
    return [...groups.values()]
      .filter((items) => items.length > 1)
      .map((items) => {
        const ids = new Set(items.map((item) => item.id));
        const groupMatches = matches.filter(
          (match) => match.customerIds.filter((id) => ids.has(id)).length > 1,
        );
        return {
          id: `duplicate-${items.map((item) => item.id).sort((a, b) => a - b).join('-')}`,
          confidence: Math.max(
            ...groupMatches.map((match) => match.confidence),
          ),
          matches: groupMatches,
          members: items
            .sort(
              (left, right) =>
                new Date(left.createdAt).getTime() -
                new Date(right.createdAt).getTime(),
            )
            .map((customer) => this.customerSummary(customer)),
        };
      })
      .sort(
        (left, right) =>
          right.confidence - left.confidence ||
          right.members.length - left.members.length,
      );
  }

  private isConnectedDuplicateSet(
    ids: number[],
    matches: ReturnType<CustomerDuplicatesService['detectMatches']>,
  ) {
    if (!ids.length) return false;
    const selected = new Set(ids);
    const reached = new Set<number>([ids[0]]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const match of matches) {
        const matchingIds = match.customerIds.filter((id) => selected.has(id));
        if (matchingIds.some((id) => reached.has(id))) {
          for (const id of matchingIds) {
            if (!reached.has(id)) {
              reached.add(id);
              changed = true;
            }
          }
        }
      }
    }
    return reached.size === selected.size;
  }

  private async countRelations(customers: Customer[]) {
    const entries = await Promise.all(
      customers.map(async (customer) => {
        const [
          contacts,
          activities,
          todos,
          opportunities,
          quotes,
          samples,
          attachments,
          emailLogs,
          emailRecipients,
          leadsByCrm,
          leadsByConverted,
        ] = await Promise.all([
          this.contactRepository.count({ where: { customerId: customer.id } }),
          this.activityRepository.count({ where: { customerId: customer.id } }),
          this.todoRepository.count({ where: { customerId: customer.id } }),
          this.opportunityRepository.count({ where: { customerId: customer.id } }),
          this.quoteRepository.count({ where: { customerId: customer.id } }),
          this.sampleRepository.count({ where: { customerId: customer.id } }),
          this.attachmentRepository.count({ where: { customerId: customer.id } }),
          this.emailLogRepository.count({ where: { customerId: customer.customerId } }),
          this.emailRecipientRepository.count({ where: { customerId: customer.id } }),
          this.leadRepository.count({ where: { crmCustomerId: customer.customerId } }),
          this.leadRepository.count({ where: { convertedCustomerId: customer.customerId } }),
        ]);
        return [
          String(customer.id),
          {
            contacts,
            activities,
            todos,
            opportunities,
            quotes,
            samples,
            attachments,
            emailLogs,
            emailRecipients,
            leads: leadsByCrm + leadsByConverted,
          },
        ] as const;
      }),
    );
    return Object.fromEntries(entries);
  }

  private async moveContacts(
    manager: DataSource['manager'],
    primary: Customer,
    duplicates: Customer[],
    selection: string,
    selectedOption?: { name: string; email: string; phone: string },
  ) {
    const repo = manager.getRepository(Contact);
    const primaryCustomerId = primary.id;
    const sourceIds = duplicates.map((customer) => customer.id);
    const contacts = await repo.find({
      where: { customerId: In([primaryCustomerId, ...sourceIds]) },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    let primaryContact = selection.startsWith('contact:')
      ? contacts.find((contact) => contact.id === Number(selection.slice(8)))
      : undefined;
    if (selection.startsWith('summary:')) {
      const sourceCustomerId = Number(selection.slice(8));
      const source = [primary, ...duplicates].find(
        (customer) => customer.id === sourceCustomerId,
      );
      if (source && selectedOption) {
        primaryContact = repo.create({
          contactId: `contact_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
          customerId: primaryCustomerId,
          name: selectedOption.name || source.company || '未命名联系人',
          email: selectedOption.email || '',
          phone: selectedOption.phone || '',
          isPrimary: true,
        });
        primaryContact = await repo.save(primaryContact);
      }
    }
    await repo.update(
      { customerId: In([primaryCustomerId, ...sourceIds]) },
      { isPrimary: false },
    );
    const result = await repo.update(
      { customerId: In(sourceIds) },
      { customerId: primaryCustomerId },
    );
    if (primaryContact) {
      await repo.update(primaryContact.id, { isPrimary: true });
    }
    return this.affected(result);
  }

  private buildContactOptions(customers: Customer[], contacts: Contact[]) {
    const byCustomer = new Map(customers.map((customer) => [customer.id, customer]));
    const options = contacts.map((contact) => ({
      key: `contact:${contact.id}`,
      contactId: contact.id as number | null,
      customerId: contact.customerId,
      customerKey: byCustomer.get(contact.customerId)?.customerId || '',
      company: byCustomer.get(contact.customerId)?.company || '',
      name: contact.name,
      email: contact.email || '',
      phone: contact.phone || '',
      isPrimary: contact.isPrimary,
      synthetic: false,
    }));
    for (const customer of customers) {
      const hasSummary = Boolean(customer.contact || customer.email || customer.phone);
      const represented = contacts.some(
        (contact) =>
          contact.customerId === customer.id &&
          (contact.name || '') === (customer.contact || '') &&
          (contact.email || '') === (customer.email || '') &&
          (contact.phone || '') === (customer.phone || ''),
      );
      if (hasSummary && !represented) {
        options.push({
          key: `summary:${customer.id}`,
          contactId: null,
          customerId: customer.id,
          customerKey: customer.customerId,
          company: customer.company,
          name: customer.contact || customer.company || '未命名联系人',
          email: customer.email || '',
          phone: customer.phone || '',
          isPrimary: true,
          synthetic: true,
        });
      }
    }
    return options;
  }

  private async moveEmailTasks(
    manager: DataSource['manager'],
    primary: Customer,
    duplicates: Customer[],
  ) {
    const sourceKeys = new Set(duplicates.map((customer) => customer.customerId));
    const sourceIds = new Set(duplicates.map((customer) => String(customer.id)));
    const taskRepo = manager.getRepository(EmailTask);
    const qb = taskRepo.createQueryBuilder('task');
    qb.where('task.customer_id IN (:...sourceKeys)', {
      sourceKeys: [...sourceKeys],
    });
    duplicates.forEach((customer, index) => {
      qb.orWhere(`task.customer_ids LIKE :sourceKey${index}`, {
        [`sourceKey${index}`]: `%\"${customer.customerId}\"%`,
      });
      qb.orWhere(`task.customer_ids LIKE :sourcePrefixedKey${index}`, {
        [`sourcePrefixedKey${index}`]: `%\"customer:${customer.customerId}\"%`,
      });
      qb.orWhere(`task.customer_ids LIKE :sourceNumericId${index}`, {
        [`sourceNumericId${index}`]: `%\"${customer.id}\"%`,
      });
    });
    const tasks = await qb.getMany();
    let changed = 0;
    for (const task of tasks) {
      let dirty = false;
      if (sourceKeys.has(task.customerId) || sourceIds.has(task.customerId)) {
        task.customerId = primary.customerId;
        dirty = true;
      }
      if (task.customerIds) {
        try {
          const values = JSON.parse(task.customerIds);
          if (Array.isArray(values)) {
            const next = values.map((raw) => {
              const value = String(raw);
              const bare = value.startsWith('customer:')
                ? value.slice('customer:'.length)
                : value;
              if (sourceKeys.has(bare) || sourceIds.has(bare)) {
                dirty = true;
                return `customer:${primary.customerId}`;
              }
              return raw;
            });
            task.customerIds = JSON.stringify([...new Set(next)]);
          }
        } catch {
          // Legacy malformed recipient text is retained; recipient rows are still relinked.
        }
      }
      if (dirty) {
        await taskRepo.save(task);
        changed += 1;
      }
    }
    return changed;
  }

  private async refreshPrimarySummary(
    manager: DataSource['manager'],
    customer: Customer,
  ) {
    const contactRepo = manager.getRepository(Contact);
    const primaryContact =
      (await contactRepo.findOne({
        where: { customerId: customer.id, isPrimary: true },
      })) ||
      (await contactRepo.findOne({
        where: { customerId: customer.id },
        order: { createdAt: 'ASC' },
      }));
    if (primaryContact) {
      customer.contact = primaryContact.name || customer.contact;
      if (primaryContact.email && primaryContact.email !== customer.email) {
        customer.emailStatus = 'unknown';
        customer.emailFailureReason = '';
        customer.emailFailedAt = null as unknown as Date;
      }
      customer.email = primaryContact.email || customer.email;
      customer.phone = primaryContact.phone || customer.phone;
    }

    const latestActivity = await manager.getRepository(Activity).findOne({
      where: { customerId: customer.id },
      order: { createdAt: 'DESC' },
    });
    customer.lastActivityAt = (latestActivity?.createdAt || null) as Date;
    customer.lastActivityType = latestActivity?.type || '';

    const openTodos = await manager.getRepository(Todo).find({
      where: { customerId: customer.id, status: 'open' },
      order: { dueAt: 'ASC', createdAt: 'ASC' },
    });
    const nextTodo =
      openTodos.find((todo) => Boolean(todo.dueAt)) || openTodos[0];
    customer.nextTodoAt = (nextTodo?.dueAt || null) as Date;
    customer.nextTodoTitle = nextTodo?.title || '';
    customer.health = openTodos.some(
      (todo) => todo.dueAt && new Date(todo.dueAt).getTime() < Date.now(),
    )
      ? 'critical'
      : openTodos.length
        ? 'warning'
        : 'good';

    const opportunities = await manager.getRepository(Opportunity).find({
      where: { customerId: customer.id },
    });
    const open = opportunities.filter(
      (opportunity) => !['won', 'lost'].includes(opportunity.stage),
    );
    customer.openOpportunityCount = open.length;
    customer.openOpportunityValue = open.reduce(
      (sum, opportunity) => sum + Number(opportunity.amount || 0),
      0,
    );
    await manager.getRepository(Customer).save(customer);
  }

  private mergedCollaborators(primary: Customer, duplicates: Customer[]) {
    return [
      ...new Set(
        [
          ...(primary.collaboratorIds || []),
          ...duplicates.flatMap((customer) => [
            customer.ownerId,
            ...(customer.collaboratorIds || []),
          ]),
        ]
          .map((id) => String(id || '').trim())
          .filter((id) => id && id !== primary.ownerId),
      ),
    ];
  }

  private customerSummary(customer: Customer) {
    return {
      id: customer.id,
      customerId: customer.customerId,
      company: customer.company,
      contact: customer.contact,
      email: customer.email,
      phone: customer.phone,
      website: customer.website,
      source: customer.source,
      ownerId: customer.ownerId,
      collaboratorIds: customer.collaboratorIds || [],
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  private customerSnapshot(customer: Customer) {
    return {
      ...Object.fromEntries(
        MERGE_FIELDS.map(({ key }) => [key, this.cloneValue(customer[key])]),
      ),
      id: customer.id,
      customerId: customer.customerId,
      ownerId: customer.ownerId,
      collaboratorIds: [...(customer.collaboratorIds || [])],
      tags: (customer.tags || []).map((tag) => tag.name),
      sourceHistory: this.cloneValue(customer.sourceHistory || []),
      emailStatus: customer.emailStatus,
      emailFailureReason: customer.emailFailureReason,
      emailFailedAt: customer.emailFailedAt,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt,
    };
  }

  private normalizeEmail(value: string) {
    const email = String(value || '').trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
  }

  private domainFromEmail(email: string) {
    return email.split('@')[1] || '';
  }

  private normalizeDomain(value: string) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
      return url.hostname.replace(/^www\./, '').replace(/\.$/, '');
    } catch {
      return raw
        .replace(/^https?:\/\//, '')
        .split('/')[0]
        .split(':')[0]
        .replace(/^www\./, '')
        .replace(/\.$/, '');
    }
  }

  private normalizePhone(value: string) {
    let digits = String(value || '').replace(/(?:ext\.?|x|转)\s*\d+$/i, '');
    digits = digits.replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits.length >= 7 ? digits : '';
  }

  private normalizeCompany(value: string) {
    let company = String(value || '')
      .normalize('NFKC')
      .toLowerCase()
      .replace(/&/g, 'and')
      .replace(/[（(].*?[）)]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '');
    const suffixes = [
      'companylimited',
      'coltd',
      'colimited',
      'corporation',
      'incorporated',
      'privatelimited',
      'pteltd',
      'sdnbhd',
      'limited',
      'company',
      'corp',
      'inc',
      'llc',
      'ltd',
      'gmbh',
      '有限责任公司',
      '股份有限公司',
      '有限公司',
    ];
    let changed = true;
    while (changed) {
      changed = false;
      for (const suffix of suffixes) {
        if (company.endsWith(suffix) && company.length > suffix.length + 2) {
          company = company.slice(0, -suffix.length);
          changed = true;
          break;
        }
      }
    }
    return company.length >= 3 ? company : '';
  }

  private hasValue(value: unknown) {
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
    return true;
  }

  private comparable(value: unknown) {
    if (Array.isArray(value)) {
      return JSON.stringify([...value].map(String).sort());
    }
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value.trim().toLowerCase();
    return JSON.stringify(value ?? null);
  }

  private cloneValue<T>(value: T): T {
    if (value instanceof Date) return new Date(value.getTime()) as T;
    if (Array.isArray(value)) return [...value] as T;
    if (value && typeof value === 'object') {
      return JSON.parse(JSON.stringify(value)) as T;
    }
    return value;
  }

  private previewToken(payload: unknown) {
    return createHash('sha256')
      .update(JSON.stringify(payload))
      .digest('hex');
  }

  private affected(result: { affected?: number | null }) {
    return Number(result.affected || 0);
  }

  private uniqueBy<T>(items: T[], key: (item: T) => string | number) {
    return [...new Map(items.map((item) => [key(item), item])).values()];
  }
}
