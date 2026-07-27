import { IsString, IsOptional, IsEnum, IsEmail, IsArray, IsNumber, IsBoolean, IsDateString } from 'class-validator';

export class CreateTemplateDto {
  @IsString()
  name: string;

  @IsString()
  subject: string;

  @IsString()
  body: string;

  @IsOptional()
  @IsArray()
  variables?: string[];
}

export class UpdateTemplateDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsArray()
  variables?: string[];
}

// Frontend-facing EmailTask DTO — accepts batch email task fields
export class CreateEmailTaskDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  taskMode?: string;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  customerIds?: string[];

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  business?: string;

  @IsOptional()
  @IsNumber()
  intervalMinutes?: number;

  @IsOptional()
  @IsNumber()
  totalRuns?: number;

  @IsOptional()
  @IsNumber()
  batchSize?: number;

  @IsOptional()
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsString()
  body?: string;

  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @IsOptional()
  @IsString()
  recipientName?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  smtpProvider?: string;

  @IsOptional()
  @IsString()
  smtpHost?: string;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsString()
  smtpUser?: string;

  @IsOptional()
  @IsString()
  smtpPass?: string;

  @IsOptional()
  @IsString()
  smtpFrom?: string;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;
}

export class UpdateEmailTaskDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  taskMode?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsNumber()
  runsCompleted?: number;

  @IsOptional()
  @IsNumber()
  successfulSendCount?: number;

  @IsOptional()
  @IsDateString()
  lastRunAt?: string;

  @IsOptional()
  @IsDateString()
  nextRunAt?: string;
}
