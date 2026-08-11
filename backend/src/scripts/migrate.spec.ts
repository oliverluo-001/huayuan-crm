import {
  ensureInitialAdmin,
  migrateCustomerDuplicateManagement,
  migrateOpportunityManagement,
  normalizeLegacyUserEmails,
} from './migrate';

describe('database migration', () => {
  it('allows null user emails before normalizing legacy empty values', async () => {
    const query = jest.fn(async (_sql: string) => [[], []]);

    await normalizeLegacyUserEmails({ query } as any);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL DEFAULT NULL',
      "UPDATE users SET email = NULL WHERE TRIM(COALESCE(email, '')) = ''",
    ]);
  });

  it('creates the configured initial administrator and demotes every other administrator', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([[], []])
      .mockResolvedValue([{}, []]);

    const result = await ensureInitialAdmin({ query } as any, {
      username: 'huayuan_owner',
      password: 'VeryStrongOwnerPass2026',
      displayName: '超级管理员',
    });

    expect(result).toEqual({ configured: true, created: true });
    expect(query.mock.calls[1][0]).toContain(
      "WHERE role = 'admin' AND username <> ?",
    );
    expect(query.mock.calls[1][1]).toEqual(['huayuan_owner']);
    expect(query.mock.calls[2][0]).toContain('INSERT INTO users');
    expect(query.mock.calls[2][1][0]).toBe('huayuan_owner');
    expect(query.mock.calls[2][1][1]).toBe('超级管理员');
    expect(query.mock.calls[2][1][2]).not.toBe('VeryStrongOwnerPass2026');
  });

  it('keeps the existing initial administrator without resetting its password', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([
        [{ id: 1, role: 'admin', status: 'active', active: 1 }],
        [],
      ])
      .mockResolvedValue([{}, []]);

    const result = await ensureInitialAdmin({ query } as any, {
      username: 'huayuan_owner',
      password: 'VeryStrongOwnerPass2026',
    });

    expect(result).toEqual({ configured: true, created: false });
    expect(query).toHaveBeenCalledTimes(2);
    expect(
      query.mock.calls.some(([sql]) =>
        String(sql).includes('INSERT INTO users'),
      ),
    ).toBe(false);
  });

  it('can repeat the duplicate-management migration without adding columns or indexes twice', async () => {
    const columns = new Set<string>();
    const indexes = new Set<string>();
    const query = jest.fn(async (rawSql: string, params: any[] = []) => {
      const sql = String(rawSql);
      if (sql.includes('information_schema.TABLES')) {
        return [[{ TABLE_NAME: params[1] }], []];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [
          columns.has(String(params[2])) ? [{ COLUMN_NAME: params[2] }] : [],
          [],
        ];
      }
      if (sql.includes('information_schema.STATISTICS')) {
        return [
          indexes.has(String(params[2])) ? [{ INDEX_NAME: params[2] }] : [],
          [],
        ];
      }
      const columnMatch = sql.match(/ADD COLUMN `([^`]+)`/);
      if (columnMatch) columns.add(columnMatch[1]);
      if (sql.includes('CREATE TABLE IF NOT EXISTS customer_merge_history')) {
        columns.add('primary_contact_selection');
      }
      const indexMatch = sql.match(/ADD INDEX `([^`]+)`/);
      if (indexMatch) indexes.add(indexMatch[1]);
      return [{ affectedRows: 1 }, []];
    });

    await migrateCustomerDuplicateManagement({ query } as any);
    await migrateCustomerDuplicateManagement({ query } as any);

    expect(columns).toEqual(
      new Set([
        'source_history',
        'merged_into_id',
        'merged_at',
        'primary_contact_selection',
      ]),
    );
    expect(indexes).toEqual(new Set(['idx_customers_merged_into']));
    expect(
      query.mock.calls.filter(([sql]) => String(sql).includes('ADD COLUMN')),
    ).toHaveLength(3);
    expect(
      query.mock.calls.filter(([sql]) => String(sql).includes('ADD INDEX')),
    ).toHaveLength(1);
  });

  it('can repeat the opportunity-management migration without adding columns or indexes twice', async () => {
    const columns = new Set<string>();
    const indexes = new Set<string>();
    const query = jest.fn(async (rawSql: string, params: any[] = []) => {
      const sql = String(rawSql);
      if (sql.includes('information_schema.TABLES')) {
        return [[{ TABLE_NAME: params[1] }], []];
      }
      if (sql.includes('information_schema.COLUMNS')) {
        return [
          columns.has(String(params[2])) ? [{ COLUMN_NAME: params[2] }] : [],
          [],
        ];
      }
      if (sql.includes('information_schema.STATISTICS')) {
        return [
          indexes.has(String(params[2])) ? [{ INDEX_NAME: params[2] }] : [],
          [],
        ];
      }
      const columnMatch = sql.match(/ADD COLUMN `([^`]+)`/);
      if (columnMatch) columns.add(columnMatch[1]);
      const indexMatch = sql.match(/ADD INDEX `([^`]+)`/);
      if (indexMatch) indexes.add(indexMatch[1]);
      return [{ affectedRows: 1 }, []];
    });

    await migrateOpportunityManagement({ query } as any);
    await migrateOpportunityManagement({ query } as any);

    expect(columns.size).toBe(19);
    expect(columns.has('forecast_category')).toBe(true);
    expect(columns.has('stage_entered_at')).toBe(true);
    expect(indexes).toEqual(
      new Set([
        'idx_opportunities_owner',
        'idx_opportunities_forecast',
        'idx_opportunities_stage_entered',
      ]),
    );
    expect(
      query.mock.calls.filter(([sql]) => String(sql).includes('ADD COLUMN')),
    ).toHaveLength(19);
    expect(
      query.mock.calls.filter(([sql]) => String(sql).includes('ADD INDEX')),
    ).toHaveLength(3);
  });
});
