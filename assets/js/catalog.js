// Every visual on the site is a preset plus a look (the settings that make it that visual).
// The gallery reads this list; the studio applies `look` when opened with ?visual=<id>.
// `look` uses the same keys as the studio's saved looks, so a look saved in the studio can be pasted here.

export const CATEGORIES = [
  { id: 'dark', name: 'Dark', note: 'Trap, rage, drill. Hard edges, hits you can see.' },
  { id: 'soft', name: 'Soft', note: 'Dreamcore, ambient, anything fragile.' },
  { id: 'botanical', name: 'Botanical', note: 'Melodic and airy. A lily set in type.' }
];

export const VISUALS = [
  {
    id: 'radar-bone', title: 'Radar — Bone', category: 'dark', preset: 'radar',
    about: 'A scope that sweeps once per bar. Every hit lands as a target: its angle is its place in the bar, its distance from the centre is its pitch.',
    look: { preset: 'radar', tint: 'bone', sweepBars: 1, persist: 1.5, glitch: 0.35, quant: 16 },
    posterAt: 3.9
  },
  {
    id: 'radar-ice', title: 'Radar — Ice', category: 'dark', preset: 'radar',
    about: 'The same scope in cold light, with a slower two-bar sweep and harder glitches on the 808.',
    look: { preset: 'radar', tint: 'ice', sweepBars: 2, persist: 2.2, glitch: 0.6, quant: 16 },
    posterAt: 7.4
  },
  {
    id: 'veil-orb', title: 'Veil — Orb', category: 'soft', preset: 'veil',
    about: 'A sphere of points that breathes with the loudness. Kicks send slow rings across its surface.',
    look: { preset: 'veil', veil: { shape: 'orb', pal: 'mist', ink: '', flow: 0.5, ripple: 0.6, haze: 0.55, detail: 1 } },
    posterAt: 4.0
  },
  {
    id: 'veil-halo', title: 'Veil — Halo', category: 'soft', preset: 'veil',
    about: 'A sprayed ring of dust that thins and gathers as the loop goes round.',
    look: { preset: 'veil', veil: { shape: 'halo', pal: 'rose', ink: '#a3213a', flow: 0.5, ripple: 0.6, haze: 0.5, detail: 1 } },
    posterAt: 7.38
  },
  {
    id: 'veil-cloud', title: 'Veil — Cloud', category: 'soft', preset: 'veil',
    about: 'A loose sheet of points with a dissolving edge, drifting like fabric.',
    look: { preset: 'veil', veil: { shape: 'cloud', pal: 'milk', ink: '', flow: 0.6, ripple: 0.5, haze: 0.6, detail: 1 } },
    posterAt: 5.2
  },
  {
    id: 'bloom-meadow', title: 'Bloom — Meadow', category: 'botanical', preset: 'bloom',
    about: 'A lily set in characters that closes into a bud and opens again. Each melody note lights a petal.',
    look: { preset: 'bloom', bloom: { pal: 'meadow', view: 'front', tcase: 'typed', breath: 'mid', depth: 0.9, open: 0.6, pulse: 0.6, anatomy: 0.5, ghost: 0.45, grid: 1 } },
    posterAt: 5.37
  },
  {
    id: 'bloom-peach', title: 'Bloom — Peach', category: 'botanical', preset: 'bloom',
    about: 'The lily turned three-quarters, stamens reaching out of the throat.',
    look: { preset: 'bloom', bloom: { pal: 'peach', view: 'three', tcase: 'typed', breath: 'slow', depth: 0.8, open: 0.6, pulse: 0.6, anatomy: 0.5, ghost: 0.5, grid: 1 } },
    posterAt: 7.16
  },
  {
    id: 'bloom-night', title: 'Bloom — Night', category: 'botanical', preset: 'bloom',
    about: 'The lily in the dark, for slower and heavier beats.',
    look: { preset: 'bloom', bloom: { pal: 'night', view: 'three', tcase: 'typed', breath: 'mid', depth: 0.9, open: 0.6, pulse: 0.7, anatomy: 0.55, ghost: 0.45, grid: 1 } },
    posterAt: 5.37
  }
];

export const findVisual = id => VISUALS.find(v => v.id === id) || null;
