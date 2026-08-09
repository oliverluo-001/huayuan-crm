import { SettingsService } from './settings.service';

describe('SettingsService personal SMTP profiles', () => {
  const rows = new Map<string, any>();
  const repository = {
    findOne: jest.fn(async ({ where }: any) => rows.get(where.keyName) || null),
    create: jest.fn((value: any) => value),
    save: jest.fn(async (value: any) => {
      rows.set(value.keyName, value);
      return value;
    }),
  };
  const service = new SettingsService(repository as any);

  beforeEach(() => {
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
});
