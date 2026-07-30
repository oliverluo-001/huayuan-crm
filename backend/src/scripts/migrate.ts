import 'dotenv/config';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';

const migrationId = '20260730_online_accounts';
const database = process.env.DB_DATABASE || 'international_trade_crm';

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME || 'root',
    password: process.env.DB_PASSWORD || '',
    database,
    ssl: process.env.DB_SSL === 'true' ? {} : undefined,
  });
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(160) NOT NULL PRIMARY KEY,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [applied] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM schema_migrations WHERE id = ? LIMIT 1',
      [migrationId],
    );
    if (applied.length) {
      console.log(`Migration already applied: ${migrationId}`);
      return;
    }
    const [tables] = await connection.query<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
      [database],
    );
    if (!tables.length) {
      throw new Error('users 表不存在。请先完成基础数据库初始化，再执行增量迁移。');
    }

    await connection.beginTransaction();
    try {
      await connection.query("UPDATE users SET email = NULL WHERE TRIM(COALESCE(email, '')) = ''");
      await connection.query('ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL DEFAULT NULL');
      await addColumn(connection, 'status', "VARCHAR(20) NOT NULL DEFAULT 'active'");
      await addColumn(connection, 'active', 'TINYINT(1) NOT NULL DEFAULT 1');
      await addColumn(connection, 'registration_source', "VARCHAR(20) NOT NULL DEFAULT 'admin'");
      await addColumn(connection, 'token_version', 'INT UNSIGNED NOT NULL DEFAULT 0');
      await addColumn(connection, 'failed_login_attempts', 'INT UNSIGNED NOT NULL DEFAULT 0');
      await addColumn(connection, 'locked_until', 'DATETIME NULL');
      await addColumn(connection, 'last_login_at', 'DATETIME NULL');
      await addColumn(connection, 'approved_at', 'DATETIME NULL');
      await addColumn(connection, 'approved_by', 'INT NULL');
      await connection.query(`
        UPDATE users
        SET status = 'active',
            active = 1,
            registration_source = CASE WHEN role = 'admin' THEN 'setup' ELSE 'admin' END,
            approved_at = COALESCE(approved_at, created_at)
      `);
      if (!(await indexExists(connection, 'idx_users_status'))) {
        await connection.query('ALTER TABLE users ADD KEY idx_users_status (status, active)');
      }
      await connection.query('INSERT INTO schema_migrations (id) VALUES (?)', [migrationId]);
      await connection.commit();
      console.log(`Applied migration: ${migrationId}`);
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

async function addColumn(
  connection: Connection,
  column: string,
  definition: string,
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = ?`,
    [database, column],
  );
  if (!rows.length) {
    await connection.query(`ALTER TABLE users ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function indexExists(connection: Connection, indexName: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND INDEX_NAME = ?`,
    [database, indexName],
  );
  return rows.length > 0;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
