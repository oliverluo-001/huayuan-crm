import { IsString, IsOptional, IsBoolean, IsNumber } from 'class-validator';

export class CreateSettingDto {
  @IsString()
  keyName: string;

  @IsOptional()
  keyValue?: Record<string, any>;
}

export class UpdateSettingDto {
  @IsOptional()
  keyValue?: Record<string, any>;
}

// Search Profile — matches frontend SearchProfile type
export class SearchProfileDto {
  @IsString()
  id: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  apiUrl?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  // Legacy field names (accepted for backward compat)
  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  extras?: Record<string, any>;
}

// AI Profile — matches frontend AiProfile type
export class AiProfileDto {
  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  baseUrl?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsString()
  apiKey?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  // Legacy field names
  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  extras?: Record<string, any>;
}

// SMTP Profile — matches frontend SmtpProfile type
export class SmtpProfileDto {
  @IsOptional()
  @IsString()
  smtpProvider?: string;

  @IsString()
  smtpHost: string;

  @IsOptional()
  @IsNumber()
  smtpPort?: number;

  @IsOptional()
  @IsBoolean()
  smtpSecure?: boolean;

  @IsString()
  smtpUser: string;

  @IsString()
  smtpFrom: string;

  @IsOptional()
  @IsString()
  pass?: string;

  // Legacy field names
  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsNumber()
  port?: number;

  @IsOptional()
  @IsString()
  user?: string;

  @IsOptional()
  @IsString()
  fromName?: string;

  @IsOptional()
  @IsString()
  fromEmail?: string;
}

// IMAP Profile — matches frontend ImapProfile type
export class ImapProfileDto {
  @IsOptional()
  @IsBoolean()
  imapEnabled?: boolean;

  @IsOptional()
  @IsString()
  imapHost?: string;

  @IsOptional()
  @IsNumber()
  imapPort?: number;

  @IsOptional()
  @IsBoolean()
  imapSecure?: boolean;

  @IsOptional()
  @IsString()
  imapUser?: string;

  @IsOptional()
  @IsString()
  imapMailbox?: string;

  @IsOptional()
  @IsNumber()
  imapScanLimit?: number;

  @IsOptional()
  @IsBoolean()
  imapUseSmtpCredentials?: boolean;

  @IsOptional()
  @IsString()
  pass?: string;

  // Legacy field names
  @IsOptional()
  @IsString()
  host?: string;

  @IsOptional()
  @IsNumber()
  port?: number;

  @IsOptional()
  @IsString()
  user?: string;
}
