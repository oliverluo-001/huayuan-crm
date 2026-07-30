import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { User } from '../../modules/auth/entities/user.entity';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('登录已失效，请重新登录');

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
        throw new UnauthorizedException('账号不可用或登录已失效');
      }
      request.user = {
        sub: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
        ver: user.tokenVersion,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('登录已失效，请重新登录');
    }
  }

  private extractToken(request: any): string | undefined {
    const [type, bearerToken] = request.headers.authorization?.split(' ') ?? [];
    if (type === 'Bearer' && bearerToken) return bearerToken;
    const cookies = String(request.headers.cookie || '').split(';');
    for (const cookie of cookies) {
      const [name, ...parts] = cookie.trim().split('=');
      if (name === 'crm_session') return decodeURIComponent(parts.join('='));
    }
    return undefined;
  }
}
