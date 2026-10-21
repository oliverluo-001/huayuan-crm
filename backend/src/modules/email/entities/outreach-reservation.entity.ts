import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

// A first-contact email address can be reserved by only one analysis task.
// Sent/uncertain addresses remain reserved; cancelling releases only queued ones.
@Entity('outreach_reservations')
export class OutreachReservation {
  @PrimaryColumn({ type: 'varchar', length: 255 }) email: string;
  @Index() @Column({ name: 'task_id', type: 'int' }) taskId: number;
}
