import { SettingsService } from './settings.service';

describe('SettingsService personal mailbox profiles', () => {
  const previousCredentialKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  const rows = new Map<string, any>();
  const repository = {
    find: jest.fn(async ({ where }: any = {}) => {
      if (!where) return [...rows.values()];
      const criteria = Array.isArray(where) ? where : [where];
      return [...rows.values()].filter((row) =>
        criteria.some((condition: any) => {
          const keyCondition = condition.keyName;
          if (!keyCondition) return true;
          if (typeof keyCondition === 'string') return row.keyName === keyCondition;
          if (keyCondition?._type === 'like') {
            const pattern = String(keyCondition._value || '').replace('%', '');
            return row.keyName.startsWith(pattern);
          }
          return false;
        }),
      );
    }),
    findOne: jest.fn(async ({ where }: any) => rows.get(where.keyName) || null),
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => {
      rows.set(value.keyName, value);
      return value;
    }),
  };
  const service = new SettingsService(repository as any);

  beforeEach(() => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'test-credential-key-for-mailbox-profiles';
    rows.clear();
    jest.clearAllMocks();
    rows.set('smtp_profile', {
      keyName: 'smtp_profile',
      keyValue: { smtpHost: 'smtp.admin.test', smtpUser: 'admin@test', smtpFrom: 'admin@test' },
    });
    rows.set('smtp_profile_user_7', {
      keyName: 'smtp_profile_user_7',
      keyValue: { smtpHost: 'smtp.sales.test', smtpUser: 'sales@test', smtpFrom: 'sales@test' },
    });
    rows.set('imap_profile', {
      keyName: 'imap_profile',
      keyValue: { imapEnabled: true, imapHost: 'imap.admin.test', imapUser: 'admin@test', pass: 'admin-pass' },
    });
    rows.set('imap_profile_user_7', {
      keyName: 'imap_profile_user_7',
      keyValue: { imapEnabled: true, imapHost: 'imap.sales.test', imapUser: 'sales@test', pass: 'sales-pass' },
    });
  });

  afterAll(() => {
    if (previousCredentialKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = previousCredentialKey;
  });

  it('keeps the sales profile separate from the administrator profile', async () => {
    await expect(service.getSmtpProfile('7')).resolves.toEqual(
      expect.objectContaining({ smtpUser: 'sales@test' }),
    );
    await expect(service.getSmtpProfile()).resolves.toEqual(
      expect.objectContaining({ smtpUser: 'admin@test' }),
    );
  });

  it('writes a salesperson configuration only to that salesperson key', async () => {
    await service.saveSmtpProfile({
      smtpHost: 'smtp.new.test',
      smtpUser: 'new-sales@test',
      smtpFrom: 'new-sales@test',
    }, '9');

    expect(rows.get('smtp_profile_user_9')?.keyValue).toEqual(
      expect.objectContaining({ smtpHost: 'smtp.new.test', smtpUser: 'new-sales@test' }),
    );
    expect(rows.get('smtp_profile')?.keyValue.smtpUser).toBe('admin@test');
  });

  it('keeps the sales IMAP profile separate from the administrator profile', async () => {
    await expect(service.getImapProfile('7')).resolves.toEqual(
      expect.objectContaining({ imapUser: 'sales@test', pass: '' }),
    );
    await expect(service.getImapProfile()).resolves.toEqual(
      expect.objectContaining({ imapUser: 'admin@test', pass: '' }),
    );
  });

  it('lists enabled IMAP profiles with decrypted credentials for monitoring', async () => {
    await expect(service.listEnabledImapCredentials()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          userId: undefined,
          profile: expect.objectContaining({ imapHost: 'imap.admin.test', pass: 'admin-pass' }),
        }),
        expect.objectContaining({
          userId: '7',
          profile: expect.objectContaining({ imapHost: 'imap.sales.test', pass: 'sales-pass' }),
        }),
      ]),
    );
  });
});
