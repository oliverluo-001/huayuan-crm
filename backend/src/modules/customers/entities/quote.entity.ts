import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Customer } from '../../customers/entities/customer.entity';
import { decimalNumberTransformer } from '../../../common/database/decimal-number.transformer';

export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

@Entity('quotes')
export class Quote {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'quote_id', type: 'varchar', length: 32, unique: true })
  quoteId: string;

  @Column({ name: 'quote_no', type: 'varchar', length: 50 })
  quoteNo: string;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ name: 'opportunity_id', type: 'varchar', length: 32, default: '' })
  opportunityId: string;

  @Column({ type: 'enum', enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'], default: 'draft' })
  status: QuoteStatus;

  @Column({ type: 'varchar', length: 10, default: 'USD' })
  currency: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  subtotal: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  freight: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 2, default: 0, transformer: decimalNumberTransformer })
  taxRate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  taxAmount: number;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  total: number;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'text', nullable: true })
  terms: string;

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

  @Column({ name: 'product_id', type: 'varchar', length: 32, default: '' })
  productId: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  @Column({ name: 'product_code', type: 'varchar', length: 100, default: '' })
  productCode: string;

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
