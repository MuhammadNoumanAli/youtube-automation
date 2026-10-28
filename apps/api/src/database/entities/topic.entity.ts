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

export enum TopicStatus {
  Idea = 'idea',
  Planned = 'planned',
  Converted = 'converted',
  Archived = 'archived',
}

export enum TopicPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
}

@Entity('topics')
export class Topic {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 36 })
  channel_profile_id!: string;

  @ManyToOne(() => ChannelProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'channel_profile_id' })
  channel_profile!: ChannelProfile;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 100, default: 'General' })
  niche!: string;

  @Column({ type: 'varchar', length: 255, default: 'General Audience' })
  target_audience!: string;

  @Column({
    type: 'enum',
    enum: TopicPriority,
    default: TopicPriority.Medium,
  })
  priority!: TopicPriority;

  @Column({
    type: 'enum',
    enum: TopicStatus,
    default: TopicStatus.Idea,
  })
  status!: TopicStatus;

  @Column({ type: 'varchar', length: 36, nullable: true })
  converted_project_id!: string | null;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
