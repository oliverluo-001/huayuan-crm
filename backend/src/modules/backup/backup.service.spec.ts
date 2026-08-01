import { BackupService } from './backup.service';

describe('BackupService', () => {
  const repository = {
    create: jest.fn((value) => ({ id: 1, createdAt: new Date(), ...value })),
    save: jest.fn(async (value) => value),
    findOne: jest.fn(),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };
  const dataSource = {
    query: jest.fn(async (query: string) => {
      if (query.startsWith('SHOW FULL TABLES')) {
        return [
          { Tables_in_crm: 'customers', Table_type: 'BASE TABLE' },
          { Tables_in_crm: 'backups', Table_type: 'BASE TABLE' },
        ];
      }
      if (query.includes('`customers`')) return [{ id: 1, company: 'Acme' }];
      return [];
    }),
  };
  const settings = {
    findOne: jest.fn().mockResolvedValue({ enabled: true, intervalHours: 24, retentionDays: 30 }),
    upsert: jest.fn(),
  };
  const service = new BackupService(repository as any, dataSource as any, settings as any);

  beforeAll(() => {
    process.env.BACKUP_DIR = `${process.env.TEMP || 'C:/tmp'}/huayuan-crm-backup-test-${process.pid}`;
  });

  beforeEach(() => jest.clearAllMocks());

  it('creates a checksummed snapshot containing business tables but not recursive backup rows', async () => {
    const result = await service.create();
    const saved = repository.save.mock.calls[0][0];
    const payload = JSON.parse(saved.data);

    expect(result).toMatchObject({ id: expect.stringMatching(/^bak_/), type: 'manual' });
    expect(payload.format).toBe('huayuan-crm-mysql-json');
    expect(payload.tables.customers).toEqual([{ id: 1, company: 'Acme' }]);
    expect(payload.tables.backups).toBeUndefined();
    expect(payload.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('persists backup scheduling settings instead of mutating process environment only', async () => {
    await service.saveSettings({ enabled: false, intervalHours: 12, retentionDays: 14 });
    expect(settings.upsert).toHaveBeenCalledWith('backup_settings', {
      enabled: false,
      intervalHours: 12,
      retentionDays: 14,
    });
  });
});
