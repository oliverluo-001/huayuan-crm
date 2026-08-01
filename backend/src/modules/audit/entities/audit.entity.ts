import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditEntry {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 100, default: '' })
  username: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  action: string;

  @Column({ type: 'text', nullable: true })
  details: string;

  @Column({ name: 'user_id', type: 'varchar', length: 32, default: '' })
  userId: string;

  @Column({ type: 'varchar', length: 10, default: '' })
  method: string;

  @Column({ type: 'varchar', length: 500, default: '' })
  path: string;

  @Column({ type: 'varchar', length: 64, default: '' })
  ip: string;

  @Column({ type: 'varchar', length: 20, default: 'success' })
  status: 'success' | 'failed';

  @Column({ name: 'duration_ms', type: 'int', default: 0 })
  durationMs: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
