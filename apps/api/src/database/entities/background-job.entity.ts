import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum JobType {
  Render = 'render',
  Upload = 'upload',
  Maintenance = 'maintenance',
}

export enum JobStatus {
  Pending = 'pending',
  Processing = 'processing',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

@Entity('background_jobs')
export class BackgroundJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'enum', enum: JobType })
  job_type!: JobType;

  @Index()
  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.Pending })
  status!: JobStatus;

  @Index()
  @Column({ type: 'varchar', length: 128, unique: true, nullable: true })
  idempotency_key!: string | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  video_project_id!: string | null;

  @Column({ type: 'json' })
  payload_json!: Record<string, unknown>;

  @Column({ type: 'int', default: 0 })
  attempt_count!: number;

  @Column({ type: 'int', default: 3 })
  max_attempts!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  locked_by!: string | null;

  @Column({ type: 'datetime', nullable: true })
  locked_at!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  lock_expires_at!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  next_retry_at!: Date | null;

  @Column({ type: 'text', nullable: true })
  last_error!: string | null;

  @Column({ type: 'json', nullable: true })
  result_json!: Record<string, unknown> | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
