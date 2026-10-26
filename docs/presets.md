# Writing a preset

A preset is one file in `studio/js/presets/`. It draws one frame of video at a given moment of the loop, using what the analysis found in the beat. The studio builds the preset's settings panel from its `controls` list, so a new preset needs no HTML.

## The shape of a preset

```js
import { S, segLen, barDur } from '../state.js';
import { ctx, W, H, u, cx, grain, spaced, MONO } from '../render/canvas.js';
import { mod, TAU, rgba, fmtT } from '../util.js';

const TIDE = {
  id: 'tide',                  // also the key of its settings: S.tide
  name: 'Tide',
  defaults: { pal: 'paper', lines: 3 },
  controls: [
    { key: 'pal',   label: 'Palette', type: 'choice', options: [['paper', 'paper'], ['night', 'night']], then: 'buildBG' },
    { key: 'lines', label: 'Lines',   type: 'range',  min: 1, max: 6, step: 1, format: v => String(v) }
  ],
  setup() { /* called when the frame size changes: make offscreen canvases, read W/H/u */ },
  buildBG() { /* optional: anything a `then: 'buildBG'` control needs to redo */ },
  prepare(seg) { /* optional: precompute per-hit data after the hits are read (angles, labels…) */ },
  draw(tau, F) { /* draw the whole frame for time tau (seconds into the section) */ }
};
export default TIDE;
```

Then register it in `studio/js/presets/index.js` and give it at least one visual in `assets/js/catalog.js`.

## What you get to draw with

- `tau`: seconds into the section, from 0 to `segLen()`. Anything that moves on its own should repeat a whole number of times per `segLen()`, so the video loops without a seam.
- `F`: the music right now. `F.slow` the smoothed loudness (breathing), `F.rmsN` the loudness, `F.low` the 808 and kick, `F.high` the hats, `F.db` the level.
- `S.seg`: every hit in the section. Each has `rt` (time in the section), `type` (`'low'` 808/kick, `'mid'` melody, `'high'` hats), `s` (strength 0–1), `p` (pitch in Hz) and `note` (like `Eb3`). The age of a hit at `tau` is `mod(tau - o.rt, segLen())`.
- `S.wave`: the section's waveform for a progress strip; `S.title`, `S.tag`, `S.key`, `S.bpm` for the labels.
- `S[<id>]`: the preset's own settings.
- Canvas helpers: `ctx`, size `W × H`, unit `u` (scales with the export size), centre `cx`, `grain(alpha)`, `spaced(text, x, y, letterSpacing, align)`.

## Controls

| type | fields | shows as |
| --- | --- | --- |
| `range` | `min`, `max`, `step`, optional `format(v)` | a slider with its value |
| `choice` | `options: [[value, text], …]` | words; the chosen one is underlined |
| `ink` | `swatches: [[hex or '', name, css?], …]` | colour dots plus a free colour picker |

`then` runs after a change: `'rebuild'` re-reads the hits (use it when `prepare` depends on the setting), any other string calls that method on the preset (`'buildBG'`, `'setup'`…).

A visual can hide settings that would turn it into a different visual: `hide: ['shape']` in its catalog entry.
