import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  UpdateDateColumn,
} from 'typeorm';

@Entity('settings')
export class Setting {
  @PrimaryGeneratedColumn('increment')
  id: number;

  @Column({ name: 'key_name', type: 'varchar', length: 100, unique: true })
  keyName: string;

  @Column({ name: 'key_value', type: 'json', nullable: true })
  keyValue: Record<string, any>;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}