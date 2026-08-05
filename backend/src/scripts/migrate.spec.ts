import { normalizeLegacyUserEmails } from './migrate';

describe('database migration', () => {
  it('allows null user emails before normalizing legacy empty values', async () => {
    const query = jest.fn(async (_sql: string) => [[], []]);

    await normalizeLegacyUserEmails({ query } as any);

    expect(query.mock.calls.map(([sql]) => sql)).toEqual([
      'ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL DEFAULT NULL',
      "UPDATE users SET email = NULL WHERE TRIM(COALESCE(email, '')) = ''",
    ]);
  });
});
