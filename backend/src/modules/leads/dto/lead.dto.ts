import { IsString, IsOptional, IsEnum, IsInt, IsArray, Min, MaxLength } from 'class-validator';
import { LeadStatus, LeadTier } from '../entities';

export class CreateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(32)
  taskId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  business?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceName?: string;

  @IsOptional()
  @IsEnum(['new', 'contacted', 'qualified', 'converted', 'rejected'])
  leadStatus?: LeadStatus;

  @IsOptional()
  @IsEnum(['A', 'B', 'C', 'D', 'review'])
  leadTier?: LeadTier;

  @IsOptional()
  @IsInt()
  leadScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  stage?: string;

  @IsOptional()
  @IsString()
  reviewReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  rawData?: Record<string, any>;
}

export class UpdateLeadDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  country?: string;

  @IsOptional()
  @IsString()
  business?: string;

  @IsOptional()
  @IsEnum(['new', 'contacted', 'qualified', 'converted', 'rejected'])
  leadStatus?: LeadStatus;

  @IsOptional()
  @IsEnum(['A', 'B', 'C', 'D', 'review'])
  leadTier?: LeadTier;

  @IsOptional()
  @IsInt()
  leadScore?: number;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  stage?: string;

  @IsOptional()
  @IsString()
  reviewReason?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ConvertLeadsDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];

  @IsOptional()
  createOpportunity?: boolean;
}

export class BulkDeleteLeadsDto {
  @IsArray()
  @IsString({ each: true })
  ids: string[];
}