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
} from './entities';
import { EmailLog } from '../email/entities/email-log.entity';
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
      EmailLog,
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
  ],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
