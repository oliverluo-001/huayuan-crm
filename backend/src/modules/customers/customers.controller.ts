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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CustomersService } from './customers.service';
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

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // ==================== Customer CRUD ====================

  @Get()
  async findAll(@Query() query: Record<string, any>) {
    return this.customersService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findOne(+id);
  }

  @Post()
  create(@Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(createCustomerDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto) {
    return this.customersService.update(+id, updateCustomerDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.remove(+id);
  }

  @Post('bulk-delete')
  bulkDelete(@Body() bulkDeleteDto: BulkDeleteDto) {
    return this.customersService.bulkDelete(bulkDeleteDto);
  }

  @Post('bulk-tags')
  bulkTags(@Body() bulkTagsDto: BulkTagsDto) {
    return this.customersService.bulkTags(bulkTagsDto);
  }

  @Post('bulk-tier')
  bulkTier(@Body() bulkTierDto: BulkTierDto) {
    return this.customersService.bulkTier(bulkTierDto);
  }

  // ==================== 360 View ====================

  @Get(':id/360')
  get360(@Param('id') id: string) {
    return this.customersService.getCustomer360(+id);
  }

  // ==================== Tags ====================

  @Get('tags')
  getAllTags() {
    return this.customersService.getAllTags();
  }

  @Post('tags')
  createTag(@Body('name') name: string) {
    return this.customersService.createTag(name);
  }

  @Delete('tags/:name')
  deleteTag(@Param('name') name: string) {
    return this.customersService.deleteTag(name);
  }

  // ==================== Import ====================

  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.customersService.parseAndPreview(file);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.customersService.parseAndImport(file);
  }

  @Get('ids')
  findAllIds(@Query() query: Record<string, any>) {
    return this.customersService.findAllIds(query);
  }

  @Post('delete-all')
  deleteAll() {
    return this.customersService.deleteAll();
  }

  @Post(':id/clear-email-exception')
  clearEmailException(@Param('id') id: string) {
    return this.customersService.clearEmailException(+id);
  }

  // ==================== Nested Todos (frontend compatibility) ====================

  @Get(':id/todos')
  findCustomerTodos(@Param('id') id: string) {
    return this.customersService.findTodos({ customerId: +id });
  }

  @Post(':id/todos')
  createCustomerTodo(@Param('id') id: string, @Body() body: any) {
    return this.customersService.createTodo({ ...body, customerId: +id });
  }

  // ==================== Nested Opportunities (frontend compatibility) ====================

  @Post(':id/opportunities')
  createCustomerOpportunity(@Param('id') id: string, @Body() body: any) {
    // Map frontend field names to backend DTO
    return this.customersService.createOpportunity({
      customerId: +id,
      name: body.title || body.name,
      amount: body.value ?? body.amount,
      stage: body.stage,
      probability: body.probability,
      expectedCloseDate: body.expectedCloseDate,
      description: body.notes || body.description,
    });
  }

  // ==================== Contacts ====================

  @Get(':id/contacts')
  findContacts(@Param('id') id: string) {
    return this.customersService.findContacts(+id);
  }

  @Post(':id/contacts')
  createContact(@Param('id') id: string, @Body() createContactDto: CreateContactDto) {
    return this.customersService.createContact(+id, createContactDto);
  }

  @Put('contacts/:contactId')
  updateContact(@Param('contactId') id: string, @Body() updateContactDto: UpdateContactDto) {
    return this.customersService.updateContact(+id, updateContactDto);
  }

  @Delete('contacts/:contactId')
  deleteContact(@Param('contactId') id: string) {
    return this.customersService.deleteContact(+id);
  }

  // ==================== Activities ====================

  @Get(':id/activities')
  findActivities(@Param('id') id: string) {
    return this.customersService.findActivities(+id);
  }

  @Post(':id/activities')
  createActivity(@Param('id') id: string, @Body() createActivityDto: CreateActivityDto) {
    return this.customersService.createActivity(+id, createActivityDto);
  }
}

// ==================== Separate Controllers ====================

@Controller('todos')
export class TodosController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Query() query: Record<string, any>) {
    return this.customersService.findTodos(query);
  }

  @Post()
  create(@Body() createTodoDto: CreateTodoDto) {
    return this.customersService.createTodo(createTodoDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateTodoDto: UpdateTodoDto) {
    return this.customersService.updateTodo(+id, updateTodoDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.deleteTodo(+id);
  }
}

@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>) {
    const opportunities = await this.customersService.findOpportunities(query);
    return { opportunities };
  }

  @Post()
  create(@Body() createOpportunityDto: CreateOpportunityDto) {
    return this.customersService.createOpportunity(createOpportunityDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateOpportunityDto: UpdateOpportunityDto) {
    return this.customersService.updateOpportunity(+id, updateOpportunityDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.deleteOpportunity(+id);
  }
}

@Controller('quotes')
export class QuotesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>) {
    const quotes = await this.customersService.findQuotes(query);
    return { quotes };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customersService.findQuote(+id);
  }

  @Post()
  create(@Body() createQuoteDto: CreateQuoteDto) {
    return this.customersService.createQuote(createQuoteDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateQuoteDto: UpdateQuoteDto) {
    return this.customersService.updateQuote(+id, updateQuoteDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.deleteQuote(+id);
  }
}

@Controller('samples')
export class SamplesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>) {
    const samples = await this.customersService.findSamples(query);
    return { samples };
  }

  @Post()
  create(@Body() createSampleDto: CreateSampleDto) {
    return this.customersService.createSample(createSampleDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateSampleDto: UpdateSampleDto) {
    return this.customersService.updateSample(+id, updateSampleDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.deleteSample(+id);
  }
}

@Controller('customer-views')
export class CustomerViewsController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll() {
    const views = await this.customersService.findViews();
    return { views };
  }

  @Post()
  create(@Body() createDto: CreateCustomerViewDto) {
    return this.customersService.createView(createDto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() updateDto: UpdateCustomerViewDto) {
    return this.customersService.updateView(+id, updateDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.deleteView(+id);
  }
}

// ==================== Customer Tags (frontend: /api/customer-tags) ====================

@Controller('customer-tags')
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
  @UseInterceptors(FileInterceptor('file'))
  async previewImport(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.customersService.parseAndPreview(file);
  }

  @Post()
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file'))
  async import(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('请上传文件');
    }
    return this.customersService.parseAndImport(file);
  }
}

// ==================== Contacts (frontend: /api/contacts/:id) ====================

@Controller('contacts')
export class ContactsController {
  constructor(private readonly customersService: CustomersService) {}

  @Put(':id')
  update(@Param('id') id: string, @Body() updateContactDto: UpdateContactDto) {
    return this.customersService.updateContact(+id, updateContactDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customersService.deleteContact(+id);
  }
}