import { IsBoolean, IsString, IsOptional, IsEmail, IsEnum, MinLength, IsNotEmpty, MaxLength, Matches } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/, { message: '账号格式不正确' })
  username: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsEnum(['sales', 'viewer'])
  @IsOptional()
  role?: 'sales' | 'viewer';

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(128)
  password: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @IsEmail()
  @IsOptional()
  @MaxLength(255)
  email?: string;

  @IsEnum(['sales', 'viewer'])
  @IsOptional()
  role?: 'sales' | 'viewer';

  @IsBoolean()
  @IsOptional()
  active?: boolean;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(128)
  newPassword: string;
}
