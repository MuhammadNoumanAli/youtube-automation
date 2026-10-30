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
import { VideoProject } from './video-project.entity';
import { ChannelProfile } from './channel-profile.entity';

export enum UploadPrivacyStatus {
  Private = 'private',
}

export enum UploadStatus {
  PendingApproval = 'pending_approval',
  Approved = 'approved',
  Uploading = 'uploading',
  UploadedPrivate = 'uploaded_private',
  Failed = 'failed',
}

@Entity('upload_records')
export class UploadRecord {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  video_project_id!: string;

  @ManyToOne(() => VideoProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_project_id' })
  video_project!: VideoProject;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  channel_profile_id!: string;

  @ManyToOne(() => ChannelProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_profile_id' })
  channel_profile!: ChannelProfile;

  @Index()
  @Column({ type: 'varchar', length: 100, nullable: true })
  youtube_video_id!: string | null;

  @Column({
    type: 'enum',
    enum: UploadPrivacyStatus,
    default: UploadPrivacyStatus.Private,
  })
  privacy_status!: UploadPrivacyStatus;

  @Column({
    type: 'enum',
    enum: UploadStatus,
    default: UploadStatus.PendingApproval,
  })
  upload_status!: UploadStatus;

  @Column({ type: 'varchar', length: 255 })
  youtube_title!: string;

  @Column({ type: 'text' })
  youtube_description!: string;

  @Column({ type: 'json', nullable: true })
  youtube_tags!: string[] | null;

  @Column({ type: 'varchar', length: 500 })
  video_file_path!: string;

  @Column({ type: 'bigint', default: 0 })
  video_file_size!: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  error_code!: string | null;

  @Column({ type: 'text', nullable: true })
  error_message!: string | null;

  @Column({ type: 'int', default: 0 })
  upload_attempts!: number;

  @Column({ type: 'datetime', nullable: true })
  last_attempt_at!: Date | null;

  @Column({ type: 'datetime', nullable: true })
  uploaded_at!: Date | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
