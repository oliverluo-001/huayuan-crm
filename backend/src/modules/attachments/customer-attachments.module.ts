import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CustomersModule } from "../customers/customers.module";
import { CustomerAttachment } from "./customer-attachment.entity";
import { CustomerAttachmentsController } from "./customer-attachments.controller";
import { CustomerAttachmentsService } from "./customer-attachments.service";

@Module({
  imports: [TypeOrmModule.forFeature([CustomerAttachment]), CustomersModule],
  controllers: [CustomerAttachmentsController],
  providers: [CustomerAttachmentsService],
  exports: [CustomerAttachmentsService],
})
export class CustomerAttachmentsModule {}
