import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateOutreachDto, EditOutreachDraftDto, ScheduleOutreachDto, SelectOutreachDraftsDto } from './dto/outreach.dto';
import { OutreachService } from './outreach.service';

interface RequestUser { sub: number; role: string }
const scope = (user: RequestUser) => user.role === 'sales' ? String(user.sub) : undefined;

@Controller('outreach-workflows')
@Roles('admin', 'sales')
export class OutreachController {
  constructor(private readonly outreach: OutreachService) {}
  @Get() list(@CurrentUser() user: RequestUser) { return this.outreach.list(scope(user)); }
  @Get(':id') detail(@Param('id') id: string, @CurrentUser() user: RequestUser) { return this.outreach.detail(id, scope(user)); }
  @Post() create(@Body() dto: CreateOutreachDto, @CurrentUser() user: RequestUser) { return this.outreach.create(dto, scope(user) || ''); }
  @Put(':id/drafts/:key') edit(@Param('id') id: string, @Param('key') key: string, @Body() dto: EditOutreachDraftDto, @CurrentUser() user: RequestUser) { return this.outreach.edit(id, key, dto, scope(user)); }
  @Put(':id/selection') select(@Param('id') id: string, @Body() dto: SelectOutreachDraftsDto, @CurrentUser() user: RequestUser) { return this.outreach.select(id, dto, scope(user)); }
  @Post(':id/schedule') schedule(@Param('id') id: string, @Body() dto: ScheduleOutreachDto, @CurrentUser() user: RequestUser) { return this.outreach.schedule(id, dto, scope(user)); }
}
