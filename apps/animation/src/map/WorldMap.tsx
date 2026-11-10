import React from 'react';
import { geoBounds, geoGraticule10, geoMercator, geoPath, GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
// Natural Earth countries (public domain), packaged as TopoJSON by world-atlas (ISC).
import countries50m from 'world-atlas/countries-50m.json';
import countries110m from 'world-atlas/countries-110m.json';

export interface Camera {
  /** [longitude, latitude] at the centre of the frame. */
  center: [number, number];
  /** d3 Mercator scale. ~305 shows the whole world across 1920 px. */
  scale: number;
}

type CountryProps = { name: string };
type Country = Feature<Geometry, CountryProps> & { bounds: [[number, number], [number, number]]; wraps: boolean };

function decode(topo: unknown): Country[] {
  const t = topo as Parameters<typeof feature>[0];
  const fc = feature(t, (t as any).objects.countries) as unknown as FeatureCollection<Geometry, CountryProps>;
  // Antarctica (010) is dropped: Mercator stretches it to infinity.
  return fc.features
    .filter((f) => String(f.id) !== '010')
    .map((f) => {
      const b = geoBounds(f as any) as [[number, number], [number, number]];
      return Object.assign(f, { bounds: b, wraps: b[0][0] > b[1][0] });
    });
}

// Decoded once per bundle, not per frame.
const DETAIL = decode(countries50m);
const COARSE = decode(countries110m);
/** Below this Mercator scale the 1:110m data is visually identical at 1080p and much cheaper. */
const COARSE_BELOW_SCALE = 700;

const GRATICULE = geoGraticule10();

export function makeProjection(camera: Camera, width: number, height: number): GeoProjection {
  // No clipExtent: d3's rectangle clipping produced saw-tooth artefacts on large polygons at the frame edge.
  // Off-screen geometry is culled by bounding box below and cropped by the SVG viewport.
  return geoMercator().center(camera.center).scale(camera.scale).translate([width / 2, height / 2]);
}

function visibleLonLat(projection: GeoProjection, width: number, height: number) {
  const pad = 80;
  const tl = projection.invert?.([-pad, -pad]) ?? [-180, 85];
  const br = projection.invert?.([width + pad, height + pad]) ?? [180, -85];
  return { west: tl[0], east: br[0], north: tl[1], south: br[1] };
}

export interface WorldMapProps {
  camera: Camera;
  width: number;
  height: number;
  /** ISO 3166-1 numeric id → highlight strength 0..1. */
  highlights: Record<string, number>;
  highlightColor: string;
  /** Optional per-country colours (id -> colour); falls back to highlightColor. */
  highlightColors?: Record<string, string>;
  /** Prefix for SVG ids, so two maps can be on screen at once (scene transitions). */
  uid?: string;
  /** Every country gets its own soft colour (political-map look). */
  fillAll?: boolean;
}

// Soft, distinct land colours for the political-map look (not blue: blue reads as sea).
const SOFT = ['#f3d9a4', '#c9e4b4', '#f2c4c4', '#d9cdee', '#f7e3b0', '#bfe3d6', '#f4cfa9', '#e2d4b7', '#d6e7a8', '#efc9de'];
const softFill = (id: string) => {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SOFT[h % SOFT.length];
};

const LAND = '#ece3cf';
const BORDER = '#8c7b5e';
const OCEAN_TOP = '#8ec3e6';
const OCEAN_BOTTOM = '#5f9fcc';

export const WorldMap: React.FC<WorldMapProps> = ({ camera, width, height, highlights, highlightColor, highlightColors, uid = 'map', fillAll = false }) => {
  const projection = makeProjection(camera, width, height);
  const path = geoPath(projection);
  const borderWidth = Math.min(2.2, Math.max(0.6, camera.scale / 900));
  const graticule = path(GRATICULE) ?? '';
  const source = camera.scale < COARSE_BELOW_SCALE ? COARSE : DETAIL;
  const v = visibleLonLat(projection, width, height);
  const worldWide = v.east - v.west >= 300;
  const visible = worldWide
    ? source
    : source.filter(
        (c) =>
          c.wraps ||
          (c.bounds[1][0] >= v.west && c.bounds[0][0] <= v.east && c.bounds[1][1] >= v.south && c.bounds[0][1] <= v.north),
      );
  const ids = Object.keys(highlights);

  return (
    <g>
      <defs>
        <linearGradient id={`${uid}-ocean`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={OCEAN_TOP} />
          <stop offset="100%" stopColor={OCEAN_BOTTOM} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill={`url(#${uid}-ocean)`} />
      <path d={graticule} fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={1} />
      <g stroke={BORDER} strokeWidth={borderWidth} strokeLinejoin="round">
        {visible.map((f) => {
          const d = path(f);
          if (!d) return null;
          return <path key={String(f.id)} d={d} fill={fillAll ? softFill(String(f.id ?? f.properties?.name ?? '')) : LAND} />;
        })}
      </g>
      {ids.map((id) => {
        const strength = highlights[id];
        if (!(strength > 0)) return null;
        const f = DETAIL.find((c) => String(c.id) === id);
        if (!f) return null;
        const d = path(f);
        if (!d) return null;
        return (
          <path
            key={`hl-${id}`}
            d={d}
            fill={highlightColors?.[id] ?? highlightColor}
            fillOpacity={0.75 * strength}
            stroke="#3b2b12"
            strokeWidth={borderWidth * (1 + strength)}
            strokeLinejoin="round"
          />
        );
      })}
    </g>
  );
};
