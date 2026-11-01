import React, { useMemo } from 'react';
import { geoGraticule10, geoMercator, geoPath, GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
// Natural Earth 1:50m countries (public domain), packaged as TopoJSON by world-atlas (ISC).
import countries50m from 'world-atlas/countries-50m.json';

export interface Camera {
  /** [longitude, latitude] at the centre of the frame. */
  center: [number, number];
  /** d3 Mercator scale. ~305 shows the whole world across 1920 px. */
  scale: number;
}

type CountryProps = { name: string };

// Decode once per bundle, not per frame. Antarctica (010) is dropped: Mercator stretches it to infinity.
const COUNTRIES = (() => {
  const topo = countries50m as unknown as Parameters<typeof feature>[0];
  const fc = feature(topo, (topo as any).objects.countries) as unknown as FeatureCollection<Geometry, CountryProps>;
  return fc.features.filter((f) => String(f.id) !== '010');
})();

const GRATICULE = geoGraticule10();

export function makeProjection(camera: Camera, width: number, height: number): GeoProjection {
  return geoMercator()
    .center(camera.center)
    .scale(camera.scale)
    .translate([width / 2, height / 2]);
  // No clipExtent: d3's rectangle clipping produced saw-tooth artefacts on large polygons at the frame edge.
  // The SVG viewport crops off-screen geometry instead.
}

export interface WorldMapProps {
  camera: Camera;
  width: number;
  height: number;
  /** ISO 3166-1 numeric id → highlight strength 0..1. */
  highlights: Record<string, number>;
  highlightColor: string;
}

const LAND = '#ece3cf';
const BORDER = '#8c7b5e';
const OCEAN_TOP = '#8ec3e6';
const OCEAN_BOTTOM = '#5f9fcc';

export const WorldMap: React.FC<WorldMapProps> = ({ camera, width, height, highlights, highlightColor }) => {
  const projection = makeProjection(camera, width, height);
  const path = geoPath(projection);
  // Thinner borders when zoomed out so the world view stays clean.
  const borderWidth = Math.min(2.2, Math.max(0.6, camera.scale / 900));
  const graticule = path(GRATICULE) ?? '';
  const ids = useMemo(() => Object.keys(highlights), [highlights]);

  return (
    <g>
      <defs>
        <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={OCEAN_TOP} />
          <stop offset="100%" stopColor={OCEAN_BOTTOM} />
        </linearGradient>
      </defs>
      <rect width={width} height={height} fill="url(#ocean)" />
      <path d={graticule} fill="none" stroke="#ffffff" strokeOpacity={0.22} strokeWidth={1} />
      <g stroke={BORDER} strokeWidth={borderWidth} strokeLinejoin="round">
        {COUNTRIES.map((f) => {
          const d = path(f);
          if (!d) return null;
          return <path key={String(f.id)} d={d} fill={LAND} />;
        })}
      </g>
      {ids.map((id) => {
        const f = COUNTRIES.find((c) => String(c.id) === id);
        const strength = highlights[id];
        if (!f || strength <= 0) return null;
        const d = path(f);
        if (!d) return null;
        return (
          <path
            key={`hl-${id}`}
            d={d}
            fill={highlightColor}
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
