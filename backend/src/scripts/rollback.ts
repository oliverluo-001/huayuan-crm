import 'dotenv/config';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { createHash } from 'node:crypto';

const database = process.env.DB_DATABASE || 'international_trade_crm';
const EXCLUDED_TABLES = new Set(['backups', 'schema_migrations']);

type RollbackDefinition = {
  id: string;
  down: (connection: Connection) => Promise<void>;
};

export const rollbackDefinitions: RollbackDefinition[] = [
  {
    id: '20260801_audit_metadata',
    down: async (connection) => {
      for (const column of ['duration_ms', 'status', 'ip', 'path', 'method', 'user_id']) {
        await dropColumnIfExists(connection, 'audit_logs', column);
      }
    },
  },
  {
    id: '20260801_email_execution_and_security',
    down: async (connection) => {
      await dropIndexIfExists(connection, 'lead_tasks', 'idx_lead_tasks_owner');
      await dropIndexIfExists(connection, 'leads', 'idx_leads_owner');
      await dropIndexIfExists(connection, 'email_logs', 'idx_email_logs_owner');
      await dropIndexIfExists(connection, 'email_tasks', 'idx_email_tasks_owner');
      await dropIndexIfExists(connection, 'customers', 'idx_customers_owner');
      await dropIndexIfExists(connection, 'customer_views', 'idx_customer_views_owner');
      await dropColumnIfExists(connection, 'customer_views', 'owner_id');
      await dropColumnIfExists(connection, 'leads', 'owner_id');
      await dropColumnIfExists(connection, 'lead_tasks', 'owner_id');
      await dropColumnIfExists(connection, 'customers', 'owner_id');
      await dropColumnIfExists(connection, 'customers', 'email_failed_at');
      await dropColumnIfExists(connection, 'customers', 'email_failure_reason');
      await dropColumnIfExists(connection, 'email_logs', 'owner_id');
      await dropColumnIfExists(connection, 'email_logs', 'attempt');
      await dropColumnIfExists(connection, 'email_logs', 'message_id');
      await dropColumnIfExists(connection, 'email_logs', 'contact_id');
      await dropColumnIfExists(connection, 'email_tasks', 'owner_id');
      await dropColumnIfExists(connection, 'email_tasks', 'last_message');
      await dropColumnIfExists(connection, 'email_tasks', 'skipped_send_count');
      await dropColumnIfExists(connection, 'email_tasks', 'failed_send_count');
      await dropColumnIfExists(connection, 'email_tasks', 'next_run_at');
      await dropColumnIfExists(connection, 'email_tasks', 'start_at');
      await dropTableIfExists(connection, 'email_task_recipients');
    },
  },
  {
    id: '20260730_online_accounts',
    down: async (connection) => {
      if (await tableExists(connection, 'users')) {
        await connection.query('ALTER TABLE `users` MODIFY COLUMN `email` VARCHAR(255) NOT NULL');
      }
      await dropIndexIfExists(connection, 'users', 'idx_users_status');
      for (const column of [
        'approved_by',
        'approved_at',
        'last_login_at',
        'locked_until',
        'failed_login_attempts',
        'token_version',
        'registration_source',
        'active',
        'status',
      ]) {
        await dropColumnIfExists(connection, 'users', column);
      }
    },
  },
];

export async function rollbackLatest(connection: Connection, confirmedMigrationId: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM schema_migrations ORDER BY applied_at DESC LIMIT 1',
  );
  const latestId = String(rows[0]?.id || '');
  if (!latestId) throw new Error('没有可回滚的已应用迁移');
  const migration = rollbackDefinitions.find((item) => item.id === latestId);
  if (!migration) throw new Error(`最新迁移 ${latestId} 没有回滚定义，已拒绝跳过该迁移`);
  if (confirmedMigrationId !== latestId) {
    throw new Error(`最新迁移是 ${latestId}。请使用 --confirm=${latestId} 明确确认。`);
  }

  const rollbackBackupId = await createSafetyBackup(connection);
  try {
    await migration.down(connection);
    await connection.query('DELETE FROM schema_migrations WHERE id = ?', [latestId]);
  } catch (error) {
    throw new Error(
      `迁移 ${latestId} 回滚失败。执行前快照为 ${rollbackBackupId}，可从管理界面恢复。${error instanceof Error ? ` 原因：${error.message}` : ''}`,
    );
  }
  return { migrationId: latestId, rollbackBackupId };
}

async function createSafetyBackup(connection: Connection) {
  if (!(await tableExists(connection, 'backups'))) {
    throw new Error('backups 表不存在，无法在迁移回滚前创建安全快照');
  }
  const [tableRows] = await connection.query<RowDataPacket[]>(
    "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'",
  );
  const tables: Record<string, Record<string, unknown>[]> = {};
  for (const row of tableRows) {
    const table = String(Object.values(row)[0] || '');
    if (!/^[a-zA-Z0-9_]+$/.test(table) || EXCLUDED_TABLES.has(table)) continue;
    const [data] = await connection.query<RowDataPacket[]>(`SELECT * FROM \`${table}\``);
    tables[table] = data as Record<string, unknown>[];
  }
  const payload: Record<string, unknown> = {
    format: 'huayuan-crm-mysql-json',
    version: 1,
    createdAt: new Date().toISOString(),
    tables,
  };
  payload.checksum = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const data = JSON.stringify(payload);
  const backupId = `bak_rollback_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const filename = `huayuan-crm_pre-migration-rollback_${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  await connection.query(
    'INSERT INTO backups (backup_id, filename, data, size, type) VALUES (?, ?, ?, ?, ?)',
    [backupId, filename, data, Buffer.byteLength(data, 'utf8'), 'pre-migration-rollback'],
  );
  return backupId;
}

async function tableExists(connection: Connection, table: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, table],
  );
  return rows.length > 0;
}

async function dropTableIfExists(connection: Connection, table: string) {
  if (await tableExists(connection, table)) await connection.query(`DROP TABLE \`${table}\``);
}

async function dropColumnIfExists(connection: Connection, table: string, column: string) {
  if (!(await tableExists(connection, table))) return;
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, table, column],
  );
  if (rows.length) await connection.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${column}\``);
}

async function dropIndexIfExists(connection: Connection, table: string, index: string) {
  if (!(await tableExists(connection, table))) return;
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [database, table, index],
  );
  if (rows.length) await connection.query(`ALTER TABLE \`${table}\` DROP INDEX \`${index}\``);
}

function confirmationArgument() {
  const argument = process.argv.slice(2).find((item) => item.startsWith('--confirm='));
  return argument?.slice('--confirm='.length) || '';
}

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
    const result = await rollbackLatest(connection, confirmationArgument());
    console.log(`Rolled back migration: ${result.migrationId}`);
    console.log(`Safety backup: ${result.rollbackBackupId}`);
  } finally {
    await connection.end();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
