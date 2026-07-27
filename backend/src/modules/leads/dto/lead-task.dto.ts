import { IsString, IsOptional, IsEnum, IsInt, IsArray, MaxLength, IsBoolean, IsNumber } from 'class-validator';
import { LeadTaskStatus } from '../entities';

export class CreateLeadTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  productName?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetRegion?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRegions?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetSegments?: string[];

  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsInt()
  targetCount?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  buyerIndustries?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  buyerCompanyTypes?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productAliases?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetCountries?: string[];

  @IsOptional()
  @IsString()
  associationSource?: string;

  @IsOptional()
  @IsString()
  searchLanguage?: string;

  @IsOptional()
  @IsEnum(['draft', 'ready', 'running', 'paused', 'completed', 'exhausted', 'cancelled'])
  status?: LeadTaskStatus;

  @IsOptional()
  searchQueries?: string[];
}

export class UpdateLeadTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  industry?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetRegion?: string;

  @IsOptional()
  @IsString()
  keywords?: string;

  @IsOptional()
  @IsEnum(['draft', 'ready', 'running', 'paused', 'completed', 'exhausted', 'cancelled'])
  status?: LeadTaskStatus;

  @IsOptional()
  searchQueries?: string[];

  @IsOptional()
  @IsInt()
  automationCursor?: number;

  @IsOptional()
  automationProgress?: Record<string, any>;

  @IsOptional()
  agentState?: Record<string, any>;

  @IsOptional()
  @IsBoolean()
  cancelRequested?: boolean;

  @IsOptional()
  @IsString()
  lastMessage?: string;

  @IsOptional()
  @IsInt()
  rawLeadCount?: number;

  @IsOptional()
  @IsInt()
  cleanedLeadCount?: number;

  @IsOptional()
  @IsInt()
  duplicateCount?: number;

  @IsOptional()
  @IsInt()
  importedCustomerCount?: number;

  @IsOptional()
  @IsString()
  automationStage?: string;
}
