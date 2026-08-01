import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { LeadsService } from './leads.service';
import {
  CreateLeadDto,
  UpdateLeadDto,
  ConvertLeadsDto,
  BulkDeleteLeadsDto,
  CreateLeadTaskDto,
  UpdateLeadTaskDto,
  LeadAssociationRequestDto,
  ImportLeadsDto,
  ImportCustomersDto,
  GenerateQueriesDto,
} from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestUser { sub: number; role: 'admin' | 'sales' | 'viewer' }
const ownerScope = (user: RequestUser) => user.role === 'sales' ? String(user.sub) : undefined;

// ─── Lead Associations Controller ────────────────────────────────────────

@Controller('lead-associations')
@Roles('admin', 'sales')
export class LeadAssociationsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Post()
  async getAssociation(@Body() dto: LeadAssociationRequestDto) {
    return this.leadsService.getAssociation(dto.productName);
  }
}

// ─── Leads Controller ────────────────────────────────────────────────────

@Controller('leads')
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    return this.leadsService.findAll({ ...query, ownerId: ownerScope(user) });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadsService.findOne(+id, ownerScope(user));
  }

  @Post()
  @Roles('admin', 'sales')
  create(@Body() createLeadDto: CreateLeadDto, @CurrentUser() user: RequestUser) {
    return this.leadsService.create(createLeadDto, ownerScope(user) || '');
  }

  @Put(':id')
  @Roles('admin', 'sales')
  update(@Param('id') id: string, @Body() updateLeadDto: UpdateLeadDto, @CurrentUser() user: RequestUser) {
    return this.leadsService.update(+id, updateLeadDto, ownerScope(user));
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadsService.remove(+id, ownerScope(user));
  }

  @Post('convert')
  @Roles('admin', 'sales')
  convert(@Body() convertDto: ConvertLeadsDto, @CurrentUser() user: RequestUser) {
    return this.leadsService.convertLeads(convertDto, ownerScope(user));
  }

  @Post('bulk-delete')
  @Roles('admin', 'sales')
  bulkDelete(@Body() bulkDeleteDto: BulkDeleteLeadsDto, @CurrentUser() user: RequestUser) {
    return this.leadsService.bulkDelete(bulkDeleteDto, ownerScope(user));
  }
}

// ─── Lead Tasks Controller ───────────────────────────────────────────────

@Controller('lead-tasks')
export class LeadTasksController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    const tasks = await this.leadsService.findTasks({ ...query, ownerId: ownerScope(user) });
    return { tasks };
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadsService.findOneTask(+id, ownerScope(user));
  }

  @Post()
  @Roles('admin', 'sales')
  async create(@Body() createTaskDto: CreateLeadTaskDto, @CurrentUser() user: RequestUser) {
    const ownerId = ownerScope(user) || '';
    const result = await this.leadsService.createTask(createTaskDto, ownerId);

    // Generate initial queries if not provided
    let queries: string[] = [];
    if (createTaskDto.searchQueries && createTaskDto.searchQueries.length > 0) {
      queries = createTaskDto.searchQueries;
    } else {
      queries = this.leadsService.generateSearchQueries(createTaskDto.productName || createTaskDto.name || '获客任务', {
        regions: createTaskDto.targetCountries?.length
          ? createTaskDto.targetCountries
          : createTaskDto.targetRegions,
        segments: createTaskDto.targetSegments,
        aliases: createTaskDto.productAliases,
        industries: createTaskDto.buyerIndustries,
      });
      await this.leadsService.updateTask(result.id, { searchQueries: queries } as any, ownerScope(user));
    }

    return { task: result, queries };
  }

  @Put(':id')
  @Roles('admin', 'sales')
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateLeadTaskDto, @CurrentUser() user: RequestUser) {
    return this.leadsService.updateTask(+id, updateTaskDto, ownerScope(user));
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadsService.removeTask(+id, ownerScope(user));
  }

  @Post(':id/run')
  @Roles('admin', 'sales')
  run(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadsService.runTask(+id, ownerScope(user));
  }

  @Post(':id/cancel')
  @Roles('admin', 'sales')
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadsService.cancelTask(+id, ownerScope(user));
  }

  @Post(':id/generate-queries')
  @Roles('admin', 'sales')
  async generateQueries(
    @Param('id') id: string,
    @Body() dto: GenerateQueriesDto, @CurrentUser() user: RequestUser,
  ) {
    return this.leadsService.generateQueries(+id, dto, ownerScope(user));
  }

  @Get(':id/leads')
  getLeads(
    @Param('id') id: string,
    @Query() query: Record<string, any>, @CurrentUser() user: RequestUser,
  ) {
    return this.leadsService.getTaskLeads(+id, query, ownerScope(user));
  }

  @Post(':id/import-leads')
  @Roles('admin', 'sales')
  importLeads(
    @Param('id') id: string,
    @Body() dto: ImportLeadsDto, @CurrentUser() user: RequestUser,
  ) {
    return this.leadsService.importLeads(+id, dto.leads, ownerScope(user));
  }

  @Post(':id/clean')
  @Roles('admin', 'sales')
  cleanLeads(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.leadsService.cleanLeads(+id, ownerScope(user));
  }

  @Post(':id/import-customers')
  @Roles('admin', 'sales')
  importToCustomers(
    @Param('id') id: string,
    @Body() dto: ImportCustomersDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.leadsService.importToCustomers(
      +id,
      dto,
      user.role === 'sales' ? String(user.sub) : '',
    );
  }

  @Get(':id/export')
  async exportLeads(
    @Param('id') id: string,
    @Query('type') type: string,
    @Res() res: Response, @CurrentUser() user: RequestUser,
  ) {
    const data = await this.leadsService.exportLeads(+id, type || 'all', ownerScope(user));
    const filename = `leads_${id}_${type || 'all'}_${Date.now()}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send(data);
  }
}
