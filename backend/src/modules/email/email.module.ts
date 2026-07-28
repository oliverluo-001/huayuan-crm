import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate, EmailTask, EmailLog } from './entities';
import { EmailService, TemplatesController, EmailTasksController, EmailLogsController, SendLogsController, EmailBouncesController } from './';
import { EmailRecipientsController, UnsubscribeController } from './email-controllers';
import { CustomersModule } from '../customers/customers.module';
import { SuppressionModule } from '../suppression/suppression.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailTemplate, EmailTask, EmailLog]),
    CustomersModule,
    SuppressionModule,
    SettingsModule,
  ],
  controllers: [
    TemplatesController,
    EmailTasksController,
    EmailLogsController,
    SendLogsController,
    EmailBouncesController,
    EmailRecipientsController,
    UnsubscribeController,
  ],
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
