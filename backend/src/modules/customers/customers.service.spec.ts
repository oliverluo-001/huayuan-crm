import * as xlsx from 'xlsx';
import { CustomersService } from './customers.service';

function upload(rows: Record<string, unknown>[]) {
  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, xlsx.utils.json_to_sheet(rows), 'Customers');
  return {
    fieldname: 'file',
    originalname: 'customers.xlsx',
    encoding: '7bit',
    mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: xlsx.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    size: 1,
  } as any;
}

describe('CustomersService imports', () => {
  const customerRepository = {
    find: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => value),
  };

  const service = new CustomersService(
    customerRepository as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );

  beforeEach(() => jest.clearAllMocks());

  it('reads in-memory Excel uploads and detects normalized duplicate emails', async () => {
    customerRepository.find.mockResolvedValue([
      { id: 1, company: 'Existing Co', email: 'sales@example.com' },
    ]);

    const result = await service.parseAndPreview(upload([
      { 公司名称: '新公司', 邮箱: ' SALES@EXAMPLE.COM ' },
      { Company: 'Second row', Email: 'sales@example.com' },
    ]));

    expect(result.total).toBe(2);
    expect(result.withEmail).toBe(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.duplicateUploadCount).toBe(1);
  });

  it('merges non-empty imported profile data without resetting CRM state', async () => {
    const existing = {
      id: 1,
      customerId: 'cus_1',
      company: 'Original Company',
      contact: 'Original Contact',
      email: 'sales@example.com',
      phone: '123',
      journeyStage: 'contacted',
      ownerId: 'user_1',
      emailStatus: 'valid',
      source: 'manual',
    };
    customerRepository.find.mockResolvedValue([existing]);

    const result = await service.parseAndImport(upload([
      {
        Company: 'Updated Company',
        Email: ' SALES@EXAMPLE.COM ',
        Phone: '',
        Website: 'https://example.com',
      },
    ]));

    expect(result).toEqual({ created: 0, updated: 1, skipped: 0, total: 1 });
    expect(existing).toMatchObject({
      company: 'Updated Company',
      contact: 'Original Contact',
      phone: '123',
      website: 'https://example.com',
      journeyStage: 'contacted',
      ownerId: 'user_1',
      emailStatus: 'valid',
    });
  });

  it('does not overwrite a duplicate email owned by another salesperson', async () => {
    const existing = {
      id: 2,
      customerId: 'cus_2',
      company: 'Protected Account',
      email: 'buyer@example.com',
      ownerId: '8',
    };
    customerRepository.find.mockResolvedValue([existing]);

    const result = await service.parseAndImport(upload([
      { Company: 'Incoming Override', Email: 'buyer@example.com' },
    ]), '7');

    expect(result).toEqual({ created: 0, updated: 0, skipped: 1, total: 1 });
    expect(existing.company).toBe('Protected Account');
    expect(customerRepository.save).not.toHaveBeenCalled();
  });
});
