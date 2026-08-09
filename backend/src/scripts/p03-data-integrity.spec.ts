import {
  ensureForeignKey,
  ensureIndex,
  normalizeSampleStatus,
  normalizeTodoStatus,
  parseLegacyPrice,
  repairProductPrices,
  type MigrationConnection,
} from './p03-data-integrity';

describe('P0.3 data integrity migration', () => {
  it.each([
    ['1,234.50', 1234.5],
    ['1.234,50 EUR', 1234.5],
    ['US$ 2,500', 2500],
    ['88,5', 88.5],
    [0, 0],
    ['-10', null],
    ['not priced', null],
  ])('normalizes legacy product price %p', (value, expected) => {
    expect(parseLegacyPrice(value)).toBe(expected);
    if (expected !== null) expect(parseLegacyPrice(expected)).toBe(expected);
  });

  it.each([
    ['requested', undefined, undefined, 'pending'],
    ['shipped', undefined, undefined, 'sent'],
    ['已签收', undefined, undefined, 'delivered'],
    ['cancelled', undefined, undefined, 'returned'],
    ['unknown', new Date('2026-08-01'), undefined, 'sent'],
    ['pending', undefined, new Date('2026-08-02'), 'delivered'],
  ])('normalizes historical sample status %p', (value, sentAt, deliveredAt, expected) => {
    const normalized = normalizeSampleStatus(value, sentAt, deliveredAt);
    expect(normalized).toBe(expected);
    expect(normalizeSampleStatus(normalized)).toBe(normalized);
  });

  it.each([
    ['pending', undefined, 'open'],
    ['in_progress', undefined, 'open'],
    ['completed', undefined, 'done'],
    ['已完成', undefined, 'done'],
    ['open', new Date('2026-08-03'), 'done'],
  ])('normalizes historical todo status %p', (value, completedAt, expected) => {
    const normalized = normalizeTodoStatus(value, completedAt);
    expect(normalized).toBe(expected);
    expect(normalizeTodoStatus(normalized)).toBe(normalized);
  });

  it('repairs legacy product fields once and is a no-op on the second run', async () => {
    const products = [
      { id: 1, price: '0.00', currency: 'USD', base_price: 'US$ 1,250.50' },
      {
        id: 2,
        price: null,
        currency: 'USD',
        base_price: null,
        price_cny: '¥688.00',
      },
    ];
    const columns = [
      {
        columnName: 'id',
        dataType: 'int',
        columnType: 'int',
        isNullable: 'NO',
      },
      {
        columnName: 'price',
        dataType: 'decimal',
        columnType: 'decimal(15,2)',
        isNullable: 'NO',
      },
      {
        columnName: 'currency',
        dataType: 'varchar',
        columnType: 'varchar(10)',
        isNullable: 'NO',
      },
      {
        columnName: 'base_price',
        dataType: 'varchar',
        columnType: 'varchar(50)',
        isNullable: 'YES',
      },
      {
        columnName: 'price_cny',
        dataType: 'varchar',
        columnType: 'varchar(50)',
        isNullable: 'YES',
      },
    ];
    const query = jest.fn(async (sql: string, values: unknown[] = []) => {
      if (sql.includes('information_schema.TABLES')) return [[{ TABLE_NAME: 'products' }], []];
      if (sql.includes('information_schema.COLUMNS')) return [columns, []];
      if (sql.startsWith('SELECT `id`')) return [products.map((product) => ({ ...product })), []];
      if (sql.startsWith('UPDATE products SET')) {
        const product = products.find((item) => item.id === values[2]);
        if (product) {
          product.price = String(values[0]);
          product.currency = String(values[1]);
        }
        return [{ affectedRows: product ? 1 : 0 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const connection = { query } as unknown as MigrationConnection;

    await expect(repairProductPrices(connection, 'crm')).resolves.toBe(2);
    await expect(repairProductPrices(connection, 'crm')).resolves.toBe(0);
    expect(products).toEqual([
      expect.objectContaining({ id: 1, price: '1250.5', currency: 'USD' }),
      expect.objectContaining({ id: 2, price: '688', currency: 'CNY' }),
    ]);
  });

  it('creates a matching unique index only once', async () => {
    let created = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('information_schema.STATISTICS')) {
        return [
          created
            ? [
                {
                  indexName: 'uq_products',
                  nonUnique: 0,
                  columnsList: 'product_id',
                },
              ]
            : [],
          [],
        ];
      }
      if (sql.includes('ADD UNIQUE INDEX')) {
        created = true;
        return [{ affectedRows: 0 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const connection = { query } as unknown as MigrationConnection;

    await expect(ensureIndex(connection, 'crm', 'products', 'uq_products', ['product_id'], true)).resolves.toBe(true);
    await expect(ensureIndex(connection, 'crm', 'products', 'uq_products', ['product_id'], true)).resolves.toBe(false);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('ADD UNIQUE INDEX'))).toHaveLength(1);
  });

  it('creates a matching foreign key only once', async () => {
    let created = false;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('information_schema.KEY_COLUMN_USAGE')) {
        return [created ? [{ constraintName: 'fk_todos_customer', deleteRule: 'CASCADE' }] : [], []];
      }
      if (sql.includes('ADD CONSTRAINT')) {
        created = true;
        return [{ affectedRows: 0 }, []];
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    const connection = { query } as unknown as MigrationConnection;
    const definition = {
      table: 'todos',
      column: 'customer_id',
      primaryKey: 'id',
      referencedTable: 'customers',
      referencedColumn: 'id',
      constraintName: 'fk_todos_customer',
      onDelete: 'CASCADE' as const,
    };

    await expect(ensureForeignKey(connection, 'crm', definition)).resolves.toBe(true);
    await expect(ensureForeignKey(connection, 'crm', definition)).resolves.toBe(false);
    expect(query.mock.calls.filter(([sql]) => String(sql).includes('ADD CONSTRAINT'))).toHaveLength(1);
  });
});
