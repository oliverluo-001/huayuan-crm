import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  HttpCode,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomersService } from './customers.service';
import { QuoteOutputService } from './quote-output.service';
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
  CreateQuoteTermTemplateDto,
  UpdateQuoteTermTemplateDto,
  CreateSampleDto,
  UpdateSampleDto,
  CreateCustomerViewDto,
  UpdateCustomerViewDto,
} from './dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestUser {
  sub: number;
  role: 'admin' | 'sales' | 'viewer';
  username?: string;
  displayName?: string;
}
const requestOwnerId = (user: RequestUser) =>
  user.role === 'sales' ? String(user.sub) : undefined;
const opportunityActor = (user: RequestUser) => ({
  userId: String(user.sub),
  displayName: user.displayName || user.username || String(user.sub),
});

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // ==================== Customer CRUD ====================

  @Get()
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    const scoped = { ...query };
    if (user.role === 'sales' || query.ownerId === 'me')
      scoped.ownerId = String(user.sub);
    return this.customersService.findAll(scoped);
  }

  @Post()
  @Roles('admin', 'sales')
  create(
    @Body() createCustomerDto: CreateCustomerDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.create({
      ...createCustomerDto,
      ownerId:
        user.role === 'sales' ? String(user.sub) : createCustomerDto.ownerId,
      collaboratorIds:
        user.role === 'sales' ? [] : createCustomerDto.collaboratorIds,
    });
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.assertSalesOwnership(+id, user);
    const update = { ...updateCustomerDto };
    if (user.role === 'sales') {
      delete update.ownerId;
      delete update.collaboratorIds;
    }
    return this.customersService.update(+id, update);
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.assertSalesOwnership(+id, user);
    return this.customersService.remove(+id);
  }

  @Post('bulk-delete')
  @Roles('admin', 'sales')
  bulkDelete(
    @Body() bulkDeleteDto: BulkDeleteDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.bulkDelete(
      bulkDeleteDto,
      this.salesOwnerId(user),
    );
  }

  @Post('bulk-tags')
  @Roles('admin', 'sales')
  bulkTags(@Body() bulkTagsDto: BulkTagsDto, @CurrentUser() user: RequestUser) {
    return this.customersService.bulkTags(bulkTagsDto, this.salesOwnerId(user));
  }

  @Post('bulk-tier')
  @Roles('admin', 'sales')
  bulkTier(@Body() bulkTierDto: BulkTierDto, @CurrentUser() user: RequestUser) {
    return this.customersService.bulkTier(bulkTierDto, this.salesOwnerId(user));
  }

  // ==================== 360 View ====================

  @Get(':id/360')
  get360(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.getCustomer360(+id, this.salesOwnerId(user));
  }

  // ==================== Tags ====================

  @Get('tags')
  getAllTags() {
    return this.customersService.getAllTags();
  }

  @Post('tags')
  @Roles('admin', 'sales')
  createTag(@Body('name') name: string) {
    return this.customersService.createTag(name);
  }

  @Delete('tags/:name')
  @Roles('admin')
  deleteTag(@Param('name') name: string) {
    return this.customersService.deleteTag(name);
  }

  // ==================== Import ====================

  @Post('import/preview')
  @Roles('admin', 'sales')
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.customersService.parseAndPreview(file);
  }

  @Post('import')
  @Roles('admin', 'sales')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any, @CurrentUser() user: RequestUser) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.customersService.parseAndImport(file, this.salesOwnerId(user));
  }

  @Get('ids')
  findAllIds(
    @Query() query: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.findAllIds({
      ...query,
      ownerId: this.salesOwnerId(user),
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.assertCustomerOwner(
      +id,
      user.role === 'sales' ? String(user.sub) : undefined,
    );
  }

  @Post('delete-all')
  @Roles('admin')
  deleteAll() {
    return this.customersService.deleteAll();
  }

  @Post(':id/clear-email-exception')
  @Roles('admin', 'sales')
  async clearEmailException(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.assertSalesOwnership(+id, user);
    return this.customersService.clearEmailException(+id);
  }

  private salesOwnerId(user: RequestUser) {
    return user.role === 'sales' ? String(user.sub) : undefined;
  }

  private async assertSalesOwnership(id: number, user: RequestUser) {
    await this.customersService.assertCustomerOwner(
      id,
      this.salesOwnerId(user),
    );
  }

  // ==================== Nested Todos (frontend compatibility) ====================

  @Get(':id/todos')
  async findCustomerTodos(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    await this.assertSalesOwnership(+id, user);
    return this.customersService.findTodos({ customerId: +id });
  }

  @Post(':id/todos')
  @Roles('admin', 'sales')
  async createCustomerTodo(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: RequestUser,
  ) {
    await this.assertSalesOwnership(+id, user);
    return this.customersService.createTodo({ ...body, customerId: +id });
  }

  // ==================== Nested Opportunities (frontend compatibility) ====================

  @Post(':id/opportunities')
  @Roles('admin', 'sales')
  async createCustomerOpportunity(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() user: RequestUser,
  ) {
    await this.assertSalesOwnership(+id, user);
    // Map frontend field names to backend DTO
    return this.customersService.createOpportunity(
      {
        customerId: +id,
        name: body.title || body.name,
        amount: body.value ?? body.amount,
        stage: body.stage,
        probability: body.probability,
        ownerId: user.role === 'sales' ? String(user.sub) : body.ownerId,
        collaboratorIds: user.role === 'sales' ? [] : body.collaboratorIds,
        productName: body.productName,
        productSpecification: body.productSpecification,
        expectedQuantity: body.expectedQuantity,
        quantityUnit: body.quantityUnit,
        targetPrice: body.targetPrice,
        currency: body.currency,
        budget: body.budget,
        purchaseTime: body.purchaseTime,
        decisionProcess: body.decisionProcess,
        nextStepAction: body.nextStepAction,
        nextStepDueDate: body.nextStepDueDate,
        expectedCloseDate: body.expectedCloseDate,
        forecastCategory: body.forecastCategory,
        winReason: body.winReason,
        lossReason: body.lossReason,
        competitors: body.competitors,
        description: body.notes || body.description,
      },
      opportunityActor(user),
    );
  }

  // ==================== Contacts ====================

  @Get(':id/contacts')
  findContacts(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.findContacts(+id, this.salesOwnerId(user));
  }

  @Post(':id/contacts')
  @Roles('admin', 'sales')
  createContact(
    @Param('id') id: string,
    @Body() createContactDto: CreateContactDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.createContact(
      +id,
      createContactDto,
      this.salesOwnerId(user),
    );
  }

  @Put('contacts/:contactId')
  @Roles('admin', 'sales')
  updateContact(
    @Param('contactId') id: string,
    @Body() updateContactDto: UpdateContactDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.updateContact(
      +id,
      updateContactDto,
      this.salesOwnerId(user),
    );
  }

  @Delete('contacts/:contactId')
  @Roles('admin', 'sales')
  deleteContact(
    @Param('contactId') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.deleteContact(+id, this.salesOwnerId(user));
  }

  // ==================== Activities ====================

  @Get(':id/activities')
  findActivities(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.findActivities(+id, this.salesOwnerId(user));
  }

  @Post(':id/activities')
  @Roles('admin', 'sales')
  createActivity(
    @Param('id') id: string,
    @Body() createActivityDto: CreateActivityDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.createActivity(
      +id,
      createActivityDto,
      this.salesOwnerId(user),
    );
  }
}

// ==================== Separate Controllers ====================

@Controller('todos')
export class TodosController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.findTodos({
      ...query,
      ownerId: requestOwnerId(user),
    });
  }

  @Post()
  @Roles('admin', 'sales')
  async create(
    @Body() createTodoDto: CreateTodoDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertCustomerOwner(
      createTodoDto.customerId,
      requestOwnerId(user),
    );
    return this.customersService.createTodo(createTodoDto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(
    @Param('id') id: string,
    @Body() updateTodoDto: UpdateTodoDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertTodoOwner(+id, requestOwnerId(user));
    return this.customersService.updateTodo(+id, updateTodoDto);
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertTodoOwner(+id, requestOwnerId(user));
    return this.customersService.deleteTodo(+id);
  }
}

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    const opportunities = await this.customersService.findOpportunities({
      ...query,
      ownerId: requestOwnerId(user),
    });
    return { opportunities };
  }

  @Post()
  @Roles('admin', 'sales')
  async create(
    @Body() createOpportunityDto: CreateOpportunityDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertCustomerOwner(
      createOpportunityDto.customerId,
      requestOwnerId(user),
    );
    const create = {
      ...createOpportunityDto,
      ownerId:
        user.role === 'sales' ? String(user.sub) : createOpportunityDto.ownerId,
      collaboratorIds:
        user.role === 'sales' ? [] : createOpportunityDto.collaboratorIds,
    };
    return this.customersService.createOpportunity(
      create,
      opportunityActor(user),
    );
  }

  @Get(':id/history')
  async history(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertOpportunityOwner(
      +id,
      requestOwnerId(user),
    );
    return this.customersService.findOpportunityStageHistory(+id);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(
    @Param('id') id: string,
    @Body() updateOpportunityDto: UpdateOpportunityDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertOpportunityOwner(
      +id,
      requestOwnerId(user),
    );
    if (updateOpportunityDto.customerId) {
      await this.customersService.assertCustomerOwner(
        updateOpportunityDto.customerId,
        requestOwnerId(user),
      );
    }
    const update = { ...updateOpportunityDto };
    if (user.role === 'sales') {
      delete update.ownerId;
      delete update.collaboratorIds;
    }
    return this.customersService.updateOpportunity(
      +id,
      update,
      opportunityActor(user),
    );
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertOpportunityOwner(
      +id,
      requestOwnerId(user),
    );
    return this.customersService.deleteOpportunity(+id);
  }
}

@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly quoteOutputService: QuoteOutputService,
  ) {}

  @Get()
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    const quotes = await this.customersService.findQuotes({
      ...query,
      ownerId: requestOwnerId(user),
    });
    return { quotes };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    return this.customersService.findQuote(+id);
  }

  @Post()
  @Roles('admin', 'sales')
  async create(
    @Body() createQuoteDto: CreateQuoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertCustomerOwner(
      createQuoteDto.customerId,
      requestOwnerId(user),
    );
    return this.customersService.createQuote(createQuoteDto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(
    @Param('id') id: string,
    @Body() updateQuoteDto: UpdateQuoteDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    if (updateQuoteDto.customerId) {
      await this.customersService.assertCustomerOwner(
        updateQuoteDto.customerId,
        requestOwnerId(user),
      );
    }
    return this.customersService.updateQuote(+id, updateQuoteDto);
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    return this.customersService.deleteQuote(+id);
  }

  @Get(':id/export')
  async export(
    @Param('id') id: string,
    @Query('language') language: string,
    @Res() res: Response,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    const quote = await this.customersService.findQuote(+id);
    const customer = await this.customersService.findOne(quote.customerId);

    const html = await this.quoteOutputService.renderHtml(
      quote,
      customer,
      language,
      'download',
    );
    const fileName = this.quoteOutputService.quoteFileBase(quote, 'html');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(html);
  }

  @Get(':id/preview')
  async preview(
    @Param('id') id: string,
    @Query('language') language: string,
    @Res() res: Response,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    const quote = await this.customersService.findQuote(+id);
    const customer = await this.customersService.findOne(quote.customerId);
    const html = await this.quoteOutputService.renderHtml(
      quote,
      customer,
      language,
      'preview',
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline');
    res.end(html);
  }

  @Get(':id/export/pdf')
  async exportPdf(
    @Param('id') id: string,
    @Query('language') language: string,
    @Res() res: Response,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    const quote = await this.customersService.findQuote(+id);
    const customer = await this.customersService.findOne(quote.customerId);
    const pdf = await this.quoteOutputService.createPdfBuffer(
      quote,
      customer,
      language,
    );
    const fileName = this.quoteOutputService.quoteFileBase(quote, 'pdf');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(pdf);
  }

  @Get(':id/export/excel')
  async exportExcel(
    @Param('id') id: string,
    @Query('language') language: string,
    @Res() res: Response,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    const quote = await this.customersService.findQuote(+id);
    const customer = await this.customersService.findOne(quote.customerId);
    const workbook = await this.quoteOutputService.createExcelBuffer(
      quote,
      customer,
      language,
    );
    const fileName = this.quoteOutputService.quoteFileBase(quote, 'xlsx');
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(workbook);
  }

  @Get(':id/export/package')
  async exportPackage(
    @Param('id') id: string,
    @Query('language') language: string,
    @Res() res: Response,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    const quote = await this.customersService.findQuote(+id);
    const customer = await this.customersService.findOne(quote.customerId);
    const pack = await this.quoteOutputService.createQuotePackage(
      quote,
      customer,
      language,
    );
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${pack.fileName}"`);
    res.end(pack.buffer);
  }
}

@Controller('quote-term-templates')
export class QuoteTermTemplatesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll() {
    const templates = await this.customersService.findQuoteTermTemplates();
    return { templates };
  }

  @Post()
  @Roles('admin')
  create(@Body() createDto: CreateQuoteTermTemplateDto) {
    return this.customersService.createQuoteTermTemplate(createDto);
  }

  @Put(':id')
  @Roles('admin')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateQuoteTermTemplateDto,
  ) {
    return this.customersService.updateQuoteTermTemplate(+id, updateDto);
  }

  @Delete(':id')
  @Roles('admin')
  remove(@Param('id') id: string) {
    return this.customersService.deleteQuoteTermTemplate(+id);
  }
}

@Controller('samples')
export class SamplesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(
    @Query() query: Record<string, any>,
    @CurrentUser() user: RequestUser,
  ) {
    const samples = await this.customersService.findSamples({
      ...query,
      ownerId: requestOwnerId(user),
    });
    return { samples };
  }

  @Post()
  @Roles('admin', 'sales')
  async create(
    @Body() createSampleDto: CreateSampleDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertCustomerOwner(
      createSampleDto.customerId,
      requestOwnerId(user),
    );
    return this.customersService.createSample(createSampleDto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(
    @Param('id') id: string,
    @Body() updateSampleDto: UpdateSampleDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.customersService.assertSampleOwner(+id, requestOwnerId(user));
    if (updateSampleDto.customerId) {
      await this.customersService.assertCustomerOwner(
        updateSampleDto.customerId,
        requestOwnerId(user),
      );
    }
    return this.customersService.updateSample(+id, updateSampleDto);
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertSampleOwner(+id, requestOwnerId(user));
    return this.customersService.deleteSample(+id);
  }
}

@Controller('customer-views')
export class CustomerViewsController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@CurrentUser() user: RequestUser) {
    const views = await this.customersService.findViews(requestOwnerId(user));
    return { views };
  }

  @Post()
  @Roles('admin', 'sales')
  create(
    @Body() createDto: CreateCustomerViewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.createView(
      createDto,
      requestOwnerId(user) || '',
    );
  }

  @Put(':id')
  @Roles('admin', 'sales')
  update(
    @Param('id') id: string,
    @Body() updateDto: UpdateCustomerViewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.updateView(
      +id,
      updateDto,
      requestOwnerId(user),
    );
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.deleteView(+id, requestOwnerId(user));
  }
}

// ==================== Customer Tags (frontend: /api/customer-tags) ====================

@Controller('customer-tags')
@Roles('admin', 'sales')
export class CustomerTagsController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Body('name') name: string) {
    return this.customersService.createTag(name);
  }

  @Delete(':name')
  remove(@Param('name') name: string) {
    return this.customersService.deleteTag(name);
  }
}

// ==================== Import (frontend: /api/import) ====================

@Controller('import')
export class ImportController {
  constructor(private readonly customersService: CustomersService) {}

  @Post('preview')
  @Roles('admin', 'sales')
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.customersService.parseAndPreview(file);
  }

  @Post()
  @HttpCode(200)
  @Roles('admin', 'sales')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any, @CurrentUser() user: RequestUser) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.customersService.parseAndImport(
      file,
      user.role === 'sales' ? String(user.sub) : '',
    );
  }
}

// ==================== Contacts (frontend: /api/contacts/:id) ====================

@Controller('contacts')
export class ContactsController {
  constructor(private readonly customersService: CustomersService) {}

  @Put(':id')
  @Roles('admin', 'sales')
  update(
    @Param('id') id: string,
    @Body() updateContactDto: UpdateContactDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customersService.updateContact(
      +id,
      updateContactDto,
      requestOwnerId(user),
    );
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.deleteContact(+id, requestOwnerId(user));
  }
}

@Controller('trash')
@Roles('admin')
export class CustomerTrashController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll() {
    return this.customersService.findTrash();
  }

  @Post(':id/restore')
  restore(@Param('id') id: string) {
    return this.customersService.restore(+id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.deletePermanent(+id);
  }
}
