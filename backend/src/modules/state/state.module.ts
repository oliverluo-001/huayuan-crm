import { Module } from '@nestjs/common';
import { StateController } from './state.controller';
import { CustomersModule } from '../customers/customers.module';
import { EmailModule } from '../email/email.module';
import { ProductsModule } from '../products/products.module';
import { LeadsModule } from '../leads/leads.module';
import { SettingsModule } from '../settings/settings.module';
import { AuthModule } from '../auth/auth.module';
import { BackupModule } from '../backup/backup.module';
import { SuppressionModule } from '../suppression/suppression.module';
import { AuditModule } from '../audit/audit.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer, Todo } from '../customers/entities';
import { EmailLog, EmailTask } from '../email/entities';
import { LeadTask } from '../leads/entities';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, Todo, EmailLog, EmailTask, LeadTask]),
    CustomersModule,
    EmailModule,
    ProductsModule,
    LeadsModule,
    SettingsModule,
    AuthModule,
    BackupModule,
    SuppressionModule,
    AuditModule,
  ],
  controllers: [StateController],
  providers: [DashboardService],
})
export class StateModule {}
