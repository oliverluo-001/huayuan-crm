import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { createUnsubscribeToken } from '../../common/utils/unsubscribe';
import { UnsubscribeController } from './email-controllers';

describe('UnsubscribeController', () => {
  const secret = 'test-unsubscribe-secret';
  const settingsService = {
    getOrCreateUnsubscribeSecret: jest.fn().mockResolvedValue(secret),
  };
  const suppressionService = {
    add: jest.fn(),
  };
  const controller = new UnsubscribeController(
    settingsService as any,
    suppressionService as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('is public so recipients do not need a CRM session', () => {
    expect(Reflect.getMetadata(IS_PUBLIC_KEY, UnsubscribeController)).toBe(true);
  });

  it('accepts the signed query token used by one-click unsubscribe clients', async () => {
    const token = createUnsubscribeToken('Buyer@Example.com', secret);

    await expect(controller.unsubscribe(token)).resolves.toEqual({ ok: true });
    expect(suppressionService.add).toHaveBeenCalledWith({
      email: 'buyer@example.com',
      reason: '收件人通过邮件链接退订',
    });
  });

  it('keeps accepting a JSON token for API compatibility', async () => {
    const token = createUnsubscribeToken('legacy@example.com', secret);

    await expect(controller.unsubscribe('', { token })).resolves.toEqual({ ok: true });
    expect(suppressionService.add).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'legacy@example.com' }),
    );
  });

  it('posts the confirmation request back to the public unsubscribe URL', () => {
    const response = {
      setHeader: jest.fn(),
      end: jest.fn(),
    };

    controller.servePage(response as any);

    expect(response.end).toHaveBeenCalledWith(
      expect.stringContaining('fetch(window.location.pathname+window.location.search,{method:"POST"})'),
    );
    expect(response.end).not.toHaveBeenCalledWith(expect.stringContaining('/api/unsubscribe'));
  });
});
