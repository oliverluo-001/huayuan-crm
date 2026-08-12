import 'reflect-metadata';
import { validate } from 'class-validator';
import { CreateProductDto, UpdateProductDto } from './product.dto';

describe('product price validation', () => {
  it('accepts a zero reference price for products that have not been priced yet', async () => {
    const dto = Object.assign(new CreateProductDto(), {
      sku: 'WN-FLG',
      code: '',
      name: 'Weld Neck Flange',
      price: 0,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
  });

  it('rejects a negative reference price', async () => {
    const dto = Object.assign(new UpdateProductDto(), { price: -1 });
    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'price')).toBe(true);
  });
});
