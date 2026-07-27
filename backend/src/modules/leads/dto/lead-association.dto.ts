import { IsString, IsOptional, IsArray } from 'class-validator';

export class LeadAssociationRequestDto {
  @IsString()
  productName: string;
}

export class LeadAssociationResponseDto {
  productName: string;
  canonicalName: string;
  aliases: string[];
  industries: string[];
  companyTypes: string[];
  source?: string;
  warning?: string;
  recommendedSegments?: string[];
}

export class LeadAssociationResultDto {
  association: LeadAssociationResponseDto;
}
