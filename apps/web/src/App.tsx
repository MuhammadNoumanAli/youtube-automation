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

export function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'channels' | 'ideas' | 'projects' | 'render' | 'upload' | 'jobs'>('dashboard');
  const [health, setHealth] = useState<HealthData | null>(null);
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const [hRes, sRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/settings/status'),
      ]);

      if (!hRes.ok || !sRes.ok) {
        throw new Error(`API responded with ${hRes.status} / ${sRes.status}`);
      }

      const hData = await hRes.json();
      const sData = await sRes.json();
      setHealth(hData);
      setSettings(sData);
      setApiError(null);
    } catch (err: any) {
      setApiError(err.message || 'Failed to reach API server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="app-sidebar">
        <div className="brand-header">
          <div className="brand-icon">▶</div>
          <div>
            <div className="brand-title">Studio</div>
            <div className="brand-subtitle">Automation v0.1.0</div>
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
              <span>📺</span> Channel Settings
            </button>
          </li>
          <li className={`nav-item ${activeTab === 'ideas' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('ideas')}>
              <span>💡</span> Ideas & Topics
              <span className="nav-badge">Phase 2</span>
            </button>
          </li>
          <li className={`nav-item ${activeTab === 'projects' ? 'active' : ''}`}>
            <button onClick={() => setActiveTab('projects')}>
              <span>🎬</span> Video Projects
              <span className="nav-badge">Phase 2</span>
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
              {activeTab === 'projects' && 'Video Project Lifecycle'}
              {activeTab === 'render' && 'FFmpeg Render Preview & Approval'}
              {activeTab === 'upload' && 'YouTube Private Upload Staging'}
              {activeTab === 'jobs' && 'Background Jobs & Audit Events'}
            </h1>
          </div>

          <div className="header-badges">
            {loading ? (
              <span className="status-badge warning">
                <span className="dot" />
                CONNECTING...
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
          {activeTab === 'dashboard' ? (
            <>
              {/* API Connection Banner if offline */}
              {apiError && (
                <div className="card" style={{ borderLeft: '4px solid var(--accent-amber)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <strong>Backend API Connecting:</strong> {apiError}
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Ensure NestJS backend is running via <code>npm run start:api</code> or on port 3000.
                      </div>
                    </div>
                    <button
                      onClick={fetchStatus}
                      style={{ padding: '6px 14px', background: 'var(--bg-surface-elevated)', borderRadius: '6px', color: 'var(--text-primary)' }}
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              {/* Grid Cards */}
              <div className="metrics-grid">
                {/* System Diagnostics */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">System Foundation</span>
                    <span className="badge-tag">Phase 1</span>
                  </div>
                  <div className="info-rows">
                    <div className="info-row">
                      <span className="info-label">Environment</span>
                      <span className="info-val">{health?.environment || 'development'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Database Connected</span>
                      <span className="info-val">
                        {health?.database.connected ? (
                          <span style={{ color: 'var(--accent-green)' }}>● {health.database.databaseName}</span>
                        ) : (
                          <span style={{ color: 'var(--accent-amber)' }}>○ Awaiting Start / Schema</span>
                        )}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Storage Access</span>
                      <span className="info-val">
                        {health?.storage.accessible ? (
                          <span style={{ color: 'var(--accent-green)' }}>● Verified ({health.storage.root})</span>
                        ) : (
                          <span style={{ color: 'var(--accent-amber)' }}>○ Checking</span>
                        )}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Node Runtime</span>
                      <span className="info-val">{health?.system.nodeVersion || 'Node.js 22 LTS'}</span>
                    </div>
                  </div>
                </div>

                {/* AI & Media Providers */}
                <div className="card">
                  <div className="card-header">
                    <span className="card-title">Provider Modular Stack</span>
                    <span className="badge-tag mock">Mock Mode Active</span>
                  </div>
                  <div className="info-rows">
                    <div className="info-row">
                      <span className="info-label">Text / Script Provider</span>
                      <span className="info-val">{settings?.providers.text.activeProvider.toUpperCase() || 'MOCK'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">TTS Narration</span>
                      <span className="info-val">{settings?.providers.tts.activeProvider.toUpperCase() || 'MOCK'}</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">FFmpeg Pipeline</span>
                      <span className="info-val">
                        {settings?.rendering.ffmpegConfigured ? 'Ready (Local)' : 'In PATH'}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">External Paid Calls</span>
                      <span className="info-val" style={{ color: 'var(--accent-green)' }}>
                        {settings?.features.externalApiCallsEnabled ? 'ENABLED' : 'DISABLED (Protected)'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Safety & Gate Status */}
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
                      <span className="info-val" style={{ color: 'var(--accent-green)' }}>Enforced</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Asset Provenance Gate</span>
                      <span className="info-val" style={{ color: 'var(--accent-green)' }}>Enforced</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* State Machine Visualization Card */}
              <div className="card">
                <div className="card-header">
                  <span className="card-title">17-Stage Video Project Lifecycle</span>
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Specification Architecture</span>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                  Every project progresses through strict automated checks and manual creator approval gates:
                </p>
                <div className="pipeline-stepper">
                  <div className="step-chip active-phase">1. idea</div>
                  <div className="step-chip">2. researching</div>
                  <div className="step-chip">3. script_draft</div>
                  <div className="step-chip">4. script_review</div>
                  <div className="step-chip">5. script_approved 🔒</div>
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
          ) : (
            <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
              <div style={{ fontSize: '32px', marginBottom: '12px' }}>🚧</div>
              <h2 style={{ fontSize: '18px', marginBottom: '8px' }}>Module Scheduled for Upcoming Phase</h2>
              <p style={{ color: 'var(--text-muted)', fontSize: '13.5px', maxWidth: '500px', margin: '0 auto' }}>
                This view is part of the phased roadmap in <code>PLAN.md</code>. It will be implemented following the completion and verification of Phase 1 foundation.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
