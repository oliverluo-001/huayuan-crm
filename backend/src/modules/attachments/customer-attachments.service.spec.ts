import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  CustomerAttachmentsService,
  normalizeUploadedFilename,
} from "./customer-attachments.service";

describe("CustomerAttachmentsService", () => {
  let storageRoot: string;
  let records: any[];
  let service: CustomerAttachmentsService;
  const customersService = { assertCustomerOwner: jest.fn() };
  const repository = {
    create: jest.fn((value) => ({ ...value })),
    save: jest.fn(async (value) => {
      const saved = {
        id: records.length + 1,
        createdAt: new Date("2026-08-09T01:00:00Z"),
        ...value,
      };
      records.push(saved);
      return saved;
    }),
    find: jest.fn(async ({ where }: any) =>
      records.filter((item) => item.customerId === where.customerId),
    ),
    findOne: jest.fn(
      async ({ where }: any) =>
        records.find((item) => item.id === where.id) || null,
    ),
    delete: jest.fn(async (id: number) => {
      const before = records.length;
      records = records.filter((item) => item.id !== id);
      return { affected: before - records.length };
    }),
  };

  beforeEach(async () => {
    storageRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "huayuan-attachment-test-"),
    );
    records = [];
    jest.clearAllMocks();
    customersService.assertCustomerOwner.mockResolvedValue({
      id: 1,
      ownerId: "7",
    });
    service = new CustomerAttachmentsService(
      repository as any,
      customersService as any,
      {
        get: jest.fn((key: string) =>
          key === "CUSTOMER_ATTACHMENT_DIR" ? storageRoot : undefined,
        ),
      } as unknown as ConfigService,
    );
  });

  afterEach(async () => {
    await fs.rm(storageRoot, { recursive: true, force: true });
  });

  it("stores, lists and downloads an owned customer attachment", async () => {
    const attachment = await service.create(
      1,
      {
        originalname: "RFQ 2026.pdf",
        mimetype: "application/pdf",
        size: 8,
        buffer: Buffer.from("pdf-data"),
      },
      { category: "inquiry", note: "客户询价单" },
      "7",
      "7",
    );

    expect(attachment).toMatchObject({
      customerId: 1,
      originalName: "RFQ 2026.pdf",
      category: "inquiry",
      note: "客户询价单",
    });
    await expect(
      fs.readFile(path.join(storageRoot, attachment.storedName), "utf8"),
    ).resolves.toBe("pdf-data");
    await expect(service.list(1, "7")).resolves.toHaveLength(1);
    await expect(
      service.getDownload(attachment.id, "7"),
    ).resolves.toMatchObject({ attachment });
    expect(customersService.assertCustomerOwner).toHaveBeenCalledWith(1, "7");
  });

  it("removes both the database record and stored file", async () => {
    const attachment = await service.create(
      1,
      {
        originalname: "drawing.dwg",
        mimetype: "application/octet-stream",
        size: 7,
        buffer: Buffer.from("drawing"),
      },
      { category: "drawing" },
      "7",
      "7",
    );
    const target = path.join(storageRoot, attachment.storedName);

    await expect(service.remove(attachment.id, "7")).resolves.toEqual({
      deleted: true,
    });
    await expect(fs.access(target)).rejects.toThrow();
    expect(records).toHaveLength(0);
  });

  it("rejects executable files and oversized files", async () => {
    await expect(
      service.create(
        1,
        {
          originalname: "payload.exe",
          size: 4,
          buffer: Buffer.from("nope"),
        },
        {},
        "7",
        "7",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.create(
        1,
        {
          originalname: "huge.pdf",
          size: 21 * 1024 * 1024,
          buffer: Buffer.from("nope"),
        },
        {},
        "7",
        "7",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(records).toHaveLength(0);
  });

  it("restores UTF-8 Chinese names received through multipart Latin-1", async () => {
    const expectedName = "技术图纸_法兰尺寸.xlsx";
    const multipartName = Buffer.from(expectedName, "utf8").toString("latin1");
    expect(normalizeUploadedFilename(multipartName)).toBe(expectedName);
    expect(normalizeUploadedFilename(expectedName)).toBe(expectedName);
    expect(normalizeUploadedFilename("café.pdf")).toBe("café.pdf");

    const attachment = await service.create(
      1,
      {
        originalname: multipartName,
        mimetype: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        size: 8,
        buffer: Buffer.from("xlsxdata"),
      },
      { category: "drawing" },
      "7",
      "7",
    );
    expect(attachment.originalName).toBe(expectedName);

    records[0].originalName = multipartName;
    await expect(service.list(1, "7")).resolves.toEqual([
      expect.objectContaining({ originalName: expectedName }),
    ]);
    await expect(service.getDownload(attachment.id, "7")).resolves.toEqual(
      expect.objectContaining({
        attachment: expect.objectContaining({ originalName: expectedName }),
      }),
    );
  });
});
