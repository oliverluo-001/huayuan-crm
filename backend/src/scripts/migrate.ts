import 'dotenv/config';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import * as bcrypt from 'bcrypt';
import { migrateP03DataIntegrity } from './p03-data-integrity';

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
    }
    const [tables] = await connection.query<RowDataPacket[]>(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'`,
      [database],
    );
    if (!tables.length) {
      throw new Error('users 表不存在。请先完成基础数据库初始化，再执行增量迁移。');
    }

    if (!applied.length) {
      await connection.beginTransaction();
      try {
        await normalizeLegacyUserEmails(connection);
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
        await connection.query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [migrationId]);
        await connection.commit();
        console.log(`Applied migration: ${migrationId}`);
      } catch (error) {
        await connection.rollback();
        throw error;
      }
    }
    await migrateEmailExecution(connection);
    await migrateAuditMetadata(connection);
    await migrateCrmContracts(connection);
    await migrateP03DataIntegrity(connection, database);
    await migrateOpportunityLifecycle(connection);
    await connection.beginTransaction();
    try {
      await ensureInitialAdmin(connection);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } finally {
    await connection.end();
  }
}

async function migrateAuditMetadata(connection: Connection) {
  const id = '20260801_audit_metadata';
  if (!(await tableExists(connection, 'audit_logs'))) return;
  await addColumnToTable(connection, 'audit_logs', 'user_id', "VARCHAR(32) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, 'audit_logs', 'method', "VARCHAR(10) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, 'audit_logs', 'path', "VARCHAR(500) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, 'audit_logs', 'ip', "VARCHAR(64) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, 'audit_logs', 'status', "VARCHAR(20) NOT NULL DEFAULT 'success'");
  await addColumnToTable(connection, 'audit_logs', 'duration_ms', 'INT NOT NULL DEFAULT 0');
  await connection.query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [id]);
}

async function migrateCrmContracts(connection: Connection) {
  const id = '20260808_crm_contracts';
  if (!(await tableExists(connection, 'quotes'))) return;
  await addColumnToTable(connection, 'quotes', 'freight', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await connection.query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [id]);
}

async function migrateOpportunityLifecycle(connection: Connection) {
  const id = '20260808_opportunity_lifecycle_sync';
  if (!(await tableExists(connection, 'customers')) || !(await tableExists(connection, 'opportunities'))) return;

  await connection.query(`
    UPDATE customers c
    LEFT JOIN (
      SELECT customer_id,
             SUM(CASE WHEN stage NOT IN ('won', 'lost') THEN 1 ELSE 0 END) AS open_count,
             SUM(CASE WHEN stage NOT IN ('won', 'lost') THEN amount ELSE 0 END) AS open_value
      FROM opportunities
      GROUP BY customer_id
    ) summary ON summary.customer_id = c.id
    SET c.open_opportunity_count = COALESCE(summary.open_count, 0),
        c.open_opportunity_value = COALESCE(summary.open_value, 0)
    WHERE NOT (c.open_opportunity_count <=> COALESCE(summary.open_count, 0))
       OR NOT (c.open_opportunity_value <=> COALESCE(summary.open_value, 0))
  `);

  await connection.query(`
    UPDATE customers c
    JOIN opportunities current_opportunity ON current_opportunity.customer_id = c.id
    LEFT JOIN opportunities newer_opportunity
      ON newer_opportunity.customer_id = current_opportunity.customer_id
     AND (
       newer_opportunity.updated_at > current_opportunity.updated_at
       OR (
         newer_opportunity.updated_at = current_opportunity.updated_at
         AND newer_opportunity.id > current_opportunity.id
       )
     )
    SET c.journey_stage = CASE current_opportunity.stage
      WHEN 'prospecting' THEN 'opportunity'
      WHEN 'qualification' THEN 'qualified'
      WHEN 'proposal' THEN 'proposal'
      WHEN 'negotiation' THEN 'negotiation'
      WHEN 'won' THEN 'won'
      WHEN 'lost' THEN 'lost'
      ELSE c.journey_stage
    END
    WHERE newer_opportunity.id IS NULL
      AND NOT (c.journey_stage <=> CASE current_opportunity.stage
        WHEN 'prospecting' THEN 'opportunity'
        WHEN 'qualification' THEN 'qualified'
        WHEN 'proposal' THEN 'proposal'
        WHEN 'negotiation' THEN 'negotiation'
        WHEN 'won' THEN 'won'
        WHEN 'lost' THEN 'lost'
        ELSE c.journey_stage
      END)
  `);

  await connection.query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [id]);
}

export async function ensureInitialAdmin(
  connection: Pick<Connection, 'query'>,
  credentials: { username?: string; password?: string; displayName?: string } = {},
) {
  const username = (credentials.username ?? process.env.INITIAL_ADMIN_USERNAME ?? '').trim();
  const password = credentials.password ?? process.env.INITIAL_ADMIN_PASSWORD ?? '';
  const displayName = (credentials.displayName ?? process.env.INITIAL_ADMIN_DISPLAY_NAME ?? '超级管理员').trim();

  if (!username && !password) return { configured: false, created: false };
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    throw new Error('INITIAL_ADMIN_USERNAME 必须是 3-32 位字母、数字、点、横线或下划线');
  }
  if (password.length < 16 || password.length > 128) {
    throw new Error('INITIAL_ADMIN_PASSWORD 必须是 16-128 位密码');
  }

  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT id, role, status, active FROM users WHERE username = ? LIMIT 1',
    [username],
  );
  const existing = rows[0];

  await connection.query(
    "UPDATE users SET role = 'sales', token_version = token_version + 1 WHERE role = 'admin' AND username <> ?",
    [username],
  );

  if (existing) {
    if (existing.role !== 'admin' || existing.status !== 'active' || !existing.active) {
      await connection.query(
        `UPDATE users
         SET role = 'admin', status = 'active', active = 1,
             registration_source = 'setup', approved_at = COALESCE(approved_at, NOW()),
             token_version = token_version + 1
         WHERE id = ?`,
        [existing.id],
      );
    }
    return { configured: true, created: false };
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await connection.query(
    `INSERT INTO users (
       username, display_name, email, role, status, active, registration_source,
       password_hash, token_version, failed_login_attempts, locked_until,
       last_login_at, approved_at, approved_by, created_at, updated_at
     ) VALUES (?, ?, NULL, 'admin', 'active', 1, 'setup', ?, 0, 0, NULL, NULL, NOW(), NULL, NOW(), NOW())`,
    [username, displayName || username, passwordHash],
  );
  return { configured: true, created: true };
}

export async function normalizeLegacyUserEmails(connection: Pick<Connection, 'query'>) {
  await connection.query('ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL DEFAULT NULL');
  await connection.query("UPDATE users SET email = NULL WHERE TRIM(COALESCE(email, '')) = ''");
}

async function migrateEmailExecution(connection: Connection) {
  const id = '20260801_email_execution_and_security';
  const [applied] = await connection.query<RowDataPacket[]>(
    'SELECT id FROM schema_migrations WHERE id = ? LIMIT 1',
    [id],
  );
  if (applied.length) {
    console.log(`Migration already applied: ${id}`);
  }
  if (!(await tableExists(connection, 'email_tasks'))) {
    throw new Error('email_tasks 表不存在，请先初始化基础数据库结构');
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS email_task_recipients (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      task_id INT NOT NULL,
      recipient_key VARCHAR(80) NOT NULL,
      customer_id INT NULL,
      contact_id INT NULL,
      email VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL DEFAULT '',
      company VARCHAR(255) NOT NULL DEFAULT '',
      timezone VARCHAR(80) NOT NULL DEFAULT '',
      status ENUM('queued','sending','sent','failed','skipped') NOT NULL DEFAULT 'queued',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT NULL,
      sent_at TIMESTAMP NULL,
      created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_email_task_recipient (task_id, recipient_key),
      KEY idx_email_task_recipient_status (task_id, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnToTable(connection, 'email_tasks', 'start_at', 'TIMESTAMP NULL');
  await addColumnToTable(connection, 'email_tasks', 'next_run_at', 'TIMESTAMP NULL');
  await addColumnToTable(connection, 'email_tasks', 'failed_send_count', 'INT NOT NULL DEFAULT 0');
  await addColumnToTable(connection, 'email_tasks', 'skipped_send_count', 'INT NOT NULL DEFAULT 0');
  await addColumnToTable(connection, 'email_tasks', 'last_message', 'TEXT NULL');
  await addColumnToTable(connection, 'email_tasks', 'owner_id', "VARCHAR(32) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, 'email_logs', 'contact_id', "VARCHAR(32) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, 'email_logs', 'message_id', "VARCHAR(255) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, 'email_logs', 'attempt', 'INT NOT NULL DEFAULT 1');
  await addColumnToTable(connection, 'email_logs', 'owner_id', "VARCHAR(32) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, 'customers', 'email_failure_reason', 'TEXT NULL');
  await addColumnToTable(connection, 'customers', 'email_failed_at', 'TIMESTAMP NULL');
  await addColumnToTable(connection, 'customers', 'owner_id', "VARCHAR(32) NOT NULL DEFAULT ''");
  if (await tableExists(connection, 'lead_tasks')) {
    await addColumnToTable(connection, 'lead_tasks', 'owner_id', "VARCHAR(32) NOT NULL DEFAULT ''");
  }
  if (await tableExists(connection, 'leads')) {
    await addColumnToTable(connection, 'leads', 'owner_id', "VARCHAR(32) NOT NULL DEFAULT ''");
  }
  if (await tableExists(connection, 'customer_views')) {
    await addColumnToTable(connection, 'customer_views', 'owner_id', "VARCHAR(32) NOT NULL DEFAULT ''");
    await addIndexIfMissing(connection, 'customer_views', 'idx_customer_views_owner', 'owner_id');
  }
  await addIndexIfMissing(connection, 'customers', 'idx_customers_owner', 'owner_id');
  await addIndexIfMissing(connection, 'email_tasks', 'idx_email_tasks_owner', 'owner_id');
  await addIndexIfMissing(connection, 'email_logs', 'idx_email_logs_owner', 'owner_id');
  if (await tableExists(connection, 'lead_tasks')) await addIndexIfMissing(connection, 'lead_tasks', 'idx_lead_tasks_owner', 'owner_id');
  if (await tableExists(connection, 'leads')) await addIndexIfMissing(connection, 'leads', 'idx_leads_owner', 'owner_id');

  await connection.query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [id]);
  console.log(`Applied migration: ${id}`);
}

async function addColumnToTable(
  connection: Connection,
  table: string,
  column: string,
  definition: string,
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [database, table, column],
  );
  if (!rows.length) {
    await connection.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  }
}

async function tableExists(connection: Connection, table: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT TABLE_NAME FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
    [database, table],
  );
  return rows.length > 0;
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

async function addIndexIfMissing(connection: Connection, table: string, indexName: string, column: string) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [database, table, indexName],
  );
  if (!rows.length) await connection.query(`ALTER TABLE \`${table}\` ADD INDEX \`${indexName}\` (\`${column}\`)`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
