// Every visual on the site is a preset (the renderer) plus a starting look.
// Colours, palettes and the rest are settings inside the visual's studio, not separate visuals.
// `hide` lists settings (by key) that would turn this visual into a different one; the studio doesn't show them.
// The gallery reads this list; the studio applies `look` when opened with ?visual=<id>.
// `access`: 'free' (anyone can export it) or 'paid' (export needs an account with paid access; anyone can try it).

// how access reads on the site, and what full access costs (payments themselves aren't connected yet)
export const ACCESS_LABEL = { free: 'Free', paid: 'Full access' };
export const PRICE = '$5 a month';
export const accessLabel = v => ACCESS_LABEL[v.access === 'free' ? 'free' : 'paid'];

export const CATEGORIES = [
  { id: 'dark', name: 'Dark', note: 'Trap, rage, drill. Hard edges, hits you can see.' },
  { id: 'soft', name: 'Soft', note: 'Dreamcore, ambient, anything fragile.' },
  { id: 'botanical', name: 'Botanical', note: 'Melodic and airy. Things that grow and open.' },
  { id: 'graphic', name: 'Graphic', note: 'Maps, diagrams, type. Clean lines that keep time.' }
];

export const VISUALS = [
  {
    id: 'radar', title: 'Radar', category: 'dark', preset: 'radar', access: 'free',
    line: 'Hits as targets on a scope',
    about: 'A scope that sweeps once per bar. Every hit lands as a target: its angle is its place in the bar, its distance from the centre is its pitch.',
    look: { preset: 'radar', quant: 16, radar: { tint: 'bone', sweepBars: 1, persist: 1.5, glitch: 0.35 } },
    hide: [],
    posterAt: 3.9
  },
  {
    id: 'orb', title: 'Orb', category: 'soft', preset: 'veil', access: 'free',
    line: 'A sphere of points that breathes',
    about: 'A sphere of points that breathes with the loudness. Kicks send slow rings across its surface.',
    look: { preset: 'veil', veil: { shape: 'orb', pal: 'mist', ink: '', flow: 0.5, ripple: 0.6, haze: 0.55, detail: 1 } },
    hide: ['shape'],
    posterAt: 4.0
  },
  {
    id: 'halo', title: 'Halo', category: 'soft', preset: 'veil', access: 'paid',
    line: 'A ring of dust that thins and gathers',
    about: 'A sprayed ring of dust that thins and gathers as the loop goes round. Kicks run along it as a wave.',
    look: { preset: 'veil', veil: { shape: 'halo', pal: 'mist', ink: '', flow: 0.5, ripple: 0.6, haze: 0.5, detail: 1 } },
    hide: ['shape'],
    posterAt: 7.38
  },
  {
    id: 'cloud', title: 'Cloud', category: 'soft', preset: 'veil', access: 'paid',
    line: 'A loose sheet of points, drifting',
    about: 'A loose sheet of points with a dissolving edge, drifting like fabric in slow air.',
    look: { preset: 'veil', veil: { shape: 'cloud', pal: 'mist', ink: '', flow: 0.6, ripple: 0.5, haze: 0.6, detail: 1 } },
    hide: ['shape'],
    posterAt: 5.2
  },
  {
    id: 'lily', title: 'Lily', category: 'botanical', preset: 'bloom', access: 'paid',
    line: 'A lily set in type, closing and opening',
    about: 'A 3D lily set in characters that closes into a bud and opens again. Each melody note lights a petal; kicks send a pulse through the type.',
    look: { preset: 'bloom', bloom: { pal: 'meadow', view: 'three', tcase: 'typed', breath: 'mid', depth: 0.9, open: 0.6, pulse: 0.6, anatomy: 0.5, ghost: 0.45, grid: 1 } },
    hide: [],
    posterAt: 5.37
  },
  {
    id: 'metro', title: 'Metro', category: 'graphic', preset: 'metro', access: 'paid',
    line: 'The loop as a transit map',
    about: 'A transit map of the loop. The ring is the loop line and the clock; every melody note is a station on it, and the notes used most run their own lines out of town. Micro trams leave each station as its note plays, and the piano below plays along. Best with the melody as a MIDI.',
    look: { preset: 'metro', quant: 16, metro: { ring: 'circle', pal: 'paper', style: 'clean', trams: 0.5, labels: 'few' } },
    hide: [],
    posterAt: 4.2
  },
  {
    id: 'seismo', title: 'Seismograph', category: 'dark', preset: 'seismo', access: 'paid',
    line: 'The beat written by a seismograph',
    about: 'Three pens on running chart paper: the 808 and kick, the melody, the hats. Every hit is a tremor; a melody note rings faster the higher it is, with its name stamped over the peak.',
    look: { preset: 'seismo', quant: 16, seismo: { pal: 'carbon', speed: 'normal', gain: 1, notes: 'on' } },
    hide: [],
    posterAt: 3.3
  },
  {
    id: 'strings', title: 'Strings', category: 'soft', preset: 'strings', access: 'paid',
    line: 'Every hit plucks a string',
    about: 'A bass string for the kick and the 808, a string for each note of the melody, a thin one for the hats. Each hit plucks its string; it swings and rings out, slower for long notes.',
    look: { preset: 'strings', quant: 16, strings: { pal: 'linen', sustain: 1, swing: 1, labels: 'on' } },
    hide: [],
    posterAt: 3.15
  }
];

export const findVisual = id => VISUALS.find(v => v.id === id) || null;
