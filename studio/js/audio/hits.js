// Hits inside the chosen section: snapped to the grid, given a pitch and note name, then handed to the preset.
import { S, barDur, segStart, segLen } from '../state.js';
import { $, clamp, mod } from '../util.js';
import { pitchAt, noteName } from './analysis.js';
import { current } from '../presets/index.js';
import { midiHits } from './midi.js';

/* hits: three bands, three layers (808/kick, melody, hats/perc) */
function pickBand(f, type, gap, out) {
  const A = S.A, n = A.nF, W = 14;
  const k = 1.7 - S.sens * 0.9, delta = 0.16 * (1 - S.sens) + 0.04;
  const cs = new Float64Array(n + 1); for (let i = 0; i < n; i++) cs[i + 1] = cs[i] + f[i];
  let last = -99;
  for (let i = 3; i < n - 3; i++) {
    const v = f[i];
    if (v < f[i - 1] || v < f[i - 2] || v < f[i - 3] || v <= f[i + 1] || v < f[i + 2] || v < f[i + 3]) continue;
    const a = Math.max(0, i - W), b = Math.min(n, i + W + 1), mean = (cs[b] - cs[a]) / (b - a);
    if (v < k * mean + delta || i - last < gap) continue;
    last = i;
    out.push({ i, t: i / A.frameRate, s: clamp(v, 0, 1), type, fc: type === 'high' ? A.centH[i] : 0, p: 0, note: '' });
  }
}
export function pickOnsets() {
  const A = S.A; if (!A) { S.all = []; return; }
  const out = [];
  pickBand(A.fluxL, 'low', 6, out); pickBand(A.fluxM, 'mid', 4, out); pickBand(A.fluxH, 'high', 3, out);
  out.sort((a, b) => a.t - b.t); S.all = out;
}

/* everything that depends on the section */
export function rebuild() {
  const A = S.A, bd = barDur();
  const totalBars = A ? Math.max(S.lenBars, Math.floor((A.dur - S.offset / 1000) / bd)) : 64;
  const maxStart = Math.max(0, totalBars - S.lenBars);
  const st = $('start'); if (st) { st.max = maxStart; }
  if (S.startBar > maxStart) S.startBar = maxStart;
  if (st) st.value = S.startBar;
  if ($('startOut')) $('startOut').textContent = S.startBar + 1;
  const ss = segStart(), sl = segLen();
  if ($('segHint')) $('segHint').textContent = `bars ${S.startBar + 1}–${S.startBar + S.lenBars} · ${sl.toFixed(2)} s`;
  if ($('segInfo')) $('segInfo').textContent = `${S.lenBars} bars · ${sl.toFixed(2)} s`;
  S.seg = [];
  if (!A) return;
  const q = S.quant ? bd / S.quant : 0, slots = new Map();
  for (const o of S.all) {
    let rt = o.t - ss;
    if (q) { if (o.type === 'low' && o.s < 0.22) continue; rt = Math.round(rt / q) * q; if (Math.abs(rt - sl) < 1e-6) rt = 0; }
    if (rt < -1e-6 || rt >= sl - 1e-6) continue;
    rt = Math.max(0, rt);
    if (!o.p && o.type !== 'high') o.p = pitchAt(A, o.i, o.type);
    o.note = o.type === 'high' ? '' : noteName(o.p);
    const hit = { ...o, rt };
    if (q) { const key = o.type + ':' + Math.round(rt / q), prev = slots.get(key); if (!prev || prev.s < hit.s) slots.set(key, hit); }
    else S.seg.push(hit);
  }
  if (q) S.seg = [...slots.values()].sort((a, b) => a.rt - b.rt);
  // with a MIDI loaded, its notes are the melody: they replace what the audio analysis guessed for it
  const mh = midiHits(ss, sl, A.frameRate);
  if (mh) S.seg = S.seg.filter(o => o.type !== 'mid').concat(mh).sort((a, b) => a.rt - b.rt);
  const p = current(); if (p && p.prepare) p.prepare(S.seg);
  buildWave();
}
export function buildWave() {
  const A = S.A, cols = 180, w = new Float32Array(cols);
  const i0 = Math.floor(segStart() * A.fsr), i1 = Math.floor((segStart() + segLen()) * A.fsr), per = Math.max(1, Math.floor((i1 - i0) / cols));
  let mx = 1e-6;
  for (let c = 0; c < cols; c++) { let m = 0; const a = i0 + c * per; for (let i = a; i < a + per; i += 4) { const v = Math.abs(A.s[i] || 0); if (v > m) m = v; } w[c] = m; if (m > mx) mx = m; }
  for (let c = 0; c < cols; c++) w[c] /= mx;
  S.wave = w;
}
export function autoSegment() {
  const A = S.A; if (!A) return;
  const bd = barDur(), total = Math.floor(A.dur / bd); let best = 0, bv = -1;
  for (let b = 0; b + S.lenBars <= total; b += 4) {
    const f0 = Math.floor((b * bd + S.offset / 1000) * A.frameRate), f1 = Math.floor(((b + S.lenBars) * bd + S.offset / 1000) * A.frameRate);
    let sum = 0; for (let f = Math.max(0, f0); f < Math.min(A.nF, f1); f++) sum += A.rmsN[f];
    const v = sum / Math.max(1, f1 - f0); if (v > bv + 0.004) { bv = v; best = b; }
  }
  S.startBar = best;
}
