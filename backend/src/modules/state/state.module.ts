import { Module } from '@nestjs/common';
import { StateController } from './state.controller';
import { CustomersModule } from '../customers/customers.module';
import { EmailModule } from '../email/email.module';
import { ProductsModule } from '../products/products.module';
import { LeadsModule } from '../leads/leads.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    CustomersModule,
    EmailModule,
    ProductsModule,
    LeadsModule,
    SettingsModule,
  ],
  controllers: [StateController],
})
export class StateModule {}
