import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto, ResetPasswordDto, UpdateUserDto } from './dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll() {
    const users = await this.userRepository.find({ order: { createdAt: 'ASC' } });
    return users
      .map((user) => this.publicUser(user))
      .sort((a, b) => this.statusOrder(a.status) - this.statusOrder(b.status));
  }

  async findOne(id: number) {
    return this.publicUser(await this.requireUser(id));
  }

  async create(dto: CreateUserDto) {
    await this.assertUniqueIdentity(dto.username, dto.email || '');
    const user = this.userRepository.create({
      username: dto.username.trim(),
      displayName: dto.displayName?.trim() || dto.username.trim(),
      email: dto.email?.trim().toLowerCase() || null,
      role: dto.role || 'sales',
      status: 'active',
      active: true,
      registrationSource: 'admin',
      passwordHash: await bcrypt.hash(dto.password, 12),
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      approvedAt: new Date(),
      approvedBy: null,
    });
    return this.publicUser(await this.userRepository.save(user));
  }

  async update(id: number, dto: UpdateUserDto) {
    const user = await this.requireUser(id);
    const nextRole = dto.role || user.role;
    const nextActive = dto.active ?? user.active;
    await this.assertLastAdmin(user, nextRole, nextActive);
    if (dto.email !== undefined) {
      const email = dto.email.trim().toLowerCase();
      if (email && email !== user.email) await this.assertUniqueIdentity(user.username, email, id);
      user.email = email || null;
    }
    if (dto.displayName !== undefined) user.displayName = dto.displayName.trim() || user.username;
    user.role = nextRole;
    if (user.active !== nextActive) {
      user.active = nextActive;
      user.tokenVersion += 1;
    }
    return this.publicUser(await this.userRepository.save(user));
  }

  async approve(id: number, approverId: number) {
    const user = await this.requireUser(id);
    user.status = 'active';
    user.active = true;
    user.approvedAt = new Date();
    user.approvedBy = approverId;
    return this.publicUser(await this.userRepository.save(user));
  }

  async reject(id: number, approverId: number) {
    const user = await this.requireUser(id);
    await this.assertLastAdmin(user, user.role, false);
    user.status = 'rejected';
    user.active = false;
    user.approvedAt = new Date();
    user.approvedBy = approverId;
    user.tokenVersion += 1;
    return this.publicUser(await this.userRepository.save(user));
  }

  async resetPassword(id: number, dto: ResetPasswordDto) {
    const user = await this.requireUser(id);
    user.passwordHash = await bcrypt.hash(dto.newPassword, 12);
    user.tokenVersion += 1;
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    await this.userRepository.save(user);
    return { success: true, message: '密码重置成功' };
  }

  private async requireUser(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return user;
  }

  private async assertLastAdmin(user: User, nextRole: User['role'], nextActive: boolean) {
    if (user.role !== 'admin' || !user.active || user.status !== 'active') return;
    if (nextRole === 'admin' && nextActive) return;
    const count = await this.userRepository.count({
      where: { role: 'admin', status: 'active', active: true },
    });
    if (count <= 1) throw new BadRequestException('至少需要保留一个有效管理员');
  }

  private async assertUniqueIdentity(username: string, email: string, excludeId?: number) {
    const query = this.userRepository.createQueryBuilder('user');
    query.where(
      email.trim()
        ? '(LOWER(user.username) = LOWER(:username) OR LOWER(user.email) = LOWER(:email))'
        : 'LOWER(user.username) = LOWER(:username)',
      { username: username.trim(), email: email.trim() },
    );
    if (excludeId) query.andWhere('user.id != :excludeId', { excludeId });
    const existing = await query.getOne();
    if (!existing) return;
    if (existing.username.toLowerCase() === username.trim().toLowerCase()) {
      throw new ConflictException('用户名已存在');
    }
    throw new ConflictException('邮箱已被其他账号使用');
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
      approvedAt: user.approvedAt,
      approvedBy: user.approvedBy ? String(user.approvedBy) : '',
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private statusOrder(status: User['status']) {
    return ({ pending: 0, active: 1, rejected: 2 })[status] ?? 3;
  }
}
