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

@Entity('contacts')
export class Contact {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'contact_id', type: 'varchar', length: 32, unique: true })
  contactId: string;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  title: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  department: string;

  @Column({ name: 'decision_role', type: 'varchar', length: 30, default: '' })
  decisionRole: string;

  @Column({ name: 'purchasing_influence', type: 'varchar', length: 20, default: '' })
  purchasingInfluence: string;

  @Column({ name: 'preferred_language', type: 'varchar', length: 50, default: '' })
  preferredLanguage: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  email: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  whatsapp: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  linkedin: string;

  @Column({ name: 'contact_status', type: 'varchar', length: 20, default: 'unknown' })
  contactStatus: string;

  @Column({ name: 'marketing_allowed', type: 'boolean', default: true })
  marketingAllowed: boolean;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
