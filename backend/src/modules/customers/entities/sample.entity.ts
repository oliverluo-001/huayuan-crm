import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { decimalNumberTransformer } from '../../../common/database/decimal-number.transformer';

export type SampleStatus = 'pending' | 'sent' | 'delivered' | 'returned';

@Entity('samples')
export class Sample {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'sample_id', type: 'varchar', length: 32, unique: true })
  sampleId: string;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ name: 'opportunity_id', type: 'varchar', length: 32, nullable: true })
  opportunityId: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255 })
  productName: string;

  @Column({ name: 'product_id', type: 'varchar', length: 32, nullable: true })
  productId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 1, transformer: decimalNumberTransformer })
  quantity: number;

  @Column({ type: 'varchar', length: 20, default: '' })
  unit: string;

  @Column({ type: 'enum', enum: ['pending', 'sent', 'delivered', 'returned'], default: 'pending' })
  status: SampleStatus;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt: Date;

  @Column({ name: 'tracking_no', type: 'varchar', length: 100, default: '' })
  trackingNo: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
