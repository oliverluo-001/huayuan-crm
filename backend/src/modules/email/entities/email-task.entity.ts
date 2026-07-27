import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type EmailTaskStatus = 'pending' | 'active' | 'sending' | 'sent' | 'completed' | 'cancelled' | 'failed';

@Entity('email_tasks')
export class EmailTask {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'email_task_id', type: 'varchar', length: 32, unique: true })
  emailTaskId: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  name: string;

  @Column({ name: 'task_mode', type: 'varchar', length: 20, default: 'once' })
  taskMode: string;

  @Column({ name: 'customer_id', type: 'varchar', length: 32, default: '' })
  customerId: string;

  @Column({ name: 'template_id', type: 'varchar', length: 32, default: '' })
  templateId: string;

  @Column({ name: 'customer_ids', type: 'text', nullable: true })
  customerIds: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  business: string | null;

  @Column({ name: 'interval_minutes', type: 'int', nullable: true })
  intervalMinutes: number | null;

  @Column({ name: 'total_runs', type: 'int', nullable: true })
  totalRuns: number | null;

  @Column({ name: 'batch_size', type: 'int', nullable: true })
  batchSize: number | null;

  @Column({ type: 'varchar', length: 500 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 255, default: '' })
  recipientEmail: string;

  @Column({ name: 'recipient_name', type: 'varchar', length: 255, default: '' })
  recipientName: string;

  @Column({
    type: 'enum',
    enum: ['pending', 'active', 'sending', 'sent', 'completed', 'cancelled', 'failed'],
    default: 'pending',
  })
  status: EmailTaskStatus;

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduledAt: Date;

  @Column({ name: 'start_at', type: 'timestamp', nullable: true })
  startAt: Date | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt: Date;

  @Column({ name: 'last_run_at', type: 'timestamp', nullable: true })
  lastRunAt: Date | null;

  @Column({ name: 'next_run_at', type: 'timestamp', nullable: true })
  nextRunAt: Date | null;

  @Column({ name: 'runs_completed', type: 'int', default: 0 })
  runsCompleted: number;

  @Column({ name: 'successful_send_count', type: 'int', default: 0 })
  successfulSendCount: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string;

  @Column({ name: 'smtp_provider', type: 'varchar', length: 50, nullable: true })
  smtpProvider: string | null;

  @Column({ name: 'smtp_host', type: 'varchar', length: 255, default: '' })
  smtpHost: string;

  @Column({ name: 'smtp_port', type: 'int', default: 587 })
  smtpPort: number;

  @Column({ name: 'smtp_user', type: 'varchar', length: 255, default: '' })
  smtpUser: string;

  @Column({ name: 'smtp_from', type: 'varchar', length: 255, nullable: true })
  smtpFrom: string | null;

  @Column({ name: 'smtp_secure', type: 'tinyint', nullable: true })
  smtpSecure: boolean | null;

  @Column({ name: 'smtp_pass_encrypted', type: 'text', nullable: true })
  smtpPassEncrypted: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
