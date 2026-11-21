import React from 'react';
import { AbsoluteFill, Html5Audio, interpolate, random, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { Prop } from '../character/props';
import { character, FONT } from './data';
import { RaceBall } from './RaceBall';
import type { RaceMeta } from './types';

const BG = 'linear-gradient(160deg, #0f1b3d, #3b1d6e)';

/** Grid layout that fits n cells into a w x h box. */
function grid(n: number, w: number, h: number) {
  let s = Math.floor(Math.sqrt((w * h) / n));
  while (s > 10 && Math.floor(w / s) * Math.floor(h / s) < n) s--;
  const cols = Math.max(1, Math.floor(w / s));
  return { s, cols, rows: Math.ceil(n / cols) };
}

/** Opening: title, every competitor pops in, call to action. */
export const IntroView: React.FC<{ meta: RaceMeta }> = ({ meta }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const n = meta.competitors.length;
  const area = { x: 80, y: 250, w: 1760, h: 700 };
  const g = grid(n, area.w, area.h);
  const popSpan = Math.min(durationInFrames * 0.5, fps * 3);
  const titleO = interpolate(frame, [0, 10], [0, 1], { extrapolateRight: 'clamp' });
  const sfx = meta.sfx?.files ?? {};
  const offX = area.x + (area.w - g.cols * g.s) / 2;
  const offY = area.y + (area.h - g.rows * g.s) / 2;
  return (
    <AbsoluteFill style={{ background: BG }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        <g opacity={titleO}>
          <text x={960} y={130} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={84} fill="#ffd23f">
            {meta.title.toUpperCase()}
          </text>
          <text x={960} y={196} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={38} fill="#fff">
            {n} countries · {meta.stageCount} stages · only one wins
          </text>
        </g>
        {meta.competitors.map((id, i) => {
          const c = character(id);
          const appear = (i / n) * popSpan;
          const s = interpolate(frame - appear, [0, 6, 9], [0, 1.15, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const col = i % g.cols;
          const row = Math.floor(i / g.cols);
          const x = offX + col * g.s + g.s / 2;
          const y = offY + row * g.s + g.s * (g.s >= 80 ? 0.42 : 0.5);
          const r = g.s * (g.s >= 80 ? 0.32 : 0.4);
          return (
            <g key={id} transform={`translate(${x} ${y}) scale(${s}) translate(${-x} ${-y})`}>
              <RaceBall uid={`intro-${i}`} x={x} y={y} r={r} flag={c.flag} roll={0} expression="determined" frame={frame} fps={fps} />
              {g.s >= 80 ? (
                <text x={x} y={y + r + g.s * 0.2} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={Math.min(24, g.s * 0.17)} fill="#fff">
                  {c.name}
                </text>
              ) : null}
            </g>
          );
        })}
        <text
          x={960}
          y={1030}
          textAnchor="middle"
          fontFamily={FONT}
          fontWeight={800}
          fontSize={36}
          fill="#fff"
          opacity={interpolate(frame, [popSpan, popSpan + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        >
          Who will win? Pick your country in the comments!
        </text>
      </svg>
      {sfx.whoosh ? (
        <Sequence from={0} layout="none" name="sfx intro">
          <Html5Audio src={staticFile(sfx.whoosh)} volume={0.5} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

/** Ending: podium for the top three, confetti, the rest of the top ten. */
export const PodiumView: React.FC<{ meta: RaceMeta }> = ({ meta }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const top = meta.standings.slice(0, 3);
  const steps = [
    { place: 2, x: 560, h: 220, color: '#d9dde3' },
    { place: 1, x: 960, h: 320, color: '#ffd23f' },
    { place: 3, x: 1360, h: 160, color: '#d08a4e' },
  ];
  const floor = 860;
  const sfx = meta.sfx?.files ?? {};
  const rest = meta.standings.slice(3, 10);
  return (
    <AbsoluteFill style={{ background: BG }}>
      <svg width={1920} height={1080} viewBox="0 0 1920 1080">
        {/* confetti */}
        {Array.from({ length: 90 }, (_, i) => {
          const x = random(`cx${i}`) * 1920;
          const speed = 3 + random(`cs${i}`) * 5;
          const y = ((random(`cy${i}`) * 1200 + frame * speed) % 1200) - 100;
          const hue = Math.floor(random(`ch${i}`) * 360);
          return <rect key={i} x={x} y={y} width={10} height={16} fill={`hsl(${hue} 90% 60%)`} transform={`rotate(${frame * 6 + i * 20} ${x} ${y})`} opacity={0.85} />;
        })}
        <text x={960} y={120} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={80} fill="#ffd23f">
          CHAMPION: {character(meta.winner).name.toUpperCase()}
        </text>
        {steps.map((st) => {
          const entry = top[st.place - 1];
          if (!entry) return null;
          const c = character(entry.id);
          const delay = (3 - st.place) * 10;
          const s = interpolate(frame - delay, [0, 10, 14], [0, 1.12, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          const r = st.place === 1 ? 110 : 85;
          const by = floor - st.h - r;
          return (
            <g key={st.place}>
              <rect x={st.x - 170} y={floor - st.h} width={340} height={st.h} rx={14} fill={st.color} stroke="#141414" strokeWidth={4} />
              <text x={st.x} y={floor - st.h + 100} textAnchor="middle" fontFamily={FONT} fontWeight={900} fontSize={90} fill="#141414" opacity={0.75}>
                {st.place}
              </text>
              <g transform={`translate(${st.x} ${by}) scale(${s}) translate(${-st.x} ${-by})`}>
                <RaceBall uid={`pod-${st.place}`} x={st.x} y={by} r={r} flag={c.flag} roll={0} expression={st.place === 1 ? 'happy' : 'neutral'} frame={frame} fps={fps} />
                {st.place === 1 && frame > delay + 12 ? (
                  <Prop kind="crown" cx={st.x} cy={by} r={r} age={frame - delay - 12} frame={frame} facing={1} />
                ) : null}
              </g>
              <text x={st.x} y={floor + 52} textAnchor="middle" fontFamily={FONT} fontWeight={800} fontSize={38} fill="#fff">
                {c.name}
              </text>
            </g>
          );
        })}
        {rest.length ? (
          <text x={960} y={990} textAnchor="middle" fontFamily={FONT} fontWeight={600} fontSize={28} fill="#fff" opacity={0.85}>
            {rest.map((s) => `${s.place}. ${character(s.id).name}`).join('   ')}
          </text>
        ) : null}
        <text x={960} y={1046} textAnchor="middle" fontFamily={FONT} fontWeight={700} fontSize={28} fill="#ffd23f">
          Who should win the next race? Tell us in the comments!
        </text>
      </svg>
      {sfx.sparkle ? (
        <Sequence from={0} layout="none" name="sfx podium">
          <Html5Audio src={staticFile(sfx.sparkle)} volume={0.6} />
        </Sequence>
      ) : null}
      {sfx.ding ? (
        <Sequence from={20} layout="none" name="sfx champion">
          <Html5Audio src={staticFile(sfx.ding)} volume={0.6} />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};
