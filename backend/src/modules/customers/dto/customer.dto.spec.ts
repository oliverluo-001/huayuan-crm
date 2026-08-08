import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateQuoteDto,
  UpdateContactDto,
  UpdateOpportunityDto,
  UpdateQuoteDto,
  UpdateSampleDto,
} from './customer.dto';

async function contractErrors<T extends object>(type: new () => T, payload: object) {
  return validate(plainToInstance(type, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('CRM API contracts', () => {
  it.each([
    [UpdateContactDto, { title: 'Purchasing Manager' }],
    [UpdateOpportunityDto, { stage: 'proposal' }],
    [UpdateQuoteDto, { status: 'sent' }],
    [UpdateSampleDto, { status: 'delivered' }],
  ])('accepts partial updates for %p', async (type, payload) => {
    await expect(contractErrors(type as new () => object, payload)).resolves.toHaveLength(0);
  });

  it('accepts nested quote items and rejects the retired flat product contract', async () => {
    const valid = await contractErrors(CreateQuoteDto, {
      customerId: 1,
      freight: 20,
      taxRate: 13,
      items: [{ productName: 'Weld Neck Flange', quantity: 2, unitPrice: 100, discount: 5 }],
    });
    expect(valid).toHaveLength(0);

    const retired = await contractErrors(CreateQuoteDto, {
      customerId: 1,
      productId: 'prod_1',
      quantity: 2,
      unitPrice: 100,
      items: [],
    });
    expect(retired.length).toBeGreaterThan(0);
  });
});
