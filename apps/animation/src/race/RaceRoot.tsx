import React from 'react';
import { AbsoluteFill, Composition, Series, useCurrentFrame } from 'remotion';
import { RACE_COUNTRIES } from './countries';
import { FONT } from './data';
import { RaceBall } from './RaceBall';
import { loadMeta } from './data';
import { IntroView, PodiumView } from './IntroPodium';
import { StageView } from './StageView';
import type { RaceMeta, RaceSegmentInfo } from './types';

/**
 * Remotion root for marble races. Separate entry point (src/race/index.ts), so the existing compositions in
 * src/Root.tsx are untouched. The replay folder written by race/simulate.mjs (<race folder>\replay) is the public dir:
 *
 *   RaceSegment  one segment (intro, one stage, or podium), chosen by the `segment` input prop.
 *                scripts/render-race.mjs renders these one by one and joins them: long races render in chunks
 *                that can be resumed.
 *   RaceFull     the whole race on one timeline, for previewing in Remotion Studio:
 *                npx remotion studio src/race/index.ts --public-dir <race folder>\replay
 */

type Props = { segment: number; meta: RaceMeta | null };

const Segment: React.FC<{ meta: RaceMeta; seg: RaceSegmentInfo }> = ({ meta, seg }) =>
  seg.kind === 'intro' ? <IntroView meta={meta} /> : seg.kind === 'podium' ? <PodiumView meta={meta} /> : <StageView meta={meta} file={seg.file} />;

const RaceSegment: React.FC<Props> = ({ segment, meta }) => {
  if (!meta) return <AbsoluteFill style={{ background: '#111' }} />;
  const seg = meta.segments[segment];
  if (!seg) throw new Error(`segment ${segment} does not exist (race has ${meta.segments.length})`);
  return <Segment meta={meta} seg={seg} />;
};

const RaceFull: React.FC<Props> = ({ meta }) => {
  if (!meta) return <AbsoluteFill style={{ background: '#111' }} />;
  return (
    <Series>
      {meta.segments.map((seg, i) => (
        <Series.Sequence key={i} durationInFrames={seg.frames} name={seg.kind === 'stage' ? `stage ${seg.index}` : seg.kind}>
          <Segment meta={meta} seg={seg} />
        </Series.Sequence>
      ))}
    </Series>
  );
};

const withMeta = async ({ props }: { props: Props }) => {
  const meta = props.meta ?? (await loadMeta());
  return { meta, fps: meta.fps, width: meta.width, height: meta.height };
};

/** Every country in the catalog with its flag ball: check flags before a race (no race folder needed). */
const RaceFlags: React.FC = () => {
  const frame = useCurrentFrame();
  const list = Object.values(RACE_COUNTRIES).sort((a, b) => a.continent.localeCompare(b.continent) || a.name.localeCompare(b.name));
  const cols = 18;
  const cw = 1920 / cols;
  const ch = 1080 / Math.ceil(list.length / cols);
  return (
    <AbsoluteFill style={{ background: '#1d2433' }}>
      <svg width={1920} height={1080}>
        {list.map((c, i) => {
          const x = (i % cols) * cw + cw / 2;
          const y = Math.floor(i / cols) * ch + ch * 0.4;
          return (
            <g key={c.id}>
              <RaceBall uid={`fl-${c.id}`} x={x} y={y} r={ch * 0.3} flag={c.flag} roll={0} frame={frame} fps={30} eyes={false} />
              <text x={x} y={y + ch * 0.48} textAnchor="middle" fontFamily={FONT} fontSize={12} fill="#fff">
                {c.name.length > 16 ? `${c.name.slice(0, 15)}…` : c.name}
              </text>
            </g>
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

/** Flag thumbnails for the race form (race/ui): one ball per cell, in the order of `ids`, transparent background. */
type SpriteProps = { ids: string[]; cell: number; cols: number };
const RaceFlagSprite: React.FC<SpriteProps> = ({ ids, cell, cols }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill>
      <svg width={cols * cell} height={Math.ceil(ids.length / cols) * cell}>
        {ids.map((id, i) => {
          const c = RACE_COUNTRIES[id];
          if (!c) return null;
          return (
            <RaceBall
              key={id}
              uid={`sp-${i}`}
              x={(i % cols) * cell + cell / 2}
              y={Math.floor(i / cols) * cell + cell / 2}
              r={cell * 0.44}
              flag={c.flag}
              roll={0}
              frame={frame}
              fps={30}
              eyes={false}
            />
          );
        })}
      </svg>
    </AbsoluteFill>
  );
};

export const RaceRoot: React.FC = () => (
  <>
    <Composition
      id="RaceFlagSprite"
      component={RaceFlagSprite}
      durationInFrames={1}
      fps={30}
      width={64}
      height={64}
      defaultProps={{ ids: [], cell: 64, cols: 20 } as SpriteProps}
      calculateMetadata={({ props }) => ({
        width: props.cols * props.cell,
        height: Math.max(1, Math.ceil(props.ids.length / props.cols)) * props.cell,
      })}
    />
    <Composition id="RaceFlags" component={RaceFlags} durationInFrames={30} fps={30} width={1920} height={1080} />
    <Composition
      id="RaceSegment"
      component={RaceSegment}
      durationInFrames={30}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ segment: 0, meta: null } as Props}
      calculateMetadata={async ({ props }) => {
        const m = await withMeta({ props });
        const seg = m.meta.segments[props.segment];
        if (!seg) throw new Error(`segment ${props.segment} does not exist (race has ${m.meta.segments.length})`);
        return { durationInFrames: seg.frames, fps: m.fps, width: m.width, height: m.height, props: { ...props, meta: m.meta } };
      }}
    />
    <Composition
      id="RaceFull"
      component={RaceFull}
      durationInFrames={30}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ segment: 0, meta: null } as Props}
      calculateMetadata={async ({ props }) => {
        const m = await withMeta({ props });
        return { durationInFrames: m.meta.totalFrames, fps: m.fps, width: m.width, height: m.height, props: { ...props, meta: m.meta } };
      }}
    />
  </>
);
