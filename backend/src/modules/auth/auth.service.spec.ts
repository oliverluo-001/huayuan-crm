import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import type { User } from './entities/user.entity';

describe('AuthService online accounts', () => {
  const now = new Date('2026-07-30T00:00:00.000Z');
  let users: User[];
  let repository: any;
  let service: AuthService;

  beforeEach(() => {
    users = [];
    const queryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(null),
    };
    repository = {
      exists: jest.fn().mockResolvedValue(true),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn((data: Partial<User>) => data as User),
      save: jest.fn(async (user: User) => {
        const saved = {
          ...user,
          id: user.id || users.length + 1,
          createdAt: user.createdAt || now,
          updatedAt: now,
        } as User;
        users.push(saved);
        return saved;
      }),
      findOne: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    };
    const jwtService = {
      sign: jest.fn().mockReturnValue('signed-session'),
      verifyAsync: jest.fn(),
    } as unknown as JwtService;
    const configService = {
      get: jest.fn((name: string, fallback?: string) => {
        if (name === 'REGISTRATION_MODE') return 'approval';
        return fallback;
      }),
    } as unknown as ConfigService;
    service = new AuthService(
      repository as Repository<User>,
      jwtService,
      configService,
    );
  });

  it('forces public registration into a pending sales account', async () => {
    const result = await service.register({
      username: 'new.sales',
      displayName: 'New Sales',
      email: 'sales@example.com',
      password: 'StrongPass123!',
    });

    expect(result.requiresApproval).toBe(true);
    expect(users[0].role).toBe('sales');
    expect(users[0].status).toBe('pending');
    expect(users[0].active).toBe(false);
    expect(users[0].registrationSource).toBe('self');
  });

  it('keeps public registration available without redirecting to setup', async () => {
    repository.exists.mockResolvedValue(false);

    const status = await service.getStatus();
    const result = await service.register({
      username: 'new.member',
      displayName: 'New Member',
      email: 'member@example.com',
      password: 'StrongPass123!',
    });

    expect(status.initialized).toBe(false);
    expect(status.registrationEnabled).toBe(true);
    expect(result.requiresApproval).toBe(true);
  });

  it('does not allow a pending account to log in', async () => {
    const pending = {
      id: 8,
      username: 'pending.sales',
      displayName: 'Pending Sales',
      email: 'pending@example.com',
      role: 'sales',
      status: 'pending',
      active: false,
      registrationSource: 'self',
      passwordHash: await bcrypt.hash('StrongPass123!', 4),
      tokenVersion: 0,
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      approvedAt: null,
      approvedBy: null,
      createdAt: now,
      updatedAt: now,
    } as User;
    repository.findOne = jest.fn().mockResolvedValue(pending);

    await expect(
      service.login({ username: pending.username, password: 'StrongPass123!' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
