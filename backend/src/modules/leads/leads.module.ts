import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead, LeadTask } from './entities';
import { LeadsService, LeadsController, LeadTasksController, LeadAssociationsController } from './';
import { LeadSearchService } from './lead-search.service';
import { SettingsModule } from '../settings/settings.module';
import { CustomersModule } from '../customers/customers.module';
import { SuppressionModule } from '../suppression/suppression.module';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadTask]), SettingsModule, CustomersModule, SuppressionModule],
  controllers: [LeadsController, LeadTasksController, LeadAssociationsController],
  providers: [LeadsService, LeadSearchService],
  exports: [LeadsService],
})
export class LeadsModule {}
