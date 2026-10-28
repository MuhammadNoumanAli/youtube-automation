import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ChannelsService } from './channels.service';
import { CreateChannelDto } from './dto/create-channel.dto';
import { UpdateChannelDto } from './dto/update-channel.dto';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';

@ApiTags('Channels')
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'List all channel profiles' })
  @ApiResponse({ status: 200, description: 'List of channel profiles' })
  async findAll(): Promise<ChannelProfile[]> {
    return this.channelsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a channel profile by ID' })
  @ApiResponse({ status: 200, description: 'Channel profile details' })
  async findById(@Param('id') id: string): Promise<ChannelProfile> {
    return this.channelsService.findById(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a new channel profile' })
  @ApiResponse({ status: 201, description: 'Created channel profile' })
  async create(@Body() dto: CreateChannelDto): Promise<ChannelProfile> {
    return this.channelsService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update channel profile settings' })
  @ApiResponse({ status: 200, description: 'Updated channel profile' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateChannelDto,
  ): Promise<ChannelProfile> {
    return this.channelsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a channel profile' })
  @ApiResponse({ status: 200, description: 'Deletion confirmation' })
  async remove(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.channelsService.remove(id);
  }
}
