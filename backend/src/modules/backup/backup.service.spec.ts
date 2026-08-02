import { BackupService } from './backup.service';

describe('BackupService', () => {
  const queryRunner = {
    connect: jest.fn(),
    release: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    query: jest.fn(async (query: string) => {
      if (query.startsWith('SHOW FULL TABLES')) {
        return [
          { Tables_in_crm: 'customers', Table_type: 'BASE TABLE' },
          { Tables_in_crm: 'backups', Table_type: 'BASE TABLE' },
        ];
      }
      if (query.startsWith('SHOW COLUMNS')) return [{ Field: 'id' }, { Field: 'company' }];
      if (query.startsWith('SELECT COUNT(*)')) return [{ count: 1 }];
      return [];
    }),
  };
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
    createQueryRunner: jest.fn(() => queryRunner),
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

  beforeEach(() => {
    jest.clearAllMocks();
    queryRunner.query.mockImplementation(async (query: string) => {
      if (query.startsWith('SHOW FULL TABLES')) {
        return [
          { Tables_in_crm: 'customers', Table_type: 'BASE TABLE' },
          { Tables_in_crm: 'backups', Table_type: 'BASE TABLE' },
        ];
      }
      if (query.startsWith('SHOW COLUMNS')) return [{ Field: 'id' }, { Field: 'company' }];
      if (query.startsWith('SELECT COUNT(*)')) return [{ count: 1 }];
      return [];
    });
  });

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

  it('drills a restore into temporary tables without deleting production rows', async () => {
    await service.create();
    const saved = repository.save.mock.calls[0][0];
    repository.findOne.mockResolvedValue(saved);

    await expect(service.drill(saved.backupId)).resolves.toMatchObject({
      valid: true,
      restorable: true,
      restoredRows: 1,
    });
    expect(queryRunner.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TEMPORARY TABLE'));
    expect(queryRunner.query).not.toHaveBeenCalledWith(expect.stringContaining('DELETE FROM'));
  });

  it('creates a rollback snapshot before replacing business table rows', async () => {
    await service.create();
    const saved = repository.save.mock.calls[0][0];
    repository.findOne.mockResolvedValue(saved);
    repository.save.mockClear();

    await expect(service.restore(saved.backupId, 'RESTORE')).resolves.toMatchObject({
      restored: true,
      backupId: saved.backupId,
      rollbackBackupId: expect.stringMatching(/^bak_/),
    });
    expect(repository.save).toHaveBeenCalledWith(expect.objectContaining({ type: 'pre-restore' }));
    expect(queryRunner.startTransaction).toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledWith('DELETE FROM `customers`');
    expect(queryRunner.commitTransaction).toHaveBeenCalled();
  });
});
