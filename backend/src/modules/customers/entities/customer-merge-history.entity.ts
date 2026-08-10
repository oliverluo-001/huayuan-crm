import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('customer_merge_history')
@Index('idx_customer_merge_history_primary', ['primaryCustomerId', 'createdAt'])
export class CustomerMergeHistory {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'merge_id', type: 'varchar', length: 40, unique: true })
  mergeId: string;

  @Column({ name: 'primary_customer_id', type: 'int' })
  primaryCustomerId: number;

  @Column({ name: 'primary_customer_key', type: 'varchar', length: 32 })
  primaryCustomerKey: string;

  @Column({ name: 'merged_customer_ids', type: 'json' })
  mergedCustomerIds: number[];

  @Column({ name: 'merged_customer_keys', type: 'json' })
  mergedCustomerKeys: string[];

  @Column({ name: 'source_snapshots', type: 'json' })
  sourceSnapshots: Array<Record<string, unknown>>;

  @Column({ name: 'primary_snapshot_before', type: 'json' })
  primarySnapshotBefore: Record<string, unknown>;

  @Column({ name: 'primary_snapshot_after', type: 'json' })
  primarySnapshotAfter: Record<string, unknown>;

  @Column({ name: 'detection_reasons', type: 'json' })
  detectionReasons: Array<Record<string, unknown>>;

  @Column({ name: 'field_selections', type: 'json' })
  fieldSelections: Record<string, number>;

  @Column({ name: 'primary_contact_selection', type: 'varchar', length: 64, default: '' })
  primaryContactSelection: string;

  @Column({ name: 'moved_relations', type: 'json' })
  movedRelations: Record<string, number>;

  @Column({ name: 'performed_by_id', type: 'varchar', length: 32, default: '' })
  performedById: string;

  @Column({ name: 'performed_by_name', type: 'varchar', length: 100, default: '' })
  performedByName: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
