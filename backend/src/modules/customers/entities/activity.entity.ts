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

export type ActivityType = 'email' | 'call' | 'meeting' | 'note' | 'other';

@Entity('activities')
export class Activity {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'activity_id', type: 'varchar', length: 32, unique: true })
  activityId: string;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ type: 'enum', enum: ['email', 'call', 'meeting', 'note', 'other'], default: 'note' })
  type: ActivityType;

  @Column({ type: 'varchar', length: 500, default: '' })
  subject: string;

  @Column({ type: 'text', nullable: true })
  content: string;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}