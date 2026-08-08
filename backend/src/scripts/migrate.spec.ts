import { ensureInitialAdmin, normalizeLegacyUserEmails } from './migrate';

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

    const result = await ensureInitialAdmin(
      { query } as any,
      {
        username: 'huayuan_owner',
        password: 'VeryStrongOwnerPass2026',
        displayName: '超级管理员',
      },
    );

    expect(result).toEqual({ configured: true, created: true });
    expect(query.mock.calls[1][0]).toContain("WHERE role = 'admin' AND username <> ?");
    expect(query.mock.calls[1][1]).toEqual(['huayuan_owner']);
    expect(query.mock.calls[2][0]).toContain('INSERT INTO users');
    expect(query.mock.calls[2][1][0]).toBe('huayuan_owner');
    expect(query.mock.calls[2][1][1]).toBe('超级管理员');
    expect(query.mock.calls[2][1][2]).not.toBe('VeryStrongOwnerPass2026');
  });

  it('keeps the existing initial administrator without resetting its password', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([[{ id: 1, role: 'admin', status: 'active', active: 1 }], []])
      .mockResolvedValue([{}, []]);

    const result = await ensureInitialAdmin(
      { query } as any,
      { username: 'huayuan_owner', password: 'VeryStrongOwnerPass2026' },
    );

    expect(result).toEqual({ configured: true, created: false });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO users'))).toBe(false);
  });
});
