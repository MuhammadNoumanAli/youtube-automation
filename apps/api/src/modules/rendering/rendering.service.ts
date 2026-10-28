import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { RenderJob, RenderJobStatus, VideoProbeValidation } from '../../database/entities/render-job.entity';
import { VideoProject, VideoProjectStatus, VideoFormat } from '../../database/entities/video-project.entity';
import { Script, ScriptStatus } from '../../database/entities/script.entity';
import { Narration } from '../../database/entities/narration.entity';
import { Asset } from '../../database/entities/asset.entity';
import { ApprovalRecord, ApprovalType } from '../../database/entities/approval-record.entity';
import { AuditEvent } from '../../database/entities/audit-event.entity';
import { NarrationService } from '../narration/narration.service';
import { StartRenderDto } from './dto/start-render.dto';
import { RenderApprovalDto } from './dto/render-approval.dto';

@Injectable()
export class RenderingService {
  private readonly logger = new Logger(RenderingService.name);

  constructor(
    @InjectRepository(RenderJob)
    private readonly renderRepo: Repository<RenderJob>,
    @InjectRepository(VideoProject)
    private readonly projectRepo: Repository<VideoProject>,
    @InjectRepository(Script)
    private readonly scriptRepo: Repository<Script>,
    @InjectRepository(Narration)
    private readonly narrationRepo: Repository<Narration>,
    @InjectRepository(Asset)
    private readonly assetRepo: Repository<Asset>,
    @InjectRepository(ApprovalRecord)
    private readonly approvalRepo: Repository<ApprovalRecord>,
    @InjectRepository(AuditEvent)
    private readonly auditRepo: Repository<AuditEvent>,
    private readonly configService: ConfigService,
    private readonly narrationService: NarrationService,
  ) {}

  getFfmpegPath(): string {
    const configured = this.configService.get<string>('FFMPEG_PATH');
    if (configured && fs.existsSync(configured)) {
      return configured;
    }
    const standardWinPath = 'C:\\WINDOWS\\system32\\ffmpeg.exe';
    if (fs.existsSync(standardWinPath)) {
      return standardWinPath;
    }
    return 'ffmpeg';
  }

  getFfprobePath(): string {
    const configured = this.configService.get<string>('FFPROBE_PATH');
    if (configured && fs.existsSync(configured)) {
      return configured;
    }
    try {
      // Fallback to ffprobe-static binary
      const ffprobeStatic = require('ffprobe-static');
      if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
        return ffprobeStatic.path;
      }
    } catch (err) {
      // Ignore static require error
    }
    return 'ffprobe';
  }

  getStorageDir(): string {
    const root = this.configService.get<string>('STORAGE_ROOT', './storage');
    const dir = path.resolve(root, 'renders');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  async checkBinaries(): Promise<{
    ffmpeg: { path: string; available: boolean };
    ffprobe: { path: string; available: boolean };
  }> {
    const ffmpegPath = this.getFfmpegPath();
    const ffprobePath = this.getFfprobePath();

    const checkBinary = (binPath: string, arg: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const proc = spawn(binPath, [arg], { windowsHide: true });
        proc.on('error', () => resolve(false));
        proc.on('close', (code) => resolve(code === 0));
      });
    };

    const [ffmpegOk, ffprobeOk] = await Promise.all([
      checkBinary(ffmpegPath, '-version'),
      checkBinary(ffprobePath, '-version'),
    ]);

    return {
      ffmpeg: { path: ffmpegPath, available: ffmpegOk },
      ffprobe: { path: ffprobePath, available: ffprobeOk },
    };
  }

  async validateVideo(filePath: string): Promise<VideoProbeValidation> {
    const ffprobePath = this.getFfprobePath();
    const args = [
      '-v',
      'error',
      '-show_entries',
      'stream=index,codec_name,codec_type,width,height,r_frame_rate,duration',
      '-show_entries',
      'format=duration,size,format_name',
      '-of',
      'json',
      filePath,
    ];

    return new Promise((resolve, reject) => {
      const proc = spawn(ffprobePath, args, { windowsHide: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('error', (err) => {
        reject(new InternalServerErrorException(`FFprobe execution failed: ${err.message}`));
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(
            new InternalServerErrorException(`FFprobe validation exited with code ${code}: ${stderr}`),
          );
        }

        try {
          const parsed = JSON.parse(stdout);
          const videoStream = parsed.streams?.find((s: any) => s.codec_type === 'video');
          const audioStream = parsed.streams?.find((s: any) => s.codec_type === 'audio');
          const duration = parseFloat(parsed.format?.duration || videoStream?.duration || '0');
          const sizeBytes = parseInt(parsed.format?.size || '0', 10);

          const hasVideoStream = Boolean(videoStream);
          const hasAudioStream = Boolean(audioStream);
          const nonZeroDuration = duration > 0.5;
          const compatibleCodecs =
            (videoStream?.codec_name === 'h264' || videoStream?.codec_name === 'mp4v-es') &&
            audioStream?.codec_name === 'aac';

          const errors: string[] = [];
          if (!hasVideoStream) errors.push('No video stream detected in output');
          if (!hasAudioStream) errors.push('No audio stream detected in output');
          if (!nonZeroDuration) errors.push('Output duration is 0 or invalid');

          const valid = hasVideoStream && hasAudioStream && nonZeroDuration;

          resolve({
            valid,
            durationSeconds: duration,
            width: videoStream?.width || 0,
            height: videoStream?.height || 0,
            fps: videoStream?.r_frame_rate
              ? (() => {
                  const parts = String(videoStream.r_frame_rate).split('/');
                  if (parts.length === 2) {
                    const num = parseFloat(parts[0]);
                    const den = parseFloat(parts[1]);
                    return den > 0 ? Math.round((num / den) * 100) / 100 : 30;
                  }
                  const direct = parseFloat(videoStream.r_frame_rate);
                  return isNaN(direct) ? 30 : direct;
                })()
              : 30,
            videoCodec: videoStream?.codec_name || 'unknown',
            audioCodec: audioStream?.codec_name || 'unknown',
            sizeBytes,
            formatName: parsed.format?.format_name || 'mp4',
            checks: {
              hasVideoStream,
              hasAudioStream,
              nonZeroDuration,
              compatibleCodecs,
            },
            errors: errors.length > 0 ? errors : undefined,
          });
        } catch (parseErr: any) {
          reject(new InternalServerErrorException(`Failed to parse FFprobe output: ${parseErr.message}`));
        }
      });
    });
  }

  async renderProject(projectId: string, dto: StartRenderDto): Promise<RenderJob> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Video project "${projectId}" not found`);
    }

    // Binary check
    const binaries = await this.checkBinaries();
    if (!binaries.ffmpeg.available) {
      throw new BadRequestException(`FFmpeg binary is not available at "${binaries.ffmpeg.path}"`);
    }

    // Find script
    let script = await this.scriptRepo.findOne({
      where: { video_project_id: projectId, status: ScriptStatus.Approved },
      order: { version: 'DESC' },
    });
    if (!script) {
      script = await this.scriptRepo.findOne({
        where: { video_project_id: projectId },
        order: { version: 'DESC' },
      });
    }
    if (!script) {
      throw new BadRequestException('Cannot render video: project has no generated script.');
    }

    // Find narration audio
    let narration = await this.narrationRepo.findOne({
      where: { video_project_id: projectId },
      order: { created_at: 'DESC' },
    });

    // If narration is missing, automatically synthesize deterministic narration
    if (!narration || !fs.existsSync(narration.storage_path)) {
      narration = await this.narrationService.generate(projectId, script.id);
    }

    // Output dimensions
    const isShort = (dto.format || project.format) === VideoFormat.Short;
    const width = isShort ? 720 : 1280;
    const height = isShort ? 1280 : 720;
    const fps = dto.fps || 30;
    const duration = Math.max(3, Math.min(600, Math.round(Number(narration.duration_seconds))));

    // Output destination
    const outFilename = `render_${project.id}_${Date.now()}.mp4`;
    const outputPath = path.join(this.getStorageDir(), outFilename);

    // Create RenderJob entity
    const renderJob = this.renderRepo.create({
      video_project_id: projectId,
      status: RenderJobStatus.Rendering,
      output_path: outputPath,
      started_at: new Date(),
    });
    const savedJob = await this.renderRepo.save(renderJob);

    // Update project status
    project.status = VideoProjectStatus.Rendering;
    await this.projectRepo.save(project);

    // Build safe FFmpeg arguments array
    const cleanTitle = (project.title || 'Original Production')
      .replace(/['"\\:]/g, '')
      .substring(0, 45);

    const safeAudioPath = narration.storage_path;

    // Use lavfi color generator with drawtext overlays and shortest audio sync
    const ffmpegArgs = [
      '-f',
      'lavfi',
      '-i',
      `color=c=0x0b0f17:s=${width}x${height}:r=${fps}:d=${duration}`,
      '-i',
      safeAudioPath,
      '-vf',
      `drawtext=text='${cleanTitle}':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=(h-text_h)/2-40,drawtext=text='YOUTUBE AUTOMATION STUDIO':fontcolor=0xef4444:fontsize=22:x=(w-text_w)/2:y=(h-text_h)/2+30`,
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-shortest',
      '-y',
      outputPath,
    ];

    savedJob.ffmpeg_command_summary = `ffmpeg ${ffmpegArgs.join(' ')}`;
    await this.renderRepo.save(savedJob);

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn(this.getFfmpegPath(), ffmpegArgs, { windowsHide: true });
        let stderr = '';

        proc.stderr.on('data', (d) => {
          stderr += d.toString();
        });

        // 3-minute safety timeout
        const timeout = setTimeout(() => {
          proc.kill('SIGTERM');
          reject(new Error('Rendering timed out after 180 seconds'));
        }, 180000);

        proc.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        proc.on('close', (code) => {
          clearTimeout(timeout);
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`FFmpeg exited with code ${code}. Stderr: ${stderr.slice(-300)}`));
          }
        });
      });

      // Execute FFprobe validation on finished output
      const probeResult = await this.validateVideo(outputPath);
      if (!probeResult.valid) {
        throw new Error(
          `Rendered video failed FFprobe technical validation: ${probeResult.errors?.join(', ')}`,
        );
      }

      savedJob.status = RenderJobStatus.Completed;
      savedJob.finished_at = new Date();
      savedJob.validation_json = probeResult;
      await this.renderRepo.save(savedJob);

      // Transition project status to render_review
      project.status = VideoProjectStatus.RenderReview;
      await this.projectRepo.save(project);

      await this.auditRepo.save(
        this.auditRepo.create({
          actor: 'system',
          action: 'RENDER_COMPLETED',
          entity_type: 'render_job',
          entity_id: savedJob.id,
          details_json: {
            project_id: projectId,
            output_path: outputPath,
            duration: probeResult.durationSeconds,
            resolution: `${probeResult.width}x${probeResult.height}`,
            codecs: `${probeResult.videoCodec}/${probeResult.audioCodec}`,
          },
        }),
      );

      return savedJob;
    } catch (err: any) {
      savedJob.status = RenderJobStatus.Failed;
      savedJob.finished_at = new Date();
      savedJob.error_code = 'FFMPEG_ERROR';
      savedJob.error_message = err.message || 'Unknown render failure';
      await this.renderRepo.save(savedJob);

      project.status = VideoProjectStatus.Failed;
      await this.projectRepo.save(project);

      throw new InternalServerErrorException(`Rendering failed: ${err.message}`);
    }
  }

  async getLatestRender(projectId: string): Promise<RenderJob | null> {
    return this.renderRepo.findOne({
      where: { video_project_id: projectId },
      order: { created_at: 'DESC' },
    });
  }

  async recordApproval(
    projectId: string,
    dto: RenderApprovalDto,
  ): Promise<{ project: VideoProject; approval: ApprovalRecord }> {
    const project = await this.projectRepo.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`Video project "${projectId}" not found`);
    }

    const approval = this.approvalRepo.create({
      video_project_id: projectId,
      approval_type: ApprovalType.Render,
      decision: dto.decision,
      notes: dto.notes || null,
      approved_by: dto.approved_by || 'local_creator',
    });
    const savedApproval = await this.approvalRepo.save(approval);

    if (dto.decision === 'approved') {
      // Advance to render_approved and ready_to_upload
      project.status = VideoProjectStatus.RenderApproved;
      await this.projectRepo.save(project);
    } else {
      // Revert to assets_pending for revision
      project.status = VideoProjectStatus.AssetsPending;
      await this.projectRepo.save(project);
    }

    await this.auditRepo.save(
      this.auditRepo.create({
        actor: dto.approved_by || 'local_creator',
        action: dto.decision === 'approved' ? 'RENDER_APPROVED' : 'RENDER_REJECTED',
        entity_type: 'render_job',
        entity_id: savedApproval.id,
        details_json: {
          project_id: projectId,
          decision: dto.decision,
          notes: dto.notes,
        },
      }),
    );

    return { project, approval: savedApproval };
  }
}
