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
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';

interface RequestUser {
  sub: number;
  role: 'admin' | 'sales' | 'viewer';
}
const requestOwnerId = (user: RequestUser) => user.role === 'sales' ? String(user.sub) : undefined;

@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  // ==================== Customer CRUD ====================

  @Get()
  async findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    const scoped = { ...query };
    if (user.role === 'sales' || query.ownerId === 'me') scoped.ownerId = String(user.sub);
    return this.customersService.findAll(scoped);
  }

  @Post()
  @Roles('admin', 'sales')
  create(@Body() createCustomerDto: CreateCustomerDto, @CurrentUser() user: RequestUser) {
    return this.customersService.create({
      ...createCustomerDto,
      ownerId: user.role === 'sales' ? String(user.sub) : createCustomerDto.ownerId,
    });
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(@Param('id') id: string, @Body() updateCustomerDto: UpdateCustomerDto, @CurrentUser() user: RequestUser) {
    await this.assertSalesOwnership(+id, user);
    const update = { ...updateCustomerDto };
    if (user.role === 'sales') delete update.ownerId;
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
  bulkDelete(@Body() bulkDeleteDto: BulkDeleteDto, @CurrentUser() user: RequestUser) {
    return this.customersService.bulkDelete(bulkDeleteDto, this.salesOwnerId(user));
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
  findAllIds(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    return this.customersService.findAllIds({ ...query, ownerId: this.salesOwnerId(user) });
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
  async clearEmailException(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.assertSalesOwnership(+id, user);
    return this.customersService.clearEmailException(+id);
  }

  private salesOwnerId(user: RequestUser) {
    return user.role === 'sales' ? String(user.sub) : undefined;
  }

  private async assertSalesOwnership(id: number, user: RequestUser) {
    await this.customersService.assertCustomerOwner(id, this.salesOwnerId(user));
  }

  // ==================== Nested Todos (frontend compatibility) ====================

  @Get(':id/todos')
  async findCustomerTodos(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.assertSalesOwnership(+id, user);
    return this.customersService.findTodos({ customerId: +id });
  }

  @Post(':id/todos')
  @Roles('admin', 'sales')
  async createCustomerTodo(@Param('id') id: string, @Body() body: any, @CurrentUser() user: RequestUser) {
    await this.assertSalesOwnership(+id, user);
    return this.customersService.createTodo({ ...body, customerId: +id });
  }

  // ==================== Nested Opportunities (frontend compatibility) ====================

  @Post(':id/opportunities')
  @Roles('admin', 'sales')
  async createCustomerOpportunity(@Param('id') id: string, @Body() body: any, @CurrentUser() user: RequestUser) {
    await this.assertSalesOwnership(+id, user);
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
  findContacts(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.findContacts(+id, this.salesOwnerId(user));
  }

  @Post(':id/contacts')
  @Roles('admin', 'sales')
  createContact(@Param('id') id: string, @Body() createContactDto: CreateContactDto, @CurrentUser() user: RequestUser) {
    return this.customersService.createContact(+id, createContactDto, this.salesOwnerId(user));
  }

  @Put('contacts/:contactId')
  @Roles('admin', 'sales')
  updateContact(@Param('contactId') id: string, @Body() updateContactDto: UpdateContactDto, @CurrentUser() user: RequestUser) {
    return this.customersService.updateContact(+id, updateContactDto, this.salesOwnerId(user));
  }

  @Delete('contacts/:contactId')
  @Roles('admin', 'sales')
  deleteContact(@Param('contactId') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.deleteContact(+id, this.salesOwnerId(user));
  }

  // ==================== Activities ====================

  @Get(':id/activities')
  findActivities(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.customersService.findActivities(+id, this.salesOwnerId(user));
  }

  @Post(':id/activities')
  @Roles('admin', 'sales')
  createActivity(@Param('id') id: string, @Body() createActivityDto: CreateActivityDto, @CurrentUser() user: RequestUser) {
    return this.customersService.createActivity(+id, createActivityDto, this.salesOwnerId(user));
  }
}

// ==================== Separate Controllers ====================

@Controller('todos')
export class TodosController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    return this.customersService.findTodos({ ...query, ownerId: requestOwnerId(user) });
  }

  @Post()
  @Roles('admin', 'sales')
  async create(@Body() createTodoDto: CreateTodoDto, @CurrentUser() user: RequestUser) {
    await this.customersService.assertCustomerOwner(createTodoDto.customerId, requestOwnerId(user));
    return this.customersService.createTodo(createTodoDto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(@Param('id') id: string, @Body() updateTodoDto: UpdateTodoDto, @CurrentUser() user: RequestUser) {
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
  async findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    const opportunities = await this.customersService.findOpportunities({ ...query, ownerId: requestOwnerId(user) });
    return { opportunities };
  }

  @Post()
  @Roles('admin', 'sales')
  async create(@Body() createOpportunityDto: CreateOpportunityDto, @CurrentUser() user: RequestUser) {
    await this.customersService.assertCustomerOwner(createOpportunityDto.customerId, requestOwnerId(user));
    return this.customersService.createOpportunity(createOpportunityDto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(@Param('id') id: string, @Body() updateOpportunityDto: UpdateOpportunityDto, @CurrentUser() user: RequestUser) {
    await this.customersService.assertOpportunityOwner(+id, requestOwnerId(user));
    return this.customersService.updateOpportunity(+id, updateOpportunityDto);
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertOpportunityOwner(+id, requestOwnerId(user));
    return this.customersService.deleteOpportunity(+id);
  }
}

@Controller('quotes')
export class QuotesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    const quotes = await this.customersService.findQuotes({ ...query, ownerId: requestOwnerId(user) });
    return { quotes };
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    return this.customersService.findQuote(+id);
  }

  @Post()
  @Roles('admin', 'sales')
  async create(@Body() createQuoteDto: CreateQuoteDto, @CurrentUser() user: RequestUser) {
    await this.customersService.assertCustomerOwner(createQuoteDto.customerId, requestOwnerId(user));
    return this.customersService.createQuote(createQuoteDto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(@Param('id') id: string, @Body() updateQuoteDto: UpdateQuoteDto, @CurrentUser() user: RequestUser) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    return this.customersService.updateQuote(+id, updateQuoteDto);
  }

  @Delete(':id')
  @Roles('admin', 'sales')
  async remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    return this.customersService.deleteQuote(+id);
  }

  @Get(':id/export')
  async export(@Param('id') id: string, @Res() res: Response, @CurrentUser() user: RequestUser) {
    await this.customersService.assertQuoteOwner(+id, requestOwnerId(user));
    const quote = await this.customersService.findQuote(+id);
    const customer = await this.customersService.findOne(quote.customerId);

    const html = renderQuoteExport(quote, customer);
    const fileName = `quotation-${String(quote.quoteNo || id).replace(/[^a-zA-Z0-9_-]/g, '_')}.html`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.end(html);
  }
}

@Controller('samples')
export class SamplesController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  async findAll(@Query() query: Record<string, any>, @CurrentUser() user: RequestUser) {
    const samples = await this.customersService.findSamples({ ...query, ownerId: requestOwnerId(user) });
    return { samples };
  }

  @Post()
  @Roles('admin', 'sales')
  async create(@Body() createSampleDto: CreateSampleDto, @CurrentUser() user: RequestUser) {
    await this.customersService.assertCustomerOwner(createSampleDto.customerId, requestOwnerId(user));
    return this.customersService.createSample(createSampleDto);
  }

  @Put(':id')
  @Roles('admin', 'sales')
  async update(@Param('id') id: string, @Body() updateSampleDto: UpdateSampleDto, @CurrentUser() user: RequestUser) {
    await this.customersService.assertSampleOwner(+id, requestOwnerId(user));
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
  create(@Body() createDto: CreateCustomerViewDto, @CurrentUser() user: RequestUser) {
    return this.customersService.createView(createDto, requestOwnerId(user) || '');
  }

  @Put(':id')
  @Roles('admin', 'sales')
  update(@Param('id') id: string, @Body() updateDto: UpdateCustomerViewDto, @CurrentUser() user: RequestUser) {
    return this.customersService.updateView(+id, updateDto, requestOwnerId(user));
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
  update(@Param('id') id: string, @Body() updateContactDto: UpdateContactDto, @CurrentUser() user: RequestUser) {
    return this.customersService.updateContact(+id, updateContactDto, requestOwnerId(user));
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

// ==================== Helpers ====================

function escapeHtml(value: any): string {
  return String(value ?? '').replace(/[&<>'"]/g, (ch: string) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch] || ch,
  );
}

function amount(value: any, currency: string): string {
  const n = Number(value || 0);
  return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(value: any): string {
  return value ? String(value).slice(0, 10) : '-';
}

function renderQuoteExport(quote: any, customer: any): string {
  const currency = escapeHtml(quote.currency || 'USD');
  const amt = (v: any) => amount(v, currency);
  const date = fmtDate;

  const rows = (quote.items || [])
    .map(
      (item: any, index: number) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(item.productName)}</strong>${item.description ? `<br><span class="muted">${escapeHtml(item.description)}</span>` : ''}</td>
      <td>${escapeHtml(item.unit || 'pcs')}</td>
      <td class="number">${Number(item.quantity || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
      <td class="number">${amt(item.unitPrice)}</td>
      <td class="number">${amt(item.subtotal || item.unitPrice * item.quantity)}</td>
    </tr>`,
    )
    .join('');

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>报价单 ${escapeHtml(quote.quoteNo)}</title>
<style>
  * { box-sizing: border-box; } body { margin: 0; color: #172033; font: 14px/1.5 Arial, "Microsoft YaHei", sans-serif; background: #f3f5f8; }
  main { width: 900px; min-height: 1080px; margin: 24px auto; padding: 54px; background: #fff; } header { display: flex; justify-content: space-between; gap: 28px; padding-bottom: 22px; border-bottom: 3px solid #0b5bd3; }
  h1 { margin: 0; font-size: 30px; letter-spacing: 1px; color: #0d3478; } h2 { margin: 4px 0 0; font-size: 14px; color: #657085; font-weight: 500; } .quote-no { text-align: right; } .quote-no strong { font-size: 20px; color: #0b5bd3; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 40px; margin: 30px 0; } .meta strong { display: block; color: #68748b; font-size: 12px; } .meta span { display: block; min-height: 22px; font-size: 15px; }
  table { width: 100%; border-collapse: collapse; margin-top: 24px; } th { background: #eff5ff; text-align: left; color: #173967; } th, td { border: 1px solid #dce3ee; padding: 11px 10px; vertical-align: top; } .number { text-align: right; white-space: nowrap; } .muted { color: #68748b; font-size: 12px; }
  .totals { width: 350px; margin: 22px 0 0 auto; } .totals div { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #e5e9f0; } .totals .grand { padding-top: 12px; border-bottom: 0; font-size: 18px; font-weight: 700; color: #0b5bd3; }
  .notes { margin-top: 38px; padding-top: 14px; border-top: 1px solid #dce3ee; white-space: pre-wrap; } footer { margin-top: 60px; color: #7b8495; font-size: 12px; }
  @media print { body { background: #fff; } main { width: auto; min-height: auto; margin: 0; padding: 18mm; } }
</style></head><body><main>
<header><div><h1>报价单 / QUOTATION</h1><h2>外贸 CRM 本地报价文件</h2></div><div class="quote-no"><span>报价编号</span><strong>${escapeHtml(quote.quoteNo)}</strong></div></header>
<section class="meta"><div><strong>客户 / Customer</strong><span>${escapeHtml(customer?.company || '-')}</span></div><div><strong>客户地区 / Region</strong><span>${escapeHtml(customer?.region || '-')}</span></div><div><strong>联系人 / Contact</strong><span>${escapeHtml(customer?.contact || '-')}</span></div><div><strong>联系邮箱 / Email</strong><span>${escapeHtml(customer?.email || '-')}</span></div><div><strong>报价日期 / Date</strong><span>${date(quote.createdAt)}</span></div><div><strong>有效期至 / Valid Until</strong><span>${date(quote.validUntil)}</span></div></section>
<table><thead><tr><th>#</th><th>产品 / Description</th><th>单位</th><th class="number">数量</th><th class="number">单价</th><th class="number">金额</th></tr></thead><tbody>${rows}</tbody></table>
<section class="totals"><div><span>商品小计</span><strong>${amt(quote.subtotal)}</strong></div><div><span>增值税 (${Number(quote.taxRate || 0).toLocaleString('en-US')}%)</span><strong>${amt(quote.taxAmount)}</strong></div><div class="grand"><span>报价总额</span><strong>${amt(quote.total)}</strong></div></section>
<section class="notes"><strong>备注 / Notes</strong><br>${escapeHtml(quote.notes || '-')}</section><footer>本报价单由外贸 CRM 自动生成。打开文件后可使用浏览器"打印"保存为 PDF。</footer>
</main></body></html>`;
}
