// The one shared state object. Presets keep their own settings under S[<preset id>]
// (filled from each preset's `defaults` by presets/index.js).
import { $ } from './util.js';

export const S = {
  buffer: null, A: null, all: [], seg: [], wave: null,
  preset: 'radar', visual: null, hide: [], embed: false,
  title: '', tag: 'PROD. ANX', key: 'G MIN', bpm: 134, offset: 0,
  startBar: 0, lenBars: 8, sens: 0.55, quant: 16,
  res: 1080, loops: 1, lead: 100, fps: 30,
  midi: null,   // a loaded melody MIDI (audio/midi.js), or null: the melody is guessed from the audio
  playing: false, recording: false, exporting: false, t0: 0, tau: 0, recT0: 0, recTotal: 0,
  frame: 0
};

export const barDur = () => 240 / S.bpm;
export const segStart = () => S.startBar * barDur() + S.offset / 1000;
export const segLen = () => S.lenBars * barDur();

export function status(text, s) { const el = $('status'); if (!el) return; el.textContent = text; el.dataset.s = s || 'ok'; }
