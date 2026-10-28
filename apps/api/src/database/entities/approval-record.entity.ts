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

export enum ApprovalType {
  Script = 'script',
  Assets = 'assets',
  Render = 'render',
  Upload = 'upload',
  PublicRelease = 'public_release',
}

export enum ApprovalDecision {
  Approved = 'approved',
  Rejected = 'rejected',
}

@Entity('approval_records')
export class ApprovalRecord {
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
    enum: ApprovalType,
  })
  approval_type!: ApprovalType;

  @Column({
    type: 'enum',
    enum: ApprovalDecision,
  })
  decision!: ApprovalDecision;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'varchar', length: 100, default: 'local_creator' })
  approved_by!: string;

  @CreateDateColumn()
  created_at!: Date;
}
