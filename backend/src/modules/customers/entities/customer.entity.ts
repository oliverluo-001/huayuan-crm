import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Tag } from './tag.entity';

export type CustomerTier = 'A' | 'B' | 'C' | 'D' | '';
export type JourneyStage = 'prospect' | 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'closed' | '';
export type EmailStatus = 'valid' | 'invalid' | 'unknown';

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
  business: string;

  @Column({ type: 'text', nullable: true })
  product: string;

  @Column({ name: 'customer_type', type: 'varchar', length: 50, default: '' })
  customerType: string;

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

  @ManyToMany(() => Tag, { cascade: true, eager: true })
  @JoinTable({
    name: 'customer_tags',
    joinColumn: { name: 'customer_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'tag_id', referencedColumnName: 'id' },
  })
  tags: Tag[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}