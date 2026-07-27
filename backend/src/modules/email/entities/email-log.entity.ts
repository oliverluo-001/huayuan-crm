import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
} from 'typeorm';

export type EmailLogStatus = 'sent' | 'failed' | 'bounced';

@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'log_id', type: 'varchar', length: 32, unique: true })
  logId: string;

  @Column({ name: 'customer_id', type: 'varchar', length: 32, default: '' })
  customerId: string;

  @Column({ name: 'email_task_id', type: 'varchar', length: 32, default: '' })
  emailTaskId: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  subject: string;

  @Column({ type: 'enum', enum: ['sent', 'failed', 'bounced'], default: 'sent' })
  status: EmailLogStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'sent_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  sentAt: Date;
}