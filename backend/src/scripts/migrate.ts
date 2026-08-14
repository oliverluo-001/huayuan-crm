import "dotenv/config";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import * as bcrypt from "bcrypt";
import { migrateP03DataIntegrity } from "./p03-data-integrity";

const migrationId = "20260730_online_accounts";
const database = process.env.DB_DATABASE || "international_trade_crm";

export async function runDatabaseMigrations() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USERNAME || "root",
    password: process.env.DB_PASSWORD || "",
    database,
    ssl: process.env.DB_SSL === "true" ? {} : undefined,
  });
  try {
    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(160) NOT NULL PRIMARY KEY,
        applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    const [applied] = await connection.query<RowDataPacket[]>(
      "SELECT id FROM schema_migrations WHERE id = ? LIMIT 1",
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
      throw new Error(
        "users 表不存在。请先完成基础数据库初始化，再执行增量迁移。",
      );
    }

    if (!applied.length) {
      await connection.beginTransaction();
      try {
        await normalizeLegacyUserEmails(connection);
        await addColumn(
          connection,
          "status",
          "VARCHAR(20) NOT NULL DEFAULT 'active'",
        );
        await addColumn(connection, "active", "TINYINT(1) NOT NULL DEFAULT 1");
        await addColumn(
          connection,
          "registration_source",
          "VARCHAR(20) NOT NULL DEFAULT 'admin'",
        );
        await addColumn(
          connection,
          "token_version",
          "INT UNSIGNED NOT NULL DEFAULT 0",
        );
        await addColumn(
          connection,
          "failed_login_attempts",
          "INT UNSIGNED NOT NULL DEFAULT 0",
        );
        await addColumn(connection, "locked_until", "DATETIME NULL");
        await addColumn(connection, "last_login_at", "DATETIME NULL");
        await addColumn(connection, "approved_at", "DATETIME NULL");
        await addColumn(connection, "approved_by", "INT NULL");
        await connection.query(`
          UPDATE users
          SET status = 'active',
              active = 1,
              registration_source = CASE WHEN role = 'admin' THEN 'setup' ELSE 'admin' END,
              approved_at = COALESCE(approved_at, created_at)
        `);
        if (!(await indexExists(connection, "idx_users_status"))) {
          await connection.query(
            "ALTER TABLE users ADD KEY idx_users_status (status, active)",
          );
        }
        await connection.query(
          "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
          [migrationId],
        );
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
    await migrateCustomer360Workspace(connection);
    await migrateCustomerMasterData(connection);
    await migrateSalesDataOwnership(connection);
    await migrateCustomerDuplicateManagement(connection);
    const p03Report = await migrateP03DataIntegrity(connection, database);
    await migrateOpportunityLifecycle(connection);
    await migrateOpportunityManagement(connection);
    await connection.beginTransaction();
    try {
      await ensureInitialAdmin(connection);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    await migrateP1AcceptanceHardening(connection);
    await migrateP21ProductCatalog(connection);
    await migrateP22QuoteEditor(connection);
    await migrateEmailDeliveryMonitoring(connection);
    return { p03Report };
  } finally {
    await connection.end();
  }
}

async function migrateAuditMetadata(connection: Connection) {
  const id = "20260801_audit_metadata";
  if (!(await tableExists(connection, "audit_logs"))) return;
  await addColumnToTable(
    connection,
    "audit_logs",
    "user_id",
    "VARCHAR(32) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "audit_logs",
    "method",
    "VARCHAR(10) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "audit_logs",
    "path",
    "VARCHAR(500) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "audit_logs",
    "ip",
    "VARCHAR(64) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "audit_logs",
    "status",
    "VARCHAR(20) NOT NULL DEFAULT 'success'",
  );
  await addColumnToTable(
    connection,
    "audit_logs",
    "duration_ms",
    "INT NOT NULL DEFAULT 0",
  );
  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

async function migrateCrmContracts(connection: Connection) {
  const id = "20260808_crm_contracts";
  if (!(await tableExists(connection, "quotes"))) return;
  await addColumnToTable(
    connection,
    "quotes",
    "freight",
    "DECIMAL(15,2) NOT NULL DEFAULT 0",
  );
  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

async function migrateCustomer360Workspace(connection: Connection) {
  const id = "20260809_customer_360_workspace";
  if (!(await tableExists(connection, "customers"))) return;

  if (await tableExists(connection, "activities")) {
    await connection.query(`
      ALTER TABLE activities
      MODIFY COLUMN type ENUM('email','call','meeting','whatsapp','note','other') NOT NULL DEFAULT 'note'
    `);
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS customer_attachments (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      attachment_id VARCHAR(32) NOT NULL,
      customer_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(96) NOT NULL,
      mime_type VARCHAR(160) NOT NULL DEFAULT 'application/octet-stream',
      size INT UNSIGNED NOT NULL,
      category ENUM('inquiry','drawing','contract','other') NOT NULL DEFAULT 'other',
      note TEXT NULL,
      created_by VARCHAR(32) NOT NULL DEFAULT '',
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_customer_attachments_attachment_id (attachment_id),
      UNIQUE KEY uq_customer_attachments_stored_name (stored_name),
      KEY idx_customer_attachments_customer (customer_id, created_at),
      CONSTRAINT fk_customer_attachments_customer
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

export async function migrateCustomerMasterData(connection: Connection) {
  const id = "20260809_p12_customer_master_data";
  if (!(await tableExists(connection, "customers"))) return;

  await addColumnToTable(connection, "customers", "address", "TEXT NULL");
  await addColumnToTable(connection, "customers", "main_markets", "JSON NULL");
  await addColumnToTable(
    connection,
    "customers",
    "annual_purchase_amount",
    "DECIMAL(15,2) NOT NULL DEFAULT 0",
  );
  await addColumnToTable(
    connection,
    "customers",
    "preferred_currency",
    "VARCHAR(3) NOT NULL DEFAULT 'USD'",
  );
  await addColumnToTable(
    connection,
    "customers",
    "preferred_incoterm",
    "VARCHAR(20) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "customers",
    "collaborator_ids",
    "JSON NULL",
  );

  if (await tableExists(connection, "contacts")) {
    await addColumnToTable(
      connection,
      "contacts",
      "department",
      "VARCHAR(100) NOT NULL DEFAULT ''",
    );
    await addColumnToTable(
      connection,
      "contacts",
      "decision_role",
      "VARCHAR(30) NOT NULL DEFAULT ''",
    );
    await addColumnToTable(
      connection,
      "contacts",
      "purchasing_influence",
      "VARCHAR(20) NOT NULL DEFAULT ''",
    );
    await addColumnToTable(
      connection,
      "contacts",
      "preferred_language",
      "VARCHAR(50) NOT NULL DEFAULT ''",
    );
    await addColumnToTable(
      connection,
      "contacts",
      "whatsapp",
      "VARCHAR(100) NOT NULL DEFAULT ''",
    );
    await addColumnToTable(
      connection,
      "contacts",
      "linkedin",
      "VARCHAR(500) NOT NULL DEFAULT ''",
    );
    await addColumnToTable(
      connection,
      "contacts",
      "contact_status",
      "VARCHAR(20) NOT NULL DEFAULT 'unknown'",
    );
    await addColumnToTable(
      connection,
      "contacts",
      "marketing_allowed",
      "TINYINT(1) NOT NULL DEFAULT 1",
    );
  }

  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

export async function migrateSalesDataOwnership(connection: Connection) {
  const id = "20260809_sales_data_ownership";
  if (await tableExists(connection, "email_templates")) {
    await addColumnToTable(
      connection,
      "email_templates",
      "owner_id",
      "VARCHAR(32) NOT NULL DEFAULT ''",
    );
    await addIndexIfMissing(
      connection,
      "email_templates",
      "idx_email_templates_owner",
      "owner_id",
    );
  }
  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

export async function migrateCustomerDuplicateManagement(
  connection: Connection,
) {
  const id = "20260810_customer_duplicate_management";
  if (await tableExists(connection, "customers")) {
    await addColumnToTable(
      connection,
      "customers",
      "source_history",
      "JSON NULL",
    );
    await addColumnToTable(
      connection,
      "customers",
      "merged_into_id",
      "INT NULL",
    );
    await addColumnToTable(
      connection,
      "customers",
      "merged_at",
      "DATETIME NULL",
    );
    await addIndexIfMissing(
      connection,
      "customers",
      "idx_customers_merged_into",
      "merged_into_id",
    );
  }
  await connection.query(`
    CREATE TABLE IF NOT EXISTS customer_merge_history (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      merge_id VARCHAR(40) NOT NULL,
      primary_customer_id INT NOT NULL,
      primary_customer_key VARCHAR(32) NOT NULL,
      merged_customer_ids JSON NOT NULL,
      merged_customer_keys JSON NOT NULL,
      source_snapshots JSON NOT NULL,
      primary_snapshot_before JSON NOT NULL,
      primary_snapshot_after JSON NOT NULL,
      detection_reasons JSON NOT NULL,
      field_selections JSON NOT NULL,
      primary_contact_selection VARCHAR(64) NOT NULL DEFAULT '',
      moved_relations JSON NOT NULL,
      performed_by_id VARCHAR(32) NOT NULL DEFAULT '',
      performed_by_name VARCHAR(100) NOT NULL DEFAULT '',
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_customer_merge_history_merge_id (merge_id),
      KEY idx_customer_merge_history_primary (primary_customer_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await addColumnToTable(
    connection,
    "customer_merge_history",
    "primary_contact_selection",
    "VARCHAR(64) NOT NULL DEFAULT ''",
  );
  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

async function migrateOpportunityLifecycle(connection: Connection) {
  const id = "20260808_opportunity_lifecycle_sync";
  if (
    !(await tableExists(connection, "customers")) ||
    !(await tableExists(connection, "opportunities"))
  )
    return;

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

  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

export async function migrateOpportunityManagement(connection: Connection) {
  const id = "20260811_opportunity_management";
  if (!(await tableExists(connection, "opportunities"))) return;

  await addColumnToTable(
    connection,
    "opportunities",
    "owner_id",
    "VARCHAR(32) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "collaborator_ids",
    "JSON NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "product_name",
    "VARCHAR(255) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "product_specification",
    "TEXT NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "expected_quantity",
    "DECIMAL(15,3) NOT NULL DEFAULT 0",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "quantity_unit",
    "VARCHAR(30) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "target_price",
    "DECIMAL(15,2) NOT NULL DEFAULT 0",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "currency",
    "VARCHAR(3) NOT NULL DEFAULT 'USD'",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "budget",
    "DECIMAL(15,2) NOT NULL DEFAULT 0",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "purchase_time",
    "VARCHAR(100) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "decision_process",
    "TEXT NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "next_step_action",
    "TEXT NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "next_step_due_date",
    "DATE NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "forecast_category",
    "ENUM('pipeline','best_case','commit','closed','omitted') NOT NULL DEFAULT 'pipeline'",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "win_reason",
    "TEXT NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "loss_reason",
    "TEXT NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "competitors",
    "TEXT NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "stage_entered_at",
    "DATETIME(6) NULL",
  );
  await addColumnToTable(
    connection,
    "opportunities",
    "closed_at",
    "DATETIME(6) NULL",
  );

  await connection.query(`
    UPDATE opportunities o
    JOIN customers c ON c.id = o.customer_id
    SET o.owner_id = CASE WHEN o.owner_id = '' THEN c.owner_id ELSE o.owner_id END,
        o.collaborator_ids = COALESCE(o.collaborator_ids, c.collaborator_ids),
        o.currency = CASE WHEN o.currency = '' THEN COALESCE(NULLIF(c.preferred_currency, ''), 'USD') ELSE o.currency END,
        o.stage_entered_at = COALESCE(o.stage_entered_at, o.updated_at, o.created_at),
        o.closed_at = CASE
          WHEN o.stage IN ('won', 'lost') THEN COALESCE(o.closed_at, o.updated_at, o.created_at)
          ELSE NULL
        END,
        o.forecast_category = CASE
          WHEN o.stage IN ('won', 'lost') THEN 'closed'
          WHEN o.forecast_category = 'closed' THEN 'pipeline'
          ELSE o.forecast_category
        END
  `);

  await addIndexIfMissing(
    connection,
    "opportunities",
    "idx_opportunities_owner",
    "owner_id",
  );
  await addIndexIfMissing(
    connection,
    "opportunities",
    "idx_opportunities_forecast",
    "forecast_category",
  );
  await addIndexIfMissing(
    connection,
    "opportunities",
    "idx_opportunities_stage_entered",
    "stage_entered_at",
  );

  await connection.query(`
    CREATE TABLE IF NOT EXISTS opportunity_stage_history (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      opportunity_id INT NOT NULL,
      opportunity_key VARCHAR(32) NOT NULL,
      from_stage VARCHAR(20) NULL,
      to_stage VARCHAR(20) NOT NULL,
      duration_hours INT UNSIGNED NOT NULL DEFAULT 0,
      changed_by_id VARCHAR(32) NOT NULL DEFAULT '',
      changed_by_name VARCHAR(100) NOT NULL DEFAULT '',
      change_note TEXT NULL,
      changed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      KEY idx_opportunity_stage_history_opportunity (opportunity_id, changed_at),
      CONSTRAINT fk_opportunity_stage_history_opportunity
        FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await connection.query(`
    INSERT INTO opportunity_stage_history (
      opportunity_id, opportunity_key, from_stage, to_stage, duration_hours,
      changed_by_id, changed_by_name, change_note, changed_at
    )
    SELECT o.id, o.opportunity_id, NULL, o.stage, 0, '', '历史数据迁移',
           'P1.4 初始化阶段记录', COALESCE(o.stage_entered_at, o.created_at)
    FROM opportunities o
    WHERE NOT EXISTS (
      SELECT 1 FROM opportunity_stage_history h WHERE h.opportunity_id = o.id
    )
  `);

  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

export async function migrateP1AcceptanceHardening(connection: Connection) {
  const id = "20260811_p1_acceptance_hardening";
  if (
    !(await tableExists(connection, "opportunities")) ||
    !(await tableExists(connection, "customers"))
  ) {
    return;
  }

  await addColumnToTable(
    connection,
    "opportunities",
    "expected_close_date",
    "DATE NULL",
  );

  const adminOwner = (await tableExists(connection, "users"))
    ? `(SELECT CAST(u.id AS CHAR) FROM users u
        WHERE u.role = 'admin' AND u.status = 'active' AND u.active = 1
        ORDER BY u.id LIMIT 1)`
    : "NULL";

  await connection.query(`
    UPDATE opportunities o
    JOIN customers c ON c.id = o.customer_id
    SET o.owner_id = COALESCE(NULLIF(o.owner_id, ''), NULLIF(c.owner_id, ''), ${adminOwner}, ''),
        o.next_step_action = CASE
          WHEN o.stage NOT IN ('won', 'lost') AND TRIM(COALESCE(o.next_step_action, '')) = ''
            THEN '联系客户并确认下一步安排'
          ELSE o.next_step_action
        END,
        o.next_step_due_date = CASE
          WHEN o.stage NOT IN ('won', 'lost') AND o.next_step_due_date IS NULL
            THEN DATE_ADD(CURDATE(), INTERVAL 7 DAY)
          ELSE o.next_step_due_date
        END,
        o.expected_close_date = CASE
          WHEN o.expected_close_date IS NOT NULL THEN o.expected_close_date
          WHEN o.stage IN ('won', 'lost')
            THEN DATE(COALESCE(o.closed_at, o.updated_at, o.created_at, NOW()))
          ELSE DATE_ADD(CURDATE(), INTERVAL 90 DAY)
        END
  `);

  await connection.query(`
    UPDATE customers c
    JOIN opportunities o ON o.id = (
      SELECT o2.id
      FROM opportunities o2
      WHERE o2.customer_id = c.id AND o2.stage NOT IN ('won', 'lost')
      ORDER BY o2.updated_at DESC, o2.id DESC
      LIMIT 1
    )
    SET c.owner_id = COALESCE(NULLIF(c.owner_id, ''), NULLIF(o.owner_id, ''), ${adminOwner}, ''),
        c.next_todo_title = CASE
          WHEN TRIM(COALESCE(c.next_todo_title, '')) = '' THEN o.next_step_action
          ELSE c.next_todo_title
        END,
        c.next_todo_at = COALESCE(c.next_todo_at, o.next_step_due_date)
  `);

  await connection.query(
    "ALTER TABLE opportunities MODIFY COLUMN expected_close_date DATE NOT NULL",
  );
  await addIndexIfMissing(
    connection,
    "opportunities",
    "idx_opportunities_expected_close",
    "expected_close_date",
  );
  await addIndexIfMissing(
    connection,
    "opportunities",
    "idx_opportunities_next_step_due",
    "next_step_due_date",
  );
  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
}

export async function migrateP21ProductCatalog(connection: Connection) {
  const id = "20260812_p21_product_catalog";
  if (!(await tableExists(connection, "products"))) return;

  await addColumnToTable(connection, "products", "sku", "VARCHAR(100) NULL");
  await addColumnToTable(connection, "products", "product_type", "VARCHAR(32) NOT NULL DEFAULT 'general'");
  await addColumnToTable(connection, "products", "weight", "DECIMAL(12,3) NOT NULL DEFAULT 0");
  await addColumnToTable(connection, "products", "weight_unit", "VARCHAR(20) NOT NULL DEFAULT 'kg'");
  await addColumnToTable(connection, "products", "packaging", "VARCHAR(255) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, "products", "package_quantity", "DECIMAL(12,2) NOT NULL DEFAULT 0");
  await addColumnToTable(connection, "products", "base_cost", "DECIMAL(15,2) NOT NULL DEFAULT 0");
  await addColumnToTable(connection, "products", "cost_currency", "VARCHAR(10) NOT NULL DEFAULT 'USD'");
  await addColumnToTable(connection, "products", "prices", "JSON NULL");
  await addColumnToTable(connection, "products", "standards", "JSON NULL");
  await addColumnToTable(connection, "products", "materials", "JSON NULL");
  await addColumnToTable(connection, "products", "specifications", "JSON NULL");
  await addColumnToTable(connection, "products", "description_templates", "JSON NULL");
  await addColumnToTable(connection, "products", "active", "TINYINT(1) NOT NULL DEFAULT 1");

  await connection.query(`
    UPDATE products
    SET sku = CASE
          WHEN TRIM(COALESCE(sku, '')) <> '' THEN UPPER(TRIM(sku))
          WHEN TRIM(COALESCE(code, '')) <> '' THEN UPPER(TRIM(code))
          ELSE UPPER(product_id)
        END,
        currency = UPPER(COALESCE(NULLIF(TRIM(currency), ''), 'USD')),
        cost_currency = UPPER(COALESCE(NULLIF(TRIM(cost_currency), ''), NULLIF(TRIM(currency), ''), 'USD')),
        prices = COALESCE(prices, JSON_ARRAY(JSON_OBJECT(
          'currency', UPPER(COALESCE(NULLIF(TRIM(currency), ''), 'USD')),
          'referencePrice', CAST(COALESCE(price, 0) AS DECIMAL(15,2))
        ))),
        standards = COALESCE(standards, JSON_ARRAY()),
        materials = COALESCE(materials, JSON_ARRAY()),
        specifications = COALESCE(specifications, JSON_ARRAY()),
        description_templates = COALESCE(description_templates, JSON_ARRAY())
  `);
  await connection.query(`
    UPDATE products p
    JOIN (
      SELECT sku FROM products GROUP BY sku HAVING COUNT(*) > 1
    ) duplicate_sku ON duplicate_sku.sku = p.sku
    SET p.sku = CONCAT(LEFT(p.sku, 80), '-', p.id)
  `);
  await connection.query("ALTER TABLE products MODIFY COLUMN sku VARCHAR(100) NOT NULL");
  await addIndexIfMissing(connection, "products", "uq_products_sku", "sku", true);
  await addIndexIfMissing(connection, "products", "idx_products_category_active", "category, active");

  await connection.query(`
    CREATE TABLE IF NOT EXISTS product_variants (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      variant_id VARCHAR(32) NOT NULL,
      product_pk INT NOT NULL,
      sku VARCHAR(100) NOT NULL,
      name VARCHAR(255) NOT NULL DEFAULT '',
      standard VARCHAR(80) NOT NULL DEFAULT '',
      material VARCHAR(120) NOT NULL DEFAULT '',
      pressure_rating VARCHAR(80) NOT NULL DEFAULT '',
      nominal_size VARCHAR(80) NOT NULL DEFAULT '',
      facing VARCHAR(80) NOT NULL DEFAULT '',
      surface_treatment VARCHAR(160) NOT NULL DEFAULT '',
      unit VARCHAR(20) NOT NULL DEFAULT 'pcs',
      weight DECIMAL(12,3) NOT NULL DEFAULT 0,
      weight_unit VARCHAR(20) NOT NULL DEFAULT 'kg',
      packaging VARCHAR(255) NOT NULL DEFAULT '',
      package_quantity DECIMAL(12,2) NOT NULL DEFAULT 0,
      base_cost DECIMAL(15,2) NOT NULL DEFAULT 0,
      cost_currency VARCHAR(10) NOT NULL DEFAULT 'USD',
      prices JSON NULL,
      specifications JSON NULL,
      inspection_requirements TEXT NULL,
      certificate_requirements TEXT NULL,
      quote_description TEXT NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_product_variants_variant_id (variant_id),
      UNIQUE KEY uq_product_variants_sku (sku),
      KEY idx_product_variants_product_active (product_pk, active),
      CONSTRAINT fk_product_variants_product FOREIGN KEY (product_pk) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  await connection.query(`
    CREATE TABLE IF NOT EXISTS product_assets (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      asset_id VARCHAR(32) NOT NULL,
      product_pk INT NOT NULL,
      asset_type ENUM('image','technical') NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      mime_type VARCHAR(160) NOT NULL DEFAULT 'application/octet-stream',
      size INT UNSIGNED NOT NULL,
      note VARCHAR(1000) NULL,
      created_by VARCHAR(32) NOT NULL DEFAULT '',
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_product_assets_asset_id (asset_id),
      UNIQUE KEY uq_product_assets_stored_name (stored_name),
      KEY idx_product_assets_product (product_pk, created_at),
      CONSTRAINT fk_product_assets_product FOREIGN KEY (product_pk) REFERENCES products(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  if (await tableExists(connection, "quote_items")) {
    await addColumnToTable(connection, "quote_items", "variant_id", "VARCHAR(32) NULL");
    await addColumnToTable(connection, "quote_items", "sku", "VARCHAR(100) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "quote_items", "standard", "VARCHAR(80) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "quote_items", "material", "VARCHAR(120) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "quote_items", "pressure_rating", "VARCHAR(80) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "quote_items", "nominal_size", "VARCHAR(80) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "quote_items", "facing", "VARCHAR(80) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "quote_items", "surface_treatment", "VARCHAR(160) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "quote_items", "weight", "DECIMAL(12,3) NOT NULL DEFAULT 0");
    await addColumnToTable(connection, "quote_items", "weight_unit", "VARCHAR(20) NOT NULL DEFAULT 'kg'");
    await addColumnToTable(connection, "quote_items", "packaging", "VARCHAR(255) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "quote_items", "inspection_requirements", "TEXT NULL");
    await addColumnToTable(connection, "quote_items", "certificate_requirements", "TEXT NULL");
  }

  await connection.query("INSERT IGNORE INTO schema_migrations (id) VALUES (?)", [id]);
  console.log(`Applied migration: ${id}`);
}

export async function migrateP22QuoteEditor(connection: Connection) {
  const id = "20260814_p22_quote_editor";
  if (!(await tableExists(connection, "quotes"))) return;

  await connection.query(`
    CREATE TABLE IF NOT EXISTS quote_term_templates (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      content_zh TEXT NULL,
      content_en TEXT NULL,
      is_default TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
      updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
      UNIQUE KEY uq_quote_term_templates_name (name),
      KEY idx_quote_term_templates_default (is_default, name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await addColumnToTable(connection, "quotes", "base_currency", "VARCHAR(10) NOT NULL DEFAULT 'CNY'");
  await addColumnToTable(connection, "quotes", "exchange_rate", "DECIMAL(18,6) NOT NULL DEFAULT 1");
  await addColumnToTable(connection, "quotes", "additional_charges", "JSON NULL");
  await addColumnToTable(connection, "quotes", "additional_fee_total", "DECIMAL(15,2) NOT NULL DEFAULT 0");
  await addColumnToTable(connection, "quotes", "incoterm", "VARCHAR(20) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, "quotes", "origin_port", "VARCHAR(120) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, "quotes", "destination_port", "VARCHAR(120) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, "quotes", "delivery_time", "VARCHAR(255) NOT NULL DEFAULT ''");
  await addColumnToTable(connection, "quotes", "payment_terms", "TEXT NULL");
  await addColumnToTable(connection, "quotes", "packaging_terms", "TEXT NULL");
  await addColumnToTable(connection, "quotes", "warranty_terms", "TEXT NULL");
  await addColumnToTable(connection, "quotes", "notes_en", "TEXT NULL");
  await addColumnToTable(connection, "quotes", "terms_en", "TEXT NULL");
  await addColumnToTable(connection, "quotes", "term_template_id", "INT NULL");
  await addIndexIfMissing(connection, "quotes", "idx_quotes_term_template", "term_template_id");

  await connection.query(`
    UPDATE quotes
    SET base_currency = CASE WHEN TRIM(COALESCE(base_currency, '')) = '' THEN 'CNY' ELSE UPPER(base_currency) END,
        exchange_rate = CASE WHEN COALESCE(exchange_rate, 0) <= 0 THEN 1 ELSE exchange_rate END,
        additional_charges = COALESCE(additional_charges, JSON_ARRAY()),
        additional_fee_total = COALESCE(additional_fee_total, 0)
  `);

  await connection.query("INSERT IGNORE INTO schema_migrations (id) VALUES (?)", [id]);
  console.log(`Applied migration: ${id}`);
}

export async function migrateEmailDeliveryMonitoring(connection: Connection) {
  const id = "20260813_email_delivery_monitoring";
  if (!(await tableExists(connection, "customers"))) return;

  await addColumnToTable(connection, "customers", "email_sent_count", "INT NOT NULL DEFAULT 0");
  await addColumnToTable(connection, "customers", "first_email_sent_at", "TIMESTAMP NULL");
  await addColumnToTable(connection, "customers", "last_email_sent_at", "TIMESTAMP NULL");

  if (await tableExists(connection, "email_logs")) {
    await addColumnToTable(connection, "email_logs", "bounce_message_id", "VARCHAR(255) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "email_logs", "bounce_code", "VARCHAR(50) NOT NULL DEFAULT ''");
    await addColumnToTable(connection, "email_logs", "monitored_at", "TIMESTAMP NULL");
    await addIndexIfMissing(connection, "email_logs", "idx_email_logs_message_owner", "owner_id, message_id");
    await addIndexIfMissing(connection, "email_logs", "idx_email_logs_recipient_status", "owner_id, recipient_email, status");

    await connection.query(`
      UPDATE customers c
      LEFT JOIN (
        SELECT customer_id, COUNT(*) AS sent_count, MIN(sent_at) AS first_sent_at, MAX(sent_at) AS last_sent_at
        FROM email_logs
        WHERE status = 'sent' AND TRIM(COALESCE(customer_id, '')) <> ''
        GROUP BY customer_id
      ) s ON s.customer_id = c.customerId
      SET c.email_sent_count = COALESCE(s.sent_count, 0),
          c.first_email_sent_at = s.first_sent_at,
          c.last_email_sent_at = s.last_sent_at
    `);
  }

  await connection.query(`
    UPDATE customers
    SET journey_stage = 'new'
    WHERE COALESCE(email_sent_count, 0) = 0
      AND journey_stage IN ('', 'lead', 'prospect', 'contacted')
  `);

  await addIndexIfMissing(connection, "customers", "idx_customers_email_sent", "email_sent_count, journey_stage");
  await connection.query("INSERT IGNORE INTO schema_migrations (id) VALUES (?)", [id]);
  console.log(`Applied migration: ${id}`);
}

export async function ensureInitialAdmin(
  connection: Pick<Connection, "query">,
  credentials: {
    username?: string;
    password?: string;
    displayName?: string;
  } = {},
) {
  const username = (
    credentials.username ??
    process.env.INITIAL_ADMIN_USERNAME ??
    ""
  ).trim();
  const password =
    credentials.password ?? process.env.INITIAL_ADMIN_PASSWORD ?? "";
  const displayName = (
    credentials.displayName ??
    process.env.INITIAL_ADMIN_DISPLAY_NAME ??
    "超级管理员"
  ).trim();

  if (!username && !password) return { configured: false, created: false };
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    throw new Error(
      "INITIAL_ADMIN_USERNAME 必须是 3-32 位字母、数字、点、横线或下划线",
    );
  }
  if (password.length < 16 || password.length > 128) {
    throw new Error("INITIAL_ADMIN_PASSWORD 必须是 16-128 位密码");
  }

  const [rows] = await connection.query<RowDataPacket[]>(
    "SELECT id, role, status, active FROM users WHERE username = ? LIMIT 1",
    [username],
  );
  const existing = rows[0];

  await connection.query(
    "UPDATE users SET role = 'sales', token_version = token_version + 1 WHERE role = 'admin' AND username <> ?",
    [username],
  );

  if (existing) {
    if (
      existing.role !== "admin" ||
      existing.status !== "active" ||
      !existing.active
    ) {
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

export async function normalizeLegacyUserEmails(
  connection: Pick<Connection, "query">,
) {
  await connection.query(
    "ALTER TABLE users MODIFY COLUMN email VARCHAR(255) NULL DEFAULT NULL",
  );
  await connection.query(
    "UPDATE users SET email = NULL WHERE TRIM(COALESCE(email, '')) = ''",
  );
}

async function migrateEmailExecution(connection: Connection) {
  const id = "20260801_email_execution_and_security";
  const [applied] = await connection.query<RowDataPacket[]>(
    "SELECT id FROM schema_migrations WHERE id = ? LIMIT 1",
    [id],
  );
  if (applied.length) {
    console.log(`Migration already applied: ${id}`);
  }
  if (!(await tableExists(connection, "email_tasks"))) {
    throw new Error("email_tasks 表不存在，请先初始化基础数据库结构");
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

  await addColumnToTable(
    connection,
    "email_tasks",
    "start_at",
    "TIMESTAMP NULL",
  );
  await addColumnToTable(
    connection,
    "email_tasks",
    "next_run_at",
    "TIMESTAMP NULL",
  );
  await addColumnToTable(
    connection,
    "email_tasks",
    "failed_send_count",
    "INT NOT NULL DEFAULT 0",
  );
  await addColumnToTable(
    connection,
    "email_tasks",
    "skipped_send_count",
    "INT NOT NULL DEFAULT 0",
  );
  await addColumnToTable(
    connection,
    "email_tasks",
    "last_message",
    "TEXT NULL",
  );
  await addColumnToTable(
    connection,
    "email_tasks",
    "owner_id",
    "VARCHAR(32) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "email_logs",
    "contact_id",
    "VARCHAR(32) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "email_logs",
    "message_id",
    "VARCHAR(255) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "email_logs",
    "attempt",
    "INT NOT NULL DEFAULT 1",
  );
  await addColumnToTable(
    connection,
    "email_logs",
    "owner_id",
    "VARCHAR(32) NOT NULL DEFAULT ''",
  );
  await addColumnToTable(
    connection,
    "customers",
    "email_failure_reason",
    "TEXT NULL",
  );
  await addColumnToTable(
    connection,
    "customers",
    "email_failed_at",
    "TIMESTAMP NULL",
  );
  await addColumnToTable(
    connection,
    "customers",
    "owner_id",
    "VARCHAR(32) NOT NULL DEFAULT ''",
  );
  if (await tableExists(connection, "lead_tasks")) {
    await addColumnToTable(
      connection,
      "lead_tasks",
      "owner_id",
      "VARCHAR(32) NOT NULL DEFAULT ''",
    );
  }
  if (await tableExists(connection, "leads")) {
    await addColumnToTable(
      connection,
      "leads",
      "owner_id",
      "VARCHAR(32) NOT NULL DEFAULT ''",
    );
  }
  if (await tableExists(connection, "customer_views")) {
    await addColumnToTable(
      connection,
      "customer_views",
      "owner_id",
      "VARCHAR(32) NOT NULL DEFAULT ''",
    );
    await addIndexIfMissing(
      connection,
      "customer_views",
      "idx_customer_views_owner",
      "owner_id",
    );
  }
  await addIndexIfMissing(
    connection,
    "customers",
    "idx_customers_owner",
    "owner_id",
  );
  await addIndexIfMissing(
    connection,
    "email_tasks",
    "idx_email_tasks_owner",
    "owner_id",
  );
  await addIndexIfMissing(
    connection,
    "email_logs",
    "idx_email_logs_owner",
    "owner_id",
  );
  if (await tableExists(connection, "lead_tasks"))
    await addIndexIfMissing(
      connection,
      "lead_tasks",
      "idx_lead_tasks_owner",
      "owner_id",
    );
  if (await tableExists(connection, "leads"))
    await addIndexIfMissing(connection, "leads", "idx_leads_owner", "owner_id");

  await connection.query(
    "INSERT IGNORE INTO schema_migrations (id) VALUES (?)",
    [id],
  );
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
    await connection.query(
      `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`,
    );
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
    await connection.query(
      `ALTER TABLE users ADD COLUMN \`${column}\` ${definition}`,
    );
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

async function addIndexIfMissing(
  connection: Connection,
  table: string,
  indexName: string,
  column: string,
  unique = false,
) {
  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT INDEX_NAME FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [database, table, indexName],
  );
  if (!rows.length)
    await connection.query(
      `ALTER TABLE \`${table}\` ADD ${unique ? "UNIQUE " : ""}INDEX \`${indexName}\` (${column
        .split(",")
        .map((name) => `\`${name.trim()}\``)
        .join(", ")})`,
    );
}

if (require.main === module) {
  runDatabaseMigrations().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
