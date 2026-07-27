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