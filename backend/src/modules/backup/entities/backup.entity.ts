import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('backups')
export class Backup {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ type: 'varchar', length: 32, unique: true })
  backupId: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  filename: string;

  @Column({ type: 'longtext', nullable: true })
  data: string;

  @Column({ type: 'int', default: 0 })
  size: number;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  type: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
