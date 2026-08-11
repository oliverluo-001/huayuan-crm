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

export type OpportunityStage =
  'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'won' | 'lost';
export type OpportunityForecastCategory =
  'pipeline' | 'best_case' | 'commit' | 'closed' | 'omitted';

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

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  amount: number;

  @Column({
    type: 'enum',
    enum: [
      'prospecting',
      'qualification',
      'proposal',
      'negotiation',
      'won',
      'lost',
    ],
    default: 'prospecting',
  })
  stage: OpportunityStage;

  @Column({ type: 'int', default: 10 })
  probability: number;

  @Column({ name: 'owner_id', type: 'varchar', length: 32, default: '' })
  ownerId: string;

  @Column({ name: 'collaborator_ids', type: 'json', nullable: true })
  collaboratorIds: string[];

  @Column({ name: 'product_name', type: 'varchar', length: 255, default: '' })
  productName: string;

  @Column({ name: 'product_specification', type: 'text', nullable: true })
  productSpecification: string;

  @Column({
    name: 'expected_quantity',
    type: 'decimal',
    precision: 15,
    scale: 3,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  expectedQuantity: number;

  @Column({ name: 'quantity_unit', type: 'varchar', length: 30, default: '' })
  quantityUnit: string;

  @Column({
    name: 'target_price',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  targetPrice: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency: string;

  @Column({
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
    transformer: decimalNumberTransformer,
  })
  budget: number;

  @Column({ name: 'purchase_time', type: 'varchar', length: 100, default: '' })
  purchaseTime: string;

  @Column({ name: 'decision_process', type: 'text', nullable: true })
  decisionProcess: string;

  @Column({ name: 'next_step_action', type: 'text', nullable: true })
  nextStepAction: string;

  @Column({ name: 'next_step_due_date', type: 'date', nullable: true })
  nextStepDueDate: Date;

  @Column({ name: 'expected_close_date', type: 'date' })
  expectedCloseDate: Date;

  @Column({
    name: 'forecast_category',
    type: 'enum',
    enum: ['pipeline', 'best_case', 'commit', 'closed', 'omitted'],
    default: 'pipeline',
  })
  forecastCategory: OpportunityForecastCategory;

  @Column({ name: 'win_reason', type: 'text', nullable: true })
  winReason: string;

  @Column({ name: 'loss_reason', type: 'text', nullable: true })
  lossReason: string;

  @Column({ type: 'text', nullable: true })
  competitors: string;

  @Column({ name: 'stage_entered_at', type: 'datetime', nullable: true })
  stageEnteredAt: Date;

  @Column({ name: 'closed_at', type: 'datetime', nullable: true })
  closedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  description: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  toJSON() {
    const open = !['won', 'lost'].includes(this.stage);
    const enteredAt = this.stageEnteredAt
      ? new Date(this.stageEnteredAt)
      : new Date(this.updatedAt || this.createdAt);
    const durationHours = Math.max(
      0,
      Math.floor((Date.now() - enteredAt.getTime()) / 3_600_000),
    );
    const closeDate = this.expectedCloseDate
      ? new Date(this.expectedCloseDate)
      : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue = Boolean(
      open && closeDate && closeDate.getTime() < today.getTime(),
    );
    const missingNextStep = Boolean(
      open && !String(this.nextStepAction || '').trim(),
    );
    return {
      ...this,
      stageDurationHours: durationHours,
      stageDurationDays: Math.floor(durationHours / 24),
      isOverdue,
      missingNextStep,
      alerts: [
        isOverdue ? 'overdue' : '',
        missingNextStep ? 'missing_next_step' : '',
      ].filter(Boolean),
    };
  }
}
