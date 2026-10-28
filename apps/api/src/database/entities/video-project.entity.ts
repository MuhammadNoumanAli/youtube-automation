import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ChannelProfile } from './channel-profile.entity';

export enum VideoProjectStatus {
  Idea = 'idea',
  Researching = 'researching',
  ScriptDraft = 'script_draft',
  ScriptReview = 'script_review',
  ScriptApproved = 'script_approved',
  AssetsPending = 'assets_pending',
  ReadyToRender = 'ready_to_render',
  Rendering = 'rendering',
  RenderReview = 'render_review',
  RenderApproved = 'render_approved',
  ReadyToUpload = 'ready_to_upload',
  Uploading = 'uploading',
  UploadedPrivate = 'uploaded_private',
  ReleaseReview = 'release_review',
  ScheduledOrPublic = 'scheduled_or_public',
  Failed = 'failed',
  Archived = 'archived',
}

export enum VideoFormat {
  LongForm = 'long_form',
  Short = 'short',
}

@Entity('video_projects')
export class VideoProject {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  channel_profile_id!: string;

  @ManyToOne(() => ChannelProfile, (channel) => channel.projects, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'channel_profile_id' })
  channel_profile!: ChannelProfile;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255, default: '' })
  working_title!: string;

  @Column({ type: 'text' })
  topic!: string;

  @Column({ type: 'varchar', length: 255, default: 'General Audience' })
  target_audience!: string;

  @Column({
    type: 'enum',
    enum: VideoFormat,
    default: VideoFormat.LongForm,
  })
  format!: VideoFormat;

  @Column({ type: 'int', default: 300 })
  target_duration_seconds!: number;

  @Index()
  @Column({
    type: 'enum',
    enum: VideoProjectStatus,
    default: VideoProjectStatus.Idea,
  })
  status!: VideoProjectStatus;

  @Column({ type: 'int', default: 1 })
  script_version!: number;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
