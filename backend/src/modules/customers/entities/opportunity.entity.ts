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

export type OpportunityStage = 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'won' | 'lost';

@Entity('opportunities')
export class Opportunity {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'opportunity_id', type: 'varchar', length: 32, unique: true })
  opportunityId: string;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'decimal', precision: 15, scale: 2, default: 0, transformer: decimalNumberTransformer })
  amount: number;

  @Column({ type: 'enum', enum: ['prospecting', 'qualification', 'proposal', 'negotiation', 'won', 'lost'], default: 'prospecting' })
  stage: OpportunityStage;

  @Column({ type: 'int', default: 10 })
  probability: number;

  @Column({ name: 'expected_close_date', type: 'date', nullable: true })
  expectedCloseDate: Date;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
