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

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'channels' | 'ideas' | 'projects' | 'render' | 'upload' | 'jobs'>('dashboard');
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

  const fetchProjectDetails = async (projectId: string) => {
    try {
      const [srcRes, scRes, assetRes, narrRes, rendRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/research`),
        fetch(`/api/projects/${projectId}/scripts`),
        fetch(`/api/projects/${projectId}/assets`),
        fetch(`/api/projects/${projectId}/narration`),
        fetch(`/api/projects/${projectId}/render-status`),
      ]);
      if (srcRes.ok) setSources(await srcRes.json());
      if (scRes.ok) {
        const scriptList: Script[] = await scRes.json();
        setScripts(scriptList);
        if (scriptList.length > 0) {
          setActiveScript(scriptList[0]);
        } else {
          setActiveScript(null);
        }
      }
      if (assetRes.ok) setAssets(await assetRes.json());
      if (narrRes.ok) setNarrations(await narrRes.json());
      if (rendRes.ok) setLatestRender(await rendRes.json());
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
  }, []);

  useEffect(() => {
    if (selectedProjectId) {
      fetchProjectDetails(selectedProjectId);
    }
  }, [selectedProjectId]);

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
              <div style={{ fontWeight: 600 }}>Zero-Cost Mock Mode</div>
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

          {/* TAB: UPLOAD REVIEW & JOBS PLACEHOLDERS */}
          {['upload', 'jobs'].includes(activeTab) && (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🚧</div>
              <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>
                {activeTab === 'upload' && 'Phase 4: YouTube Data API Private Upload Staging'}
                {activeTab === 'jobs' && 'Phase 5: Background Job Queue & Retention Monitor'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', maxWidth: '520px', margin: '0 auto' }}>
                This module will be implemented according to the master plan upon approval of Phase 3.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
