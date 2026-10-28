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
import { Script } from './script.entity';

export enum NarrationStatus {
  Pending = 'pending',
  Ready = 'ready',
  Failed = 'failed',
}

@Entity('narrations')
export class Narration {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  video_project_id!: string;

  @ManyToOne(() => VideoProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_project_id' })
  video_project!: VideoProject;

  @Column({ type: 'varchar', length: 36, nullable: true })
  script_id!: string | null;

  @ManyToOne(() => Script, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'script_id' })
  script!: Script | null;

  @Column({ type: 'varchar', length: 50, default: 'mock' })
  provider!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  voice_id!: string | null;

  @Column({ type: 'varchar', length: 500 })
  storage_path!: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, default: 0 })
  duration_seconds!: number;

  @Column({
    type: 'enum',
    enum: NarrationStatus,
    default: NarrationStatus.Ready,
  })
  status!: NarrationStatus;

  @CreateDateColumn()
  created_at!: Date;
}
