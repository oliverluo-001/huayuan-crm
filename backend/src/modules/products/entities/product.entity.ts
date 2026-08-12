import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalNumberTransformer } from '../../../common/database/decimal-number.transformer';

export interface ProductCurrencyPrice {
  currency: string;
  referencePrice: number;
}

export interface ProductSpecification {
  name: string;
  value: string;
  unit?: string;
}

export interface ProductDescriptionTemplate {
  id: string;
  name: string;
  content: string;
}

@Entity('products')
@Index('idx_products_category_active', ['category', 'active'])
export class Product {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'product_id', type: 'varchar', length: 32, unique: true })
  productId: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  category: string;

  @Column({ name: 'product_type', type: 'varchar', length: 32, default: 'general' })
  productType: 'general' | 'flange';

  @Column({ type: 'varchar', length: 20, default: 'pcs' })
  unit: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  weight: number;

  @Column({ name: 'weight_unit', type: 'varchar', length: 20, default: 'kg' })
  weightUnit: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  packaging: string;

  @Column({
    name: 'package_quantity',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  packageQuantity: number;

  @Column({
    name: 'base_cost',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  baseCost: number;

  @Column({ name: 'cost_currency', type: 'varchar', length: 10, default: 'USD' })
  costCurrency: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  price: number;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'json', nullable: true })
  prices: ProductCurrencyPrice[] | null;

  @Column({ type: 'json', nullable: true })
  standards: string[] | null;

  @Column({ type: 'json', nullable: true })
  materials: string[] | null;

  @Column({ type: 'json', nullable: true })
  specifications: ProductSpecification[] | null;

  @Column({ name: 'description_templates', type: 'json', nullable: true })
  descriptionTemplates: ProductDescriptionTemplate[] | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @OneToMany(() => ProductVariant, (variant) => variant.product, {
    cascade: true,
    eager: true,
  })
  variants: ProductVariant[];

  @OneToMany(() => ProductAsset, (asset) => asset.product, { eager: true })
  assets: ProductAsset[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('product_variants')
@Index('idx_product_variants_product_active', ['productPk', 'active'])
export class ProductVariant {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'variant_id', type: 'varchar', length: 32, unique: true })
  variantId: string;

  @Column({ name: 'product_pk', type: 'int' })
  productPk: number;

  @Column({ type: 'varchar', length: 100, unique: true })
  sku: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  name: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  standard: string;

  @Column({ type: 'varchar', length: 120, default: '' })
  material: string;

  @Column({ name: 'pressure_rating', type: 'varchar', length: 80, default: '' })
  pressureRating: string;

  @Column({ name: 'nominal_size', type: 'varchar', length: 80, default: '' })
  nominalSize: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  facing: string;

  @Column({ name: 'surface_treatment', type: 'varchar', length: 160, default: '' })
  surfaceTreatment: string;

  @Column({ type: 'varchar', length: 20, default: 'pcs' })
  unit: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 3,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  weight: number;

  @Column({ name: 'weight_unit', type: 'varchar', length: 20, default: 'kg' })
  weightUnit: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  packaging: string;

  @Column({
    name: 'package_quantity',
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  packageQuantity: number;

  @Column({
    name: 'base_cost',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  baseCost: number;

  @Column({ name: 'cost_currency', type: 'varchar', length: 10, default: 'USD' })
  costCurrency: string;

  @Column({ type: 'json', nullable: true })
  prices: ProductCurrencyPrice[] | null;

  @Column({ type: 'json', nullable: true })
  specifications: ProductSpecification[] | null;

  @Column({ name: 'inspection_requirements', type: 'text', nullable: true })
  inspectionRequirements: string | null;

  @Column({ name: 'certificate_requirements', type: 'text', nullable: true })
  certificateRequirements: string | null;

  @Column({ name: 'quote_description', type: 'text', nullable: true })
  quoteDescription: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @ManyToOne(() => Product, (product) => product.variants, {
    onDelete: 'CASCADE',
    orphanedRowAction: 'delete',
  })
  @JoinColumn({ name: 'product_pk' })
  product: Product;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export type ProductAssetType = 'image' | 'technical';

@Entity('product_assets')
@Index('idx_product_assets_product', ['productPk', 'createdAt'])
export class ProductAsset {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'asset_id', type: 'varchar', length: 32, unique: true })
  assetId: string;

  @Column({ name: 'product_pk', type: 'int' })
  productPk: number;

  @Column({ name: 'asset_type', type: 'enum', enum: ['image', 'technical'] })
  assetType: ProductAssetType;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  @Column({ name: 'stored_name', type: 'varchar', length: 255, unique: true })
  storedName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 160, default: 'application/octet-stream' })
  mimeType: string;

  @Column({ type: 'int', unsigned: true })
  size: number;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  note: string | null;

  @Column({ name: 'created_by', type: 'varchar', length: 32, default: '' })
  createdBy: string;

  @ManyToOne(() => Product, (product) => product.assets, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_pk' })
  product: Product;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
