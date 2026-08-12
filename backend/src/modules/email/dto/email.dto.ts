import { IsString, IsOptional, IsIn, IsEmail, IsArray, IsInt, IsNumber, IsBoolean, IsDateString, Max, Min } from 'class-validator';

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

  @IsOptional()
  @IsArray()
  images?: Array<{ id: string; name?: string; dataUrl: string }>;
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

  @IsOptional()
  @IsArray()
  images?: Array<{ id: string; name?: string; dataUrl: string }>;
}

// Frontend-facing EmailTask DTO — accepts batch email task fields
export class CreateEmailTaskDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(['once', 'scheduled'])
  taskMode?: 'once' | 'scheduled';

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsString()
  templateId?: string;

  @IsOptional()
  @IsArray()
  customerIds?: Array<string | number>;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  business?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(43200)
  intervalMinutes?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  totalRuns?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(200)
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

  @IsOptional()
  @IsBoolean()
  autoStart?: boolean;
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
  @IsDateString()
  startAt?: string;

  @IsOptional()
  @IsArray()
  customerIds?: Array<string | number>;

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
