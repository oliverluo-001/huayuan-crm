import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { createUnsubscribeToken } from '../../common/utils/unsubscribe';
import { EmailRecipientsController, UnsubscribeController } from './email-controllers';

describe('EmailRecipientsController', () => {
  it('passes combined customer filters to the scoped full query before recipient pagination', async () => {
    const customersService = {
      findAll: jest.fn().mockResolvedValue({ customers: [{ id: 1, customerId: 'CUS-1', company: 'Buyer', email: 'buyer@example.com', country: 'United Arab Emirates', region: 'Dubai', business: 'flange', tier: 'A', journeyStage: 'new' }] }),
      findContactsForCustomers: jest.fn().mockResolvedValue([{ id: 2, customerId: 1, email: 'contact@example.com', name: 'Buyer contact' }]),
    };
    const controller = new EmailRecipientsController({} as any, customersService as any, { findAll: async () => [] } as any);
    const result = await controller.findAll({ country: 'UAE', marketRegion: '中东', region: 'Dubai', tier: 'A', journeyStage: 'new', ownerId: '999', business: 'flange', emailState: 'sendable', offset: '1', limit: '1' }, { sub: 7, role: 'sales' });
    expect(customersService.findAll).toHaveBeenCalledWith({ country: 'UAE', marketRegion: '中东', region: 'Dubai', tier: 'A', journeyStage: 'new', ownerId: '7' });
    expect(result.total).toBe(2);
    expect(result.recipients).toEqual([expect.objectContaining({ email: 'contact@example.com', country: 'United Arab Emirates' })]);
  });

  it('returns region choices from the complete accessible pool without loading contacts or applying pagination', async () => {
    const customersService = {
      findAll: jest.fn().mockResolvedValue({ customers: Array.from({ length: 30 }, (_, id) => ({ id, region: id === 29 ? 'Sharjah' : 'Dubai' })) }),
      findContactsForCustomers: jest.fn(),
    };
    const controller = new EmailRecipientsController({} as any, customersService as any, {} as any);
    const result = await controller.findAll({ optionsOnly: 'true', limit: '1', ownerId: '999' }, { sub: 7, role: 'sales' });
    expect(result.filterOptions).toEqual({ regions: ['Dubai', 'Sharjah'] });
    expect(customersService.findAll).toHaveBeenCalledWith({ ownerId: '7' });
    expect(customersService.findContactsForCustomers).not.toHaveBeenCalled();
  });

  it('treats a primary address marked invalid as an abnormal mailbox while preserving valid alternate contacts', async () => {
    const customersService = {
      findAll: async () => ({ customers: [{ id: 1, email: 'bad@example.com', emailStatus: 'invalid' }] }),
      findContactsForCustomers: async () => [{ id: 2, customerId: 1, email: 'good@example.com' }],
    };
    const controller = new EmailRecipientsController({} as any, customersService as any, { findAll: async () => [] } as any);
    expect((await controller.findAll({ emailState: 'sendable' }, { sub: 1, role: 'admin' })).recipients!.map((row) => row.email)).toEqual(['good@example.com']);
    expect((await controller.findAll({ emailState: 'invalid' }, { sub: 1, role: 'admin' })).recipients!.map((row) => row.email)).toEqual(['bad@example.com']);
  });

  it('suppresses contacts that did not allow marketing, including the primary customer email row', async () => {
    const customersService = {
      findAll: jest.fn().mockResolvedValue({
        customers: [{ id: 1, customerId: 'CUS-1', company: 'Acme', contact: 'Anna', email: 'anna@acme.test' }],
      }),
      findContactsForCustomers: jest.fn().mockResolvedValue([
        { id: 11, contactId: 'CON-11', customerId: 1, name: 'Anna', email: 'anna@acme.test', marketingAllowed: false },
        { id: 12, contactId: 'CON-12', customerId: 1, name: 'Ben', email: 'ben@acme.test', marketingAllowed: false },
      ]),
    };
    const controller = new EmailRecipientsController(
      {} as any,
      customersService as any,
      { findAll: jest.fn().mockResolvedValue([]) } as any,
    );

    const result = await controller.findAll({}, { sub: 1, role: 'admin' });

    expect(result.recipients).toEqual(expect.arrayContaining([
      expect.objectContaining({ recipientKey: 'customer:CUS-1', suppressed: true }),
      expect.objectContaining({ recipientKey: 'contact:CON-12', suppressed: true }),
    ]));
    await expect(controller.findAll({ ids: 'true' }, { sub: 1, role: 'admin' }))
      .resolves.toEqual({ ids: [] });
  });

  it('returns every sendable contact id for one-click filtered selection', async () => {
    const customersService = {
      findAll: jest.fn().mockResolvedValue({
        customers: [{
          id: 1,
          customerId: 'CUS-1',
          company: 'Acme Flange',
          contact: 'Anna',
          email: 'anna@acme.test',
          business: 'flange',
          journeyStage: 'qualified',
        }],
      }),
      findContactsForCustomers: jest.fn().mockResolvedValue([
        { id: 11, contactId: 'CON-11', customerId: 1, name: 'Ben', email: 'ben@acme.test', marketingAllowed: true },
        { id: 12, contactId: 'CON-12', customerId: 1, name: 'Blocked', email: 'blocked@acme.test', marketingAllowed: false },
      ]),
    };
    const controller = new EmailRecipientsController(
      {} as any,
      customersService as any,
      { findAll: jest.fn().mockResolvedValue([]) } as any,
    );

    await expect(controller.findAll({
      ids: 'true',
      business: 'flange',
      emailState: 'sendable',
      journeyStage: 'qualified',
    }, { sub: 7, role: 'sales' })).resolves.toEqual({
      ids: ['customer:CUS-1', 'contact:CON-11'],
    });
    expect(customersService.findAll).toHaveBeenCalledWith(expect.objectContaining({
      ownerId: '7',
      journeyStage: 'qualified',
    }));
  });
});

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
