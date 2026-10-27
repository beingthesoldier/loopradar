// The melody from a MIDI file. When one is loaded, its notes replace the melody the audio analysis guessed
// (which also picks up hats, snares and the 808), and every preset reads them as its melody hits, with the
// exact pitch, velocity and length. Kicks and hats still come from the audio.
//
// The file's beats are laid on the studio's own grid: beat 0 of the MIDI = bar 1 = the grid offset, at the
// studio's BPM. So a MIDI exported from the same FL project lines up with the audio. A short pattern
// (FL's piano roll export) can repeat through the song instead.
import { S } from '../state.js';
import { noteName } from './analysis.js';

const DRUMS = /drum|kick|snare|hat|perc|clap|808|bass|cymbal|crash|ride|tom|shaker|rim/i;

// Standard MIDI File → { ppq, tempo, tracks: [{ name, count }], notes: [{ tr, ch, n, v, b0, b1 }] } (b0/b1 in beats)
export function parseMidi(ab) {
  const b = new Uint8Array(ab), d = new DataView(ab), dec = new TextDecoder('utf-8');
  let p = -1;
  for (let i = 0; i + 4 <= b.length && i < 64; i++) if (b[i] === 0x4d && b[i + 1] === 0x54 && b[i + 2] === 0x68 && b[i + 3] === 0x64) { p = i; break; }   // 'MThd' (also inside RIFF/RMID)
  if (p < 0) throw new Error('not a MIDI file');
  const hl = d.getUint32(p + 4), ntr = d.getUint16(p + 10), div = d.getUint16(p + 12);
  if (div & 0x8000) throw new Error('this MIDI is timed in SMPTE frames, export it with beats (PPQ) instead');
  const ppq = div || 96; p += 8 + hl;
  const vlq = () => { let v = 0, c; do { c = b[p++]; v = v * 128 + (c & 0x7f); } while (c & 0x80 && p < b.length); return v; };
  const tracks = [], notes = []; let tempo = null;
  while (tracks.length < ntr && p + 8 <= b.length) {
    const id = String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]), len = d.getUint32(p + 4), end = Math.min(b.length, p + 8 + len);
    p += 8;
    if (id !== 'MTrk') { p = end; continue; }
    const tr = tracks.length, open = new Map(); let tick = 0, run = 0, name = '', count = 0, chans = new Set();
    const close = (o, t) => { notes.push({ tr, ch: o.ch, n: o.n, v: o.v, b0: o.t0 / ppq, b1: Math.max(o.t0 + 1, t) / ppq }); count++; };
    while (p < end) {
      tick += vlq();
      let st = b[p];
      if (st & 0x80) { p++; if (st < 0xf0) run = st; } else if (run) st = run; else break;   // running status
      if (st === 0xff) {
        const type = b[p++], l = vlq();
        if (type === 0x03 && !name) name = dec.decode(b.subarray(p, p + l)).trim();
        if (type === 0x51 && l === 3 && tempo === null) tempo = 60e6 / ((b[p] << 16) | (b[p + 1] << 8) | b[p + 2]);
        p += l; if (type === 0x2f) break; continue;
      }
      if (st === 0xf0 || st === 0xf7) { p += vlq(); continue; }
      const hi = st & 0xf0, ch = st & 0x0f;
      if (hi === 0x90 || hi === 0x80) {
        const n = b[p++], v = b[p++], key = ch * 128 + n; chans.add(ch);
        if (hi === 0x90 && v > 0) { if (open.has(key)) close(open.get(key), tick); open.set(key, { ch, n, v, t0: tick }); }
        else if (open.has(key)) { close(open.get(key), tick); open.delete(key); }
      } else p += (hi === 0xc0 || hi === 0xd0) ? 1 : 2;
    }
    for (const o of open.values()) close(o, tick);
    p = end;
    tracks.push({ name: name || `Track ${tr + 1}`, count, drums: chans.size === 1 && chans.has(9) });
  }
  if (!notes.length) throw new Error('no notes in this MIDI file');
  return { ppq, tempo, tracks, notes };
}

// what the studio keeps about the loaded file
export function useMidi(m, name) {
  const lastBeat = Math.max(...m.notes.map(o => o.b1)), bars = Math.max(1, Math.ceil(lastBeat / 4 - 1e-6));
  let loopBars = 1; while (loopBars < bars) loopBars *= 2;
  const tracks = m.tracks.map(t => ({ ...t, on: t.count > 0 && !t.drums && !DRUMS.test(t.name) }));
  if (!tracks.some(t => t.on)) tracks.forEach(t => { t.on = t.count > 0; });
  const songBars = S.buffer ? (S.buffer.duration - S.offset / 1000) / (240 / S.bpm) : 64;
  S.midi = { name, ...m, tracks, bars, loopBars, mode: bars <= 16 && songBars > bars * 2 ? 'loop' : 'song' };
  return S.midi;
}
export const clearMidi = () => { S.midi = null; };

// the MIDI's notes inside the section, as hits shaped like the audio's (type 'mid'), or null without a MIDI
export function midiHits(ss, sl, frameRate) {
  const m = S.midi; if (!m) return null;
  const spb = 60 / S.bpm, off = S.offset / 1000, loop = m.mode === 'loop' ? m.loopBars * 4 : 0;
  const b0 = (ss - off) / spb, b1 = b0 + sl / spb, out = [];
  for (const o of m.notes) {
    if (!m.tracks[o.tr] || !m.tracks[o.tr].on) continue;
    const k0 = loop ? Math.floor((b0 - o.b0) / loop) : 0, k1 = loop ? Math.ceil((b1 - o.b0) / loop) : 0;
    for (let k = k0; k <= k1; k++) {
      const beat = o.b0 + k * loop; if (beat < b0 - 1e-6 || beat >= b1 - 1e-6) continue;
      const t = off + beat * spb, p = 440 * 2 ** ((o.n - 69) / 12);
      out.push({ i: Math.round(t * (frameRate || 100)) + o.n * 7, t, rt: Math.max(0, t - ss), s: 0.25 + 0.75 * o.v / 127, type: 'mid', fc: 0, p, note: noteName(p), mm: o.n, dur: (o.b1 - o.b0) * spb, midi: true, tr: o.tr });
    }
  }
  return out.sort((a, c) => a.rt - c.rt || a.mm - c.mm);
}
