import { Controller, Get, Param, ServiceUnavailableException } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  status() {
    return this.payload();
  }

  @Public()
  @Get(':releaseId')
  verifyRelease(@Param('releaseId') releaseId: string) {
    const current = this.releaseId();
    if (releaseId !== current) {
      throw new ServiceUnavailableException('当前后端不是本次发布版本');
    }
    return this.payload();
  }

  private payload() {
    return {
      ok: true,
      service: 'huayuan-crm-backend',
      releaseId: this.releaseId(),
    };
  }

  private releaseId() {
    return String(process.env.RELEASE_ID || 'development');
  }
}
