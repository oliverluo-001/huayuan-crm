import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsDefined, IsEmail, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class OutreachSenderDto {
  @IsString() @MinLength(1) @MaxLength(100) name: string;
  @IsString() @MinLength(1) @MaxLength(150) company: string;
  @IsEmail() @MaxLength(255) email: string;
  @IsString() @MinLength(1) @MaxLength(80) whatsapp: string;
  @IsString() @MinLength(1) @MaxLength(255) website: string;
}

export class CreateOutreachDto {
  @IsString() @Matches(/^owf_[a-f0-9]{24}$/) requestId: string;
  @IsString() @MinLength(1) @MaxLength(200) name: string;
  @IsString() @MinLength(1) @MaxLength(100) targetCountry: string;
  @IsString() @MinLength(1) @MaxLength(1500) productScope: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsString({ each: true }) recipientKeys: string[];
  @IsDefined() @ValidateNested() @Type(() => OutreachSenderDto) sender: OutreachSenderDto;
  @IsOptional() @IsBoolean() researchWebsites?: boolean;
}

export class EditOutreachDraftDto {
  @IsString() @MinLength(1) @MaxLength(500) subject: string;
  @IsString() @MinLength(1) @MaxLength(6000) body: string;
  @IsBoolean() selected: boolean;
  @IsInt() @Min(0) revision: number;
}

export class SelectOutreachDraftsDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) recipientKeys: string[];
  @IsInt() @Min(0) revision: number;
}

export class ScheduleOutreachDto {
  @IsDateString() startAt: string;
  @IsInt() @Min(1) @Max(200) batchSize: number;
  @IsInt() @Min(1) @Max(43200) intervalMinutes: number;
  @IsInt() @Min(1) @Max(1000) totalRuns: number;
  @IsInt() @Min(0) revision: number;
}
