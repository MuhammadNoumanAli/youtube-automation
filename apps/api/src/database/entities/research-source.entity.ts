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

export enum VerificationStatus {
  Verified = 'verified',
  Unverified = 'unverified',
  Disputed = 'disputed',
}

@Entity('research_sources')
export class ResearchSource {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  video_project_id!: string;

  @ManyToOne(() => VideoProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_project_id' })
  video_project!: VideoProject;

  @Column({ type: 'text' })
  url!: string;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255, default: 'Independent Source' })
  publisher!: string;

  @Column({ type: 'datetime', nullable: true })
  published_at!: Date | null;

  @Column({ type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  accessed_at!: Date;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'text' })
  claim_supported!: string;

  @Column({ type: 'varchar', length: 50, default: 'article' })
  source_type!: string;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    default: VerificationStatus.Unverified,
  })
  verification_status!: VerificationStatus;

  @CreateDateColumn()
  created_at!: Date;
}
