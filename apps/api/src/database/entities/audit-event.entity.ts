import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, default: 'system' })
  actor!: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Index()
  @Column({ type: 'varchar', length: 100 })
  entity_type!: string;

  @Index()
  @Column({ type: 'varchar', length: 36, nullable: true })
  entity_id!: string | null;

  @Column({ type: 'json', nullable: true })
  details_json!: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at!: Date;
}
