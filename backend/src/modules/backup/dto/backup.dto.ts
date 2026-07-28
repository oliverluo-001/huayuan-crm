import { IsBoolean, IsNumber, IsOptional, Min } from 'class-validator';

export class SaveBackupSettingsDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsNumber()
  @IsOptional()
  @Min(1)
  intervalHours?: number;

  @IsNumber()
  @IsOptional()
  @Min(1)
  retentionDays?: number;
}
