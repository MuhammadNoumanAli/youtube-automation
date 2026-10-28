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

export enum ScriptStatus {
  Draft = 'draft',
  Review = 'review',
  Approved = 'approved',
  Superseded = 'superseded',
}

export interface SceneItem {
  sceneNumber: number;
  durationSeconds: number;
  visualDescription: string;
  onScreenText?: string;
  narrationSnippet: string;
  suggestedAssetType?: 'image' | 'video' | 'graphic';
}

export interface VideoMetadataPayload {
  title: string;
  description: string;
  tags: string[];
  chapters?: Array<{ timestamp: string; title: string }>;
  suggestedThumbnailConcept?: string;
}

@Entity('scripts')
export class Script {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  video_project_id!: string;

  @ManyToOne(() => VideoProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_project_id' })
  video_project!: VideoProject;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'longtext' })
  content!: string;

  @Column({ type: 'json', nullable: true })
  outline_json!: string[] | null;

  @Column({ type: 'json', nullable: true })
  scene_plan_json!: SceneItem[] | null;

  @Column({ type: 'json', nullable: true })
  metadata_json!: VideoMetadataPayload | null;

  @Column({ type: 'varchar', length: 50, default: 'mock' })
  provider!: string;

  @Column({ type: 'varchar', length: 100, default: 'mock-engine-v1' })
  model!: string;

  @Column({
    type: 'enum',
    enum: ScriptStatus,
    default: ScriptStatus.Draft,
  })
  status!: ScriptStatus;

  @CreateDateColumn()
  created_at!: Date;
}
