/**
 * Parametric eye shapes for the original Countryball rig.
 * Countryballs have no mouths: emotion is carried by eye shape (lids) and body motion.
 */
export type Expression = 'neutral' | 'happy' | 'surprised' | 'angry' | 'sad' | 'determined';

export interface EyeParams {
  /** Multiplier on the eye ellipse size. */
  scale: number;
  /** Fraction of eye height removed from the top by the upper lid (0 = none). */
  topCut: number;
  /** Upper-lid tilt in degrees. Positive = inner corner lower (angry); negative = outer corner lower (sad). */
  topTilt: number;
  /** Fraction of eye height removed from the bottom by the lower lid (0 = none). */
  bottomCut: number;
}

export const EXPRESSIONS: Record<Expression, EyeParams> = {
  neutral: { scale: 1.0, topCut: 0.12, topTilt: 0, bottomCut: 0 },
  happy: { scale: 1.05, topCut: 0.0, topTilt: 0, bottomCut: 0.48 },
  surprised: { scale: 1.22, topCut: 0.0, topTilt: 0, bottomCut: 0 },
  angry: { scale: 1.0, topCut: 0.38, topTilt: 22, bottomCut: 0.05 },
  sad: { scale: 0.98, topCut: 0.3, topTilt: -20, bottomCut: 0 },
  determined: { scale: 0.95, topCut: 0.34, topTilt: 12, bottomCut: 0.12 },
};

export function blendEye(a: EyeParams, b: EyeParams, t: number): EyeParams {
  const m = (x: number, y: number) => x + (y - x) * t;
  return {
    scale: m(a.scale, b.scale),
    topCut: m(a.topCut, b.topCut),
    topTilt: m(a.topTilt, b.topTilt),
    bottomCut: m(a.bottomCut, b.bottomCut),
  };
}

type Pt = [number, number];

/** Keep the part of a polygon where nx*x + ny*y <= d (Sutherland–Hodgman, one plane). */
function clipHalfPlane(poly: Pt[], nx: number, ny: number, d: number): Pt[] {
  const out: Pt[] = [];
  const inside = (p: Pt) => nx * p[0] + ny * p[1] <= d;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i];
    const prev = poly[(i + poly.length - 1) % poly.length];
    const ci = inside(cur);
    const pi = inside(prev);
    if (ci !== pi) {
      const vp = nx * prev[0] + ny * prev[1] - d;
      const vc = nx * cur[0] + ny * cur[1] - d;
      const t = vp / (vp - vc);
      out.push([prev[0] + (cur[0] - prev[0]) * t, prev[1] + (cur[1] - prev[1]) * t]);
    }
    if (ci) out.push(cur);
  }
  return out;
}

/**
 * Builds an SVG path for one eye centred on (0,0).
 * side = -1 for the left eye, +1 for the right eye (mirrors the lid tilt).
 * blink: 0 = open, 1 = closed.
 */
export function eyePath(rx: number, ry: number, p: EyeParams, side: -1 | 1, blink: number): string {
  const sx = rx * p.scale;
  const sy = ry * p.scale * (1 - 0.92 * blink);
  const steps = 40;
  let poly: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    poly.push([Math.cos(a) * sx, Math.sin(a) * sy]);
  }
  const h = 2 * sy;
  if (p.topCut > 0.001) {
    // Line y = -sy + topCut*h, rotated by tilt around the eye centre line.
    const angle = ((p.topTilt * Math.PI) / 180) * -side; // inner corner faces the nose (towards x=0 of the face)
    const nx = Math.sin(angle);
    const ny = -Math.cos(angle);
    const d = -(-sy + p.topCut * h) * Math.cos(angle);
    poly = clipHalfPlane(poly, nx, ny, d);
  }
  if (p.bottomCut > 0.001 && poly.length > 2) {
    poly = clipHalfPlane(poly, 0, 1, sy - p.bottomCut * h);
  }
  if (poly.length < 3) {
    return `M ${-sx} 0 L ${sx} 0`;
  }
  return `M ${poly.map((q) => `${q[0].toFixed(2)} ${q[1].toFixed(2)}`).join(' L ')} Z`;
}
