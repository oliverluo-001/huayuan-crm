import { QuotesController } from './customers.controller';

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
