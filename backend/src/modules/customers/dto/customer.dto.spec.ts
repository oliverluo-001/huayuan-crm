import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateContactDto,
  CreateCustomerDto,
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

  it('accepts the P1.2 customer and contact master-data contract', async () => {
    await expect(contractErrors(CreateCustomerDto, {
      company: 'Acme Piping',
      address: '88 Port Road, Bangkok',
      customerType: 'importer',
      mainMarkets: ['Thailand', 'Vietnam'],
      annualPurchaseAmount: 250000,
      preferredCurrency: 'USD',
      preferredIncoterm: 'CIF',
      ownerId: '2',
      collaboratorIds: ['3'],
      source: 'exhibition',
    })).resolves.toHaveLength(0);

    await expect(contractErrors(CreateContactDto, {
      name: 'Anna Lee',
      department: 'Purchasing',
      title: 'Purchasing Manager',
      decisionRole: 'decision_maker',
      purchasingInfluence: 'high',
      preferredLanguage: 'English',
      whatsapp: '+66 123 456 789',
      linkedin: 'https://linkedin.com/in/anna',
      contactStatus: 'active',
      marketingAllowed: false,
    })).resolves.toHaveLength(0);
  });

  it('rejects invalid purchasing influence and negative annual purchase values', async () => {
    await expect(contractErrors(CreateContactDto, {
      name: 'Anna Lee',
      purchasingInfluence: 'very-high',
    })).resolves.not.toHaveLength(0);
    await expect(contractErrors(CreateCustomerDto, {
      company: 'Acme Piping',
      annualPurchaseAmount: -1,
    })).resolves.not.toHaveLength(0);
  });
});
