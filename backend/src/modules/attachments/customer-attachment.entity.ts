import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";
import { Customer } from "../customers/entities/customer.entity";

export type CustomerAttachmentCategory =
  "inquiry" | "drawing" | "contract" | "other";

@Entity("customer_attachments")
@Index("idx_customer_attachments_customer", ["customerId", "createdAt"])
export class CustomerAttachment {
  @PrimaryGeneratedColumn("increment", { type: "int" })
  id: number;

  @Column({ name: "attachment_id", type: "varchar", length: 32, unique: true })
  attachmentId: string;

  @Column({ name: "customer_id", type: "int" })
  customerId: number;

  @Column({ name: "original_name", type: "varchar", length: 255 })
  originalName: string;

  @Column({ name: "stored_name", type: "varchar", length: 96, unique: true })
  storedName: string;

  @Column({
    name: "mime_type",
    type: "varchar",
    length: 160,
    default: "application/octet-stream",
  })
  mimeType: string;

  @Column({ type: "int", unsigned: true })
  size: number;

  @Column({
    type: "enum",
    enum: ["inquiry", "drawing", "contract", "other"],
    default: "other",
  })
  category: CustomerAttachmentCategory;

  @Column({ type: "text", nullable: true })
  note: string | null;

  @Column({ name: "created_by", type: "varchar", length: 32, default: "" })
  createdBy: string;

  @ManyToOne(() => Customer, { onDelete: "CASCADE" })
  @JoinColumn({ name: "customer_id" })
  customer: Customer;

  @CreateDateColumn({ name: "created_at" })
  createdAt: Date;

  @UpdateDateColumn({ name: "updated_at" })
  updatedAt: Date;
}
