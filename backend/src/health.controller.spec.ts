import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const controller = new HealthController();
  const originalReleaseId = process.env.RELEASE_ID;

  afterEach(() => {
    if (originalReleaseId === undefined) delete process.env.RELEASE_ID;
    else process.env.RELEASE_ID = originalReleaseId;
  });

  it('reports and verifies the active release id', () => {
    process.env.RELEASE_ID = 'run-1-commit';
    expect(controller.status()).toEqual({
      ok: true,
      service: 'huayuan-crm-backend',
      releaseId: 'run-1-commit',
    });
    expect(controller.verifyRelease('run-1-commit')).toMatchObject({ ok: true });
  });

  it('rejects a health check for an older backend release', () => {
    process.env.RELEASE_ID = 'new-release';
    expect(() => controller.verifyRelease('old-release')).toThrow(ServiceUnavailableException);
  });
});
