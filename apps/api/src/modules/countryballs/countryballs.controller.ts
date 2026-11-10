import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BackgroundJob } from '../../database/entities/background-job.entity';
import { CountryballsService, CreateCountryballsResult } from './countryballs.service';
import { CreateCountryballsDto } from './dto/create-countryballs.dto';

@ApiTags('Countryballs')
@Controller('countryballs')
export class CountryballsController {
  constructor(private readonly service: CountryballsService) {}

  @Get('options')
  @ApiOperation({ summary: 'Countries, voices, scene types, settings, formats and limits for the Countryballs form' })
  @ApiResponse({ status: 200, description: 'Form options and whether the animation app was found' })
  options() {
    return this.service.options();
  }

  @Post('projects')
  @ApiOperation({
    summary: 'Create Countryballs project(s) from the form. Scripts start in review; nothing is approved or rendered.',
  })
  @ApiResponse({ status: 201, description: 'One project per format (two for "both"), each with a script awaiting review' })
  create(@Body() dto: CreateCountryballsDto): Promise<CreateCountryballsResult> {
    return this.service.create(dto);
  }

  @Post('projects/:projectId/render')
  @ApiOperation({ summary: 'Queue the render of the approved script (refused until the script is approved)' })
  @ApiResponse({ status: 201, description: 'Background job queued; the result goes to Render Review' })
  render(@Param('projectId', new ParseUUIDPipe()) projectId: string): Promise<BackgroundJob> {
    return this.service.startRender(projectId);
  }
}
