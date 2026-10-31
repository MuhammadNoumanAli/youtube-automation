import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { YouTubeOAuthService } from './youtube-oauth.service';
import { YouTubeUploadService } from './youtube-upload.service';
import { TokenEncryptionService } from './token-encryption.service';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { VideoProject, VideoProjectStatus, VideoFormat } from '../../database/entities/video-project.entity';
import { RenderJob, RenderJobStatus } from '../../database/entities/render-job.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { ApprovalRecord, ApprovalType, ApprovalDecision } from '../../database/entities/approval-record.entity';
import { UploadRecord, UploadStatus, UploadPrivacyStatus } from '../../database/entities/upload-record.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';

describe('YouTube OAuth & Upload Services', () => {
  let oauthService: YouTubeOAuthService;
  let uploadService: YouTubeUploadService;
  let encryptionService: TokenEncryptionService;

  const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  const mockChannelRepo = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (ch) => ch),
  };

  const mockProjectRepo = {
    findOne: jest.fn(),
    save: jest.fn().mockImplementation(async (p) => p),
  };

  const mockRenderRepo = {
    findOne: jest.fn(),
  };

  const mockScriptRepo = {
    findOne: jest.fn(),
  };

  const mockApprovalRepo = {
    create: jest.fn().mockImplementation((dto) => ({ id: 'appr-1', ...dto })),
    save: jest.fn().mockImplementation(async (a) => ({ ...a, id: a.id || 'appr-1' })),
    findOne: jest.fn(),
  };

  const mockUploadRepo = {
    create: jest.fn().mockImplementation((dto) => ({ id: 'up-1', ...dto })),
    save: jest.fn().mockImplementation(async (u) => ({ ...u, id: u.id || 'up-1' })),
    findOne: jest.fn(),
  };

  const mockAuditRepo = {
    create: jest.fn().mockImplementation((dto) => dto),
    save: jest.fn().mockImplementation(async (dto) => dto),
  };

  let mockConfigValues: Record<string, any> = {};

  const mockConfigService = {
    get: jest.fn((key: string, def?: any) => {
      if (key in mockConfigValues) return mockConfigValues[key];
      return def;
    }),
  };

  // Mock global fetch for Google OAuth & YouTube API endpoints
  const originalFetch = global.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConfigValues = {
      YOUTUBE_CLIENT_ID: 'mock_client_id_123',
      YOUTUBE_CLIENT_SECRET: 'mock_client_secret_456',
      YOUTUBE_REDIRECT_URI: 'http://localhost:3000/api/youtube/oauth/callback',
      YOUTUBE_TOKEN_ENCRYPTION_KEY: validKey,
      ENABLE_YOUTUBE_UPLOADS: false,
      ENABLE_PUBLIC_RELEASE: false,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenEncryptionService,
        YouTubeOAuthService,
        YouTubeUploadService,
        { provide: getRepositoryToken(ChannelProfile), useValue: mockChannelRepo },
        { provide: getRepositoryToken(VideoProject), useValue: mockProjectRepo },
        { provide: getRepositoryToken(RenderJob), useValue: mockRenderRepo },
        { provide: getRepositoryToken(Script), useValue: mockScriptRepo },
        { provide: getRepositoryToken(ApprovalRecord), useValue: mockApprovalRepo },
        { provide: getRepositoryToken(UploadRecord), useValue: mockUploadRepo },
        { provide: getRepositoryToken(AuditEvent), useValue: mockAuditRepo },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    encryptionService = module.get<TokenEncryptionService>(TokenEncryptionService);
    oauthService = module.get<YouTubeOAuthService>(YouTubeOAuthService);
    uploadService = module.get<YouTubeUploadService>(YouTubeUploadService);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('OAuth Flow & CSRF State Security', () => {
    it('should generate Google OAuth URL with signed CSRF state parameter', async () => {
      mockChannelRepo.findOne.mockResolvedValue({ id: 'chan-1', name: 'Tech Insights' });

      const result = await oauthService.getAuthorizationUrl('chan-1');

      expect(result.url).toContain('accounts.google.com/o/oauth2/v2/auth');
      expect(result.url).toContain('client_id=mock_client_id_123');
      expect(result.url).toContain('scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fyoutube.upload');
      expect(result.url).toContain('access_type=offline');
      expect(result.state).toBeDefined();

      // State must be verifiable
      const verified = oauthService.verifyStateToken(result.state);
      expect(verified.channelProfileId).toBe('chan-1');
    });

    it('should reject tampered or forged state parameters', () => {
      const validState = oauthService.generateStateToken('chan-1');
      const tampered = validState.slice(0, -4) + 'abcd';

      expect(() => oauthService.verifyStateToken(tampered)).toThrow(BadRequestException);
    });

    it('should reject expired state parameters (> 10 minutes)', () => {
      // Craft an expired state token manually
      const expiredObj = {
        channelProfileId: 'chan-1',
        timestamp: Date.now() - 700000, // 11.6 minutes ago
        nonce: 'abc123nonce',
        signature: 'dummysig',
      };
      const expiredState = Buffer.from(JSON.stringify(expiredObj)).toString('base64url');

      expect(() => oauthService.verifyStateToken(expiredState)).toThrow(BadRequestException);
    });

    it('should handle token refresh when existing token is near expiry', async () => {
      const nearExpiryDate = Date.now() + 60000; // expires in 1 minute (within 5-min refresh buffer)
      const unencryptedTokens = {
        access_token: 'old_access_token',
        refresh_token: 'valid_refresh_token',
        expiry_date: nearExpiryDate,
        scope: 'https://www.googleapis.com/auth/youtube.upload',
        token_type: 'Bearer',
      };

      const encrypted = encryptionService.encrypt(JSON.stringify(unencryptedTokens));
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        name: 'Tech Insights',
        encrypted_oauth_tokens: encrypted,
      });

      // Mock Google refresh token response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          access_token: 'new_refreshed_access_token_777',
          expires_in: 3600,
        }),
      } as any);

      const validToken = await oauthService.getValidAccessToken('chan-1');
      expect(validToken).toBe('new_refreshed_access_token_777');
      expect(mockChannelRepo.save).toHaveBeenCalled();
    });

    it('should fail safely and revoke credentials when Google returns invalid_grant on refresh', async () => {
      const expiredTokens = {
        access_token: 'expired_access_token',
        refresh_token: 'revoked_refresh_token',
        expiry_date: Date.now() - 10000,
      };

      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        name: 'Tech Insights',
        encrypted_oauth_tokens: encryptionService.encrypt(JSON.stringify(expiredTokens)),
      });

      // Mock Google invalid_grant error (token revoked by user)
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been expired or revoked.',
        }),
      } as any);

      await expect(oauthService.getValidAccessToken('chan-1')).rejects.toThrow(UnauthorizedException);
      // Verify revoked tokens were purged from database
      expect(mockChannelRepo.save).toHaveBeenCalled();
      expect(mockAuditRepo.save).toHaveBeenCalled();
    });
  });

  describe('OAuth Callback & Channel Fetch', () => {
    const makeState = () => oauthService.generateStateToken('chan-1');

    const mockGoogle = (opts: { scope?: string; channels?: any; channelsOk?: boolean; refresh?: boolean }) => {
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('oauth2.googleapis.com/token')) {
          return {
            ok: true,
            json: async () => ({
              access_token: 'ya29.new',
              ...(opts.refresh === false ? {} : { refresh_token: '1//refresh' }),
              expires_in: 3599,
              scope:
                opts.scope ??
                'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
              token_type: 'Bearer',
            }),
          };
        }
        if (url.includes('youtube/v3/channels')) {
          return {
            ok: opts.channelsOk ?? true,
            status: opts.channelsOk === false ? 403 : 200,
            json: async () => opts.channels,
          };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });
    };

    it('should store the connected channel ID/title and report a refresh token', async () => {
      const channel: any = { id: 'chan-1', name: 'Tech Insights', encrypted_oauth_tokens: null };
      mockChannelRepo.findOne.mockResolvedValue(channel);
      mockGoogle({ channels: { items: [{ id: 'UC123', snippet: { title: 'My Channel' } }] } });

      const status = await oauthService.handleCallback('auth-code', makeState());

      expect(channel.youtube_channel_id).toBe('UC123');
      expect(status.connected).toBe(true);
      expect(status.channel_title).toBe('My Channel');
      expect(status.has_refresh_token).toBe(true);
      expect(status.upload_scope_granted).toBe(true);
      // Token is stored encrypted, never as plain text
      expect(channel.encrypted_oauth_tokens).not.toContain('ya29.new');
    });

    it('should fail clearly when the Google account has no YouTube channel', async () => {
      mockChannelRepo.findOne.mockResolvedValue({ id: 'chan-1', name: 'Tech Insights' });
      mockGoogle({ channels: { items: [] } });
      await expect(oauthService.handleCallback('auth-code', makeState())).rejects.toThrow(/no YouTube channel/);
    });

    it('should fail clearly when the upload scope was not granted', async () => {
      mockChannelRepo.findOne.mockResolvedValue({ id: 'chan-1', name: 'Tech Insights' });
      mockGoogle({ scope: 'https://www.googleapis.com/auth/youtube.readonly', channels: { items: [] } });
      await expect(oauthService.handleCallback('auth-code', makeState())).rejects.toThrow(/youtube.upload/);
    });

    it('should explain when the YouTube Data API is not enabled', async () => {
      mockChannelRepo.findOne.mockResolvedValue({ id: 'chan-1', name: 'Tech Insights' });
      mockGoogle({
        channelsOk: false,
        channels: { error: { message: 'disabled', errors: [{ reason: 'accessNotConfigured' }] } },
      });
      await expect(oauthService.handleCallback('auth-code', makeState())).rejects.toThrow(/not enabled/);
    });

    it('should revoke the token at Google when disconnecting', async () => {
      const tokens = encryptionService.encrypt(
        JSON.stringify({ access_token: 'a', refresh_token: 'r', expiry_date: Date.now() + 1e6, scope: '', token_type: 'Bearer' }),
      );
      const channel: any = { id: 'chan-1', name: 'Tech Insights', encrypted_oauth_tokens: tokens, youtube_channel_id: 'UC1' };
      mockChannelRepo.findOne.mockResolvedValue(channel);
      global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 });

      const result = await oauthService.disconnect('chan-1');

      expect(result.revoked_at_google).toBe(true);
      expect((global.fetch as jest.Mock).mock.calls[0][0]).toContain('oauth2.googleapis.com/revoke');
      expect(channel.encrypted_oauth_tokens).toBeNull();
      expect(channel.youtube_channel_id).toBeNull();
    });
  });

  describe('getChannelAnalytics', () => {
    it('should return mapped statistics and channel metadata', async () => {
      const tokens = encryptionService.encrypt(
        JSON.stringify({ access_token: 'valid_access_token', refresh_token: 'r', expiry_date: Date.now() + 1e6 }),
      );
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        name: 'Tech Insights',
        encrypted_oauth_tokens: tokens,
        youtube_channel_id: 'UC123',
      });

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [
            {
              id: 'UC123',
              snippet: {
                title: 'Tech Insights Official',
                description: 'Deep dive tech tutorials',
                customUrl: '@techinsights',
                publishedAt: '2023-01-15T00:00:00Z',
                thumbnails: { default: { url: 'https://example.com/thumb.jpg' } },
              },
              statistics: {
                viewCount: '15420',
                subscriberCount: '1240',
                videoCount: '48',
                hiddenSubscriberCount: false,
              },
            },
          ],
        }),
      });

      const analytics = await oauthService.getChannelAnalytics('chan-1');

      expect(analytics.channel_id).toBe('UC123');
      expect(analytics.title).toBe('Tech Insights Official');
      expect(analytics.custom_url).toBe('@techinsights');
      expect(analytics.subscriber_count).toBe(1240);
      expect(analytics.view_count).toBe(15420);
      expect(analytics.video_count).toBe(48);
      expect(analytics.thumbnail_url).toBe('https://example.com/thumb.jpg');
    });

    it('should throw BadRequestException if channel has no tokens', async () => {
      mockChannelRepo.findOne.mockResolvedValue({
        id: 'chan-1',
        name: 'Tech Insights',
        encrypted_oauth_tokens: null,
      });

      await expect(oauthService.getChannelAnalytics('chan-1')).rejects.toThrow(BadRequestException);
    });
  });

  describe('Upload Safety Gates & Mandatory Constraints', () => {
    const dummyRenderPath = path.resolve('./storage_test/test_render.mp4');

    beforeAll(() => {
      fs.mkdirSync(path.dirname(dummyRenderPath), { recursive: true });
      fs.writeFileSync(dummyRenderPath, Buffer.from('dummy video binary data for test'));
    });

    afterAll(() => {
      if (fs.existsSync(dummyRenderPath)) {
        fs.unlinkSync(dummyRenderPath);
      }
    });

    it('should reject upload if human upload approval is missing', async () => {
      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        channel_profile_id: 'chan-1',
        title: 'Automation Video',
        status: VideoProjectStatus.RenderApproved,
      });

      mockScriptRepo.findOne.mockResolvedValue({
        id: 'script-1',
        status: ScriptStatus.Approved,
      });

      mockRenderRepo.findOne.mockResolvedValue({
        id: 'render-1',
        status: RenderJobStatus.Completed,
        output_path: dummyRenderPath,
        validation_json: { valid: true },
      });

      // No upload approval in DB
      mockApprovalRepo.findOne.mockResolvedValue(null);

      await expect(uploadService.uploadVideoToYouTube('proj-1')).rejects.toThrow(BadRequestException);
    });

    it('should reject upload if approval is stale (render finished after upload approval)', async () => {
      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        channel_profile_id: 'chan-1',
        title: 'Automation Video',
        status: VideoProjectStatus.ReadyToUpload,
      });

      mockScriptRepo.findOne.mockResolvedValue({
        id: 'script-1',
        status: ScriptStatus.Approved,
      });

      // Render finished at 10:00 AM
      mockRenderRepo.findOne.mockResolvedValue({
        id: 'render-1',
        status: RenderJobStatus.Completed,
        output_path: dummyRenderPath,
        validation_json: { valid: true },
        finished_at: new Date('2026-10-29T10:00:00Z'),
      });

      // Upload approval was given at 09:30 AM (BEFORE the render finished)
      mockApprovalRepo.findOne.mockResolvedValue({
        id: 'appr-old',
        approval_type: ApprovalType.Upload,
        decision: ApprovalDecision.Approved,
        created_at: new Date('2026-10-29T09:30:00Z'),
      });

      await expect(uploadService.uploadVideoToYouTube('proj-1')).rejects.toThrow(
        /Upload approval is stale/,
      );
    });

    it('should reject upload if public release feature flag is enabled', async () => {
      mockConfigValues.ENABLE_PUBLIC_RELEASE = true; // Violating safety constraint

      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        channel_profile_id: 'chan-1',
        title: 'Automation Video',
      });

      await expect(uploadService.uploadVideoToYouTube('proj-1')).rejects.toThrow(ForbiddenException);
    });

    it('should stage upload safely as private when ENABLE_YOUTUBE_UPLOADS=false', async () => {
      mockConfigValues.ENABLE_YOUTUBE_UPLOADS = false;

      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        channel_profile_id: 'chan-1',
        title: 'Automation Video',
        status: VideoProjectStatus.ReadyToUpload,
      });

      mockScriptRepo.findOne.mockResolvedValue({
        id: 'script-1',
        status: ScriptStatus.Approved,
      });

      mockRenderRepo.findOne.mockResolvedValue({
        id: 'render-1',
        status: RenderJobStatus.Completed,
        output_path: dummyRenderPath,
        validation_json: { valid: true },
        finished_at: new Date('2026-10-29T10:00:00Z'),
      });

      mockApprovalRepo.findOne.mockResolvedValue({
        id: 'appr-fresh',
        approval_type: ApprovalType.Upload,
        decision: ApprovalDecision.Approved,
        created_at: new Date('2026-10-29T10:15:00Z'), // Fresh approval
      });

      const result = await uploadService.uploadVideoToYouTube('proj-1');

      expect(result.upload_status).toBe(UploadStatus.UploadedPrivate);
      expect(result.privacy_status).toBe(UploadPrivacyStatus.Private);
      expect(result.youtube_video_id).toContain('mock_private_');
      expect(mockUploadRepo.save).toHaveBeenCalled();
      expect(mockAuditRepo.save).toHaveBeenCalled();
    });

    it('should execute live resumable upload strictly enforcing privacyStatus: private in YouTube API payload', async () => {
      mockConfigValues.ENABLE_YOUTUBE_UPLOADS = true; // Live upload test

      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        channel_profile_id: 'chan-1',
        title: 'Original Production',
        status: VideoProjectStatus.ReadyToUpload,
      });

      mockScriptRepo.findOne.mockResolvedValue({
        id: 'script-1',
        status: ScriptStatus.Approved,
        metadata_json: {
          title: 'Clean Original Production Title',
          description: 'Educational walkthrough of distributed workflows',
          tags: ['tech', 'architecture'],
        },
      });

      mockRenderRepo.findOne.mockResolvedValue({
        id: 'render-1',
        status: RenderJobStatus.Completed,
        output_path: dummyRenderPath,
        validation_json: { valid: true },
        finished_at: new Date('2026-10-29T10:00:00Z'),
      });

      mockApprovalRepo.findOne.mockResolvedValue({
        id: 'appr-fresh',
        approval_type: ApprovalType.Upload,
        decision: ApprovalDecision.Approved,
        created_at: new Date('2026-10-29T10:15:00Z'),
      });

      // Mock access token retrieval
      jest.spyOn(oauthService, 'getValidAccessToken').mockResolvedValue('ya29.valid_access_token');

      // Track payload sent to Google
      let capturedInitBody: any = null;

      global.fetch = jest.fn().mockImplementation(async (url: string, opts: any) => {
        if (url.includes('uploadType=resumable')) {
          capturedInitBody = JSON.parse(opts.body);
          return {
            ok: true,
            status: 200,
            headers: {
              get: (h: string) =>
                h.toLowerCase() === 'location'
                  ? 'https://www.googleapis.com/upload/resumable_session_url_123'
                  : null,
            },
          };
        }
        if (url.includes('resumable_session_url_123')) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              id: 'youtube_live_vid_999',
              status: { privacyStatus: 'private' },
            }),
          };
        }
        return { ok: false, status: 404 };
      });

      const result = await uploadService.uploadVideoToYouTube('proj-1', {
        made_for_kids: false,
        contains_synthetic_media: true,
      });

      // Verify privacyStatus: 'private' was sent in the YouTube API payload
      expect(capturedInitBody).toBeDefined();
      expect(capturedInitBody.status.privacyStatus).toBe('private');
      // Creator declarations are passed through, never inferred
      expect(capturedInitBody.status.selfDeclaredMadeForKids).toBe(false);
      expect(capturedInitBody.status.containsSyntheticMedia).toBe(true);
      expect(capturedInitBody.snippet.title).toBe('Clean Original Production Title');

      // Verify DB record
      expect(result.youtube_video_id).toBe('youtube_live_vid_999');
      expect(result.upload_status).toBe(UploadStatus.UploadedPrivate);
      expect(result.privacy_status).toBe(UploadPrivacyStatus.Private);
    });
  
    const setUpReadyProject = () => {
      mockProjectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        channel_profile_id: 'chan-1',
        title: 'Original Production',
        status: VideoProjectStatus.ReadyToUpload,
      });
      mockScriptRepo.findOne.mockResolvedValue({ id: 'script-1', status: ScriptStatus.Approved });
      mockRenderRepo.findOne.mockResolvedValue({
        id: 'render-1',
        status: RenderJobStatus.Completed,
        output_path: dummyRenderPath,
        validation_json: { valid: true },
        finished_at: new Date('2026-10-29T10:00:00Z'),
      });
      mockApprovalRepo.findOne.mockResolvedValue({
        id: 'appr-fresh',
        approval_type: ApprovalType.Upload,
        decision: ApprovalDecision.Approved,
        created_at: new Date('2026-10-29T10:15:00Z'),
      });
    };

    it('should refuse a live upload when the creator has not declared audience / synthetic content', async () => {
      mockConfigValues.ENABLE_YOUTUBE_UPLOADS = true;
      setUpReadyProject();
      mockUploadRepo.findOne.mockResolvedValue(null);
      global.fetch = jest.fn();

      await expect(uploadService.uploadVideoToYouTube('proj-1', {})).rejects.toThrow(BadRequestException);
      await expect(
        uploadService.uploadVideoToYouTube('proj-1', { made_for_kids: false }),
      ).rejects.toThrow(BadRequestException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should block a duplicate upload of a render that is already on YouTube', async () => {
      mockConfigValues.ENABLE_YOUTUBE_UPLOADS = true;
      setUpReadyProject();
      mockUploadRepo.findOne.mockResolvedValue({
        id: 'up-existing',
        upload_status: UploadStatus.UploadedPrivate,
        youtube_video_id: 'real_video_123',
        uploaded_at: new Date('2026-10-29T11:00:00Z'),
      });
      global.fetch = jest.fn();

      await expect(
        uploadService.uploadVideoToYouTube('proj-1', { made_for_kids: false, contains_synthetic_media: false }),
      ).rejects.toThrow(ConflictException);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should not let an earlier mock staging record block a real upload', async () => {
      mockConfigValues.ENABLE_YOUTUBE_UPLOADS = true;
      setUpReadyProject();
      mockUploadRepo.findOne.mockResolvedValue({
        id: 'up-mock',
        upload_status: UploadStatus.UploadedPrivate,
        youtube_video_id: 'mock_private_proj-1',
        uploaded_at: new Date('2026-10-29T11:00:00Z'),
        upload_attempts: 1,
      });
      jest.spyOn(oauthService, 'getValidAccessToken').mockResolvedValue('ya29.token');
      global.fetch = jest.fn().mockImplementation(async (url: string) => {
        if (url.includes('uploadType=resumable')) {
          return { ok: true, status: 200, headers: { get: () => 'https://upload.example/session' } };
        }
        return { ok: true, status: 200, json: async () => ({ id: 'real_vid_1' }) };
      });

      const result = await uploadService.uploadVideoToYouTube('proj-1', {
        made_for_kids: false,
        contains_synthetic_media: false,
      });
      expect(result.youtube_video_id).toBe('real_vid_1');
    });

    it('should record the YouTube error reason (e.g. quotaExceeded) on failure', async () => {
      mockConfigValues.ENABLE_YOUTUBE_UPLOADS = true;
      setUpReadyProject();
      mockUploadRepo.findOne.mockResolvedValue(null);
      jest.spyOn(oauthService, 'getValidAccessToken').mockResolvedValue('ya29.token');
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { message: 'quota', errors: [{ reason: 'quotaExceeded' }] } }),
      });

      await expect(
        uploadService.uploadVideoToYouTube('proj-1', { made_for_kids: false, contains_synthetic_media: false }),
      ).rejects.toThrow(InternalServerErrorException);
      const lastSaved = mockUploadRepo.save.mock.calls.at(-1)?.[0];
      expect(lastSaved.upload_status).toBe(UploadStatus.Failed);
      expect(lastSaved.error_code).toBe('quotaExceeded');
    });
});
});
