import { Controller, Post, Get, Body, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { LoginDto, RegisterDto, ChangePasswordDto } from './dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Get('status')
  async getStatus() {
    return this.authService.getStatus();
  }

  @Public()
  @Post('setup')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('logout')
  async logout() {
    return { success: true, message: '已退出登录' };
  }

  @Public()
  @Post('reset-all')
  async resetAll() {
    return this.authService.resetAll();
  }

  @Post('change-password')
  async changePassword(
    @Request() req: any,
    @Body() changePasswordDto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(req.user.sub, changePasswordDto);
  }
}