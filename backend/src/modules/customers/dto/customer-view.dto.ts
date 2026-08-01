import { IsString, IsOptional, IsArray, IsBoolean, MaxLength } from 'class-validator';

export class CreateCustomerViewDto {
  @IsString()
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsArray()
  columns?: string[];

  @IsOptional()
  filters?: Record<string, string> | any[];

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export class UpdateCustomerViewDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsArray()
  columns?: string[];

  @IsOptional()
  filters?: Record<string, string> | any[];

  @IsOptional()
  @IsString()
  sortBy?: string;

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}
