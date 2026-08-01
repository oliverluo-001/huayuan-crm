import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected';
export type LeadTier = 'A' | 'B' | 'C' | 'D' | 'review';

@Entity('leads')
export class Lead {
  @PrimaryGeneratedColumn('increment', { type: 'int' })
  id: number;

  @Column({ name: 'lead_id', type: 'varchar', length: 32, unique: true })
  leadId: string;

  @Column({ name: 'task_id', type: 'varchar', length: 32, default: '' })
  taskId: string;

  @Column({ name: 'owner_id', type: 'varchar', length: 32, default: '' })
  ownerId: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  company: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 255, default: '' })
  contactName: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  email: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  phone: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  website: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  region: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  country: string;

  @Column({ name: 'large_region', type: 'varchar', length: 100, default: '' })
  largeRegion: string;

  @Column({ type: 'text', nullable: true })
  business: string;

  @Column({ name: 'target_segment', type: 'varchar', length: 100, default: '' })
  targetSegment: string;

  @Column({ name: 'buyer_type', type: 'varchar', length: 100, default: '' })
  buyerType: string;

  @Column({ name: 'purchase_score', type: 'int', default: 0 })
  purchaseScore: number;

  @Column({ name: 'lead_score', type: 'int', default: 0 })
  leadScore: number;

  @Column({ name: 'lead_tier', type: 'varchar', length: 20, default: 'review' })
  leadTier: string;

  @Column({ name: 'email_status', type: 'varchar', length: 20, default: 'unknown' })
  emailStatus: string;

  @Column({ name: 'email_confidence', type: 'int', default: 0 })
  emailConfidence: number;

  @Column({ name: 'region_status', type: 'varchar', length: 20, default: 'unknown' })
  regionStatus: string;

  @Column({ name: 'source_url', type: 'varchar', length: 500, default: '' })
  sourceUrl: string;

  @Column({ name: 'source_name', type: 'varchar', length: 100, default: '' })
  sourceName: string;

  @Column({ name: 'source_type', type: 'varchar', length: 50, default: '' })
  sourceType: string;

  @Column({ name: 'source_page', type: 'text', nullable: true })
  sourcePage: string;

  @Column({ name: 'source_http_status', type: 'int', default: 0 })
  sourceHttpStatus: number;

  @Column({ name: 'confidence', type: 'varchar', length: 20, default: '' })
  confidence: string;

  @Column({ name: 'recommended_action', type: 'varchar', length: 50, default: '' })
  recommendedAction: string;

  @Column({ name: 'crm_customer_id', type: 'varchar', length: 32, default: '' })
  crmCustomerId: string;

  @Column({ name: 'cleaning_notes', type: 'text', nullable: true })
  cleaningNotes: string;

  @Column({ name: 'email_source_domain_match', type: 'boolean', default: false })
  emailSourceDomainMatch: boolean;

  @Column({ name: 'matched_product_keyword', type: 'varchar', length: 255, default: '' })
  matchedProductKeyword: string;

  @Column({ name: 'lead_status', type: 'enum', enum: ['new', 'contacted', 'qualified', 'converted', 'rejected'], default: 'new' })
  leadStatus: LeadStatus;

  @Column({ type: 'varchar', length: 50, default: '' })
  stage: string;

  @Column({ name: 'review_reason', type: 'text', nullable: true })
  reviewReason: string;

  @Column({ name: 'converted_customer_id', type: 'varchar', length: 32, default: '' })
  convertedCustomerId: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ name: 'raw_data', type: 'json', nullable: true })
  rawData: Record<string, any>;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'candidate' })
  status: string;

  @Column({ name: 'public_email', type: 'varchar', length: 255, default: '' })
  publicEmail: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
