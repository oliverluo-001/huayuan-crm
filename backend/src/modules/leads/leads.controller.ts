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

// ─── Lead Associations Controller ────────────────────────────────────────

@Controller('lead-associations')
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
  findAll(@Query() query: Record<string, any>) {
    return this.leadsService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOne(+id);
  }

  @Post()
  create(@Body() createLeadDto: CreateLeadDto) {
    return this.leadsService.create(createLeadDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateLeadDto: UpdateLeadDto) {
    return this.leadsService.update(+id, updateLeadDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leadsService.remove(+id);
  }

  @Post('convert')
  convert(@Body() convertDto: ConvertLeadsDto) {
    return this.leadsService.convertLeads(convertDto);
  }

  @Post('bulk-delete')
  bulkDelete(@Body() bulkDeleteDto: BulkDeleteLeadsDto) {
    return this.leadsService.bulkDelete(bulkDeleteDto);
  }
}

// ─── Lead Tasks Controller ───────────────────────────────────────────────

@Controller('lead-tasks')
export class LeadTasksController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>) {
    const tasks = await this.leadsService.findTasks(query);
    return { tasks };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.leadsService.findOneTask(+id);
  }

  @Post()
  async create(@Body() createTaskDto: CreateLeadTaskDto) {
    const result = await this.leadsService.createTask(createTaskDto);

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
      await this.leadsService.updateTask(result.id, { searchQueries: queries } as any);
    }

    return { task: result, queries };
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateLeadTaskDto) {
    return this.leadsService.updateTask(+id, updateTaskDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.leadsService.removeTask(+id);
  }

  @Post(':id/run')
  run(@Param('id') id: string) {
    return this.leadsService.runTask(+id);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.leadsService.cancelTask(+id);
  }

  @Post(':id/generate-queries')
  async generateQueries(
    @Param('id') id: string,
    @Body() dto: GenerateQueriesDto,
  ) {
    return this.leadsService.generateQueries(+id, dto);
  }

  @Get(':id/leads')
  getLeads(
    @Param('id') id: string,
    @Query() query: Record<string, any>,
  ) {
    return this.leadsService.getTaskLeads(+id, query);
  }

  @Post(':id/import-leads')
  importLeads(
    @Param('id') id: string,
    @Body() dto: ImportLeadsDto,
  ) {
    return this.leadsService.importLeads(+id, dto.leads);
  }

  @Post(':id/clean')
  cleanLeads(@Param('id') id: string) {
    return this.leadsService.cleanLeads(+id);
  }

  @Post(':id/import-customers')
  @Roles('admin', 'sales')
  importToCustomers(
    @Param('id') id: string,
    @Body() dto: ImportCustomersDto,
    @CurrentUser() user: { sub: number; role: string },
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
    @Res() res: Response,
  ) {
    const data = await this.leadsService.exportLeads(+id, type || 'all');
    const filename = `leads_${id}_${type || 'all'}_${Date.now()}`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    res.send(data);
  }
}
