import "dotenv/config";
import { strict as assert } from "node:assert";
import mysql, { type Connection, type RowDataPacket } from "mysql2/promise";
import { DataSource } from "typeorm";
import { CustomersService } from "../modules/customers/customers.service";
import { Customer, Contact, Activity, Todo, Opportunity, Quote, Sample, Tag, CustomerView, OpportunityStageHistory, QuoteTermTemplate } from "../modules/customers/entities";
import { EmailLog } from "../modules/email/entities/email-log.entity";
import { User } from "../modules/auth/entities/user.entity";

type CheckRow = RowDataPacket & Record<string, any>;

const host = process.env.DB_HOST || "127.0.0.1";
const port = Number(process.env.DB_PORT || 3306);
const user = process.env.DB_USERNAME || "root";
const password = process.env.DB_PASSWORD || "";
const rawSuffix = `${process.env.GITHUB_RUN_ID || Date.now()}_${process.pid}`;
const database = `huayuan_crm_ci_${rawSuffix}`.slice(0, 60);

if (!/^huayuan_crm_ci_[a-zA-Z0-9_]+$/.test(database)) {
  throw new Error(`拒绝使用不安全的迁移检查数据库名: ${database}`);
}

async function createCurrentSchema() {
  const dataSource = new DataSource({
    type: "mysql",
    host,
    port,
    username: user,
    password,
    database,
    entities: [__dirname + "/../**/*.entity{.ts,.js}"],
    synchronize: true,
    logging: false,
    timezone: "+08:00",
    charset: "utf8mb4",
  });
  await dataSource.initialize();
  await dataSource.destroy();
}

async function seedLegacyFixture(connection: Connection) {
  const [todoFks] = await connection.query<CheckRow[]>("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'todos' AND COLUMN_NAME = 'opportunity_id' AND REFERENCED_TABLE_NAME = 'opportunities'", [database]);
  for (const fk of todoFks) {
    const name = String(fk.CONSTRAINT_NAME);
    assert.match(name, /^[a-zA-Z0-9_]+$/);
    await connection.query(`ALTER TABLE todos DROP FOREIGN KEY \`${name}\``);
  }
  await connection.query("ALTER TABLE todos DROP COLUMN opportunity_id, DROP COLUMN next_action_key, DROP COLUMN resolution");
  await connection.query("ALTER TABLE email_tasks DROP COLUMN round_processed_count");
  await connection.query("DROP TABLE IF EXISTS product_assets");
  await connection.query("DROP TABLE IF EXISTS product_variants");
  await connection.query("DROP TABLE IF EXISTS quote_term_templates");
  await connection.query("ALTER TABLE products DROP INDEX idx_products_category_active");
  await connection.query(`
    ALTER TABLE products
      DROP COLUMN sku,
      DROP COLUMN product_type,
      DROP COLUMN weight,
      DROP COLUMN weight_unit,
      DROP COLUMN packaging,
      DROP COLUMN package_quantity,
      DROP COLUMN base_cost,
      DROP COLUMN cost_currency,
      DROP COLUMN prices,
      DROP COLUMN standards,
      DROP COLUMN materials,
      DROP COLUMN specifications,
      DROP COLUMN description_templates,
      DROP COLUMN active
  `);
  await connection.query(`
    ALTER TABLE quote_items
      DROP COLUMN variant_id,
      DROP COLUMN sku,
      DROP COLUMN standard,
      DROP COLUMN material,
      DROP COLUMN pressure_rating,
      DROP COLUMN nominal_size,
      DROP COLUMN facing,
      DROP COLUMN surface_treatment,
      DROP COLUMN weight,
      DROP COLUMN weight_unit,
      DROP COLUMN packaging,
      DROP COLUMN inspection_requirements,
      DROP COLUMN certificate_requirements
  `);
  await connection.query("ALTER TABLE quotes DROP INDEX idx_quotes_term_template");
  await connection.query(`
    ALTER TABLE quotes
      DROP COLUMN base_currency,
      DROP COLUMN exchange_rate,
      DROP COLUMN additional_charges,
      DROP COLUMN additional_fee_total,
      DROP COLUMN incoterm,
      DROP COLUMN origin_port,
      DROP COLUMN destination_port,
      DROP COLUMN delivery_time,
      DROP COLUMN payment_terms,
      DROP COLUMN packaging_terms,
      DROP COLUMN warranty_terms,
      DROP COLUMN notes_en,
      DROP COLUMN terms_en,
      DROP COLUMN term_template_id
  `);
  await connection.query(`
    ALTER TABLE customers
      DROP COLUMN address,
      DROP COLUMN main_markets,
      DROP COLUMN annual_purchase_amount,
      DROP COLUMN preferred_currency,
      DROP COLUMN preferred_incoterm,
      DROP COLUMN collaborator_ids
  `);
  await connection.query(`
    ALTER TABLE contacts
      DROP COLUMN department,
      DROP COLUMN decision_role,
      DROP COLUMN purchasing_influence,
      DROP COLUMN preferred_language,
      DROP COLUMN whatsapp,
      DROP COLUMN linkedin,
      DROP COLUMN contact_status,
      DROP COLUMN marketing_allowed
  `);
  await connection.query("ALTER TABLE email_templates DROP COLUMN owner_id");
  await connection.query(`
    ALTER TABLE customers
      DROP COLUMN source_history,
      DROP COLUMN merged_into_id,
      DROP COLUMN merged_at
  `);
  await connection.query("DROP TABLE IF EXISTS customer_merge_history");
  await connection.query("DROP TABLE IF EXISTS opportunity_stage_history");
  await connection.query(`
    ALTER TABLE opportunities
      DROP COLUMN owner_id,
      DROP COLUMN collaborator_ids,
      DROP COLUMN product_name,
      DROP COLUMN product_specification,
      DROP COLUMN expected_quantity,
      DROP COLUMN quantity_unit,
      DROP COLUMN target_price,
      DROP COLUMN currency,
      DROP COLUMN budget,
      DROP COLUMN purchase_time,
      DROP COLUMN decision_process,
      DROP COLUMN next_step_action,
      DROP COLUMN next_step_due_date,
      DROP COLUMN forecast_category,
      DROP COLUMN win_reason,
      DROP COLUMN loss_reason,
      DROP COLUMN competitors,
      DROP COLUMN stage_entered_at,
      DROP COLUMN closed_at
  `);
  await connection.query(
    "ALTER TABLE opportunities MODIFY COLUMN expected_close_date DATE NULL",
  );
  await connection.query(
    "ALTER TABLE products ADD COLUMN base_price VARCHAR(64) NULL",
  );
  await connection.query(
    "ALTER TABLE products MODIFY COLUMN price VARCHAR(64) NULL",
  );
  await connection.query(
    "ALTER TABLE samples MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'",
  );
  await connection.query(
    "ALTER TABLE todos MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'open'",
  );

  await connection.query(
    "INSERT INTO customers (customerId, company, contact, email, journey_stage, owner_id) VALUES ('CUST-CI-1', 'CI Migration Customer', 'Anna', 'anna@ci.test', 'new', '7')",
  );
  const [customerRows] = await connection.query<CheckRow[]>(
    "SELECT id FROM customers WHERE customerId = 'CUST-CI-1'",
  );
  const customerId = Number(customerRows[0].id);

  await connection.query(
    "INSERT INTO contacts (contact_id, customer_id, name, email, is_primary) VALUES ('CONTACT-CI-1', ?, 'Anna', 'anna@ci.test', 1)",
    [customerId],
  );

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
  const [roundProgressColumns] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_tasks' AND COLUMN_NAME = 'round_processed_count'`,
    [database],
  );
  assert.equal(Number(roundProgressColumns[0].count), 1, "邮件轮次暂停进度字段未迁移");
  const [products] = await connection.query<CheckRow[]>(
    "SELECT price, currency, sku, prices FROM products WHERE product_id = 'PROD-CI-1'",
  );
  assert.equal(Number(products[0].price), 1250.5, "历史产品价格未正确转换");
  assert.equal(products[0].currency, "USD", "历史产品币种未正确识别");

  assert.equal(products[0].sku, "WN-DN50", "历史产品未生成 SKU");
  const migratedPrices = typeof products[0].prices === "string"
    ? JSON.parse(products[0].prices)
    : products[0].prices;
  assert.deepEqual(migratedPrices, [{ currency: "USD", referencePrice: 1250.5 }], "历史价格未转换为多币种价格");
  const [catalogTables] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('product_variants', 'product_assets')`,
    [database],
  );
  assert.equal(Number(catalogTables[0].count), 2, "P2.1 产品规格或资料表未创建");
  const [quoteSnapshotColumns] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'quote_items'
       AND COLUMN_NAME IN ('variant_id','sku','standard','material','pressure_rating','nominal_size','facing','surface_treatment','weight','weight_unit','packaging','inspection_requirements','certificate_requirements')`,
    [database],
  );
  assert.equal(Number(quoteSnapshotColumns[0].count), 13, "P2.1 报价规格快照字段不完整");

  const [quoteEditorTables] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'quote_term_templates'`,
    [database],
  );
  assert.equal(Number(quoteEditorTables[0].count), 1, "P2.2 公司条款模板表未创建");
  const [quoteEditorColumns] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'quotes'
       AND COLUMN_NAME IN ('base_currency','exchange_rate','additional_charges','additional_fee_total','incoterm','origin_port','destination_port','delivery_time','payment_terms','packaging_terms','warranty_terms','notes_en','terms_en','term_template_id')`,
    [database],
  );
  assert.equal(Number(quoteEditorColumns[0].count), 14, "P2.2 报价编辑器字段迁移不完整");

  const [samples] = await connection.query<CheckRow[]>(
    "SELECT status, sent_at FROM samples WHERE sample_id = 'SAMPLE-CI-1'",
  );
  assert.equal(samples[0].status, "sent", "历史样品状态未正确转换");
  assert.ok(samples[0].sent_at, "已寄出样品缺少寄出时间");

  const [todos] = await connection.query<CheckRow[]>(
    "SELECT todo_id, status, completed_at FROM todos WHERE todo_id IN ('TODO-CI-1','TODO-CI-2') ORDER BY todo_id",
  );
  assert.deepEqual(
    todos.map((todo) => todo.status),
    ["done", "open"],
    "历史待办状态未规范化",
  );
  assert.ok(todos[0].completed_at, "已完成待办缺少完成时间");

  const [customers] = await connection.query<CheckRow[]>(
    "SELECT journey_stage, last_activity_type, next_todo_title, health, open_opportunity_count, open_opportunity_value FROM customers WHERE customerId = 'CUST-CI-1'",
  );
  assert.equal(
    customers[0].journey_stage,
    "proposal",
    "客户阶段未与当前商机同步",
  );
  assert.equal(
    customers[0].last_activity_type,
    "call",
    "客户最近活动摘要未刷新",
  );
  assert.equal(
    customers[0].next_todo_title,
    "联系客户并确认下一步安排",
    "客户下一待办摘要未刷新",
  );
  assert.equal(customers[0].health, "warning", "客户健康状态未刷新");
  assert.equal(
    Number(customers[0].open_opportunity_count),
    1,
    "客户活跃商机数未刷新",
  );
  assert.equal(
    Number(customers[0].open_opportunity_value),
    12800,
    "客户活跃商机金额未刷新",
  );

  const [attachments] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customer_attachments'`,
    [database],
  );
  assert.equal(Number(attachments[0].count), 1, "客户附件表未创建");

  const [masterColumns] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND (
       (TABLE_NAME = 'customers' AND COLUMN_NAME IN ('address','main_markets','annual_purchase_amount','preferred_currency','preferred_incoterm','collaborator_ids'))
       OR
       (TABLE_NAME = 'contacts' AND COLUMN_NAME IN ('department','decision_role','purchasing_influence','preferred_language','whatsapp','linkedin','contact_status','marketing_allowed'))
     )`,
    [database],
  );
  assert.equal(
    Number(masterColumns[0].count),
    14,
    "P1.2 客户主数据字段迁移不完整",
  );

  const [ownershipColumns] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'email_templates' AND COLUMN_NAME = 'owner_id'`,
    [database],
  );
  assert.equal(
    Number(ownershipColumns[0].count),
    1,
    "邮件模板归属字段迁移不完整",
  );

  const [duplicateColumns] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customers'
       AND COLUMN_NAME IN ('source_history', 'merged_into_id', 'merged_at')`,
    [database],
  );
  assert.equal(
    Number(duplicateColumns[0].count),
    3,
    "重复客户管理字段迁移不完整",
  );
  const [mergeHistoryTable] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customer_merge_history'`,
    [database],
  );
  assert.equal(
    Number(mergeHistoryTable[0].count),
    1,
    "客户合并审计表迁移不完整",
  );
  const [mergeHistoryColumns] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'customer_merge_history'
       AND COLUMN_NAME IN ('merge_id', 'primary_customer_id', 'source_snapshots', 'field_selections', 'primary_contact_selection', 'moved_relations', 'performed_by_id')`,
    [database],
  );
  assert.equal(
    Number(mergeHistoryColumns[0].count),
    7,
    "客户合并审计字段迁移不完整",
  );

  const [opportunityColumns] = await connection.query<CheckRow[]>(
    `SELECT COUNT(*) AS count FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'opportunities'
       AND COLUMN_NAME IN (
         'owner_id','collaborator_ids','product_name','product_specification',
         'expected_quantity','quantity_unit','target_price','currency','budget',
         'purchase_time','decision_process','next_step_action','next_step_due_date',
         'forecast_category','win_reason','loss_reason','competitors',
         'stage_entered_at','closed_at'
       )`,
    [database],
  );
  assert.equal(
    Number(opportunityColumns[0].count),
    19,
    "P1.4 商机字段迁移不完整",
  );
  const [opportunityRows] = await connection.query<CheckRow[]>(
    "SELECT owner_id, forecast_category, stage_entered_at, next_step_action, next_step_due_date, expected_close_date FROM opportunities WHERE opportunity_id = 'OPP-CI-1'",
  );
  assert.equal(opportunityRows[0].owner_id, "7", "历史商机负责人未从客户补齐");
  assert.equal(
    opportunityRows[0].forecast_category,
    "pipeline",
    "历史商机预测分类不正确",
  );
  assert.ok(opportunityRows[0].stage_entered_at, "历史商机缺少阶段进入时间");
  assert.equal(
    opportunityRows[0].next_step_action,
    "联系客户并确认下一步安排",
    "历史活跃商机缺少下一步行动",
  );
  assert.ok(opportunityRows[0].next_step_due_date, "历史活跃商机缺少行动日期");
  assert.ok(opportunityRows[0].expected_close_date, "历史商机缺少预计成交日期");
  const [expectedCloseColumn] = await connection.query<CheckRow[]>(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'opportunities'
       AND COLUMN_NAME = 'expected_close_date'`,
    [database],
  );
  assert.equal(
    expectedCloseColumn[0].IS_NULLABLE,
    "NO",
    "预计成交日期仍允许为空",
  );
  const [opportunityHistory] = await connection.query<CheckRow[]>(
    "SELECT COUNT(*) AS count FROM opportunity_stage_history WHERE opportunity_key = 'OPP-CI-1'",
  );
  assert.equal(
    Number(opportunityHistory[0].count),
    1,
    "历史商机阶段记录未初始化或重复写入",
  );

  const [contacts] = await connection.query<CheckRow[]>(
    "SELECT contact_status, marketing_allowed FROM contacts WHERE contact_id = 'CONTACT-CI-1'",
  );
  assert.equal(
    contacts[0].contact_status,
    "unknown",
    "历史联系人状态默认值不正确",
  );
  assert.equal(
    Number(contacts[0].marketing_allowed),
    1,
    "历史联系人营销许可默认值不正确",
  );

  const [activityColumn] = await connection.query<CheckRow[]>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'activities' AND COLUMN_NAME = 'type'`,
    [database],
  );
  assert.match(
    String(activityColumn[0].COLUMN_TYPE),
    /whatsapp/,
    "活动类型未增加 WhatsApp",
  );
}

async function verifyApplicationStartup() {
  process.env.DB_SYNCHRONIZE = "false";
  process.env.DB_LOGGING = "false";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "ci-startup-smoke-secret";
  process.env.CREDENTIAL_ENCRYPTION_KEY =
    process.env.CREDENTIAL_ENCRYPTION_KEY || process.env.JWT_SECRET;

  const [{ NestFactory }, { AppModule }] = await Promise.all([
    import("@nestjs/core"),
    import("../app.module"),
  ]);
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["error"],
  });
  await app.close();
  console.log("Backend application startup check passed");
}

async function verifyOpportunityActions(connection: Connection) {
  const [indexes] = await connection.query<CheckRow[]>("SELECT NON_UNIQUE FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'todos' AND INDEX_NAME = 'uq_todos_next_action'", [database]);
  assert.equal(Number(indexes[0]?.NON_UNIQUE), 0, "商机执行待办唯一索引缺失");
  const [missing] = await connection.query<CheckRow[]>(`SELECT o.id FROM opportunities o LEFT JOIN todos t ON t.next_action_key = CONCAT('opp:', o.id) WHERE o.stage NOT IN ('won','lost') AND TRIM(COALESCE(o.next_step_action,'')) <> '' AND t.id IS NULL`);
  assert.equal(missing.length, 0, "历史商机下一步未生成执行待办");
}

async function verifyActionTransactions(connection: Connection) {
  const source = new DataSource({ type: "mysql", host, port, username: user, password, database, entities: [__dirname + "/../**/*.entity{.ts,.js}"], synchronize: false, timezone: "+08:00", charset: "utf8mb4" });
  await source.initialize();
  try {
    const service = new CustomersService(source.getRepository(Customer), source.getRepository(Contact), source.getRepository(Activity), source.getRepository(Todo), source.getRepository(Opportunity), source.getRepository(Quote), source.getRepository(Sample), source.getRepository(Tag), source.getRepository(CustomerView), source.getRepository(EmailLog), source.getRepository(OpportunityStageHistory), source.getRepository(QuoteTermTemplate), source.getRepository(User), source);
    const customer = await source.getRepository(Customer).findOne({ where: {}, order: { id: "ASC" } });
    assert.ok(customer, "缺少 CI 客户数据");
    const ownSearch = await service.findAll({ q: customer.customerId, ownerId: customer.ownerId, limit: "25" });
    assert.ok(ownSearch.customers.some((item) => item.id === customer.id), "真实数据库客户编号搜索失败");
    const hiddenSearch = await service.findAll({ q: customer.company, ownerId: "ci-unrelated-seller", limit: "25" });
    assert.equal(hiddenSearch.customers.length, 0, "客户公司搜索越过销售权限");
    const originalCollaborators = customer.collaboratorIds;
    await source.getRepository(Customer).update(customer.id, { collaboratorIds: ["ci-collaborator"] });
    const sharedSearch = await service.findAll({ q: String(customer.id), ownerId: "ci-collaborator", limit: "25" });
    assert.ok(sharedSearch.customers.some((item) => item.id === customer.id), "客户授权协作者搜索失败");
    await source.getRepository(Customer).update(customer.id, { collaboratorIds: originalCollaborators });
    const buyerTag = await source.getRepository(Tag).save({ name: 'CI_FILTER_BUYER' });
    const otherTag = await source.getRepository(Tag).save({ name: 'CI_FILTER_OTHER' });
    const filterRepo = source.getRepository(Customer);
    const matching = await filterRepo.save(filterRepo.create({ customerId: 'ci_filter_match', company: 'CI combined filter buyer', ownerId: customer.ownerId, region: 'Thailand', tier: 'A', journeyStage: 'negotiation', emailStatus: 'valid', health: 'critical', tags: [buyerTag, otherTag] }));
    await filterRepo.save(filterRepo.create({ customerId: 'ci_filter_other', company: 'CI combined filter other', ownerId: customer.ownerId, region: 'Thailand', tier: 'A', journeyStage: 'new', emailStatus: 'valid', health: 'critical', tags: [buyerTag] }));
    const combinedFilters = { q: 'CI combined filter', ownerId: customer.ownerId, tag: buyerTag.name, region: 'Thailand', journeyStage: 'negotiation', tier: 'A', health: 'followup', emailStatus: 'valid' };
    const combined = await service.findAll({ ...combinedFilters, limit: 1 });
    assert.deepEqual(combined.customers.map((item) => item.id), [matching.id], '关键词、标签、阶段组合筛选失效');
    assert.equal(combined.total, 1);
    assert.equal(combined.customers[0].tags.length, 2, '标签筛选丢失其他标签');
    assert.deepEqual(await service.findAllIds({ ...combinedFilters, offset: 100, limit: 1 }), [matching.id], '全选与列表筛选结果不一致');
    assert.equal((await service.findAll({ ...combinedFilters, tag: '(untagged)' })).total, 0, '未标签筛选失效');
    assert.equal((await service.findAll({ ...combinedFilters, ownerId: 'ci-unrelated-seller' })).total, 0, '组合筛选越过销售权限');
    const leadBuyer = await service.upsertLeadCustomer({ company: 'CI lead buyer', website: 'https://ci-lead-buyer.invalid', email: 'sales@ci-lead-buyer.invalid' }, customer.ownerId);
    const mergedBuyer = await service.upsertLeadCustomer({ company: 'CI lead buyer renamed', website: 'https://ci-lead-buyer.invalid/contact', email: 'purchasing@ci-lead-buyer.invalid' }, customer.ownerId);
    assert.equal(mergedBuyer.customer.id, leadBuyer.customer.id, '同域名多联系人被重复创建客户');
    assert.equal(mergedBuyer.customer.email, 'sales@ci-lead-buyer.invalid', '导入覆盖已有主要邮箱');
    assert.equal(await source.getRepository(Contact).countBy({ customerId: leadBuyer.customer.id }), 2, '获客联系人丢失');
    await assert.rejects(service.upsertLeadCustomer({ company: 'CI lead buyer', email: 'another@ci-lead-buyer.invalid' }, 'ci-unrelated-seller'), /归属/);
    console.log('Real MySQL combined customer filters and lead conversion check passed');
    const opportunity = await service.createOpportunity({ customerId: customer.id, name: "CI transaction action", ownerId: "ci-seller", nextStepAction: "确认 CI 图纸", nextStepDueDate: "2026-10-20", expectedCloseDate: "2026-11-01" });
    const taskRepo = source.getRepository(Todo);
    let task = await taskRepo.findOneByOrFail({ nextActionKey: `opp:${opportunity.id}` });
    await service.updateOpportunity(opportunity.id, { nextStepAction: "发送 CI 修订报价" });
    assert.equal(await taskRepo.countBy({ opportunityId: opportunity.id }), 1);
    await service.updateTodo(task.id, { status: "done" });
    assert.equal((await source.getRepository(Opportunity).findOneByOrFail({ id: opportunity.id })).nextStepAction, "");
    const { runDatabaseMigrations } = await import("./migrate");
    await runDatabaseMigrations();
    assert.equal((await source.getRepository(Opportunity).findOneByOrFail({ id: opportunity.id })).nextStepAction, "", "重复部署迁移复活了已完成行动");
    assert.equal(await taskRepo.countBy({ opportunityId: opportunity.id, status: "open" }), 0);
    await service.updateOpportunity(opportunity.id, { nextStepAction: "确认 CI 采购计划" });
    assert.equal(await taskRepo.countBy({ opportunityId: opportunity.id }), 2, "完成后的行动历史未保留");
    task = await taskRepo.findOneByOrFail({ nextActionKey: `opp:${opportunity.id}` });
    await service.updateOpportunity(opportunity.id, { stage: "lost", lossReason: "CI 项目取消" });
    assert.equal((await taskRepo.findOneByOrFail({ id: task.id })).resolution, "cancelled");
    // Failure after opportunity insertion must roll back the opportunity as well as its action.
    const originalTransaction = source.transaction.bind(source);
    const failingSource = { transaction: (isolation: any, work: any) => originalTransaction(isolation, async (manager) => {
      const getRepository = manager.getRepository.bind(manager);
      manager.getRepository = ((entity: any) => {
        const repo = getRepository(entity);
        if (entity === Todo) repo.save = (async () => { throw new Error("CI action persistence failure"); }) as any;
        return repo;
      }) as any;
      return work(manager);
    }) };
    const failing = new CustomersService(source.getRepository(Customer), source.getRepository(Contact), source.getRepository(Activity), taskRepo, source.getRepository(Opportunity), source.getRepository(Quote), source.getRepository(Sample), source.getRepository(Tag), source.getRepository(CustomerView), source.getRepository(EmailLog), source.getRepository(OpportunityStageHistory), source.getRepository(QuoteTermTemplate), source.getRepository(User), failingSource as any);
    await assert.rejects(() => failing.createOpportunity({ customerId: customer.id, name: "CI must rollback", ownerId: "ci-seller", nextStepAction: "不可保存的行动", expectedCloseDate: "2026-11-01" }), /CI action persistence failure/);
    assert.equal(await source.getRepository(Opportunity).countBy({ name: "CI must rollback" }), 0, "商机与待办未原子回滚");
    const { migrateOpportunityActions } = await import("./migrate");
    await migrateOpportunityActions(connection);
    assert.equal(await taskRepo.countBy({ opportunityId: opportunity.id }), 2, "重复迁移产生了额外执行待办");
    console.log("Real MySQL opportunity/action transaction check passed");
  } finally { await source.destroy(); }
}

async function main() {
  const admin = await mysql.createConnection({ host, port, user, password });
  let fixture: Connection | undefined;
  try {
    await admin.query(
      `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await createCurrentSchema();
    fixture = await mysql.createConnection({
      host,
      port,
      user,
      password,
      database,
    });
    await seedLegacyFixture(fixture);

    process.env.DB_DATABASE = database;
    process.env.INITIAL_ADMIN_USERNAME = "";
    process.env.INITIAL_ADMIN_PASSWORD = "";
    const { runDatabaseMigrations } = await import("./migrate");
    const first = await runDatabaseMigrations();
    assert.ok(
      first.p03Report.productPricesRepaired > 0,
      "迁移没有修复历史产品价格",
    );
    assert.ok(
      first.p03Report.sampleStatusesRepaired > 0,
      "迁移没有转换历史样品状态",
    );
    assert.ok(
      first.p03Report.todoStatusesRepaired > 0,
      "迁移没有规范历史待办状态",
    );
    await verifyMigratedData(fixture);
    await verifyOpportunityActions(fixture);

    const second = await runDatabaseMigrations();
    for (const [name, count] of Object.entries(second.p03Report)) {
      assert.equal(count, 0, `迁移第二次执行仍产生变更: ${name}=${count}`);
    }
    await verifyMigratedData(fixture);
    await verifyOpportunityActions(fixture);
    await verifyApplicationStartup();
    await verifyActionTransactions(fixture);
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
