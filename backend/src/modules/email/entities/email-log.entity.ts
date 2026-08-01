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

  @Column({ name: 'contact_id', type: 'varchar', length: 32, default: '' })
  contactId: string;

  @Column({ name: 'customer_name', type: 'varchar', length: 255, default: '' })
  customerName: string;

  @Column({ name: 'email_task_id', type: 'varchar', length: 32, default: '' })
  emailTaskId: string;

  @Column({ name: 'task_name', type: 'varchar', length: 255, default: '' })
  taskName: string;

  @Column({ name: 'template_id', type: 'varchar', length: 32, default: '' })
  templateId: string;

  @Column({ name: 'template_name', type: 'varchar', length: 255, default: '' })
  templateName: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 255 })
  recipientEmail: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  subject: string;

  @Column({ type: 'enum', enum: ['sent', 'failed', 'bounced'], default: 'sent' })
  status: EmailLogStatus;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'message_id', type: 'varchar', length: 255, default: '' })
  messageId: string;

  @Column({ type: 'int', default: 1 })
  attempt: number;

  @Column({ name: 'sent_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  sentAt: Date;
}
