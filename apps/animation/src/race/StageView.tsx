import React from 'react';
import { AbsoluteFill, Html5Audio, interpolate, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import type { Expression } from '../character/expressions';
import { character, FONT, useJson } from './data';
import { RaceBall } from './RaceBall';
import { COURSE, type RaceElement, type RaceMeta, type StageData } from './types';

const MEDAL = ['#ffd23f', '#d9dde3', '#d08a4e'];

/** One stage of the race: course, balls from the replay, leaderboard panel, banners and sound effects. */
export const StageView: React.FC<{ meta: RaceMeta; file: string }> = ({ meta, file }) => {
  const data = useJson<StageData>(file);
  if (!data) return null;
  return <StageInner meta={meta} data={data} />;
};

const StageInner: React.FC<{ meta: RaceMeta; data: StageData }> = ({ meta, data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.min(frame, data.frames - 1);
  const th = data.theme;
  const pos = (i: number, at = f) => {
    const t = data.tracks[i];
    const k = Math.max(0, Math.min(data.frames - 1, at)) * 3;
    return { x: t[k] / 2, y: t[k + 1] / 2, deg: t[k + 2] };
  };

  // who has finished by now, and in which place
  const place: Record<string, number> = {};
  const finishFrame: Record<string, number> = {};
  for (const e of data.events) if (e.type === 'finish' && e.frame <= f) {
    place[e.id] = e.place;
    finishFrame[e.id] = e.frame;
  }
  const finishedCount = Object.keys(place).length;
  const decided = data.decisionFrame >= 0 && f >= data.decisionFrame;
  const out = new Set(decided ? data.eliminated : []);
  const elimCount = data.eliminated.length;
  const qualifyCount = data.balls.length - elimCount;

  // danger zone: the unfinished balls furthest back (smallest y) right now
  const unfinished = data.balls.map((id, i) => ({ id, i, y: pos(i).y })).filter((b) => place[b.id] === undefined);
  const danger = decided ? data.eliminated : unfinished.sort((a, b) => a.y - b.y).slice(0, Math.max(elimCount, 3)).map((b) => b.id);
  const inDanger = new Set(f >= data.gateFrame ? danger.slice(0, elimCount) : []);

  // last pad/bumper hit per element (flash) and recent boosts (burst rings around the ball)
  const lastHit: Record<number, number> = {};
  const bursts: { id: string; age: number }[] = [];
  for (const e of data.events) {
    if (e.type !== 'boost' || e.frame > f) continue;
    lastHit[e.el] = e.frame;
    if (f - e.frame < 12) bursts.push({ id: e.id, age: f - e.frame });
  }
  const ballIndex: Record<string, number> = {};
  data.balls.forEach((id, i) => (ballIndex[id] = i));

  const sfx = meta.sfx?.files ?? {};
  let lastBoing = -99;
  const boings = data.events.flatMap((e) => {
    if (e.type !== 'boost' || !sfx.boing || e.frame - lastBoing < 6) return [];
    lastBoing = e.frame;
    return [e.frame];
  });
  let lastPop = -99;
  const pops = data.events.flatMap((e) => {
    if (e.type !== 'finish' || e.place === 1 || !sfx.pop) return [];
    if (e.frame - lastPop < 5) return [];
    lastPop = e.frame;
    return [e.frame];
  });

  return (
    <AbsoluteFill style={{ background: `linear-gradient(160deg, ${th.bg1}, ${th.bg2})` }}>
      <svg width={COURSE.width} height={COURSE.height} viewBox={`0 0 ${COURSE.width} ${COURSE.height}`}>
        <Backdrop data={data} />
        {data.elements.map((el, i) => (
          <Element key={i} el={el} kin={data.kin[i]?.[f]} wall={th.wall} accent={th.accent} flash={lastHit[i] !== undefined ? f - lastHit[i] : 99} />
        ))}
        {data.balls.map((id, i) => {
          const p = pos(i);
          const prev = pos(i, f - 2);
          const c = character(id);
          const expression: Expression = out.has(id)
            ? 'sad'
            : place[id] !== undefined
              ? 'happy'
              : inDanger.has(id)
                ? 'surprised'
                : 'determined';
          return (
            <RaceBall
              key={id}
              uid={`s${data.index}-${i}`}
              x={p.x}
              y={p.y}
              r={data.ballR}
              flag={c.flag}
              roll={p.deg}
              expression={expression}
              look={{ x: Math.max(-1, Math.min(1, (p.x - prev.x) / 6)), y: Math.max(-1, Math.min(1, (p.y - prev.y) / 10)) }}
              frame={frame}
              fps={fps}
            />
          );
        })}
        {/* boost bursts */}
        {bursts.map(({ id, age }, k) => {
          const p = pos(ballIndex[id]);
          return (
            <circle
              key={`b${k}`}
              cx={p.x}
              cy={p.y}
              r={data.ballR * (1.1 + age * 0.12)}
              fill="none"
              stroke="#fff36b"
              strokeWidth={3}
              opacity={1 - age / 12}
            />
          );
        })}
        {/* medals for the first three across the line */}
        {data.balls.map((id, i) => {
          const pl = place[id];
          if (pl === undefined || pl > 3) return null;
          const p = pos(i);
          const s = interpolate(f - finishFrame[id], [0, 8], [0, 1], { extrapolateRight: 'clamp' });
          const r = Math.max(11, data.ballR * 0.55);
          return (
            <g key={`m-${id}`} transform={`translate(${p.x + data.ballR * 0.8} ${p.y - data.ballR * 0.8}) scale(${s})`}>
              <circle r={r} fill={MEDAL[pl - 1]} stroke="#141414" strokeWidth={2} />
              <text y={r * 0.38} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={r * 1.1} fill="#141414">
                {pl}
              </text>
            </g>
          );
        })}
        {/* eliminated: pulsing red ring + name */}
        {decided
          ? data.balls.map((id, i) => {
              if (!out.has(id)) return null;
              const p = pos(i);
              const pulse = 1 + 0.12 * Math.sin((f - data.decisionFrame) / 3);
              const name = character(id).name;
              return (
                <g key={`o-${id}`}>
                  <circle cx={p.x} cy={p.y} r={(data.ballR + 7) * pulse} fill="none" stroke="#ff3b3b" strokeWidth={4} />
                  {/* in the tray the balls pile up and the tags would overlap; the banner names them anyway */}
                  {p.y < data.finishY - data.ballR ? <Tag x={p.x} y={p.y - data.ballR - 26} text={name.toUpperCase()} color="#ff3b3b" /> : null}
                </g>
              );
            })
          : null}
        <Panel meta={meta} data={data} f={f} place={place} danger={danger} decided={decided} finishedCount={finishedCount} qualifyCount={qualifyCount} />
        <TitleCard meta={meta} data={data} f={f} />
        {decided ? (
          data.index === meta.stageCount && data.qualified.length === 1 ? (
            <WinnerBanner data={data} f={f} />
          ) : (
            <EliminatedBanner data={data} f={f} />
          )
        ) : null}
      </svg>

      {sfx.whoosh ? (
        <Sequence from={Math.max(0, data.gateFrame - 4)} layout="none" name="sfx gate">
          <Html5Audio src={staticFile(sfx.whoosh)} volume={0.5} />
        </Sequence>
      ) : null}
      {data.events.map((e, k) =>
        e.type === 'finish' && e.place === 1 && sfx.ding ? (
          <Sequence key={`d${k}`} from={e.frame} layout="none" name="sfx winner">
            <Html5Audio src={staticFile(sfx.ding)} volume={0.6} />
          </Sequence>
        ) : e.type === 'eliminated' && sfx.sad ? (
          <Sequence key={`e${k}`} from={e.frame} layout="none" name="sfx eliminated">
            <Html5Audio src={staticFile(sfx.sad)} volume={0.6} />
          </Sequence>
        ) : null,
      )}
      {boings.map((fr) => (
        <Sequence key={`bo${fr}`} from={fr} layout="none" name="sfx boost">
          <Html5Audio src={staticFile(sfx.boing!)} volume={0.28} />
        </Sequence>
      ))}
      {pops.map((fr) => (
        <Sequence key={`p${fr}`} from={fr} layout="none" name="sfx finish">
          <Html5Audio src={staticFile(sfx.pop!)} volume={0.22} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// ------------------------------------------------------------------ course

const Backdrop: React.FC<{ data: StageData }> = ({ data }) => {
  const { x0, x1 } = COURSE;
  const y = data.finishY;
  const sq = 12;
  const n = Math.ceil((x1 - x0) / sq);
  return (
    <g>
      {/* faint grid */}
      {Array.from({ length: 19 }, (_, i) => (
        <line key={`v${i}`} x1={x0 + i * 80} y1={0} x2={x0 + i * 80} y2={1080} stroke="#fff" strokeOpacity={0.04} />
      ))}
      {Array.from({ length: 14 }, (_, i) => (
        <line key={`h${i}`} x1={x0} y1={i * 80} x2={x1} y2={i * 80} stroke="#fff" strokeOpacity={0.04} />
      ))}
      {/* tray + checkered finish line */}
      <rect x={x0} y={y} width={x1 - x0} height={1080 - y} fill="#000" opacity={0.18} />
      {Array.from({ length: n }, (_, i) => (
        <g key={i}>
          <rect x={x0 + i * sq} y={y - sq} width={sq} height={sq / 1} fill={i % 2 ? '#111' : '#fff'} opacity={0.85} />
          <rect x={x0 + i * sq} y={y} width={sq} height={sq / 1} fill={i % 2 ? '#fff' : '#111'} opacity={0.85} />
        </g>
      ))}
      <text x={x1 - 14} y={y - 20} textAnchor="end" fontFamily={FONT} fontWeight={900} fontSize={30} fill="#fff" opacity={0.85}>
        FINISH
      </text>
    </g>
  );
};

const capsule = (ax: number, ay: number, bx: number, by: number, r: number, color: string, opacity = 1, key?: React.Key) => (
  <g key={key} opacity={opacity}>
    <line x1={ax} y1={ay + 3} x2={bx} y2={by + 3} stroke="#000" strokeOpacity={0.3} strokeWidth={r * 2} strokeLinecap="round" />
    <line x1={ax} y1={ay} x2={bx} y2={by} stroke={color} strokeWidth={r * 2} strokeLinecap="round" />
  </g>
);

const Element: React.FC<{ el: RaceElement; kin: number | undefined; wall: string; accent: string; flash: number }> = ({ el, kin, wall, accent, flash }) => {
  const lit = flash < 6;
  switch (el.type) {
    case 'pad': {
      // jump pad: thick orange bar with a spring zigzag; flashes white when it launches a ball
      const [ax, ay] = el.a;
      const [bx, by] = el.b;
      const len = Math.hypot(bx - ax, by - ay);
      const n = Math.max(3, Math.round(len / 18));
      const ux = (bx - ax) / len;
      const uy = (by - ay) / len;
      const zig = Array.from({ length: n * 2 + 1 }, (_, i) => {
        const t = (i / (n * 2)) * len;
        const off = i % 2 ? -7 : -1;
        return `${(ax + ux * t + uy * off).toFixed(1)},${(ay + uy * t - ux * off).toFixed(1)}`;
      }).join(' ');
      return (
        <g>
          {capsule(ax, ay, bx, by, el.r + 1, lit ? '#ffffff' : '#ff8c1a')}
          <polyline points={zig} fill="none" stroke={lit ? '#ff8c1a' : '#fff1c2'} strokeWidth={2.5} strokeLinejoin="round" />
        </g>
      );
    }
    case 'bumper': {
      const s = lit ? 1.25 : 1;
      return (
        <g>
          <circle cx={el.c[0]} cy={el.c[1] + 2} r={el.r} fill="#000" opacity={0.3} />
          <circle cx={el.c[0]} cy={el.c[1]} r={el.r * s} fill={lit ? '#ffffff' : '#ff3d7f'} stroke="#141414" strokeWidth={2} />
          <circle cx={el.c[0]} cy={el.c[1]} r={el.r * 0.45 * s} fill={lit ? '#ff3d7f' : '#ffd1e1'} />
        </g>
      );
    }
    case 'wall':
      return capsule(el.a[0], el.a[1], el.b[0], el.b[1], el.r, wall);
    case 'peg':
      return (
        <g>
          <circle cx={el.c[0]} cy={el.c[1] + 2} r={el.r} fill="#000" opacity={0.3} />
          <circle cx={el.c[0]} cy={el.c[1]} r={el.r} fill={accent} stroke="#141414" strokeWidth={2} />
        </g>
      );
    case 'spinner': {
      const base = ((kin ?? 0) / 10) * (Math.PI / 180);
      const arms = Array.from({ length: el.arms }, (_, i) => {
        const a = base + (i * Math.PI) / el.arms;
        const dx = Math.cos(a) * el.len;
        const dy = Math.sin(a) * el.len;
        return capsule(el.c[0] - dx, el.c[1] - dy, el.c[0] + dx, el.c[1] + dy, el.r, wall, 1, i);
      });
      return (
        <g>
          {arms}
          <circle cx={el.c[0]} cy={el.c[1]} r={el.r + 5} fill={accent} stroke="#141414" strokeWidth={2} />
        </g>
      );
    }
    case 'gate': {
      const closed = kin === 1;
      if (el.role === 'hopper') return closed ? capsule(el.a[0], el.a[1], el.b[0], el.b[1], el.r, accent) : null;
      if (el.role === 'trapdoor') {
        // shortcut trapdoor: yellow/black hazard stripes when shut, an open hole outline when it opens
        return closed ? (
          <g>
            {capsule(el.a[0], el.a[1], el.b[0], el.b[1], el.r, '#ffd400')}
            <line x1={el.a[0]} y1={el.a[1]} x2={el.b[0]} y2={el.b[1]} stroke="#141414" strokeWidth={el.r * 2} strokeDasharray="8 8" />
          </g>
        ) : (
          <line x1={el.a[0]} y1={el.a[1]} x2={el.b[0]} y2={el.b[1]} stroke="#ffd400" strokeWidth={2} strokeDasharray="4 6" opacity={0.7} />
        );
      }
      return capsule(el.a[0], el.a[1], el.b[0], el.b[1], el.r, closed ? '#ff4d4d' : '#4dff88', closed ? 1 : 0.25);
    }
  }
};

// ------------------------------------------------------------------ overlays

const Tag: React.FC<{ x: number; y: number; text: string; color: string; size?: number }> = ({ x, y, text, color, size = 20 }) => {
  const w = text.length * size * 0.62 + 22;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-size * 0.95} width={w} height={size * 1.5} rx={size * 0.75} fill="#141414" fillOpacity={0.85} stroke={color} strokeWidth={2.5} />
      <text y={size * 0.28} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={size} fill="#fff">
        {text}
      </text>
    </g>
  );
};

const TitleCard: React.FC<{ meta: RaceMeta; data: StageData; f: number }> = ({ meta, data, f }) => {
  const end = data.gateFrame + 18;
  if (f > end) return null;
  const o = interpolate(f, [0, 8, end - 10, end], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const dy = interpolate(f, [0, 10], [-30, 0], { extrapolateRight: 'clamp' });
  const cx = (COURSE.x0 + COURSE.x1) / 2;
  return (
    <g opacity={o} transform={`translate(0 ${dy})`}>
      <rect x={cx - 380} y={420} width={760} height={190} rx={28} fill="#141414" fillOpacity={0.86} stroke={data.theme.accent} strokeWidth={4} />
      <text x={cx} y={500} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={64} fill={data.theme.accent}>
        STAGE {data.index} / {meta.stageCount}
      </text>
      <text x={cx} y={566} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={40} fill="#fff">
        {data.name}
      </text>
    </g>
  );
};

const EliminatedBanner: React.FC<{ data: StageData; f: number }> = ({ data, f }) => {
  const age = f - data.decisionFrame;
  const s = interpolate(age, [0, 8], [0.6, 1], { extrapolateRight: 'clamp' });
  const o = interpolate(age, [0, 6], [0, 1], { extrapolateRight: 'clamp' });
  const shown = data.eliminated.slice(0, 6);
  const more = data.eliminated.length - shown.length;
  const cx = (COURSE.x0 + COURSE.x1) / 2;
  const w = Math.max(560, shown.length * 150 + 80);
  return (
    <g opacity={o} transform={`translate(${cx} 120) scale(${s})`}>
      <rect x={-w / 2} y={-70} width={w} height={more > 0 ? 210 : 180} rx={26} fill="#141414" fillOpacity={0.9} stroke="#ff3b3b" strokeWidth={4} />
      <text y={-18} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={46} fill="#ff3b3b">
        {data.timedOut ? 'TIME UP! ELIMINATED' : 'ELIMINATED'}
      </text>
      {shown.map((id, i) => {
        const x = (i - (shown.length - 1) / 2) * 150;
        const c = character(id);
        return (
          <g key={id}>
            <RaceBall uid={`elim-${data.index}-${i}`} x={x} y={36} r={24} flag={c.flag} roll={0} expression="sad" frame={f} fps={data.fps} />
            <text x={x} y={90} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={20} fill="#fff">
              {c.name.length > 13 ? `${c.name.slice(0, 12)}…` : c.name}
            </text>
          </g>
        );
      })}
      {more > 0 ? (
        <text y={124} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={22} fill="#ffb3b3">
          +{more} more
        </text>
      ) : null}
    </g>
  );
};

/** Last stage with a single survivor: crown the champion instead of listing the eliminated. */
const WinnerBanner: React.FC<{ data: StageData; f: number }> = ({ data, f }) => {
  const age = f - data.decisionFrame;
  const s = interpolate(age, [0, 8, 12], [0.5, 1.08, 1], { extrapolateRight: 'clamp' });
  const c = character(data.qualified[0]);
  const cx = (COURSE.x0 + COURSE.x1) / 2;
  return (
    <g transform={`translate(${cx} 300) scale(${s})`}>
      <rect x={-330} y={-200} width={660} height={330} rx={30} fill="#141414" fillOpacity={0.9} stroke="#ffd23f" strokeWidth={5} />
      <text y={-140} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={50} fill="#ffd23f">
        WE HAVE A WINNER!
      </text>
      <RaceBall uid={`winner-${data.index}`} x={0} y={-30} r={64} flag={c.flag} roll={0} expression="happy" frame={f} fps={data.fps} />
      <text y={88} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={48} fill="#fff">
        {c.name.toUpperCase()}
      </text>
    </g>
  );
};

const Panel: React.FC<{
  meta: RaceMeta;
  data: StageData;
  f: number;
  place: Record<string, number>;
  danger: string[];
  decided: boolean;
  finishedCount: number;
  qualifyCount: number;
}> = ({ meta, data, f, place, danger, decided, finishedCount, qualifyCount }) => {
  const X = COURSE.panelX;
  const W = 400;
  const accent = data.theme.accent;
  // Long titles must not run off the 400 px panel (e.g. "100 Countries Marble Race — 99 Stages").
  const header = meta.title.toUpperCase();
  const headerText = header.length > 32 ? `${header.slice(0, 31)}…` : header;
  const finishers = Object.entries(place).sort((a, b) => a[1] - b[1]);
  const rows: ([string, number] | null)[] =
    finishers.length <= 9 ? finishers : [...finishers.slice(0, 3), null, ...finishers.slice(-5)];
  const progress = Math.min(1, finishedCount / Math.max(1, qualifyCount));
  const row = (id: string, label: string, y: number, color: string, key: string, sad = false) => {
    const c = character(id);
    return (
      <g key={key}>
        <text x={X + 30} y={y + 8} fontFamily={FONT} fontWeight={800} fontSize={22} fill={color}>
          {label}
        </text>
        <RaceBall uid={`p-${data.index}-${key}`} x={X + 104} y={y} r={15} flag={c.flag} roll={0} eyes={false} frame={f} fps={data.fps} />
        <text x={X + 132} y={y + 8} fontFamily={FONT} fontWeight={600} fontSize={22} fill="#fff" opacity={sad ? 0.85 : 1}>
          {c.name.length > 17 ? `${c.name.slice(0, 16)}…` : c.name}
        </text>
      </g>
    );
  };
  return (
    <g>
      <rect x={X} y={20} width={W} height={1040} rx={24} fill="#0b0f19" fillOpacity={0.82} stroke="#fff" strokeOpacity={0.12} />
      <text x={X + 30} y={66} fontFamily={FONT} fontWeight={700} fontSize={20} fill="#fff" opacity={0.7}>
        {headerText}
      </text>
      <text x={X + 30} y={120} fontFamily={FONT} fontWeight={900} fontSize={46} fill={accent}>
        STAGE {data.index}/{meta.stageCount}
      </text>
      <text x={X + 30} y={156} fontFamily={FONT} fontWeight={600} fontSize={24} fill="#fff">
        {data.name}
      </text>
      <text x={X + 30} y={214} fontFamily={FONT} fontWeight={700} fontSize={18} fill="#fff" opacity={0.7}>
        IN THE RACE
      </text>
      <text x={X + 30} y={262} fontFamily={FONT} fontWeight={900} fontSize={50} fill="#fff">
        {decided ? qualifyCount : data.balls.length}
      </text>
      <text x={X + 210} y={214} fontFamily={FONT} fontWeight={700} fontSize={18} fill="#fff" opacity={0.7}>
        QUALIFIED
      </text>
      <text x={X + 210} y={262} fontFamily={FONT} fontWeight={900} fontSize={50} fill={accent}>
        {Math.min(finishedCount, qualifyCount)}/{qualifyCount}
      </text>
      <rect x={X + 30} y={282} width={W - 60} height={12} rx={6} fill="#fff" opacity={0.15} />
      <rect x={X + 30} y={282} width={(W - 60) * progress} height={12} rx={6} fill={accent} />

      <text x={X + 30} y={340} fontFamily={FONT} fontWeight={800} fontSize={22} fill="#fff" opacity={0.8}>
        FINISHED
      </text>
      {rows.map((r, i) =>
        r === null ? (
          <text key="gap" x={X + 104} y={384 + i * 44} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={22} fill="#fff" opacity={0.6}>
            ···
          </text>
        ) : (
          row(r[0], `#${r[1]}`, 376 + i * 44, r[1] <= 3 ? MEDAL[r[1] - 1] : '#fff', `f-${r[0]}`)
        ),
      )}

      <rect x={X + 16} y={790} width={W - 32} height={256} rx={18} fill="#ff3b3b" fillOpacity={decided ? 0.22 : 0.1} />
      <text x={X + 30} y={828} fontFamily={FONT} fontWeight={900} fontSize={24} fill="#ff6b6b">
        {decided ? 'ELIMINATED' : 'DANGER ZONE'}
      </text>
      {f >= data.gateFrame
        ? danger.slice(0, 5).map((id, i) => {
            const dead = decided || i < data.eliminated.length;
            return row(id, decided ? 'OUT' : dead ? '✕' : '!', 866 + i * 40, dead ? '#ff6b6b' : '#ffb347', `d-${id}`, true);
          })
        : null}
      {decided && data.eliminated.length > 5 ? (
        <text x={X + W - 30} y={828} textAnchor="end" fontFamily={FONT} fontWeight={700} fontSize={20} fill="#ffb3b3">
          {data.eliminated.length} out
        </text>
      ) : null}
    </g>
  );
};
