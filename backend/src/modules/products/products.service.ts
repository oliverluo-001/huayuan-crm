import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { Not, Repository } from 'typeorm';
import {
  CreateProductAssetDto,
  CreateProductDto,
  ProductCurrencyPriceDto,
  ProductDescriptionTemplateDto,
  ProductSpecificationDto,
  ProductVariantDto,
  UpdateProductDto,
} from './dto';
import { Product, ProductAsset, ProductVariant } from './entities';

const MAX_ASSET_SIZE = 20 * 1024 * 1024;
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const TECHNICAL_EXTENSIONS = new Set([
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt', '.dwg', '.dxf',
  '.step', '.stp', '.iges', '.igs', '.zip',
]);

interface UploadedAsset {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer?: Buffer;
}

function normalizedFilename(value: string) {
  const original = path.basename(String(value || ''));
  if (!original || Array.from(original).some((character) => character.charCodeAt(0) > 255)) {
    return original;
  }
  const decoded = Buffer.from(original, 'latin1').toString('utf8');
  if (decoded.includes('\uFFFD')) return original;
  const roundTrip = Buffer.from(decoded, 'utf8').toString('latin1');
  return /[\u0080-\u00ff]/.test(original) && roundTrip === original ? decoded : original;
}

@Injectable()
export class ProductsService {
  private readonly storageRoot: string;

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(ProductVariant)
    private readonly variantRepository: Repository<ProductVariant>,
    @InjectRepository(ProductAsset)
    private readonly assetRepository: Repository<ProductAsset>,
    configService: ConfigService,
  ) {
    this.storageRoot = path.resolve(
      configService.get<string>('PRODUCT_ASSET_DIR') ||
        path.join(process.cwd(), 'storage', 'product-assets'),
    );
  }

  async findAll(filters: Record<string, any> = {}, includeCost = true) {
    const query = this.productRepository
      .createQueryBuilder('product')
      .leftJoinAndSelect('product.variants', 'variant')
      .leftJoinAndSelect('product.assets', 'asset')
      .distinct(true);

    if (filters.q) {
      query.andWhere(
        '(product.sku LIKE :q OR product.code LIKE :q OR product.name LIKE :q OR product.category LIKE :q OR variant.sku LIKE :q OR variant.standard LIKE :q OR variant.material LIKE :q OR variant.nominalSize LIKE :q)',
        { q: `%${String(filters.q).trim()}%` },
      );
    }
    if (filters.category) query.andWhere('product.category = :category', { category: filters.category });
    if (filters.productType) query.andWhere('product.productType = :productType', { productType: filters.productType });
    if (filters.standard) query.andWhere('variant.standard = :standard', { standard: filters.standard });
    if (filters.material) query.andWhere('variant.material = :material', { material: filters.material });
    if (filters.active !== undefined && filters.active !== '') {
      query.andWhere('product.active = :active', {
        active: ['true', '1', true, 1].includes(filters.active),
      });
    }

    const products = await query
      .orderBy('product.createdAt', 'DESC')
      .addOrderBy('variant.sku', 'ASC')
      .getMany();
    return products.map((product) => this.serialize(product, includeCost));
  }

  async findOne(id: number, includeCost = true) {
    const product = await this.findEntity(id);
    return this.serialize(product, includeCost);
  }

  async create(dto: CreateProductDto) {
    const normalized = this.normalizeMaster(dto);
    await this.assertUniqueSku(normalized.sku);
    const variants = dto.variants || [];
    const entityData: Partial<Product> = {
      ...normalized,
      productId: this.generateId('prod'),
      variants: [],
      assets: [],
    };
    const entity = this.productRepository.create(entityData);
    const product = await this.productRepository.save(entity);
    await this.replaceVariants(product.id, product, variants);
    return this.findOne(product.id);
  }

  async update(id: number, dto: UpdateProductDto) {
    const product = await this.findEntity(id);
    const merged: any = {
      ...product,
      ...dto,
      sku: dto.sku ?? product.sku,
      name: dto.name ?? product.name,
    };
    if (dto.price !== undefined && dto.prices === undefined) {
      const currency = String(dto.currency || product.currency || 'USD').trim().toUpperCase();
      const existingPrices = (product.prices || []).filter((item) => item.currency !== currency);
      merged.prices = [...existingPrices, { currency, referencePrice: dto.price }];
    }
    const normalized = this.normalizeMaster(merged);
    await this.assertUniqueSku(normalized.sku, id);
    const variants = dto.variants;
    delete (normalized as any).variants;
    delete (normalized as any).assets;
    Object.assign(product, normalized);
    product.variants = undefined as any;
    product.assets = undefined as any;
    await this.productRepository.save(product);
    if (variants !== undefined) await this.replaceVariants(id, product, variants);
    return this.findOne(id);
  }

  async remove(id: number) {
    const product = await this.findEntity(id);
    const storedNames = (product.assets || []).map((asset) => asset.storedName);
    await this.productRepository.remove(product);
    await Promise.all(
      storedNames.map((storedName) =>
        fs.unlink(this.resolveStoredPath(storedName)).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
        }),
      ),
    );
    return { deleted: true };
  }

  async listAssets(productId: number) {
    await this.findEntity(productId);
    const assets = await this.assetRepository.find({
      where: { productPk: productId },
      order: { createdAt: 'DESC' },
    });
    return assets.map((asset) => this.serializeAsset(asset));
  }

  async createAsset(
    productId: number,
    file: UploadedAsset | undefined,
    dto: CreateProductAssetDto,
    createdBy = '',
  ) {
    await this.findEntity(productId);
    this.validateAsset(file, dto.assetType);
    const assetId = randomUUID().replace(/-/g, '').slice(0, 24);
    const originalName = normalizedFilename(file!.originalname).slice(0, 255);
    const extension = path.extname(originalName).toLowerCase();
    const storedName = `${assetId}${extension}`;
    const target = this.resolveStoredPath(storedName);
    await fs.mkdir(this.storageRoot, { recursive: true });
    await fs.writeFile(target, file!.buffer!);
    try {
      const saved = await this.assetRepository.save(
        this.assetRepository.create({
          assetId,
          productPk: productId,
          assetType: dto.assetType,
          originalName,
          storedName,
          mimeType: (file!.mimetype || 'application/octet-stream').slice(0, 160),
          size: file!.size,
          note: dto.note?.trim() || null,
          createdBy,
        }),
      );
      return this.serializeAsset(saved);
    } catch (error) {
      await fs.unlink(target).catch(() => undefined);
      throw error;
    }
  }

  async getAssetDownload(id: number) {
    const asset = await this.findAsset(id);
    const filePath = this.resolveStoredPath(asset.storedName);
    try {
      await fs.access(filePath);
    } catch {
      throw new NotFoundException('产品资料文件不存在');
    }
    return { asset: this.serializeAsset(asset), filePath };
  }

  async removeAsset(id: number) {
    const asset = await this.findAsset(id);
    await this.assetRepository.remove(asset);
    await fs.unlink(this.resolveStoredPath(asset.storedName)).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
    return { deleted: true };
  }

  private async findEntity(id: number) {
    const product = await this.productRepository.findOne({ where: { id } });
    if (!product) throw new NotFoundException('产品不存在');
    return product;
  }

  private async findAsset(id: number) {
    const asset = await this.assetRepository.findOne({ where: { id } });
    if (!asset) throw new NotFoundException('产品资料不存在');
    return asset;
  }

  private async assertUniqueSku(sku: string, excludeId?: number) {
    const existing = await this.productRepository.findOne({
      where: excludeId ? { sku, id: Not(excludeId) } : { sku },
    });
    if (existing) throw new ConflictException(`产品 SKU ${sku} 已存在`);
    const variant = await this.variantRepository.findOne({ where: { sku } });
    if (variant) throw new ConflictException(`产品 SKU ${sku} 已被规格 SKU 使用`);
  }

  private async replaceVariants(productId: number, product: Product, variants: ProductVariantDto[]) {
    const normalized = variants.map((variant) => this.normalizeVariant(variant));
    const skuSet = new Set<string>();
    for (const variant of normalized) {
      if (variant.sku === product.sku) throw new ConflictException(`规格 SKU ${variant.sku} 与产品 SKU 重复`);
      if (skuSet.has(variant.sku)) throw new ConflictException(`规格 SKU ${variant.sku} 重复`);
      skuSet.add(variant.sku);
      const existing = await this.variantRepository.findOne({ where: { sku: variant.sku } });
      if (existing && existing.productPk !== productId) {
        throw new ConflictException(`规格 SKU ${variant.sku} 已被其他产品使用`);
      }
    }
    await this.variantRepository.delete({ productPk: productId });
    if (!normalized.length) {
      product.variants = [];
      return;
    }
    product.variants = await this.variantRepository.save(
      normalized.map((variant) =>
        this.variantRepository.create({
          ...variant,
          variantId: variant.variantId || this.generateId('var'),
          productPk: productId,
          product,
        }),
      ),
    );
  }

  private normalizeMaster(dto: any) {
    const prices = this.normalizePrices(dto.prices, dto.currency, dto.price);
    const currency = String(dto.currency || prices[0]?.currency || 'USD').trim().toUpperCase();
    const matchingPrice = prices.find((item) => item.currency === currency);
    return {
      ...dto,
      sku: String(dto.sku).trim().toUpperCase(),
      code: String(dto.code || dto.sku).trim(),
      name: String(dto.name).trim(),
      category: String(dto.category || '').trim(),
      productType: dto.productType || 'general',
      unit: String(dto.unit || 'pcs').trim(),
      weight: Number(dto.weight || 0),
      weightUnit: String(dto.weightUnit || 'kg').trim(),
      packaging: String(dto.packaging || '').trim(),
      packageQuantity: Number(dto.packageQuantity || 0),
      baseCost: Number(dto.baseCost || 0),
      costCurrency: String(dto.costCurrency || 'USD').trim().toUpperCase(),
      price: Number(matchingPrice?.referencePrice ?? dto.price ?? prices[0]?.referencePrice ?? 0),
      currency,
      prices,
      standards: this.uniqueStrings(dto.standards),
      materials: this.uniqueStrings(dto.materials),
      specifications: this.normalizeSpecifications(dto.specifications),
      descriptionTemplates: this.normalizeTemplates(dto.descriptionTemplates),
      description: dto.description?.trim() || null,
      active: dto.active ?? true,
    };
  }

  private normalizeVariant(dto: ProductVariantDto) {
    const prices = this.normalizePrices(dto.prices);
    const normalized = {
      ...dto,
      variantId: dto.variantId?.trim(),
      sku: String(dto.sku).trim().toUpperCase(),
      name: String(dto.name || '').trim(),
      standard: String(dto.standard || '').trim(),
      material: String(dto.material || '').trim(),
      pressureRating: String(dto.pressureRating || '').trim(),
      nominalSize: String(dto.nominalSize || '').trim(),
      facing: String(dto.facing || '').trim(),
      surfaceTreatment: String(dto.surfaceTreatment || '').trim(),
      unit: String(dto.unit || 'pcs').trim(),
      weight: Number(dto.weight || 0),
      weightUnit: String(dto.weightUnit || 'kg').trim(),
      packaging: String(dto.packaging || '').trim(),
      packageQuantity: Number(dto.packageQuantity || 0),
      baseCost: Number(dto.baseCost || 0),
      costCurrency: String(dto.costCurrency || 'USD').trim().toUpperCase(),
      prices,
      specifications: this.normalizeSpecifications(dto.specifications),
      inspectionRequirements: dto.inspectionRequirements?.trim() || null,
      certificateRequirements: dto.certificateRequirements?.trim() || null,
      quoteDescription: dto.quoteDescription?.trim() || '',
      active: dto.active ?? true,
    };
    if (!normalized.quoteDescription) normalized.quoteDescription = this.buildQuoteDescription(normalized);
    return normalized;
  }

  private normalizePrices(
    values?: ProductCurrencyPriceDto[] | null,
    legacyCurrency?: string,
    legacyPrice?: number,
  ) {
    const byCurrency = new Map<string, number>();
    for (const value of values || []) {
      const currency = String(value.currency || '').trim().toUpperCase();
      if (currency) byCurrency.set(currency, Number(value.referencePrice || 0));
    }
    if (!byCurrency.size && (legacyCurrency || legacyPrice !== undefined)) {
      byCurrency.set(String(legacyCurrency || 'USD').trim().toUpperCase(), Number(legacyPrice || 0));
    }
    return Array.from(byCurrency, ([currency, referencePrice]) => ({ currency, referencePrice }));
  }

  private normalizeSpecifications(values?: ProductSpecificationDto[] | null) {
    return (values || [])
      .map((item) => ({
        name: String(item.name || '').trim(),
        value: String(item.value || '').trim(),
        unit: item.unit?.trim() || undefined,
      }))
      .filter((item) => item.name && item.value);
  }

  private normalizeTemplates(values?: ProductDescriptionTemplateDto[] | null) {
    return (values || [])
      .map((item) => ({
        id: item.id?.trim() || this.generateId('desc'),
        name: String(item.name || '').trim(),
        content: String(item.content || '').trim(),
      }))
      .filter((item) => item.name && item.content);
  }

  private uniqueStrings(values?: string[] | null) {
    return Array.from(new Set((values || []).map((value) => String(value).trim()).filter(Boolean)));
  }

  private buildQuoteDescription(variant: Record<string, any>) {
    const details = [
      variant.standard,
      variant.material,
      variant.pressureRating,
      variant.nominalSize,
      variant.facing,
      variant.surfaceTreatment,
    ].filter(Boolean);
    const requirements = [
      variant.inspectionRequirements && `Inspection: ${variant.inspectionRequirements}`,
      variant.certificateRequirements && `Certificates: ${variant.certificateRequirements}`,
    ].filter(Boolean);
    return [...details, ...requirements].join(', ');
  }

  private serialize(product: Product, includeCost: boolean) {
    const variants = [...(product.variants || [])]
      .sort((a, b) => a.sku.localeCompare(b.sku))
      .map((variant) => {
        const { product: _product, ...plain } = variant as any;
        return plain;
      });
    const result: any = {
      ...product,
      variants,
      assets: [...(product.assets || [])]
        .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
        .map((asset) => this.serializeAsset(asset)),
    };
    if (!includeCost) {
      delete result.baseCost;
      delete result.costCurrency;
      result.variants = result.variants.map((variant: ProductVariant) => {
        const sanitized: any = { ...variant };
        delete sanitized.baseCost;
        delete sanitized.costCurrency;
        return sanitized;
      });
    }
    return result;
  }

  private serializeAsset(asset: ProductAsset) {
    const { product: _product, ...plain } = asset as any;
    return { ...plain, originalName: normalizedFilename(asset.originalName) };
  }

  private validateAsset(file: UploadedAsset | undefined, assetType: 'image' | 'technical') {
    if (!file?.buffer?.length) throw new BadRequestException('请选择需要上传的产品资料');
    if (file.size <= 0 || file.size > MAX_ASSET_SIZE) {
      throw new BadRequestException('产品资料大小必须在 20MB 以内');
    }
    const extension = path.extname(normalizedFilename(file.originalname)).toLowerCase();
    const allowed = assetType === 'image' ? IMAGE_EXTENSIONS : TECHNICAL_EXTENSIONS;
    if (!allowed.has(extension)) {
      throw new BadRequestException(
        assetType === 'image'
          ? '产品图片仅支持 PNG、JPG、JPEG 或 WEBP'
          : '技术资料格式不受支持，请上传 PDF、Office 文档、图纸或压缩包',
      );
    }
  }

  private resolveStoredPath(storedName: string) {
    if (path.basename(storedName) !== storedName) throw new BadRequestException('产品资料路径无效');
    const resolved = path.resolve(this.storageRoot, storedName);
    if (!resolved.startsWith(`${this.storageRoot}${path.sep}`)) {
      throw new BadRequestException('产品资料路径无效');
    }
    return resolved;
  }

  private generateId(prefix: string) {
    return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
}
