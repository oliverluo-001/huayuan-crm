import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lead, LeadTask } from './entities';
import { LeadsService, LeadsController, LeadTasksController, LeadAssociationsController } from './';

@Module({
  imports: [TypeOrmModule.forFeature([Lead, LeadTask])],
  controllers: [LeadsController, LeadTasksController, LeadAssociationsController],
  providers: [LeadsService],
  exports: [LeadsService],
})
export class LeadsModule {}