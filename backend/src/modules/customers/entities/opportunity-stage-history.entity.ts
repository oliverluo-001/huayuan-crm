import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Opportunity, OpportunityStage } from './opportunity.entity';

@Entity('opportunity_stage_history')
@Index('idx_opportunity_stage_history_opportunity', [
  'opportunityPk',
  'changedAt',
])
export class OpportunityStageHistory {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'opportunity_id', type: 'int' })
  opportunityPk: number;

  @Column({ name: 'opportunity_key', type: 'varchar', length: 32 })
  opportunityKey: string;

  @Column({ name: 'from_stage', type: 'varchar', length: 20, nullable: true })
  fromStage: OpportunityStage | null;

  @Column({ name: 'to_stage', type: 'varchar', length: 20 })
  toStage: OpportunityStage;

  @Column({ name: 'duration_hours', type: 'int', unsigned: true, default: 0 })
  durationHours: number;

  @Column({ name: 'changed_by_id', type: 'varchar', length: 32, default: '' })
  changedById: string;

  @Column({
    name: 'changed_by_name',
    type: 'varchar',
    length: 100,
    default: '',
  })
  changedByName: string;

  @Column({ name: 'change_note', type: 'text', nullable: true })
  changeNote: string;

  @CreateDateColumn({ name: 'changed_at' })
  changedAt: Date;

  @ManyToOne(() => Opportunity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'opportunity_id' })
  opportunity: Opportunity;
}
