import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';

export class AddSuppressionDto {
  @IsEmail()
  @IsNotEmpty({ message: '邮箱地址不能为空' })
  email: string;

  @IsString()
  @IsOptional()
  reason?: string;
}
