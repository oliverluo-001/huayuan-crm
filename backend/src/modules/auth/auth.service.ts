import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { LoginDto, RegisterDto, ChangePasswordDto } from './dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private jwtService: JwtService,
  ) {}

  async getStatus() {
    const count = await this.userRepository.count();
    return {
      initialized: count > 0,
      authenticated: false,
      username: null,
      hasUser: count > 0,
      userCount: count,
    };
  }

  async register(registerDto: RegisterDto) {
    const status = await this.getStatus();
    if (status.hasUser) {
      throw new BadRequestException('系统已初始化，请使用登录功能');
    }

    const existingUser = await this.userRepository.findOne({
      where: { username: registerDto.username },
    });

    if (existingUser) {
      throw new BadRequestException('用户名已存在');
    }

    const passwordHash = await bcrypt.hash(registerDto.password, 10);
    const user = this.userRepository.create({
      username: registerDto.username,
      passwordHash,
    });

    await this.userRepository.save(user);

    const token = this.generateToken(user);
    return {
      user: { id: user.id, username: user.username },
      username: user.username,
      token,
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { username: loginDto.username },
    });

    if (!user) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const token = this.generateToken(user);
    return {
      user: { id: user.id, username: user.username },
      username: user.username,
      token,
    };
  }

  async resetAll() {
    await this.userRepository.query('DELETE FROM `users`');
    return { success: true, message: '所有用户已重置' };
  }

  async changePassword(userId: number, changePasswordDto: ChangePasswordDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const isPasswordValid = await bcrypt.compare(
      changePasswordDto.oldPassword,
      user.passwordHash,
    );

    if (!isPasswordValid) {
      throw new BadRequestException('原密码错误');
    }

    user.passwordHash = await bcrypt.hash(changePasswordDto.newPassword, 10);
    await this.userRepository.save(user);

    return { success: true, message: '密码修改成功' };
  }

  async validateUser(userId: number) {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  private generateToken(user: User) {
    const payload = { sub: user.id, username: user.username };
    return this.jwtService.sign(payload);
  }
}