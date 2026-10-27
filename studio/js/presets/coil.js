// COIL: the beat's name, letter after letter, running along a coil of thin line, left to right along the front.
// The coil is several turns, one copy of the name on each. Closed, the turns lie on top of each other and the
// name reads once, in coloured tags (squares and circles); then it splits: the turns fly apart into a spring of
// several rings, one copy on each, and later fold back into one. It splits on the bar or on the 808. One ring
// keeps the tags; letters take them as they come round the back. Every 808 and kick pushes the letters along for
// half a second, harder the louder it hits, and melody notes pop tags.
// Two views: Solo is the coil alone; Desk puts it in a panel next to a piano roll of the melody (best with a
// MIDI loaded) and two small level readouts.
// Everything is worked out from the time since each hit, and the push is balanced so the letters travel a whole
// number of words per loop, so the video loops without a seam.
import { S, segLen, segStart, barDur } from '../state.js';
import { ctx, W, H, u, cx, grain, spaced, MONO } from '../render/canvas.js';
import { waveStrip, SAFE_TOP } from '../render/hud.js';
import { clamp, mod, TAU, pad } from '../util.js';

const HEL = '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif';
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// tags take their colours in turn; text on a tag is dark or light, whichever reads
const PALS = {
  paper: { bg: '#efeee9', panel: '#f6f5f1', edge: 'rgba(21,21,19,0.10)', ink: '#151513', mute: '#8b8a84', line: 'rgba(21,21,19,0.34)', dim: 'rgba(21,21,19,0.16)',
           tags: ['#12907e', '#6d4bd8', '#d6a21e', '#9b2f6e', '#2f4f6f'], note: '#151513', key: 'rgba(21,21,19,0.05)', grain: 0.03 },
  night: { bg: '#25272c', panel: '#2e3036', edge: 'rgba(238,236,230,0.10)', ink: '#efede7', mute: '#8d8b86', line: 'rgba(238,236,230,0.32)', dim: 'rgba(238,236,230,0.15)',
           tags: ['#2bb3a0', '#9478ff', '#f0bf3c', '#d0559a', '#7fa1c4'], note: '#efede7', key: 'rgba(238,236,230,0.045)', grain: 0.045 },
  clay:  { bg: '#e8e0d4', panel: '#f0e9df', edge: 'rgba(60,40,25,0.12)', ink: '#2a1f18', mute: '#8f7f70', line: 'rgba(42,31,24,0.34)', dim: 'rgba(42,31,24,0.16)',
           tags: ['#b5452f', '#5f7f4f', '#d39b3a', '#3e5a73', '#8a5a7a'], note: '#2a1f18', key: 'rgba(42,31,24,0.05)', grain: 0.035 },
  frost: { bg: '#e5eaee', panel: '#edf1f4', edge: 'rgba(20,35,50,0.10)', ink: '#14202c', mute: '#7d8a96', line: 'rgba(20,32,44,0.32)', dim: 'rgba(20,32,44,0.15)',
           tags: ['#2f6fb0', '#4fa39a', '#c9a227', '#c0566e', '#6b5fb5'], note: '#14202c', key: 'rgba(20,32,44,0.05)', grain: 0.03 },
  wine:  { bg: '#1c1013', panel: '#25161a', edge: 'rgba(255,225,230,0.09)', ink: '#f3e6e8', mute: '#9a7f84', line: 'rgba(243,230,232,0.28)', dim: 'rgba(243,230,232,0.13)',
           tags: ['#e0607e', '#e8b04a', '#7fc2b0', '#9a8cff', '#d9cfc6'], note: '#f3e6e8', key: 'rgba(243,230,232,0.04)', grain: 0.05 }
};
const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
const tagInk = (hex, pal) => lum(hex) > 0.6 ? '#151513' : '#ffffff';

const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);
const PUSH = 0.5;   // how long one hit keeps pushing, in seconds
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// The paths. t runs along the whole path, one turn per whole number (0..TURNS); sp is how far it has split.
// At sp = 0 every turn lies on the same loop, so the copies of the name sit exactly on top of each other and read
// as one; as sp grows the turns move apart. Returns a point in a unit box (y down, z towards the viewer) and a
// size for the letters there. Along the front (z > 0) every path runs left to right, so the letters read that way.
// back: where on a turn the back is; letters take and drop the tags there, out of sight.
// tilt: how far we look down on it, closed and split (a closed ring is seen more from above, so it reads round)
const TURNS = 4, LEAD = 1;   // turns of the path, and the turn that keeps the tags (second from the top)
const FORMS = {
  // a spring: the turns stack into rings
  coil: { back: 0.25, tilt: [0.8, 0.3], at: (t, sp) => { const c = t - TURNS / 2, R = 0.74 + 0.12 * Math.min(sp, 1), th = -TAU * t; return [R * Math.cos(th), sp * 0.44 * c, R * Math.sin(th), 1]; } },
  // a figure eight lying on its side that leans into depth; the turns pull apart sideways into a chain of loops
  eight: { back: 0.5, tilt: [0.42, 0.42], at: (t, sp) => { const c = t - TURNS / 2, s1 = Math.min(sp, 1), g = 1 - 0.5 * s1, a = TAU * t; return [g * 0.72 * Math.sin(a) + sp * 0.5 * c, (0.62 - 0.2 * s1) * Math.sin(2 * a), g * 0.55 * Math.cos(a), 1 - 0.2 * s1]; } },
  // a ring with a ripple running round it, like the rim of a glass; the turns stack like the coil's
  wave: { back: 0.75, tilt: [0.75, 0.32], at: (t, sp) => { const c = t - TURNS / 2, s1 = Math.min(sp, 1), R = 0.72 + 0.1 * s1, a = TAU * t; return [-R * Math.cos(a), (0.22 - 0.14 * s1) * Math.sin(TAU * 4 * t) + sp * 0.46 * c, R * Math.sin(a), 1]; } }
};
const sstep = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const back = x => { const c1 = 1.25, c3 = c1 + 1, y = x - 1; return x >= 1 ? 1 : 1 + c3 * y * y * y + c1 * y * y; };   // an ease that overshoots a little

const COIL = {
  id: 'coil', name: 'Coil',
  defaults: { view: 'solo', form: 'coil', pal: 'paper', push: 1, split: 'bars' },
  controls: [
    { key: 'form', label: 'Shape', type: 'choice', options: [['coil', 'coil'], ['eight', 'eight'], ['wave', 'wave']] },
    { key: 'split', label: 'Splits into rings', type: 'choice', options: [['bars', 'every other bar'], ['808', 'on the 808'], ['open', 'always'], ['one', 'never']] },
    { key: 'push', label: 'Push from 808 & kick', type: 'range', min: 0, max: 2, step: 0.01, format: v => v.toFixed(2) + '×', then: 'rebuild' },
    { key: 'pal', label: 'Colour', type: 'choice', options: [['paper', 'paper'], ['night', 'night'], ['clay', 'clay'], ['frost', 'frost'], ['wine', 'wine']] },
    { key: 'view', label: 'View', type: 'choice', options: [['solo', 'solo'], ['desk', 'desk']] }
  ],
  setup() {},

  prepare(seg) {
    const sl = segLen(), bd = barDur(), P = S.coil;
    this.lows = seg.filter(o => o.type === 'low').map(o => ({ rt: o.rt, s: o.s }));
    // the melody: MIDI notes when loaded (exact pitch and length), otherwise what the analysis heard
    // (with a MIDI loaded the studio has already swapped the audio's melody for the file's notes; each keeps its track)
    const ons = S.midi ? S.midi.tracks.map((t, i) => t.on ? i : -1).filter(i => i >= 0) : [];
    this.tracks = S.midi ? ons.map(i => S.midi.tracks[i].name) : [];
    const mids = seg.filter(o => o.type === 'mid' && (o.mm || o.p > 20)).map(o => ({ rt: o.rt, s: o.s, m: o.mm || Math.round(69 + 12 * Math.log2(o.p / 440)), dur: o.dur || 0, tr: o.midi ? Math.max(0, ons.indexOf(o.tr)) : -1 }));
    mids.sort((a, b) => a.rt - b.rt);
    mids.forEach((n, i) => { if (!n.dur) { const nx = mids[(i + 1) % mids.length]; const gap = mids.length > 1 ? mod(nx.rt - n.rt, sl) || sl : bd / 2; n.dur = clamp(gap * 0.9, bd / 16, bd / 2); } n.tag = i; });
    this.mids = mids;
    // the push from each hit adds A·strength letters of travel; the steady flow tops it up to whole laps
    this.A = 0.6 * P.push;
    // the loudest sample in the section, so the waveform panel fills its height
    const A = S.A; this.peak = 0.9;
    if (A && A.s && A.fsr) { let m = 1e-3; const i0 = Math.floor(segStart() * A.fsr), i1 = Math.min(A.s.length, Math.floor((segStart() + sl) * A.fsr)); for (let i = i0; i < i1; i += 7) { const v = Math.abs(A.s[i]); if (v > m) m = v; } this.peak = m; }
    const pushed = this.lows.reduce((a, o) => a + this.A * o.s, 0);
    this.word = null;   // rebuilt with the title below
    this.pushed = pushed;
  },

  // letters along the path, how many, and the steady flow that makes them travel a whole number of words per loop
  // (the tags belong to a place on the path, not to one copy, so a whole word is all the letters need to travel)
  // each turn holds whole copies of the name (two or three when the name is short), so the turns can lie on top of each other
  layout() {
    const raw = (S.title || '').toUpperCase().replace(/\s+/g, '') || 'KRISTUDIO';
    const word = [...raw].slice(0, 24), L = word.length;
    const per = L * Math.max(1, Math.round(10 / L)), N = per * TURNS, sl = segLen();
    const words = Math.max(1, Math.ceil((this.pushed + 0.28 * sl) / L));
    this.word = word; this.wkey = raw; this.per = per; this.N = N; this.base = (words * L - this.pushed) / sl;
  },
  offset(tau) {
    const sl = segLen(); let off = this.base * tau;
    for (const o of this.lows) off += this.A * o.s * (ease((tau - o.rt) / PUSH) + ease((tau + sl - o.rt) / PUSH));
    return off;
  },

  // how far the coil has split into rings, 0 (one ring, the name once) to 1 (a spring of rings), a little past 1 as it flies open.
  // By the bar: open for a bar, closed for a bar, flying open on the downbeat; a whole number of times per loop.
  splitAt(tau) {
    const P = S.coil, sl = segLen(), mode = P.split || 'bars';
    if (mode === 'open') return 1;
    if (mode === 'one') return 0;
    if (mode === '808') {
      let m = 0;
      for (const o of this.lows) { const age = mod(tau - o.rt, sl), e = age < 0.08 ? back(age / 0.08) : Math.exp(-(age - 0.08) / 0.6); m = Math.max(m, Math.pow(o.s, 0.6) * e); }
      return m;
    }
    const cyc = Math.max(1, Math.round(S.lenBars / 2)), cl = sl / cyc, p = mod(tau, cl), h = cl / 2, to = Math.min(0.42, h / 2), tc = Math.min(0.3, h / 2);
    return p < h ? back(p / to) : 1 - sstep((p - h) / tc);
  },

  // the coil inside a box: letters, the line between them, tags
  coil(tau, F, bx, by, bw, bh, pal, k) {
    const sl = segLen(), F0 = FORMS[S.coil.form] || FORMS.coil, form = F0.at;
    const word = this.word, L = word.length, N = this.N, per = this.per, off = this.offset(tau);
    const sp = this.splitAt(tau), sep = sstep((sp - 0.02) / 0.3);   // how much of the other rings shows
    // a short kick in size after each 808 and kick
    let kick = 0; for (const o of this.lows) { const age = mod(tau - o.rt, sl); kick += o.s * Math.exp(-age / 0.25) * 0.035; }
    // a slow sway, once per loop, instead of a full turn: calmer, and the front stays the front
    const sway = 0.3 * Math.sin(TAU * tau / sl), cr = Math.cos(sway), sr = Math.sin(sway);
    const tilt = F0.tilt[0] + (F0.tilt[1] - F0.tilt[0]) * sstep(Math.min(sp, 1)), ct = Math.cos(tilt), st = Math.sin(tilt);
    const sc = Math.min(bw * 0.46, bh * 0.44) * (1 + Math.min(kick, 0.08)), ox = bx + bw / 2, oy = by + bh / 2;
    const proj = t => {
      const [x0, y, z0, g] = form(t, sp), x = x0 * cr - z0 * sr, z = x0 * sr + z0 * cr;
      const yy = y * ct + z * st, zz = z * ct - y * st, persp = 1 / (1 - zz * 0.22);
      return { X: ox + x * sc * persp, Y: oy + yy * sc * 1.05 * persp, z: zz, p: persp * g };
    };
    // where each letter is: t along the path. The lead turn (back to back) keeps the tags on its front three
    // quarters and shows even when the coil is closed; the others show as it splits, fading at the two open ends.
    const tOf = j => mod((j + off) / per, TURNS), e = 1.2 / per, ew = 0.5 / per;
    const lead = t => { const q = t - F0.back - LEAD; return sstep(q / ew + 0.5) * sstep((1 - q) / ew + 0.5); };
    const tagAt = t => { const q = t - F0.back - LEAD; return sstep((q - 0.125) / e + 0.5) * sstep((0.875 - q) / e + 0.5); };
    const showAt = t => Math.max(lead(t), sep * sstep(t / 0.45) * sstep((TURNS - t) / 0.45));
    // which melody note is sounding now, to pop its tag
    const pops = new Float32Array(L);
    for (const n of this.mids) { const age = mod(tau - n.rt, sl); if (age < 0.6) pops[n.tag % L] = Math.max(pops[n.tag % L], n.s * Math.exp(-age / 0.18)); }
    const fk = clamp(13 / per, 0.6, 1);

    // the line between neighbouring letters, broken where the letters sit (none across the gap between the two ends)
    const gap = 0.3;
    ctx.lineCap = 'round';
    for (let j = 0; j < N; j++) {
      const t0 = tOf(j); if (t0 + 1 / per > TURNS) continue;
      const a = t0 + gap / per, b = t0 + (1 - gap) / per, vis = showAt((a + b) / 2); if (vis < 0.01) continue;
      const pts = []; for (let q = 0; q <= 6; q++) pts.push(proj(a + (b - a) * q / 6));
      const zm = pts[3].z;
      ctx.strokeStyle = pal.line; ctx.globalAlpha = clamp(0.55 + zm * 0.5, 0.22, 1) * vis; ctx.lineWidth = 2 * u * k;
      ctx.beginPath(); pts.forEach((p, q) => q ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // letters, back to front (tags over plain letters where they meet)
    const items = [];
    for (let j = 0; j < N; j++) { const t = tOf(j), vis = showAt(t); if (vis < 0.01) continue; const p = proj(t); items.push({ j, p, vis, tg: tagAt(t) }); }
    items.sort((a, b) => (a.p.z + a.tg * 1e-3) - (b.p.z + b.tg * 1e-3));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const { j, p, vis, tg } of items) {
      const li = j % L, ch = word[li], depthA = clamp(0.55 + p.z * 0.6, 0.25, 1) * vis;
      const fs = 31 * u * k * p.p * fk;
      if (tg < 0.999) { ctx.globalAlpha = depthA * (1 - tg); ctx.fillStyle = pal.ink; ctx.font = `500 ${fs}px ${HEL}`; ctx.fillText(ch, p.X, p.Y + fs * 0.04); }
      if (tg > 0.001) {
        const pop = pops[li], sz = fs * (1.55 + 0.45 * pop) * (0.55 + 0.45 * tg), col = pal.tags[li % pal.tags.length];
        ctx.globalAlpha = clamp(0.75 + p.z * 0.4, 0.55, 1) * tg * vis; ctx.fillStyle = col;
        if (li % 2) { ctx.beginPath(); ctx.arc(p.X, p.Y, sz * 0.5, 0, TAU); ctx.fill(); }
        else { rr(p.X - sz / 2, p.Y - sz / 2, sz, sz, sz * 0.08); ctx.fill(); }
        ctx.fillStyle = tagInk(col, pal); ctx.font = `600 ${fs * (1 + 0.25 * pop)}px ${HEL}`;
        ctx.fillText(ch, p.X, p.Y + fs * 0.04);
      }
    }
    ctx.globalAlpha = 1;
  },

  // the melody as a piano roll that scrolls under a fixed playhead
  roll(tau, bx, by, bw, bh, pal) {
    const sl = segLen(), bd = barDur(), notes = this.mids, win = bd * 2, headX = bx + bw * 0.28, kw = 26 * u;
    let lo = 60, hi = 72;
    if (notes.length) { lo = Math.min(...notes.map(n => n.m)) - 1; hi = Math.max(...notes.map(n => n.m)) + 1; if (hi - lo < 12) { const c = (hi + lo) / 2; lo = Math.floor(c - 6); hi = Math.ceil(c + 6); } }
    const rows = hi - lo + 1, ix = bx + kw, iw = bw - kw, rh = bh / rows;
    const yOf = m => by + bh - (m - lo + 1) * rh;
    ctx.save(); rr(bx, by, bw, bh, 14 * u); ctx.clip();
    // rows: the black keys a shade darker, like the piano roll in FL
    for (let m = lo; m <= hi; m++) { if ([1, 3, 6, 8, 10].includes(mod(m, 12))) { ctx.fillStyle = pal.key; ctx.fillRect(ix, yOf(m), iw, rh); } }
    // beat and bar lines that scroll with the notes
    const t0 = tau - (headX - ix) / iw * win;
    for (let b = Math.floor(t0 / (bd / 4)) - 1; b * bd / 4 < t0 + win + bd; b++) {
      const x = ix + (b * bd / 4 - t0) / win * iw; if (x < ix) continue;
      ctx.fillStyle = b % 4 === 0 ? pal.dim : pal.key; ctx.fillRect(x, by, b % 4 === 0 ? 1.4 * u : 1 * u, bh);
    }
    // with a MIDI every track has its own colour; without one, notes are ink and light up in the colour of their pitch
    const midi = this.tracks.length > 0, colOf = n => midi ? pal.tags[n.tr % pal.tags.length] : pal.tags[mod(n.m, 12) % pal.tags.length];
    const sounding = new Map();
    for (const n of notes) for (const c of [-1, 0, 1]) {
      const t = n.rt + c * sl, x = ix + (t - t0) / win * iw, w = Math.max(3 * u, n.dur / win * iw);
      if (x > bx + bw || x + w < ix) continue;
      const on = tau >= t && tau < t + n.dur, col = colOf(n); if (on) sounding.set(n.m, col);
      const y = yOf(n.m) + rh * 0.12, h = rh * 0.76;
      ctx.globalAlpha = on ? 1 : midi ? 0.42 + 0.3 * n.s : 0.35 + 0.45 * n.s; ctx.fillStyle = on || midi ? col : pal.note;
      rr(x, y, w, h, Math.min(h / 2, 4 * u)); ctx.fill();
      if (on) { ctx.strokeStyle = pal.ink; ctx.lineWidth = 1.4 * u; ctx.globalAlpha = 0.8; rr(x, y, w, h, Math.min(h / 2, 4 * u)); ctx.stroke(); }
      if (w > 34 * u && h > 12 * u) { ctx.globalAlpha = on ? 1 : 0.75; ctx.fillStyle = on || midi ? tagInk(col) : pal.panel; ctx.font = `500 ${Math.min(h * 0.62, 13 * u)}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(FLAT[mod(n.m, 12)] + (Math.floor(n.m / 12) - 1), x + 6 * u, y + h / 2); }
    }
    ctx.globalAlpha = 1;
    // the keyboard on the left: a key lights while its note sounds
    for (let m = lo; m <= hi; m++) {
      const black = [1, 3, 6, 8, 10].includes(mod(m, 12)), y = yOf(m);
      ctx.fillStyle = sounding.get(m) || (black ? pal.ink : pal.panel);
      ctx.globalAlpha = sounding.has(m) ? 1 : black ? 0.75 : 1; ctx.fillRect(bx, y + 0.5, kw - 3 * u, rh - 1);
    }
    ctx.globalAlpha = 1; ctx.fillStyle = pal.edge; ctx.fillRect(bx + kw - 3 * u, by, 1 * u, bh);
    ctx.fillStyle = pal.ink; ctx.fillRect(headX - 1 * u, by, 2 * u, bh);
    // the tracks of the MIDI, in their colours, top right
    if (this.tracks.length > 1) {
      ctx.font = `400 ${11 * u}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'right';
      let x = bx + bw - 10 * u; const y = by + 12 * u;
      for (let i = this.tracks.length - 1; i >= 0; i--) {
        const name = this.tracks[i].toUpperCase().slice(0, 14), w = ctx.measureText(name).width;
        ctx.fillStyle = pal.ink; ctx.globalAlpha = 0.8; ctx.fillText(name, x, y);
        ctx.globalAlpha = 1; ctx.fillStyle = pal.tags[i % pal.tags.length]; ctx.fillRect(x - w - 14 * u, y - 4 * u, 8 * u, 8 * u);
        x -= w + 30 * u;
      }
    }
    ctx.restore();
    return [...sounding.keys()].sort((a, b) => b - a)[0];
  },

  // loudness of the last bar, scrolling, mirrored
  level(tau, bx, by, bw, bh, pal) {
    const A = S.A, sl = segLen(), bd = barDur(), cols = 48, span = bd;
    if (!A) return;
    const cw = bw / cols, mid = by + bh / 2;
    for (let c = 0; c < cols; c++) {
      const t = tau - span + (c + 1) * span / cols, fi = clamp(Math.round((segStart() + mod(t, sl)) * A.frameRate), 0, A.nF - 1);
      const v = A.rmsN[fi], lo = Math.min(1, A.lowS[fi]), hgt = Math.max(1.5 * u, v * bh * 0.86);
      ctx.globalAlpha = 0.35 + 0.65 * (c / cols); ctx.fillStyle = lo > 0.55 ? pal.tags[0] : pal.ink;
      rr(bx + c * cw + cw * 0.18, mid - hgt / 2, cw * 0.64, hgt, Math.min(cw * 0.32, 3 * u)); ctx.fill();
    }
    ctx.globalAlpha = 1;
  },

  // the beat itself, the last two beats of it: the real waveform in the studio (min and max per column, like a DAW),
  // its loudness where only the analysis is at hand (the home page preview); the 808 and kick show in colour
  wave(tau, bx, by, bw, bh, pal) {
    const A = S.A, sl = segLen(), span = 120 / S.bpm, cols = 96; if (!A) return;
    const cw = bw / cols, mid = by + bh / 2, half = bh * 0.46, ss = segStart();
    ctx.fillStyle = pal.dim; ctx.fillRect(bx, mid - 0.5 * u, bw, 1 * u);
    for (let c = 0; c < cols; c++) {
      const ta = tau - span + c * span / cols, tb = ta + span / cols;
      const fi = clamp(Math.round((ss + mod(tb, sl)) * A.frameRate), 0, A.nF - 1), lowv = Math.min(1, A.lowS[fi]);
      let lo, hi;
      if (A.s && A.fsr) {
        const i0 = Math.floor((ss + mod(ta, sl)) * A.fsr), n = Math.max(1, Math.floor(span / cols * A.fsr)), step = Math.max(1, Math.floor(n / 64));
        lo = 0; hi = 0; for (let i = i0; i < i0 + n; i += step) { const v = A.s[i] || 0; if (v < lo) lo = v; if (v > hi) hi = v; }
        const g = 1 / Math.max(0.05, this.peak || 0.9), c2 = v => Math.sign(v) * Math.sqrt(Math.min(1, Math.abs(v) * g)); lo = c2(lo); hi = c2(hi);   // a square-root curve, so quiet parts still have a shape
      } else { const v = A.rmsN[fi] * 0.95; lo = -v; hi = v; }
      const age = 1 - c / cols;
      ctx.globalAlpha = 0.28 + 0.72 * (1 - age); ctx.fillStyle = lowv > 0.5 ? pal.tags[0] : pal.ink;
      const y0 = mid - hi * half, y1 = mid - lo * half;
      ctx.fillRect(bx + c * cw + cw * 0.15, y0, cw * 0.7, Math.max(1.2 * u, y1 - y0));
    }
    ctx.globalAlpha = 1;
    ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(bx + bw - 1 * u, mid, 3.2 * u, 0, TAU); ctx.fill();
  },

  panel(x, y, w, h, pal, label) {
    ctx.fillStyle = pal.panel; rr(x, y, w, h, 16 * u); ctx.fill();
    ctx.strokeStyle = pal.edge; ctx.lineWidth = 1.2 * u; rr(x, y, w, h, 16 * u); ctx.stroke();
    if (label) { ctx.font = `500 ${12 * u}px ${MONO}`; ctx.fillStyle = pal.mute; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; spaced(label, x + 18 * u, y + 30 * u, 2 * u, 'left'); }
  },

  draw(tau, F) {
    const P = S.coil, pal = PALS[P.pal] || PALS.paper;
    if (!this.mids) this.prepare(S.seg || []);
    const raw = (S.title || '').toUpperCase().replace(/\s+/g, '') || 'KRISTUDIO';
    if (!this.word || this.wkey !== raw) this.layout();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    const mx = W * 0.075, meta = [(S.tag || '').toUpperCase(), `${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('   ·   ');
    const mono = (txt, x, y, align, col) => { ctx.font = `400 ${14 * u}px ${MONO}`; ctx.fillStyle = col || pal.mute; ctx.textBaseline = 'alphabetic'; spaced(txt, x, y, 2 * u, align); };

    if (P.view === 'desk') {
      const top = H * SAFE_TOP + 24 * u, gapP = 18 * u, fullW = W - 2 * mx;
      mono(meta, mx, H * SAFE_TOP, 'left');
      // piano roll across the top
      const rH = H * 0.17; this.panel(mx, top, fullW, rH, pal);
      const now = this.roll(tau, mx + 10 * u, top + 10 * u, fullW - 20 * u, rH - 20 * u, pal);
      if (now !== undefined) mono(FLAT[mod(now, 12)] + (Math.floor(now / 12) - 1), mx + fullW, H * SAFE_TOP, 'right', pal.ink);
      // two readouts on the left, the coil on the right
      const y2 = top + rH + gapP, lw = fullW * 0.4, rw = fullW - lw - gapP, colH = H * 0.33, sh = (colH - gapP) / 2;
      this.panel(mx, y2, lw, sh, pal, 'LEVEL'); this.level(tau, mx + 18 * u, y2 + 44 * u, lw - 36 * u, sh - 62 * u, pal);
      this.panel(mx, y2 + sh + gapP, lw, sh, pal, 'WAVE'); this.wave(tau, mx + 18 * u, y2 + sh + gapP + 44 * u, lw - 36 * u, sh - 62 * u, pal);
      this.panel(mx + lw + gapP, y2, rw, colH, pal);
      ctx.save(); rr(mx + lw + gapP, y2, rw, colH, 16 * u); ctx.clip();
      this.coil(tau, F, mx + lw + gapP, y2, rw, colH, pal, 0.78);
      ctx.restore();
      waveStrip(tau, { x: mx, y: y2 + colH + 64 * u, w: fullW, ink: pal.ink, dim: pal.dim, mute: pal.mute, head: pal.tags[0] });
    } else {
      mono(meta, cx, H * SAFE_TOP, 'center');
      this.coil(tau, F, mx, H * 0.2, W - 2 * mx, H * 0.47, pal, 1);
      waveStrip(tau, { x: mx, y: H * 0.71, w: W - 2 * mx, ink: pal.ink, dim: pal.dim, mute: pal.mute, head: pal.tags[0] });
    }
    if (pal.grain) grain(pal.grain);
  }
};

export default COIL;
