import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { UploadRecord, UploadPrivacyStatus, UploadStatus } from '../../database/entities/upload-record.entity';
import { VideoProject, VideoProjectStatus } from '../../database/entities/video-project.entity';
import { RenderJob, RenderJobStatus } from '../../database/entities/render-job.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { ApprovalRecord, ApprovalType, ApprovalDecision } from '../../database/entities/approval-record.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { ChannelProfile } from '../../database/entities/channel-profile.entity';
import { YouTubeOAuthService } from './youtube-oauth.service';
import { UploadApprovalDto } from './dto/upload-approval.dto';
import { StartUploadDto } from './dto/start-upload.dto';

export const MOCK_VIDEO_ID_PREFIX = 'mock_private_';

/** Error carrying the YouTube API "reason" (e.g. quotaExceeded, uploadLimitExceeded). */
class YouTubeApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

async function toYouTubeApiError(res: Response, stage: string): Promise<YouTubeApiError> {
  const errJson: any = await res.json().catch(() => ({}));
  const reason: string | undefined = errJson?.error?.errors?.[0]?.reason;
  const message = errJson?.error?.message || `HTTP ${res.status} ${res.statusText}`;
  let hint = '';
  if (reason === 'quotaExceeded') hint = ' Daily YouTube API quota is used up; try again after it resets (midnight Pacific Time).';
  if (reason === 'uploadLimitExceeded') hint = ' This channel has hit its YouTube upload limit for now.';
  if (res.status === 401) hint = ' Reconnect the YouTube channel and try again.';
  return new YouTubeApiError(`YouTube ${stage} failed: ${message}.${hint}`, (reason || `HTTP_${res.status}`).substring(0, 50));
}

@Injectable()
export class YouTubeUploadService {
  private readonly logger = new Logger(YouTubeUploadService.name);

  constructor(
    @InjectRepository(UploadRecord)
    private readonly uploadRepo: Repository<UploadRecord>,
    @InjectRepository(VideoProject)
    private readonly projectRepo: Repository<VideoProject>,
    @InjectRepository(ChannelProfile)
    private readonly channelRepo: Repository<ChannelProfile>,
    @InjectRepository(RenderJob)
    private readonly renderRepo: Repository<RenderJob>,
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(ApprovalRecord)
    private readonly approvalRepo: Repository<ApprovalRecord>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    private readonly configService: ConfigService,
    private readonly oauthService: YouTubeOAuthService,
  ) {}

  // Explicit Human Upload Approval Gate
  async recordUploadApproval(
    projectId: string,
    dto: UploadApprovalDto,
  ): Promise<{ project: VideoProject; approval: ApprovalRecord }> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Video project "${projectId}" not found.`);
    }

    // Verify project has an approved render before accepting upload approval
    if (project.status !== VideoProjectStatus.RenderApproved && project.status !== VideoProjectStatus.ReadyToUpload) {
      throw new BadRequestException(
        `Cannot record upload approval: project is currently in status "${project.status}". Render must be approved first.`,
      );
    }

    const approval = this.approvalRepo.create({
      video_project_id: projectId,
      approval_type: ApprovalType.Upload,
      decision: dto.decision,
      notes: dto.notes || null,
      approved_by: dto.approved_by || 'local_creator',
    });
    const savedApproval = await this.approvalRepo.save(approval);

    if (dto.decision === ApprovalDecision.Approved) {
      project.status = VideoProjectStatus.ReadyToUpload;
      await this.projectRepo.save(project);
    } else {
      // Rejection returns project to render_review for inspection
      project.status = VideoProjectStatus.RenderReview;
      await this.projectRepo.save(project);
    }

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: dto.approved_by || 'local_creator',
        action: dto.decision === ApprovalDecision.Approved ? 'UPLOAD_APPROVED' : 'UPLOAD_REJECTED',
        entity_type: 'video_project',
        entity_id: project.id,
        details_json: {
          decision: dto.decision,
          notes: dto.notes,
        },
      }),
    );

    return { project, approval: savedApproval };
  }

  // Pre-flight check & upload pipeline execution
  async uploadVideoToYouTube(
    projectId: string,
    dto?: StartUploadDto,
  ): Promise<UploadRecord> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId },
      relations: ['channel_profile'],
    });
    if (!project) {
      throw new NotFoundException(`Video project "${projectId}" not found.`);
    }

    // 1. Mandatory Safety Gate: Public release is hardcoded disabled in MVP
    const publicAllowed = this.configService.get<boolean>('ENABLE_PUBLIC_RELEASE', false);
    if (publicAllowed) {
      throw new ForbiddenException(
        'Public release is disabled by safety policy. Only strictly private uploads are allowed.',
      );
    }

    // 2. Pre-flight: Approved script verification
    const script = await this.scriptRepo.findOne({
      where: { video_project_id: projectId, status: ScriptStatus.Approved },
      order: { version: 'DESC' },
    });
    if (!script) {
      throw new BadRequestException('Pre-flight failed: project has no approved script.');
    }

    // 3. Pre-flight: Rendered file & FFprobe validation verification
    const latestRender = await this.renderRepo.findOne({
      where: { video_project_id: projectId, status: RenderJobStatus.Completed },
      order: { created_at: 'DESC' },
    });
    if (!latestRender || !latestRender.output_path || !fs.existsSync(latestRender.output_path)) {
      throw new BadRequestException(
        'Pre-flight failed: rendered video file does not exist on disk.',
      );
    }
    if (!latestRender.validation_json?.valid) {
      throw new BadRequestException(
        'Pre-flight failed: rendered video failed FFprobe technical validation.',
      );
    }

    // 4. Pre-flight: Fresh Human Upload Approval Gate Verification
    const latestUploadApproval = await this.approvalRepo.findOne({
      where: {
        video_project_id: projectId,
        approval_type: ApprovalType.Upload,
        decision: ApprovalDecision.Approved,
      },
      order: { created_at: 'DESC' },
    });

    if (!latestUploadApproval) {
      throw new BadRequestException(
        'Upload rejected: separate human upload approval is required before uploading to YouTube.',
      );
    }

    // Approval cannot be reused if render or script was completed AFTER the upload approval
    if (latestRender.finished_at && latestUploadApproval.created_at < latestRender.finished_at) {
      throw new BadRequestException(
        'Upload approval is stale: a new render was completed after approval was recorded. Re-approval required.',
      );
    }

    // 5. Metadata Preparation (pre-filled from script metadata package or DTO overrides)
    const title = (dto?.title || script.metadata_json?.title || project.title).substring(0, 100);
    const description = (
      dto?.description ||
      script.metadata_json?.description ||
      `Original production created in YouTube Automation Studio.\n\nTopic: ${project.topic}`
    ).substring(0, 5000);
    const tags = dto?.tags || script.metadata_json?.tags || ['YouTubeAutomation', 'Studio'];
    const categoryId = dto?.category_id || '28'; // Science & Technology

    const fileStats = fs.statSync(latestRender.output_path);

    // 6. Live uploads need the creator's own audience + disclosure decisions (never inferred).
    const uploadsEnabled = this.configService.get<boolean>('ENABLE_YOUTUBE_UPLOADS', false);
    if (uploadsEnabled) {
      if (typeof dto?.made_for_kids !== 'boolean') {
        throw new BadRequestException(
          'Audience declaration missing: choose whether this video is "Made for kids" before uploading.',
        );
      }
      if (typeof dto?.contains_synthetic_media !== 'boolean') {
        throw new BadRequestException(
          'Altered/synthetic content disclosure missing: declare whether the video contains realistic AI-generated or altered content.',
        );
      }
    }

    // 7. Idempotency: never send the same render to YouTube twice by accident
    let uploadRecord = await this.uploadRepo.findOne({
      where: { video_project_id: projectId },
      order: { created_at: 'DESC' },
    });

    const STALE_UPLOAD_MS = 30 * 60 * 1000; // treat an 'uploading' record older than 30 min as crashed
    if (
      uploadRecord?.upload_status === UploadStatus.Uploading &&
      uploadRecord.last_attempt_at &&
      Date.now() - new Date(uploadRecord.last_attempt_at).getTime() < STALE_UPLOAD_MS
    ) {
      throw new ConflictException('An upload for this project is already in progress.');
    }
    const isRealUpload =
      uploadRecord?.upload_status === UploadStatus.UploadedPrivate &&
      !!uploadRecord.youtube_video_id &&
      !uploadRecord.youtube_video_id.startsWith(MOCK_VIDEO_ID_PREFIX);
    if (
      isRealUpload &&
      uploadRecord!.uploaded_at &&
      (!latestRender.finished_at || latestRender.finished_at <= uploadRecord!.uploaded_at)
    ) {
      throw new ConflictException(
        `This render is already on YouTube as private video ${uploadRecord!.youtube_video_id}. Re-render the project to upload a new version.`,
      );
    }

    const isRetry =
      uploadRecord?.upload_status === UploadStatus.Failed || uploadRecord?.upload_status === UploadStatus.Uploading;
    if (!uploadRecord || !isRetry) {
      uploadRecord = this.uploadRepo.create({
        video_project_id: projectId,
        channel_profile_id: project.channel_profile_id,
        privacy_status: UploadPrivacyStatus.Private, // Strictly private
        upload_status: UploadStatus.Uploading,
        youtube_title: title,
        youtube_description: description,
        youtube_tags: tags,
        video_file_path: latestRender.output_path,
        video_file_size: fileStats.size,
        upload_attempts: 1,
        last_attempt_at: new Date(),
      });
    } else {
      // Retry of a failed attempt: reuse the record and refresh its metadata
      uploadRecord.youtube_title = title;
      uploadRecord.youtube_description = description;
      uploadRecord.youtube_tags = tags;
      uploadRecord.video_file_path = latestRender.output_path;
      uploadRecord.video_file_size = fileStats.size;
      uploadRecord.upload_status = UploadStatus.Uploading;
      uploadRecord.upload_attempts += 1;
      uploadRecord.last_attempt_at = new Date();
    }
    uploadRecord = await this.uploadRepo.save(uploadRecord);

    // Update project state
    project.status = VideoProjectStatus.Uploading;
    await this.projectRepo.save(project);

    // 8. Check Feature Switch: ENABLE_YOUTUBE_UPLOADS
    if (!uploadsEnabled) {
      this.logger.warn(
        `Safety switch ENABLE_YOUTUBE_UPLOADS is disabled. Pre-flight checks passed; mock upload staging recorded.`,
      );

      // In safe disabled mode, simulate successful private upload staging with deterministic dummy ID
      const mockVideoId = `${MOCK_VIDEO_ID_PREFIX}${project.id.substring(0, 8)}`;
      uploadRecord.youtube_video_id = mockVideoId;
      uploadRecord.upload_status = UploadStatus.UploadedPrivate;
      uploadRecord.uploaded_at = new Date();
      await this.uploadRepo.save(uploadRecord);

      project.status = VideoProjectStatus.UploadedPrivate;
      await this.projectRepo.save(project);

      await this.auditRepo.save(
        this.auditRepo.create({
          actor: 'system',
          action: 'YOUTUBE_UPLOAD_STAGED_PRIVATE_MOCK',
          entity_type: 'upload_record',
          entity_id: uploadRecord.id,
          details_json: {
            youtube_video_id: mockVideoId,
            privacy_status: 'private',
            note: 'Staged safely with ENABLE_YOUTUBE_UPLOADS=false',
          },
        }),
      );

      return uploadRecord;
    }

    // 9. Live YouTube Data API v3 Upload Flow
    try {
      const accessToken = await this.oauthService.getValidAccessToken(project.channel_profile_id);

      // Step A: Initiate Resumable Upload Session
      const initUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';
      const metadataPayload = {
        snippet: {
          title,
          description,
          tags,
          categoryId,
        },
        status: {
          privacyStatus: 'private', // Enforced hardcoded
          selfDeclaredMadeForKids: dto!.made_for_kids,
          containsSyntheticMedia: dto!.contains_synthetic_media,
        },
      };

      const initResponse = await fetch(initUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': 'video/mp4',
          'X-Upload-Content-Length': fileStats.size.toString(),
        },
        body: JSON.stringify(metadataPayload),
      });

      if (!initResponse.ok) {
        throw await toYouTubeApiError(initResponse, 'resumable upload initiation');
      }

      const uploadLocation = initResponse.headers.get('Location');
      if (!uploadLocation) {
        throw new Error('YouTube did not return a resumable Location URL header.');
      }

      // Step B: Stream / Upload Video Binary Data
      const fileBuffer = fs.readFileSync(latestRender.output_path);
      const uploadResponse = await fetch(uploadLocation, {
        method: 'PUT',
        headers: {
          'Content-Type': 'video/mp4',
          'Content-Length': fileStats.size.toString(),
        },
        body: fileBuffer,
      });

      if (!uploadResponse.ok) {
        throw await toYouTubeApiError(uploadResponse, 'video upload');
      }

      const uploadedVideoJson = await uploadResponse.json();
      const youtubeVideoId = uploadedVideoJson.id;

      if (!youtubeVideoId) {
        throw new Error('YouTube upload completed but returned no video ID.');
      }

      // Finalize successful private upload
      uploadRecord.youtube_video_id = youtubeVideoId;
      uploadRecord.upload_status = UploadStatus.UploadedPrivate;
      uploadRecord.uploaded_at = new Date();
      uploadRecord.error_code = null;
      uploadRecord.error_message = null;
      await this.uploadRepo.save(uploadRecord);

      project.status = VideoProjectStatus.UploadedPrivate;
      await this.projectRepo.save(project);

      await this.auditRepo.save(
        this.auditRepo.create({
          actor: 'system',
          action: 'YOUTUBE_VIDEO_UPLOADED_PRIVATE',
          entity_type: 'upload_record',
          entity_id: uploadRecord.id,
          details_json: {
            youtube_video_id: youtubeVideoId,
            privacy_status: 'private',
            title,
          },
        }),
      );

      this.logger.log(`Successfully uploaded project "${project.title}" to YouTube as PRIVATE (ID: ${youtubeVideoId})`);
      return uploadRecord;
    } catch (err: any) {
      this.logger.error(`YouTube upload failed: ${err.message}`);

      uploadRecord.upload_status = UploadStatus.Failed;
      uploadRecord.error_code =
        err instanceof YouTubeApiError
          ? err.code
          : typeof err?.getStatus === 'function' && err.getStatus() === 401
            ? 'NOT_AUTHORIZED'
            : 'UPLOAD_ERROR';
      uploadRecord.error_message = err.message || 'Unknown upload error';
      await this.uploadRepo.save(uploadRecord);

      project.status = VideoProjectStatus.ReadyToUpload; // Keep ready for retry
      await this.projectRepo.save(project);

      throw new InternalServerErrorException(`YouTube upload failed: ${err.message}`);
    }
  }

  async getLatestUploadRecord(projectId: string): Promise<UploadRecord | null> {
    return this.uploadRepo.findOne({
      where: { video_project_id: projectId },
      order: { created_at: 'DESC' },
    });
  }
}
