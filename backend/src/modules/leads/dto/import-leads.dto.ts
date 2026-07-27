import { IsArray, IsOptional, IsString, IsBoolean, IsNumber } from 'class-validator';

export class ImportLeadsDto {
  @IsArray()
  leads: Record<string, any>[];
}

export class CleanLeadsResponseDto {
  summary: {
    total: number;
    readyToEmail: number;
    needsReview: number;
    remove: number;
    hardBounce: number;
    duplicatesRemoved: number;
    byLargeRegion: Record<string, number>;
    byTargetSegment: Record<string, number>;
  };
}

export class ImportCustomersDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsBoolean()
  importAll?: boolean;
}

export class ExportLeadsQueryDto {
  @IsOptional()
  @IsString()
  type?: string;
}

export class GenerateQueriesDto {
  @IsOptional()
  @IsBoolean()
  regenerate?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  queries?: string[];
}

export class GenerateQueriesResponseDto {
  task: any;
  queries: string[];
}
