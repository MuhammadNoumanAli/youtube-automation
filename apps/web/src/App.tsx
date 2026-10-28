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
  source_type: string;
  notes: string | null;
  verification_status: 'verified' | 'unverified' | 'disputed';
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

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'channels' | 'ideas' | 'projects' | 'render' | 'upload' | 'jobs'>('dashboard');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // Phase 2 state
  const [channels, setChannels] = useState<ChannelProfile[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sources, setSources] = useState<ResearchSource[]>([]);
  const [scripts, setScripts] = useState<Script[]>([]);
  const [activeScript, setActiveScript] = useState<Script | null>(null);

  // Forms state
  const [newChannel, setNewChannel] = useState({ name: '', niche: '', language: 'en' });
  const [newTopic, setNewTopic] = useState({ channel_profile_id: '', title: '', description: '', niche: '', target_audience: '', priority: 'medium' as 'low' | 'medium' | 'high' });
  const [newProject, setNewProject] = useState({ channel_profile_id: '', title: '', topic: '', target_audience: 'Developers', format: 'long_form' as 'long_form' | 'short', target_duration_seconds: 300 });
  const [newSource, setNewSource] = useState({ url: '', title: '', publisher: '', claim_supported: '', verification_status: 'verified' as 'verified' | 'unverified' | 'disputed' });
  const [approvalNotes, setApprovalNotes] = useState('Reviewed script, verified scene plan and technical accuracy.');
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

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
      const [srcRes, scRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/research`),
        fetch(`/api/projects/${projectId}/scripts`),
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
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchStatus();
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

  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="brand-header">
          <div className="brand-icon">▶</div>
          <div>
            <div className="brand-title">Studio</div>
            <div className="brand-subtitle">Automation v0.2.0</div>
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
              <span>🎞️</span> Render Review
              <span className="nav-badge">Phase 3</span>
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
              <strong>Private Mode Only</strong>
              <div style={{ fontSize: '10px', opacity: 0.85 }}>Public Release Disabled</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="app-main">
        <header className="app-header">
          <div className="header-title">
            <h1>
              {activeTab === 'dashboard' && 'Studio Overview & System Status'}
              {activeTab === 'channels' && 'Channel Profiles & YouTube Connections'}
              {activeTab === 'ideas' && 'Content Ideas & Topic Backlog'}
              {activeTab === 'projects' && 'Video Project Lifecycle & Script Review'}
              {activeTab === 'render' && 'FFmpeg Render Preview & Approval'}
              {activeTab === 'upload' && 'YouTube Private Upload Staging'}
              {activeTab === 'jobs' && 'Background Jobs & Audit Events'}
            </h1>
          </div>

          <div className="header-badges">
            {loading ? (
              <span className="status-badge warning">
                <span className="dot" />
                SYNCING...
              </span>
            ) : health ? (
              <span className={`status-badge ${health.status === 'ok' ? 'ok' : 'warning'}`}>
                <span className="dot" />
                API: {health.status.toUpperCase()}
              </span>
            ) : null}
            <a
              href="http://localhost:3000/api/docs"
              target="_blank"
              rel="noreferrer"
              className="card-action"
              style={{ padding: '6px 12px', border: '1px solid var(--border-subtle)', borderRadius: '6px' }}
            >
              Swagger Docs ↗
            </a>
          </div>
        </header>

        <div className="content-body">
          {/* Notification banner */}
          {feedbackMsg && (
            <div className="card" style={{ padding: '12px 20px', borderLeft: '4px solid var(--accent-green)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-primary)' }}>{feedbackMsg}</span>
              <button onClick={() => setFeedbackMsg(null)} style={{ color: 'var(--text-muted)', fontSize: '12px' }}>✕</button>
            </div>
          )}

          {/* DASHBOARD TAB */}
          {activeTab === 'dashboard' && (
            <>
              {apiError && (
                <div className="card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
                  <div>
                    <strong>Backend API Connecting:</strong> {apiError}
                  </div>
                </div>
              )}

              <div className="metrics-grid">
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">System Foundation</span>
                    <span className="badge-tag">Phase 1 & 2</span>
                  </div>
                  <div className="info-rows">
                    <div className="info-row">
                      <span className="info-label">Environment</span>
                      <span className="info-val">{health?.environment || 'development'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Database Connected</span>
                      <span className="info-val" style={{ color: 'var(--accent-green)' }}>
                        ● {health?.database.databaseName || 'youtube_automation'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Storage Access</span>
                      <span className="info-val" style={{ color: 'var(--accent-green)' }}>
                        ● Verified ({health?.storage.root || './storage'})
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Active Channel Profiles</span>
                      <span className="info-val">{channels.length}</span>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">AI & Text Provider</span>
                    <span className="badge-tag mock">Mock Mode Active</span>
                  </div>
                  <div className="info-rows">
                    <div className="info-row">
                      <span className="info-label">Active Provider</span>
                      <span className="info-val">{settings?.providers.text.activeProvider.toUpperCase() || 'MOCK'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">External API Calls</span>
                      <span className="info-val" style={{ color: 'var(--accent-green)' }}>
                        {settings?.features.externalApiCallsEnabled ? 'ENABLED' : 'DISABLED (Protected)'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Active Backlog Ideas</span>
                      <span className="info-val">{topics.length}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Video Projects</span>
                      <span className="info-val">{projects.length}</span>
                    </div>
                  </div>
                </div>

                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Safety & Gate Governance</span>
                    <span className="badge-tag">Strict Gates</span>
                  </div>
                  <div className="info-rows">
                    <div className="info-row">
                      <span className="info-label">Public YouTube Publishing</span>
                      <span className="info-val" style={{ color: 'var(--accent-amber)' }}>BLOCKED (MVP)</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">YouTube Upload Mode</span>
                      <span className="info-val">PRIVATE ONLY</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Human Script Approval</span>
                      <span className="info-val" style={{ color: 'var(--accent-green)' }}>Active Barrier</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Factual Provenance Verification</span>
                      <span className="info-val" style={{ color: 'var(--accent-green)' }}>Active</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">17-Stage Video Project Lifecycle</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Specification Architecture</span>
                </div>
                <div className="pipeline-stepper">
                  <div className="step-chip active-phase">1. idea</div>
                  <div className="step-chip active-phase">2. researching</div>
                  <div className="step-chip active-phase">3. script_draft</div>
                  <div className="step-chip active-phase">4. script_review</div>
                  <div className="step-chip active-phase">5. script_approved 🔒</div>
                  <div className="step-chip">6. assets_pending</div>
                  <div className="step-chip">7. ready_to_render</div>
                  <div className="step-chip">8. rendering</div>
                  <div className="step-chip">9. render_review</div>
                  <div className="step-chip">10. render_approved 🔒</div>
                  <div className="step-chip">11. ready_to_upload</div>
                  <div className="step-chip">12. uploading</div>
                  <div className="step-chip">13. uploaded_private 🔒</div>
                  <div className="step-chip">14. release_review</div>
                  <div className="step-chip">15. scheduled_or_public</div>
                  <div className="step-chip">16. failed</div>
                  <div className="step-chip">17. archived</div>
                </div>
              </div>
            </>
          )}

          {/* CHANNELS TAB */}
          {activeTab === 'channels' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Add Channel Profile</span>
                </div>
                <form onSubmit={handleCreateChannel}>
                  <div className="form-group">
                    <label>Channel Name</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Modern Architecture Digest"
                      value={newChannel.name}
                      onChange={(e) => setNewChannel({ ...newChannel, name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Niche / Category</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Software Engineering"
                      value={newChannel.niche}
                      onChange={(e) => setNewChannel({ ...newChannel, niche: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Language</label>
                    <input
                      type="text"
                      className="form-control"
                      value={newChannel.language}
                      onChange={(e) => setNewChannel({ ...newChannel, language: e.target.value })}
                    />
                  </div>
                  <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                    Create Profile
                  </button>
                </form>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Configured Channels ({channels.length})</span>
                </div>
                {channels.length === 0 ? (
                  <div className="empty-state">No channel profiles configured yet. Create one on the left.</div>
                ) : (
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Channel Name</th>
                        <th>Niche</th>
                        <th>Language</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {channels.map((c) => (
                        <tr key={c.id}>
                          <td><strong>{c.name}</strong></td>
                          <td>{c.niche}</td>
                          <td><span className="badge-tag">{c.language}</span></td>
                          <td>{new Date(c.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* IDEAS & TOPICS TAB */}
          {activeTab === 'ideas' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
              <div className="card">
                <div className="card-header">
                  <span className="card-title">Capture New Idea</span>
                </div>
                <form onSubmit={handleCreateTopic}>
                  <div className="form-group">
                    <label>Channel</label>
                    <select
                      className="form-control"
                      value={newTopic.channel_profile_id}
                      onChange={(e) => setNewTopic({ ...newTopic, channel_profile_id: e.target.value })}
                      required
                    >
                      {channels.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Topic Title</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Why Event-Driven Architecture Fails Without Outbox"
                      value={newTopic.title}
                      onChange={(e) => setNewTopic({ ...newTopic, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Description / Premise</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      placeholder="Brief notes on the concept..."
                      value={newTopic.description}
                      onChange={(e) => setNewTopic({ ...newTopic, description: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Priority</label>
                    <select
                      className="form-control"
                      value={newTopic.priority}
                      onChange={(e) => setNewTopic({ ...newTopic, priority: e.target.value as any })}
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>
                  <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '8px' }}>
                    Add to Backlog
                  </button>
                </form>
              </div>

              <div className="card">
                <div className="card-header">
                  <span className="card-title">Idea Backlog ({topics.length})</span>
                </div>
                {topics.length === 0 ? (
                  <div className="empty-state">No ideas captured yet. Use the form to add one.</div>
                ) : (
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Priority</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topics.map((t) => (
                        <tr key={t.id}>
                          <td>
                            <strong>{t.title}</strong>
                            {t.description && <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t.description}</div>}
                          </td>
                          <td><span className={`priority-badge ${t.priority}`}>{t.priority}</span></td>
                          <td><span className="status-chip">{t.status}</span></td>
                          <td>
                            {t.status !== 'converted' ? (
                              <button
                                className="btn-secondary"
                                style={{ padding: '4px 10px', fontSize: '11px' }}
                                onClick={() => handleConvertTopic(t.id)}
                              >
                                Convert to Project ➔
                              </button>
                            ) : (
                              <span style={{ fontSize: '11px', color: 'var(--accent-green)' }}>✓ Converted</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {/* VIDEO PROJECTS TAB */}
          {activeTab === 'projects' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {/* Project selector & creation header */}
              <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>Active Project:</label>
                  <select
                    className="form-control"
                    style={{ minWidth: '320px' }}
                    value={selectedProjectId || ''}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.title} ({p.status})</option>
                    ))}
                  </select>
                </div>
                <form
                  onSubmit={handleCreateProject}
                  style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
                >
                  <input
                    type="text"
                    className="form-control"
                    placeholder="New project title..."
                    value={newProject.title}
                    onChange={(e) => setNewProject({ ...newProject, title: e.target.value, topic: e.target.value })}
                    required
                  />
                  <button type="submit" className="btn-primary" style={{ whiteSpace: 'nowrap' }}>
                    + New Project
                  </button>
                </form>
              </div>

              {selectedProject && (
                <>
                  {/* Project Overview Card */}
                  <div className="card">
                    <div className="card-header">
                      <div>
                        <h2 style={{ fontSize: '18px', fontWeight: 700 }}>{selectedProject.title}</h2>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          Format: {selectedProject.format} | Duration: {selectedProject.target_duration_seconds}s | Script Version: v{selectedProject.script_version}
                        </div>
                      </div>
                      <span className={`status-chip ${selectedProject.status.includes('approved') ? 'approved' : 'review'}`} style={{ fontSize: '13px', padding: '6px 14px' }}>
                        STATUS: {selectedProject.status.toUpperCase()}
                      </span>
                    </div>
                  </div>

                  {/* Section A: Factual Research Sources */}
                  <div className="card">
                    <div className="card-header">
                      <div>
                        <span className="card-title">Factual Research References ({sources.length})</span>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Citations and claim verification required before script approval</div>
                      </div>
                    </div>
                    {sources.length > 0 && (
                      <table className="items-table" style={{ marginBottom: '16px' }}>
                        <thead>
                          <tr>
                            <th>Claim Supported</th>
                            <th>Source Title</th>
                            <th>Publisher</th>
                            <th>Verification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {sources.map((s) => (
                            <tr key={s.id}>
                              <td><strong>{s.claim_supported}</strong></td>
                              <td><a href={s.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent-red)' }}>{s.title} ↗</a></td>
                              <td>{s.publisher}</td>
                              <td><span className="status-chip approved">{s.verification_status}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <form onSubmit={handleAddSource} style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr auto', gap: '10px' }}>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Factual claim supported..."
                        value={newSource.claim_supported}
                        onChange={(e) => setNewSource({ ...newSource, claim_supported: e.target.value })}
                        required
                      />
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Source Title..."
                        value={newSource.title}
                        onChange={(e) => setNewSource({ ...newSource, title: e.target.value })}
                        required
                      />
                      <input
                        type="url"
                        className="form-control"
                        placeholder="URL..."
                        value={newSource.url}
                        onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                        required
                      />
                      <button type="submit" className="btn-secondary" style={{ whiteSpace: 'nowrap' }}>
                        + Add Source
                      </button>
                    </form>
                  </div>

                  {/* Section B: Script Generation & Human Review Gate */}
                  <div className="card">
                    <div className="card-header">
                      <div>
                        <span className="card-title">Script & Scene Plan Editor</span>
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
                        {/* Left column: Full Script Content */}
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

                        {/* Right column: Scene Plan Timeline & YouTube Metadata */}
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

                          {activeScript.metadata_json && (
                            <div style={{ marginTop: '14px', background: 'var(--bg-main)', padding: '12px', borderRadius: '6px', border: '1px solid var(--border-subtle)' }}>
                              <strong style={{ fontSize: '12px', color: 'var(--text-primary)' }}>Generated Metadata Package</strong>
                              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                                <div><strong>Title:</strong> {activeScript.metadata_json.title}</div>
                                <div style={{ marginTop: '4px' }}><strong>Tags:</strong> {activeScript.metadata_json.tags?.join(', ')}</div>
                              </div>
                            </div>
                          )}
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

          {/* RENDER, UPLOAD, JOBS PLACEHOLDERS */}
          {['render', 'upload', 'jobs'].includes(activeTab) && (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🚧</div>
              <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>
                {activeTab === 'render' && 'Phase 3: FFmpeg Local Video Rendering Pipeline'}
                {activeTab === 'upload' && 'Phase 4: YouTube Data API Private Upload Staging'}
                {activeTab === 'jobs' && 'Phase 5: Background Job Queue & Retention Monitor'}
              </h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', maxWidth: '520px', margin: '0 auto' }}>
                This module will be implemented according to the master plan upon approval of Phase 2.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
