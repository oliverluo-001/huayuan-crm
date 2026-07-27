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

export type TodoStatus = 'open' | 'done';

@Entity('todos')
export class Todo {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'todo_id', type: 'varchar', length: 32, unique: true })
  todoId: string;

  @Column({ name: 'customer_id', type: 'int' })
  customerId: number;

  @Column({ type: 'varchar', length: 500 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'due_at', type: 'timestamp', nullable: true })
  dueAt: Date;

  @Column({ type: 'enum', enum: ['open', 'done'], default: 'open' })
  status: TodoStatus;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date;

  @ManyToOne(() => Customer, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}