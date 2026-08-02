import { rollbackLatest } from './rollback';

describe('migration rollback', () => {
  const query = jest.fn(async (sql: string) => {
    if (sql.startsWith('SELECT id FROM schema_migrations')) {
      return [[{ id: '20260801_audit_metadata' }], []];
    }
    if (sql.includes('information_schema.TABLES')) return [[{ TABLE_NAME: 'backups' }], []];
    if (sql.startsWith('SHOW FULL TABLES')) {
      return [[
        { Tables_in_crm: 'customers', Table_type: 'BASE TABLE' },
        { Tables_in_crm: 'backups', Table_type: 'BASE TABLE' },
      ], []];
    }
    if (sql.startsWith('SELECT * FROM `customers`')) return [[{ id: 1, company: 'Acme' }], []];
    if (sql.includes('information_schema.COLUMNS')) return [[{ COLUMN_NAME: 'present' }], []];
    return [[], []];
  });
  const connection = { query } as any;

  beforeEach(() => jest.clearAllMocks());

  it('refuses a rollback unless the latest applied migration id is confirmed', async () => {
    await expect(rollbackLatest(connection, '20260730_online_accounts')).rejects.toThrow(
      '--confirm=20260801_audit_metadata',
    );
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO backups'), expect.anything());
  });

  it('refuses to skip an unknown migration that is newer than registered rollback definitions', async () => {
    query.mockImplementationOnce(async () => [[{ id: '20260802_unknown_change' }], []]);

    await expect(rollbackLatest(connection, '20260802_unknown_change')).rejects.toThrow(
      '没有回滚定义，已拒绝跳过该迁移',
    );
    expect(query).not.toHaveBeenCalledWith(expect.stringContaining('INSERT INTO backups'), expect.anything());
  });

  it('creates a safety backup before applying the registered down migration', async () => {
    const result = await rollbackLatest(connection, '20260801_audit_metadata');

    expect(result).toMatchObject({
      migrationId: '20260801_audit_metadata',
      rollbackBackupId: expect.stringMatching(/^bak_rollback_/),
    });
    const statements = query.mock.calls.map(([sql]) => sql);
    const backupIndex = statements.findIndex((sql) => sql.startsWith('INSERT INTO backups'));
    const dropIndex = statements.findIndex((sql) => sql.includes('DROP COLUMN `duration_ms`'));
    expect(backupIndex).toBeGreaterThan(-1);
    expect(dropIndex).toBeGreaterThan(backupIndex);
    expect(statements).toContain('DELETE FROM schema_migrations WHERE id = ?');
  });
});
