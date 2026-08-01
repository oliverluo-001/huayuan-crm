import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LeadTaskStatus = 'draft' | 'ready' | 'running' | 'paused' | 'completed' | 'exhausted' | 'cancelled';

@Entity('lead_tasks')
export class LeadTask {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'task_id', type: 'varchar', length: 32, unique: true })
  taskId: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 32, default: '' })
  ownerId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255, default: '' })
  productName: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  industry: string;

  @Column({ name: 'target_region', type: 'varchar', length: 100, default: '' })
  targetRegion: string;

  @Column({ name: 'target_regions', type: 'json', nullable: true })
  targetRegions: string[];

  @Column({ name: 'target_segments', type: 'json', nullable: true })
  targetSegments: string[];

  @Column({ name: 'target_count', type: 'int', default: 100 })
  targetCount: number;

  @Column({ name: 'buyer_industries', type: 'json', nullable: true })
  buyerIndustries: string[];

  @Column({ name: 'buyer_company_types', type: 'json', nullable: true })
  buyerCompanyTypes: string[];

  @Column({ name: 'product_aliases', type: 'json', nullable: true })
  productAliases: string[];

  @Column({ type: 'text', nullable: true })
  keywords: string;

  @Column({ type: 'enum', enum: ['draft', 'ready', 'running', 'paused', 'completed', 'exhausted', 'cancelled'], default: 'draft' })
  status: LeadTaskStatus;

  @Column({ name: 'search_queries', type: 'json', nullable: true })
  searchQueries: string[];

  @Column({ name: 'automation_cursor', type: 'int', default: 0 })
  automationCursor: number;

  @Column({ name: 'automation_progress', type: 'json', nullable: true })
  automationProgress: Record<string, any>;

  @Column({ name: 'automation_stage', type: 'varchar', length: 50, default: '' })
  automationStage: string;

  @Column({ name: 'agent_state', type: 'json', nullable: true })
  agentState: Record<string, any>;

  @Column({ name: 'cancel_requested', type: 'boolean', default: false })
  cancelRequested: boolean;

  @Column({ name: 'last_message', type: 'text', nullable: true })
  lastMessage: string;

  @Column({ name: 'lead_count', type: 'int', default: 0 })
  leadCount: number;

  @Column({ name: 'raw_lead_count', type: 'int', default: 0 })
  rawLeadCount: number;

  @Column({ name: 'cleaned_lead_count', type: 'int', default: 0 })
  cleanedLeadCount: number;

  @Column({ name: 'duplicate_count', type: 'int', default: 0 })
  duplicateCount: number;

  @Column({ name: 'imported_customer_count', type: 'int', default: 0 })
  importedCustomerCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
