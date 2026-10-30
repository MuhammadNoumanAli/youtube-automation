import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { YouTubeOAuthService, YouTubeConnectionStatus } from './youtube-oauth.service';
import { YouTubeUploadService } from './youtube-upload.service';
import { OAuthCallbackDto } from './dto/oauth-callback.dto';
import { UploadApprovalDto } from './dto/upload-approval.dto';
import { StartUploadDto } from './dto/start-upload.dto';
import { UploadRecord } from '../../database/entities/upload-record.entity';
import { VideoProject } from '../../database/entities/video-project.entity';
import { ApprovalRecord } from '../../database/entities/approval-record.entity';

@ApiTags('YouTube')
@Controller()
export class YouTubeController {
  constructor(
    private readonly oauthService: YouTubeOAuthService,
    private readonly uploadService: YouTubeUploadService,
  ) {}

  @Get('youtube/auth-url')
  @ApiOperation({ summary: 'Generate Google OAuth 2.0 authorization URL with CSRF state token' })
  @ApiResponse({ status: 200, description: 'Authorization URL and signed state nonce' })
  async getAuthUrl(@Query('channelId') channelId: string) {
    if (!channelId) {
      throw new BadRequestException('Query parameter "channelId" is required.');
    }
    return this.oauthService.getAuthorizationUrl(channelId);
  }

  @Get('youtube/oauth/callback')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }))
  @ApiOperation({ summary: 'Handle OAuth 2.0 redirect callback from Google' })
  @ApiResponse({ status: 200, description: 'Connected YouTube channel account status' })
  async handleCallback(@Query() query: OAuthCallbackDto, @Res() res: Response) {
    const wantsHtml = (res.req?.headers?.accept || '').includes('text/html');
    const dashboardUrl = this.oauthService.getDashboardUrl();

    if (query.error) {
      const reason = query.error_description || query.error;
      if (wantsHtml) {
        return res
          .status(400)
          .send(renderCallbackPage('Authorization Cancelled', `Google OAuth authorization was not completed (${reason}).`, dashboardUrl, false));
      }
      throw new BadRequestException(`Google OAuth error: ${reason}`);
    }

    if (!query.code || !query.state) {
      const msg = 'The OAuth callback is missing the "code" or "state" parameter. Start the connection again from the dashboard.';
      if (wantsHtml) {
        return res.status(400).send(renderCallbackPage('Authorization Failed', msg, dashboardUrl, false));
      }
      throw new BadRequestException(msg);
    }

    let result: YouTubeConnectionStatus;
    try {
      result = await this.oauthService.handleCallback(query.code, query.state);
    } catch (err: any) {
      if (wantsHtml) {
        const status = typeof err?.getStatus === 'function' ? err.getStatus() : 500;
        return res
          .status(status)
          .send(renderCallbackPage('Connection Failed', err?.message || 'Unknown error while connecting YouTube.', dashboardUrl, false));
      }
      throw err;
    }

    if (wantsHtml) {
      const name = result.channel_title || result.youtube_channel_id || 'your channel';
      const note = result.has_refresh_token
        ? ''
        : ' Warning: Google did not issue a refresh token, so the connection will stop working in about an hour. Remove the app under myaccount.google.com/permissions and connect again.';
      return res.send(
        renderCallbackPage('✓ YouTube Connected', `Account "${name}" is now authorized for private video uploads.${note}`, dashboardUrl, true),
      );
    }

    return res.json(result);
  }

  @Get('youtube/channel-status/:channelId')
  @ApiOperation({ summary: 'Get YouTube OAuth connection state for a channel profile' })
  @ApiResponse({ status: 200, description: 'YouTube channel connection details' })
  async getChannelStatus(@Param('channelId') channelId: string): Promise<YouTubeConnectionStatus> {
    return this.oauthService.getConnectionStatus(channelId);
  }

  @Post('youtube/disconnect/:channelId')
  @ApiOperation({ summary: 'Disconnect YouTube account and purge encrypted tokens' })
  @ApiResponse({ status: 200, description: 'Confirmation of disconnection' })
  async disconnect(@Param('channelId') channelId: string) {
    return this.oauthService.disconnect(channelId);
  }

  @Post('projects/:projectId/upload-approval')
  @ApiOperation({ summary: 'Record separate human approval for YouTube private video upload' })
  @ApiResponse({ status: 200, description: 'Approval decision and updated project state' })
  async recordUploadApproval(
    @Param('projectId') projectId: string,
    @Body() dto: UploadApprovalDto,
  ): Promise<{ project: VideoProject; approval: ApprovalRecord }> {
    return this.uploadService.recordUploadApproval(projectId, dto);
  }

  @Post('projects/:projectId/upload')
  @ApiOperation({ summary: 'Upload rendered video to YouTube strictly as PRIVATE' })
  @ApiResponse({ status: 201, description: 'Upload record and YouTube video ID' })
  async uploadVideo(
    @Param('projectId') projectId: string,
    @Body() dto: StartUploadDto,
  ): Promise<UploadRecord> {
    return this.uploadService.uploadVideoToYouTube(projectId, dto);
  }

  @Get('projects/:projectId/upload-status')
  @ApiOperation({ summary: 'Get latest upload status for a video project' })
  @ApiResponse({ status: 200, description: 'Upload status and YouTube video metadata' })
  async getUploadStatus(@Param('projectId') projectId: string): Promise<UploadRecord | null> {
    return this.uploadService.getLatestUploadRecord(projectId);
  }
}

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderCallbackPage(title: string, message: string, dashboardUrl: string, success: boolean): string {
  const color = success ? '#22c55e' : '#f59e0b';
  const href = escapeHtml(`${dashboardUrl.replace(/\/$/, '')}/?tab=upload${success ? '&youtube=connected' : ''}`);
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(title)} — Studio</title>
  ${success ? `<meta http-equiv="refresh" content="3;url=${href}">` : ''}
  <style>
    body { background: #0b0f17; color: #fff; font-family: sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 16px; box-sizing: border-box; }
    .card { background: #161f30; padding: 32px; border-radius: 12px; text-align: center; border: 1px solid #2a374a; max-width: 440px; }
    h2 { color: ${color}; margin-bottom: 8px; }
    p { color: #94a3b8; font-size: 14px; line-height: 1.5; }
    a { display: inline-block; margin-top: 16px; padding: 10px 20px; background: #3b82f6; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; }
  </style>
</head>
<body>
  <div class="card">
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(message)}</p>
    ${success ? '<p>Returning to the dashboard…</p>' : ''}
    <a href="${href}">Return to Studio Dashboard</a>
  </div>
</body>
</html>`;
}
