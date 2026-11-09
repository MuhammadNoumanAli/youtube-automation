/**
 * Map data per character, used by the map templates: Natural Earth / world-atlas country id, the point where the
 * ball stands (roughly the country's centre on land), and a map scale that frames the country nicely.
 * Add a row here when adding a character that should appear on maps.
 */
export interface CountryGeo {
  /** world-atlas id (ISO 3166-1 numeric, zero-padded string). */
  iso: string;
  lon: number;
  lat: number;
  /** d3 Mercator scale that frames the country in a 1080 px tall view. */
  scale: number;
}

export const COUNTRY_GEO: Record<string, CountryGeo> = {
  netherlands: { iso: '528', lon: 5.6, lat: 52.2, scale: 6000 },
  belgium: { iso: '056', lon: 4.6, lat: 50.6, scale: 8000 },
  germany: { iso: '276', lon: 10.4, lat: 51.1, scale: 2600 },
  denmark: { iso: '208', lon: 9.4, lat: 56.0, scale: 5000 },
  norway: { iso: '578', lon: 9.5, lat: 61.5, scale: 1500 },
  japan: { iso: '392', lon: 138.0, lat: 36.5, scale: 1700 },
};
