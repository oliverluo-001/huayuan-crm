import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Customer,
  Contact,
  Activity,
  Todo,
  Opportunity,
  Quote,
  Sample,
  Tag,
  CustomerView,
  CustomerMergeHistory,
} from './entities';
import { EmailLog, EmailTaskRecipient } from '../email/entities';
import { CustomerAttachment } from '../attachments/customer-attachment.entity';
import { Lead } from '../leads/entities';
import {
  CustomersService,
  CustomersController,
  TodosController,
  OpportunitiesController,
  QuotesController,
  SamplesController,
  CustomerViewsController,
  CustomerTagsController,
  ImportController,
  ContactsController,
  CustomerDuplicatesController,
  CustomerDuplicatesService,
} from './';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Customer,
      Contact,
      Activity,
      Todo,
      Opportunity,
      Quote,
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
