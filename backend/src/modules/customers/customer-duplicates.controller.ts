import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  DuplicateCustomerPreviewDto,
  MergeDuplicateCustomersDto,
} from './dto';
import {
  CustomerDuplicatesService,
  DuplicateActor,
} from './customer-duplicates.service';

interface RequestUser {
  sub: number;
  username?: string;
  role: 'admin' | 'sales' | 'viewer';
}

@Controller('customer-duplicates')
export class CustomerDuplicatesController {
  constructor(
    private readonly customerDuplicatesService: CustomerDuplicatesService,
  ) {}

  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.customerDuplicatesService.findDuplicateGroups(this.actor(user));
  }

  @Post('preview')
  preview(
    @Body() dto: DuplicateCustomerPreviewDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customerDuplicatesService.previewMerge(dto, this.actor(user));
  }

  @Post('merge')
  @Roles('admin', 'sales')
  merge(
    @Body() dto: MergeDuplicateCustomersDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customerDuplicatesService.merge(dto, this.actor(user));
  }

  @Get(':customerId/history')
  history(
    @Param('customerId') customerId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.customerDuplicatesService.findHistory(
      Number(customerId),
      this.actor(user),
    );
  }

  private actor(user: RequestUser): DuplicateActor {
    return {
      userId: String(user.sub),
      username: user.username || String(user.sub),
      role: user.role,
    };
  }
}
