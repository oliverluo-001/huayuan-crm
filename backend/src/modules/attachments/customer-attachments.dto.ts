import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { CustomerAttachmentCategory } from "./customer-attachment.entity";

export class CreateCustomerAttachmentDto {
  @IsEnum(["inquiry", "drawing", "contract", "other"])
  @IsOptional()
  category?: CustomerAttachmentCategory;

  @IsString()
  @MaxLength(1000)
  @IsOptional()
  note?: string;
}
