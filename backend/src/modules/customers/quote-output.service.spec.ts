import ExcelJS from "exceljs";
import { normalizeQuoteOutputProfile } from "../settings/quote-output-profile";
import { QuoteOutputService } from "./quote-output.service";

describe("QuoteOutputService", () => {
  const profile = normalizeQuoteOutputProfile({
    companyNameZh: "华源法兰",
    companyNameEn: "Huayuan Flange",
    bankName: "Bank of China",
    accountName: "Huayuan Flange Co., Ltd.",
    accountNumber: "123456789",
    swiftCode: "BKCHCNBJ",
    contactName: "Zachary",
    contactEmail: "sales@huayuanflange.com",
  });

  const settingsService = {
    getQuoteOutputProfile: jest.fn().mockResolvedValue(profile),
    getQuoteOutputAsset: jest.fn().mockRejectedValue(new Error("not configured")),
  };
  const attachmentRepository = {
    find: jest.fn().mockResolvedValue([]),
  };
  const productRepository = {
    createQueryBuilder: jest.fn(),
  };
  const configService = { get: jest.fn().mockReturnValue(undefined) };
  const service = new QuoteOutputService(
    settingsService as any,
    configService as any,
    attachmentRepository as any,
    productRepository as any,
  );

  const customer = {
    id: 1,
    company: "VSteel Metal Asia",
    contact: "Anna",
    email: "anna@example.com",
    region: "Bangkok",
  };
  const quote = {
    id: 9,
    quoteNo: "Q-20260814-001",
    customerId: 1,
    currency: "USD",
    baseCurrency: "CNY",
    exchangeRate: 7.2,
    incoterm: "FOB",
    originPort: "Shanghai",
    destinationPort: "Bangkok",
    createdAt: new Date("2026-08-14T08:00:00Z"),
    validUntil: new Date("2026-09-14T00:00:00Z"),
    subtotal: 1800,
    freight: 120,
    additionalCharges: [{ label: "Document fee", amount: 30 }],
    additionalFeeTotal: 30,
    taxRate: 0,
    taxAmount: 0,
    total: 1950,
    deliveryTime: "30 days after deposit",
    paymentTerms: "30% deposit, balance before shipment",
    packagingTerms: "Export wooden cases",
    warrantyTerms: "12 months after shipment",
    notes: "含产品证书。",
    notesEn: "Certificates included.",
    terms: "价格以最终订单确认为准。",
    termsEn: "Prices are subject to final order confirmation.",
    items: [
      {
        productName: "Weld Neck Flange",
        sku: "WN-ASME-150",
        standard: "ASME B16.5",
        material: "A105",
        pressureRating: "Class 150",
        nominalSize: '4"',
        unit: "pcs",
        quantity: 100,
        unitPrice: 18,
        discount: 0,
        subtotal: 1800,
        sortOrder: 0,
      },
    ],
  };

  it("renders a printable branded quotation HTML", async () => {
    const html = await service.renderHtml(quote as any, customer as any, "bilingual", "preview");
    expect(html).toContain("window.print()");
    expect(html).toContain("VSteel Metal Asia");
    expect(html).toContain("Bank of China");
    expect(html).toContain("Weld Neck Flange");
  });

  it("creates a PDF buffer with Chinese font support", async () => {
    const buffer = await service.createPdfBuffer(quote as any, customer as any, "bilingual");
    expect(buffer.subarray(0, 4).toString()).toBe("%PDF");
    expect(buffer.length).toBeGreaterThan(20_000);
  });

  it("creates an editable Excel quotation with formulas", async () => {
    const buffer = await service.createExcelBuffer(quote as any, customer as any, "bilingual");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet("Quotation");
    expect(sheet?.getCell("A1").value).toContain("报价单");
    expect(sheet?.getCell("B10").value).toContain("Weld Neck Flange");
    expect(sheet?.getCell("G10").value).toMatchObject({ formula: "D10*E10*(1-F10)" });
  });

  it("packages quote outputs into a zip archive", async () => {
    const pack = await service.createQuotePackage(quote as any, customer as any, "bilingual");
    expect(pack.fileName).toBe("quotation-Q-20260814-001.zip");
    expect(pack.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(pack.buffer.length).toBeGreaterThan(30_000);
  });
});
