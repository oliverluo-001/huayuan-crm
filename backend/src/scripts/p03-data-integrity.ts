import type { Connection, RowDataPacket } from 'mysql2/promise';

export const P03_MIGRATION_ID = '20260809_p03_data_integrity_v1';

export type MigrationConnection = Pick<Connection, 'query'>;

type DatabaseRow = RowDataPacket & Record<string, unknown>;

type ColumnMetadata = {
  columnName: string;
  dataType: string;
  columnType: string;
  isNullable: 'YES' | 'NO';
};

type RelationDefinition = {
  table: string;
  column: string;
  primaryKey: string;
  referencedTable: string;
  referencedColumn: string;
  constraintName: string;
  onDelete: 'CASCADE' | 'SET NULL';
};

export type P03MigrationReport = {
  productPricesRepaired: number;
  sampleStatusesRepaired: number;
  todoStatusesRepaired: number;
  businessIdentifiersRepaired: number;
  orphanedRowsArchived: number;
  orphanedRowsRemoved: number;
  optionalReferencesCleared: number;
  customerSummariesRefreshed: number;
  indexesCreated: number;
  foreignKeysCreated: number;
};

const businessIdentifiers = [
  {
    table: 'customers',
    column: 'customer_id',
    prefix: 'CUST',
    index: 'uq_p03_customers_customer_id',
  },
  {
    table: 'products',
    column: 'product_id',
    prefix: 'PROD',
    index: 'uq_p03_products_product_id',
  },
  {
    table: 'contacts',
    column: 'contact_id',
    prefix: 'CONT',
    index: 'uq_p03_contacts_contact_id',
  },
  {
    table: 'activities',
    column: 'activity_id',
    prefix: 'ACT',
    index: 'uq_p03_activities_activity_id',
  },
  {
    table: 'todos',
    column: 'todo_id',
    prefix: 'TODO',
    index: 'uq_p03_todos_todo_id',
  },
  {
    table: 'opportunities',
    column: 'opportunity_id',
    prefix: 'OPP',
    index: 'uq_p03_opportunities_opportunity_id',
  },
  {
    table: 'quotes',
    column: 'quote_id',
    prefix: 'QUOTE',
    index: 'uq_p03_quotes_quote_id',
  },
  {
    table: 'samples',
    column: 'sample_id',
    prefix: 'SAMPLE',
    index: 'uq_p03_samples_sample_id',
  },
  {
    table: 'email_logs',
    column: 'log_id',
    prefix: 'LOG',
    index: 'uq_p03_email_logs_log_id',
  },
] as const;

const requiredRelations: RelationDefinition[] = [
  relation('contacts', 'customer_id', 'customers', 'id', 'fk_p03_contacts_customer'),
  relation('activities', 'customer_id', 'customers', 'id', 'fk_p03_activities_customer'),
  relation('todos', 'customer_id', 'customers', 'id', 'fk_p03_todos_customer'),
  relation('opportunities', 'customer_id', 'customers', 'id', 'fk_p03_opportunities_customer'),
  relation('quotes', 'customer_id', 'customers', 'id', 'fk_p03_quotes_customer'),
  relation('samples', 'customer_id', 'customers', 'id', 'fk_p03_samples_customer'),
  relation('quote_items', 'quote_id', 'quotes', 'id', 'fk_p03_quote_items_quote'),
  relation('email_task_recipients', 'task_id', 'email_tasks', 'id', 'fk_p03_recipients_task'),
];

const optionalRelations: RelationDefinition[] = [
  relation('quotes', 'opportunity_id', 'opportunities', 'opportunity_id', 'fk_p03_quotes_opportunity', 'SET NULL'),
  relation('samples', 'opportunity_id', 'opportunities', 'opportunity_id', 'fk_p03_samples_opportunity', 'SET NULL'),
  relation('samples', 'product_id', 'products', 'product_id', 'fk_p03_samples_product', 'SET NULL'),
  relation('quote_items', 'product_id', 'products', 'product_id', 'fk_p03_quote_items_product', 'SET NULL'),
  relation('email_task_recipients', 'customer_id', 'customers', 'id', 'fk_p03_recipients_customer', 'SET NULL'),
  relation('email_task_recipients', 'contact_id', 'contacts', 'id', 'fk_p03_recipients_contact', 'SET NULL'),
];

function relation(
  table: string,
  column: string,
  referencedTable: string,
  referencedColumn: string,
  constraintName: string,
  onDelete: 'CASCADE' | 'SET NULL' = 'CASCADE',
): RelationDefinition {
  return {
    table,
    column,
    primaryKey: 'id',
    referencedTable,
    referencedColumn,
    constraintName,
    onDelete,
  };
}

export async function migrateP03DataIntegrity(connection: MigrationConnection, database: string): Promise<P03MigrationReport> {
  const report: P03MigrationReport = {
    productPricesRepaired: 0,
    sampleStatusesRepaired: 0,
    todoStatusesRepaired: 0,
    businessIdentifiersRepaired: 0,
    orphanedRowsArchived: 0,
    orphanedRowsRemoved: 0,
    optionalReferencesCleared: 0,
    customerSummariesRefreshed: 0,
    indexesCreated: 0,
    foreignKeysCreated: 0,
  };

  const lockName = `${database}:${P03_MIGRATION_ID}`.slice(0, 64);
  const [lockRows] = await connection.query('SELECT GET_LOCK(?, 60) AS acquired', [lockName]);
  if (Number((lockRows as DatabaseRow[])[0]?.acquired) !== 1) {
    throw new Error('无法取得 P0.3 数据迁移锁，请稍后重试。');
  }

  try {
    await ensureQuarantineTable(connection);
    await ensureCustomerSummaryColumns(connection, database);

    report.businessIdentifiersRepaired = await repairBusinessIdentifiers(connection, database);
    report.productPricesRepaired = await repairProductPrices(connection, database);
    report.sampleStatusesRepaired = await repairSampleStatuses(connection, database);
    report.todoStatusesRepaired = await repairTodoStatuses(connection, database);

    const requiredCleanup = await cleanupRequiredOrphans(connection, database);
    report.orphanedRowsArchived += requiredCleanup.archived;
    report.orphanedRowsRemoved += requiredCleanup.removed;

    const optionalCleanup = await cleanupOptionalReferences(connection, database);
    report.orphanedRowsArchived += optionalCleanup.archived;
    report.optionalReferencesCleared += optionalCleanup.cleared;

    const joinCleanup = await cleanupCustomerTags(connection, database);
    report.orphanedRowsArchived += joinCleanup.archived;
    report.orphanedRowsRemoved += joinCleanup.removed;

    report.customerSummariesRefreshed = await refreshCustomerSummaries(connection, database);
    report.indexesCreated = await ensureCriticalIndexes(connection, database);
    report.foreignKeysCreated = await ensureCriticalForeignKeys(connection, database);

    await connection.query('INSERT IGNORE INTO schema_migrations (id) VALUES (?)', [P03_MIGRATION_ID]);
    console.log(`P0.3 data integrity migration complete: ${JSON.stringify(report)}`);
    return report;
  } finally {
    await connection.query('SELECT RELEASE_LOCK(?)', [lockName]);
  }
}

export function parseLegacyPrice(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 ? roundMoney(value) : null;
  }
  if (typeof value !== 'string') return null;

  let normalized = value
    .trim()
    .replace(/\s+/g, '')
    .replace(/[^0-9,.-]/g, '');
  if (!normalized || normalized === '-' || normalized.startsWith('-')) return null;

  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (lastComma >= 0) {
    const decimalDigits = normalized.length - lastComma - 1;
    normalized = decimalDigits > 0 && decimalDigits <= 2 ? normalized.replace(/\./g, '').replace(',', '.') : normalized.replace(/,/g, '');
  } else if ((normalized.match(/\./g) || []).length > 1) {
    const decimalDigits = normalized.length - lastDot - 1;
    const parts = normalized.split('.');
    normalized = decimalDigits > 0 && decimalDigits <= 2 ? `${parts.slice(0, -1).join('')}.${parts.at(-1)}` : parts.join('');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed >= 0 ? roundMoney(parsed) : null;
}

export function normalizeSampleStatus(value: unknown, sentAt?: unknown, deliveredAt?: unknown): 'pending' | 'sent' | 'delivered' | 'returned' {
  const key = normalizeStatusKey(value);
  const pending = new Set([
    '',
    'pending',
    'requested',
    'request',
    'draft',
    'created',
    'preparing',
    'processing',
    'ready',
    'new',
    '待处理',
    '待寄出',
    '申请中',
    '已申请',
  ]);
  const sent = new Set(['sent', 'shipped', 'dispatched', 'in_transit', 'sending', '已寄出', '运输中', '已发货']);
  const delivered = new Set(['delivered', 'received', 'arrived', 'completed', 'complete', '已送达', '已签收', '已收到']);
  const returned = new Set(['returned', 'return', 'rejected', 'cancelled', 'canceled', '已退回', '退回', '已取消']);

  if (returned.has(key)) return 'returned';
  if (delivered.has(key) || deliveredAt) return 'delivered';
  if (sent.has(key) || sentAt) return 'sent';
  if (pending.has(key)) return 'pending';
  return deliveredAt ? 'delivered' : sentAt ? 'sent' : 'pending';
}

export function normalizeTodoStatus(value: unknown, completedAt?: unknown): 'open' | 'done' {
  if (completedAt) return 'done';
  const key = normalizeStatusKey(value);
  const done = new Set(['done', 'completed', 'complete', 'closed', 'finished', 'resolved', '1', 'true', '已完成', '已关闭']);
  return done.has(key) ? 'done' : 'open';
}

export async function repairProductPrices(connection: MigrationConnection, database: string) {
  if (!(await tableExists(connection, database, 'products'))) return 0;
  await addColumnIfMissing(connection, database, 'products', 'price', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
  await addColumnIfMissing(connection, database, 'products', 'currency', "VARCHAR(10) NOT NULL DEFAULT 'USD'");

  const columns = await getColumns(connection, database, 'products');
  const legacyNames = ['base_price', 'unit_price', 'sale_price', 'list_price', 'price_usd', 'price_cny'].filter((name) =>
    columns.some((column) => column.columnName === name),
  );
  const priceColumn = columns.find((column) => column.columnName === 'price');
  const selectColumns = ['id', 'price', 'currency', ...legacyNames].map(identifier).join(', ');
  const [rows] = await connection.query(`SELECT ${selectColumns} FROM ${identifier('products')} ORDER BY id`);
  let repaired = 0;

  for (const row of rows as DatabaseRow[]) {
    const currentPrice = parseLegacyPrice(row.price);
    const legacySource = legacyNames
      .map((name) => ({
        name,
        value: row[name],
        price: parseLegacyPrice(row[name]),
      }))
      .find((entry) => entry.price !== null && entry.price > 0);
    const fixedPrice = currentPrice === null || currentPrice === 0 ? (legacySource?.price ?? 0) : currentPrice;
    const currentCurrency = normalizeCurrency(row.currency);
    const fixedCurrency = (legacySource ? detectCurrency(legacySource.value, legacySource.name) : '') || currentCurrency || 'USD';
    const requiresCanonicalWrite = priceColumn?.dataType !== 'decimal';

    if (requiresCanonicalWrite || currentPrice !== fixedPrice || normalizeCurrency(row.currency) !== fixedCurrency) {
      await connection.query('UPDATE products SET price = ?, currency = ? WHERE id = ?', [fixedPrice, fixedCurrency, row.id]);
      repaired += 1;
    }
  }

  if (priceColumn?.dataType !== 'decimal' || priceColumn.isNullable !== 'NO') {
    await connection.query('ALTER TABLE products MODIFY COLUMN price DECIMAL(15,2) NOT NULL DEFAULT 0');
  }
  return repaired;
}

export async function repairSampleStatuses(connection: MigrationConnection, database: string) {
  if (!(await tableExists(connection, database, 'samples'))) return 0;
  const columns = await getColumns(connection, database, 'samples');
  const statusColumn = columns.find((column) => column.columnName === 'status');
  const needsEnumRepair = !hasExactEnum(statusColumn, ['pending', 'sent', 'delivered', 'returned']);
  if (needsEnumRepair) {
    await connection.query("ALTER TABLE samples MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'");
  }

  const [rows] = await connection.query('SELECT id, status, sent_at, delivered_at, created_at, updated_at FROM samples ORDER BY id');
  let repaired = 0;
  for (const row of rows as DatabaseRow[]) {
    const status = normalizeSampleStatus(row.status, row.sent_at, row.delivered_at);
    const fallbackDate = row.updated_at || row.created_at || new Date();
    const sentAt = ['sent', 'delivered'].includes(status) ? row.sent_at || row.created_at || fallbackDate : row.sent_at;
    const deliveredAt = status === 'delivered' ? row.delivered_at || fallbackDate : row.delivered_at;
    if (row.status !== status || row.sent_at !== sentAt || row.delivered_at !== deliveredAt) {
      await connection.query('UPDATE samples SET status = ?, sent_at = ?, delivered_at = ? WHERE id = ?', [
        status,
        sentAt || null,
        deliveredAt || null,
        row.id,
      ]);
      repaired += 1;
    }
  }
  if (needsEnumRepair) {
    await connection.query("ALTER TABLE samples MODIFY COLUMN status ENUM('pending','sent','delivered','returned') NOT NULL DEFAULT 'pending'");
  }
  return repaired;
}

export async function repairTodoStatuses(connection: MigrationConnection, database: string) {
  if (!(await tableExists(connection, database, 'todos'))) return 0;
  const columns = await getColumns(connection, database, 'todos');
  const statusColumn = columns.find((column) => column.columnName === 'status');
  const needsEnumRepair = !hasExactEnum(statusColumn, ['open', 'done']);
  if (needsEnumRepair) {
    await connection.query("ALTER TABLE todos MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'open'");
  }

  const [rows] = await connection.query('SELECT id, status, completed_at, created_at, updated_at FROM todos ORDER BY id');
  let repaired = 0;
  for (const row of rows as DatabaseRow[]) {
    const status = normalizeTodoStatus(row.status, row.completed_at);
    const completedAt = status === 'done' ? row.completed_at || row.updated_at || row.created_at || new Date() : null;
    if (row.status !== status || row.completed_at !== completedAt) {
      await connection.query('UPDATE todos SET status = ?, completed_at = ? WHERE id = ?', [status, completedAt, row.id]);
      repaired += 1;
    }
  }
  if (needsEnumRepair) {
    await connection.query("ALTER TABLE todos MODIFY COLUMN status ENUM('open','done') NOT NULL DEFAULT 'open'");
  }
  return repaired;
}

async function repairBusinessIdentifiers(connection: MigrationConnection, database: string) {
  let repaired = 0;
  for (const definition of businessIdentifiers) {
    if (!(await tableExists(connection, database, definition.table))) continue;
    if (!(await columnExists(connection, database, definition.table, definition.column))) continue;

    const [rows] = await connection.query(`SELECT id, ${identifier(definition.column)} AS business_id FROM ${identifier(definition.table)} ORDER BY id`);
    const seen = new Set<string>();
    for (const row of rows as DatabaseRow[]) {
      const original = String(row.business_id ?? '').trim();
      let value = original;
      if (!value || seen.has(value.toLocaleLowerCase())) {
        value = `${definition.prefix}-MIG-${row.id}`.slice(0, 32);
        let suffix = 1;
        while (seen.has(value.toLocaleLowerCase())) {
          value = `${definition.prefix}-MIG-${row.id}-${suffix++}`.slice(0, 32);
        }
      }
      if (value !== String(row.business_id ?? '')) {
        await connection.query(`UPDATE ${identifier(definition.table)} SET ${identifier(definition.column)} = ? WHERE id = ?`, [value, row.id]);
        repaired += 1;
      }
      seen.add(value.toLocaleLowerCase());
    }
  }
  return repaired;
}

async function cleanupRequiredOrphans(connection: MigrationConnection, database: string) {
  let archived = 0;
  let removed = 0;
  for (const definition of requiredRelations) {
    if (!(await relationTablesAndColumnsExist(connection, database, definition))) continue;
    const [rows] = await connection.query(`
      SELECT child.*
      FROM ${identifier(definition.table)} child
      LEFT JOIN ${identifier(definition.referencedTable)} parent
        ON parent.${identifier(definition.referencedColumn)} = child.${identifier(definition.column)}
      WHERE parent.${identifier(definition.referencedColumn)} IS NULL
    `);
    for (const row of rows as DatabaseRow[]) {
      await archiveRow(connection, definition.table, String(row[definition.primaryKey]), definition.constraintName, row);
      archived += 1;
      const [result] = await connection.query(`DELETE FROM ${identifier(definition.table)} WHERE ${identifier(definition.primaryKey)} = ?`, [
        row[definition.primaryKey],
      ]);
      removed += affectedRows(result);
    }
  }
  return { archived, removed };
}

async function cleanupOptionalReferences(connection: MigrationConnection, database: string) {
  let archived = 0;
  let cleared = 0;
  for (const definition of optionalRelations) {
    if (!(await relationTablesAndColumnsExist(connection, database, definition))) continue;
    await makeOptionalRelationNullable(connection, database, definition);
    await connection.query(
      `UPDATE ${identifier(definition.table)} SET ${identifier(definition.column)} = NULL
       WHERE TRIM(COALESCE(CAST(${identifier(definition.column)} AS CHAR), '')) = ''`,
    );
    const [rows] = await connection.query(`
      SELECT child.*
      FROM ${identifier(definition.table)} child
      LEFT JOIN ${identifier(definition.referencedTable)} parent
        ON parent.${identifier(definition.referencedColumn)} = child.${identifier(definition.column)}
      WHERE child.${identifier(definition.column)} IS NOT NULL
        AND parent.${identifier(definition.referencedColumn)} IS NULL
    `);
    for (const row of rows as DatabaseRow[]) {
      await archiveRow(connection, definition.table, String(row[definition.primaryKey]), definition.constraintName, row);
      archived += 1;
      const [result] = await connection.query(
        `UPDATE ${identifier(definition.table)} SET ${identifier(definition.column)} = NULL WHERE ${identifier(definition.primaryKey)} = ?`,
        [row[definition.primaryKey]],
      );
      cleared += affectedRows(result);
    }
  }
  return { archived, cleared };
}

async function cleanupCustomerTags(connection: MigrationConnection, database: string) {
  if (!(await tableExists(connection, database, 'customer_tags'))) return { archived: 0, removed: 0 };
  if (!(await tableExists(connection, database, 'customers')) || !(await tableExists(connection, database, 'tags'))) {
    return { archived: 0, removed: 0 };
  }
  const [rows] = await connection.query(`
    SELECT link.customer_id, link.tag_id
    FROM customer_tags link
    LEFT JOIN customers customer ON customer.id = link.customer_id
    LEFT JOIN tags tag ON tag.id = link.tag_id
    WHERE customer.id IS NULL OR tag.id IS NULL
  `);
  let archived = 0;
  let removed = 0;
  for (const row of rows as DatabaseRow[]) {
    const sourceKey = `${row.customer_id}:${row.tag_id}`;
    await archiveRow(connection, 'customer_tags', sourceKey, 'fk_p03_customer_tags', row);
    archived += 1;
    const [result] = await connection.query('DELETE FROM customer_tags WHERE customer_id = ? AND tag_id = ?', [row.customer_id, row.tag_id]);
    removed += affectedRows(result);
  }

  const [duplicates] = await connection.query(`
    SELECT customer_id, tag_id, COUNT(*) AS duplicate_count
    FROM customer_tags
    GROUP BY customer_id, tag_id
    HAVING COUNT(*) > 1
  `);
  for (const duplicate of duplicates as DatabaseRow[]) {
    await connection.query('DELETE FROM customer_tags WHERE customer_id = ? AND tag_id = ?', [duplicate.customer_id, duplicate.tag_id]);
    await connection.query('INSERT INTO customer_tags (customer_id, tag_id) VALUES (?, ?)', [duplicate.customer_id, duplicate.tag_id]);
    removed += Number(duplicate.duplicate_count) - 1;
  }
  return { archived, removed };
}

async function refreshCustomerSummaries(connection: MigrationConnection, database: string) {
  if (!(await tableExists(connection, database, 'customers'))) return 0;
  let refreshed = 0;

  if (await tableExists(connection, database, 'activities')) {
    const [result] = await connection.query(`
      UPDATE customers customer
      LEFT JOIN (
        SELECT activity.customer_id, activity.created_at, activity.type
        FROM activities activity
        LEFT JOIN activities newer_activity
          ON newer_activity.customer_id = activity.customer_id
         AND (
           newer_activity.created_at > activity.created_at
           OR (newer_activity.created_at = activity.created_at AND newer_activity.id > activity.id)
         )
        WHERE newer_activity.id IS NULL
      ) latest_activity ON latest_activity.customer_id = customer.id
      SET customer.last_activity_at = latest_activity.created_at,
          customer.last_activity_type = COALESCE(latest_activity.type, '')
      WHERE NOT (customer.last_activity_at <=> latest_activity.created_at)
         OR NOT (customer.last_activity_type <=> COALESCE(latest_activity.type, ''))
    `);
    refreshed += affectedRows(result);
  }

  if (await tableExists(connection, database, 'todos')) {
    const [result] = await connection.query(`
      UPDATE customers customer
      LEFT JOIN (
        SELECT todo.customer_id, todo.title, todo.due_at
        FROM todos todo
        LEFT JOIN todos earlier_todo
          ON earlier_todo.customer_id = todo.customer_id
         AND earlier_todo.status = 'open'
         AND (
           (todo.due_at IS NULL AND earlier_todo.due_at IS NOT NULL)
           OR (earlier_todo.due_at < todo.due_at)
           OR (earlier_todo.due_at <=> todo.due_at) AND earlier_todo.created_at < todo.created_at
           OR (earlier_todo.due_at <=> todo.due_at) AND earlier_todo.created_at = todo.created_at AND earlier_todo.id < todo.id
         )
        WHERE todo.status = 'open' AND earlier_todo.id IS NULL
      ) next_todo ON next_todo.customer_id = customer.id
      LEFT JOIN (
        SELECT customer_id,
               MAX(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS has_open,
               MAX(CASE WHEN status = 'open' AND due_at IS NOT NULL AND due_at < CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS has_overdue
        FROM todos
        GROUP BY customer_id
      ) todo_health ON todo_health.customer_id = customer.id
      SET customer.next_todo_at = next_todo.due_at,
          customer.next_todo_title = COALESCE(next_todo.title, ''),
          customer.health = CASE
            WHEN COALESCE(todo_health.has_overdue, 0) = 1 THEN 'critical'
            WHEN COALESCE(todo_health.has_open, 0) = 1 THEN 'warning'
            ELSE 'good'
          END
      WHERE NOT (customer.next_todo_at <=> next_todo.due_at)
         OR NOT (customer.next_todo_title <=> COALESCE(next_todo.title, ''))
         OR NOT (customer.health <=> CASE
              WHEN COALESCE(todo_health.has_overdue, 0) = 1 THEN 'critical'
              WHEN COALESCE(todo_health.has_open, 0) = 1 THEN 'warning'
              ELSE 'good'
            END)
    `);
    refreshed += affectedRows(result);
  }

  if (await tableExists(connection, database, 'opportunities')) {
    const [result] = await connection.query(`
      UPDATE customers customer
      LEFT JOIN (
        SELECT customer_id, COUNT(*) AS open_count, COALESCE(SUM(amount), 0) AS open_value
        FROM opportunities
        WHERE stage NOT IN ('won', 'lost')
        GROUP BY customer_id
      ) opportunity_summary ON opportunity_summary.customer_id = customer.id
      SET customer.open_opportunity_count = COALESCE(opportunity_summary.open_count, 0),
          customer.open_opportunity_value = COALESCE(opportunity_summary.open_value, 0)
      WHERE NOT (customer.open_opportunity_count <=> COALESCE(opportunity_summary.open_count, 0))
         OR NOT (customer.open_opportunity_value <=> COALESCE(opportunity_summary.open_value, 0))
    `);
    refreshed += affectedRows(result);
  }
  return refreshed;
}

async function ensureCustomerSummaryColumns(connection: MigrationConnection, database: string) {
  if (!(await tableExists(connection, database, 'customers'))) return;
  await addColumnIfMissing(connection, database, 'customers', 'health', "VARCHAR(10) NOT NULL DEFAULT ''");
  await addColumnIfMissing(connection, database, 'customers', 'last_activity_at', 'TIMESTAMP NULL');
  await addColumnIfMissing(connection, database, 'customers', 'last_activity_type', "VARCHAR(50) NOT NULL DEFAULT ''");
  await addColumnIfMissing(connection, database, 'customers', 'next_todo_at', 'TIMESTAMP NULL');
  await addColumnIfMissing(connection, database, 'customers', 'next_todo_title', "VARCHAR(255) NOT NULL DEFAULT ''");
  await addColumnIfMissing(connection, database, 'customers', 'open_opportunity_count', 'INT NOT NULL DEFAULT 0');
  await addColumnIfMissing(connection, database, 'customers', 'open_opportunity_value', 'DECIMAL(15,2) NOT NULL DEFAULT 0');
}

async function ensureCriticalIndexes(connection: MigrationConnection, database: string) {
  let created = 0;
  for (const definition of businessIdentifiers) {
    if (!(await tableExists(connection, database, definition.table))) continue;
    if (!(await columnExists(connection, database, definition.table, definition.column))) continue;
    created += Number(await ensureIndex(connection, database, definition.table, definition.index, [definition.column], true));
  }

  for (const definition of [...requiredRelations, ...optionalRelations]) {
    if (!(await relationTablesAndColumnsExist(connection, database, definition))) continue;
    const indexName = `idx_p03_${definition.table}_${definition.column}`.slice(0, 64);
    created += Number(await ensureIndex(connection, database, definition.table, indexName, [definition.column], false));
  }

  if (await tableExists(connection, database, 'customer_tags')) {
    created += Number(await ensureIndex(connection, database, 'customer_tags', 'uq_p03_customer_tags', ['customer_id', 'tag_id'], true));
  }
  if (await tableExists(connection, database, 'email_task_recipients')) {
    created += Number(await ensureIndex(connection, database, 'email_task_recipients', 'uq_p03_task_recipient', ['task_id', 'recipient_key'], true));
  }
  return created;
}

async function ensureCriticalForeignKeys(connection: MigrationConnection, database: string) {
  let created = 0;
  for (const definition of [...requiredRelations, ...optionalRelations]) {
    if (!(await relationTablesAndColumnsExist(connection, database, definition))) continue;
    created += Number(await ensureForeignKey(connection, database, definition));
  }
  if (await tableExists(connection, database, 'customer_tags')) {
    const customerRelation: RelationDefinition = {
      ...relation('customer_tags', 'customer_id', 'customers', 'id', 'fk_p03_customer_tags_customer'),
      primaryKey: 'customer_id',
    };
    const tagRelation: RelationDefinition = {
      ...relation('customer_tags', 'tag_id', 'tags', 'id', 'fk_p03_customer_tags_tag'),
      primaryKey: 'tag_id',
    };
    if (await relationTablesAndColumnsExist(connection, database, customerRelation)) {
      created += Number(await ensureForeignKey(connection, database, customerRelation));
    }
    if (await relationTablesAndColumnsExist(connection, database, tagRelation)) {
      created += Number(await ensureForeignKey(connection, database, tagRelation));
    }
  }
  return created;
}

export async function ensureIndex(connection: MigrationConnection, database: string, table: string, indexName: string, columns: string[], unique: boolean) {
  const [rows] = await connection.query(
    `
    SELECT INDEX_NAME AS indexName, NON_UNIQUE AS nonUnique,
           GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columnsList
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
    GROUP BY INDEX_NAME, NON_UNIQUE
  `,
    [database, table],
  );
  const expected = columns.join(',');
  const exists = (rows as DatabaseRow[]).some((row) => String(row.columnsList) === expected && (!unique || Number(row.nonUnique) === 0));
  if (exists) return false;
  await connection.query(
    `ALTER TABLE ${identifier(table)} ADD ${unique ? 'UNIQUE ' : ''}INDEX ${identifier(indexName)} (${columns.map(identifier).join(', ')})`,
  );
  return true;
}

export async function ensureForeignKey(connection: MigrationConnection, database: string, definition: RelationDefinition) {
  const [rows] = await connection.query(
    `
    SELECT kcu.CONSTRAINT_NAME AS constraintName, rc.DELETE_RULE AS deleteRule
    FROM information_schema.KEY_COLUMN_USAGE kcu
    JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
      ON rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
     AND rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     AND rc.TABLE_NAME = kcu.TABLE_NAME
    WHERE kcu.TABLE_SCHEMA = ? AND kcu.TABLE_NAME = ?
      AND kcu.COLUMN_NAME = ? AND kcu.REFERENCED_TABLE_NAME = ?
      AND kcu.REFERENCED_COLUMN_NAME = ?
  `,
    [database, definition.table, definition.column, definition.referencedTable, definition.referencedColumn],
  );
  const existing = (rows as DatabaseRow[])[0];
  if (existing && String(existing.deleteRule).toUpperCase() === definition.onDelete) return false;
  if (existing) {
    await connection.query(`ALTER TABLE ${identifier(definition.table)} DROP FOREIGN KEY ${identifier(String(existing.constraintName))}`);
  }
  await connection.query(`
    ALTER TABLE ${identifier(definition.table)}
    ADD CONSTRAINT ${identifier(definition.constraintName)}
    FOREIGN KEY (${identifier(definition.column)})
    REFERENCES ${identifier(definition.referencedTable)} (${identifier(definition.referencedColumn)})
    ON DELETE ${definition.onDelete}
  `);
  return true;
}

async function makeOptionalRelationNullable(connection: MigrationConnection, database: string, definition: RelationDefinition) {
  const columns = await getColumns(connection, database, definition.table);
  const column = columns.find((entry) => entry.columnName === definition.column);
  if (!column || column.isNullable === 'YES') return;
  await connection.query(`ALTER TABLE ${identifier(definition.table)} MODIFY COLUMN ${identifier(definition.column)} ${column.columnType} NULL DEFAULT NULL`);
}

async function ensureQuarantineTable(connection: MigrationConnection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS migration_orphan_records (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      migration_id VARCHAR(160) NOT NULL,
      source_table VARCHAR(80) NOT NULL,
      source_key VARCHAR(160) NOT NULL,
      relation_name VARCHAR(160) NOT NULL,
      payload_json LONGTEXT NOT NULL,
      archived_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      UNIQUE KEY uq_migration_orphan_record (migration_id, source_table, source_key, relation_name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function archiveRow(connection: MigrationConnection, sourceTable: string, sourceKey: string, relationName: string, row: DatabaseRow) {
  const payload = JSON.stringify(row, (_key, value) => (typeof value === 'bigint' ? String(value) : value));
  await connection.query(
    `
    INSERT IGNORE INTO migration_orphan_records
      (migration_id, source_table, source_key, relation_name, payload_json)
    VALUES (?, ?, ?, ?, ?)
  `,
    [P03_MIGRATION_ID, sourceTable, sourceKey, relationName, payload],
  );
}

async function addColumnIfMissing(connection: MigrationConnection, database: string, table: string, column: string, definition: string) {
  if (!(await columnExists(connection, database, table, column))) {
    await connection.query(`ALTER TABLE ${identifier(table)} ADD COLUMN ${identifier(column)} ${definition}`);
  }
}

async function relationTablesAndColumnsExist(connection: MigrationConnection, database: string, definition: RelationDefinition) {
  return (
    (await tableExists(connection, database, definition.table)) &&
    (await tableExists(connection, database, definition.referencedTable)) &&
    (await columnExists(connection, database, definition.table, definition.column)) &&
    (await columnExists(connection, database, definition.referencedTable, definition.referencedColumn))
  );
}

async function tableExists(connection: MigrationConnection, database: string, table: string) {
  const [rows] = await connection.query(
    `
    SELECT TABLE_NAME FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  `,
    [database, table],
  );
  return (rows as DatabaseRow[]).length > 0;
}

async function columnExists(connection: MigrationConnection, database: string, table: string, column: string) {
  const columns = await getColumns(connection, database, table);
  return columns.some((entry) => entry.columnName === column);
}

async function getColumns(connection: MigrationConnection, database: string, table: string): Promise<ColumnMetadata[]> {
  const [rows] = await connection.query(
    `
    SELECT COLUMN_NAME AS columnName, DATA_TYPE AS dataType,
           COLUMN_TYPE AS columnType, IS_NULLABLE AS isNullable
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
  `,
    [database, table],
  );
  return rows as ColumnMetadata[];
}

function hasExactEnum(column: ColumnMetadata | undefined, expected: string[]) {
  if (!column || column.dataType !== 'enum') return false;
  const values = [...column.columnType.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  return values.length === expected.length && values.every((value, index) => value === expected[index]);
}

function normalizeStatusKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s-]+/g, '_');
}

function normalizeCurrency(value: unknown) {
  const currency = String(value ?? '')
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : '';
}

function detectCurrency(value: unknown, column = '') {
  const source = `${String(value ?? '')} ${column}`.toUpperCase();
  if (/EUR|€/.test(source)) return 'EUR';
  if (/GBP|£/.test(source)) return 'GBP';
  if (/CNY|RMB|CN¥/.test(source) || column === 'price_cny') return 'CNY';
  if (/USD|US\$|\$/.test(source) || column === 'price_usd') return 'USD';
  return '';
}

function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function affectedRows(result: unknown) {
  return Number((result as { affectedRows?: number })?.affectedRows || 0);
}

function identifier(value: string) {
  if (!/^[a-zA-Z0-9_]+$/.test(value)) throw new Error(`非法数据库标识符: ${value}`);
  return `\`${value}\``;
}
