import { ProductsService } from './products.service';

describe('ProductsService', () => {
  const product = {
    id: 1,
    productId: 'prod_1',
    code: 'WN-FLG-DN300',
    name: 'Weld Neck Flange',
    price: 0,
    currency: 'USD',
  };
  const productRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
    delete: jest.fn(),
  };
  const service = new ProductsService(productRepository as any);

  beforeEach(() => {
    jest.clearAllMocks();
    productRepository.findOne.mockResolvedValue({ ...product });
    productRepository.delete.mockResolvedValue({ affected: 1 });
  });

  it('creates a product while preserving a zero reference price', async () => {
    const result = await service.create({
      code: product.code,
      name: product.name,
      price: 0,
      currency: 'USD',
    });

    expect(result).toMatchObject({ name: product.name, price: 0, currency: 'USD' });
    expect(result.productId).toMatch(/^prod_/);
  });

  it('edits an existing product price', async () => {
    const result = await service.update(1, { price: 125.5 });

    expect(result.price).toBe(125.5);
    expect(productRepository.save).toHaveBeenCalledWith(expect.objectContaining({ id: 1, price: 125.5 }));
  });

  it('deletes an existing product', async () => {
    await expect(service.remove(1)).resolves.toEqual({ deleted: true });
    expect(productRepository.delete).toHaveBeenCalledWith(1);
  });
});
