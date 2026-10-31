import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { TokenEncryptionService } from './token-encryption.service';

export interface StoredTokenPayload {
  access_token: string;
  refresh_token: string;
  expiry_date: number; // Unix epoch milliseconds
  scope: string;
  token_type: string;
  channel_title?: string;
  channel_id?: string;
}

export interface YouTubeConnectionStatus {
  connected: boolean;
  channel_profile_id: string;
  youtube_channel_id: string | null;
  channel_title: string | null;
  token_status: 'valid' | 'expired' | 'missing';
  expiry_date: string | null;
  has_refresh_token: boolean;
  upload_scope_granted: boolean;
}

const UPLOAD_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
const CHANNEL_COLUMNS: (keyof ChannelProfile)[] = [
  'id',
  'name',
  'niche',
  'target_regions',
  'language',
  'youtube_channel_id',
  'encrypted_oauth_tokens',
  'created_at',
  'updated_at',
];

@Injectable()
export class YouTubeOAuthService {
  private readonly logger = new Logger(YouTubeOAuthService.name);

  // Scopes strictly confined to upload and reading own channel metadata
  private readonly defaultScopes = [
    UPLOAD_SCOPE,
    'https://www.googleapis.com/auth/youtube.readonly',
  ];

  constructor(
    @InjectRepository(ChannelProfile)
    private readonly channelRepo: Repository<ChannelProfile>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    private readonly configService: ConfigService,
    private readonly encryptionService: TokenEncryptionService,
  ) {}

  // encrypted_oauth_tokens is select:false on the entity, so it must be requested explicitly.
  private findChannelWithTokens(channelProfileId: string): Promise<ChannelProfile | null> {
    return this.channelRepo.findOne({ where: { id: channelProfileId }, select: CHANNEL_COLUMNS });
  }

  private getWebOrigin(): string {
    return this.configService.get<string>('WEB_ORIGIN', 'http://localhost:5173');
  }

  getDashboardUrl(): string {
    return this.getWebOrigin();
  }

  private getStateSecret(): string {
    const key = this.configService.get<string>('YOUTUBE_TOKEN_ENCRYPTION_KEY');
    if (!key || !key.trim()) {
      throw new BadRequestException(
        'YouTube OAuth is not configured: YOUTUBE_TOKEN_ENCRYPTION_KEY is missing from environment.',
      );
    }
    return key.trim();
  }

  private getClientCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
    const clientId = this.configService.get<string>('YOUTUBE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('YOUTUBE_CLIENT_SECRET');
    const redirectUri = this.configService.get<string>(
      'YOUTUBE_REDIRECT_URI',
      'http://localhost:3000/api/youtube/oauth/callback',
    );

    if (!clientId || !clientId.trim()) {
      throw new BadRequestException(
        'YouTube OAuth is not configured: YOUTUBE_CLIENT_ID is missing from environment.',
      );
    }
    if (!clientSecret || !clientSecret.trim()) {
      throw new BadRequestException(
        'YouTube OAuth is not configured: YOUTUBE_CLIENT_SECRET is missing from environment.',
      );
    }

    return { clientId: clientId.trim(), clientSecret: clientSecret.trim(), redirectUri };
  }

  // Generates a cryptographically signed CSRF state token containing channel ID and timestamp
  generateStateToken(channelProfileId: string): string {
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const rawPayload = `${channelProfileId}:${timestamp}:${nonce}`;

    const secretKey = this.getStateSecret();
    const signature = crypto.createHmac('sha256', secretKey).update(rawPayload).digest('hex');

    const stateObj = { channelProfileId, timestamp, nonce, signature };
    return Buffer.from(JSON.stringify(stateObj)).toString('base64url');
  }

  // Validates HMAC signature and freshness of the state parameter to block CSRF attacks
  verifyStateToken(stateParam: string): { channelProfileId: string } {
    if (!stateParam) {
      throw new BadRequestException('Missing OAuth state parameter.');
    }

    try {
      const decoded = Buffer.from(stateParam, 'base64url').toString('utf8');
      const { channelProfileId, timestamp, nonce, signature } = JSON.parse(decoded);

      // Verify expiration: state expires after 10 minutes (600,000 ms)
      if (!timestamp || Date.now() - timestamp > 600000) {
        throw new BadRequestException('OAuth state parameter has expired. Please initiate authorization again.');
      }

      const rawPayload = `${channelProfileId}:${timestamp}:${nonce}`;
      const secretKey = this.getStateSecret();
      const expectedSignature = crypto.createHmac('sha256', secretKey).update(rawPayload).digest('hex');

      // Constant-time comparison
      if (typeof signature !== 'string' || typeof channelProfileId !== 'string') {
        throw new BadRequestException('OAuth state token is malformed.');
      }
      const sigBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
        throw new BadRequestException('OAuth state signature mismatch (possible CSRF attack).');
      }

      return { channelProfileId };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Invalid OAuth state token: ${err.message}`);
    }
  }

  async getAuthorizationUrl(channelProfileId: string): Promise<{ url: string; state: string }> {
    const channel = await this.channelRepo.findOne({ where: { id: channelProfileId } });
    if (!channel) {
      throw new NotFoundException(`Channel profile "${channelProfileId}" not found.`);
    }

    const { clientId, redirectUri } = this.getClientCredentials();
    const state = this.generateStateToken(channelProfileId);

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.defaultScopes.join(' '),
      access_type: 'offline', // Demands refresh_token for background uploads
      prompt: 'consent', // Forces refresh token issuance
      include_granted_scopes: 'true',
      state,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    return { url, state };
  }

  async handleCallback(code: string, state: string): Promise<YouTubeConnectionStatus> {
    if (!code) {
      throw new BadRequestException('Google did not return an authorization code.');
    }
    const { channelProfileId } = this.verifyStateToken(state);
    const channel = await this.findChannelWithTokens(channelProfileId);
    if (!channel) {
      throw new NotFoundException(`Channel profile "${channelProfileId}" not found.`);
    }

    const { clientId, clientSecret, redirectUri } = this.getClientCredentials();

    // 1. Exchange authorization code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      this.logger.error(`OAuth token exchange failed: ${tokenData.error || 'Unknown'}`);
      throw new BadRequestException(
        `Google OAuth token exchange failed: ${tokenData.error_description || tokenData.error}`,
      );
    }

    if (!tokenData.access_token) {
      throw new InternalServerErrorException('Google OAuth response did not contain an access_token.');
    }

    const expiryDate = Date.now() + (tokenData.expires_in || 3600) * 1000;

    // Google's granular consent lets users untick individual scopes. Without the
    // upload scope the connection is useless for this app, so fail clearly.
    const grantedScope: string = tokenData.scope || '';
    if (grantedScope && !grantedScope.split(' ').includes(UPLOAD_SCOPE)) {
      throw new BadRequestException(
        'The "Manage your YouTube videos" (youtube.upload) permission was not granted. ' +
          'Please connect again and allow all requested permissions.',
      );
    }

    // 2. Fetch authorized YouTube channel profile information
    let youtubeChannelId: string | null = null;
    let channelTitle: string | null = null;

    let channelRes: Response;
    try {
      channelRes = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        },
      );
    } catch (e: any) {
      throw new InternalServerErrorException(
        `Could not reach the YouTube Data API to read your channel: ${e.message}`,
      );
    }
    const channelJson: any = await channelRes.json().catch(() => ({}));
    if (!channelRes.ok) {
      const reason = channelJson?.error?.errors?.[0]?.reason || channelJson?.error?.status;
      const message = channelJson?.error?.message || `HTTP ${channelRes.status}`;
      this.logger.error(`YouTube channels.list failed: ${reason || ''} ${message}`);
      throw new BadRequestException(
        reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED'
          ? 'YouTube Data API v3 is not enabled for your Google Cloud project. Enable it in the API Library and try again.'
          : `Could not read your YouTube channel: ${message}`,
      );
    }
    const item = channelJson.items?.[0];
    if (!item) {
      throw new BadRequestException(
        'The Google account you signed in with has no YouTube channel. Create a channel (or pick the brand account that owns it) and connect again.',
      );
    }
    youtubeChannelId = item.id;
    channelTitle = item.snippet?.title || null;

    // 3. Encrypt and store tokens safely
    const existingTokens = this.readDecryptedTokens(channel);
    const refreshToken = tokenData.refresh_token || existingTokens?.refresh_token || '';

    const payload: StoredTokenPayload = {
      access_token: tokenData.access_token,
      refresh_token: refreshToken,
      expiry_date: expiryDate,
      scope: tokenData.scope || this.defaultScopes.join(' '),
      token_type: tokenData.token_type || 'Bearer',
      channel_title: channelTitle || undefined,
      channel_id: youtubeChannelId || undefined,
    };

    channel.encrypted_oauth_tokens = this.encryptionService.encrypt(JSON.stringify(payload));
    if (youtubeChannelId) {
      channel.youtube_channel_id = youtubeChannelId;
    }
    await this.channelRepo.save(channel);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: 'user',
        action: 'YOUTUBE_OAUTH_CONNECTED',
        entity_type: 'channel_profile',
        entity_id: channel.id,
        details_json: {
          youtube_channel_id: youtubeChannelId,
          channel_title: channelTitle,
          scopes: payload.scope,
        },
      }),
    );

    this.logger.log(`Channel profile "${channel.name}" connected to YouTube account "${channelTitle || youtubeChannelId}"`);

    return this.getConnectionStatus(channel.id);
  }

  private readDecryptedTokens(channel: ChannelProfile): StoredTokenPayload | null {
    if (!channel.encrypted_oauth_tokens) return null;
    try {
      const decrypted = this.encryptionService.decrypt(channel.encrypted_oauth_tokens);
      return JSON.parse(decrypted);
    } catch (err: any) {
      this.logger.error(`Failed to decrypt tokens for channel ${channel.id}: ${err.message}`);
      return null;
    }
  }

  async getValidAccessToken(channelProfileId: string): Promise<string> {
    const channel = await this.findChannelWithTokens(channelProfileId);
    if (!channel) {
      throw new NotFoundException(`Channel profile "${channelProfileId}" not found.`);
    }

    const tokens = this.readDecryptedTokens(channel);
    if (!tokens) {
      throw new UnauthorizedException(
        `YouTube account is not connected for channel "${channel.name}". Please complete OAuth authorization first.`,
      );
    }

    // If token expires within 5 minutes (300,000 ms), refresh it
    const fiveMinutes = 300000;
    if (tokens.expiry_date <= Date.now() + fiveMinutes) {
      if (!tokens.refresh_token) {
        throw new UnauthorizedException(
          'OAuth access token has expired and no refresh token is present. Please re-authenticate.',
        );
      }

      this.logger.log(`Refreshing expired YouTube access token for channel profile "${channel.name}"...`);
      const { clientId, clientSecret } = this.getClientCredentials();

      const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: tokens.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      const refreshData = await refreshRes.json();

      if (!refreshRes.ok) {
        // Permissions revoked or refresh token expired
        if (refreshData.error === 'invalid_grant') {
          channel.encrypted_oauth_tokens = null;
          await this.channelRepo.save(channel);

          await this.auditRepo.save(
            this.auditRepo.create({
              actor: 'system',
              action: 'YOUTUBE_TOKEN_REVOKED',
              entity_type: 'channel_profile',
              entity_id: channel.id,
              details_json: { error: refreshData.error_description || refreshData.error },
            }),
          );

          throw new UnauthorizedException(
            'YouTube OAuth credentials have been revoked or expired by Google. Please re-authenticate.',
          );
        }

        throw new InternalServerErrorException(
          `Failed to refresh YouTube access token: ${refreshData.error_description || refreshData.error}`,
        );
      }

      tokens.access_token = refreshData.access_token;
      tokens.expiry_date = Date.now() + (refreshData.expires_in || 3600) * 1000;
      if (refreshData.refresh_token) {
        tokens.refresh_token = refreshData.refresh_token;
      }

      channel.encrypted_oauth_tokens = this.encryptionService.encrypt(JSON.stringify(tokens));
      await this.channelRepo.save(channel);
      this.logger.log(`Access token refreshed successfully for "${channel.name}".`);
    }

    return tokens.access_token;
  }

  async getConnectionStatus(channelProfileId: string): Promise<YouTubeConnectionStatus> {
    const channel = await this.findChannelWithTokens(channelProfileId);
    if (!channel) {
      throw new NotFoundException(`Channel profile "${channelProfileId}" not found.`);
    }

    const tokens = this.readDecryptedTokens(channel);
    if (!tokens) {
      return {
        connected: false,
        channel_profile_id: channelProfileId,
        youtube_channel_id: channel.youtube_channel_id,
        channel_title: null,
        token_status: 'missing',
        expiry_date: null,
        has_refresh_token: false,
        upload_scope_granted: false,
      };
    }

    const isExpired = tokens.expiry_date <= Date.now();

    return {
      connected: true,
      channel_profile_id: channelProfileId,
      youtube_channel_id: channel.youtube_channel_id || tokens.channel_id || null,
      channel_title: tokens.channel_title || null,
      // An expired access token is normal: it is refreshed automatically when a refresh token exists.
      token_status: isExpired && !tokens.refresh_token ? 'expired' : 'valid',
      expiry_date: new Date(tokens.expiry_date).toISOString(),
      has_refresh_token: Boolean(tokens.refresh_token),
      upload_scope_granted: !tokens.scope || tokens.scope.split(' ').includes(UPLOAD_SCOPE),
    };
  }

  async disconnect(channelProfileId: string): Promise<{ disconnected: boolean; revoked_at_google: boolean }> {
    const channel = await this.findChannelWithTokens(channelProfileId);
    if (!channel) {
      throw new NotFoundException(`Channel profile "${channelProfileId}" not found.`);
    }

    // Best-effort revocation at Google so the grant disappears from the user's
    // Google Account permissions, not just from our database.
    let revoked = false;
    const tokens = this.readDecryptedTokens(channel);
    const tokenToRevoke = tokens?.refresh_token || tokens?.access_token;
    if (tokenToRevoke) {
      try {
        const res = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokenToRevoke }),
        });
        revoked = res.ok;
        if (!res.ok) this.logger.warn(`Google token revocation returned HTTP ${res.status}`);
      } catch (e: any) {
        this.logger.warn(`Google token revocation failed: ${e.message}`);
      }
    }

    channel.encrypted_oauth_tokens = null;
    channel.youtube_channel_id = null;
    await this.channelRepo.save(channel);

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: 'user',
        action: 'YOUTUBE_OAUTH_DISCONNECTED',
        entity_type: 'channel_profile',
        entity_id: channel.id,
        details_json: { revoked_at_google: revoked },
      }),
    );

    this.logger.log(`Disconnected YouTube account for channel "${channel.name}".`);
    return { disconnected: true, revoked_at_google: revoked };
  }

  /**
   * Phase 6: Fetch read-only channel performance statistics from YouTube Data API v3
   */
  async getChannelAnalytics(channelProfileId: string): Promise<{
    channel_id: string;
    title: string;
    description: string;
    custom_url?: string;
    published_at: string;
    view_count: number;
    subscriber_count: number;
    video_count: number;
    hidden_subscriber_count: boolean;
    thumbnail_url?: string;
  }> {
    const channel = await this.findChannelWithTokens(channelProfileId);
    if (!channel) {
      throw new NotFoundException(`Channel profile "${channelProfileId}" not found.`);
    }

    const tokens = this.readDecryptedTokens(channel);
    if (!tokens || !tokens.access_token) {
      throw new BadRequestException('YouTube channel is not connected or tokens are missing.');
    }

    const accessToken = await this.getValidAccessToken(channelProfileId);

    let res: Response;
    try {
      res = await fetch(
        'https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true',
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );
    } catch (e: any) {
      this.logger.error(`YouTube channels.list statistics network error: ${e.message}`);
      throw new InternalServerErrorException(`Could not reach YouTube Data API: ${e.message}`);
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const reason = errData?.error?.errors?.[0]?.reason || errData?.error?.message || `HTTP ${res.status}`;
      this.logger.error(`YouTube analytics fetch failed: ${reason}`);
      throw new BadRequestException(`Failed to retrieve YouTube analytics: ${reason}`);
    }

    const data = await res.json();
    const item = data.items?.[0];
    if (!item) {
      throw new NotFoundException('No YouTube channel found associated with this account.');
    }

    const stats = item.statistics || {};
    const snippet = item.snippet || {};

    return {
      channel_id: item.id,
      title: snippet.title || channel.name,
      description: snippet.description || '',
      custom_url: snippet.customUrl,
      published_at: snippet.publishedAt,
      view_count: Number(stats.viewCount || 0),
      subscriber_count: Number(stats.subscriberCount || 0),
      video_count: Number(stats.videoCount || 0),
      hidden_subscriber_count: Boolean(stats.hiddenSubscriberCount),
      thumbnail_url: snippet.thumbnails?.default?.url || snippet.thumbnails?.medium?.url,
    };
  }
}
