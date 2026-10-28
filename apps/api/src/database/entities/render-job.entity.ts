import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { VideoProject } from './video-project.entity';

export enum RenderJobStatus {
  Queued = 'queued',
  Rendering = 'rendering',
  Completed = 'completed',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export interface VideoProbeValidation {
  valid: boolean;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  sizeBytes: number;
  formatName: string;
  checks: {
    hasVideoStream: boolean;
    hasAudioStream: boolean;
    nonZeroDuration: boolean;
    compatibleCodecs: boolean;
  };
  errors?: string[];
}

@Entity('render_jobs')
export class RenderJob {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  video_project_id!: string;

  @ManyToOne(() => VideoProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_project_id' })
  video_project!: VideoProject;

  @Index()
  @Column({
    type: 'enum',
    enum: RenderJobStatus,
    default: RenderJobStatus.Queued,
  })
  status!: RenderJobStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  output_path!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  thumbnail_path!: string | null;

  @Column({ type: 'text', nullable: true })
  ffmpeg_command_summary!: string | null;

  @Column({ type: 'json', nullable: true })
  validation_json!: VideoProbeValidation | null;

  @Column({ type: 'datetime', nullable: true })
  started_at!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  finished_at!: Date | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  error_code!: string | null;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
