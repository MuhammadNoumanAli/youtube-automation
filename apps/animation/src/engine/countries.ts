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
  // Phase 4d: computed from world-atlas 1:50m (centre of the main landmass, a few placed by hand) by a one-off script.
  france: { iso: '250', lon: 2.4, lat: 46.6, scale: 2550 },
  spain: { iso: '724', lon: -3.6, lat: 40.4, scale: 3250 },
  italy: { iso: '380', lon: 12.3, lat: 43.5, scale: 2600 },
  uk: { iso: '826', lon: -1.6, lat: 52.6, scale: 2200 },
  portugal: { iso: '620', lon: -8, lat: 39.7, scale: 4900 },
  poland: { iso: '616', lon: 19.4, lat: 52.1, scale: 3450 },
  sweden: { iso: '752', lon: 16.2, lat: 62.4, scale: 1100 },
  finland: { iso: '246', lon: 26.2, lat: 64.3, scale: 1350 },
  iceland: { iso: '352', lon: -18.6, lat: 65, scale: 4400 },
  ireland: { iso: '372', lon: -8.1, lat: 53.2, scale: 5000 },
  austria: { iso: '040', lon: 14.1, lat: 47.6, scale: 6750 },
  switzerland: { iso: '756', lon: 8.2, lat: 46.8, scale: 9000 },
  greece: { iso: '300', lon: 22.2, lat: 39.4, scale: 4750 },
  russia: { iso: '643', lon: 45, lat: 56, scale: 350 },
  ukraine: { iso: '804', lon: 31.3, lat: 49.2, scale: 2850 },
  czechia: { iso: '203', lon: 15.3, lat: 49.7, scale: 7650 },
  hungary: { iso: '348', lon: 19.4, lat: 47.2, scale: 7600 },
  romania: { iso: '642', lon: 25, lat: 45.8, scale: 4950 },
  bulgaria: { iso: '100', lon: 25.2, lat: 42.8, scale: 8000 },
  serbia: { iso: '688', lon: 20.8, lat: 44.2, scale: 5950 },
  croatia: { iso: '191', lon: 16, lat: 45.6, scale: 6450 },
  estonia: { iso: '233', lon: 25.8, lat: 58.7, scale: 8050 },
  latvia: { iso: '428', lon: 24.9, lat: 56.9, scale: 7150 },
  lithuania: { iso: '440', lon: 23.9, lat: 55.3, scale: 7400 },
  usa: { iso: '840', lon: -98, lat: 39.5, scale: 900 },
  canada: { iso: '124', lon: -100, lat: 56, scale: 550 },
  mexico: { iso: '484', lon: -102.2, lat: 23.9, scale: 1650 },
  brazil: { iso: '076', lon: -51, lat: -11, scale: 800 },
  argentina: { iso: '032', lon: -64.5, lat: -34.5, scale: 850 },
  colombia: { iso: '170', lon: -73.1, lat: 3.9, scale: 1950 },
  chile: { iso: '152', lon: -71, lat: -33, scale: 700 },
  peru: { iso: '604', lon: -74.4, lat: -9.1, scale: 1750 },
  venezuela: { iso: '862', lon: -66.2, lat: 7.1, scale: 2800 },
  cuba: { iso: '192', lon: -78.9, lat: 21.6, scale: 4800 },
  pakistan: { iso: '586', lon: 69.2, lat: 29.9, scale: 2100 },
  india: { iso: '356', lon: 79.5, lat: 22.8, scale: 1100 },
  bangladesh: { iso: '050', lon: 90.2, lat: 23.9, scale: 5150 },
  china: { iso: '156', lon: 103.3, lat: 36.8, scale: 750 },
  south_korea: { iso: '410', lon: 127.9, lat: 36.5, scale: 6100 },
  indonesia: { iso: '360', lon: 113, lat: -1.5, scale: 3800 },
  vietnam: { iso: '704', lon: 105.8, lat: 21, scale: 2100 },
  thailand: { iso: '764', lon: 101, lat: 15.1, scale: 2150 },
  philippines: { iso: '608', lon: 122, lat: 12.5, scale: 5200 },
  turkey: { iso: '792', lon: 35.4, lat: 39.1, scale: 2750 },
  uae: { iso: '784', lon: 54.3, lat: 23.9, scale: 8600 },
  israel: { iso: '376', lon: 35, lat: 31.3, scale: 7050 },
  egypt: { iso: '818', lon: 29.9, lat: 26.5, scale: 3000 },
  morocco: { iso: '504', lon: -8.7, lat: 29.8, scale: 1950 },
  algeria: { iso: '012', lon: 2.6, lat: 28.1, scale: 1600 },
  nigeria: { iso: '566', lon: 8.1, lat: 9.6, scale: 3350 },
  kenya: { iso: '404', lon: 37.8, lat: 0.6, scale: 3200 },
  ethiopia: { iso: '231', lon: 39.6, lat: 8.6, scale: 2800 },
  australia: { iso: '036', lon: 134.2, lat: -25.6, scale: 1000 },
  new_zealand: { iso: '554', lon: 175.5, lat: -39.5, scale: 3850 },
};
