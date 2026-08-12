import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const productRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    remove: jest.fn(async () => undefined),
  };
  const variantRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    delete: jest.fn(async () => ({ affected: 0 })),
  };
  const assetRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    remove: jest.fn(),
  };
  const service = new ProductsService(
    productRepository as any,
    variantRepository as any,
    assetRepository as any,
    { get: jest.fn() } as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates a flange family with a normalized SKU and quote-ready variant', async () => {
    productRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 1,
        productId: 'prod_1',
        sku: 'WN-FLG',
        name: 'Weld Neck Flange',
        prices: [{ currency: 'USD', referencePrice: 25 }],
        variants: [],
        assets: [],
      });
    variantRepository.findOne.mockResolvedValue(null);
    productRepository.save.mockImplementation(async (value) => ({ ...value, id: 1 }));

    const result = await service.create({
      sku: 'wn-flg',
      name: 'Weld Neck Flange',
      productType: 'flange',
      prices: [{ currency: 'usd', referencePrice: 25 }],
      variants: [{
        sku: 'wn-dn50-cl150',
        standard: 'ASME B16.5',
        material: 'ASTM A105',
        pressureRating: 'Class 150',
        nominalSize: 'DN50',
      }],
    });

    expect(result.sku).toBe('WN-FLG');
    expect(variantRepository.save).toHaveBeenCalledWith([
      expect.objectContaining({
        sku: 'WN-DN50-CL150',
        quoteDescription: expect.stringContaining('ASME B16.5'),
      }),
    ]);
  });

  it('hides internal cost fields from viewer product responses', async () => {
    productRepository.findOne.mockResolvedValue({
      id: 1,
      baseCost: 10,
      costCurrency: 'USD',
      variants: [{ sku: 'A', baseCost: 8, costCurrency: 'USD' }],
      assets: [],
    });
    const result: any = await service.findOne(1, false);
    expect(result.baseCost).toBeUndefined();
    expect(result.variants[0].baseCost).toBeUndefined();
  });

  it('keeps legacy single-price updates compatible with the multi-currency catalog', async () => {
    productRepository.findOne
      .mockResolvedValueOnce({
        id: 1, productId: 'prod_1', sku: 'WN-FLG', name: 'Weld Neck Flange',
        currency: 'USD', price: 25, prices: [{ currency: 'USD', referencePrice: 25 }],
        variants: [], assets: [],
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 1, productId: 'prod_1', sku: 'WN-FLG', name: 'Weld Neck Flange',
        currency: 'USD', price: 30, prices: [{ currency: 'USD', referencePrice: 30 }],
        variants: [], assets: [],
      });

    const result: any = await service.update(1, { price: 30 });
    expect(productRepository.save).toHaveBeenCalledWith(expect.objectContaining({
      price: 30,
      prices: [{ currency: 'USD', referencePrice: 30 }],
    }));
    expect(result.price).toBe(30);
  });
});
