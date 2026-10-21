import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailTemplate, EmailTask, EmailLog, EmailTaskRecipient } from './entities';
import { EmailService, TemplatesController, EmailTasksController, EmailLogsController, SendLogsController, EmailBouncesController } from './';
import { EmailRecipientsController, UnsubscribeController } from './email-controllers';
import { CustomersModule } from '../customers/customers.module';
import { SuppressionModule } from '../suppression/suppression.module';
import { SettingsModule } from '../settings/settings.module';
import { OutreachController } from './outreach.controller';
import { OutreachService } from './outreach.service';
import { OutreachReservation } from './entities/outreach-reservation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailTemplate, EmailTask, EmailLog, EmailTaskRecipient, OutreachReservation]),
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
    OutreachController,
  ],
  providers: [EmailService, OutreachService],
  exports: [EmailService],
})
export class EmailModule {}
