import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;
}

export class SetupDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/, {
    message: '账号需为 3-32 位字母、数字、点、横线或下划线',
  })
  username: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @IsString()
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(128)
  password: string;
}

export class RegisterDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]{3,32}$/, {
    message: '账号需为 3-32 位字母、数字、点、横线或下划线',
  })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @MaxLength(100)
  displayName: string;

  @IsEmail({}, { message: '请输入有效的工作邮箱' })
  @MaxLength(255)
  email: string;

  @IsString()
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(128)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '请输入原密码' })
  oldPassword: string;

  @IsString()
  @MinLength(8, { message: '新密码至少8个字符' })
  @MaxLength(128)
  newPassword: string;
}

export class UpdateAccountDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  displayName?: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
  @IsOptional()
  @MaxLength(255)
  email?: string;
}
