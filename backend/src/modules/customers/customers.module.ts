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
import { Lead } from '../leads/entities';
import { CustomersService } from './customers.service';
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
  providers: [CustomersService, CustomerDuplicatesService],
  exports: [CustomersService, CustomerDuplicatesService],
})
export class CustomersModule {}
