import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto, UpdateUserDto, ResetPasswordDto } from './dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findAll() {
    const users = await this.userRepository.find({
      order: { createdAt: 'ASC' },
    });
    return users.map((u) => ({
      id: String(u.id),
      username: u.username,
      displayName: u.displayName,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }));
  }

  async findOne(id: number) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    return {
      id: String(user.id),
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async create(createUserDto: CreateUserDto) {
    const existing = await this.userRepository.findOne({
      where: { username: createUserDto.username },
    });
    if (existing) throw new BadRequestException('用户名已存在');

    const passwordHash = await bcrypt.hash(createUserDto.password, 10);
    const user = this.userRepository.create({
      username: createUserDto.username,
      displayName: createUserDto.displayName || '',
      email: createUserDto.email || '',
      role: (createUserDto.role as any) || 'sales',
      passwordHash,
    });
    await this.userRepository.save(user);
    return {
      id: String(user.id),
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async update(id: number, updateUserDto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    Object.assign(user, updateUserDto);
    await this.userRepository.save(user);
    return {
      id: String(user.id),
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }

  async resetPassword(id: number, resetPasswordDto: ResetPasswordDto) {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('用户不存在');
    user.passwordHash = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    await this.userRepository.save(user);
    return { success: true, message: '密码重置成功' };
  }
}
