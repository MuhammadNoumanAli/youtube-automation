import type { CharacterDefinition } from './types';

/**
 * Character library. Original, code-drawn designs: only the flag pattern and an accent colour are data.
 * National flags are simplified geometric designs (src/character/flags.tsx); coats of arms and text are left out.
 */
export const CHARACTERS: Record<string, CharacterDefinition> = {
  netherlands: {
    id: 'netherlands',
    name: 'Netherlands',
    flag: { layout: 'h-stripes', colors: ['#ae1c28', '#ffffff', '#21468b'] },
    accent: '#f39c34',
  },
  belgium: {
    id: 'belgium',
    name: 'Belgium',
    flag: { layout: 'v-stripes', colors: ['#1a1a1a', '#fdda24', '#ef3340'] },
    accent: '#fdda24',
  },
  germany: {
    id: 'germany',
    name: 'Germany',
    flag: { layout: 'h-stripes', colors: ['#1a1a1a', '#dd0000', '#ffce00'] },
    accent: '#ffce00',
  },
  denmark: {
    id: 'denmark',
    name: 'Denmark',
    flag: { layout: 'nordic-cross', field: '#c8102e', cross: '#ffffff' },
    accent: '#ff6b6b',
  },
  norway: {
    id: 'norway',
    name: 'Norway',
    flag: { layout: 'nordic-cross', field: '#ba0c2f', cross: '#00205b', border: '#ffffff' },
    accent: '#7fb2ff',
  },
  japan: {
    id: 'japan',
    name: 'Japan',
    flag: { layout: 'disc', field: '#ffffff', disc: '#bc002d' },
    accent: '#ff8fa3',
  },
  // Phase 4d: more countries. Flags are original simplified drawings (no coats of arms, no text).
  france: { id: 'france', name: 'France', flag: {layout: 'v-stripes', colors: ['#0055a4', '#ffffff', '#ef4135']}, accent: '#4f8ff7' },
  spain: { id: 'spain', name: 'Spain', flag: {layout: 'h-stripes', colors: ['#aa151b', '#f1bf00', '#aa151b'], weights: [1, 2, 1]}, accent: '#f1bf00' },
  italy: { id: 'italy', name: 'Italy', flag: {layout: 'v-stripes', colors: ['#009246', '#ffffff', '#ce2b37']}, accent: '#3cb371' },
  uk: { id: 'uk', name: 'United Kingdom', flag: {layout: 'union'}, accent: '#e74c5b' },
  portugal: { id: 'portugal', name: 'Portugal', flag: {layout: 'v-stripes', colors: ['#046a38', '#da291c'], weights: [2, 3], emblem: {kind: 'ring', color: '#ffe000', x: -0.2, size: 0.34}}, accent: '#2ecc71' },
  poland: { id: 'poland', name: 'Poland', flag: {layout: 'h-stripes', colors: ['#ffffff', '#dc143c']}, accent: '#ff5c7a' },
  sweden: { id: 'sweden', name: 'Sweden', flag: {layout: 'nordic-cross', field: '#006aa7', cross: '#fecc00'}, accent: '#fecc00' },
  finland: { id: 'finland', name: 'Finland', flag: {layout: 'nordic-cross', field: '#ffffff', cross: '#002f6c'}, accent: '#9ec5ff' },
  iceland: { id: 'iceland', name: 'Iceland', flag: {layout: 'nordic-cross', field: '#02529c', cross: '#dc1e35', border: '#ffffff'}, accent: '#7fb2ff' },
  ireland: { id: 'ireland', name: 'Ireland', flag: {layout: 'v-stripes', colors: ['#169b62', '#ffffff', '#ff883e']}, accent: '#2ecc71' },
  austria: { id: 'austria', name: 'Austria', flag: {layout: 'h-stripes', colors: ['#ed2939', '#ffffff', '#ed2939']}, accent: '#ff6b6b' },
  switzerland: { id: 'switzerland', name: 'Switzerland', flag: {layout: 'cross', field: '#da291c', cross: '#ffffff', arm: 0.6}, accent: '#ff4d4d' },
  greece: { id: 'greece', name: 'Greece', flag: {layout: 'canton-stripes', stripes: ['#0d5eaf', '#ffffff'], count: 9, canton: '#0d5eaf', cantonW: 0.42, cantonH: 0.5555555555555556, emblem: {kind: 'cross', color: '#ffffff', size: 0.4}}, accent: '#5dade2' },
  russia: { id: 'russia', name: 'Russia', flag: {layout: 'h-stripes', colors: ['#ffffff', '#0039a6', '#d52b1e']}, accent: '#e74c3c' },
  ukraine: { id: 'ukraine', name: 'Ukraine', flag: {layout: 'h-stripes', colors: ['#0057b7', '#ffd700']}, accent: '#ffd700' },
  czechia: { id: 'czechia', name: 'Czechia', flag: {layout: 'hoist-triangle', colors: ['#ffffff', '#d7141a'], triangle: '#11457e', depth: 0.5}, accent: '#ff6b6b' },
  hungary: { id: 'hungary', name: 'Hungary', flag: {layout: 'h-stripes', colors: ['#ce2939', '#ffffff', '#477050']}, accent: '#58d68d' },
  romania: { id: 'romania', name: 'Romania', flag: {layout: 'v-stripes', colors: ['#002b7f', '#fcd116', '#ce1126']}, accent: '#fcd116' },
  bulgaria: { id: 'bulgaria', name: 'Bulgaria', flag: {layout: 'h-stripes', colors: ['#ffffff', '#00966e', '#d62612']}, accent: '#2ecc71' },
  serbia: { id: 'serbia', name: 'Serbia', flag: {layout: 'h-stripes', colors: ['#c6363c', '#0c4076', '#ffffff']}, accent: '#e74c3c' },
  croatia: { id: 'croatia', name: 'Croatia', flag: {layout: 'h-stripes', colors: ['#ff0000', '#ffffff', '#171796'], emblem: {kind: 'checker', color: '#ff0000', color2: '#ffffff', size: 0.3}}, accent: '#ff6b6b' },
  estonia: { id: 'estonia', name: 'Estonia', flag: {layout: 'h-stripes', colors: ['#0072ce', '#000000', '#ffffff']}, accent: '#5dade2' },
  latvia: { id: 'latvia', name: 'Latvia', flag: {layout: 'h-stripes', colors: ['#9e3039', '#ffffff', '#9e3039'], weights: [2, 1, 2]}, accent: '#c0392b' },
  lithuania: { id: 'lithuania', name: 'Lithuania', flag: {layout: 'h-stripes', colors: ['#fdb913', '#006a44', '#c1272d']}, accent: '#fdb913' },
  usa: { id: 'usa', name: 'USA', flag: {layout: 'canton-stripes', stripes: ['#b22234', '#ffffff'], count: 13, canton: '#3c3b6e', cantonW: 0.5, cantonH: 0.5384615384615384, emblem: {kind: 'star-grid', color: '#ffffff', size: 0.46, rows: 5, cols: 6}}, accent: '#e74c5b' },
  canada: { id: 'canada', name: 'Canada', flag: {layout: 'v-stripes', colors: ['#d80621', '#ffffff', '#d80621'], weights: [1, 2, 1], emblem: {kind: 'maple', color: '#d80621', size: 0.42}}, accent: '#ff4d4d' },
  mexico: { id: 'mexico', name: 'Mexico', flag: {layout: 'v-stripes', colors: ['#006847', '#ffffff', '#ce1126'], emblem: {kind: 'disc', color: '#9b6b3c', size: 0.16}}, accent: '#2ecc71' },
  brazil: { id: 'brazil', name: 'Brazil', flag: {layout: 'diamond', field: '#009c3b', diamond: '#ffdf00', disc: '#002776'}, accent: '#f7dc6f' },
  argentina: { id: 'argentina', name: 'Argentina', flag: {layout: 'h-stripes', colors: ['#74acdf', '#ffffff', '#74acdf'], emblem: {kind: 'sun', color: '#f6b40e', size: 0.2}}, accent: '#74acdf' },
  colombia: { id: 'colombia', name: 'Colombia', flag: {layout: 'h-stripes', colors: ['#fcd116', '#003893', '#ce1126'], weights: [2, 1, 1]}, accent: '#fcd116' },
  chile: { id: 'chile', name: 'Chile', flag: {layout: 'canton-stripes', stripes: ['#ffffff', '#d52b1e'], count: 2, canton: '#0039a6', cantonW: 0.36, cantonH: 0.5, emblem: {kind: 'star', color: '#ffffff', size: 0.2}}, accent: '#ff6b6b' },
  peru: { id: 'peru', name: 'Peru', flag: {layout: 'v-stripes', colors: ['#d91023', '#ffffff', '#d91023']}, accent: '#ff4d4d' },
  venezuela: { id: 'venezuela', name: 'Venezuela', flag: {layout: 'h-stripes', colors: ['#fcd116', '#00247d', '#cf142b']}, accent: '#fcd116' },
  cuba: { id: 'cuba', name: 'Cuba', flag: {layout: 'hoist-triangle', colors: ['#002a8f', '#ffffff', '#002a8f', '#ffffff', '#002a8f'], triangle: '#cf142b', depth: 0.48, emblem: {kind: 'star', color: '#ffffff', size: 0.2}}, accent: '#ff6b6b' },
  pakistan: { id: 'pakistan', name: 'Pakistan', flag: {layout: 'v-stripes', colors: ['#ffffff', '#01411c'], weights: [1, 3], emblem: {kind: 'crescent-star', color: '#ffffff', x: 0.2, size: 0.62}}, accent: '#2ecc71' },
  india: { id: 'india', name: 'India', flag: {layout: 'h-stripes', colors: ['#ff9933', '#ffffff', '#138808'], emblem: {kind: 'wheel', color: '#000080', size: 0.27}}, accent: '#ff9933' },
  bangladesh: { id: 'bangladesh', name: 'Bangladesh', flag: {layout: 'h-stripes', colors: ['#006a4e'], emblem: {kind: 'disc', color: '#f42a41', x: -0.1, size: 0.45}}, accent: '#2ecc71' },
  china: { id: 'china', name: 'China', flag: {layout: 'h-stripes', colors: ['#de2910'], emblem: {kind: 'star-cluster', color: '#ffde00', x: -0.45, y: -0.35, size: 0.26}}, accent: '#ff4d4d' },
  south_korea: { id: 'south_korea', name: 'South Korea', flag: {layout: 'h-stripes', colors: ['#ffffff'], emblem: {kind: 'taeguk', color: '#cd2e3a', color2: '#0047a0', size: 0.45}}, accent: '#ff8fa3' },
  indonesia: { id: 'indonesia', name: 'Indonesia', flag: {layout: 'h-stripes', colors: ['#ce1126', '#ffffff']}, accent: '#ff6b6b' },
  vietnam: { id: 'vietnam', name: 'Vietnam', flag: {layout: 'h-stripes', colors: ['#da251d'], emblem: {kind: 'star', color: '#ffcd00', size: 0.5}}, accent: '#ffcd00' },
  thailand: { id: 'thailand', name: 'Thailand', flag: {layout: 'h-stripes', colors: ['#a51931', '#f4f5f8', '#2d2a4a', '#f4f5f8', '#a51931'], weights: [1, 1, 2, 1, 1]}, accent: '#ff6b6b' },
  philippines: { id: 'philippines', name: 'Philippines', flag: {layout: 'hoist-triangle', colors: ['#0038a8', '#ce1126'], triangle: '#ffffff', depth: 0.6, emblem: {kind: 'sun', color: '#fcd116', size: 0.17}}, accent: '#fcd116' },
  turkey: { id: 'turkey', name: 'Turkey', flag: {layout: 'h-stripes', colors: ['#e30a17'], emblem: {kind: 'crescent-star', color: '#ffffff', x: -0.12, size: 0.62}}, accent: '#ff4d4d' },
  uae: { id: 'uae', name: 'UAE', flag: {layout: 'hoist-band', band: '#ff0000', bandWidth: 0.28, colors: ['#00732f', '#ffffff', '#000000']}, accent: '#2ecc71' },
  israel: { id: 'israel', name: 'Israel', flag: {layout: 'h-stripes', colors: ['#ffffff', '#0038b8', '#ffffff', '#0038b8', '#ffffff'], weights: [1, 1.2, 4.6, 1.2, 1], emblem: {kind: 'hexagram', color: '#0038b8', size: 0.3}}, accent: '#5dade2' },
  egypt: { id: 'egypt', name: 'Egypt', flag: {layout: 'h-stripes', colors: ['#ce1126', '#ffffff', '#000000'], emblem: {kind: 'disc', color: '#c09300', size: 0.13}}, accent: '#e6b422' },
  morocco: { id: 'morocco', name: 'Morocco', flag: {layout: 'h-stripes', colors: ['#c1272d'], emblem: {kind: 'pentagram-outline', color: '#006233', size: 0.42}}, accent: '#2ecc71' },
  algeria: { id: 'algeria', name: 'Algeria', flag: {layout: 'v-stripes', colors: ['#006233', '#ffffff'], emblem: {kind: 'crescent-star', color: '#d21034', x: 0.05, size: 0.55}}, accent: '#2ecc71' },
  nigeria: { id: 'nigeria', name: 'Nigeria', flag: {layout: 'v-stripes', colors: ['#008751', '#ffffff', '#008751']}, accent: '#2ecc71' },
  kenya: { id: 'kenya', name: 'Kenya', flag: {layout: 'h-stripes', colors: ['#000000', '#ffffff', '#bb0000', '#ffffff', '#006600'], weights: [6, 1, 6, 1, 6]}, accent: '#e74c3c' },
  ethiopia: { id: 'ethiopia', name: 'Ethiopia', flag: {layout: 'h-stripes', colors: ['#078930', '#fcdd09', '#da121a'], emblem: {kind: 'disc', color: '#0f47af', size: 0.3}}, accent: '#fcdd09' },
  australia: { id: 'australia', name: 'Australia', flag: {layout: 'union-canton', field: '#00008b', emblem: {kind: 'star', color: '#ffffff', x: 0.45, y: 0.3, size: 0.22}}, accent: '#f7dc6f' },
  new_zealand: { id: 'new_zealand', name: 'New Zealand', flag: {layout: 'union-canton', field: '#00247d', emblem: {kind: 'star', color: '#cc142b', x: 0.45, y: 0.25, size: 0.18}}, accent: '#ff6b6b' },
};

export function pickCharacters(...ids: string[]): CharacterDefinition[] {
  return ids.map((id) => {
    const c = CHARACTERS[id];
    if (!c) throw new Error(`Unknown character "${id}"`);
    return c;
  });
}
