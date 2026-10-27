// COIL: the beat's name, letter after letter, running along a thin line, left to right along the front.
// Solo and Desk: a spring of three wide rings, seen nearly side-on; the letters come in at the top end and
// leave at the bottom. Or a figure eight, or a rippled ring. One copy of the name rides in coloured tags at the
// front and hands them to the next copy as it leaves. Every 808 and kick pushes the letters along for half a
// second, harder the louder it hits, and gives the spring a short squeeze, like a hit spring; melody notes pop
// their tags. Desk puts it in a panel next to a piano roll of the melody (best with MIDI) and two readouts.
// Readable first: few letters, wide spacing, the back of the line small and faint, the front full.
// Everything is worked out from the time since each hit, and the flow is balanced so the letters travel a whole
// number of words per loop, so the video loops without a seam.
import { S, segLen, segStart, barDur } from '../state.js';
import { ctx, W, H, u, cx, grain, spaced, MONO } from '../render/canvas.js';
import { waveStrip, SAFE_TOP } from '../render/hud.js';
import { clamp, mod, TAU, pad } from '../util.js';

const HEL = '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif';
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];

// tags take their colours in turn; text on a tag is dark or light, whichever reads. tags[0] is also the accent
const PALS = {
  paper: { bg: '#efeee9', panel: '#f6f5f1', edge: 'rgba(21,21,19,0.10)', ink: '#151513', mute: '#8b8a84', line: 'rgba(21,21,19,0.34)', dim: 'rgba(21,21,19,0.16)',
           tags: ['#e0482f', '#2c5bd6', '#f1c12e', '#1b1b19', '#ef9dbb'], note: '#151513', key: 'rgba(21,21,19,0.05)', grain: 0.03 },
  night: { bg: '#19191a', panel: '#222223', edge: 'rgba(236,235,231,0.09)', ink: '#ecebe7', mute: '#8a8985', line: 'rgba(236,235,231,0.30)', dim: 'rgba(236,235,231,0.14)',
           tags: ['#2bb3a0', '#e4683e', '#f0bf3c', '#d65a96', '#a08cf5'], note: '#ecebe7', key: 'rgba(236,235,231,0.04)', grain: 0.045 },
  clay:  { bg: '#e8e0d4', panel: '#f0e9df', edge: 'rgba(60,40,25,0.12)', ink: '#2a1f18', mute: '#8f7f70', line: 'rgba(42,31,24,0.34)', dim: 'rgba(42,31,24,0.16)',
           tags: ['#b5452f', '#5f7f4f', '#d39b3a', '#3e5a73', '#8a5a7a'], note: '#2a1f18', key: 'rgba(42,31,24,0.05)', grain: 0.035 },
  frost: { bg: '#e5eaee', panel: '#edf1f4', edge: 'rgba(20,35,50,0.10)', ink: '#14202c', mute: '#7d8a96', line: 'rgba(20,32,44,0.32)', dim: 'rgba(20,32,44,0.15)',
           tags: ['#2f6fb0', '#4fa39a', '#c9a227', '#c0566e', '#6b5fb5'], note: '#14202c', key: 'rgba(20,32,44,0.05)', grain: 0.03 },
  wine:  { bg: '#1c1013', panel: '#25161a', edge: 'rgba(255,225,230,0.09)', ink: '#f3e6e8', mute: '#9a7f84', line: 'rgba(243,230,232,0.28)', dim: 'rgba(243,230,232,0.13)',
           tags: ['#e0607e', '#e8b04a', '#7fc2b0', '#9a8cff', '#d9cfc6'], note: '#f3e6e8', key: 'rgba(243,230,232,0.04)', grain: 0.05 }
};
const lum = hex => { const n = parseInt(hex.slice(1), 16); return (0.2126 * (n >> 16) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
const tagInk = (hex, pal) => lum(hex) > 0.6 ? '#151513' : '#ffffff';
// a colour for each MIDI track: the five tag colours, then grey, so six tracks stay apart
const trackCol = (pal, i) => { const c = [...pal.tags, pal.mute]; return c[i % c.length]; };

const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : 1 - Math.pow(1 - x, 3);
const sstep = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const PUSH = 0.5;   // how long one hit keeps pushing, in seconds
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// The paths. t runs along the path (0..turns); q is the squeeze from the last hits (0 at rest, about 1 just after
// a hard hit, a little below 0 as it springs back). A point in a unit box: y down, z towards the viewer.
// Along the front (z > 0) every path runs left to right, so the letters read that way.
// open: the path has two ends (the letters fade in and out there) rather than closing on itself.
// per: letters on one turn, at least. exit: where on the path the main front line ends (on the right; the tagged
// word keeps its tags until its first letter has gone past it). depth: how far the
// front comes towards the viewer, to tell the front arc from the sides; floor: how much the sides keep (the
// eight is nearly flat, so its sides stay readable).
// The spring is seen nearly side-on (tilt), and each ring sits well below the last, so the back of a ring
// passes between two fronts instead of across one.
const FORMS = {
  coil: { turns: 3, open: true, per: 9, tilt: 0.2, exit: 2, depth: 0.84, floor: 0,
          at: (t, q) => { const R = 0.86 * (1 + 0.05 * q), th = -TAU * t; return [R * Math.cos(th), (t - 1.5) * 0.56 * (1 - 0.22 * q), R * Math.sin(th)]; } },
  eight: { turns: 1, open: false, per: 16, tilt: 0.42, exit: 0.25, depth: 0.5, floor: 0.55,
           at: (t, q) => { const a = TAU * t; return [0.76 * Math.sin(a) * (1 + 0.04 * q), 0.62 * Math.sin(2 * a) * (1 - 0.2 * q), 0.55 * Math.cos(a)]; } },
  wave: { turns: 1, open: false, per: 15, tilt: 0.5, exit: 0.5, depth: 0.74, floor: 0.12,
          at: (t, q) => { const a = TAU * t, R = 0.84 * (1 + 0.04 * q); return [-R * Math.cos(a), 0.2 * Math.sin(TAU * 4 * t) * (1 - 0.3 * q), R * Math.sin(a)]; } }
};

const COIL = {
  id: 'coil', name: 'Coil',
  defaults: { view: 'solo', form: 'coil', pal: 'paper', push: 1 },
  controls: [
    { key: 'form', label: 'Shape', type: 'choice', options: [['coil', 'coil'], ['eight', 'eight'], ['wave', 'wave']] },
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
    this.tracks = S.midi ? ons.map(i => S.midi.tracks[i].label || S.midi.tracks[i].name) : [];
    const mids = seg.filter(o => o.type === 'mid' && (o.mm || o.p > 20)).map(o => ({ rt: o.rt, s: o.s, m: o.mm || Math.round(69 + 12 * Math.log2(o.p / 440)), dur: o.dur || 0, tr: o.midi ? Math.max(0, ons.indexOf(o.tr)) : -1 }));
    mids.sort((a, b) => a.rt - b.rt);
    mids.forEach((n, i) => { if (!n.dur) { const nx = mids[(i + 1) % mids.length]; const gap = mids.length > 1 ? mod(nx.rt - n.rt, sl) || sl : bd / 2; n.dur = clamp(gap * 0.9, bd / 16, bd / 2); } n.tag = i; });
    this.mids = mids;
    // the push from each hit adds A·strength letters of travel; the steady flow tops it up to whole words
    this.A = 0.6 * P.push;
    // the loudest sample in the section, so the waveform panel fills its height
    const A = S.A; this.peak = 0.9;
    if (A && A.s && A.fsr) { let m = 1e-3; const i0 = Math.floor(segStart() * A.fsr), i1 = Math.min(A.s.length, Math.floor((segStart() + sl) * A.fsr)); for (let i = i0; i < i1; i += 7) { const v = Math.abs(A.s[i]); if (v > m) m = v; } this.peak = m; }
    const pushed = this.lows.reduce((a, o) => a + this.A * o.s, 0);
    this.word = null;   // rebuilt with the title below
    this.pushed = pushed;
  },

  // how many copies of the name go on the path: enough for a calm spacing, always whole copies,
  // and at least two on the closed shapes so the tags have somewhere to go
  layout() {
    const raw = (S.title || '').toUpperCase().replace(/\s+/g, '') || 'KRISTUDIO';
    const F0 = FORMS[S.coil.form] || FORMS.coil;
    const word = [...raw].slice(0, 24), L = word.length, sl = segLen();
    const copies = Math.max(F0.open ? 1 : 2, Math.round(Math.max(F0.per, L) * F0.turns / L)), N = L * copies;
    const words = Math.max(1, Math.ceil((this.pushed + 0.28 * sl) / L));
    this.word = word; this.wkey = raw + '|' + S.coil.form; this.N = N; this.base = (words * L - this.pushed) / sl;
  },
  offset(tau) {
    const sl = segLen(); let off = this.base * tau;
    for (const o of this.lows) off += this.A * o.s * (ease((tau - o.rt) / PUSH) + ease((tau + sl - o.rt) / PUSH));
    return off;
  },
  // the squeeze: each hit presses the spring in fast, then it rings back out
  squeeze(tau) {
    const sl = segLen(); let q = 0;
    for (const o of this.lows) { const age = mod(tau - o.rt, sl); if (age < 1.2) q += o.s * sstep(age / 0.05) * Math.exp(-age / 0.28) * Math.cos(TAU * age / 0.5); }
    return clamp(q * Math.min(1.5, S.coil.push), -0.5, 1.1);
  },

  // the shape inside a box: the line, the letters, the tagged copy
  coil(tau, F, bx, by, bw, bh, pal, k) {
    const sl = segLen(), F0 = FORMS[S.coil.form] || FORMS.coil, form = F0.at, T = F0.turns;
    const word = this.word, L = word.length, N = this.N, per = N / T, off = this.offset(tau), q = this.squeeze(tau);
    // a slow sway, once per loop, instead of a full turn: calm, and the front stays the front
    const sway = 0.25 * Math.sin(TAU * tau / sl), cr = Math.cos(sway), sr = Math.sin(sway);
    const ct = Math.cos(F0.tilt), st = Math.sin(F0.tilt);
    const sc = Math.min(bw * 0.46, bh * 0.44), ox = bx + bw / 2, oy = by + bh / 2;
    // f: how far round to the front a point is, 0 from the sides back, 1 on the front arc. Only the front reads
    // at full strength; the sides and the back stay faint, so letters going round a bend don't pile into each other
    const zr = F0.depth, fl = F0.floor;
    const proj = t => {
      const [x0, y, z0] = form(t, q), x = x0 * cr - z0 * sr, z = x0 * sr + z0 * cr;
      const yy = y * ct + z * st, zz = z * ct - y * st, persp = 1 / (1 - zz * 0.3);
      return { X: ox + x * sc * persp, Y: oy + yy * sc * 1.05 * persp, z: zz, p: persp, f: fl + (1 - fl) * sstep((zz / zr + 0.05) / 0.75) };
    };
    // where letter j is along the path, and how much it shows (an open path fades at its two ends)
    const tOf = j => mod((j + off) / per, T);
    const endA = t => F0.open ? sstep(t / 0.35) * sstep((T - t) / 0.35) : 1;
    // the tagged word: one copy of the name at a time. It keeps its tags until its last letter to go (the first
    // letter of the word) has left the main front line on the right; then the copy right behind it lights up
    // and the old one goes plain. v is how far behind the exit a copy's first letter is: 0..L is the lit copy.
    const copies = N / L, tagOf = new Float32Array(copies), exit = F0.exit * per, e = 0.12;
    for (let c = 0; c < copies; c++) {
      const v = mod(exit - (c * L + off) + e, N) - e;
      tagOf[c] = sstep((v + e) / (2 * e)) * sstep((L + e - v) / (2 * e));
    }
    // which melody note is sounding now, to pop its tag
    const pops = new Float32Array(L);
    for (const n of this.mids) { const age = mod(tau - n.rt, sl); if (age < 0.6) pops[n.tag % L] = Math.max(pops[n.tag % L], n.s * Math.exp(-age / 0.18)); }
    // long names get smaller letters so they still have room
    const fk = clamp(11 / per, 0.55, 1);

    // the line between neighbouring letters, broken where the letters sit (none across the gap between the two ends)
    const gap = 0.3;
    ctx.lineCap = 'round'; ctx.strokeStyle = pal.line; ctx.lineWidth = 1.8 * u * k;
    for (let j = 0; j < N; j++) {
      const t0 = tOf(j); if (F0.open && t0 + 1 / per > T) continue;
      const a = t0 + gap / per, b = t0 + (1 - gap) / per, vis = endA((a + b) / 2); if (vis < 0.01) continue;
      const pts = []; for (let i = 0; i <= 6; i++) pts.push(proj(a + (b - a) * i / 6));
      ctx.globalAlpha = (0.16 + 0.6 * pts[3].f) * vis;
      ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p.X, p.Y) : ctx.moveTo(p.X, p.Y)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // letters, back to front; tags over plain letters where they meet
    const items = [];
    for (let j = 0; j < N; j++) { const t = tOf(j), vis = endA(t); if (vis < 0.01) continue; items.push({ j, p: proj(t), vis, tg: tagOf[Math.floor(j / L)] }); }
    items.sort((a, b) => (a.p.z + a.tg * 1e-3) - (b.p.z + b.tg * 1e-3));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const { j, p, vis, tg } of items) {
      const li = j % L, ch = word[li], depthA = (0.1 + 0.9 * p.f) * vis;
      const fs = 31 * u * k * p.p * fk;
      if (tg < 0.999) { ctx.globalAlpha = depthA * (1 - tg); ctx.fillStyle = pal.ink; ctx.font = `${p.f > 0.5 ? 500 : 400} ${fs}px ${HEL}`; ctx.fillText(ch, p.X, p.Y + fs * 0.04); }
      if (tg > 0.001) {
        const pop = pops[li], sz = fs * (1.42 + 0.4 * pop) * (0.6 + 0.4 * tg), col = pal.tags[li % pal.tags.length];
        ctx.globalAlpha = (0.22 + 0.78 * p.f) * tg * vis; ctx.fillStyle = col;
        if (li % 2) { ctx.beginPath(); ctx.arc(p.X, p.Y, sz * 0.5, 0, TAU); ctx.fill(); }
        else { rr(p.X - sz / 2, p.Y - sz / 2, sz, sz, sz * 0.08); ctx.fill(); }
        ctx.fillStyle = tagInk(col, pal); ctx.font = `600 ${fs * (1 + 0.22 * pop)}px ${HEL}`;
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
    const midi = this.tracks.length > 0, colOf = n => midi ? trackCol(pal, n.tr) : pal.tags[mod(n.m, 12) % pal.tags.length];
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
    // (on a card of the panel's colour, so the notes underneath don't run through the names; wraps onto a second row)
    if (this.tracks.length > 1) {
      ctx.font = `400 ${11 * u}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      const items = this.tracks.map((t, i) => { const name = t.toUpperCase().slice(0, 16); return { i, name, w: ctx.measureText(name).width + 14 * u }; });
      const gapX = 16 * u, maxW = bw * 0.74, rows = [[]]; let rw = 0;
      for (const it of items) { if (rows[rows.length - 1].length && rw + gapX + it.w > maxW) { rows.push([]); rw = 0; } rw += (rows[rows.length - 1].length ? gapX : 0) + it.w; rows[rows.length - 1].push(it); }
      const rowW = r => r.reduce((a, it, k) => a + it.w + (k ? gapX : 0), 0), lh = 18 * u, cw = Math.max(...rows.map(rowW)) + 20 * u, ch = rows.length * lh + 8 * u;
      const cx0 = bx + bw - cw - 4 * u, cy0 = by + 4 * u;
      ctx.globalAlpha = 0.92; ctx.fillStyle = pal.panel; rr(cx0, cy0, cw, ch, 6 * u); ctx.fill();
      rows.forEach((r, ri) => {
        let x = bx + bw - 14 * u - rowW(r); const y = cy0 + 4 * u + lh * (ri + 0.5);
        for (const it of r) {
          ctx.globalAlpha = 1; ctx.fillStyle = trackCol(pal, it.i); ctx.fillRect(x, y - 4 * u, 8 * u, 8 * u);
          ctx.globalAlpha = 0.85; ctx.fillStyle = pal.ink; ctx.fillText(it.name, x + 14 * u, y);
          x += it.w + gapX;
        }
      });
      ctx.globalAlpha = 1;
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
    if (!this.word || this.wkey !== raw + '|' + P.form) this.layout();
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
