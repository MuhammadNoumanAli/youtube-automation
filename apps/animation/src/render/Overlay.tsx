import React from 'react';
import { AbsoluteFill, interpolate } from 'remotion';
import type { BackgroundElement, Caption, CharacterDefinition } from '../engine/types';

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, Helvetica, sans-serif";

/** Dialogue / narration captions, bottom-centre, readable at 1080p (46 px, high-contrast box). */
export const Captions: React.FC<{ captions: Caption[]; frame: number; characters: Record<string, CharacterDefinition> }> = ({
  captions,
  frame,
  characters,
}) => {
  const active = captions.filter((c) => frame >= c.from && frame < c.to);
  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 70, pointerEvents: 'none' }}>
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
              maxWidth: 1500,
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

/** Title cards ("title" background elements), drawn above the stage and outside the camera. */
export const Titles: React.FC<{ elements: BackgroundElement[]; frame: number }> = ({ elements, frame }) => (
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
