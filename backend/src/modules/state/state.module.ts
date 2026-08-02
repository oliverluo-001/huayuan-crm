import { Module } from '@nestjs/common';
import { StateController } from './state.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, Opportunity, Todo } from '../customers/entities';
import { EmailLog, EmailTask } from '../email/entities';
import { LeadTask } from '../leads/entities';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Opportunity, Todo, EmailLog, EmailTask, LeadTask]),
  ],
  controllers: [StateController],
  providers: [DashboardService],
})
export class StateModule {}
