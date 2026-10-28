import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SafeSettingsStatus, SettingsService } from './settings.service';

@ApiTags('Settings')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('status')
  @ApiOperation({
    summary: 'Retrieve safe configuration and provider setup status without secrets',
  })
  @ApiResponse({
    status: 200,
    description: 'Safe configuration and feature toggle status',
  })
  getStatus(): SafeSettingsStatus {
    return this.settingsService.getStatus();
  }
}
