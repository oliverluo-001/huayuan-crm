import { IsString, IsOptional, IsEmail, IsEnum, MinLength, IsNotEmpty } from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(2, { message: '用户名至少2个字符' })
  username: string;

  @IsString()
  @IsOptional()
  displayName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(['admin', 'sales', 'viewer'])
  @IsOptional()
  role?: 'admin' | 'sales' | 'viewer';

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6个字符' })
  password: string;
}

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  displayName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(['admin', 'sales', 'viewer'])
  @IsOptional()
  role?: 'admin' | 'sales' | 'viewer';
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6个字符' })
  newPassword: string;
}
