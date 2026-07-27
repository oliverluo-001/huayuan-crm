import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like, In, Brackets } from 'typeorm';
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
  ) {}

  // ==================== Lead Associations ====================

  async getAssociation(productName: string): Promise<{ association: LeadAssociationResponseDto }> {
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
    const allNames = [productName, ...aliases].filter(Boolean);

    for (const name of allNames.slice(0, 3)) {
      for (const segment of segments.slice(0, 5)) {
        for (const region of regions.slice(0, 3)) {
          if (region === 'Global') {
            queries.push(`"${name}" ${segment}`);
          } else {
            queries.push(`"${name}" ${segment} ${region}`);
          }
        }
      }
    }

    // Deduplicate and limit
    return [...new Set(queries)].slice(0, 50);
  }

  // ==================== Leads ====================

  async findAll(filters: Record<string, any> = {}) {
    const where: any = {};

    if (filters.q) {
      return this.leadRepository
        .createQueryBuilder('lead')
        .where(
          `lead.company LIKE :q OR lead.contactName LIKE :q OR lead.email LIKE :q OR lead.website LIKE :q`,
          { q: `%${filters.q}%` },
        )
        .orderBy('lead.createdAt', 'DESC')
        .getMany();
    }

    if (filters.leadStatus) where.leadStatus = filters.leadStatus;
    if (filters.leadTier) where.leadTier = filters.leadTier;
    if (filters.taskId) where.taskId = filters.taskId;
    if (filters.region) where.region = Like(`%${filters.region}%`);
    if (filters.country) where.country = Like(`%${filters.country}%`);

    return this.leadRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number) {
    const lead = await this.leadRepository.findOne({ where: { id } });
    if (!lead) {
      throw new NotFoundException('线索不存在');
    }
    return lead;
  }

  async create(createLeadDto: CreateLeadDto) {
    const lead = this.leadRepository.create({
      ...createLeadDto,
      leadId: this.generateId('lead'),
    });
    return this.leadRepository.save(lead);
  }

  async update(id: number, updateLeadDto: UpdateLeadDto) {
    const lead = await this.findOne(id);
    Object.assign(lead, updateLeadDto);
    return this.leadRepository.save(lead);
  }

  async remove(id: number) {
    const result = await this.leadRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('线索不存在');
    }
    return { deleted: true };
  }

  async bulkDelete(bulkDeleteDto: BulkDeleteLeadsDto) {
    const leads = await this.leadRepository.find({
      where: { leadId: In(bulkDeleteDto.ids) },
    });
    const result = await this.leadRepository.delete({
      leadId: In(bulkDeleteDto.ids),
    });
    return { deleted: result.affected || 0 };
  }

  async convertLeads(convertDto: ConvertLeadsDto) {
    const leads = await this.leadRepository.find({
      where: { leadId: In(convertDto.ids) },
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
    return this.leadTaskRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOneTask(id: number) {
    const task = await this.leadTaskRepository.findOne({ where: { id } });
    if (!task) {
      throw new NotFoundException('任务不存在');
    }
    return task;
  }

  async createTask(createTaskDto: CreateLeadTaskDto) {
    const task = this.leadTaskRepository.create({
      ...createTaskDto,
      name: createTaskDto.productName || createTaskDto.name || '获客任务',
      taskId: this.generateId('task'),
      status: 'draft',
    });
    return this.leadTaskRepository.save(task);
  }

  async updateTask(id: number, updateTaskDto: UpdateLeadTaskDto) {
    const task = await this.findOneTask(id);
    Object.assign(task, updateTaskDto);
    return this.leadTaskRepository.save(task);
  }

  async removeTask(id: number) {
    // Also remove associated leads
    const task = await this.findOneTask(id);
    await this.leadRepository.delete({ taskId: task.taskId });
    const result = await this.leadTaskRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException('任务不存在');
    }
    return { deleted: true };
  }

  async runTask(id: number) {
    const task = await this.findOneTask(id);
    if (task.status === 'running') {
      return { started: false, message: '任务已经在自动运行中' };
    }

    // Initialize progress if first run
    const queries = task.searchQueries || [];
    task.status = 'running';
    task.cancelRequested = false;
    task.automationProgress = {
      stage: 'starting',
      progress: 0,
      queryTotal: queries.length,
      queryIndex: task.automationCursor || 0,
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

  async cancelTask(id: number) {
    const task = await this.findOneTask(id);
    if (task.status !== 'running') {
      throw new BadRequestException('任务不在运行状态');
    }
    task.cancelRequested = true;
    task.lastMessage = '正在停止…';
    await this.leadTaskRepository.save(task);
    return { cancelled: true };
  }

  async generateQueries(id: number, dto: GenerateQueriesDto) {
    const task = await this.findOneTask(id);

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

      // Simulate processing delay
      await this.delay(2000);
    }

    // Mark as cleaning
    await this.leadTaskRepository.update(task.id, {
      automationStage: 'cleaning',
      automationProgress: {
        stage: 'cleaning',
        progress: 96,
        queryTotal: totalQueries,
        queryIndex: totalQueries,
      } as any,
      lastMessage: '搜索完成，正在清洗数据…',
    });

    await this.delay(1000);

    // Mark as validating
    await this.leadTaskRepository.update(task.id, {
      automationStage: 'validating',
      automationProgress: {
        stage: 'validating',
        progress: 98,
        queryTotal: totalQueries,
        queryIndex: totalQueries,
      } as any,
      lastMessage: '正在去重、验证与评分…',
    });

    await this.delay(1000);

    // Mark as completed
    const finalTask = await this.findOneTask(task.id);
    const leadCount = await this.leadRepository.count({ where: { taskId: finalTask.taskId } });
    await this.leadTaskRepository.update(task.id, {
      status: 'completed',
      automationStage: 'completed',
      automationCursor: totalQueries,
      automationProgress: {
        stage: 'completed',
        progress: 100,
        queryTotal: totalQueries,
        queryIndex: totalQueries,
        searchedResults: leadCount,
        websitesCrawled: leadCount,
        publicEmailsFound: leadCount,
      } as any,
      cleanedLeadCount: leadCount,
      lastMessage: `搜索完成，共发现 ${leadCount} 条线索`,
    });
  }

  // ─── Task Leads ────────────────────────────────────────────────────────

  async getTaskLeads(taskId: number, filters: Record<string, any> = {}) {
    const task = await this.findOneTask(taskId);
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
    const duplicatesRemoved = leads.length; // simplified

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

  async importLeads(taskId: number, leadsData: Record<string, any>[]) {
    const task = await this.findOneTask(taskId);
    const now = new Date();
    let imported = 0;

    for (const data of leadsData) {
      try {
        const lead = this.leadRepository.create({
          taskId: task.taskId,
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

  async cleanLeads(taskId: number) {
    const task = await this.findOneTask(taskId);
    const leads = await this.leadRepository.find({ where: { taskId: task.taskId } });

    let readyToEmail = 0;
    let needsReview = 0;
    let remove = 0;
    let hardBounce = 0;

    for (const lead of leads) {
      // Basic scoring
      let score = 0;
      if (lead.company) score += 20;
      if (lead.website) score += 15;
      if (lead.email) score += 25;
      if (lead.email && lead.email.includes('@')) score += 10;
      if (lead.phone) score += 5;
      if (lead.country) score += 5;
      if (lead.targetSegment) score += 10;
      if (lead.business) score += 10;

      lead.leadScore = score;

      if (score >= 60 && lead.email) {
        lead.recommendedAction = 'Ready to Email';
        lead.leadTier = 'high';
        lead.confidence = 'High';
        readyToEmail++;
      } else if (score >= 30) {
        lead.recommendedAction = 'Needs Review';
        lead.leadTier = 'medium';
        lead.confidence = 'Medium';
        needsReview++;
      } else if (score > 0) {
        lead.recommendedAction = 'Remove';
        lead.leadTier = 'review';
        lead.confidence = 'Low';
        remove++;
      } else {
        lead.recommendedAction = 'Hard Bounce';
        lead.leadTier = 'remove';
        lead.confidence = 'Low';
        hardBounce++;
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
      duplicateCount: 0,
    });

    return {
      summary: {
        total,
        readyToEmail,
        needsReview,
        remove,
        hardBounce,
        duplicatesRemoved: 0,
        byLargeRegion,
        byTargetSegment,
      },
    };
  }

  async importToCustomers(taskId: number, dto: ImportCustomersDto) {
    const task = await this.findOneTask(taskId);
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

    // Mark as imported
    for (const lead of importable) {
      lead.crmCustomerId = `imported_${lead.leadId}`;
      lead.leadStatus = 'converted';
      lead.status = 'converted';
      await this.leadRepository.save(lead);
    }

    await this.leadTaskRepository.update(task.id, {
      importedCustomerCount: (task.importedCustomerCount || 0) + importable.length,
    });

    return {
      imported: importable.length,
      merged: 0,
    };
  }

  async exportLeads(taskId: number, type: string): Promise<string> {
    const task = await this.findOneTask(taskId);
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
