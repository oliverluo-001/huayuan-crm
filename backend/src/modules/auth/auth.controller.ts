import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import {
  ChangePasswordDto,
  LoginDto,
  RegisterDto,
  SetupDto,
  UpdateAccountDto,
} from './dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('status')
  getStatus(@Req() req: Request) {
    return this.authService.getStatus(this.sessionToken(req));
  }

  @Public()
  @Post('setup')
  async setup(
    @Body() dto: SetupDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.setup(dto);
    this.setSessionCookie(res, result.token);
    return this.withoutToken(result);
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto);
    this.setSessionCookie(res, result.token);
    return this.withoutToken(result);
  }

  @Public()
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) _res: Response,
  ) {
    const result = await this.authService.register(dto);
    return this.withoutToken(result);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('crm_session', this.cookieOptions());
    return { success: true, message: '已退出登录' };
  }

  @Get('account')
  getAccount(@Req() req: any) {
    return this.authService.getAccount(Number(req.user.sub));
  }

  @Put('account')
  updateAccount(@Req() req: any, @Body() dto: UpdateAccountDto) {
    return this.authService.updateAccount(Number(req.user.sub), dto);
  }

  @Post('change-password')
  async changePassword(
    @Req() req: any,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.changePassword(Number(req.user.sub), dto);
    this.setSessionCookie(res, result.token);
    return this.withoutToken(result);
  }

  private sessionToken(req: Request) {
    const cookies = String(req.headers.cookie || '').split(';');
    for (const cookie of cookies) {
      const [name, ...parts] = cookie.trim().split('=');
      if (name === 'crm_session') return decodeURIComponent(parts.join('='));
    }
    return undefined;
  }

  private setSessionCookie(res: Response, token: string) {
    res.cookie('crm_session', token, {
      ...this.cookieOptions(),
      maxAge: this.sessionMaxAge(),
    });
  }

  private cookieOptions() {
    return {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: process.env.NODE_ENV === 'production' || process.env.COOKIE_SECURE === 'true',
      path: '/',
    };
  }

  private sessionMaxAge() {
    const hours = Number(process.env.SESSION_TTL_HOURS || 168);
    return (Number.isFinite(hours) && hours > 0 ? hours : 168) * 60 * 60 * 1000;
  }

  private withoutToken<T extends Record<string, any>>(result: T): Omit<T, 'token'> {
    const { token: _token, ...publicResult } = result;
    return publicResult;
  }
}
