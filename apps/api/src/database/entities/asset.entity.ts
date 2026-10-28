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

export enum AssetType {
  ScreenRecording = 'screen_recording',
  Image = 'image',
  Video = 'video',
  Audio = 'audio',
  Music = 'music',
  Graphic = 'graphic',
  Other = 'other',
}

export enum LicenseType {
  UserCreated = 'user_created',
  PublicDomain = 'public_domain',
  CreativeCommons = 'creative_commons',
  PurchasedLicense = 'purchased_license',
  FairUseQuoted = 'fair_use_quoted',
}

@Entity('assets')
export class Asset {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  video_project_id!: string;

  @ManyToOne(() => VideoProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_project_id' })
  video_project!: VideoProject;

  @Column({
    type: 'enum',
    enum: AssetType,
    default: AssetType.Image,
  })
  asset_type!: AssetType;

  @Column({ type: 'varchar', length: 500 })
  storage_path!: string;

  @Column({ type: 'varchar', length: 255 })
  original_filename!: string;

  @Column({ type: 'varchar', length: 100 })
  mime_type!: string;

  @Column({ type: 'char', length: 64 })
  checksum_sha256!: string;

  @Column({ type: 'text', nullable: true })
  source_url!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  creator!: string | null;

  @Column({
    type: 'enum',
    enum: LicenseType,
    default: LicenseType.UserCreated,
  })
  license_type!: LicenseType;

  @Column({ type: 'text' })
  license_notes!: string;

  @Column({ type: 'text', nullable: true })
  attribution_text!: string | null;

  @Column({ type: 'boolean', default: false })
  commercial_use_allowed!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  proof_of_permission_path!: string | null;

  @CreateDateColumn()
  created_at!: Date;
}
