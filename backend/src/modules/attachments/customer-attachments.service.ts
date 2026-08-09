import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Repository } from "typeorm";
import { CustomersService } from "../customers/customers.service";
import { CustomerAttachment } from "./customer-attachment.entity";
import { CreateCustomerAttachmentDto } from "./customer-attachments.dto";

const MAX_ATTACHMENT_SIZE = 20 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
  ".dwg",
  ".dxf",
  ".step",
  ".stp",
  ".iges",
  ".igs",
  ".zip",
]);

interface UploadedAttachment {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer?: Buffer;
}

export function normalizeUploadedFilename(value: string) {
  const original = path.basename(String(value || ""));
  if (!original || Array.from(original).some((character) => character.charCodeAt(0) > 255)) {
    return original;
  }

  const decoded = Buffer.from(original, "latin1").toString("utf8");
  if (decoded.includes("\uFFFD")) return original;
  const roundTrip = Buffer.from(decoded, "utf8").toString("latin1");
  const containsExtendedBytes = /[\u0080-\u00ff]/.test(original);
  return containsExtendedBytes && roundTrip === original ? decoded : original;
}

@Injectable()
export class CustomerAttachmentsService {
  private readonly storageRoot: string;

  constructor(
    @InjectRepository(CustomerAttachment)
    private readonly attachmentRepository: Repository<CustomerAttachment>,
    private readonly customersService: CustomersService,
    configService: ConfigService,
  ) {
    this.storageRoot = path.resolve(
      configService.get<string>("CUSTOMER_ATTACHMENT_DIR") ||
        path.join(process.cwd(), "storage", "customer-attachments"),
    );
  }

  async list(customerId: number, ownerId?: string) {
    await this.customersService.assertCustomerOwner(customerId, ownerId);
    const attachments = await this.attachmentRepository.find({
      where: { customerId },
      order: { createdAt: "DESC" },
    });
    return attachments.map((attachment) => ({
      ...attachment,
      originalName: normalizeUploadedFilename(attachment.originalName),
    }));
  }

  async create(
    customerId: number,
    file: UploadedAttachment | undefined,
    dto: CreateCustomerAttachmentDto,
    ownerId?: string,
    createdBy = "",
  ) {
    await this.customersService.assertCustomerOwner(customerId, ownerId);
    this.validateFile(file);

    const attachmentId = randomUUID().replace(/-/g, "").slice(0, 24);
    const originalName = normalizeUploadedFilename(file!.originalname).slice(0, 255);
    const extension = path.extname(originalName).toLowerCase();
    const storedName = `${attachmentId}${extension}`;
    const target = this.resolveStoredPath(storedName);
    await fs.mkdir(this.storageRoot, { recursive: true });
    await fs.writeFile(target, file!.buffer!);

    try {
      return await this.attachmentRepository.save(
        this.attachmentRepository.create({
          attachmentId,
          customerId,
          originalName,
          storedName,
          mimeType: (file!.mimetype || "application/octet-stream").slice(
            0,
            160,
          ),
          size: file!.size,
          category: dto.category || "other",
          note: dto.note?.trim() || null,
          createdBy,
        }),
      );
    } catch (error) {
      await fs.unlink(target).catch(() => undefined);
      throw error;
    }
  }

  async getDownload(id: number, ownerId?: string) {
    const attachment = await this.findOwned(id, ownerId);
    attachment.originalName = normalizeUploadedFilename(attachment.originalName);
    const filePath = this.resolveStoredPath(attachment.storedName);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException("附件文件不存在");
    }
    return { attachment, filePath };
  }

  async remove(id: number, ownerId?: string) {
    const attachment = await this.findOwned(id, ownerId);
    const result = await this.attachmentRepository.delete(id);
    if (!result.affected) throw new NotFoundException("附件不存在");
    await fs
      .unlink(this.resolveStoredPath(attachment.storedName))
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
      });
    return { deleted: true };
  }

  private async findOwned(id: number, ownerId?: string) {
    const attachment = await this.attachmentRepository.findOne({
      where: { id },
    });
    if (!attachment) throw new NotFoundException("附件不存在");
    await this.customersService.assertCustomerOwner(
      attachment.customerId,
      ownerId,
    );
    return attachment;
  }

  private validateFile(file?: UploadedAttachment) {
    if (!file?.buffer?.length)
      throw new BadRequestException("请选择需要上传的附件");
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) {
      throw new BadRequestException("附件大小必须在 20MB 以内");
    }
    const extension = path.extname(normalizeUploadedFilename(file.originalname)).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      throw new BadRequestException(
        "不支持该文件格式，请上传询价单、图纸、表格、文档或压缩包",
      );
    }
  }

  private resolveStoredPath(storedName: string) {
    if (path.basename(storedName) !== storedName)
      throw new BadRequestException("附件路径无效");
    const resolved = path.resolve(this.storageRoot, storedName);
    if (!resolved.startsWith(`${this.storageRoot}${path.sep}`))
      throw new BadRequestException("附件路径无效");
    return resolved;
  }
}
