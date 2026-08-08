import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  SetupDto,
  UpdateAccountDto,
} from './dto';

@Injectable()
export class AuthService {
  private readonly maxLoginAttempts: number;
  private readonly lockMinutes: number;
  private readonly registrationMode: 'approval' | 'open' | 'disabled';

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {
    this.maxLoginAttempts = this.positiveInt('LOGIN_MAX_ATTEMPTS', 5);
    this.lockMinutes = this.positiveInt('LOGIN_LOCK_MINUTES', 15);
    const mode = this.configService.get<string>('REGISTRATION_MODE', 'approval');
    this.registrationMode = ['approval', 'open', 'disabled'].includes(mode)
      ? (mode as 'approval' | 'open' | 'disabled')
      : 'approval';
  }

  async getStatus(token?: string) {
    const initialized = await this.hasActiveAdmin();
    const user = token ? await this.userFromToken(token) : null;
    return {
      initialized,
      authenticated: Boolean(user),
      username: user?.username || '',
      displayName: user?.displayName || '',
      userId: user ? String(user.id) : '',
      role: user?.role || '',
      registrationMode: this.registrationMode,
      registrationEnabled: this.registrationMode !== 'disabled',
      registrationRequiresApproval: this.registrationMode === 'approval',
    };
  }

  async setup(setupDto: SetupDto) {
    if (await this.userRepository.count()) {
      throw new ConflictException('系统管理员已经创建');
    }
    const user = this.userRepository.create({
      username: setupDto.username.trim(),
      displayName: setupDto.displayName?.trim() || setupDto.username.trim(),
      email: null,
      role: 'admin',
      status: 'active',
      active: true,
      registrationSource: 'setup',
      passwordHash: await bcrypt.hash(setupDto.password, 12),
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      approvedAt: new Date(),
      approvedBy: null,
    });
    await this.userRepository.save(user);
    return this.loginResult(user);
  }

  async register(registerDto: RegisterDto) {
    if (this.registrationMode === 'disabled') {
      throw new ForbiddenException('当前系统未开放在线注册，请联系管理员');
    }
    await this.assertUniqueIdentity(registerDto.username, registerDto.email);
    const active = this.registrationMode === 'open';
    const user = this.userRepository.create({
      username: registerDto.username.trim(),
      displayName: registerDto.displayName.trim(),
      email: registerDto.email.trim().toLowerCase(),
      role: 'sales',
      status: active ? 'active' : 'pending',
      active,
      registrationSource: 'self',
      passwordHash: await bcrypt.hash(registerDto.password, 12),
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      approvedAt: active ? new Date() : null,
      approvedBy: null,
    });
    await this.userRepository.save(user);
    if (active) return { ...this.loginResult(user), requiresApproval: false };
    return {
      ok: true,
      requiresApproval: true,
      message: '注册申请已提交，请等待管理员审核',
      user: this.publicUser(user),
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.userRepository.findOne({
      where: { username: loginDto.username.trim() },
    });
    if (!user) throw new UnauthorizedException('用户名或密码错误');
    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
      throw new HttpException(
        `登录尝试过多，请在 ${minutes} 分钟后重试`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (!(await bcrypt.compare(loginDto.password, user.passwordHash))) {
      user.failedLoginAttempts += 1;
      if (user.failedLoginAttempts >= this.maxLoginAttempts) {
        user.failedLoginAttempts = 0;
        user.lockedUntil = new Date(Date.now() + this.lockMinutes * 60000);
      }
      await this.userRepository.save(user);
      throw new UnauthorizedException('用户名或密码错误');
    }
    if (user.status === 'pending') throw new ForbiddenException('账号正在等待管理员审核');
    if (user.status === 'rejected') throw new ForbiddenException('账号申请未获批准，请联系管理员');
    if (!user.active) throw new ForbiddenException('账号已停用，请联系管理员');

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();
    await this.userRepository.save(user);
    return this.loginResult(user);
  }

  async getAccount(userId: number) {
    const user = await this.requireUser(userId);
    return this.publicUser(user);
  }

  async updateAccount(userId: number, dto: UpdateAccountDto) {
    const user = await this.requireUser(userId);
    const email = dto.email?.trim().toLowerCase() || null;
    if (email && email !== user.email) await this.assertUniqueIdentity(user.username, email, user.id);
    if (dto.displayName !== undefined) user.displayName = dto.displayName.trim() || user.username;
    if (dto.email !== undefined) user.email = email;
    await this.userRepository.save(user);
    return this.publicUser(user);
  }

  async changePassword(userId: number, dto: ChangePasswordDto) {
    const user = await this.requireUser(userId);
    if (!(await bcrypt.compare(dto.oldPassword, user.passwordHash))) {
      throw new BadRequestException('原密码错误');
    }
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.tokenVersion += 1;
    await this.userRepository.save(user);
    return { ...this.loginResult(user), success: true, message: '密码修改成功' };
  }

  async validateUser(userId: number) {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  private loginResult(user: User) {
    return {
      ok: true,
      user: this.publicUser(user),
      username: user.username,
      displayName: user.displayName,
      userId: String(user.id),
      role: user.role,
      token: this.generateToken(user),
    };
  }

  private publicUser(user: User) {
    return {
      id: String(user.id),
      username: user.username,
      displayName: user.displayName,
      email: user.email || '',
      role: user.role,
      status: user.status,
      active: user.active,
      registrationSource: user.registrationSource,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async requireUser(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new BadRequestException('用户不存在');
    return user;
  }

  private async assertUniqueIdentity(username: string, email: string, excludeId?: number) {
    const existing = await this.userRepository
      .createQueryBuilder('user')
      .where('(LOWER(user.username) = LOWER(:username) OR LOWER(user.email) = LOWER(:email))', {
        username: username.trim(),
        email: email.trim(),
      })
      .andWhere(excludeId ? 'user.id != :excludeId' : '1=1', { excludeId })
      .getOne();
    if (!existing) return;
    if (existing.username.toLowerCase() === username.trim().toLowerCase()) {
      throw new ConflictException('用户名已存在');
    }
    throw new ConflictException('邮箱已被其他账号使用');
  }

  private async hasActiveAdmin() {
    return this.userRepository.exists({
      where: { role: 'admin', status: 'active', active: true },
    });
  }

  private async userFromToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
      const user = await this.userRepository.findOne({ where: { id: Number(payload.sub) } });
      if (
        !user ||
        user.status !== 'active' ||
        !user.active ||
        Number(payload.ver || 0) !== Number(user.tokenVersion || 0)
      ) {
        return null;
      }
      return user;
    } catch {
      return null;
    }
  }

  private generateToken(user: User) {
    return this.jwtService.sign({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      ver: user.tokenVersion,
    });
  }

  private positiveInt(name: string, fallback: number) {
    const value = Number(this.configService.get<string>(name));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }
}
