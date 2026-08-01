import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Brackets } from 'typeorm';
import { resolveMx } from 'node:dns/promises';
import { Lead, LeadTask } from './entities';
import {
  CreateLeadDto,
  UpdateLeadDto,
  ConvertLeadsDto,
  BulkDeleteLeadsDto,
  CreateLeadTaskDto,
  UpdateLeadTaskDto,
  LeadAssociationRequestDto,
  LeadAssociationResponseDto,
  ImportLeadsDto,
  ImportCustomersDto,
  GenerateQueriesDto,
} from './dto';
import { LeadSearchService, SearchCandidate } from './lead-search.service';
import { CustomersService } from '../customers/customers.service';

// ─── Constants ───────────────────────────────────────────────────────────

const PRODUCT_INDUSTRY_MAP: Record<string, { aliases: string[]; industries: string[]; companyTypes: string[] }> = {
  default: {
    aliases: [],
    industries: ['Industrial Machinery', 'Manufacturing', 'Construction', 'Energy'],
    companyTypes: ['importer', 'distributor', 'wholesaler', 'manufacturer'],
  },
};

const QUERY_TEMPLATES = [
  '{product} {segment} in {region}',
  '{product} {segment} company {region}',
  '{product} supplier {region}',
  '{product} buyer {region}',
  'top {product} {segment} {region}',
  '{alias} {segment} {region}',
];

// ─── Service ─────────────────────────────────────────────────────────────

@Injectable()
export class LeadsService {
  constructor(
    @InjectRepository(Lead)
    private leadRepository: Repository<Lead>,
    @InjectRepository(LeadTask)
    private leadTaskRepository: Repository<LeadTask>,
    private leadSearchService: LeadSearchService,
    private customersService: CustomersService,
  ) {}

  // ==================== Lead Associations ====================

  async getAssociation(productName: string): Promise<{ association: LeadAssociationResponseDto }> {
    return { association: await this.leadSearchService.associateProduct(productName) };
    /* Legacy fallback retained below for schema compatibility. */
    const canonicalName = productName.trim();
    const entry = PRODUCT_INDUSTRY_MAP[canonicalName.toLowerCase()] || PRODUCT_INDUSTRY_MAP.default;

    const industries = [
      'Oil & Gas', 'Petrochemical', 'Chemical Processing', 'Power Generation',
      'Construction & Infrastructure', 'Water Treatment', 'Food & Beverage',
      'Pharmaceutical', 'Automotive', 'Marine & Shipbuilding',
      'Mining & Minerals', 'Steel & Metal Manufacturing',
    ];

    const companyTypes = [
      'importer', 'distributor', 'wholesaler', 'stockist', 'dealer',
      'supplier', 'trading company', 'industrial supplier',
      'OEM manufacturer', 'EPC contractor', 'project contractor',
    ];

    const aliases = [
      canonicalName,
      `${canonicalName} equipment`,
      `${canonicalName} product`,
      `${canonicalName} parts`,
      `${canonicalName} supply`,
    ];

    return {
      association: {
        productName: canonicalName,
        canonicalName,
        aliases,
        industries,
        companyTypes,
        source: '行业联想',
        recommendedSegments: ['importer', 'distributor', 'wholesaler'],
      },
    };
  }

  generateSearchQueries(
    productName: string,
    options: {
      regions?: string[];
      segments?: string[];
      aliases?: string[];
      industries?: string[];
    },
  ): string[] {
    const { regions = ['Global'], segments = ['importer'], aliases = [], industries = [] } = options;
    const queries: string[] = [];
    const allNames = [...new Set([productName, ...aliases].map((item) => item.trim()).filter(Boolean))];
    const markets = regions.length ? regions : ['Global'];
    const buyerSegments = segments.length ? segments : ['importer', 'distributor', 'stockist'];
    const exclusions = '-wikipedia -news -jobs -pdf';

    for (const name of allNames.slice(0, 5)) {
      for (const segment of buyerSegments.slice(0, 6)) {
        for (const region of markets.slice(0, 5)) {
          const market = region === 'Global' ? '' : ` "${region}"`;
          queries.push(`"${name}" "${segment}"${market} "contact us" ${exclusions}`.trim());
          queries.push(`"${name}" "${segment}"${market} (sales OR enquiry OR procurement) ${exclusions}`.trim());
        }
      }
    }
    for (const industry of industries.slice(0, 6)) {
      for (const region of markets.slice(0, 3)) {
        const market = region === 'Global' ? '' : ` "${region}"`;
        queries.push(`"${productName}" "${industry}" (supplier OR contractor OR distributor)${market} ${exclusions}`.trim());
      }
    }
    return [...new Set(queries)].slice(0, 80);
  }

  // ==================== Leads ====================

  async findAll(filters: Record<string, any> = {}) {
    const where: any = {};

    if (filters.q) {
      const query = this.leadRepository
        .createQueryBuilder('lead')
        .where(
          `(lead.company LIKE :q OR lead.contactName LIKE :q OR lead.email LIKE :q OR lead.website LIKE :q)`,
          { q: `%${filters.q}%` },
        );
      if (filters.ownerId) query.andWhere('lead.ownerId = :ownerId', { ownerId: filters.ownerId });
      return query.orderBy('lead.createdAt', 'DESC').getMany();
    }

    if (filters.leadStatus) where.leadStatus = filters.leadStatus;
    if (filters.leadTier) where.leadTier = filters.leadTier;
    if (filters.taskId) where.taskId = filters.taskId;
    if (filters.region) where.region = Like(`%${filters.region}%`);
    if (filters.country) where.country = Like(`%${filters.country}%`);
    if (filters.ownerId) where.ownerId = filters.ownerId;

    return this.leadRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number, ownerId?: string) {
    const lead = await this.leadRepository.findOne({ where: { id } });
    if (!lead) {
      throw new NotFoundException('线索不存在');
    }
    if (ownerId && lead.ownerId !== ownerId) throw new NotFoundException('线索不存在');
    return lead;
  }

  async create(createLeadDto: CreateLeadDto, ownerId = '') {
    const lead = this.leadRepository.create({
      ...createLeadDto,
      ownerId,
      leadId: this.generateId('lead'),
    });
    return this.leadRepository.save(lead);
  }

  async update(id: number, updateLeadDto: UpdateLeadDto, ownerId?: string) {
    const lead = await this.findOne(id, ownerId);
    Object.assign(lead, updateLeadDto);
    return this.leadRepository.save(lead);
  }

  async remove(id: number, ownerId?: string) {
    await this.findOne(id, ownerId);
    const result = await this.leadRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('线索不存在');
    }
    return { deleted: true };
  }

  async bulkDelete(bulkDeleteDto: BulkDeleteLeadsDto, ownerId?: string) {
    const leads = await this.leadRepository.find({
      where: { leadId: In(bulkDeleteDto.ids), ...(ownerId ? { ownerId } : {}) },
    });
    const result = leads.length ? await this.leadRepository.delete({ id: In(leads.map((lead) => lead.id)) }) : { affected: 0 };
    return { deleted: result.affected || 0 };
  }

  async convertLeads(convertDto: ConvertLeadsDto, ownerId?: string) {
    const leads = await this.leadRepository.find({
      where: { leadId: In(convertDto.ids), ...(ownerId ? { ownerId } : {}) },
    });

    const converted: any[] = [];
    for (const lead of leads) {
      if (lead.leadStatus === 'converted') continue;
      lead.leadStatus = 'converted';
      await this.leadRepository.save(lead);
      converted.push({
        leadId: lead.leadId,
        company: lead.company,
        email: lead.email,
      });
    }

    return { converted, count: converted.length };
  }

  // ==================== Lead Tasks ====================

  async findTasks(filters: Record<string, any> = {}) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.ownerId) where.ownerId = filters.ownerId;
    return this.leadTaskRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOneTask(id: number, ownerId?: string) {
    const task = await this.leadTaskRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    if (ownerId && task.ownerId !== ownerId) throw new NotFoundException('任务不存在');
    return task;
  }

  async createTask(createTaskDto: CreateLeadTaskDto, ownerId = '') {
    const task = this.leadTaskRepository.create({
      ...createTaskDto,
      ownerId,
      name: createTaskDto.productName || createTaskDto.name || '获客任务',
      taskId: this.generateId('task'),
      status: 'draft',
    });
    return this.leadTaskRepository.save(task);
  }

  async updateTask(id: number, updateTaskDto: UpdateLeadTaskDto, ownerId?: string) {
    const task = await this.findOneTask(id, ownerId);
    Object.assign(task, updateTaskDto);
    return this.leadTaskRepository.save(task);
  }

  async removeTask(id: number, ownerId?: string) {
    // Also remove associated leads
    const task = await this.findOneTask(id, ownerId);
    await this.leadRepository.delete({ taskId: task.taskId });
    const result = await this.leadTaskRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('任务不存在');
    }
    return { deleted: true };
  }

  async runTask(id: number, ownerId?: string) {
    const task = await this.findOneTask(id, ownerId);
    if (task.status === 'running') {
      return { started: false, message: '任务已经在自动运行中' };
    }

    // Initialize progress if first run
    const queries = task.searchQueries?.length
      ? task.searchQueries
      : this.generateSearchQueries(task.productName || task.name, {
          regions: task.targetRegions,
          segments: task.targetSegments,
          aliases: task.productAliases,
          industries: task.buyerIndustries,
        });
    if (!queries.length) throw new BadRequestException('未生成有效搜索策略');
    task.searchQueries = queries;
    task.status = 'running';
    task.cancelRequested = false;
    task.automationProgress = {
      stage: 'starting',
      progress: 0,
      queryTotal: queries.length,
      queryIndex: task.automationCursor || 0,
      totalQueries: queries.length,
      searchedQueries: task.automationCursor || 0,
      searchedResults: 0,
      websitesCrawled: 0,
      publicEmailsFound: 0,
    };
    task.lastMessage = '任务已启动';
    await this.leadTaskRepository.save(task);

    // Start async processing (fire and forget)
    this.processTaskAsync(task).catch((err) => {
      console.error(`Task ${task.id} processing error:`, err.message);
    });

    return { started: true };
  }

  async cancelTask(id: number, ownerId?: string) {
    const task = await this.findOneTask(id, ownerId);
    if (task.status !== 'running') {
      throw new BadRequestException('任务不在运行状态');
    }
    task.cancelRequested = true;
    task.lastMessage = '正在停止…';
    await this.leadTaskRepository.save(task);
    return { cancelled: true };
  }

  async generateQueries(id: number, dto: GenerateQueriesDto, ownerId?: string) {
    const task = await this.findOneTask(id, ownerId);

    if (dto.regenerate) {
      const queries = this.generateSearchQueries(task.productName || task.name, {
        regions: task.targetRegions,
        segments: task.targetSegments,
        aliases: task.productAliases,
        industries: task.buyerIndustries,
      });
      task.searchQueries = queries;
      task.automationCursor = 0;
      await this.leadTaskRepository.save(task);
      return { task, queries };
    }

    if (dto.queries && dto.queries.length > 0) {
      task.searchQueries = dto.queries;
      await this.leadTaskRepository.save(task);
      return { task, queries: dto.queries };
    }

    return { task, queries: task.searchQueries || [] };
  }

  // ─── Async Task Processing ─────────────────────────────────────────────

  private async processTaskAsync(task: LeadTask): Promise<void> {
    const queries = task.searchQueries || [];
    const totalQueries = queries.length;
    const cursor = task.automationCursor || 0;

    for (let i = cursor; i < totalQueries; i++) {
      // Check if cancelled
      const current = await this.findOneTask(task.id);
      if (current.cancelRequested) {
        current.status = 'cancelled';
        current.automationProgress = { ...current.automationProgress, stage: 'cancelled' };
        current.lastMessage = '任务已取消';
        await this.leadTaskRepository.save(current);
        return;
      }

      const query = queries[i];
      const progress = {
        stage: 'searching',
        progress: Math.round(((i + 1) / totalQueries) * 95),
        queryTotal: totalQueries,
        queryIndex: i + 1,
        totalQueries,
        searchedQueries: i,
        currentQuery: query,
        searchedResults: Number(current.automationProgress?.searchedResults || 0),
        websitesCrawled: Number(current.automationProgress?.websitesCrawled || 0),
        publicEmailsFound: Number(current.automationProgress?.publicEmailsFound || 0),
      };

      await this.leadTaskRepository.update(task.id, {
        automationCursor: i + 1,
        automationProgress: progress as any,
        automationStage: 'searching',
        lastMessage: `正在搜索: ${query}`,
      });

      try {
        const productNames = [current.productName, ...(current.productAliases || [])].filter(Boolean);
        const discovery = await this.leadSearchService.discover(
          query,
          productNames,
          current.targetSegments || current.buyerCompanyTypes || [],
        );
        const added = await this.saveDiscoveredCandidates(current, discovery.candidates);
        const totalFound = await this.leadRepository.count({ where: { taskId: current.taskId } });
        await this.leadTaskRepository.update(task.id, {
          rawLeadCount: totalFound,
          leadCount: totalFound,
          automationProgress: {
            ...progress,
            searchedQueries: i + 1,
            searchedResults: Number(progress.searchedResults || 0) + discovery.searched,
            websitesCrawled: Number(progress.websitesCrawled || 0) + discovery.crawled,
            publicEmailsFound: Number(progress.publicEmailsFound || 0) + added.withEmail,
            leadsFound: totalFound,
          } as any,
          lastMessage: `已完成 ${i + 1}/${totalQueries} 个查询，累计发现 ${totalFound} 条企业线索`,
        });
        if (totalFound >= Math.max(1, current.targetCount || 100)) break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.leadTaskRepository.update(task.id, {
          automationProgress: { ...progress, searchedQueries: i + 1, lastError: message } as any,
          lastMessage: `查询失败，继续下一条：${message}`,
        });
        if (/搜索 API|搜索数据源均不可用/.test(message)) {
          await this.leadTaskRepository.update(task.id, {
            status: 'exhausted',
            automationStage: 'failed',
            lastMessage: message,
          });
          return;
        }
      }
    }

    // Mark as cleaning
    await this.leadTaskRepository.update(task.id, {
      automationStage: 'cleaning',
      automationProgress: {
        stage: 'cleaning',
        progress: 96,
        queryTotal: totalQueries,
        queryIndex: totalQueries,
        totalQueries,
        searchedQueries: totalQueries,
      } as any,
      lastMessage: '搜索完成，正在清洗数据…',
    });

    await this.cleanLeads(task.id);

    // Mark as validating
    await this.leadTaskRepository.update(task.id, {
      automationStage: 'validating',
      automationProgress: {
        stage: 'validating',
        progress: 98,
        queryTotal: totalQueries,
        queryIndex: totalQueries,
        totalQueries,
        searchedQueries: totalQueries,
      } as any,
      lastMessage: '正在去重、验证与评分…',
    });

    // Mark as completed
    const finalTask = await this.findOneTask(task.id);
    const leadCount = await this.leadRepository.count({ where: { taskId: finalTask.taskId } });
    await this.leadTaskRepository.update(task.id, {
      status: leadCount > 0 ? 'completed' : 'exhausted',
      automationStage: leadCount > 0 ? 'completed' : 'failed',
      automationCursor: totalQueries,
      automationProgress: {
        stage: 'completed',
        progress: 100,
        queryTotal: totalQueries,
        queryIndex: totalQueries,
        totalQueries,
        searchedQueries: totalQueries,
        searchedResults: Number(finalTask.automationProgress?.searchedResults || 0),
        websitesCrawled: Number(finalTask.automationProgress?.websitesCrawled || 0),
        publicEmailsFound: Number(finalTask.automationProgress?.publicEmailsFound || 0),
      } as any,
      cleanedLeadCount: leadCount,
      lastMessage: `搜索完成，共发现 ${leadCount} 条线索`,
    });
  }

  // ─── Task Leads ────────────────────────────────────────────────────────

  async getTaskLeads(taskId: number, filters: Record<string, any> = {}, ownerId?: string) {
    const task = await this.findOneTask(taskId, ownerId);
    const where: any = { taskId: task.taskId };

    if (filters.largeRegion) where.largeRegion = filters.largeRegion;
    if (filters.country) where.country = filters.country;
    if (filters.targetSegment) where.targetSegment = filters.targetSegment;
    if (filters.recommendedAction) where.recommendedAction = filters.recommendedAction;
    if (filters.confidence) where.confidence = filters.confidence;
    if (filters.leadTier) where.leadTier = filters.leadTier;

    const leads = await this.leadRepository.find({
      where,
      order: { createdAt: 'DESC' },
      take: 500,
    });

    // Compute summary
    const total = leads.length;
    const readyToEmail = leads.filter((l) => l.recommendedAction === 'Ready to Email').length;
    const needsReview = leads.filter((l) => l.recommendedAction === 'Needs Review').length;
    const remove = leads.filter((l) => l.recommendedAction === 'Remove').length;
    const hardBounce = leads.filter((l) => l.recommendedAction === 'Hard Bounce').length;
    const duplicatesRemoved = leads.filter((lead) => lead.status === 'duplicate').length;

    const byLargeRegion: Record<string, number> = {};
    const byTargetSegment: Record<string, number> = {};
    for (const lead of leads) {
      if (lead.largeRegion) byLargeRegion[lead.largeRegion] = (byLargeRegion[lead.largeRegion] || 0) + 1;
      if (lead.targetSegment) byTargetSegment[lead.targetSegment] = (byTargetSegment[lead.targetSegment] || 0) + 1;
    }

    return {
      leads,
      summary: {
        total,
        readyToEmail,
        needsReview,
        remove,
        hardBounce,
        duplicatesRemoved,
        byLargeRegion,
        byTargetSegment,
      },
    };
  }

  async importLeads(taskId: number, leadsData: Record<string, any>[], ownerId?: string) {
    const task = await this.findOneTask(taskId, ownerId);
    const now = new Date();
    let imported = 0;

    for (const data of leadsData) {
      try {
        const lead = this.leadRepository.create({
          taskId: task.taskId,
          ownerId: task.ownerId,
          leadId: this.generateId('lead'),
          company: data.company || data.companyName || '未知公司',
          contactName: data.contactName || data.contact || '',
          email: data.email || '',
          phone: data.phone || '',
          website: data.website || '',
          region: data.region || '',
          country: data.country || '',
          largeRegion: data.largeRegion || '',
          business: data.business || '',
          targetSegment: data.targetSegment || '',
          buyerType: data.buyerType || '',
          sourceName: data.sourceName || data.source || '',
          sourceType: data.sourceType || 'manual',
          sourceUrl: data.sourceUrl || data.source || '',
          confidence: data.confidence || 'Medium',
          recommendedAction: data.recommendedAction || 'Needs Review',
          leadStatus: 'new',
          status: 'candidate',
          rawData: data,
        });
        await this.leadRepository.save(lead);
        imported++;
      } catch (err) {
        // Skip invalid entries
        console.error(`Failed to import lead: ${err.message}`);
      }
    }

    // Update task counts
    const count = await this.leadRepository.count({ where: { taskId: task.taskId } });
    await this.leadTaskRepository.update(task.id, {
      rawLeadCount: count,
      leadCount: count,
    });

    return { imported };
  }

  async cleanLeads(taskId: number, ownerId?: string) {
    const task = await this.findOneTask(taskId, ownerId);
    const leads = await this.leadRepository.find({ where: { taskId: task.taskId } });

    let readyToEmail = 0;
    let needsReview = 0;
    let remove = 0;
    let hardBounce = 0;
    let duplicateCount = 0;
    const seenEmails = new Set<string>();
    const seenCompanies = new Set<string>();

    for (const lead of leads) {
      const email = String(lead.email || '').trim().toLowerCase();
      const companyKey = `${this.normalizeCompany(lead.company)}|${String(lead.country || '').toLowerCase()}`;
      const duplicate = (email && seenEmails.has(email)) ||
        (this.normalizeCompany(lead.company) && seenCompanies.has(companyKey));
      if (email) seenEmails.add(email);
      if (this.normalizeCompany(lead.company)) seenCompanies.add(companyKey);

      if (duplicate) {
        lead.status = 'duplicate';
        lead.recommendedAction = 'Remove';
        lead.leadTier = 'remove';
        lead.confidence = 'Low';
        lead.cleaningNotes = this.appendNote(lead.cleaningNotes, '重复邮箱或同国家重复公司');
        duplicateCount++;
        await this.leadRepository.save(lead);
        continue;
      }

      const validation = await this.validateLeadEmail(email);
      const sourceReachable = lead.sourceHttpStatus >= 200 && lead.sourceHttpStatus <= 499;
      const sourceHost = this.hostname(lead.sourceUrl || lead.website);
      const emailDomain = email.split('@')[1] || '';
      const domainMatch = Boolean(emailDomain && sourceHost &&
        (sourceHost === emailDomain || sourceHost.endsWith(`.${emailDomain}`) || emailDomain.endsWith(`.${sourceHost}`)));
      const freeEmail = /^(gmail|yahoo|hotmail|outlook|live|icloud|qq|163|126)\./i.test(emailDomain);
      const preferredEmail = /^(sales|info|export|enquiry|inquiries|contact|procurement|purchasing|rfq|quotes)@/i.test(email);

      let score = 0;
      if (lead.matchedProductKeyword) score += 25;
      if (lead.targetSegment || lead.buyerType) score += 20;
      if (sourceReachable) score += 20;
      if (domainMatch) score += 15;
      if (['Company Website', 'Contact Page'].includes(lead.sourceType)) score += 10;
      if (preferredEmail) score += 10;
      if (freeEmail) score -= 20;
      if (lead.sourceType === 'Directory / Marketplace') score -= 20;
      if (!sourceReachable) score -= 30;
      if (validation.hardBounce) score -= 50;
      if (validation.blocked) score -= 100;
      lead.leadScore = Math.max(0, Math.min(100, score));
      lead.email = email;
      lead.emailStatus = validation.valid ? 'verified' : validation.hardBounce || validation.blocked ? 'invalid' : 'unknown';
      lead.emailSourceDomainMatch = domainMatch;
      lead.confidence = lead.leadScore >= 80 ? 'High' : lead.leadScore >= 50 ? 'Medium' : 'Low';
      lead.cleaningNotes = this.appendNote(
        lead.cleaningNotes,
        [validation.note, domainMatch ? '邮箱域名与官网匹配' : email ? '邮箱域名与来源需复核' : '未发现公开邮箱', !sourceReachable ? '来源页面当前不可访问' : '']
          .filter(Boolean).join('；'),
      );

      if (validation.hardBounce) {
        lead.recommendedAction = 'Hard Bounce';
        lead.leadTier = 'remove';
        hardBounce++;
      } else if (validation.blocked) {
        lead.recommendedAction = 'Remove';
        lead.leadTier = 'remove';
        remove++;
      } else if (validation.valid && sourceReachable && lead.confidence === 'High' &&
        (domainMatch || ['Company Website', 'Contact Page'].includes(lead.sourceType)) && !freeEmail) {
        lead.recommendedAction = 'Ready to Email';
        lead.leadTier = 'high';
        readyToEmail++;
      } else {
        lead.recommendedAction = 'Needs Review';
        lead.leadTier = lead.confidence === 'Medium' ? 'medium' : 'review';
        needsReview++;
      }
      await this.leadRepository.save(lead);
    }

    const byLargeRegion: Record<string, number> = {};
    const byTargetSegment: Record<string, number> = {};
    for (const lead of leads) {
      if (lead.largeRegion) byLargeRegion[lead.largeRegion] = (byLargeRegion[lead.largeRegion] || 0) + 1;
      if (lead.targetSegment) byTargetSegment[lead.targetSegment] = (byTargetSegment[lead.targetSegment] || 0) + 1;
    }

    const total = leads.length;
    await this.leadTaskRepository.update(task.id, {
      cleanedLeadCount: total,
      duplicateCount,
    });

    return {
      summary: {
        total,
        readyToEmail,
        needsReview,
        remove,
        hardBounce,
        duplicatesRemoved: duplicateCount,
        byLargeRegion,
        byTargetSegment,
      },
    };
  }

  async importToCustomers(taskId: number, dto: ImportCustomersDto, ownerId = '') {
    const task = await this.findOneTask(taskId, ownerId || undefined);
    let leads: Lead[];

    if (dto.importAll) {
      leads = await this.leadRepository.find({
        where: { taskId: task.taskId },
      });
    } else if (dto.ids && dto.ids.length > 0) {
      leads = await this.leadRepository.find({
        where: { taskId: task.taskId, leadId: In(dto.ids) },
      });
    } else {
      leads = [];
    }

    // Filter only importable leads
    const importable = leads.filter(
      (l) => l.company && !l.crmCustomerId && l.recommendedAction !== 'Remove' && l.recommendedAction !== 'Hard Bounce',
    );

    let created = 0;
    let merged = 0;
    let skipped = 0;
    for (const lead of importable) {
      try {
        const result = await this.customersService.upsertLeadCustomer({
        company: lead.company,
        contact: lead.contactName,
        email: lead.email,
        phone: lead.phone,
        website: lead.website,
        region: lead.region,
        country: lead.country,
        business: lead.business,
        product: task.productName,
        customerType: lead.targetSegment || lead.buyerType,
        notes: `获客来源：${lead.sourceUrl}\n${lead.cleaningNotes || ''}`.trim(),
        source: lead.sourceUrl || lead.sourceName || 'lead',
        }, ownerId);
        lead.crmCustomerId = result.customer.customerId;
        lead.convertedCustomerId = result.customer.customerId;
        lead.leadStatus = 'converted';
        lead.status = 'converted';
        await this.leadRepository.save(lead);
        if (result.created) created++;
        else merged++;
      } catch (error: any) {
        skipped++;
        lead.reviewReason = error?.message || '客户导入失败';
        await this.leadRepository.save(lead);
      }
    }

    await this.leadTaskRepository.update(task.id, {
      importedCustomerCount: (task.importedCustomerCount || 0) + importable.length,
    });

    return {
      imported: created,
      merged,
      skipped,
    };
  }

  async exportLeads(taskId: number, type: string, ownerId?: string): Promise<string> {
    const task = await this.findOneTask(taskId, ownerId);
    const where: any = { taskId: task.taskId };

    if (type === 'ready') where.recommendedAction = 'Ready to Email';
    else if (type === 'review') where.recommendedAction = 'Needs Review';
    else if (type === 'removed') where.recommendedAction = 'Remove';
    else if (type === 'duplicates') {
      // Simplified: return leads with status=duplicate or similar
      where.status = 'duplicate';
    }

    const leads = await this.leadRepository.find({ where, order: { createdAt: 'DESC' } });

    // Generate CSV
    const headers = [
      'company', 'email', 'website', 'phone', 'contactName', 'country',
      'largeRegion', 'targetSegment', 'buyerType', 'leadScore', 'confidence',
      'recommendedAction', 'leadTier', 'sourceType', 'sourceName', 'cleaningNotes',
    ];

    const csvRows = [headers.join(',')];
    for (const lead of leads) {
      const row = headers.map((h) => {
        const value = String((lead as any)[h] || '');
        // Escape CSV values
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      csvRows.push(row.join(','));
    }

    return csvRows.join('\n');
  }

  private async saveDiscoveredCandidates(task: LeadTask, candidates: SearchCandidate[]) {
    let added = 0;
    let withEmail = 0;
    for (const candidate of candidates) {
      const email = candidate.email.trim().toLowerCase();
      const existing = await this.leadRepository.findOne({
        where: email
          ? [{ taskId: task.taskId, email }, { taskId: task.taskId, sourceUrl: candidate.sourceUrl }]
          : { taskId: task.taskId, sourceUrl: candidate.sourceUrl },
      });
      if (existing) continue;
      const region = (task.targetRegions || []).find((item) => item !== 'Global') || task.targetRegion || '';
      const lead = this.leadRepository.create({
        taskId: task.taskId,
        ownerId: task.ownerId,
        leadId: this.generateId('lead'),
        company: candidate.company,
        email,
        website: candidate.website,
        region,
        country: region,
        largeRegion: this.largeRegionFor(region),
        business: candidate.business,
        targetSegment: candidate.targetSegment,
        buyerType: candidate.targetSegment,
        sourceUrl: candidate.sourceUrl,
        sourcePage: candidate.sourceUrl,
        sourceType: candidate.sourceType,
        sourceName: candidate.sourceName,
        sourceHttpStatus: candidate.sourceHttpStatus,
        matchedProductKeyword: candidate.matchedProductKeyword,
        cleaningNotes: candidate.fitNote || '公开网页与产品及买家身份匹配',
        confidence: email ? 'Medium' : 'Low',
        recommendedAction: 'Needs Review',
        leadStatus: 'new',
        status: 'candidate',
        rawData: candidate.rawData,
      });
      await this.leadRepository.save(lead);
      added++;
      if (email) withEmail++;
    }
    return { added, withEmail };
  }

  private largeRegionFor(countryOrRegion: string) {
    const value = countryOrRegion.toLowerCase();
    const groups: Array<[string, string[]]> = [
      ['Middle East', ['uae', 'united arab emirates', 'saudi arabia', 'qatar', 'oman', 'bahrain', 'kuwait', 'iraq', 'jordan', 'turkey', 'israel']],
      ['Southeast Asia', ['singapore', 'malaysia', 'indonesia', 'thailand', 'vietnam', 'philippines', 'cambodia', 'myanmar', 'laos', 'brunei']],
      ['North America', ['usa', 'united states', 'canada', 'mexico']],
      ['Europe', ['uk', 'united kingdom', 'germany', 'netherlands', 'italy', 'france', 'spain', 'belgium', 'poland', 'norway', 'sweden', 'denmark', 'ireland']],
      ['Oceania', ['australia', 'new zealand']],
      ['Africa', ['south africa', 'nigeria', 'kenya', 'egypt', 'morocco', 'ghana', 'tanzania', 'angola']],
      ['South America', ['chile', 'peru', 'brazil', 'argentina', 'colombia', 'ecuador']],
      ['South Asia', ['india', 'pakistan', 'bangladesh', 'sri lanka']],
      ['East Asia', ['japan', 'south korea', 'china', 'taiwan']],
    ];
    return groups.find(([, countries]) => countries.includes(value))?.[0] || countryOrRegion;
  }

  private async validateLeadEmail(email: string) {
    if (!email) return { valid: false, hardBounce: false, blocked: false, note: '未发现公开邮箱' };
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return { valid: false, hardBounce: false, blocked: true, note: '邮箱格式无效' };
    }
    const prefix = email.split('@')[0];
    if (['no-reply', 'noreply', 'donotreply', 'abuse', 'postmaster', 'hostmaster'].includes(prefix)) {
      return { valid: false, hardBounce: false, blocked: true, note: '禁止发送的系统邮箱' };
    }
    try {
      const records = await resolveMx(email.split('@')[1]);
      if (!records.length) return { valid: false, hardBounce: true, blocked: false, note: '邮箱域名没有 MX 记录' };
      return { valid: true, hardBounce: false, blocked: false, note: '邮箱格式及 MX 记录有效' };
    } catch (error: any) {
      const hardBounce = ['ENOTFOUND', 'ENODATA', 'NXDOMAIN'].includes(String(error?.code || '').toUpperCase());
      return {
        valid: false,
        hardBounce,
        blocked: false,
        note: hardBounce ? '邮箱域名不存在 / NXDOMAIN' : 'MX 查询暂时失败，需人工复核',
      };
    }
  }

  private normalizeCompany(value: string) {
    return String(value || '')
      .toLowerCase()
      .replace(/\b(limited|ltd|llc|fze|fzco|gmbh|inc|incorporated|company|co|pte|sdn\s*bhd|bv)\b\.?/g, ' ')
      .replace(/[^a-z0-9\p{L}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private hostname(value: string) {
    try { return new URL(value).hostname.toLowerCase().replace(/^www\./, ''); } catch { return ''; }
  }

  private appendNote(existing: string, note: string) {
    return [String(existing || '').trim(), note.trim()].filter(Boolean).join('；');
  }

  // ==================== Utils ====================

  private generateId(prefix: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}_${timestamp}${random}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
