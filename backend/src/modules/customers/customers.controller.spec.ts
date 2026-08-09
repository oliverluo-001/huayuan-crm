import { CustomersController, QuotesController } from './customers.controller';

describe('CustomersController sales authorization scope', () => {
  it('forces a sales-created customer to the current owner without collaborators', async () => {
    const customersService = { create: jest.fn().mockResolvedValue({ id: 1 }) };
    const controller = new CustomersController(customersService as any);

    await controller.create(
      { company: 'Buyer', ownerId: '999', collaboratorIds: ['2', '3'] } as any,
      { sub: 7, role: 'sales' },
    );

    expect(customersService.create).toHaveBeenCalledWith(
      expect.objectContaining({ company: 'Buyer', ownerId: '7', collaboratorIds: [] }),
    );
  });

  it('prevents sales users from changing owner or collaborator authorization', async () => {
    const customersService = {
      assertCustomerOwner: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ id: 15 }),
    };
    const controller = new CustomersController(customersService as any);

    await controller.update(
      '15',
      { company: 'Renamed Buyer', ownerId: '999', collaboratorIds: ['999'] } as any,
      { sub: 7, role: 'sales' },
    );

    expect(customersService.assertCustomerOwner).toHaveBeenCalledWith(15, '7');
    expect(customersService.update).toHaveBeenCalledWith(15, { company: 'Renamed Buyer' });
  });

  it('allows an administrator to assign owner and collaborators', async () => {
    const customersService = {
      assertCustomerOwner: jest.fn().mockResolvedValue(undefined),
      update: jest.fn().mockResolvedValue({ id: 15 }),
    };
    const controller = new CustomersController(customersService as any);
    const update = { ownerId: '8', collaboratorIds: ['9'] };

    await controller.update('15', update as any, { sub: 1, role: 'admin' });

    expect(customersService.assertCustomerOwner).toHaveBeenCalledWith(15, undefined);
    expect(customersService.update).toHaveBeenCalledWith(15, update);
  });
});

describe('QuotesController export', () => {
  it('exports a complete, escaped quotation document', async () => {
    const customersService = {
      assertQuoteOwner: jest.fn(),
      findQuote: jest.fn().mockResolvedValue({
        id: 1,
        customerId: 7,
        quoteNo: 'Q-20260809-001',
        currency: 'USD',
        subtotal: 100,
        freight: 20,
        taxRate: 0,
        taxAmount: 0,
        total: 120,
        createdAt: '2026-08-09',
        items: [{ productName: '<Flange>', quantity: 1, unit: 'pcs', unitPrice: 100, subtotal: 100 }],
      }),
      findOne: jest.fn().mockResolvedValue({
        id: 7,
        company: 'Buyer & Co',
        contact: 'Amy',
        email: 'amy@example.com',
        region: 'Thailand',
      }),
    };
    const response = {
      setHeader: jest.fn(),
      end: jest.fn(),
    };
    const controller = new QuotesController(customersService as any);

    await controller.export('1', response as any, { sub: 1, role: 'admin' });

    expect(customersService.assertQuoteOwner).toHaveBeenCalledWith(1, undefined);
    expect(response.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html; charset=utf-8');
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'attachment; filename="quotation-Q-20260809-001.html"',
    );
    const html = response.end.mock.calls[0][0];
    expect(html).toContain('报价单 / QUOTATION');
    expect(html).toContain('Buyer &amp; Co');
    expect(html).toContain('&lt;Flange&gt;');
    expect(html).toContain('USD 120.00');
  });
});
