import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectRepository(ChannelProfile)
    private readonly channelRepo: Repository<ChannelProfile>,
  ) {}

  async findAll(): Promise<ChannelProfile[]> {
    return this.channelRepo.find({
      order: { created_at: 'DESC' },
      relations: ['projects'],
    });
  }

  async findById(id: string): Promise<ChannelProfile> {
    const channel = await this.channelRepo.findOne({
      where: { id },
      relations: ['projects'],
    });
    if (!channel) {
      throw new NotFoundException(`Channel profile with ID "${id}" not found`);
    }
    return channel;
  }

  async create(dto: CreateChannelDto): Promise<ChannelProfile> {
    const channel = this.channelRepo.create({
      name: dto.name,
      niche: dto.niche,
      target_regions: dto.target_regions || ['US'],
      language: dto.language || 'en',
    });
    return this.channelRepo.save(channel);
  }

  async update(id: string, dto: UpdateChannelDto): Promise<ChannelProfile> {
    const channel = await this.findById(id);
    Object.assign(channel, dto);
    return this.channelRepo.save(channel);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const channel = await this.findById(id);
    await this.channelRepo.remove(channel);
    return { deleted: true };
  }
}
