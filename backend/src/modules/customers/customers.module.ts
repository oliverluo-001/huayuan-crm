import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Customer,
  Contact,
  Activity,
  Todo,
  Opportunity,
  OpportunityStageHistory,
  Quote,
  QuoteTermTemplate,
  Sample,
  Tag,
  CustomerView,
  CustomerMergeHistory,
} from './entities';
import { EmailLog, EmailTaskRecipient } from '../email/entities';
import { CustomerAttachment } from '../attachments/customer-attachment.entity';
import { Product } from '../products/entities';
import { Lead } from '../leads/entities';
import { SettingsModule } from '../settings/settings.module';
import { CustomersService } from './customers.service';
import { QuoteOutputService } from './quote-output.service';
import {
  CustomersController,
  TodosController,
  OpportunitiesController,
  QuotesController,
  QuoteTermTemplatesController,
  SamplesController,
  CustomerViewsController,
  CustomerTagsController,
  ImportController,
  ContactsController,
} from './customers.controller';
import { CustomerDuplicatesController } from './customer-duplicates.controller';
import { CustomerDuplicatesService } from './customer-duplicates.service';

@Module({
  imports: [
    SettingsModule,
    TypeOrmModule.forFeature([
      Customer,
      Contact,
      Activity,
      Todo,
      Opportunity,
      OpportunityStageHistory,
      Quote,
      QuoteTermTemplate,
      Sample,
      Tag,
      CustomerView,
      CustomerMergeHistory,
      EmailLog,
      EmailTaskRecipient,
      CustomerAttachment,
      Product,
      Lead,
    ]),
  ],
  controllers: [
    CustomersController,
    TodosController,
    OpportunitiesController,
    QuotesController,
    QuoteTermTemplatesController,
    SamplesController,
    CustomerViewsController,
    CustomerTagsController,
    ImportController,
    ContactsController,
    CustomerDuplicatesController,
  ],
  providers: [CustomersService, CustomerDuplicatesService, QuoteOutputService],
  exports: [CustomersService, CustomerDuplicatesService],
})
export class CustomersModule {}
