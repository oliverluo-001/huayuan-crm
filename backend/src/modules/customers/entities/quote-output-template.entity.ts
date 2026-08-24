import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import type { QuoteOutputLayout } from "../quote-output-layout";

@Entity("quote_output_templates")
@Index("idx_quote_output_templates_default", ["isDefault", "active"])
export class QuoteOutputTemplate {
  @PrimaryGeneratedColumn("increment", { type: "int" })
  id: number;

  @Column({ type: "varchar", length: 120, unique: true })
  name: string;

  @Column({ type: "varchar", length: 500, default: "" })
  description: string;

  @Column({ type: "json" })
  layout: QuoteOutputLayout;

  @Column({ name: "is_default", type: "boolean", default: false })
  isDefault: boolean;

  @Column({ type: "boolean", default: true })
  active: boolean;

  @Column({ name: "created_by", type: "varchar", length: 32, default: "" })
  createdBy: string;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
