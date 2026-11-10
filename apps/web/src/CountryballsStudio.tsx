import { useEffect, useMemo, useState } from 'react';

/**
 * Countryballs Studio: the form that turns structured data into a Countryballs video (Phase 4c).
 * Flow: fill the form -> projects are created with the script IN REVIEW -> a person approves the script ->
 * Render queues a background job -> the video waits in Render Review -> the usual private-upload gates.
 * Nothing here approves anything; approval stays on the existing Production Studio and Render Review screens.
 */

type SceneType = 'title-card' | 'map-intro' | 'map-focus' | 'dialogue';
type FormatId = 'short' | 'long_form' | 'both';

interface Options {
  countries: { id: string; name: string }[];
  voices: { id: string; label: string }[];
  default_narrator_voice: string;
  expressions: string[];
  scene_types: SceneType[];
  dialogue_settings: string[];
  formats: { id: FormatId; label: string }[];
  limits: { titleChars: number; sceneTitleChars: number; lineChars: number; castMax: number; scenesMax: number; linesPerSceneMax: number };
  animation: { appFound: boolean; appDir: string; studioRoot: string; fakeVoices: boolean };
}

interface CastRow {
  country: string;
  voice: string;
  speed: number;
}

interface LineRow {
  speaker: string;
  text: string;
  expression: string;
}

interface SceneRow {
  type: SceneType;
  title: string;
  subtitle: string;
  country: string;
  countries: string[];
  setting: string;
  lines: LineRow[];
}

interface FormState {
  title: string;
  format: FormatId;
  channel_profile_id: string;
  narrator_voice: string;
  cast: CastRow[];
  scenes: SceneRow[];
  description: string;
  tags: string;
}

interface ProjectLite {
  id: string;
  title: string;
  working_title: string;
  topic: string;
  format: 'long_form' | 'short';
  status: string;
  created_at: string;
}

interface CreatedProject {
  project_id: string;
  script_id: string;
  format: string;
  aspect: string;
  status: string;
  estimated_seconds: number;
}

interface Props {
  channels: { id: string; name: string }[];
  projects: ProjectLite[];
  onOpenProject: (projectId: string, tab: 'projects' | 'render' | 'upload') => void;
  onRefreshProjects: () => void;
  onFeedback: (msg: string) => void;
}

const SCENE_LABELS: Record<SceneType, string> = {
  'title-card': 'Title card',
  'map-intro': 'Map: zoom to one country',
  'map-focus': 'Map: several countries',
  dialogue: 'Dialogue (countryballs talk)',
};

const STATUS_HELP: Record<string, string> = {
  script_review: 'Approve the script',
  script_approved: 'Ready to render',
  ready_to_render: 'Queued',
  rendering: 'Rendering…',
  render_review: 'Review the video',
  render_approved: 'Approve upload',
  ready_to_upload: 'Ready for private upload',
  uploading: 'Uploading…',
  uploaded_private: 'Uploaded (private)',
  failed: 'Failed: check Jobs, then render again',
  assets_pending: 'Render rejected: render again',
};

const RENDERABLE = new Set(['script_approved', 'failed', 'render_review', 'assets_pending']);

const emptyLine = (speaker = 'narrator'): LineRow => ({ speaker, text: '', expression: '' });
const emptyScene = (type: SceneType = 'dialogue'): SceneRow => ({
  type,
  title: '',
  subtitle: '',
  country: '',
  countries: [],
  setting: 'countryside',
  lines: [emptyLine()],
});

const EXAMPLE: Omit<FormState, 'channel_profile_id'> = {
  title: 'Why the Netherlands is still dry',
  format: 'both',
  narrator_voice: 'am_michael',
  cast: [
    { country: 'netherlands', voice: 'af_heart', speed: 1.05 },
    { country: 'belgium', voice: 'am_puck', speed: 1 },
    { country: 'germany', voice: 'am_adam', speed: 1 },
  ],
  scenes: [
    {
      ...emptyScene('title-card'),
      title: 'Lower than the sea',
      lines: [
        { speaker: 'narrator', text: 'This country is lower than the sea right next to it.', expression: '' },
        { speaker: 'narrator', text: 'So how is it still dry?', expression: '' },
      ],
    },
    {
      ...emptyScene('map-intro'),
      country: 'netherlands',
      lines: [
        { speaker: 'narrator', text: 'Meet the Netherlands, by the North Sea.', expression: '' },
        { speaker: 'netherlands', text: 'Hallo! Much of my land lies below sea level.', expression: 'happy' },
      ],
    },
    {
      ...emptyScene('map-focus'),
      countries: ['netherlands', 'belgium', 'germany'],
      lines: [
        { speaker: 'belgium', text: 'Wait, your fields are under the water line?', expression: 'surprised' },
        { speaker: 'germany', text: 'And you are not worried at all?', expression: 'surprised' },
      ],
    },
    {
      ...emptyScene('dialogue'),
      countries: ['netherlands', 'germany'],
      setting: 'coast',
      lines: [
        { speaker: 'netherlands', text: 'We built dikes, pumps and a lot of windmills.', expression: 'determined' },
        { speaker: 'germany', text: 'Very efficient. I approve.', expression: 'happy' },
        { speaker: 'narrator', text: 'Dry feet, every single day.', expression: '' },
      ],
    },
  ],
  description: 'How the Netherlands stays dry below sea level, told by countryballs.',
  tags: 'countryballs, netherlands, geography, animation',
};

function errorText(body: unknown): string {
  const m = (body as { message?: unknown })?.message;
  if (Array.isArray(m)) return m.join(' • ');
  if (typeof m === 'string') return m.replace(/; /g, ' • ');
  return 'Request failed';
}

export function CountryballsStudio({ channels, projects, onOpenProject, onRefreshProjects, onFeedback }: Props) {
  const [options, setOptions] = useState<Options | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    title: '',
    format: 'both',
    channel_profile_id: '',
    narrator_voice: 'am_michael',
    cast: [{ country: 'netherlands', voice: 'af_heart', speed: 1 }],
    scenes: [{ ...emptyScene('title-card'), lines: [emptyLine('narrator')] }],
    description: '',
    tags: 'countryballs, geography, animation',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedProject[] | null>(null);
  const [busyProject, setBusyProject] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/countryballs/options')
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const o: Options = await r.json();
        setOptions(o);
        setForm((f) => ({ ...f, narrator_voice: o.default_narrator_voice }));
      })
      .catch((e) => setOptionsError(`Could not load Countryballs options (${e.message}). Is the API running with Phase 4b?`));
  }, []);

  useEffect(() => {
    if (!form.channel_profile_id && channels.length) setForm((f) => ({ ...f, channel_profile_id: channels[0].id }));
  }, [channels, form.channel_profile_id]);

  const cbProjects = useMemo(
    () =>
      projects
        .filter((p) => p.topic?.startsWith('Countryballs animation:'))
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
    [projects],
  );

  // While something is queued or rendering, refresh the project list so statuses move on their own.
  const anyActive = cbProjects.some((p) => p.status === 'ready_to_render' || p.status === 'rendering');
  useEffect(() => {
    if (!anyActive) return;
    const t = setInterval(onRefreshProjects, 8000);
    return () => clearInterval(t);
  }, [anyActive, onRefreshProjects]);

  const countryName = (id: string) => options?.countries.find((c) => c.id === id)?.name ?? id;
  const castIds = form.cast.map((c) => c.country).filter(Boolean);
  const lineMax = options?.limits.lineChars ?? 90;

  const update = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const updateCast = (i: number, patch: Partial<CastRow>) =>
    setForm((f) => ({ ...f, cast: f.cast.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const updateScene = (i: number, patch: Partial<SceneRow>) =>
    setForm((f) => ({ ...f, scenes: f.scenes.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const updateLine = (si: number, li: number, patch: Partial<LineRow>) =>
    setForm((f) => ({
      ...f,
      scenes: f.scenes.map((s, j) => (j === si ? { ...s, lines: s.lines.map((l, k) => (k === li ? { ...l, ...patch } : l)) } : s)),
    }));
  const moveScene = (i: number, dir: -1 | 1) =>
    setForm((f) => {
      const k = i + dir;
      if (k < 0 || k >= f.scenes.length) return f;
      const scenes = [...f.scenes];
      [scenes[i], scenes[k]] = [scenes[k], scenes[i]];
      return { ...f, scenes };
    });
  const toggleSceneCountry = (si: number, id: string) =>
    setForm((f) => ({
      ...f,
      scenes: f.scenes.map((s, j) =>
        j === si ? { ...s, countries: s.countries.includes(id) ? s.countries.filter((c) => c !== id) : [...s.countries, id] } : s,
      ),
    }));

  const loadExample = () => {
    setForm((f) => ({ ...EXAMPLE, channel_profile_id: f.channel_profile_id }));
    setErrors(null);
    setCreated(null);
  };

  const buildBody = () => ({
    title: form.title.trim(),
    format: form.format,
    ...(form.channel_profile_id ? { channel_profile_id: form.channel_profile_id } : {}),
    narrator_voice: form.narrator_voice,
    cast: form.cast.map((c) => ({ country: c.country, voice: c.voice, ...(c.speed !== 1 ? { speed: c.speed } : {}) })),
    scenes: form.scenes.map((s) => ({
      type: s.type,
      ...(s.type === 'title-card' || s.type === 'map-intro' ? (s.title.trim() ? { title: s.title.trim() } : {}) : {}),
      ...(s.type === 'title-card' || s.type === 'map-intro' ? (s.subtitle.trim() ? { subtitle: s.subtitle.trim() } : {}) : {}),
      ...(s.type === 'map-intro' && s.country ? { country: s.country } : {}),
      ...(s.type === 'map-focus' || s.type === 'dialogue' ? { countries: s.countries.filter((c) => castIds.includes(c)) } : {}),
      ...(s.type === 'dialogue' ? { setting: s.setting } : {}),
      lines: s.lines.map((l) => ({ speaker: l.speaker, text: l.text.trim(), ...(l.expression ? { expression: l.expression } : {}) })),
    })),
    ...(form.description.trim() ? { description: form.description.trim() } : {}),
    tags: form.tags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 15),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors(null);
    setCreated(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/countryballs/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBody()),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors(errorText(body));
        return;
      }
      setCreated(body.projects as CreatedProject[]);
      onFeedback(`Created ${body.projects.length} Countryballs project(s). Next: review and approve each script.`);
      onRefreshProjects();
    } catch (err) {
      setErrors(`Could not reach the API: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const startRender = async (projectId: string) => {
    setBusyProject(projectId);
    try {
      const res = await fetch(`/api/countryballs/projects/${projectId}/render`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) onFeedback(`Render not started: ${errorText(body)}`);
      else onFeedback('Render queued. Voices and animation run in the background (several minutes); the video then appears in Render Review.');
      onRefreshProjects();
    } finally {
      setBusyProject(null);
    }
  };

  if (optionsError) return <div className="alert-error">{optionsError}</div>;
  if (!options) return <div className="empty-state">Loading Countryballs options…</div>;

  const lineCount = form.scenes.reduce((n, s) => n + s.lines.length, 0);
  const speechSeconds = Math.round(
    form.scenes.reduce((t, s) => t + s.lines.reduce((u, l) => u + l.text.length / 14 + 0.4, 0) + 1.2, 1),
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: '24px', alignItems: 'start' }}>
      {/* LEFT: the form */}
      <form className="card" onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '18px', borderTop: '3px solid #ef4444' }}>
        <div className="card-header">
          <span className="card-title">New Countryballs video</span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button type="button" className="btn-secondary" onClick={loadExample} style={{ fontSize: '12px' }}>
              Load example
            </button>
          </div>
        </div>

        {!options.animation.appFound && (
          <div className="alert-error">
            Animation app not found at <code>{options.animation.appDir}</code>. Set ANIMATION_APP_DIR in .env. You can still create projects; rendering will fail until it is found.
          </div>
        )}
        {options.animation.fakeVoices && (
          <div className="alert-error">ANIMATION_FAKE_VOICES is on: renders use test tones and cannot be uploaded.</div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label>Video title</label>
            <input
              className="form-control"
              value={form.title}
              maxLength={options.limits.titleChars}
              onChange={(e) => update({ title: e.target.value })}
              placeholder="e.g. Why the Netherlands is still dry"
              required
            />
          </div>
          <div className="form-group">
            <label>Channel</label>
            <select className="form-control" value={form.channel_profile_id} onChange={(e) => update({ channel_profile_id: e.target.value })}>
              {channels.length === 0 && <option value="">Create a channel first</option>}
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-group">
          <label>Format</label>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {options.formats.map((f) => (
              <label
                key={f.id}
                style={{
                  display: 'flex',
                  gap: '6px',
                  alignItems: 'center',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: `1px solid ${form.format === f.id ? '#ef4444' : 'var(--border-subtle)'}`,
                  background: form.format === f.id ? 'rgba(239,68,68,0.08)' : 'transparent',
                  fontWeight: 500,
                }}
              >
                <input type="radio" name="cb-format" checked={form.format === f.id} onChange={() => update({ format: f.id })} />
                {f.label}
              </label>
            ))}
          </div>
        </div>

        {/* CAST */}
        <div className="form-group">
          <label style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Cast (countries and their voices)</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              Narrator voice:&nbsp;
              <select
                className="form-control"
                style={{ display: 'inline-block', width: 'auto', padding: '2px 6px', fontSize: '12px' }}
                value={form.narrator_voice}
                onChange={(e) => update({ narrator_voice: e.target.value })}
              >
                {options.voices.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {form.cast.map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                <select className="form-control" value={c.country} onChange={(e) => updateCast(i, { country: e.target.value })}>
                  {options.countries.map((o) => (
                    <option key={o.id} value={o.id} disabled={o.id !== c.country && castIds.includes(o.id)}>
                      {o.name}
                    </option>
                  ))}
                </select>
                <select className="form-control" value={c.voice} onChange={(e) => updateCast(i, { voice: e.target.value })}>
                  {options.voices.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
                <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Speed
                  <input
                    type="number"
                    className="form-control"
                    min={0.8}
                    max={1.25}
                    step={0.05}
                    value={c.speed}
                    onChange={(e) => updateCast(i, { speed: Number(e.target.value) || 1 })}
                  />
                </label>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={form.cast.length <= 1}
                  onClick={() => setForm((f) => ({ ...f, cast: f.cast.filter((_, j) => j !== i) }))}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            ))}
            {form.cast.length < Math.min(options.limits.castMax, options.countries.length) && (
              <button
                type="button"
                className="btn-secondary"
                style={{ alignSelf: 'flex-start', fontSize: '12px' }}
                onClick={() => {
                  const next = options.countries.find((o) => !castIds.includes(o.id));
                  if (next) setForm((f) => ({ ...f, cast: [...f.cast, { country: next.id, voice: 'am_puck', speed: 1 }] }));
                }}
              >
                + Add country
              </button>
            )}
          </div>
        </div>

        {/* SCENES */}
        <div className="form-group">
          <label style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Scenes</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
              {form.scenes.length} scene(s) • {lineCount} line(s) • about {speechSeconds}s
            </span>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {form.scenes.map((s, si) => (
              <div key={si} style={{ border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '12px' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                  <strong style={{ minWidth: '64px' }}>Scene {si + 1}</strong>
                  <select className="form-control" value={s.type} onChange={(e) => updateScene(si, { type: e.target.value as SceneType })}>
                    {options.scene_types.map((t) => (
                      <option key={t} value={t}>
                        {SCENE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-secondary" onClick={() => moveScene(si, -1)} disabled={si === 0} title="Move up">
                    ↑
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => moveScene(si, 1)} disabled={si === form.scenes.length - 1} title="Move down">
                    ↓
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={form.scenes.length <= 1}
                    onClick={() => setForm((f) => ({ ...f, scenes: f.scenes.filter((_, j) => j !== si) }))}
                    title="Remove scene"
                  >
                    ✕
                  </button>
                </div>

                {(s.type === 'title-card' || s.type === 'map-intro') && (
                  <div style={{ display: 'grid', gridTemplateColumns: s.type === 'map-intro' ? '1fr 1fr 1fr' : '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    {s.type === 'map-intro' && (
                      <select className="form-control" value={s.country} onChange={(e) => updateScene(si, { country: e.target.value })}>
                        <option value="">Country to show…</option>
                        {castIds.map((id) => (
                          <option key={id} value={id}>
                            {countryName(id)}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      className="form-control"
                      placeholder={s.type === 'title-card' ? 'Title (default: video title)' : 'Title (default: country name)'}
                      maxLength={options.limits.sceneTitleChars}
                      value={s.title}
                      onChange={(e) => updateScene(si, { title: e.target.value })}
                    />
                    <input
                      className="form-control"
                      placeholder="Subtitle (optional)"
                      maxLength={60}
                      value={s.subtitle}
                      onChange={(e) => updateScene(si, { subtitle: e.target.value })}
                    />
                  </div>
                )}

                {(s.type === 'map-focus' || s.type === 'dialogue') && (
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '8px', fontSize: '13px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{s.type === 'map-focus' ? 'Countries (2-4):' : 'On screen (1-3):'}</span>
                    {castIds.map((id) => (
                      <label key={id} style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                        <input type="checkbox" checked={s.countries.includes(id)} onChange={() => toggleSceneCountry(si, id)} />
                        {countryName(id)}
                      </label>
                    ))}
                    {s.type === 'dialogue' && (
                      <select className="form-control" style={{ width: 'auto' }} value={s.setting} onChange={(e) => updateScene(si, { setting: e.target.value })}>
                        {options.dialogue_settings.map((d) => (
                          <option key={d} value={d}>
                            Background: {d}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {s.lines.map((l, li) => {
                    const speakers = ['narrator', ...(s.type === 'dialogue' ? s.countries.filter((c) => castIds.includes(c)) : castIds)];
                    return (
                      <div key={li} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 120px auto', gap: '6px', alignItems: 'center' }}>
                        <select className="form-control" value={l.speaker} onChange={(e) => updateLine(si, li, { speaker: e.target.value })}>
                          {speakers.map((sp) => (
                            <option key={sp} value={sp}>
                              {sp === 'narrator' ? 'Narrator' : countryName(sp)}
                            </option>
                          ))}
                          {!speakers.includes(l.speaker) && <option value={l.speaker}>{countryName(l.speaker)} (not on screen)</option>}
                        </select>
                        <div style={{ position: 'relative' }}>
                          <input
                            className="form-control"
                            value={l.text}
                            maxLength={lineMax}
                            onChange={(e) => updateLine(si, li, { text: e.target.value })}
                            placeholder="What is said (one short sentence)"
                            required
                            style={{ paddingRight: '48px' }}
                          />
                          <span
                            style={{
                              position: 'absolute',
                              right: '8px',
                              top: '50%',
                              transform: 'translateY(-50%)',
                              fontSize: '10px',
                              color: l.text.length > lineMax - 10 ? '#f59e0b' : 'var(--text-muted)',
                            }}
                          >
                            {l.text.length}/{lineMax}
                          </span>
                        </div>
                        <select
                          className="form-control"
                          value={l.expression}
                          disabled={l.speaker === 'narrator'}
                          onChange={(e) => updateLine(si, li, { expression: e.target.value })}
                        >
                          <option value="">Expression…</option>
                          {options.expressions.map((x) => (
                            <option key={x} value={x}>
                              {x}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          className="btn-secondary"
                          disabled={s.lines.length <= 1}
                          onClick={() => updateScene(si, { lines: s.lines.filter((_, k) => k !== li) })}
                          title="Remove line"
                        >
                          ✕
                        </button>
                      </div>
                    );
                  })}
                  {s.lines.length < options.limits.linesPerSceneMax && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ alignSelf: 'flex-start', fontSize: '12px' }}
                      onClick={() => updateScene(si, { lines: [...s.lines, emptyLine(s.lines[s.lines.length - 1]?.speaker ?? 'narrator')] })}
                    >
                      + Add line
                    </button>
                  )}
                </div>
              </div>
            ))}
            {form.scenes.length < options.limits.scenesMax && (
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {options.scene_types.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '12px' }}
                    onClick={() => setForm((f) => ({ ...f, scenes: [...f.scenes, emptyScene(t)] }))}
                  >
                    + {SCENE_LABELS[t]}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
          <div className="form-group">
            <label>YouTube description (used at private upload)</label>
            <textarea className="form-control" rows={2} maxLength={5000} value={form.description} onChange={(e) => update({ description: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Tags (comma separated)</label>
            <input className="form-control" value={form.tags} onChange={(e) => update({ tags: e.target.value })} />
          </div>
        </div>

        {errors && (
          <div className="alert-error">
            <strong>Please fix:</strong> {errors}
          </div>
        )}

        <button type="submit" className="btn-primary" disabled={submitting || channels.length === 0} style={{ padding: '12px', fontWeight: 600, background: '#ef4444', borderColor: '#dc2626' }}>
          {submitting ? 'Creating…' : form.format === 'both' ? 'Create Short + Long projects' : 'Create project'}
        </button>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '-8px' }}>
          Creates the project(s) with the script waiting for your review. Nothing is approved, rendered or uploaded automatically.
        </div>
      </form>

      {/* RIGHT: what happens next + projects */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {created && (
          <div className="card" style={{ borderLeft: '4px solid var(--accent-green)' }}>
            <div className="card-header">
              <span className="card-title">Created</span>
              <span className="badge badge-success">{created.length} project(s)</span>
            </div>
            {created.map((p) => (
              <div key={p.project_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0' }}>
                <span>
                  {p.aspect === '9:16' ? 'Short 9:16' : 'Long 16:9'} • about {p.estimated_seconds}s
                </span>
                <button className="btn-primary" style={{ fontSize: '12px' }} onClick={() => onOpenProject(p.project_id, 'projects')}>
                  Review script →
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="card">
          <div className="card-header">
            <span className="card-title">Countryballs projects</span>
            <button className="btn-secondary" style={{ fontSize: '12px' }} onClick={onRefreshProjects}>
              Refresh
            </button>
          </div>
          {cbProjects.length === 0 ? (
            <div className="empty-state">No Countryballs projects yet. Fill in the form or click "Load example".</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {cbProjects.slice(0, 20).map((p) => (
                <div key={p.id} style={{ border: '1px solid var(--border-subtle)', borderRadius: '8px', padding: '10px 12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                    <strong style={{ fontSize: '13px' }}>{p.title}</strong>
                    <span className="badge">{p.format === 'short' ? '9:16' : '16:9'}</span>
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', margin: '4px 0 8px' }}>
                    {p.status} • {STATUS_HELP[p.status] ?? ''}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {p.status === 'script_review' && (
                      <button className="btn-primary" style={{ fontSize: '12px' }} onClick={() => onOpenProject(p.id, 'projects')}>
                        Review &amp; approve script
                      </button>
                    )}
                    {RENDERABLE.has(p.status) && (
                      <button className="btn-success" style={{ fontSize: '12px' }} disabled={busyProject === p.id} onClick={() => startRender(p.id)}>
                        {busyProject === p.id ? 'Queuing…' : p.status === 'script_approved' ? '▶ Render' : '↻ Render again'}
                      </button>
                    )}
                    {['render_review', 'render_approved', 'ready_to_upload', 'uploaded_private'].includes(p.status) && (
                      <button className="btn-secondary" style={{ fontSize: '12px' }} onClick={() => onOpenProject(p.id, p.status === 'render_review' ? 'render' : 'upload')}>
                        {p.status === 'render_review' ? 'Review video →' : 'Upload review →'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">How it works</span>
          </div>
          <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <li>Fill in the countries, voices and lines, then create the project(s).</li>
            <li>Review the script in Production Studio and approve it.</li>
            <li>Click Render: local voices (Kokoro) and the animation run in the background.</li>
            <li>Watch the video in Render Review and approve or reject it.</li>
            <li>Approve and start the upload. It always goes up as <strong>private</strong>.</li>
          </ol>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '10px', wordBreak: 'break-all' }}>
            Output folder: {options.animation.studioRoot}
          </div>
        </div>
      </div>
    </div>
  );
}
