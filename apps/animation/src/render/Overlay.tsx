import React from 'react';
import { AbsoluteFill, interpolate, useVideoConfig } from 'remotion';
import type { BackgroundElement, Caption, CharacterDefinition } from '../engine/types';
import { Flag } from '../character/flags';

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, Helvetica, sans-serif";

/** Dialogue / narration captions, bottom-centre, readable at 1080p (46 px, high-contrast box). */
export const Captions: React.FC<{ captions: Caption[]; frame: number; characters: Record<string, CharacterDefinition> }> = ({
  captions,
  frame,
  characters,
}) => {
  const active = captions.filter((c) => frame >= c.from && frame < c.to && c.style !== 'speech');
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return (
    // Vertical (9:16): narrower box and raised above the Shorts/Reels UI. 16:9 layout unchanged.
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: vertical ? Math.round(height * 0.2) : 70, pointerEvents: 'none' }}>
      {active.map((c, i) => {
        const fadeIn = interpolate(frame, [c.from, c.from + 6], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const fadeOut = interpolate(frame, [c.to - 6, c.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const o = Math.min(fadeIn, fadeOut);
        const speaker = c.speaker ? characters[c.speaker] : undefined;
        return (
          <div
            key={`${c.from}-${i}`}
            style={{
              opacity: o,
              transform: `translateY(${(1 - fadeIn) * 14}px)`,
              maxWidth: Math.min(1500, width - 120),
              background: 'rgba(12, 14, 20, 0.78)',
              borderRadius: 20,
              padding: '18px 36px 22px',
              boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
              borderLeft: speaker ? `10px solid ${speaker.accent}` : '10px solid #9fb3c8',
              fontFamily: FONT,
              textAlign: 'left',
            }}
          >
            {speaker ? (
              <div style={{ color: speaker.accent, fontSize: 30, fontWeight: 800, letterSpacing: 0.5, marginBottom: 4 }}>
                {speaker.name}
              </div>
            ) : null}
            <div
              style={{
                color: '#ffffff',
                fontSize: 46,
                fontWeight: speaker ? 700 : 600,
                lineHeight: 1.25,
                fontStyle: speaker ? 'normal' : 'italic',
              }}
            >
              {c.text}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/**
 * Speech-bubble captions for roast battles: next to the speaking character (above it, or below when there is no
 * room), with the speaker's flag and name, typing out over the first part of the line. The box keeps its final size
 * from the first frame (the untyped rest is invisible), so it never jumps while typing.
 */
export const SpeechCaptions: React.FC<{
  captions: Caption[];
  frame: number;
  fps: number;
  characters: Record<string, CharacterDefinition>;
  /** Screen position of a character's ball: centre x, top y, bottom y. */
  anchor: (ref: string) => { x: number; top: number; bottom: number } | null;
  /** Refs of every character on screen, so the bubble can avoid covering any of them. */
  onScreen: string[];
}> = ({ captions, frame, fps, characters, anchor, onScreen }) => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  const active = captions.filter((c) => c.style === 'speech' && c.speaker && frame >= c.from && frame < c.to);
  const boxW = Math.round(vertical ? width * 0.78 : Math.min(820, width * 0.42));
  const font = vertical ? 50 : 44;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {active.map((c, i) => {
        const speaker = characters[c.speaker!];
        const a = anchor(c.speaker!);
        if (!speaker || !a) return null;
        const len = c.text.length;
        const revealFrames = Math.max(8, Math.min((c.to - c.from) * 0.8, (len / 28) * fps));
        const shown = Math.max(1, Math.ceil(len * Math.min(1, (frame - c.from + 1) / revealFrames)));
        const fadeOut = interpolate(frame, [c.to - 6, c.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const popIn = interpolate(frame, [c.from, c.from + 6], [0.85, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const estH = Math.ceil((len * font * 0.52) / (boxW - 60)) * font * 1.25 + font * 1.6;
        const gap = 34;
        // Keep clear of every ball: above the highest one, or below the lowest one when there is no room above.
        const all = onScreen.map((ref) => anchor(ref)).filter((v): v is NonNullable<typeof v> => v !== null);
        const highest = Math.min(...all.map((v) => v.top), a.top);
        const lowest = Math.max(...all.map((v) => v.bottom), a.bottom);
        const above = highest - gap - estH > height * 0.03;
        const top = above ? highest - gap - estH : Math.min(height - estH - height * 0.03, lowest + gap);
        const left = Math.max(30, Math.min(width - boxW - 30, a.x - boxW / 2));
        const tailX = Math.max(34, Math.min(boxW - 34, a.x - left));
        return (
          <div
            key={`${c.from}-${i}`}
            style={{
              position: 'absolute',
              left,
              top,
              width: boxW,
              opacity: fadeOut,
              transform: `scale(${popIn})`,
              transformOrigin: `${Math.max(20, Math.min(boxW - 20, a.x - left))}px ${above ? '100%' : '0%'}`,
              background: 'rgba(12, 14, 20, 0.84)',
              borderRadius: 22,
              padding: '14px 26px 18px',
              boxShadow: '0 8px 26px rgba(0,0,0,0.35)',
              border: `4px solid ${speaker.accent}`,
              fontFamily: FONT,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
              <svg width={font * 0.9} height={font * 0.9} viewBox="-1 -1 2 2" style={{ borderRadius: '50%', border: '2px solid #000', flexShrink: 0 }}>
                <defs>
                  <clipPath id={`sc-${c.from}-${i}`}>
                    <circle r={1} />
                  </clipPath>
                </defs>
                <g clipPath={`url(#sc-${c.from}-${i})`}>
                  <Flag r={1} flag={speaker.flag} uid={`sc-${c.from}-${i}`} />
                </g>
              </svg>
              <span style={{ color: speaker.accent, fontSize: font * 0.62, fontWeight: 800, letterSpacing: 0.5 }}>{speaker.name}</span>
            </div>
            <div style={{ color: '#ffffff', fontSize: font, fontWeight: 800, lineHeight: 1.22 }}>
              {c.text.slice(0, shown)}
              <span style={{ opacity: 0 }}>{c.text.slice(shown)}</span>
            </div>
            {/* tail pointing at the speaker */}
            <div
              style={{
                position: 'absolute',
                left: tailX - 18,
                [above ? 'bottom' : 'top']: -22,
                width: 0,
                height: 0,
                borderLeft: '18px solid transparent',
                borderRight: '18px solid transparent',
                [above ? 'borderTop' : 'borderBottom']: `22px solid ${speaker.accent}`,
              }}
            />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** Title cards ("title" background elements), drawn above the stage and outside the camera. */
export const Titles: React.FC<{ elements: BackgroundElement[]; frame: number }> = ({ elements, frame }) => {
  const { width } = useVideoConfig();
  return (
  <>
    {elements.map((el, i) => {
      if (el.type !== 'title' || frame < el.from || frame >= el.to) return null;
      const o = Math.min(
        interpolate(frame, [el.from, el.from + 12], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        interpolate(frame, [el.to - 12, el.to], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
      );
      const rise = interpolate(frame, [el.from, el.from + 18], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
      return (
        <AbsoluteFill key={i} style={{ alignItems: 'center', pointerEvents: 'none' }}>
          <div
            style={{
              position: 'absolute',
              top: el.y,
              opacity: o,
              transform: `translateY(${rise}px)`,
              textAlign: 'center',
              fontFamily: FONT,
              color: '#ffffff',
              textShadow: '0 4px 0 #0b2a45, 0 10px 30px rgba(0,0,0,0.45)',
              maxWidth: width - 120,
            }}
          >
            <div style={{ fontSize: 88, fontWeight: 900, letterSpacing: 1 }}>{el.text}</div>
            {el.subtitle ? <div style={{ fontSize: 40, fontWeight: 700, marginTop: 6 }}>{el.subtitle}</div> : null}
          </div>
        </AbsoluteFill>
      );
    })}
  </>
  );
};
