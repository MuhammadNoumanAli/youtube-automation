import { useEffect, useState } from 'react';
import './App.css';

interface HealthData {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  environment: string;
  database: {
    connected: boolean;
    databaseName: string;
    error?: string;
  };
  storage: {
    root: string;
    accessible: boolean;
    error?: string;
  };
  system: {
    nodeVersion: string;
    platform: string;
  };
}

interface SettingsData {
  environment: string;
  features: {
    externalApiCallsEnabled: boolean;
    youtubeUploadsEnabled: boolean;
    publicReleaseEnabled: boolean;
  };
  providers: {
    text: {
      activeProvider: string;
      mockAvailable: boolean;
      openaiConfigured: boolean;
      anthropicConfigured: boolean;
    };
    tts: {
      activeProvider: string;
      mockAvailable: boolean;
      localSapiAvailable?: boolean;
      voice?: string;
      elevenLabsConfigured: boolean;
    };
    youtube: {
      oauthConfigured: boolean;
      redirectUri: string;
      tokenEncryptionConfigured: boolean;
    };
  };
  rendering: {
    ffmpegConfigured: boolean;
    ffmpegPath: string;
    ffprobeConfigured: boolean;
  };
}

interface ChannelProfile {
  id: string;
  name: string;
  niche: string;
  target_regions: string[] | null;
  language: string;
  youtube_channel_id: string | null;
  created_at: string;
}

interface Topic {
  id: string;
  channel_profile_id: string;
  title: string;
  description: string | null;
  niche: string;
  target_audience: string;
  priority: 'low' | 'medium' | 'high';
  status: 'idea' | 'planned' | 'converted' | 'archived';
  converted_project_id: string | null;
  created_at: string;
}

interface VideoProject {
  id: string;
  channel_profile_id: string;
  title: string;
  working_title: string;
  topic: string;
  target_audience: string;
  format: 'long_form' | 'short';
  target_duration_seconds: number;
  status: string;
  script_version: number;
  created_at: string;
}

interface ResearchSource {
  id: string;
  video_project_id: string;
  url: string;
  title: string;
  publisher: string;
  claim_supported: string;
  verification_status: 'verified' | 'unverified' | 'disputed';
  notes: string | null;
  created_at: string;
}

interface SceneItem {
  sceneNumber: number;
  durationSeconds: number;
  visualDescription: string;
  onScreenText?: string;
  narrationSnippet: string;
  suggestedAssetType?: 'image' | 'video' | 'graphic';
}

interface VideoMetadataPayload {
  title: string;
  description: string;
  tags: string[];
  chapters?: Array<{ timestamp: string; title: string }>;
  suggestedThumbnailConcept?: string;
}

interface Script {
  id: string;
  video_project_id: string;
  version: number;
  content: string;
  outline_json: string[] | null;
  scene_plan_json: SceneItem[] | null;
  metadata_json: VideoMetadataPayload | null;
  provider: string;
  model: string;
  status: 'draft' | 'review' | 'approved' | 'superseded';
  created_at: string;
}

interface Asset {
  id: string;
  video_project_id: string;
  asset_type: string;
  storage_path: string;
  original_filename: string;
  mime_type: string;
  checksum_sha256: string;
  source_url: string | null;
  creator: string | null;
  license_type: string;
  license_notes: string;
  attribution_text: string | null;
  commercial_use_allowed: boolean;
  created_at: string;
}

interface Narration {
  id: string;
  video_project_id: string;
  script_id: string | null;
  provider: string;
  storage_path: string;
  duration_seconds: number;
  status: string;
  created_at: string;
}

interface VideoProbeValidation {
  valid: boolean;
  durationSeconds: number;
  width: number;
  height: number;
  fps: number;
  videoCodec: string;
  audioCodec: string;
  sizeBytes: number;
  formatName: string;
  checks: {
    hasVideoStream: boolean;
    hasAudioStream: boolean;
    nonZeroDuration: boolean;
    compatibleCodecs: boolean;
  };
  errors?: string[];
}

interface RenderJob {
  id: string;
  video_project_id: string;
  status: string;
  output_path: string | null;
  ffmpeg_command_summary: string | null;
  validation_json: VideoProbeValidation | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
}

interface BinaryStatus {
  ffmpeg: { path: string; available: boolean };
  ffprobe: { path: string; available: boolean };
}

// Mirrors apps/api/src/database/entities/upload-record.entity.ts
interface UploadRecord {
  id: string;
  video_project_id: string;
  channel_profile_id: string;
  youtube_video_id: string | null;
  privacy_status: 'private';
  upload_status: 'pending_approval' | 'approved' | 'uploading' | 'uploaded_private' | 'failed';
  youtube_title: string;
  upload_attempts: number;
  error_code: string | null;
  error_message: string | null;
  last_attempt_at: string | null;
  uploaded_at: string | null;
  created_at: string;
}

// Mirrors YouTubeConnectionStatus in apps/api/src/modules/youtube/youtube-oauth.service.ts
interface YouTubeConnectionStatus {
  connected: boolean;
  channel_profile_id: string;
  youtube_channel_id: string | null;
  channel_title: string | null;
  token_status: 'valid' | 'expired' | 'missing';
  expiry_date: string | null;
  has_refresh_token: boolean;
  upload_scope_granted: boolean;
}

interface YouTubeAnalytics {
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
}


// Mirrors BackgroundJob in apps/api/src/database/entities/background-job.entity.ts
interface BackgroundJob {
  id: string;
  job_type: 'render' | 'upload' | 'maintenance';
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  idempotency_key: string | null;
  video_project_id: string | null;
  payload_json: Record<string, unknown>;
  attempt_count: number;
  max_attempts: number;
  locked_by: string | null;
  locked_at: string | null;
  lock_expires_at: string | null;
  next_retry_at: string | null;
  last_error: string | null;
  result_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// Mirrors AuditEvent in apps/api/src/database/entities/audit-event.entity.ts
interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details_json: Record<string, unknown> | null;
  created_at: string;
}

interface StorageStats {
  storageRoot: string;
  totalSizeBytes: number;
  fileCount: number;
}

const MOCK_VIDEO_ID_PREFIX = 'mock_private_';
const isMockUpload = (rec: UploadRecord | null) => Boolean(rec?.youtube_video_id?.startsWith(MOCK_VIDEO_ID_PREFIX));
const UPLOAD_APPROVED_STATUSES = ['ready_to_upload', 'uploading', 'uploaded_private'];

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'channels' | 'ideas' | 'projects' | 'render' | 'upload' | 'jobs'>(() => {
    try {
      return new URLSearchParams(window.location.search).get('tab') === 'upload' ? 'upload' : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [health, setHealth] = useState<HealthData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Entities state
  const [channels, setChannels] = useState<ChannelProfile[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [activeScript, setActiveScript] = useState<Script | null>(null);

  // Phase 3 state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [narrations, setNarrations] = useState<Narration[]>([]);
  const [latestRender, setLatestRender] = useState<RenderJob | null>(null);
  const [binaries, setBinaries] = useState<BinaryStatus | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderApprovalNotes, setRenderApprovalNotes] = useState('Audio synced, burned-in subtitles verified, pacing approved.');

  // Phase 4 state
  const [ytStatus, setYtStatus] = useState<YouTubeConnectionStatus | null>(null);
  const [ytAnalytics, setYtAnalytics] = useState<YouTubeAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [uploadRecord, setUploadRecord] = useState<UploadRecord | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadApprovalNotes, setUploadApprovalNotes] = useState('Reviewed final render, verified media integrity and approved strictly private upload.');
  const [uploadMetadata, setUploadMetadata] = useState({
    title: '',
    description: '',
    tags: '',
    // Creator declarations — deliberately start unset; never inferred automatically
    made_for_kids: '' as '' | 'yes' | 'no',
    contains_synthetic_media: '' as '' | 'yes' | 'no',
  });
  const [confirmUploadModal, setConfirmUploadModal] = useState(false);

  // Phase 5 state (Jobs, Worker Queue, Audit Trail & Maintenance)
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [cleaningStorage, setCleaningStorage] = useState(false);
  const [activeJobFilter, setActiveJobFilter] = useState<'all' | 'pending' | 'processing' | 'completed' | 'failed'>('all');

  // Forms state
  const [newChannel, setNewChannel] = useState({ name: '', niche: '', language: 'en' });
  const [newTopic, setNewTopic] = useState({ channel_profile_id: '', title: '', description: '', niche: '', target_audience: '', priority: 'medium' as 'low' | 'medium' | 'high' });
  const [newProject, setNewProject] = useState({ channel_profile_id: '', title: '', topic: '', target_audience: 'Developers', format: 'long_form' as 'long_form' | 'short', target_duration_seconds: 300 });
  const [newSource, setNewSource] = useState({ url: '', title: '', publisher: '', claim_supported: '', verification_status: 'verified' as 'verified' | 'unverified' | 'disputed' });
  const [approvalNotes, setApprovalNotes] = useState('Reviewed script, verified scene plan and technical accuracy.');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Asset upload form state
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetType, setAssetType] = useState('image');
  const [licenseType, setLicenseType] = useState('user_created');
  const [licenseNotes, setLicenseNotes] = useState('Created directly by project author');
  const [attributionText, setAttributionText] = useState('');
  const [commercialUseAllowed, setCommercialUseAllowed] = useState(true);

  // Voiceover import form state
  const [voiceoverFile, setVoiceoverFile] = useState<File | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const [hRes, sRes] = await Promise.all([fetch('/api/health'), fetch('/api/settings/status')]);
      if (hRes.ok) setHealth(await hRes.json());
      if (sRes.ok) setSettings(await sRes.json());
      setApiError(null);
    } catch (err: any) {
      setApiError(err.message || 'Failed to reach API server');
    } finally {
      setLoading(false);
    }
  };

  const fetchBinaries = async () => {
    try {
      const res = await fetch('/api/rendering/binaries');
      if (res.ok) setBinaries(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchChannels = async () => {
    try {
      const res = await fetch('/api/channels');
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
        if (data.length > 0 && !newTopic.channel_profile_id) {
          setNewTopic((prev) => ({ ...prev, channel_profile_id: data[0].id }));
          setNewProject((prev) => ({ ...prev, channel_profile_id: data[0].id }));
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchTopics = async () => {
    try {
      const res = await fetch('/api/topics');
      if (res.ok) setTopics(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
        if (data.length > 0 && !selectedProjectId) {
          setSelectedProjectId(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchYouTubeAnalytics = async (channelId: string) => {
    try {
      setLoadingAnalytics(true);
      const res = await fetch(`/api/youtube/analytics/${channelId}`);
      if (res.ok) {
        setYtAnalytics(await res.json());
      } else {
        setYtAnalytics(null);
      }
    } catch (e) {
      console.error(e);
      setYtAnalytics(null);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const fetchYouTubeStatus = async (channelId: string) => {
    try {
      const res = await fetch(`/api/youtube/channel-status/${channelId}`);
      if (res.ok) {
        const data = await res.json();
        setYtStatus(data);
        if (data?.connected) {
          fetchYouTubeAnalytics(channelId);
        } else {
          setYtAnalytics(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchUploadStatus = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/upload-status`);
      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().length > 0) {
          setUploadRecord(JSON.parse(text));
        } else {
          setUploadRecord(null);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs?limit=50');
      if (res.ok) setJobs(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAuditEvents = async () => {
    try {
      const res = await fetch('/api/jobs/audit?limit=50');
      if (res.ok) setAuditEvents(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStorageStats = async () => {
    try {
      const res = await fetch('/api/jobs/storage/stats');
      if (res.ok) setStorageStats(await res.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleCancelJob = async (jobId: string) => {
    if (!confirm('Are you sure you want to cancel this background task?')) return;
    try {
      const res = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Cancelled by operator via dashboard' }),
      });
      if (res.ok) {
        setFeedbackMsg('Job cancelled successfully.');
        fetchJobs();
      } else {
        const err = await res.json();
        alert(`Failed to cancel job: ${err.message}`);
      }
    } catch (e: any) {
      alert(`Error cancelling job: ${e.message}`);
    }
  };

  const handleTriggerCleanup = async () => {
    try {
      setCleaningStorage(true);
      const res = await fetch('/api/jobs/maintenance/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ maxAgeHours: 24 }),
      });
      if (res.ok) {
        setFeedbackMsg('Storage cleanup task enqueued! Worker will purge stale scratch files.');
        fetchJobs();
        fetchStorageStats();
      }
    } catch (e: any) {
      alert(`Error enqueuing cleanup: ${e.message}`);
    } finally {
      setCleaningStorage(false);
    }
  };

  const fetchProjectDetails = async (projectId: string) => {
    try {
      const [srcRes, scRes, assetRes, narrRes, rendRes, upRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/research`),
        fetch(`/api/projects/${projectId}/scripts`),
        fetch(`/api/projects/${projectId}/assets`),
        fetch(`/api/projects/${projectId}/narration`),
        fetch(`/api/projects/${projectId}/render-status`),
        fetch(`/api/projects/${projectId}/upload-status`),
      ]);
      if (srcRes.ok) setSources(await srcRes.json());
      if (scRes.ok) {
        const scriptList: Script[] = await scRes.json();
        setScripts(scriptList);
        if (scriptList.length > 0) {
          const sc = scriptList[0];
          setActiveScript(sc);
          setUploadMetadata((prev) => ({
            ...prev,
            title: prev.title || sc.metadata_json?.title || '',
            description: prev.description || sc.metadata_json?.description || '',
            tags: prev.tags || sc.metadata_json?.tags?.join(', ') || '',
          }));
        } else {
          setActiveScript(null);
        }
      }
      if (assetRes.ok) setAssets(await assetRes.json());
      if (narrRes.ok) setNarrations(await narrRes.json());
      if (rendRes.ok) setLatestRender(await rendRes.json());
      if (upRes.ok) {
        const upText = await upRes.text();
        setUploadRecord(upText && upText.trim().length > 0 ? JSON.parse(upText) : null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchBinaries();
    fetchChannels();
    fetchTopics();
    fetchProjects();
    fetchJobs();
    fetchAuditEvents();
    fetchStorageStats();

    // Auto-poll jobs and audit events every 5 seconds
    const interval = setInterval(() => {
      fetchJobs();
      fetchAuditEvents();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const proj = selectedProjectId ? projects.find((p) => p.id === selectedProjectId) : undefined;
    if (selectedProjectId) {
      fetchProjectDetails(selectedProjectId);
    }
    // Show connection state for the selected project's channel, or the first channel profile
    const channelId = proj?.channel_profile_id || (channels.length > 0 ? channels[0].id : null);
    if (channelId) {
      fetchYouTubeStatus(channelId);
    } else {
      setYtStatus(null);
    }
  }, [selectedProjectId, projects, channels]);

  // Clean the ?tab=upload&youtube=connected params left by the OAuth callback redirect
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('youtube') === 'connected') setFeedbackMsg('✓ YouTube channel connected.');
      if (params.has('tab') || params.has('youtube')) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChannel.name || !newChannel.niche) return;
    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newChannel),
      });
      if (res.ok) {
        setNewChannel({ name: '', niche: '', language: 'en' });
        fetchChannels();
        setFeedbackMsg('Channel profile created successfully.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTopic.title || !newTopic.channel_profile_id) return;
    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTopic),
      });
      if (res.ok) {
        setNewTopic((prev) => ({ ...prev, title: '', description: '' }));
        fetchTopics();
        setFeedbackMsg('Topic idea added to backlog.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleConvertTopic = async (topicId: string) => {
    try {
      const res = await fetch(`/api/topics/${topicId}/convert`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        fetchTopics();
        fetchProjects();
        setSelectedProjectId(data.project.id);
        setActiveTab('projects');
        setFeedbackMsg(`Topic successfully converted to project: "${data.project.title}"!`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.title || !newProject.channel_profile_id) return;
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProject),
      });
      if (res.ok) {
        const created = await res.json();
        setNewProject((prev) => ({ ...prev, title: '', topic: '' }));
        fetchProjects();
        setSelectedProjectId(created.id);
        setFeedbackMsg('Video project initialized.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !newSource.url || !newSource.title || !newSource.claim_supported) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSource),
      });
      if (res.ok) {
        setNewSource({ url: '', title: '', publisher: '', claim_supported: '', verification_status: 'verified' });
        fetchProjectDetails(selectedProjectId);
        fetchProjects();
        setFeedbackMsg('Verified research source attached.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateScript = async () => {
    if (!selectedProjectId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${selectedProjectId}/scripts/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone: 'Authoritative, engaging, technical walkthrough' }),
      });
      if (res.ok) {
        const generated = await res.json();
        fetchProjectDetails(selectedProjectId);
        fetchProjects();
        setActiveScript(generated);
        setFeedbackMsg(`Script v${generated.version} generated successfully via ${generated.provider} provider.`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveScript = async (scriptId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/scripts/${scriptId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: approvalNotes, approved_by: 'local_creator' }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveScript(data.script);
        fetchProjectDetails(selectedProjectId!);
        fetchProjects();
        setFeedbackMsg(`HUMAN APPROVAL RECORDED: Script v${data.script.version} is now approved and locked.`);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // Phase 3 Handlers
  const handleUploadAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !assetFile) {
      setFeedbackMsg('Please select a media file to upload.');
      return;
    }
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', assetFile);
      formData.append('asset_type', assetType);
      formData.append('license_type', licenseType);
      formData.append('license_notes', licenseNotes);
      formData.append('attribution_text', attributionText);
      formData.append('commercial_use_allowed', String(commercialUseAllowed));

      const res = await fetch(`/api/projects/${selectedProjectId}/assets`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        setAssetFile(null);
        fetchProjectDetails(selectedProjectId);
        setFeedbackMsg('Asset securely imported with verified SHA-256 provenance checksum.');
      } else {
        const err = await res.json();
        setFeedbackMsg(`Asset upload failed: ${err.message || 'Invalid asset'}`);
      }
    } catch (e: any) {
      setFeedbackMsg(`Error uploading asset: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAsset = async (assetId: string) => {
    try {
      const res = await fetch(`/api/assets/${assetId}`, { method: 'DELETE' });
      if (res.ok) {
        fetchProjectDetails(selectedProjectId!);
        setFeedbackMsg('Asset deleted from disk and catalog.');
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleGenerateNarration = async () => {
    if (!selectedProjectId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${selectedProjectId}/narration/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        fetchProjectDetails(selectedProjectId);
        setFeedbackMsg('Narration audio track synthesized deterministically (zero-cost Mock TTS).');
      } else {
        const err = await res.json();
        setFeedbackMsg(`Narration generation error: ${err.message}`);
      }
    } catch (e: any) {
      setFeedbackMsg(`Narration error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportVoiceover = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId || !voiceoverFile) return;
    try {
      setLoading(true);
      const formData = new FormData();
      formData.append('file', voiceoverFile);
      const res = await fetch(`/api/projects/${selectedProjectId}/narration/import`, {
        method: 'POST',
        body: formData,
      });
      if (res.ok) {
        setVoiceoverFile(null);
        fetchProjectDetails(selectedProjectId);
        setFeedbackMsg('User voiceover audio imported successfully.');
      } else {
        const err = await res.json();
        setFeedbackMsg(`Voiceover import error: ${err.message}`);
      }
    } catch (e: any) {
      setFeedbackMsg(`Import error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStartRender = async () => {
    if (!selectedProjectId) return;
    try {
      setRendering(true);
      setFeedbackMsg('Rendering pipeline started with local FFmpeg... Please wait.');
      const res = await fetch(`/api/projects/${selectedProjectId}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fps: 30 }),
      });
      if (res.ok) {
        const job: RenderJob = await res.json();
        setLatestRender(job);
        fetchProjects();
        fetchProjectDetails(selectedProjectId);
        setFeedbackMsg(`Render job completed! Validated via FFprobe: ${job.validation_json?.width}x${job.validation_json?.height} @ ${job.validation_json?.fps}fps (${job.validation_json?.durationSeconds}s)`);
      } else {
        const err = await res.json();
        setFeedbackMsg(`Rendering failed: ${err.message}`);
      }
    } catch (e: any) {
      setFeedbackMsg(`Render process error: ${e.message}`);
    } finally {
      setRendering(false);
    }
  };

  const handleRenderApproval = async (decision: 'approved' | 'rejected') => {
    if (!selectedProjectId) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/projects/${selectedProjectId}/render-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          notes: renderApprovalNotes,
          approved_by: 'local_creator',
        }),
      });
      if (res.ok) {
        fetchProjects();
        fetchProjectDetails(selectedProjectId);
        setFeedbackMsg(
          decision === 'approved'
            ? 'HUMAN RENDER APPROVAL RECORDED: Video marked ready for upload staging. (Notice: Public release is NOT enabled).'
            : 'Render rejected and returned to assets_pending for revision.',
        );
      } else {
        const err = await res.json();
        setFeedbackMsg(`Approval error: ${err.message}`);
      }
    } catch (e: any) {
      setFeedbackMsg(`Approval error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleConnectYouTube = async () => {
    const proj = projects.find((p) => p.id === selectedProjectId);
    let channelId = proj?.channel_profile_id || (channels.length > 0 ? channels[0].id : null);

    // If no channel exists yet in the database, automatically provision one so user isn't blocked
    if (!channelId) {
      try {
        const createRes = await fetch('/api/channels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Primary Studio Channel',
            niche: 'AI & Automation Engineering',
            language: 'en',
          }),
        });
        if (createRes.ok) {
          const newChan = await createRes.json();
          channelId = newChan.id;
          await fetchChannels();
        }
      } catch (e) {
        console.error('Failed to auto-create channel profile:', e);
      }
    }

    if (!channelId) {
      alert('Please create a channel profile first under the Channel Profiles tab.');
      return;
    }
    try {
      const res = await fetch(`/api/youtube/auth-url?channelId=${channelId}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to generate authorization URL');
      }
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      alert(`OAuth Error: ${err.message}`);
    }
  };

  const handleDisconnectYouTube = async () => {
    const proj = projects.find((p) => p.id === selectedProjectId);
    const channelId = proj?.channel_profile_id || (channels.length > 0 ? channels[0].id : null);
    if (!channelId) return;
    if (!confirm('Are you sure you want to disconnect this YouTube channel and purge the encrypted tokens?')) return;
    try {
      const res = await fetch(`/api/youtube/disconnect/${channelId}`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setFeedbackMsg(
          data.revoked_at_google
            ? 'YouTube channel disconnected. Access was revoked at Google and local tokens purged.'
            : 'YouTube channel disconnected and local tokens purged (Google revocation could not be confirmed — you can remove access at myaccount.google.com/permissions).',
        );
        setYtAnalytics(null);
        fetchYouTubeStatus(channelId);
      } else {
        const err = await res.json().catch(() => ({}));
        alert(`Disconnect failed: ${err.message || res.status}`);
      }
    } catch (e: any) {
      alert(`Disconnect error: ${e.message}`);
    }
  };

  const handleApproveUpload = async () => {
    if (!selectedProjectId) return;
    try {
      const res = await fetch(`/api/projects/${selectedProjectId}/upload-approval`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision: 'approved',
          notes: uploadApprovalNotes,
        }),
      });
      if (res.ok) {
        setFeedbackMsg('✓ Human upload approval recorded: Video is approved for private upload.');
        fetchProjects();
        fetchProjectDetails(selectedProjectId);
      } else {
        const err = await res.json();
        alert(`Approval rejected: ${err.message}`);
      }
    } catch (e: any) {
      alert(`Approval error: ${e.message}`);
    }
  };

  const handleExecuteUpload = async () => {
    if (!selectedProjectId) return;
    setConfirmUploadModal(false);
    setUploading(true);
    setFeedbackMsg('Initiating private YouTube upload session...');
    try {
      const tagsArray = uploadMetadata.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const res = await fetch(`/api/projects/${selectedProjectId}/upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: uploadMetadata.title || undefined,
          description: uploadMetadata.description || undefined,
          tags: tagsArray.length > 0 ? tagsArray : undefined,
          made_for_kids: uploadMetadata.made_for_kids ? uploadMetadata.made_for_kids === 'yes' : undefined,
          contains_synthetic_media: uploadMetadata.contains_synthetic_media
            ? uploadMetadata.contains_synthetic_media === 'yes'
            : undefined,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setUploadRecord(data);
        fetchProjects();
        fetchProjectDetails(selectedProjectId);
        if (data.upload_status === 'uploaded_private' && isMockUpload(data)) {
          setFeedbackMsg(
            `Mock upload staged (ENABLE_YOUTUBE_UPLOADS=false): nothing was sent to YouTube. Placeholder ID: ${data.youtube_video_id}`,
          );
        } else if (data.upload_status === 'uploaded_private') {
          setFeedbackMsg(`✓ Upload succeeded! Video ID: ${data.youtube_video_id} (Visibility: PRIVATE)`);
        }
      } else {
        alert(`Upload failed: ${data.message || 'Unknown error'}`);
        fetchUploadStatus(selectedProjectId);
      }
    } catch (e: any) {
      alert(`Upload error: ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="brand-header">
          <div className="brand-icon">▶</div>
          <div>
            <div className="brand-title">Studio</div>
            <div className="brand-subtitle">Automation v0.3.0</div>
          </div>
        </div>

        <ul className="nav-menu">
          <li className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('dashboard')}>
              <span>📊</span> Dashboard
            </button>
          </li>
          <li className={`nav-item ${activeTab === 'channels' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('channels')}>
              <span>📺</span> Channel Profiles
              <span className="nav-badge">{channels.length}</span>
            </button>
          </li>
          <li className={`nav-item ${activeTab === 'ideas' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('ideas')}>
              <span>💡</span> Ideas & Topics
              <span className="nav-badge">{topics.length}</span>
            </button>
          </li>
          <li className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('projects')}>
              <span>🎬</span> Video Projects
              <span className="nav-badge">{projects.length}</span>
            </button>
          </li>
          <li className={`nav-item ${activeTab === 'render' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('render')}>
              <span>🎞️</span> Render & Review
              <span className="nav-badge" style={{ background: latestRender?.status === 'completed' ? 'var(--accent-green)' : 'rgba(255,255,255,0.06)', color: latestRender?.status === 'completed' ? '#000' : 'inherit' }}>
                {latestRender ? latestRender.status.toUpperCase() : 'Ready'}
              </span>
            </button>
          </li>
          <li className={`nav-item ${activeTab === 'upload' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('upload')}>
              <span>🚀</span> Upload Review
              <span className="nav-badge">Phase 4</span>
            </button>
          </li>
          <li className={`nav-item ${activeTab === 'jobs' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('jobs')}>
              <span>⚙️</span> Jobs & Logs
              <span className="nav-badge">Phase 5</span>
            </button>
          </li>
        </ul>

        <div className="sidebar-footer">
          <div className="safety-pill">
            <span>🛡️</span>
            <div>
              <div style={{ fontWeight: 600 }}>
                {settings?.features.youtubeUploadsEnabled ? 'Live Private Uploads ON' : 'Zero-Cost Mock Mode'}
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Public YouTube Release Disabled</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-viewport">
        {/* Top Header */}
        <header className="top-header">
          <div>
            <h1 className="header-title">
              {activeTab === 'dashboard' && 'Studio Overview & Health'}
              {activeTab === 'channels' && 'YouTube Channel Profiles'}
              {activeTab === 'ideas' && 'Content Strategy & Topic Backlog'}
              {activeTab === 'projects' && 'Production Studio: Script & Assets'}
              {activeTab === 'render' && 'FFmpeg Local Rendering & Human Review Gate'}
              {activeTab === 'upload' && 'YouTube Staging & Upload Review (Phase 4)'}
              {activeTab === 'jobs' && 'Background Tasks & Worker Logs (Phase 5)'}
            </h1>
            <p className="header-subtitle">
              Original faceless video workflow • Local FFmpeg rendering • Human approval gates
            </p>
          </div>

          <div className="header-status">
            {binaries && (
              <span className={`status-badge ${binaries.ffmpeg.available ? 'online' : 'offline'}`} title={`FFmpeg: ${binaries.ffmpeg.path}`}>
                <span className="status-dot"></span>
                FFmpeg {binaries.ffmpeg.available ? 'Ready' : 'Missing'}
              </span>
            )}
            <span className={`status-badge ${health?.status === 'ok' ? 'online' : 'offline'}`}>
              <span className="status-dot"></span>
              {loading ? 'CONNECTING...' : health?.status === 'ok' ? 'SYSTEM ONLINE' : 'API OFFLINE'}
            </span>
          </div>
        </header>

        {/* Global Feedback Banner */}
        {feedbackMsg && (
          <div style={{ margin: '16px 32px 0', padding: '12px 18px', background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', color: 'var(--accent-blue)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{feedbackMsg}</span>
            <button onClick={() => setFeedbackMsg(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontWeight: 'bold' }}>✕</button>
          </div>
        )}

        {/* Tab View Container */}
        <div className="content-container">
          {apiError && (
            <div className="alert-error">
              <strong>Connection Error:</strong> {apiError}
            </div>
          )}

          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="dashboard-grid">
              <div className="card">
                <div className="card-header">
                  <span className="card-title">System Status</span>
                  <span className={`badge ${health?.status === 'ok' ? 'badge-success' : 'badge-danger'}`}>
                    {health?.status.toUpperCase() || 'UNKNOWN'}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Database Connected</span>
                  <span className="metric-value">{health?.database.connected ? 'YES (MySQL)' : 'NO'}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Database Name</span>
                  <span className="metric-value">{health?.database.databaseName || 'N/A'}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Storage Path</span>
                  <span className="metric-value font-mono">{health?.storage.root || 'N/A'}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Storage Accessible</span>
                  <span className="metric-value">{health?.storage.accessible ? 'YES' : 'NO'}</span>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Rendering & Tooling</span>
                  <span className="badge badge-success">Local FFmpeg</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">FFmpeg Binary</span>
                  <span className="metric-value">{binaries?.ffmpeg.available ? 'Verified' : 'Not Found'}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">FFprobe Binary</span>
                  <span className="metric-value">{binaries?.ffprobe.available ? 'Verified' : 'Not Found'}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">TTS Audio Synthesis</span>
                  <span className="metric-value font-mono">
                    {settings?.providers.tts.activeProvider === 'local'
                      ? `Local Windows SAPI (${settings.providers.tts.voice || 'David'})`
                      : 'Mock Test Tone'}
                  </span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Script Generation</span>
                  <span className="metric-value font-mono">Mock (Authoritative Structure)</span>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Safety Guards (Hardened)</span>
                  <span className="badge badge-warning">Active Protection</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">External API Calls</span>
                  <span className="metric-value">{settings?.features.externalApiCallsEnabled ? 'ENABLED' : 'DISABLED (Mock)'}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">YouTube Uploads</span>
                  <span className="metric-value">{settings?.features.youtubeUploadsEnabled ? 'ENABLED' : 'DISABLED'}</span>
                </div>
                <div className="metric-row">
                  <span className="metric-label">Public Release Allowed</span>
                  <span className="metric-value">{settings?.features.publicReleaseEnabled ? 'ENABLED' : 'DISABLED (Private Only)'}</span>
                </div>
              </div>

              {/* Phase 6: Live YouTube Channel Analytics */}
              <div className="card" style={{ borderTop: '3px solid #ef4444' }}>
                <div className="card-header">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '18px', color: '#ef4444' }}>📊</span>
                    <span className="card-title">YouTube Channel Analytics</span>
                  </div>
                  <span className={`badge ${ytAnalytics ? 'badge-success' : ytStatus?.connected ? 'badge-warning' : 'badge-neutral'}`}>
                    {ytAnalytics ? 'LIVE DATA' : ytStatus?.connected ? 'SYNCING...' : 'DISCONNECTED'}
                  </span>
                </div>
                {ytAnalytics ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--border-subtle)' }}>
                      {ytAnalytics.thumbnail_url && (
                        <img
                          src={ytAnalytics.thumbnail_url}
                          alt={ytAnalytics.title}
                          style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border-subtle)' }}
                        />
                      )}
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '14.5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {ytAnalytics.title}
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {ytAnalytics.custom_url ? ytAnalytics.custom_url : ytAnalytics.channel_id}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                      <div style={{ background: 'var(--bg-main)', padding: '10px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Subscribers</div>
                        <div style={{ fontSize: '17px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-primary)' }}>
                          {ytAnalytics.hidden_subscriber_count ? 'Hidden' : ytAnalytics.subscriber_count.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg-main)', padding: '10px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Total Views</div>
                        <div style={{ fontSize: '17px', fontWeight: 700, marginTop: '4px', color: '#10b981' }}>
                          {ytAnalytics.view_count.toLocaleString()}
                        </div>
                      </div>
                      <div style={{ background: 'var(--bg-main)', padding: '10px 6px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Videos</div>
                        <div style={{ fontSize: '17px', fontWeight: 700, marginTop: '4px', color: '#f59e0b' }}>
                          {ytAnalytics.video_count.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="metric-row" style={{ marginTop: '2px' }}>
                      <span className="metric-label">Published Since</span>
                      <span className="metric-value font-mono" style={{ fontSize: '12px' }}>
                        {ytAnalytics.published_at ? new Date(ytAnalytics.published_at).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '16px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px' }}>
                    {loadingAnalytics ? (
                      'Fetching channel statistics from YouTube Data API...'
                    ) : ytStatus?.connected ? (
                      'Channel connected. Retrieving statistics...'
                    ) : (
                      'Connect your YouTube channel via Google OAuth in Upload Review to display live subscriber count, lifetime views, and public video metrics.'
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CHANNELS */}
          {activeTab === 'channels' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Register Channel Profile</span>
                </div>
                <form onSubmit={handleCreateChannel}>
                  <div className="form-group">
                    <label>Channel Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. CodePulse Insights"
                      value={newChannel.name}
                      onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Niche / Topic Focus</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Software Architecture & AI Engineering"
                      value={newChannel.niche}
                      onChange={(e) => setNewChannel({ ...newChannel, niche: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Language</label>
                    <select
                      className="form-control"
                      value={newChannel.language}
                      onChange={(e) => setNewChannel({ ...newChannel, language: e.target.value })}
                    >
                      <option value="en">English (en)</option>
                      <option value="es">Spanish (es)</option>
                      <option value="de">German (de)</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                    Create Channel Profile
                  </button>
                </form>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Active Channels ({channels.length})</span>
                </div>
                {channels.length === 0 ? (
                  <div className="empty-state">No channels registered yet. Create your first profile on the left.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {channels.map((ch) => (
                      <div key={ch.id} style={{ padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '15px' }}>{ch.name}</strong>
                          <span className="badge badge-success">{ch.language.toUpperCase()}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '13px', marginTop: '4px' }}>
                          Niche: {ch.niche}
                        </div>
                        {ch.id === (ytStatus?.channel_profile_id || channels[0]?.id) && ytAnalytics && (
                          <div style={{ marginTop: '10px', display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px', background: 'var(--bg-card)', padding: '8px 12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                            <span>👥 <strong>{ytAnalytics.subscriber_count.toLocaleString()}</strong> Subscribers</span>
                            <span>👁️ <strong>{ytAnalytics.view_count.toLocaleString()}</strong> Views</span>
                            <span>📹 <strong>{ytAnalytics.video_count.toLocaleString()}</strong> Videos</span>
                            <span style={{ color: 'var(--accent-primary)', marginLeft: 'auto' }}>{ytAnalytics.custom_url || ytAnalytics.channel_id}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: IDEAS & TOPICS */}
          {activeTab === 'ideas' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Add Topic Idea</span>
                </div>
                <form onSubmit={handleCreateTopic}>
                  <div className="form-group">
                    <label>Target Channel</label>
                    <select
                      className="form-control"
                      value={newTopic.channel_profile_id}
                      onChange={(e) => setNewTopic({ ...newTopic, channel_profile_id: e.target.value })}
                      required
                    >
                      {channels.map((ch) => (
                        <option key={ch.id} value={ch.id}>{ch.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Topic Title</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. How SQLite Scales to Terabytes"
                      value={newTopic.title}
                      onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Target Audience</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Backend Engineers"
                      value={newTopic.target_audience}
                      onChange={(e) => setNewTopic({ ...newTopic, target_audience: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      className="form-control"
                      value={newTopic.priority}
                      onChange={(e) => setNewTopic({ ...newTopic, priority: e.target.value as any })}
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '12px' }}>
                    Save Topic Idea
                  </button>
                </form>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Topic Backlog ({topics.length})</span>
                </div>
                {topics.length === 0 ? (
                  <div className="empty-state">Backlog is empty. Add topic ideas to begin your production queue.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {topics.map((top) => (
                      <div key={top.id} style={{ padding: '16px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong style={{ fontSize: '15px' }}>{top.title}</strong>
                          <span className={`priority-badge ${top.priority}`}>{top.priority.toUpperCase()}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '12.5px', marginTop: '6px' }}>
                          Audience: {top.target_audience || 'General'} • Status: <span style={{ color: 'var(--accent-blue)' }}>{top.status}</span>
                        </div>
                        {top.status !== 'converted' && (
                          <div style={{ marginTop: '10px' }}>
                            <button onClick={() => handleConvertTopic(top.id)} className="btn-secondary" style={{ fontSize: '12px', padding: '6px 12px' }}>
                              ⚡ Convert to Video Project
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: VIDEO PROJECTS */}
          {activeTab === 'projects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Project selector bar */}
              <div className="card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <label style={{ fontWeight: 600, fontSize: '13.5px' }}>Active Production:</label>
                  <select
                    className="form-control"
                    style={{ minWidth: '320px' }}
                    value={selectedProjectId || ''}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.status})
                      </option>
                    ))}
                  </select>
                </div>
                {selectedProject && (
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <span className="status-chip review">{selectedProject.format.toUpperCase()}</span>
                    <span className="status-chip approved">{selectedProject.status.toUpperCase()}</span>
                  </div>
                )}
              </div>

              {/* Direct Project Initialization Form */}
              <div className="card" style={{ padding: '14px 20px' }}>
                <form onSubmit={handleCreateProject} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1.5fr 1fr auto', gap: '10px', alignItems: 'center' }}>
                  <select
                    className="form-control"
                    value={newProject.channel_profile_id}
                    onChange={(e) => setNewProject({ ...newProject, channel_profile_id: e.target.value })}
                    required
                  >
                    {channels.map((ch) => (
                      <option key={ch.id} value={ch.id}>{ch.name}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="New Production Title"
                    value={newProject.title}
                    onChange={(e) => setNewProject({ ...newProject, title: e.target.value })}
                    required
                  />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Core Topic Focus"
                    value={newProject.topic}
                    onChange={(e) => setNewProject({ ...newProject, topic: e.target.value })}
                    required
                  />
                  <select
                    className="form-control"
                    value={newProject.format}
                    onChange={(e) => setNewProject({ ...newProject, format: e.target.value as any })}
                  >
                    <option value="long_form">Long-Form (16:9)</option>
                    <option value="short">Short (9:16)</option>
                  </select>
                  <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
                    + Initialize Project
                  </button>
                </form>
              </div>

              {selectedProject && (
                <>
                  {/* Research & Factual Sources */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Verified Research & Citations ({sources.length})</span>
                      <button onClick={() => setActiveTab('ideas')} className="btn-secondary" style={{ fontSize: '12px' }}>
                        Browse Topics
                      </button>
                    </div>

                    <form onSubmit={handleAddSource} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 2fr 1fr auto', gap: '10px', marginBottom: '16px' }}>
                      <input
                        type="url"
                        className="form-control"
                        placeholder="Source URL (https://...)"
                        value={newSource.url}
                        onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Publisher / Author"
                        value={newSource.publisher}
                        onChange={(e) => setNewSource({ ...newSource, publisher: e.target.value })}
                      />
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Claim Supported / Key Fact"
                        value={newSource.claim_supported}
                        onChange={(e) => setNewSource({ ...newSource, claim_supported: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Source Title"
                        value={newSource.title}
                        onChange={(e) => setNewSource({ ...newSource, title: e.target.value })}
                        required
                      />
                      <button type="submit" className="btn-primary" style={{ padding: '0 16px' }}>
                        + Add Citation
                      </button>
                    </form>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {sources.map((s) => (
                        <div key={s.id} style={{ padding: '10px 14px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '12.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <strong>{s.title}</strong> — <span style={{ color: 'var(--accent-blue)' }}>"{s.claim_supported}"</span>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{s.publisher} • {s.url}</div>
                          </div>
                          <span className="badge badge-success">VERIFIED</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Media Assets & Provenance Catalog */}
                  <div className="card">
                    <div className="card-header">
                      <div>
                        <span className="card-title">Original & Licensed Media Assets ({assets.length})</span>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Imported local image, video, and audio assets with SHA-256 provenance checksums
                        </div>
                      </div>
                    </div>

                    {/* Asset Upload Form */}
                    <form onSubmit={handleUploadAsset} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 1fr auto', gap: '10px', alignItems: 'center', marginBottom: '16px' }}>
                      <input
                        type="file"
                        className="form-control"
                        accept="image/*,video/*,audio/*"
                        onChange={(e) => setAssetFile(e.target.files ? e.target.files[0] : null)}
                        required
                      />
                      <select
                        className="form-control"
                        value={assetType}
                        onChange={(e) => setAssetType(e.target.value)}
                      >
                        <option value="image">Image (PNG/JPG)</option>
                        <option value="video">Video Clip (MP4)</option>
                        <option value="audio">Sound Effect / Music</option>
                        <option value="graphic">Graphic Overlay</option>
                      </select>
                      <select
                        className="form-control"
                        value={licenseType}
                        onChange={(e) => setLicenseType(e.target.value)}
                      >
                        <option value="user_created">User Created (Original)</option>
                        <option value="public_domain">Public Domain</option>
                        <option value="creative_commons">Creative Commons</option>
                        <option value="purchased_license">Purchased License</option>
                        <option value="fair_use_quoted">Fair Use Quoted</option>
                      </select>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="License Notes / Provenance"
                        value={licenseNotes}
                        onChange={(e) => setLicenseNotes(e.target.value)}
                        required
                      />
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Attribution (optional)"
                        value={attributionText}
                        onChange={(e) => setAttributionText(e.target.value)}
                      />
                      <label style={{ fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={commercialUseAllowed}
                          onChange={(e) => setCommercialUseAllowed(e.target.checked)}
                        />
                        Commercial OK
                      </label>
                      <button type="submit" className="btn-primary" style={{ padding: '0 16px' }}>
                        + Ingest Asset
                      </button>
                    </form>

                    {/* Assets Table */}
                    {assets.length === 0 ? (
                      <div className="empty-state">No media assets ingested yet for this production.</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {assets.map((ast) => (
                          <div key={ast.id} style={{ padding: '10px 14px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '12.5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong>{ast.original_filename}</strong> ({ast.asset_type.toUpperCase()})
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                                SHA-256: <code style={{ color: 'var(--accent-blue)' }}>{ast.checksum_sha256.substring(0, 20)}...</code> • License: <strong>{ast.license_type}</strong> • {ast.license_notes}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <span className="badge badge-success">{ast.commercial_use_allowed ? 'Commercial Permitted' : 'Non-Commercial'}</span>
                              <button onClick={() => handleDeleteAsset(ast.id)} className="btn-secondary" style={{ padding: '4px 8px', fontSize: '11px', color: 'var(--accent-red)' }}>
                                ✕ Delete
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Script Editor & Scene Plan */}
                  <div className="card">
                    <div className="card-header">
                      <div>
                        <span className="card-title">Script Narration & Scene Plan</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Versions: {scripts.map((s) => `v${s.version} (${s.status})`).join(', ') || 'None'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={handleGenerateScript} className="btn-secondary">
                          ⚡ Generate Script Draft ({settings?.providers.text.activeProvider || 'Mock'})
                        </button>
                        {activeScript && activeScript.status !== 'approved' && (
                          <button onClick={() => handleApproveScript(activeScript.id)} className="btn-success">
                            ✓ Approve Script (Human Gate)
                          </button>
                        )}
                      </div>
                    </div>

                    {activeScript ? (
                      <div className="script-editor-container">
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <strong style={{ fontSize: '13px' }}>Script Narration Text (v{activeScript.version})</strong>
                            <span className={`status-chip ${activeScript.status === 'approved' ? 'approved' : 'review'}`}>
                              {activeScript.status.toUpperCase()}
                            </span>
                          </div>
                          <textarea
                            className="form-control"
                            rows={18}
                            value={activeScript.content}
                            readOnly={activeScript.status === 'approved'}
                            style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px', lineHeight: 1.6 }}
                          />
                          {activeScript.status !== 'approved' && (
                            <div style={{ marginTop: '12px' }}>
                              <label style={{ fontSize: '11.5px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>Approval Sign-Off Notes:</label>
                              <input
                                type="text"
                                className="form-control"
                                value={approvalNotes}
                                onChange={(e) => setApprovalNotes(e.target.value)}
                              />
                            </div>
                          )}
                        </div>

                        <div>
                          <strong style={{ fontSize: '13px', display: 'block', marginBottom: '8px' }}>Scene-by-Scene Visual Plan</strong>
                          <div style={{ maxHeight: '360px', overflowY: 'auto', paddingRight: '6px' }}>
                            {activeScript.scene_plan_json?.map((sc) => (
                              <div key={sc.sceneNumber} className="scene-card">
                                <div className="scene-card-header">
                                  <span style={{ fontWeight: 700, fontSize: '12px', color: 'var(--accent-red)' }}>Scene {sc.sceneNumber} ({sc.durationSeconds}s)</span>
                                  <span className="badge-tag">{sc.suggestedAssetType || 'graphic'}</span>
                                </div>
                                <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                                  <strong>Visual:</strong> {sc.visualDescription}
                                </div>
                                {sc.onScreenText && (
                                  <div style={{ fontSize: '11px', color: 'var(--accent-amber)', marginBottom: '4px' }}>
                                    <strong>Text Overlay:</strong> "{sc.onScreenText}"
                                  </div>
                                )}
                                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  <strong>Audio:</strong> {sc.narrationSnippet}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state">
                        No script has been generated yet for this project.
                        <div style={{ marginTop: '12px' }}>
                          <button onClick={handleGenerateScript} className="btn-primary">
                            Generate Initial Script Draft
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB: RENDER & REVIEW (PHASE 3) */}
          {activeTab === 'render' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top Selector & Pre-flight Bar */}
              <div className="card" style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <label style={{ fontWeight: 600, fontSize: '13.5px' }}>Production Project:</label>
                  <select
                    className="form-control"
                    style={{ minWidth: '320px' }}
                    value={selectedProjectId || ''}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {binaries?.ffmpeg.available ? (
                    <span className="badge badge-success">✓ FFmpeg 8.0</span>
                  ) : (
                    <span className="badge badge-danger">FFmpeg Missing</span>
                  )}
                  {binaries?.ffprobe.available ? (
                    <span className="badge badge-success">✓ FFprobe 8.0</span>
                  ) : (
                    <span className="badge badge-danger">FFprobe Missing</span>
                  )}
                  <button
                    onClick={handleStartRender}
                    disabled={rendering}
                    className="btn-primary"
                    style={{ padding: '8px 18px', fontWeight: 600 }}
                  >
                    {rendering ? '⚙️ Rendering via FFmpeg...' : '▶ Start FFmpeg Render'}
                  </button>
                </div>
              </div>

              {/* 2-Column Render Studio */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
                {/* Left Column: Video Player & Human Approval Gate */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Video Player Card */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Rendered Video Preview</span>
                      {latestRender && (
                        <span className={`status-chip ${latestRender.status === 'completed' ? 'approved' : 'review'}`}>
                          {latestRender.status.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {latestRender && latestRender.status === 'completed' ? (
                      <div>
                        <video
                          key={latestRender.id}
                          controls
                          style={{
                            width: '100%',
                            maxHeight: '380px',
                            borderRadius: '8px',
                            background: '#000',
                            border: '1px solid var(--border-subtle)',
                          }}
                          src={`/api/projects/${selectedProjectId}/render-video`}
                        >
                          Your browser does not support HTML5 video preview.
                        </video>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px', wordBreak: 'break-all' }}>
                          <strong>Disk Output:</strong> {latestRender.output_path}
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state" style={{ minHeight: '260px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <div style={{ fontSize: '36px', marginBottom: '8px' }}>🎬</div>
                        <div>No completed render found for this project.</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Ensure script is approved and audio synthesized, then click "Start FFmpeg Render".
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Human Render Review & Approval Gate */}
                  <div className="card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
                    <div className="card-header">
                      <div>
                        <span className="card-title">Human Quality Review Gate</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Explicit sign-off required prior to upload staging
                        </div>
                      </div>
                      <span className="badge badge-warning">Human Action Required</span>
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                      <label style={{ fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                        Reviewer Sign-Off Notes:
                      </label>
                      <input
                        type="text"
                        className="form-control"
                        value={renderApprovalNotes}
                        onChange={(e) => setRenderApprovalNotes(e.target.value)}
                        placeholder="Verify visual clarity, audio synchronization, and subtitle accuracy..."
                      />
                    </div>

                    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px' }}>
                      <button
                        onClick={() => handleRenderApproval('approved')}
                        disabled={!latestRender || latestRender.status !== 'completed'}
                        className="btn-success"
                        style={{ flex: 1, padding: '10px', fontWeight: 600 }}
                      >
                        ✓ Approve Render (Sign-off)
                      </button>
                      <button
                        onClick={() => handleRenderApproval('rejected')}
                        disabled={!latestRender}
                        className="btn-secondary"
                        style={{ flex: 1, padding: '10px', color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}
                      >
                        ✗ Reject & Revise
                      </button>
                    </div>

                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', background: 'var(--bg-main)', padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <strong>🛡️ Safety Constraint:</strong> Approving this render transitions project to <code>render_approved</code> / <code>ready_to_upload</code>. It does <strong>NOT</strong> trigger automated upload or public release on YouTube.
                    </div>
                  </div>
                </div>

                {/* Right Column: FFprobe Validation & Audio/Assets Provenance */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Technical Validation Card */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">FFprobe Technical Validation</span>
                      {latestRender?.validation_json?.valid ? (
                        <span className="badge badge-success">✓ ALL CHECKS PASSED</span>
                      ) : (
                        <span className="badge badge-danger">PENDING / FAILED</span>
                      )}
                    </div>

                    {latestRender?.validation_json ? (
                      <div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                          <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Resolution</div>
                            <strong style={{ fontSize: '15px' }}>
                              {latestRender.validation_json.width}x{latestRender.validation_json.height}
                            </strong>
                          </div>
                          <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Duration</div>
                            <strong style={{ fontSize: '15px' }}>
                              {latestRender.validation_json.durationSeconds}s
                            </strong>
                          </div>
                          <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Video Codec / FPS</div>
                            <strong style={{ fontSize: '15px' }}>
                              {latestRender.validation_json.videoCodec.toUpperCase()} @ {latestRender.validation_json.fps}fps
                            </strong>
                          </div>
                          <div style={{ background: 'var(--bg-main)', padding: '10px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Audio Codec / Size</div>
                            <strong style={{ fontSize: '15px' }}>
                              {latestRender.validation_json.audioCodec.toUpperCase()} • {Math.round(latestRender.validation_json.sizeBytes / 1024)} KB
                            </strong>
                          </div>
                        </div>

                        <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Video Stream Present:</span>
                            <span style={{ color: latestRender.validation_json.checks.hasVideoStream ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {latestRender.validation_json.checks.hasVideoStream ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Audio Stream Synchronized:</span>
                            <span style={{ color: latestRender.validation_json.checks.hasAudioStream ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {latestRender.validation_json.checks.hasAudioStream ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Non-zero Duration Check:</span>
                            <span style={{ color: latestRender.validation_json.checks.nonZeroDuration ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {latestRender.validation_json.checks.nonZeroDuration ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Web-Compatible Codecs:</span>
                            <span style={{ color: latestRender.validation_json.checks.compatibleCodecs ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                              {latestRender.validation_json.checks.compatibleCodecs ? 'PASS' : 'FAIL'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state">No technical validation metrics available yet.</div>
                    )}
                  </div>

                  {/* Narration Track Card */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Narration Voiceover Audio</span>
                      <button onClick={handleGenerateNarration} className="btn-secondary" style={{ fontSize: '12px' }}>
                        ⚡ Synthesize Spoken Narration ({settings?.providers.tts.activeProvider === 'local' ? (settings?.providers.tts.voice || 'Local SAPI') : (settings?.providers.tts.activeProvider || 'Local')})
                      </button>
                    </div>

                    {narrations.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {narrations.map((n) => (
                          <div key={n.id} style={{ padding: '10px 12px', background: 'var(--bg-main)', border: '1px solid var(--border-subtle)', borderRadius: '6px', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <strong>{n.provider.toUpperCase()} Track</strong> ({n.duration_seconds}s)
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Status: {n.status}</div>
                            </div>
                            <span className="badge badge-success">ACTIVE AUDIO</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="empty-state">No narration track found. Synthesize or import voiceover below.</div>
                    )}

                    <form onSubmit={handleImportVoiceover} style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                      <input
                        type="file"
                        accept="audio/*"
                        className="form-control"
                        onChange={(e) => setVoiceoverFile(e.target.files ? e.target.files[0] : null)}
                      />
                      <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
                        Import Voiceover
                      </button>
                    </form>
                  </div>

                  {/* Asset Provenance Checklist */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Asset License & Provenance Checklist</span>
                      <span className="badge badge-success">{assets.length} Verified</span>
                    </div>

                    <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {assets.map((ast) => (
                        <div key={ast.id} style={{ padding: '8px 10px', background: 'var(--bg-main)', borderRadius: '4px', fontSize: '11.5px', border: '1px solid var(--border-subtle)' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong>{ast.original_filename}</strong>
                            <span style={{ color: 'var(--accent-blue)' }}>{ast.license_type}</span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', marginTop: '2px' }}>
                            SHA-256: <code>{ast.checksum_sha256.substring(0, 16)}...</code>
                          </div>
                        </div>
                      ))}
                      {assets.length === 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Using procedural generator and deterministic mock assets.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: UPLOAD REVIEW (PHASE 4) */}
          {activeTab === 'upload' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Top Context & Project Switcher */}
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', padding: '16px 20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ fontSize: '24px' }}>🎬</div>
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Active Video Project
                    </div>
                    <select
                      className="form-control"
                      style={{ fontSize: '14px', fontWeight: 600, minWidth: '260px', marginTop: '4px' }}
                      value={selectedProjectId || ''}
                      onChange={(e) => setSelectedProjectId(e.target.value || null)}
                    >
                      <option value="">{projects.length === 0 ? '— No video projects yet —' : '— Select a video project —'}</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.title} ({p.format === 'short' ? 'Short' : 'Long-form'}) — [{p.status}]
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <div className="locked-privacy-badge">
                    <span>🔒</span> Visibility: PRIVATE (Fixed)
                  </div>
                  <span className={`status-badge ${ytStatus?.connected ? 'online' : 'offline'}`}>
                    <span className="status-dot"></span>
                    {ytStatus?.connected ? `Channel: ${ytStatus.channel_title || 'Connected'}` : 'YouTube: Disconnected'}
                  </span>
                </div>
              </div>

              {!selectedProjectId && (
                <div className="card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
                  <div className="card-title" style={{ marginBottom: '8px' }}>
                    {projects.length === 0 ? 'Nothing to upload yet' : 'Pick a video project above'}
                  </div>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '13.5px', marginBottom: '12px' }}>
                    Upload Review is the last step. A video has to be produced first:
                  </p>
                  <ol style={{ color: 'var(--text-secondary)', fontSize: '13.5px', paddingLeft: '20px', lineHeight: 1.8, marginBottom: '16px' }}>
                    <li><strong>Video Projects</strong> — create a project for your channel</li>
                    <li>Generate the script and <strong>approve</strong> it</li>
                    <li>Add narration and assets, then render in <strong>Render &amp; Review</strong> and approve the render</li>
                    <li>Come back here: approve the upload, set audience/disclosure, and upload as private</li>
                  </ol>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button className="btn-primary" onClick={() => setActiveTab('projects')}>
                      {projects.length === 0 ? '+ Create a Video Project' : 'Open Video Projects'}
                    </button>
                    {projects.length > 0 && (
                      <button className="btn-secondary" onClick={() => setActiveTab('render')}>Go to Render &amp; Review</button>
                    )}
                  </div>
                </div>
              )}

              {/* 2-Column Staging Layout */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr', gap: '24px' }}>
                {/* Left Column: OAuth Channel Status & Pre-flight Gating */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Google OAuth & YouTube Channel Card */}
                  <div className="card" style={{ borderTop: '3px solid #ef4444' }}>
                    <div className="card-header">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px', color: '#ef4444' }}>▶</span>
                        <span className="card-title">YouTube Channel Authorization</span>
                      </div>
                      <span className={`badge ${ytStatus?.connected ? 'badge-success' : 'badge-danger'}`}>
                        {ytStatus?.connected ? 'AUTHORIZED' : 'NOT CONNECTED'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div className="metric-row">
                        <span className="metric-label">Google OAuth 2.0</span>
                        <span className="metric-value">{settings?.providers.youtube.oauthConfigured ? 'Configured' : 'Missing Env'}</span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-label">Token Encryption</span>
                        <span className="metric-value">
                          {settings?.providers.youtube.tokenEncryptionConfigured ? 'AES-256-GCM Active' : 'Unconfigured'}
                        </span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-label">Connected Channel</span>
                        <span className="metric-value font-mono">
                          {ytStatus?.connected ? (ytStatus.channel_title || ytStatus.youtube_channel_id || 'Unknown') : 'None'}
                        </span>
                      </div>
                      {ytStatus?.connected && ytStatus.youtube_channel_id && (
                        <div className="metric-row">
                          <span className="metric-label">Channel ID</span>
                          <a
                            className="metric-value font-mono"
                            style={{ fontSize: '11.5px' }}
                            href={`https://www.youtube.com/channel/${encodeURIComponent(ytStatus.youtube_channel_id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {ytStatus.youtube_channel_id}
                          </a>
                        </div>
                      )}
                      {ytStatus?.connected && (
                        <div className="metric-row">
                          <span className="metric-label">Offline Access (Refresh Token)</span>
                          <span className="metric-value">{ytStatus.has_refresh_token ? 'Yes — auto-refreshes' : 'Missing'}</span>
                        </div>
                      )}
                      {ytStatus?.connected && ytStatus.expiry_date && (
                        <div className="metric-row">
                          <span className="metric-label">Access Token Expires</span>
                          <span className="metric-value" style={{ fontSize: '11.5px' }}>
                            {new Date(ytStatus.expiry_date).toLocaleString()}
                          </span>
                        </div>
                      )}

                      {ytAnalytics && (
                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border-subtle)', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
                          <div style={{ background: 'var(--bg-main)', padding: '6px 4px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Subscribers</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent-primary)' }}>
                              {ytAnalytics.hidden_subscriber_count ? 'Hidden' : ytAnalytics.subscriber_count.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ background: 'var(--bg-main)', padding: '6px 4px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Views</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#10b981' }}>
                              {ytAnalytics.view_count.toLocaleString()}
                            </div>
                          </div>
                          <div style={{ background: 'var(--bg-main)', padding: '6px 4px', borderRadius: '4px', border: '1px solid var(--border-subtle)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Videos</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b' }}>
                              {ytAnalytics.video_count.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {ytStatus?.connected && (!ytStatus.has_refresh_token || !ytStatus.upload_scope_granted || ytStatus.token_status === 'expired') && (
                      <div className="alert-warning" style={{ marginTop: '12px', fontSize: '12px' }}>
                        ⚠️{' '}
                        {!ytStatus.upload_scope_granted
                          ? 'The youtube.upload permission was not granted. Disconnect and connect again, allowing all permissions.'
                          : 'No refresh token stored, so this connection stops working when the access token expires. Remove the app at myaccount.google.com/permissions, then disconnect and connect again.'}
                      </div>
                    )}

                    <div style={{ marginTop: '16px', display: 'flex', gap: '10px' }}>
                      {!ytStatus?.connected ? (
                        <button
                          onClick={handleConnectYouTube}
                          className="btn-primary"
                          style={{ width: '100%', background: '#ef4444', borderColor: '#dc2626' }}
                        >
                          ▶ Connect with Google (OAuth 2.0)
                        </button>
                      ) : (
                        <button
                          onClick={handleDisconnectYouTube}
                          className="btn-secondary"
                          style={{ width: '100%', color: 'var(--accent-red)' }}
                        >
                          🔌 Disconnect & Purge Tokens
                        </button>
                      )}
                    </div>

                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '12px', lineHeight: 1.5 }}>
                      🛡️ Tokens are encrypted at rest with AES-256-GCM authenticated encryption. Scopes: <code>youtube.upload</code>, <code>youtube.readonly</code>. Public publishing is disabled by system policy.
                    </div>
                  </div>

                  {/* Pre-flight Media & Integrity Checklist */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Pre-flight Verification Checklist</span>
                      <span className="badge badge-success">Mandatory Gates</span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div className={`checklist-item ${activeScript?.status === 'approved' ? 'pass' : 'fail'}`}>
                        <div>
                          <strong>1. Script Approval Gate</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {activeScript?.status === 'approved'
                              ? `Script v${activeScript.version} approved for production`
                              : 'Script must be approved in Production Studio'}
                          </div>
                        </div>
                        <span className={`badge ${activeScript?.status === 'approved' ? 'badge-success' : 'badge-danger'}`}>
                          {activeScript?.status === 'approved' ? 'PASS' : 'FAIL'}
                        </span>
                      </div>

                      <div className={`checklist-item ${latestRender?.status === 'completed' && latestRender?.output_path ? 'pass' : 'fail'}`}>
                        <div>
                          <strong>2. Video Render Output</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {latestRender?.status === 'completed'
                              ? `MP4 verified on disk (${latestRender.validation_json?.durationSeconds}s)`
                              : 'Requires completed local FFmpeg render'}
                          </div>
                        </div>
                        <span className={`badge ${latestRender?.status === 'completed' ? 'badge-success' : 'badge-danger'}`}>
                          {latestRender?.status === 'completed' ? 'PASS' : 'FAIL'}
                        </span>
                      </div>

                      <div className={`checklist-item ${latestRender?.validation_json?.valid ? 'pass' : 'fail'}`}>
                        <div>
                          <strong>3. FFprobe Technical Validation</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {latestRender?.validation_json?.valid
                              ? `${latestRender.validation_json.width}x${latestRender.validation_json.height} @ ${latestRender.validation_json.fps}fps, Audio Synced`
                              : 'Probe streams and duration check required'}
                          </div>
                        </div>
                        <span className={`badge ${latestRender?.validation_json?.valid ? 'badge-success' : 'badge-danger'}`}>
                          {latestRender?.validation_json?.valid ? 'PASS' : 'FAIL'}
                        </span>
                      </div>

                      <div className={`checklist-item ${UPLOAD_APPROVED_STATUSES.includes(selectedProject?.status || '') ? 'pass' : 'fail'}`}>
                        <div>
                          <strong>4. Human Upload Gate Approval</strong>
                          <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                            {UPLOAD_APPROVED_STATUSES.includes(selectedProject?.status || '')
                              ? 'Explicit human upload approval recorded'
                              : 'Requires explicit human sign-off below'}
                          </div>
                        </div>
                        <span className={`badge ${UPLOAD_APPROVED_STATUSES.includes(selectedProject?.status || '') ? 'badge-success' : 'badge-danger'}`}>
                          {UPLOAD_APPROVED_STATUSES.includes(selectedProject?.status || '') ? 'APPROVED' : 'PENDING'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Separate Human Upload Approval Gate */}
                  <div className="card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
                    <div className="card-header">
                      <div>
                        <span className="card-title">Explicit Human Upload Gate</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                          Separate approval required specifically for YouTube staging
                        </div>
                      </div>
                      <span className={`status-chip ${UPLOAD_APPROVED_STATUSES.includes(selectedProject?.status || '') ? 'approved' : 'review'}`}>
                        {UPLOAD_APPROVED_STATUSES.includes(selectedProject?.status || '') ? 'APPROVED' : 'REVIEW REQUIRED'}
                      </span>
                    </div>

                    <div className="form-group">
                      <label>Reviewer Verification Sign-off Notes</label>
                      <textarea
                        className="form-control font-mono"
                        rows={2}
                        value={uploadApprovalNotes}
                        onChange={(e) => setUploadApprovalNotes(e.target.value)}
                        placeholder="Confirm audio/video synchronization, compliance with YouTube Community Guidelines, and private staging status."
                      />
                    </div>

                    <button
                      onClick={handleApproveUpload}
                      disabled={loading || !latestRender || latestRender.status !== 'completed'}
                      className="btn-primary"
                      style={{ width: '100%', marginTop: '6px' }}
                    >
                      ✓ Approve for Private Upload (Human Gate)
                    </button>

                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                      ⚠️ If the script or video is re-rendered after approval, this upload authorization is invalidated automatically.
                    </div>
                  </div>
                </div>

                {/* Right Column: Metadata Review, Visibility Locked to Private & Upload Action */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Metadata Review Card */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Video Metadata Review</span>
                      <span className="badge badge-success">Private Staging Package</span>
                    </div>

                    <div className="form-group">
                      <label>Video Title</label>
                      <input
                        type="text"
                        className="form-control"
                        value={uploadMetadata.title}
                        onChange={(e) => setUploadMetadata({ ...uploadMetadata, title: e.target.value })}
                        placeholder="Enter finalized video title"
                      />
                    </div>

                    <div className="form-group">
                      <label>Video Description</label>
                      <textarea
                        className="form-control font-mono"
                        rows={4}
                        value={uploadMetadata.description}
                        onChange={(e) => setUploadMetadata({ ...uploadMetadata, description: e.target.value })}
                        placeholder="Enter description and attribution text"
                      />
                    </div>

                    <div className="form-group">
                      <label>Tags (comma-separated)</label>
                      <input
                        type="text"
                        className="form-control"
                        value={uploadMetadata.tags}
                        onChange={(e) => setUploadMetadata({ ...uploadMetadata, tags: e.target.value })}
                        placeholder="youtube automation, software engineering, architecture"
                      />
                    </div>

                    {/* Creator declarations required by YouTube — never inferred automatically */}
                    <div className="form-group">
                      <label>Audience — is this video made for kids? (required)</label>
                      <select
                        className="form-control"
                        value={uploadMetadata.made_for_kids}
                        onChange={(e) => setUploadMetadata({ ...uploadMetadata, made_for_kids: e.target.value as '' | 'yes' | 'no' })}
                      >
                        <option value="">— Choose —</option>
                        <option value="no">No, it's not made for kids</option>
                        <option value="yes">Yes, it's made for kids</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Altered or synthetic content? (required)</label>
                      <select
                        className="form-control"
                        value={uploadMetadata.contains_synthetic_media}
                        onChange={(e) =>
                          setUploadMetadata({ ...uploadMetadata, contains_synthetic_media: e.target.value as '' | 'yes' | 'no' })
                        }
                      >
                        <option value="">— Choose —</option>
                        <option value="no">No realistic altered/synthetic content</option>
                        <option value="yes">Yes — contains realistic AI-generated or altered content</option>
                      </select>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Synthetic narration voices or clearly unrealistic graphics usually don't need disclosure; realistic depictions of people, places or events that didn't happen do. You decide.
                      </div>
                    </div>

                    {/* Hardcoded Locked Visibility */}
                    <div className="form-group" style={{ background: 'var(--bg-main)', padding: '14px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>YouTube Privacy Status:</span>
                        <div className="locked-privacy-badge">
                          <span>🔒</span> STRICTLY PRIVATE
                        </div>
                      </div>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        Public publishing and scheduling are disabled in the master studio policy. All videos uploaded from this environment are permanently flagged as <strong>Private</strong> in the YouTube Data API payload, accessible only to the authenticated channel owner in YouTube Studio.
                      </div>
                    </div>

                    {/* Quota Notice */}
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Each upload consumes YouTube Data API quota.</span>
                      <a href="https://developers.google.com/youtube/v3/determine_quota_cost" target="_blank" rel="noopener noreferrer">
                        Current quota costs ↗
                      </a>
                    </div>
                  </div>

                  {/* Upload Action & Confirmation Card */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">Initiate YouTube Private Upload</span>
                      {uploading && <span className="badge badge-warning">UPLOADING...</span>}
                    </div>

                    {!(activeScript?.status === 'approved' && latestRender?.status === 'completed' && (UPLOAD_APPROVED_STATUSES.includes(selectedProject?.status || ''))) ? (
                      <div className="alert-warning" style={{ margin: '0 0 16px 0', fontSize: '12.5px' }}>
                        ⚠️ <strong>Upload Pre-flight Incomplete:</strong> Complete all 4 gates on the left (Script Approval, Rendered MP4, FFprobe check, and Human Upload Approval) before initiating upload.
                      </div>
                    ) : null}

                    {settings?.features.youtubeUploadsEnabled && (!uploadMetadata.made_for_kids || !uploadMetadata.contains_synthetic_media) ? (
                      <div className="alert-warning" style={{ margin: '0 0 16px 0', fontSize: '12.5px' }}>
                        ⚠️ Choose the <strong>audience</strong> and <strong>altered/synthetic content</strong> declarations in Video Metadata Review before uploading.
                      </div>
                    ) : null}
                    {settings?.features.youtubeUploadsEnabled && !ytStatus?.connected ? (
                      <div className="alert-warning" style={{ margin: '0 0 16px 0', fontSize: '12.5px' }}>
                        ⚠️ Connect the YouTube channel first.
                      </div>
                    ) : null}
                    {!settings?.features.youtubeUploadsEnabled ? (
                      <div style={{ margin: '0 0 12px 0', fontSize: '12px', color: 'var(--text-muted)' }}>
                        ENABLE_YOUTUBE_UPLOADS=false — the button runs a mock staging only; nothing is sent to YouTube.
                      </div>
                    ) : null}

                    <button
                      onClick={() => setConfirmUploadModal(true)}
                      disabled={
                        uploading ||
                        (settings?.features.youtubeUploadsEnabled &&
                          (!ytStatus?.connected || !uploadMetadata.made_for_kids || !uploadMetadata.contains_synthetic_media)) ||
                        activeScript?.status !== 'approved' ||
                        latestRender?.status !== 'completed' ||
                        !UPLOAD_APPROVED_STATUSES.includes(selectedProject?.status || '')
                      }
                      className="btn-primary"
                      style={{
                        width: '100%',
                        padding: '14px',
                        fontSize: '15px',
                        fontWeight: 700,
                        background: '#ef4444',
                        borderColor: '#dc2626',
                      }}
                    >
                      {uploading ? '⏳ Uploading Video to YouTube...' : '🚀 Upload Video to YouTube (Strictly Private)'}
                    </button>

                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', marginTop: '8px' }}>
                      A final confirmation modal will prompt for verification before sending bytes.
                    </div>
                  </div>

                  {/* Upload History & Status Tracking */}
                  <div className="card">
                    <div className="card-header">
                      <span className="card-title">YouTube Upload Record & Tracking</span>
                      {uploadRecord && (
                        <span className={`status-chip ${uploadRecord.upload_status === 'uploaded_private' ? 'approved' : uploadRecord.upload_status === 'failed' ? 'badge-danger' : 'review'}`}>
                          {isMockUpload(uploadRecord) ? 'MOCK STAGED' : uploadRecord.upload_status.toUpperCase()}
                        </span>
                      )}
                    </div>

                    {uploadRecord ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {uploadRecord.upload_status === 'uploaded_private' && (
                          <div style={{ padding: '12px 16px', background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', borderRadius: '6px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ color: 'var(--accent-green)', fontSize: '14px' }}>
                                ✓ {isMockUpload(uploadRecord) ? 'Mock Upload Staged (nothing sent to YouTube)' : 'Uploaded to YouTube'}
                              </strong>
                              <span className="locked-privacy-badge" style={{ fontSize: '10.5px', padding: '3px 8px' }}>
                                🔒 PRIVATE
                              </span>
                            </div>
                            <div style={{ fontSize: '12px', marginTop: '6px', color: 'var(--text-primary)' }}>
                              YouTube Video ID: <code>{uploadRecord.youtube_video_id}</code>
                            </div>
                            {isMockUpload(uploadRecord) && (
                              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                                ENABLE_YOUTUBE_UPLOADS is false, so this is a placeholder ID. Set it to true in .env and restart the API to upload for real.
                              </div>
                            )}
                            {uploadRecord.youtube_video_id && !isMockUpload(uploadRecord) && (
                              <div style={{ marginTop: '10px' }}>
                                <a
                                  href={`https://studio.youtube.com/video/${encodeURIComponent(uploadRecord.youtube_video_id)}/edit`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="btn-secondary"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', textDecoration: 'none' }}
                                >
                                  ▶ View Private Video on YouTube Studio
                                </a>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                  Note: Video is private and only viewable by authorized managers of the connected channel.
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {uploadRecord.upload_status === 'failed' && (
                          <div className="alert-error" style={{ margin: 0 }}>
                            <strong>Upload Error [{uploadRecord.error_code || 'FAILED'}]:</strong>
                            <div style={{ marginTop: '4px', fontSize: '12px' }}>{uploadRecord.error_message}</div>
                          </div>
                        )}

                        <div className="metric-row">
                          <span className="metric-label">Upload Record ID</span>
                          <span className="metric-value font-mono" style={{ fontSize: '11px' }}>{uploadRecord.id}</span>
                        </div>
                        <div className="metric-row">
                          <span className="metric-label">Upload Attempts</span>
                          <span className="metric-value">{uploadRecord.upload_attempts}</span>
                        </div>
                        {uploadRecord.last_attempt_at && (
                          <div className="metric-row">
                            <span className="metric-label">Last Attempt</span>
                            <span className="metric-value font-mono" style={{ fontSize: '11px' }}>
                              {new Date(uploadRecord.last_attempt_at).toLocaleString()}
                            </span>
                          </div>
                        )}
                        {uploadRecord.uploaded_at && (
                          <div className="metric-row">
                            <span className="metric-label">Completed At</span>
                            <span className="metric-value font-mono" style={{ fontSize: '11px' }}>
                              {new Date(uploadRecord.uploaded_at).toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="empty-state">
                        <div>No upload attempts recorded for this project yet.</div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Follow the pre-flight checklist and initiate upload when ready.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: JOBS & LOGS (PHASE 5) */}
          {activeTab === 'jobs' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Header metrics card */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Active Queue</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: 'var(--text-primary)' }}>
                    {jobs.filter((j) => j.status === 'processing').length}{' '}
                    <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--accent-amber)' }}>Running</span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {jobs.filter((j) => j.status === 'pending').length} pending in backlog
                  </div>
                </div>

                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Completed Tasks</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-green)' }}>
                    {jobs.filter((j) => j.status === 'completed').length}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {jobs.filter((j) => j.status === 'failed').length} failed permanently
                  </div>
                </div>

                <div className="card" style={{ padding: '16px 20px' }}>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Local Storage Usage</div>
                  <div style={{ fontSize: '24px', fontWeight: 700, marginTop: '4px', color: 'var(--accent-blue)' }}>
                    {storageStats ? `${(storageStats.totalSizeBytes / 1024 / 1024).toFixed(1)} MB` : 'Calculating...'}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                    {storageStats ? `${storageStats.fileCount} managed files` : 'Scanning storage root'}
                  </div>
                </div>

                <div className="card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <button
                    onClick={handleTriggerCleanup}
                    disabled={cleaningStorage}
                    className="btn-secondary"
                    style={{ width: '100%', fontSize: '12.5px', padding: '10px' }}
                  >
                    {cleaningStorage ? '🧹 Cleaning Scratch Files...' : '🧹 Purge Stale Scratch Files (>24h)'}
                  </button>
                </div>
              </div>

              {/* 2-Column: Background Job Queue & Audit Trail */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px' }}>
                {/* Left Column: Background Job Queue */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <span className="card-title">Background Job Queue</span>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Lease locking, atomic execution & exponential backoff retries
                      </div>
                    </div>
                    {/* Status filter tabs */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                      {(['all', 'pending', 'processing', 'completed', 'failed'] as const).map((filter) => (
                        <button
                          key={filter}
                          onClick={() => setActiveJobFilter(filter)}
                          style={{
                            padding: '4px 8px',
                            fontSize: '11px',
                            borderRadius: '4px',
                            border: '1px solid var(--border-subtle)',
                            background: activeJobFilter === filter ? 'var(--bg-surface-elevated)' : 'transparent',
                            color: activeJobFilter === filter ? 'var(--text-primary)' : 'var(--text-muted)',
                            cursor: 'pointer',
                          }}
                        >
                          {filter.toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </div>

                  {jobs.filter((j) => activeJobFilter === 'all' || j.status === activeJobFilter).length === 0 ? (
                    <div className="empty-state">No jobs found matching filter '{activeJobFilter}'.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {jobs
                        .filter((j) => activeJobFilter === 'all' || j.status === activeJobFilter)
                        .map((job) => (
                          <div
                            key={job.id}
                            style={{
                              padding: '12px 14px',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: '6px',
                              display: 'flex',
                              flexDirection: 'column',
                              gap: '8px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '16px' }}>
                                  {job.job_type === 'render' && '🎬'}
                                  {job.job_type === 'upload' && '🚀'}
                                  {job.job_type === 'maintenance' && '🧹'}
                                </span>
                                <strong style={{ fontSize: '13px' }}>{job.job_type.toUpperCase()} TASK</strong>
                                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                                  #{job.id.slice(0, 8)}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span
                                  className={`badge ${
                                    job.status === 'completed'
                                      ? 'badge-success'
                                      : job.status === 'failed'
                                      ? 'badge-danger'
                                      : job.status === 'processing'
                                      ? 'badge-warning'
                                      : ''
                                  }`}
                                >
                                  {job.status.toUpperCase()}
                                </span>
                                {(job.status === 'pending' || job.status === 'processing') && (
                                  <button
                                    onClick={() => handleCancelJob(job.id)}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'var(--accent-red)',
                                      cursor: 'pointer',
                                      fontSize: '11px',
                                      fontWeight: 600,
                                    }}
                                  >
                                    Cancel
                                  </button>
                                )}
                              </div>
                            </div>

                            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                              Attempts: {job.attempt_count} / {job.max_attempts}
                              {job.locked_by && ` • Locked by: ${job.locked_by}`}
                              {job.next_retry_at && job.status === 'pending' && (
                                <span style={{ color: 'var(--accent-amber)' }}>
                                  {' '}
                                  • Retry scheduled: {new Date(job.next_retry_at).toLocaleTimeString()}
                                </span>
                              )}
                            </div>

                            {job.last_error && (
                              <div
                                style={{
                                  padding: '6px 10px',
                                  background: 'rgba(239, 68, 68, 0.1)',
                                  border: '1px solid rgba(239, 68, 68, 0.3)',
                                  borderRadius: '4px',
                                  fontSize: '11px',
                                  color: '#fca5a5',
                                  wordBreak: 'break-word',
                                }}
                              >
                                Error: {job.last_error}
                              </div>
                            )}

                            {job.result_json && (
                              <div
                                className="font-mono"
                                style={{
                                  fontSize: '10.5px',
                                  color: 'var(--accent-green)',
                                  background: 'rgba(34, 197, 94, 0.08)',
                                  padding: '6px 8px',
                                  borderRadius: '4px',
                                  overflowX: 'auto',
                                }}
                              >
                                Result: {JSON.stringify(job.result_json)}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  )}
                </div>

                {/* Right Column: Immutable Audit Trail */}
                <div className="card">
                  <div className="card-header">
                    <div>
                      <span className="card-title">Immutable Audit Trail</span>
                      <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Operational security & execution log
                      </div>
                    </div>
                    <span className="badge badge-success">{auditEvents.length} Events</span>
                  </div>

                  {auditEvents.length === 0 ? (
                    <div className="empty-state">No audit events logged yet.</div>
                  ) : (
                    <div style={{ maxHeight: '560px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {auditEvents.map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            padding: '10px 12px',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border-subtle)',
                            borderRadius: '6px',
                            fontSize: '11.5px',
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <strong style={{ color: 'var(--accent-blue)' }}>{ev.action}</strong>
                            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {new Date(ev.created_at).toLocaleTimeString()}
                            </span>
                          </div>
                          <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', marginTop: '3px' }}>
                            Actor: <code>{ev.actor}</code> • Target: <code>{ev.entity_type}</code>
                          </div>
                          {ev.details_json && Object.keys(ev.details_json).length > 0 && (
                            <div
                              className="font-mono"
                              style={{
                                marginTop: '4px',
                                fontSize: '10px',
                                color: 'var(--text-secondary)',
                                wordBreak: 'break-all',
                              }}
                            >
                              {JSON.stringify(ev.details_json)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Phase 4: Explicit Confirmation Modal Before Upload */}
        {confirmUploadModal && (
          <div className="modal-overlay">
            <div className="modal-content">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <span style={{ fontSize: '24px' }}>🛡️</span>
                <div>
                  <h3 style={{ fontSize: '17px', margin: 0, fontWeight: 700 }}>Confirm YouTube Private Upload</h3>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>Mandatory Human Confirmation Step</div>
                </div>
              </div>

              <div style={{ background: 'var(--bg-main)', padding: '14px', borderRadius: '6px', border: '1px solid var(--border-subtle)', marginBottom: '16px', fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Video Title: </span>
                  <strong>{uploadMetadata.title || selectedProject?.title}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Target Channel: </span>
                  <strong>{ytStatus?.channel_title || 'Authorized YouTube Channel'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Enforced Visibility: </span>
                  <span style={{ color: 'var(--accent-red)', fontWeight: 700 }}>PRIVATE (Never Public)</span>
                </div>
              </div>

              <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: '20px' }}>
                Are you sure you want to proceed with staging this video on YouTube? The video will be uploaded with visibility strictly locked to <strong>PRIVATE</strong>. It will not be scheduled or released to subscribers.
              </p>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setConfirmUploadModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ background: '#ef4444', borderColor: '#dc2626' }}
                  onClick={handleExecuteUpload}
                >
                  ✓ Confirm & Begin Private Upload
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
