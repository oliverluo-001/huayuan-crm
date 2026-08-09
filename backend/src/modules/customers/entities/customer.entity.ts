import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
  DeleteDateColumn,
} from 'typeorm';
import { Tag } from './tag.entity';
import { decimalNumberTransformer } from '../../../common/database/decimal-number.transformer';

export type CustomerTier = 'A' | 'B' | 'C' | 'D' | '';
export type JourneyStage =
  | 'new'
  | 'contacted'
  | 'replied'
  | 'qualified'
  | 'opportunity'
  | 'won'
  | 'lost'
  | 'prospect'
  | 'lead'
  | 'proposal'
  | 'negotiation'
  | 'closed'
  | '';
export type EmailStatus = 'valid' | 'invalid' | 'unknown';
export type CustomerHealth = 'good' | 'warning' | 'critical' | '';

@Entity('customers')
export class Customer {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  customerId: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  company: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  contact: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  email: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  website: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  region: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  country: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'text', nullable: true })
  business: string;

  @Column({ type: 'text', nullable: true })
  product: string;

  @Column({ name: 'customer_type', type: 'varchar', length: 50, default: '' })
  customerType: string;

  @Column({ name: 'main_markets', type: 'json', nullable: true })
  mainMarkets: string[];

  @Column({
    name: 'annual_purchase_amount',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  annualPurchaseAmount: number;

  @Column({ name: 'preferred_currency', type: 'varchar', length: 3, default: 'USD' })
  preferredCurrency: string;

  @Column({ name: 'preferred_incoterm', type: 'varchar', length: 20, default: '' })
  preferredIncoterm: string;

  @Column({ type: 'varchar', length: 1, default: '' })
  tier: CustomerTier;

  @Column({ name: 'journey_stage', type: 'varchar', length: 20, default: '' })
  journeyStage: JourneyStage;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 50, default: '' })
  timezone: string;

  @Column({ name: 'email_status', type: 'enum', enum: ['valid', 'invalid', 'unknown'], default: 'unknown' })
  emailStatus: EmailStatus;

  @Column({ name: 'email_failure_reason', type: 'text', nullable: true })
  emailFailureReason: string;

  @Column({ name: 'email_failed_at', type: 'timestamp', nullable: true })
  emailFailedAt: Date;

  @Column({ type: 'varchar', length: 100, default: '' })
  source: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 32, default: '' })
  ownerId: string;

  @Column({ name: 'collaborator_ids', type: 'json', nullable: true })
  collaboratorIds: string[];

  @Column({ type: 'varchar', length: 10, default: '' })
  health: CustomerHealth;

  @Column({ name: 'last_activity_at', type: 'timestamp', nullable: true })
  lastActivityAt: Date;

  @Column({ name: 'last_activity_type', type: 'varchar', length: 50, default: '' })
  lastActivityType: string;

  @Column({ name: 'next_todo_at', type: 'timestamp', nullable: true })
  nextTodoAt: Date;

  @Column({ name: 'next_todo_title', type: 'varchar', length: 255, default: '' })
  nextTodoTitle: string;

  @Column({ name: 'open_opportunity_count', type: 'int', default: 0 })
  openOpportunityCount: number;

  @Column({ name: 'open_opportunity_value', type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  openOpportunityValue: number;

  @ManyToMany(() => Tag, { cascade: true, eager: true })
  @JoinTable({
    name: 'customer_tags',
    joinColumn: { name: 'customer_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  toJSON() {
    return {
      ...this,
      tags: (this.tags || []).map((tag) => tag.name),
    };
  }
}
