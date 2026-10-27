// COIL: the beat's name, letter after letter, running along a coil of thin line. One copy of the name rides in
// coloured tags (squares and circles), the rest in plain letters. The coil breathes between a tight S and wide
// rings and turns once per loop; every 808 and kick pushes the letters along faster for half a second, harder
// the louder it hits, and every melody note pops one of the tags.
// Two views: Solo is the coil alone; Desk puts it in a panel next to a piano roll of the melody (best with a
// MIDI loaded) and two small level readouts.
// Everything is worked out from the time since each hit, and the push is balanced so the letters travel a whole
// number of laps per loop, so the video loops without a seam.
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
  night: { bg: '#0f1012', panel: '#16171a', edge: 'rgba(238,236,230,0.09)', ink: '#eeece6', mute: '#7c7a75', line: 'rgba(238,236,230,0.30)', dim: 'rgba(238,236,230,0.14)',
           tags: ['#2bb3a0', '#9478ff', '#f0bf3c', '#d0559a', '#7fa1c4'], note: '#eeece6', key: 'rgba(238,236,230,0.04)', grain: 0.05 },
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

// the paths, for s in [0,1) round the loop: a point in a unit box, z towards the viewer
const FORMS = {
  // a spring: three turns down, three back up, so the two halves cross like the rings of a coil
  coil: (s, spread, rot) => { const R = 0.34 + 0.62 * spread, th = TAU * 3 * s + rot; return [R * Math.cos(th), -Math.cos(TAU * s) * (0.92 - 0.12 * spread), R * Math.sin(th)]; },
  // a figure eight that leans into depth
  eight: (s, spread, rot) => { const a = TAU * s, R = 0.5 + 0.45 * spread, x = R * Math.sin(a), y = 0.9 * Math.sin(2 * a) * (0.7 + 0.3 * spread) / 1.0, z = Math.cos(a) * 0.6; return [x * Math.cos(rot) - z * Math.sin(rot), y, x * Math.sin(rot) + z * Math.cos(rot)]; },
  // a ring with a wave running round it, like a ripple on the rim of a glass
  wave: (s, spread, rot) => { const a = TAU * s + rot, R = 0.55 + 0.4 * spread; return [R * Math.cos(a), 0.55 * Math.sin(TAU * 4 * s) * (0.45 + 0.55 * spread), R * Math.sin(a)]; }
};

const COIL = {
  id: 'coil', name: 'Coil',
  defaults: { view: 'solo', form: 'coil', pal: 'paper', push: 1, breath: 0.6 },
  controls: [
    { key: 'form', label: 'Shape', type: 'choice', options: [['coil', 'coil'], ['eight', 'eight'], ['wave', 'wave']] },
    { key: 'push', label: 'Push from 808 & kick', type: 'range', min: 0, max: 2, step: 0.01, format: v => v.toFixed(2) + '×', then: 'rebuild' },
    { key: 'breath', label: 'Breathing', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'pal', label: 'Colour', type: 'choice', options: [['paper', 'paper'], ['night', 'night'], ['clay', 'clay'], ['frost', 'frost'], ['wine', 'wine']] },
    { key: 'view', label: 'View', type: 'choice', options: [['solo', 'solo'], ['desk', 'desk']] }
  ],
  setup() {},

  prepare(seg) {
    const sl = segLen(), bd = barDur(), P = S.coil;
    this.lows = seg.filter(o => o.type === 'low').map(o => ({ rt: o.rt, s: o.s }));
    // the melody: MIDI notes when loaded (exact pitch and length), otherwise what the analysis heard
    const mids = seg.filter(o => o.type === 'mid' && (o.mm || o.p > 20)).map(o => ({ rt: o.rt, s: o.s, m: o.mm || Math.round(69 + 12 * Math.log2(o.p / 440)), dur: o.dur || 0 }));
    mids.sort((a, b) => a.rt - b.rt);
    mids.forEach((n, i) => { if (!n.dur) { const nx = mids[(i + 1) % mids.length]; const gap = mids.length > 1 ? mod(nx.rt - n.rt, sl) || sl : bd / 2; n.dur = clamp(gap * 0.9, bd / 16, bd / 2); } n.tag = i; });
    this.mids = mids;
    // the push from each hit adds A·strength letters of travel; the steady flow tops it up to whole laps
    this.A = 1.6 * P.push;
    const pushed = this.lows.reduce((a, o) => a + this.A * o.s, 0);
    this.word = null;   // rebuilt with the title below
    this.pushed = pushed;
  },

  // letters along the path, how many, and the steady flow that makes them travel whole laps per loop
  layout() {
    const raw = (S.title || '').toUpperCase().replace(/\s+/g, '') || 'KRISTUDIO';
    const word = [...raw].slice(0, 24), L = word.length;
    const copies = Math.max(2, Math.round(34 / L)), N = L * copies, sl = segLen();
    const laps = Math.max(1, Math.ceil((this.pushed + 0.45 * sl) / N));
    this.word = word; this.wkey = raw; this.N = N; this.base = (laps * N - this.pushed) / sl;
  },
  offset(tau) {
    const sl = segLen(); let off = this.base * tau;
    for (const o of this.lows) off += this.A * o.s * (ease((tau - o.rt) / PUSH) + ease((tau + sl - o.rt) / PUSH));
    return off;
  },

  // the coil inside a box: letters, the line between them, tags
  coil(tau, F, bx, by, bw, bh, pal, k) {
    const P = S.coil, sl = segLen(), form = FORMS[P.form] || FORMS.coil;
    const word = this.word, L = word.length, N = this.N, off = this.offset(tau);
    // breathing: whole cycles per loop, plus a short swell after each 808 and kick
    const cyc = Math.max(1, Math.round(S.lenBars / 4));
    let swell = 0; for (const o of this.lows) { const age = mod(tau - o.rt, sl); swell += o.s * Math.exp(-age / 0.35) * 0.22; }
    const spread = clamp(0.5 - 0.5 * P.breath * Math.cos(TAU * cyc * tau / sl) + swell * P.breath, 0, 1.2);
    const rot = TAU * tau / sl;
    const tilt = 0.42, ct = Math.cos(tilt), st = Math.sin(tilt);
    const sc = Math.min(bw * 0.46, bh * 0.44), ox = bx + bw / 2, oy = by + bh / 2;
    const proj = s => {
      const [x, y, z] = form(s, spread, rot);
      const yy = y * ct - z * st, zz = y * st + z * ct, persp = 1 / (1 - zz * 0.22);
      return { X: ox + x * sc * persp, Y: oy + yy * sc * 1.05 * persp, z: zz, p: persp };
    };
    // which melody note is sounding now, to pop its tag
    const pops = new Float32Array(L);
    for (const n of this.mids) { const age = mod(tau - n.rt, sl); if (age < 0.6) pops[n.tag % L] = Math.max(pops[n.tag % L], n.s * Math.exp(-age / 0.18)); }

    // the line between neighbouring letters, broken where the letters sit
    const gap = 0.3;
    ctx.lineCap = 'round';
    for (let j = 0; j < N; j++) {
      const a = (j + off + gap) / N, b = (j + 1 + off - gap) / N;
      const pts = []; for (let q = 0; q <= 6; q++) pts.push(proj(mod(a + (b - a) * q / 6, 1)));
      const zm = pts[3].z;
      ctx.strokeStyle = pal.line; ctx.globalAlpha = clamp(0.55 + zm * 0.5, 0.22, 1); ctx.lineWidth = 2 * u * k;
      ctx.beginPath(); pts.forEach((p, q) => q ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // letters, back to front
    const items = [];
    for (let j = 0; j < N; j++) { const p = proj(mod((j + off) / N, 1)); items.push({ j, p }); }
    items.sort((a, b) => a.p.z - b.p.z);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const { j, p } of items) {
      const li = j % L, ch = word[li], tagged = j < L, depthA = clamp(0.55 + p.z * 0.6, 0.25, 1);
      const fs = 31 * u * k * p.p;
      if (tagged) {
        const pop = pops[li], sz = fs * (1.55 + 0.45 * pop), col = pal.tags[li % pal.tags.length];
        ctx.globalAlpha = clamp(0.75 + p.z * 0.4, 0.55, 1); ctx.fillStyle = col;
        if (li % 2) { ctx.beginPath(); ctx.arc(p.X, p.Y, sz * 0.5, 0, TAU); ctx.fill(); }
        else { rr(p.X - sz / 2, p.Y - sz / 2, sz, sz, sz * 0.08); ctx.fill(); }
        ctx.fillStyle = tagInk(col, pal); ctx.font = `600 ${fs * (1 + 0.25 * pop)}px ${HEL}`;
        ctx.fillText(ch, p.X, p.Y + fs * 0.04);
      } else {
        ctx.globalAlpha = depthA; ctx.fillStyle = pal.ink; ctx.font = `500 ${fs}px ${HEL}`;
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
    const sounding = new Set();
    for (const n of notes) for (const c of [-1, 0, 1]) {
      const t = n.rt + c * sl, x = ix + (t - t0) / win * iw, w = Math.max(3 * u, n.dur / win * iw);
      if (x > bx + bw || x + w < ix) continue;
      const on = tau >= t && tau < t + n.dur; if (on) sounding.add(n.m);
      const y = yOf(n.m) + rh * 0.12, h = rh * 0.76, col = pal.tags[mod(n.m, 12) % pal.tags.length];
      ctx.globalAlpha = on ? 1 : 0.35 + 0.45 * n.s; ctx.fillStyle = on ? col : pal.note;
      rr(x, y, w, h, Math.min(h / 2, 4 * u)); ctx.fill();
      if (w > 34 * u && h > 12 * u) { ctx.globalAlpha = on ? 1 : 0.7; ctx.fillStyle = on ? tagInk(col) : pal.panel; ctx.font = `500 ${Math.min(h * 0.62, 13 * u)}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(FLAT[mod(n.m, 12)] + (Math.floor(n.m / 12) - 1), x + 6 * u, y + h / 2); }
    }
    ctx.globalAlpha = 1;
    // the keyboard on the left: a key lights while its note sounds
    for (let m = lo; m <= hi; m++) {
      const black = [1, 3, 6, 8, 10].includes(mod(m, 12)), y = yOf(m);
      ctx.fillStyle = sounding.has(m) ? pal.tags[mod(m, 12) % pal.tags.length] : black ? pal.ink : pal.panel;
      ctx.globalAlpha = sounding.has(m) ? 1 : black ? 0.75 : 1; ctx.fillRect(bx, y + 0.5, kw - 3 * u, rh - 1);
    }
    ctx.globalAlpha = 1; ctx.fillStyle = pal.edge; ctx.fillRect(bx + kw - 3 * u, by, 1 * u, bh);
    ctx.fillStyle = pal.ink; ctx.fillRect(headX - 1 * u, by, 2 * u, bh);
    ctx.restore();
    return [...sounding].sort((a, b) => b - a)[0];
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

  // the hats and the 808 round a dial: the last two beats of the top end as a ring, the low end as the core
  dial(tau, bx, by, bw, bh, pal, F) {
    const A = S.A, sl = segLen(), bd = barDur(); if (!A) return;
    const ox = bx + bw / 2, oy = by + bh / 2, R = Math.min(bw, bh) * 0.36, n = 72, span = bd / 2;
    ctx.strokeStyle = pal.dim; ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(ox, oy, R, 0, TAU); ctx.stroke();
    ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const t = tau - span + (i + 1) * span / n, fi = clamp(Math.round((segStart() + mod(t, sl)) * A.frameRate), 0, A.nF - 1);
      const v = Math.min(1, A.highN[fi] * 0.9 + A.rmsN[fi] * 0.3), a = -Math.PI / 2 + TAU * i / n;
      ctx.strokeStyle = i > n - 8 ? pal.tags[1] : pal.ink; ctx.globalAlpha = 0.25 + 0.75 * (i / n); ctx.lineWidth = 2.4 * u;
      ctx.beginPath(); ctx.moveTo(ox + Math.cos(a) * R, oy + Math.sin(a) * R); ctx.lineTo(ox + Math.cos(a) * (R + v * R * 0.42), oy + Math.sin(a) * (R + v * R * 0.42)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const core = R * (0.22 + 0.5 * F.low);
    ctx.fillStyle = pal.tags[0]; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(ox, oy, core, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
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
      this.panel(mx, y2 + sh + gapP, lw, sh, pal, 'TOP END'); this.dial(tau, mx, y2 + sh + gapP + 16 * u, lw, sh - 16 * u, pal, F);
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
