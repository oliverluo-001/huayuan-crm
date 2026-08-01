import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('customer_views')
export class CustomerView {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'view_id', type: 'varchar', length: 32, unique: true })
  viewId: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 32, default: '' })
  ownerId: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'json' })
  columns: string[];

  @Column({ type: 'json', nullable: true })
  filters: Record<string, string> | any[];

  @Column({ name: 'sort_by', type: 'varchar', length: 50, nullable: true })
  sortBy: string;

  @Column({ name: 'sort_order', type: 'varchar', length: 10, nullable: true })
  sortOrder: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
