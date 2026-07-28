import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';

import { getTypeOrmConfig } from './config/database.config';
import { AuthModule } from './modules/auth';
import { CustomersModule } from './modules/customers';
import { ProductsModule } from './modules/products';
import { LeadsModule } from './modules/leads';
import { EmailModule } from './modules/email';
import { SettingsModule } from './modules/settings';
import { StateModule } from './modules/state';
import { BackupModule } from './modules/backup';
import { SuppressionModule } from './modules/suppression';
import { AuditModule } from './modules/audit';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),

    // Database
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getTypeOrmConfig,
      inject: [ConfigService],
    }),

    // Feature modules
    AuthModule,
    CustomersModule,
    ProductsModule,
    LeadsModule,
    EmailModule,
    SettingsModule,
    StateModule,
    BackupModule,
    SuppressionModule,
    AuditModule,
  ],
  providers: [
    // Global exception filter
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
    // Global response transform interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
    // Global audit logging interceptor
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
  ],
})
export class AppModule {}