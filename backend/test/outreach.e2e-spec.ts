import { CanActivate, ExecutionContext, INestApplication, Injectable, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { RolesGuard } from '../src/common/guards/roles.guard';
import { OutreachController } from '../src/modules/email/outreach.controller';
import { OutreachService } from '../src/modules/email/outreach.service';

@Injectable()
class FixtureIdentity implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.user = { sub: 7, role: request.headers['x-test-role'] || 'viewer' };
    return true;
  }
}

describe('customer analysis HTTP boundary', () => {
  let app: INestApplication; let base: string;
  const service = { list: jest.fn(async () => []), create: jest.fn(async () => ({ id: 'fixture', status: 'pending' })), select: jest.fn(async () => ({ id: 'fixture', status: 'pending' })) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [OutreachController], providers: [
      { provide: OutreachService, useValue: service },
      { provide: APP_GUARD, useClass: FixtureIdentity }, { provide: APP_GUARD, useClass: RolesGuard },
    ] }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1'); base = await app.getUrl();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => jest.clearAllMocks());
  const post = (body: unknown) => fetch(`${base}/outreach-workflows`, { method: 'POST', headers: { 'x-test-role': 'sales', 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const valid = { requestId: 'owf_111111111111111111111111', name: 'Test', targetCountry: 'UAE', productScope: 'Flanges', recipientKeys: ['customer:1'], sender: { name: 'Seller', company: 'Flanges', email: 'seller@example.com', whatsapp: '+100000000', website: 'example.com' } };
  it('blocks viewers from analysis endpoints before retrieving or changing data', async () => {
    expect((await fetch(`${base}/outreach-workflows`)).status).toBe(403);
    expect(service.list).not.toHaveBeenCalled();
  });
  it('requires nested sender details and rejects injected recipient snapshots', async () => {
    const { sender: _sender, ...missing } = valid;
    expect((await post(missing)).status).toBe(400);
    expect((await post({ ...valid, drafts: [{ email: 'injected@example.com' }] })).status).toBe(400);
    expect(service.create).not.toHaveBeenCalled();
  });
  it('passes the authenticated salesperson scope to the analysis service', async () => {
    expect((await post(valid)).status).toBe(201);
    expect(service.create).toHaveBeenCalledWith(expect.objectContaining({ recipientKeys: ['customer:1'] }), '7');
  });
  it('validates bulk draft selection and preserves salesperson ownership scope', async () => {
    const put = (body: unknown, role = 'sales') => fetch(`${base}/outreach-workflows/fixture/selection`, { method: 'PUT', headers: { 'x-test-role': role, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    expect((await put({ recipientKeys: [], revision: 0 }, 'viewer')).status).toBe(403);
    expect((await put({ recipientKeys: ['customer:1'], revision: 0, approvedAt: 'injected' })).status).toBe(400);
    expect((await put({ recipientKeys: Array(21).fill('customer:1'), revision: 0 })).status).toBe(400);
    expect(service.select).not.toHaveBeenCalled();
    expect((await put({ recipientKeys: [], revision: 3 })).status).toBe(200);
    expect(service.select).toHaveBeenCalledWith('fixture', { recipientKeys: [], revision: 3 }, '7');
  });
});
