import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { VideoProject } from './video-project.entity';

@Entity('channel_profiles')
export class ChannelProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 100 })
  niche!: string;

  @Column({ type: 'json', nullable: true })
  target_regions!: string[] | null;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  language!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  youtube_channel_id!: string | null;

  @Column({ type: 'text', nullable: true })
  encrypted_oauth_tokens!: string | null;

  @OneToMany(() => VideoProject, (project) => project.channel_profile)
  projects!: VideoProject[];

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
