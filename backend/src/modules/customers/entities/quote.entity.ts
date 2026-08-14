import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { decimalNumberTransformer } from '../../../common/database/decimal-number.transformer';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface QuoteAdditionalCharge {
  label: string;
  amount: number;
}

@Entity('quotes')
@Index('idx_quotes_term_template', ['termTemplateId'])
export class Quote {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'quote_id', type: 'varchar', length: 32, unique: true })
  quoteId: string;

  @Column({ name: 'quote_no', type: 'varchar', length: 50 })
  quoteNo: string;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ name: 'opportunity_id', type: 'varchar', length: 32, nullable: true })
  opportunityId: string | null;

  @Column({ type: 'enum', enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'], default: 'draft' })
  status: QuoteStatus;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ name: 'base_currency', type: 'varchar', length: 10, default: 'CNY' })
  baseCurrency: string;

  @Column({ name: 'exchange_rate', type: 'decimal', precision: 18, scale: 6, default: 1, transformer: decimalNumberTransformer })
  exchangeRate: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  freight: number;

  @Column({ name: 'additional_charges', type: 'json', nullable: true })
  additionalCharges: QuoteAdditionalCharge[] | null;

  @Column({ name: 'additional_fee_total', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  additionalFeeTotal: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decimalNumberTransformer })
  taxRate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  total: number;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: Date;

  @Column({ type: 'varchar', length: 20, default: '' })
  incoterm: string;

  @Column({ name: 'origin_port', type: 'varchar', length: 120, default: '' })
  originPort: string;

  @Column({ name: 'destination_port', type: 'varchar', length: 120, default: '' })
  destinationPort: string;

  @Column({ name: 'delivery_time', type: 'varchar', length: 255, default: '' })
  deliveryTime: string;

  @Column({ name: 'payment_terms', type: 'text', nullable: true })
  paymentTerms: string | null;

  @Column({ name: 'packaging_terms', type: 'text', nullable: true })
  packagingTerms: string | null;

  @Column({ name: 'warranty_terms', type: 'text', nullable: true })
  warrantyTerms: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'notes_en', type: 'text', nullable: true })
  notesEn: string | null;

  @Column({ type: 'text', nullable: true })
  terms: string;

  @Column({ name: 'terms_en', type: 'text', nullable: true })
  termsEn: string | null;

  @Column({ name: 'term_template_id', type: 'int', nullable: true })
  termTemplateId: number | null;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @OneToMany(() => QuoteItem, (item) => item.quote, { cascade: true, eager: true })
  items: QuoteItem[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

@Entity('quote_items')
export class QuoteItem {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'quote_id', type: 'int' })
  quoteId: number;

  @Column({ name: 'product_id', type: 'varchar', length: 32, nullable: true })
  productId: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  @Column({ name: 'product_code', type: 'varchar', length: 100, default: '' })
  productCode: string;

  @Column({ name: 'variant_id', type: 'varchar', length: 32, nullable: true })
  variantId: string | null;

  @Column({ type: 'varchar', length: 100, default: '' })
  sku: string;

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

  @Column({ type: 'decimal', precision: 12, scale: 3, default: 0, transformer: decimalNumberTransformer })
  weight: number;

  @Column({ name: 'weight_unit', type: 'varchar', length: 20, default: 'kg' })
  weightUnit: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  packaging: string;

  @Column({ name: 'inspection_requirements', type: 'text', nullable: true })
  inspectionRequirements: string | null;

  @Column({ name: 'certificate_requirements', type: 'text', nullable: true })
  certificateRequirements: string | null;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1, transformer: decimalNumberTransformer })
  quantity: number;

  @Column({ type: 'varchar', length: 20, default: '' })
  unit: string;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  unitPrice: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decimalNumberTransformer })
  discount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  subtotal: number;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @ManyToOne(() => Quote, { onDelete: 'CASCADE', orphanedRowAction: 'delete' })
  @JoinColumn({ name: 'quote_id' })
  quote: Quote;
}

@Entity('quote_term_templates')
export class QuoteTermTemplate {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 120, unique: true })
  name: string;

  @Column({ name: 'content_zh', type: 'text', nullable: true })
  contentZh: string | null;

  @Column({ name: 'content_en', type: 'text', nullable: true })
  contentEn: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
