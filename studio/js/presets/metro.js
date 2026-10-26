// METRO: the loop as a transit map.
// The ring in the middle is the clock: one trip round it is the whole section, starting at the top.
// Every note of the octave that the melody uses gets its own line, in piano order from the inside out,
// so the ring is a bundle of parallel lines (the shape of the ring is a setting). Each melody note is a
// station on its line at its moment; every kick is an interchange across the whole bundle; the hats are
// the dotted line inside, where a red dot marks "now". Each line also runs out of the ring as two
// branches: one with a station per octave the note was played in, one with the line's bullet.
// When a note plays its station flashes, a micro tram leaves it, its octave station lights up and its
// key on the piano legend goes down. The map itself is drawn once into an offscreen canvas;
// a frame adds only what moves.
import { S, segLen, barDur } from '../state.js';
import { ctx, W, H, u, cx, grain, spaced, MONO } from '../render/canvas.js';
import { clamp, mod, TAU, mulberry, pad, fmtT, titleCase } from '../util.js';

const HEL = '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif';
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
// one colour per note, transit-map style. Notes a semitone apart and notes a fifth apart both get colours
// far from each other, so a scale never reads as a rainbow:  C red, C♯ sky, D yellow, D♯ purple, E green,
// F orange, F♯ magenta, G blue, G♯ lime, A brown, A♯ teal, B indigo
const COLORS = ['#e8352e', '#19a7e0', '#f2c200', '#7d3c98', '#00a651', '#f26b21', '#d81b84', '#0a52b5', '#86c440', '#9a5b34', '#00a199', '#3d3d9e'];
const RED = '#e5382b';
const PALS = {
  paper: { bg: '#ffffff', ink: '#111111', mute: '#8c8c8c', hat: '#a7a9ac', grain: 0, blend: 'multiply' },
  dust:  { bg: '#ddd5d0', ink: '#1d1a19', mute: '#7b726d', hat: '#8f8681', grain: 0.045, blend: 'multiply' },
  night: { bg: '#0c0c0f', ink: '#f1f1f1', mute: '#7a7a82', hat: '#5c5c66', grain: 0.035, blend: 'screen' }
};
const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11], BLACK_KEYS = [[1, 1], [3, 2], [6, 4], [8, 5], [10, 6]];   // [pc, white keys to its left]

// ring outlines in units of the ring's radius, clockwise from the top (y points down)
const SHAPES = {
  square: [[0, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86], [-0.86, -0.86]],
  diamond: [[0, -1.1], [1.1, 0], [0, 1.1], [-1.1, 0]],
  octagon: [[0, -0.95], [0.4, -0.95], [0.95, -0.4], [0.95, 0.4], [0.4, 0.95], [-0.4, 0.95], [-0.95, 0.4], [-0.95, -0.4], [-0.4, -0.95]],
  heart: [[0, -0.52], [0.3, -0.82], [0.7, -0.82], [1.02, -0.5], [1.02, -0.1], [0, 0.92], [-1.02, -0.1], [-1.02, -0.5], [-0.7, -0.82], [-0.3, -0.82]]
};

/* ---------------- paths: dense points with normals ---------------- */
// rounds every corner of a polyline with a quadratic curve (radius r, never more than 45% of a side)
function fillet(V, r, closed) {
  const out = [], n = V.length;
  for (let i = 0; i < n; i++) {
    if (!closed && (i === 0 || i === n - 1)) { out.push(V[i]); continue; }
    const P = V[(i - 1 + n) % n], C = V[i], N = V[(i + 1) % n];
    const l1 = Math.hypot(C[0] - P[0], C[1] - P[1]), l2 = Math.hypot(N[0] - C[0], N[1] - C[1]);
    const d1 = [(C[0] - P[0]) / l1, (C[1] - P[1]) / l1], d2 = [(N[0] - C[0]) / l2, (N[1] - C[1]) / l2];
    if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < 1e-3) { out.push(C); continue; }
    const t = Math.min(r, 0.45 * l1, 0.45 * l2), A = [C[0] - d1[0] * t, C[1] - d1[1] * t], B = [C[0] + d2[0] * t, C[1] + d2[1] * t];
    for (let k = 0; k <= 12; k++) { const s = k / 12, a = (1 - s) ** 2, b = 2 * s * (1 - s), c = s * s; out.push([a * A[0] + b * C[0] + c * B[0], a * A[1] + b * C[1] + c * B[1]]); }
  }
  return out;
}
// even spacing along the length, with outward normals: n = (ty, -tx), outward for a clockwise ring
function resample(pts, count, closed) {
  const m = pts.length, L = [0];
  for (let i = 1; i < m + (closed ? 1 : 0); i++) { const a = pts[i - 1], b = pts[i % m]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = L[L.length - 1], n = count || Math.max(2, Math.round(len / (3 * u)));
  const x = new Float32Array(n), y = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = closed ? len * i / n : len * i / (n - 1);
    while (j < L.length - 2 && L[j + 1] < d) j++;
    const a = pts[j % m], b = pts[(j + 1) % m], f = (d - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    x[i] = a[0] + (b[0] - a[0]) * f; y[i] = a[1] + (b[1] - a[1]) * f;
  }
  for (let i = 0; i < n; i++) {
    const p = closed ? (i - 1 + n) % n : Math.max(0, i - 1), q = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
    let tx = x[q] - x[p], ty = y[q] - y[p]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    nx[i] = ty; ny[i] = -tx;
  }
  return { x, y, nx, ny, n, len, closed };
}
// a point on a path at fraction f (0–1 of its length), pushed out by `o` along the normal
function at(P, f, o = 0) {
  const t = P.closed ? mod(f, 1) * P.n : clamp(f, 0, 1) * (P.n - 1);
  const i = Math.floor(t), j = P.closed ? (i + 1) % P.n : Math.min(P.n - 1, i + 1), k = t - i;
  const nx = P.nx[i] + (P.nx[j] - P.nx[i]) * k, ny = P.ny[i] + (P.ny[j] - P.ny[i]) * k;
  return { x: P.x[i] + (P.x[j] - P.x[i]) * k + nx * o, y: P.y[i] + (P.y[j] - P.y[i]) * k + ny * o, nx, ny, tx: -ny, ty: nx };
}
function trace(g, P, o, wob) {
  g.beginPath();
  for (let i = 0; i < P.n; i++) { const oo = o + (wob ? wob(i) : 0), X = P.x[i] + P.nx[i] * oo, Y = P.y[i] + P.ny[i] * oo; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }
  if (P.closed) g.closePath();
}

function keyTriad() {
  const m = (S.key || '').trim().match(/^([A-Ga-g])\s*([#♯b♭]?)\s*(.*)$/); if (!m) return [0, 4, 7];
  const root = mod({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0), 12);
  const minor = /^m(in|inor)?\b|^m$/i.test(m[3].trim()) && !/maj/i.test(m[3]);
  return [root, mod(root + (minor ? 3 : 4), 12), mod(root + 7, 12)];
}
const midiOf = p => Math.round(69 + 12 * Math.log2(p / 440));

const METRO = {
  id: 'metro', name: 'Metro',
  defaults: { ring: 'circle', pal: 'paper', style: 'clean', trams: 0.6, labels: 'all' },
  controls: [
    { key: 'ring', label: 'Ring', type: 'choice', options: [['circle', 'circle'], ['heart', 'heart'], ['diamond', 'diamond'], ['square', 'square'], ['octagon', 'octagon']], then: 'buildMap' },
    { key: 'style', label: 'Lines', type: 'choice', options: [['clean', 'clean'], ['brush', 'brush']], then: 'buildMap' },
    { key: 'pal', label: 'Map', type: 'choice', options: [['paper', 'paper'], ['dust', 'dust'], ['night', 'night']], then: 'buildMap' },
    { key: 'labels', label: 'Station names', type: 'choice', options: [['all', 'all'], ['few', 'few'], ['none', 'none']], then: 'buildMap' },
    { key: 'trams', label: 'Micro trams', type: 'range', min: 0, max: 1, step: 0.01 }
  ],
  map: document.createElement('canvas'),
  pcs: null, flats: true,

  setup() { this.map.width = W; this.map.height = H; this.mctx = this.map.getContext('2d'); this.buildMap(); },

  // which notes get lines, and which hits become what
  prepare(seg) {
    const count = new Array(12).fill(0);
    for (const o of seg) {
      o.ln = -1;
      if (o.type !== 'mid' || !(o.p > 20)) continue;
      o.mm = midiOf(o.p); o.pc = mod(o.mm, 12); o.oct = Math.floor(o.mm / 12) - 1; count[o.pc]++;
    }
    const pcs = count.map((n, pc) => [n, pc]).filter(a => a[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 5).map(a => a[1]);
    for (const pc of keyTriad()) if (pcs.length < 3 && !pcs.includes(pc)) pcs.push(pc);   // a sparse melody still gets a map
    pcs.sort((a, b) => a - b);
    this.pcs = pcs;
    this.flats = seg.some(o => /b/.test(o.note || '')) || /^[A-G]\s*[b♭]/.test((S.key || '').trim());
    for (const o of seg) if (o.type === 'mid' && o.pc != null) o.ln = pcs.indexOf(o.pc);
    this.buildMap();
  },

  name12(pc) { return (this.flats ? FLAT : SHARP)[pc]; },

  /* ---------------- the static map ---------------- */
  buildMap() {
    if (!this.mctx || this.map.width !== W) return;
    const g = this.mctx, M = S.metro, pal = PALS[M.pal] || PALS.paper, brush = M.style === 'brush';
    const pcs = this.pcs || keyTriad().sort((a, b) => a - b), n = pcs.length, sl = segLen(), bd0 = barDur(), seg = S.seg || [];
    const w = 12 * u, gap = 15.5 * u, span = (n - 1) * gap;
    const offs = pcs.map((_, i) => (i - (n - 1) / 2) * gap);
    const cy = H * 0.335, R = W * 0.3, ruleY = H * 0.655;
    Object.assign(this, { pal, w, gap, span, offs, cy, R, ruleY, n, colors: pcs.map(pc => COLORS[pc]) });

    // the ring
    let ring;
    if (M.ring === 'circle' || !SHAPES[M.ring]) {
      const pts = []; for (let i = 0; i < 720; i++) { const a = -Math.PI / 2 + TAU * i / 720; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
      ring = resample(pts, 900, true);
    } else {
      const V = SHAPES[M.ring].map(([x, y]) => [cx + x * R, cy + y * R]);
      ring = resample(fillet(V, R * 0.24, true), 900, true);
      // start the clock exactly at the shape's first point (top middle, the tip, or the notch)
      let best = 0, bd = Infinity; for (let i = 0; i < ring.n; i++) { const d = (ring.x[i] - V[0][0]) ** 2 + (ring.y[i] - V[0][1]) ** 2; if (d < bd) { bd = d; best = i; } }
      for (const k of ['x', 'y', 'nx', 'ny']) ring[k] = Float32Array.from({ length: ring.n }, (_, i) => ring[k][(i + best) % ring.n]);
    }
    this.ring = ring;
    const inner = offs[0] - w / 2, outer = offs[n - 1] + w / 2;
    this.hatO = inner - 22 * u;

    // branches: every line leaves the ring twice, the ends spread evenly round it, then one 45° bend
    const rnd = mulberry(7919 + pcs.reduce((a, b) => a * 13 + b, 0));
    const snap = (x, y) => { const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4); return [Math.cos(a), Math.sin(a)]; };
    const branches = [];
    for (let i = 0; i < n; i++) for (const side of [0, 1]) {
      const f = (i + 0.5) / (2 * n) + side * 0.5, p = at(ring, f, offs[i]);
      const d0 = snap(p.nx, p.ny), L1 = (outer - offs[i]) + (70 + rnd() * 150) * u;
      const turn = (rnd() < 0.5 ? 1 : -1) * Math.PI / 4, a1 = Math.atan2(d0[1], d0[0]) + turn, d1 = [Math.cos(a1), Math.sin(a1)];
      const P1 = [p.x + d0[0] * L1, p.y + d0[1] * L1], P2 = [P1[0] + d1[0] * H * 1.5, P1[1] + d1[1] * H * 1.5];
      branches.push({ i, side, P: resample(fillet([[p.x, p.y], P1, P2], 60 * u, false), 0, false), clear: outer - offs[i] });
    }
    this.branches = branches;

    // stations, interchanges, labels
    const mids = seg.filter(o => o.ln >= 0), highs = seg.filter(o => o.type === 'high'), arc = ring.len;
    // interchanges only for the kicks that hit hardest, at most one a beat, so the ring doesn't turn into a gear
    const lows = seg.filter(o => o.type === 'low'), cut = Math.max(0.4, lows.map(o => o.s).sort((a, b) => a - b)[Math.floor(lows.length * 0.55)] || 0);
    let lastK = -1e9; this.kicks = [];
    for (const o of lows) { if (o.s < cut || o.rt - lastK < bd0 / 4 - 1e-6) continue; lastK = o.rt; this.kicks.push(o); }
    // names round the ring, never closer than labelGap along it (the last one also keeps clear of the first)
    const labelGap = M.labels === 'few' ? 120 * u : 52 * u; let lastL = -1e9, firstL = null; this.labelled = new Set();
    if (M.labels !== 'none') for (const o of mids) {
      if (M.labels === 'few' && o.s < 0.45) continue;
      const d = o.rt / sl * arc;
      if (d - lastL < labelGap || (firstL !== null && arc - d + firstL < labelGap)) continue;
      if (firstL === null) firstL = d;
      lastL = d; this.labelled.add(o);
    }
    // a station per octave on the first branch of each line
    this.octSt = new Map();
    for (const b of branches) {
      if (b.side) continue;
      const octs = [...new Set(mids.filter(o => o.ln === b.i).map(o => o.oct))].sort((a, b2) => a - b2).slice(0, 4);
      octs.forEach((oc, k) => { const d = b.clear + (54 + k * 74) * u; this.octSt.set(`${b.i}:${oc}`, { b, f: d / b.P.len, oc }); });
    }

    // ---- draw ----
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setLineDash([]);
    g.fillStyle = pal.bg; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.rect(0, 0, W, ruleY); g.clip();
    g.lineJoin = 'round'; g.lineCap = 'butt';
    const line = (P, o, col, seed) => {
      if (!brush) { g.strokeStyle = pal.bg; g.lineWidth = w + (gap - w) * 2; trace(g, P, o); g.stroke(); g.strokeStyle = col; g.lineWidth = w; trace(g, P, o); g.stroke(); return; }
      // brush: a bundle of thin, slightly wandering strokes with breaks, laid over each other
      const r = mulberry(seed), prev = g.globalCompositeOperation; g.globalCompositeOperation = pal.blend; g.strokeStyle = col;
      for (let k = 0; k < 11; k++) {
        const oo = o + (r() - 0.5) * w * 1.05, ph = r() * 50, amp = w * (0.04 + r() * 0.08), fr = 0.01 + r() * 0.03, stray = k >= 9;
        g.lineWidth = stray ? 1.1 * u : w * (0.1 + r() * 0.3); g.globalAlpha = stray ? 0.45 : 0.4 + r() * 0.5;
        if (r() < 0.65) { g.setLineDash([(160 + r() * 700) * u, (3 + r() * 16) * u]); g.lineDashOffset = r() * 900 * u; } else g.setLineDash([]);
        trace(g, P, stray ? o + (r() < 0.5 ? -1 : 1) * w * (0.75 + r() * 0.4) : oo, i => amp * Math.sin(i * fr + ph));
        g.stroke();
      }
      g.setLineDash([]); g.globalAlpha = 1; g.globalCompositeOperation = prev;
    };
    for (const b of branches) line(b.P, 0, this.colors[b.i], 101 + b.i * 7 + b.side);
    for (let i = 0; i < n; i++) line(ring, offs[i], this.colors[i], 11 + i * 31);

    // the hats' dotted line: a dot for every sixteenth, bigger where a hat lands
    const slots = Math.max(1, S.lenBars * 16);
    g.fillStyle = pal.hat;
    for (let k = 0; k < slots; k++) { const p = at(ring, k / slots, this.hatO); g.globalAlpha = 0.45; g.beginPath(); g.arc(p.x, p.y, 2.2 * u, 0, TAU); g.fill(); }
    g.globalAlpha = 1;
    for (const o of highs) { const p = at(ring, o.rt / sl, this.hatO); g.beginPath(); g.arc(p.x, p.y, (3 + 2.5 * o.s) * u, 0, TAU); g.fill(); }

    // kicks: interchanges, white capsules across the bundle
    for (const o of this.kicks) this.pill(g, o.rt / sl, false);
    // melody stations
    g.fillStyle = M.pal === 'night' ? pal.ink : '#111';
    for (const o of mids) { const p = at(ring, o.rt / sl, offs[o.ln]); g.beginPath(); g.arc(p.x, p.y, w * 0.4, 0, TAU); g.fill(); }
    // names: bullets and octave stations first, then the ring's names wherever they don't collide
    this.boxes = [];
    for (const b of branches) {
      if (!b.side) continue;
      const p = at(b.P, (b.clear + 120 * u) / b.P.len), pc = pcs[b.i];
      g.fillStyle = pal.bg; g.beginPath(); g.arc(p.x, p.y, 27 * u, 0, TAU); g.fill();
      g.fillStyle = COLORS[pc]; g.beginPath(); g.arc(p.x, p.y, 23 * u, 0, TAU); g.fill();
      g.fillStyle = [2, 8].includes(pc) ? '#111' : '#fff'; g.font = `700 ${21 * u}px ${HEL}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(this.name12(pc), p.x, p.y + 1 * u);
      this.boxes.push([p.x - 28 * u, p.y - 28 * u, p.x + 28 * u, p.y + 28 * u]);
    }
    for (const st of this.octSt.values()) {
      const p = at(st.b.P, st.f); this.octDot(g, p.x, p.y, 0);
      this.boxes.push([p.x - 10 * u, p.y - 10 * u, p.x + 10 * u, p.y + 10 * u]);
      const side = st.b.i % 2 ? 1 : -1;
      this.label(g, `${this.name12(pcs[st.b.i])}${st.oc}`, p.x + p.nx * side * 18 * u, p.y + p.ny * side * 18 * u, p.nx * side, p.ny * side, `400 ${19 * u}px ${HEL}`, pal.ink, true);
    }
    for (const o of this.labelled) {
      const p = at(ring, o.rt / sl, outer + 16 * u), strong = o.s > 0.6;
      this.label(g, `${this.name12(o.pc)}${o.oct}`, p.x, p.y, p.nx, p.ny, `${strong ? 700 : 400} ${(strong ? 23 : 21) * u}px ${HEL}`, pal.ink, false);
    }
    g.restore();

    // legend sheet under the map: a rule and one octave of piano, keys in their line colours
    g.fillStyle = pal.bg; g.fillRect(0, ruleY, W, H - ruleY);
    g.fillStyle = pal.ink; g.fillRect(0, ruleY - 1.5 * u, W, 3 * u);
    const kw = 76 * u, kh = 165 * u, bw = 44 * u, bh = kh * 0.62, kx = cx - kw * 3.5, ky = ruleY + 56 * u;
    this.keys = {};
    WHITE_KEYS.forEach((pc, k) => this.keys[pc] = { x: kx + k * kw, y: ky, w: kw, h: kh, black: false });
    for (const [pc, left] of BLACK_KEYS) this.keys[pc] = { x: kx + left * kw - bw / 2, y: ky, w: bw, h: bh, black: true };
    g.lineWidth = 1.5 * u; g.strokeStyle = pal.ink;
    for (const pc of WHITE_KEYS) { const k = this.keys[pc]; g.fillStyle = pal.bg; g.fillRect(k.x, k.y, k.w, k.h); g.strokeRect(k.x, k.y, k.w, k.h); }
    for (const pc of WHITE_KEYS) if (pcs.includes(pc)) { const k = this.keys[pc]; g.fillStyle = COLORS[pc]; g.fillRect(k.x + 1.5 * u, k.y + k.h - 18 * u, k.w - 3 * u, 16.5 * u); }
    for (const [pc] of BLACK_KEYS) {
      const k = this.keys[pc]; g.fillStyle = pal.ink; g.fillRect(k.x, k.y, k.w, k.h);
      if (pcs.includes(pc)) { g.fillStyle = COLORS[pc]; g.fillRect(k.x + 3 * u, k.y + k.h - 16 * u, k.w - 6 * u, 13 * u); }
    }
    g.font = `400 ${15 * u}px ${MONO}`; g.fillStyle = pal.mute; g.textBaseline = 'alphabetic';
    g.textAlign = 'left'; g.fillText('LINES', kx, ky - 16 * u);
    g.textAlign = 'right'; g.fillText(pcs.map(pc => this.name12(pc)).join(' '), kx + kw * 7, ky - 16 * u);
    this.progY = ky + kh + 44 * u; this.kx = kx; this.kw7 = kw * 7;
  },

  // text set off the map with a halo in the paper colour, placed on the side the normal points to
  // force: draw even if it overlaps something already placed (it still claims its space)
  label(g, text, x, y, nx, ny, font, col, force) {
    g.font = font; g.textBaseline = 'middle';
    const align = nx > 0.35 ? 'left' : nx < -0.35 ? 'right' : 'center'; g.textAlign = align;
    const yy = y + (Math.abs(nx) <= 0.35 ? ny * 8 * u : 0), tw = g.measureText(text).width, th = parseFloat(font.split(' ')[1]) * 0.8;
    const x0 = align === 'left' ? x : align === 'right' ? x - tw : x - tw / 2, box = [x0 - 3 * u, yy - th / 2 - 3 * u, x0 + tw + 3 * u, yy + th / 2 + 3 * u];
    if (this.boxes) {
      if (!force && this.boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return false;
      this.boxes.push(box);
    }
    g.lineJoin = 'round'; g.strokeStyle = this.pal.bg; g.lineWidth = 6 * u; g.strokeText(text, x, yy);
    g.fillStyle = col; g.fillText(text, x, yy);
    return true;
  },
  pill(g, f, lit, a = 1) {
    const p0 = at(this.ring, f, this.offs[0] - this.w * 0.7), p1 = at(this.ring, f, this.offs[this.n - 1] + this.w * 0.7), r = this.w * 0.5;
    g.save(); g.globalAlpha = a; g.lineCap = 'round';
    g.strokeStyle = this.pal.ink; g.lineWidth = r * 2 + 4 * u; g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
    g.strokeStyle = lit ? this.pal.ink : this.pal.bg; g.lineWidth = r * 2; g.beginPath(); g.moveTo(p0.x, p0.y); g.lineTo(p1.x, p1.y); g.stroke();
    g.restore();
  },
  octDot(g, x, y, lit, col) {
    g.fillStyle = this.pal.ink; g.beginPath(); g.arc(x, y, 9 * u, 0, TAU); g.fill();
    g.fillStyle = this.pal.bg; g.beginPath(); g.arc(x, y, 5 * u, 0, TAU); g.fill();
    if (lit > 0) { g.globalAlpha = lit; g.fillStyle = col; g.beginPath(); g.arc(x, y, 5.5 * u, 0, TAU); g.fill(); g.globalAlpha = 1; }
  },

  /* ---------------- a frame ---------------- */
  draw(tau) {
    const M = S.metro, sl = segLen(), bd = barDur(), pal = this.pal || PALS.paper;
    if (!this.ring) this.buildMap();
    ctx.drawImage(this.map, 0, 0);
    const ring = this.ring, seg = S.seg || [], night = M.pal === 'night';
    const keyLit = new Array(12).fill(0);

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, this.ruleY); ctx.clip();
    // micro trams first, so the stations sit on top of them
    const life = bd * (0.45 + 1.4 * M.trams), reach = (0.035 + 0.1 * M.trams);
    if (M.trams > 0.01) for (const o of seg) {
      if (o.ln < 0) continue;
      const age = mod(tau - o.rt, sl); if (age > life) continue;
      const a = age / life, f = o.rt / sl + reach * (1 - (1 - a) ** 3), p = at(ring, f, this.offs[o.ln]);
      const al = Math.min(1, a * 12) * (1 - a ** 4), L = 15 * u, T = this.w * 0.52;
      ctx.globalAlpha = al; ctx.lineCap = 'round';
      ctx.strokeStyle = pal.bg; ctx.lineWidth = T * 2 + 4 * u; ctx.beginPath(); ctx.moveTo(p.x - p.tx * L, p.y - p.ty * L); ctx.lineTo(p.x + p.tx * L, p.y + p.ty * L); ctx.stroke();
      ctx.strokeStyle = night ? '#f1f1f1' : '#111'; ctx.lineWidth = T * 2; ctx.stroke();
      ctx.fillStyle = this.colors[o.ln];   // windows in the line's colour
      for (const s of [-0.55, 0, 0.55]) { ctx.beginPath(); ctx.arc(p.x + p.tx * L * s, p.y + p.ty * L * s, T * 0.38, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // kicks: the interchange goes dark for a moment and a ring opens round it
    for (const o of this.kicks || []) {
      const age = mod(tau - o.rt, sl); if (age > 0.5) continue;
      const k = 1 - age / 0.5;
      this.pill(ctx, o.rt / sl, true, k ** 1.5);
      const p = at(ring, o.rt / sl, 0); ctx.strokeStyle = pal.ink; ctx.globalAlpha = k * 0.5 * o.s; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.arc(p.x, p.y, this.span / 2 + this.w + (1 - k) * 60 * u, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // hats pop on the dotted line
    ctx.fillStyle = pal.ink;
    for (const o of seg) {
      if (o.type !== 'high') continue; const age = mod(tau - o.rt, sl); if (age > 0.25) continue;
      const k = 1 - age / 0.25, p = at(ring, o.rt / sl, this.hatO);
      ctx.globalAlpha = k; ctx.beginPath(); ctx.arc(p.x, p.y, (3.5 + 4 * o.s * k) * u, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // melody: the station flares in its line's colour, its octave station lights up, its key goes down
    for (const o of seg) {
      if (o.ln < 0) continue; const age = mod(tau - o.rt, sl); if (age > 1.2) continue;
      const k = Math.exp(-age / 0.32), col = this.colors[o.ln];
      keyLit[o.pc] = Math.max(keyLit[o.pc], k);
      if (age < 0.7) {
        const p = at(ring, o.rt / sl, this.offs[o.ln]), e = age / 0.7;
        ctx.strokeStyle = col; ctx.lineWidth = 3 * u; ctx.globalAlpha = (1 - e) ** 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, this.w * 0.5 + e * 34 * u, 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1; ctx.fillStyle = pal.bg; ctx.beginPath(); ctx.arc(p.x, p.y, this.w * (0.4 + 0.3 * (1 - e)), 0, TAU); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(p.x, p.y, this.w * (0.28 + 0.2 * (1 - e)), 0, TAU); ctx.fill();
      }
      const st = this.octSt && this.octSt.get(`${o.ln}:${o.oct}`);
      if (st) { const p = at(st.b.P, st.f); this.octDot(ctx, p.x, p.y, k, col); }
    }
    // "now": a red dot riding the dotted line
    { const p = at(ring, tau / sl, this.hatO); ctx.fillStyle = pal.bg; ctx.beginPath(); ctx.arc(p.x, p.y, 10 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(p.x, p.y, 7 * u, 0, TAU); ctx.fill(); }

    // the title in the middle of the ring, like a district on a map
    const words = titleCase(S.title || '').split(/\s+/).filter(Boolean), maxW = (this.R + this.offs[0] - 60 * u) * 2 * 0.86;
    let ts = 86 * u; ctx.font = `700 ${ts}px ${HEL}`;
    let lines = [words.join(' ')];
    if (words.length > 1 && ctx.measureText(lines[0]).width > maxW) {
      let best = null; for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width); if (!best || m < best.m) best = { a, b, m }; }
      lines = [best.a, best.b];
    }
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    if (widest > maxW) { ts *= maxW / widest; ctx.font = `700 ${ts}px ${HEL}`; }
    const ty = this.cy + (M.ring === 'heart' ? 0.06 * this.R : 0) - (lines.length - 1) * ts * 0.52;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.ink;
    lines.forEach((l, i) => ctx.fillText(l, cx, ty + i * ts * 1.04));
    ctx.restore();

    // top line: who and what
    const mx = W * 0.08, yT = H * 0.058;
    ctx.font = `400 ${17 * u}px ${MONO}`; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = pal.bg; ctx.globalAlpha = 0.85; ctx.fillRect(0, yT - 30 * u, W, 44 * u); ctx.globalAlpha = 1;
    ctx.fillStyle = pal.mute;
    spaced((S.tag || '').toUpperCase(), mx, yT, 2.5 * u, 'left');
    spaced([`${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('  ·  '), W - mx, yT, 2.5 * u, 'right');

    // the piano: keys go down in their line's colour
    for (let pc = 0; pc < 12; pc++) {
      const k = this.keys && this.keys[pc], v = keyLit[pc]; if (!k || v < 0.02) continue;
      ctx.globalAlpha = v * (k.black ? 1 : 0.9); ctx.fillStyle = COLORS[pc];
      ctx.fillRect(k.x + 2 * u, k.y + 2 * u, k.w - 4 * u, k.h - 4 * u);
    }
    ctx.globalAlpha = 1;
    // progress: the section as a line, bars ticked, time underneath
    const kx = this.kx, pw = this.kw7, py = this.progY, prog = tau / sl;
    ctx.fillStyle = pal.mute; ctx.globalAlpha = 0.5; ctx.fillRect(kx, py - 1 * u, pw, 2 * u); ctx.globalAlpha = 1;
    ctx.fillStyle = pal.ink; ctx.fillRect(kx, py - 2 * u, pw * prog, 4 * u);
    for (let b = 0; b <= S.lenBars; b++) { const x = kx + pw * b / S.lenBars; ctx.fillRect(x - 0.75 * u, py + 6 * u, 1.5 * u, (b % 4 === 0 ? 10 : 5) * u); }
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(kx + pw * prog, py, 6 * u, 0, TAU); ctx.fill();
    const bar = S.startBar + Math.floor(tau / bd) + 1, beat = Math.floor(mod(tau, bd) / (bd / 4)) + 1;
    ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced(fmtT(tau), kx, py + 44 * u, 1.5 * u, 'left');
    spaced(`BAR ${pad(bar, 2)}.${beat} / ${pad(S.startBar + S.lenBars, 2)}`, kx + pw, py + 44 * u, 1.5 * u, 'right');

    if (pal.grain) grain(pal.grain);
  }
};

export default METRO;
