import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EmailRecipientStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';

@Entity('email_task_recipients')
@Index(['taskId', 'recipientKey'], { unique: true })
export class EmailTaskRecipient {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'task_id', type: 'int' })
  taskId: number;

  @Column({ name: 'recipient_key', type: 'varchar', length: 80 })
  recipientKey: string;

  @Column({ name: 'customer_id', type: 'int', nullable: true })
  customerId: number | null;

  @Column({ name: 'contact_id', type: 'int', nullable: true })
  contactId: number | null;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  name: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  company: string;

  @Column({ type: 'varchar', length: 80, default: '' })
  timezone: string;

  @Column({
    type: 'enum',
    enum: ['queued', 'sending', 'sent', 'failed', 'skipped'],
    default: 'queued',
  })
  status: EmailRecipientStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
