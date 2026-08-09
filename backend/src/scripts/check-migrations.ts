import 'dotenv/config';
import { strict as assert } from 'node:assert';
import mysql, { type Connection, type RowDataPacket } from 'mysql2/promise';
import { DataSource } from 'typeorm';

type CheckRow = RowDataPacket & Record<string, any>;

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USERNAME || 'root';
const password = process.env.DB_PASSWORD || '';
const rawSuffix = `${process.env.GITHUB_RUN_ID || Date.now()}_${process.pid}`;
const database = `huayuan_crm_ci_${rawSuffix}`.slice(0, 60);

if (!/^huayuan_crm_ci_[a-zA-Z0-9_]+$/.test(database)) {
  throw new Error(`拒绝使用不安全的迁移检查数据库名: ${database}`);
}

async function createCurrentSchema() {
  const dataSource = new DataSource({
    type: 'mysql',
    host,
    port,
    username: user,
    password,
    database,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: true,
    logging: false,
    timezone: '+08:00',
    charset: 'utf8mb4',
  });
  await dataSource.initialize();
  await dataSource.destroy();
}

async function seedLegacyFixture(connection: Connection) {
  await connection.query('ALTER TABLE products ADD COLUMN base_price VARCHAR(64) NULL');
  await connection.query('ALTER TABLE products MODIFY COLUMN price VARCHAR(64) NULL');
  await connection.query("ALTER TABLE samples MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'");
  await connection.query("ALTER TABLE todos MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'open'");

  await connection.query(
    "INSERT INTO customers (customerId, company, contact, email, journey_stage, owner_id) VALUES ('CUST-CI-1', 'CI Migration Customer', 'Anna', 'anna@ci.test', 'new', '7')",
  );
  const [customerRows] = await connection.query<CheckRow[]>("SELECT id FROM customers WHERE customerId = 'CUST-CI-1'");
  const customerId = Number(customerRows[0].id);

  await connection.query(
    "INSERT INTO products (product_id, code, name, price, currency, base_price) VALUES ('PROD-CI-1', 'WN-DN50', 'Weld neck flange', '0', '', 'US$ 1,250.50')",
  );
  await connection.query(
    "INSERT INTO activities (activity_id, customer_id, type, subject, content, created_at, updated_at) VALUES ('ACT-CI-1', ?, 'call', '需求确认', '需要正式报价', '2026-08-01 09:00:00', '2026-08-01 09:00:00')",
    [customerId],
  );
  await connection.query(
    "INSERT INTO todos (todo_id, customer_id, title, due_at, status, completed_at, created_at, updated_at) VALUES ('TODO-CI-1', ?, '已完成旧待办', '2026-08-02 09:00:00', 'completed', NULL, '2026-08-01 10:00:00', '2026-08-02 10:00:00'), ('TODO-CI-2', ?, '发送报价', '2030-08-12 09:00:00', 'pending', NULL, '2026-08-01 11:00:00', '2026-08-01 11:00:00')",
    [customerId, customerId],
  );
  await connection.query(
    "INSERT INTO opportunities (opportunity_id, customer_id, name, amount, stage, probability) VALUES ('OPP-CI-1', ?, 'CI quotation opportunity', 12800, 'proposal', 60)",
    [customerId],
  );
  await connection.query(
    "INSERT INTO samples (sample_id, customer_id, opportunity_id, product_name, product_id, quantity, unit, status) VALUES ('SAMPLE-CI-1', ?, 'OPP-CI-1', 'Weld neck flange', 'PROD-CI-1', 2, 'pcs', 'shipped')",
    [customerId],
  );
}

async function verifyMigratedData(connection: Connection) {
  const [products] = await connection.query<CheckRow[]>("SELECT price, currency FROM products WHERE product_id = 'PROD-CI-1'");
  assert.equal(Number(products[0].price), 1250.5, '历史产品价格未正确转换');
  assert.equal(products[0].currency, 'USD', '历史产品币种未正确识别');

  const [samples] = await connection.query<CheckRow[]>("SELECT status, sent_at FROM samples WHERE sample_id = 'SAMPLE-CI-1'");
  assert.equal(samples[0].status, 'sent', '历史样品状态未正确转换');
  assert.ok(samples[0].sent_at, '已寄出样品缺少寄出时间');

  const [todos] = await connection.query<CheckRow[]>("SELECT todo_id, status, completed_at FROM todos ORDER BY todo_id");
  assert.deepEqual(todos.map((todo) => todo.status), ['done', 'open'], '历史待办状态未规范化');
  assert.ok(todos[0].completed_at, '已完成待办缺少完成时间');

  const [customers] = await connection.query<CheckRow[]>(
    "SELECT journey_stage, last_activity_type, next_todo_title, health, open_opportunity_count, open_opportunity_value FROM customers WHERE customerId = 'CUST-CI-1'",
  );
  assert.equal(customers[0].journey_stage, 'proposal', '客户阶段未与当前商机同步');
  assert.equal(customers[0].last_activity_type, 'call', '客户最近活动摘要未刷新');
  assert.equal(customers[0].next_todo_title, '发送报价', '客户下一待办摘要未刷新');
  assert.equal(customers[0].health, 'warning', '客户健康状态未刷新');
  assert.equal(Number(customers[0].open_opportunity_count), 1, '客户活跃商机数未刷新');
  assert.equal(Number(customers[0].open_opportunity_value), 12800, '客户活跃商机金额未刷新');
}

async function main() {
  const admin = await mysql.createConnection({ host, port, user, password });
  let fixture: Connection | undefined;
  try {
    await admin.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await createCurrentSchema();
    fixture = await mysql.createConnection({ host, port, user, password, database });
    await seedLegacyFixture(fixture);

    process.env.DB_DATABASE = database;
    process.env.INITIAL_ADMIN_USERNAME = '';
    process.env.INITIAL_ADMIN_PASSWORD = '';
    const { runDatabaseMigrations } = await import('./migrate');
    const first = await runDatabaseMigrations();
    assert.ok(first.p03Report.productPricesRepaired > 0, '迁移没有修复历史产品价格');
    assert.ok(first.p03Report.sampleStatusesRepaired > 0, '迁移没有转换历史样品状态');
    assert.ok(first.p03Report.todoStatusesRepaired > 0, '迁移没有规范历史待办状态');
    await verifyMigratedData(fixture);

    const second = await runDatabaseMigrations();
    for (const [name, count] of Object.entries(second.p03Report)) {
      assert.equal(count, 0, `迁移第二次执行仍产生变更: ${name}=${count}`);
    }
    await verifyMigratedData(fixture);
    console.log(`Database migration check passed: ${database}`);
  } finally {
    if (fixture) await fixture.end();
    await admin.query(`DROP DATABASE IF EXISTS \`${database}\``);
    await admin.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
