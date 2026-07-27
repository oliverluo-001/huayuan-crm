import { IsString, IsNotEmpty, MinLength, IsOptional } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(2, { message: '用户名至少2个字符' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(6, { message: '密码至少6个字符' })
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '请输入原密码' })
  oldPassword: string;

  @IsString()
  @IsNotEmpty({ message: '请输入新密码' })
  @MinLength(6, { message: '新密码至少6个字符' })
  newPassword: string;
}