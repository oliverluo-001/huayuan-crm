import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { DashboardService, DashboardUser } from './dashboard.service';

@Controller('state')
export class StateController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard')
  getDashboard(@CurrentUser() user: DashboardUser) {
    return this.dashboardService.getDashboard(user);
  }
}
