import { Controller, Get, Query } from '@nestjs/common';
import { AuditService } from './audit.service';
import { Roles } from '../../common/decorators/roles.decorator';

@Controller('audit-logs')
@Roles('admin')
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  findAll(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('username') username?: string,
    @Query('action') action?: string,
    @Query('status') status?: string,
  ) {
    return this.auditService.findAll({ page: Number(page || 1), limit: Number(limit || 50), username, action, status });
  }
}
