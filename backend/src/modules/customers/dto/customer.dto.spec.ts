import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateContactDto,
  CreateCustomerDto,
  CreateOpportunityDto,
  CreateQuoteDto,
  CreateQuoteTermTemplateDto,
  UpdateContactDto,
  UpdateOpportunityDto,
  UpdateQuoteDto,
  UpdateSampleDto,
  DuplicateCustomerPreviewDto,
  MergeDuplicateCustomersDto,
} from './customer.dto';

async function contractErrors<T extends object>(
  type: new () => T,
  payload: object,
) {
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
    await expect(
      contractErrors(type as new () => object, payload),
    ).resolves.toHaveLength(0);
  });

  it('accepts nested quote items and rejects the retired flat product contract', async () => {
    const valid = await contractErrors(CreateQuoteDto, {
      customerId: 1,
      currency: 'USD',
      baseCurrency: 'CNY',
      exchangeRate: 7.2,
      freight: 20,
      additionalCharges: [{ label: 'Documentation', amount: 15 }],
      taxRate: 13,
      incoterm: 'CIF',
      originPort: 'Shanghai',
      destinationPort: 'Bangkok',
      deliveryTime: '30 days after deposit',
      paymentTerms: '30% deposit, 70% before shipment',
      packagingTerms: 'Fumigated wooden cases',
      warrantyTerms: '12 months after shipment',
      notes: '中文备注',
      notesEn: 'English notes',
      terms: '中文条款',
      termsEn: 'English terms',
      items: [
        {
          productName: 'Weld Neck Flange',
          quantity: 2,
          unitPrice: 100,
          discount: 5,
        },
      ],
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

  it('validates reusable bilingual company quote terms', async () => {
    await expect(
      contractErrors(CreateQuoteTermTemplateDto, {
        name: 'Standard export terms',
        contentZh: '中文公司条款',
        contentEn: 'English company terms',
        isDefault: true,
      }),
    ).resolves.toHaveLength(0);
  });

  it('accepts the P1.2 customer and contact master-data contract', async () => {
    await expect(
      contractErrors(CreateCustomerDto, {
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
      }),
    ).resolves.toHaveLength(0);

    await expect(
      contractErrors(CreateContactDto, {
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
      }),
    ).resolves.toHaveLength(0);
  });

  it('accepts the P1.4 opportunity management contract', async () => {
    await expect(
      contractErrors(CreateOpportunityDto, {
        customerId: 1,
        name: 'Annual flange order',
        amount: 12800,
        stage: 'proposal',
        probability: 60,
        ownerId: '7',
        collaboratorIds: ['8'],
        productName: 'Weld neck flange',
        productSpecification: 'ASTM A105, DN50, PN16',
        expectedQuantity: 500,
        quantityUnit: 'pcs',
        targetPrice: 25,
        currency: 'USD',
        budget: 15000,
        purchaseTime: '2026 Q4',
        decisionProcess: 'Engineering approval then purchasing director',
        nextStepAction: 'Confirm drawing',
        nextStepDueDate: '2026-08-20',
        expectedCloseDate: '2026-09-30',
        forecastCategory: 'best_case',
        competitors: 'Competitor A',
      }),
    ).resolves.toHaveLength(0);
  });

  it('requires an expected close date for every new opportunity', async () => {
    await expect(
      contractErrors(CreateOpportunityDto, {
        customerId: 1,
        name: 'Annual flange order',
        nextStepAction: 'Confirm drawing',
      }),
    ).resolves.not.toHaveLength(0);
  });

  it('rejects invalid purchasing influence and negative annual purchase values', async () => {
    await expect(
      contractErrors(CreateContactDto, {
        name: 'Anna Lee',
        purchasingInfluence: 'very-high',
      }),
    ).resolves.not.toHaveLength(0);
    await expect(
      contractErrors(CreateCustomerDto, {
        company: 'Acme Piping',
        annualPurchaseAmount: -1,
      }),
    ).resolves.not.toHaveLength(0);
  });

  it('validates duplicate preview and explicit merge confirmation contracts', async () => {
    await expect(
      contractErrors(DuplicateCustomerPreviewDto, {
        primaryCustomerId: 1,
        duplicateCustomerIds: [2, 3],
      }),
    ).resolves.toHaveLength(0);
    await expect(
      contractErrors(MergeDuplicateCustomersDto, {
        primaryCustomerId: 1,
        duplicateCustomerIds: [2],
        previewToken: 'preview-token',
        fieldSelections: { company: 1, email: 2 },
        primaryContactSelection: 'contact:8',
        acknowledgeConflicts: true,
      }),
    ).resolves.toHaveLength(0);
    await expect(
      contractErrors(MergeDuplicateCustomersDto, {
        primaryCustomerId: 1,
        duplicateCustomerIds: [],
        previewToken: 'preview-token',
        fieldSelections: {},
        primaryContactSelection: 'none',
        acknowledgeConflicts: false,
      }),
    ).resolves.not.toHaveLength(0);
  });
});
