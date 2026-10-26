// METRO: the loop as a transit map.
// The ring is one line, the loop line: one trip round it is the whole section, starting at the top
// (its shape is a setting). Every melody note is a station on it, in its note's colour; a chord stacks
// its notes outward, lowest on the line. Kicks are ticks on the inside, the hats are the dotted line
// within, where a red dot marks "now". Each note the melody uses most also has its own line running out
// of the ring, with a station for every octave it was played in and its bullet at the end.
// When a note plays its station flares, a micro tram leaves it along the loop, its octave station lights
// up and its key goes down on the piano below (held as long as the note, with a MIDI loaded).
// The notes come from a MIDI when one is loaded (audio/midi.js), otherwise from the audio analysis.
// The map itself is drawn once into an offscreen canvas; a frame adds only what moves.
import { S, segLen, barDur } from '../state.js';
import { ctx, W, H, u, cx, grain, spaced, MONO } from '../render/canvas.js';
import { clamp, mod, TAU, mulberry, pad, fmtT, titleCase } from '../util.js';

const HEL = '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif';
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
// one colour per note, transit-map style. Notes a semitone apart and notes a fifth apart get colours
// far from each other: C red, C♯ sky, D yellow, D♯ purple, E green, F orange, F♯ magenta, G blue,
// G♯ lime, A brown, A♯ teal, B indigo
const COLORS = ['#e8352e', '#19a7e0', '#f2c200', '#7d3c98', '#00a651', '#f26b21', '#d81b84', '#0a52b5', '#86c440', '#9a5b34', '#00a199', '#3d3d9e'];
const DARK_TEXT = [2, 8];   // yellow and lime take dark text
const RED = '#e5382b';
const PALS = {
  paper: { bg: '#ffffff', ink: '#111111', mute: '#8c8c8c', hat: '#b4b6b9', grain: 0, blend: 'multiply' },
  dust:  { bg: '#ddd5d0', ink: '#1d1a19', mute: '#7b726d', hat: '#958c87', grain: 0.045, blend: 'multiply' },
  night: { bg: '#0c0c0f', ink: '#ededed', mute: '#77777f', hat: '#55555e', grain: 0.035, blend: 'screen' }
};
const BLACK = new Set([1, 3, 6, 8, 10]);

// ring outlines in units of the ring's radius, clockwise from the top (y points down)
const SHAPES = {
  square: [[0, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86], [-0.86, -0.86]],
  diamond: [[0, -1.1], [1.1, 0], [0, 1.1], [-1.1, 0]],
  octagon: [[0, -0.95], [0.4, -0.95], [0.95, -0.4], [0.95, 0.4], [0.4, 0.95], [-0.4, 0.95], [-0.95, 0.4], [-0.95, -0.4], [-0.4, -0.95]],
  heart: [[0, -0.5], [0.32, -0.82], [0.72, -0.82], [1.04, -0.5], [1.04, -0.08], [0, 0.96], [-1.04, -0.08], [-1.04, -0.5], [-0.72, -0.82], [-0.32, -0.82]]
};

/* ---------------- paths: dense points with normals ---------------- */
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
// the point inside a closed outline farthest from its edge (where a title sits best), and that distance
function widestPoint(P, o) {
  const poly = []; for (let i = 0; i < P.n; i += 4) poly.push([P.x[i] + P.nx[i] * o, P.y[i] + P.ny[i] * o]);
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const dist = (x, y) => { let m = Infinity; for (const [px, py] of poly) m = Math.min(m, (px - x) ** 2 + (py - y) ** 2); return Math.sqrt(m); };
  let best = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, r: 0 };
  const scan = (ax, bx, ay, by, step) => { for (let y = ay; y <= by; y += step) for (let x = ax; x <= bx; x += step) if (inside(x, y)) { const r = dist(x, y); if (r > best.r) best = { x, y, r }; } };
  scan(x0, x1, y0, y1, (x1 - x0) / 40);
  const s = (x1 - x0) / 40; scan(best.x - s, best.x + s, best.y - s, best.y + s, s / 8);
  return best;
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
  defaults: { ring: 'circle', pal: 'paper', style: 'clean', trams: 0.5, labels: 'few' },
  controls: [
    { key: 'ring', label: 'Ring', type: 'choice', options: [['circle', 'circle'], ['heart', 'heart'], ['diamond', 'diamond'], ['square', 'square'], ['octagon', 'octagon']], then: 'buildMap' },
    { key: 'style', label: 'Lines', type: 'choice', options: [['clean', 'clean'], ['brush', 'brush']], then: 'buildMap' },
    { key: 'pal', label: 'Map', type: 'choice', options: [['paper', 'paper'], ['dust', 'dust'], ['night', 'night']], then: 'buildMap' },
    { key: 'labels', label: 'Station names', type: 'choice', options: [['few', 'few'], ['more', 'more'], ['none', 'none']], then: 'buildMap' },
    { key: 'trams', label: 'Micro trams', type: 'range', min: 0, max: 1, step: 0.01 }
  ],
  map: document.createElement('canvas'),
  notes: [], pcs: null, flats: true,

  setup() { this.map.width = W; this.map.height = H; this.mctx = this.map.getContext('2d'); this.buildMap(); },

  prepare(seg) {
    const count = new Array(12).fill(0), notes = [];
    for (const o of seg) {
      if (o.type !== 'mid' || !(o.p > 20)) continue;
      o.mm = o.mm || midiOf(o.p); o.pc = mod(o.mm, 12); o.oct = Math.floor(o.mm / 12) - 1;
      count[o.pc]++; notes.push(o);
    }
    this.notes = notes;
    // the notes used most get their own lines out of the ring (at most six, piano order)
    const pcs = count.map((n, pc) => [n, pc]).filter(a => a[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 6).map(a => a[1]);
    for (const pc of keyTriad()) if (pcs.length < 3 && !pcs.includes(pc)) pcs.push(pc);
    this.pcs = pcs.sort((a, b) => a - b);
    this.flats = seg.some(o => /b/.test(o.note || '')) || /^[A-G]\s*[b♭]/.test((S.key || '').trim());
    // the piano: the octaves the melody covers (one to three)
    let lo = 60, hi = 71;
    if (notes.length) { lo = Math.min(...notes.map(o => o.mm)); hi = Math.max(...notes.map(o => o.mm)); }
    // from the C or F below the lowest note to the E or B above the highest; one octave at least, three at most
    if (hi - lo > 35) { const per = new Array(128).fill(0); for (const o of notes) per[o.mm]++; let bestL = lo, bv = -1; for (let l = lo; l + 35 <= hi; l++) { let v = 0; for (let k = l; k <= l + 35; k++) v += per[k]; if (v > bv) { bv = v; bestL = l; } } lo = bestL; hi = bestL + 35; }
    while (![0, 5].includes(lo % 12)) lo--;
    while (![4, 11].includes(hi % 12)) hi++;
    while (hi - lo < 11) { hi++; while (![4, 11].includes(hi % 12)) hi++; }
    this.keyLo = lo; this.keyHi = hi;
    this.played = new Set(notes.map(o => o.mm));
    this.buildMap();
  },

  name12(pc) { return (this.flats ? FLAT : SHARP)[pc]; },
  noteText(o) { return `${this.name12(o.pc)}${o.oct}`; },

  /* ---------------- the static map ---------------- */
  buildMap() {
    if (!this.mctx || this.map.width !== W) return;
    const g = this.mctx, M = S.metro, pal = PALS[M.pal] || PALS.paper, brush = M.style === 'brush';
    const pcs = this.pcs || keyTriad().sort((a, b) => a - b), sl = segLen(), bd = barDur(), seg = S.seg || [], notes = this.notes || [];
    const rw = 14 * u, bw = 10 * u, cas = 5 * u;   // ring width, branch width, the paper gap round every line
    const cy = H * 0.34, R = W * 0.31, ruleY = H * 0.655;
    Object.assign(this, { pal, rw, cy, R, ruleY });

    // the ring
    let ring;
    if (M.ring === 'circle' || !SHAPES[M.ring]) {
      const pts = []; for (let i = 0; i < 720; i++) { const a = -Math.PI / 2 + TAU * i / 720; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
      ring = resample(pts, 900, true);
    } else {
      const V = SHAPES[M.ring].map(([x, y]) => [cx + x * R, cy + y * R]);
      ring = resample(fillet(V, R * 0.26, true), 900, true);
      let best = 0, bdist = Infinity; for (let i = 0; i < ring.n; i++) { const d = (ring.x[i] - V[0][0]) ** 2 + (ring.y[i] - V[0][1]) ** 2; if (d < bdist) { bdist = d; best = i; } }
      for (const k of ['x', 'y', 'nx', 'ny']) ring[k] = Float32Array.from({ length: ring.n }, (_, i) => ring[k][(i + best) % ring.n]);
    }
    this.ring = ring;
    this.kickO = -rw / 2; this.hatO = -rw / 2 - 30 * u;
    this.center = widestPoint(ring, this.hatO - 12 * u);

    // stations: notes sharing a moment stack outward, lowest on the line
    const groups = [];
    for (const o of notes) { const gl = groups[groups.length - 1]; if (gl && Math.abs(gl.rt - o.rt) < 1e-3) gl.notes.push(o); else groups.push({ rt: o.rt, notes: [o] }); }
    let minGap = Infinity;
    for (let i = 0; i < groups.length; i++) { const a = groups[i].rt, b = i + 1 < groups.length ? groups[i + 1].rt : groups[0].rt + sl; minGap = Math.min(minGap, (b - a) / sl * ring.len); }
    const sr = clamp(minGap * 0.42, 5 * u, 10 * u); this.sr = sr;
    for (const gr of groups) {
      gr.notes.sort((a, b) => a.mm - b.mm);
      gr.notes.slice(0, 4).forEach((o, k) => { const p = at(ring, gr.rt / sl, k * (sr * 2 + 3 * u)); o.sx = p.x; o.sy = p.y; o.stk = k; });
      gr.notes.slice(4).forEach(o => { o.sx = null; });
      gr.top = Math.min(4, gr.notes.length) - 1;
    }
    this.groups = groups;

    // the note lines: one branch each, ends spread evenly round the ring. Out along the normal (snapped to 45°),
    // then one bend of 45° or 90°, whichever leaves the most room inside the frame for its stations
    const rnd = mulberry(7919 + pcs.reduce((a, b) => a * 13 + b, 0)), m = 44 * u, topY = H * 0.058 + 30 * u;
    const snap = (x, y) => Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
    const free = (x, y, a) => {   // how far from (x, y) in direction a before leaving the frame's margins
      const dx = Math.cos(a), dy = Math.sin(a); let t = 1e9;
      if (dx > 1e-6) t = Math.min(t, (W - m - x) / dx); if (dx < -1e-6) t = Math.min(t, (m - x) / dx);
      if (dy > 1e-6) t = Math.min(t, (ruleY - m - y) / dy); if (dy < -1e-6) t = Math.min(t, (topY - y) / dy);
      return Math.max(0, t);
    };
    const n = pcs.length, branches = [];
    for (let i = 0; i < n; i++) {
      const f = (i + 0.5) / n + 0.5 / n * 0.35, p = at(ring, f, 0), a0 = snap(p.nx, p.ny);
      const L1 = clamp(free(p.x, p.y, a0) * (0.3 + rnd() * 0.2), 50 * u, 150 * u);
      const P1 = [p.x + Math.cos(a0) * L1, p.y + Math.sin(a0) * L1];
      const turns = [1, -1].map(sg => [sg * Math.PI / 4, sg * Math.PI / 2]).flat().map(t => ({ a: a0 + t, room: free(P1[0], P1[1], a0 + t), diag: Math.abs(t) < 1 }));
      const most = Math.max(...turns.map(t => t.room)), pick = turns.filter(t => t.room >= most * 0.8).sort((a, b) => (b.diag - a.diag) || (b.room - a.room))[0];
      const P2 = [P1[0] + Math.cos(pick.a) * H * 1.5, P1[1] + Math.sin(pick.a) * H * 1.5];
      branches.push({ i, pc: pcs[i], room: L1 + pick.room, P: resample(fillet([[p.x, p.y], P1, P2], 60 * u, false), 0, false) });
    }
    this.branches = branches;
    // stations along each line: one per octave the note was played in, then the bullet, all inside the frame
    this.octSt = new Map();
    for (const b of branches) {
      const octs = [...new Set(notes.filter(o => o.pc === b.pc).map(o => o.oct))].sort((a, c) => a - c).slice(0, 4);
      const start = rw / 2 + 50 * u, end = Math.max(start + 40 * u, b.room - 30 * u), step = Math.min(70 * u, (end - start) / (octs.length + 0.5));
      octs.forEach((oc, k) => this.octSt.set(`${b.pc}:${oc}`, { b, f: (start + k * step) / b.P.len, oc }));
      b.bulletF = Math.min(start + octs.length * step + 30 * u, end) / b.P.len;
      // the line ends at its bullet, like a terminus, instead of running off the map
      const k = Math.min(b.P.n, Math.ceil(b.bulletF * (b.P.n - 1)) + 1);
      b.draw = { ...b.P, x: b.P.x.slice(0, k), y: b.P.y.slice(0, k), nx: b.P.nx.slice(0, k), ny: b.P.ny.slice(0, k), n: k };
    }

    // ---- draw ----
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.setLineDash([]);
    g.fillStyle = pal.bg; g.fillRect(0, 0, W, H);
    g.save(); g.beginPath(); g.rect(0, 0, W, ruleY); g.clip();
    g.lineJoin = 'round'; g.lineCap = 'butt';
    const line = (P, o, w, col, seed) => {
      if (!brush) { g.strokeStyle = pal.bg; g.lineWidth = w + cas * 2; trace(g, P, o); g.stroke(); g.strokeStyle = col; g.lineWidth = w; trace(g, P, o); g.stroke(); return; }
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
    for (const b of branches) line(b.draw, 0, bw, COLORS[b.pc], 101 + b.pc * 7);
    line(ring, 0, rw, pal.ink, 11);

    // the hats' dotted line: a dot for every sixteenth, bigger where a hat lands
    const slots = Math.max(1, S.lenBars * 16);
    g.fillStyle = pal.hat;
    for (let k = 0; k < slots; k++) { const p = at(ring, k / slots, this.hatO); g.beginPath(); g.arc(p.x, p.y, 1.8 * u, 0, TAU); g.fill(); }
    for (const o of seg) if (o.type === 'high') { const p = at(ring, o.rt / sl, this.hatO); g.beginPath(); g.arc(p.x, p.y, (2.6 + 2 * o.s) * u, 0, TAU); g.fill(); }
    // kicks: the strongest, at most one a beat, as ticks on the inside of the ring
    const lows = seg.filter(o => o.type === 'low'), cut = Math.max(0.35, lows.map(o => o.s).sort((a, b) => a - b)[Math.floor(lows.length * 0.5)] || 0);
    let lastK = -1e9; this.kicks = [];
    for (const o of lows) { if (o.s < cut || o.rt - lastK < bd / 4 - 1e-6) continue; lastK = o.rt; this.kicks.push(o); }
    g.strokeStyle = pal.ink; g.lineCap = 'butt';
    for (const o of this.kicks) this.tick(g, o.rt / sl, 0);
    // stations
    for (const gr of groups) for (const o of gr.notes) if (o.sx != null) this.station(g, o.sx, o.sy, COLORS[o.pc], 0);
    // names: octave stations and bullets first, then the loop's stations where they don't collide
    this.boxes = [];
    g.textBaseline = 'middle';
    for (const st of this.octSt.values()) {
      const p = at(st.b.P, st.f); this.octDot(g, p.x, p.y, 0);
      this.boxes.push([p.x - 10 * u, p.y - 10 * u, p.x + 10 * u, p.y + 10 * u]);
      const side = st.b.i % 2 ? 1 : -1;
      this.label(g, `${this.name12(st.b.pc)}${st.oc}`, p.x + p.nx * side * 18 * u, p.y + p.ny * side * 18 * u, p.nx * side, p.ny * side, `400 ${19 * u}px ${HEL}`, pal.ink, true);
    }
    for (const b of branches) {
      const p = at(b.P, b.bulletF);
      g.fillStyle = pal.bg; g.beginPath(); g.arc(p.x, p.y, 28 * u, 0, TAU); g.fill();
      g.fillStyle = COLORS[b.pc]; g.beginPath(); g.arc(p.x, p.y, 24 * u, 0, TAU); g.fill();
      g.fillStyle = DARK_TEXT.includes(b.pc) ? '#111' : '#fff'; g.font = `700 ${21 * u}px ${HEL}`; g.textAlign = 'center';
      g.fillText(this.name12(b.pc), p.x, p.y + 1 * u);
      this.boxes.push([p.x - 29 * u, p.y - 29 * u, p.x + 29 * u, p.y + 29 * u]);
    }
    // a station gets its name when it's the first of its note for a while, and only if there's room
    if (M.labels !== 'none') {
      const gapArc = (M.labels === 'few' ? 110 : 56) * u, repeat = M.labels === 'few' ? 0.5 : 0.2, seen = new Map(); let last = -1e9;
      for (const gr of groups) {
        const o = gr.notes[0], key = this.noteText(o), d = gr.rt / sl * ring.len;
        if (d - last < gapArc) continue;
        if (seen.has(key) && gr.rt / sl - seen.get(key) < repeat) continue;
        const p = at(ring, gr.rt / sl, gr.top * (sr * 2 + 3 * u) + sr + 16 * u), strong = o.s > 0.6;
        if (this.label(g, key, p.x, p.y, p.nx, p.ny, `${strong ? 700 : 500} ${(strong ? 23 : 21) * u}px ${HEL}`, pal.ink, false)) { last = d; seen.set(key, gr.rt / sl); }
      }
    }
    g.restore();

    // legend sheet under the map: a rule and the piano, the keys the melody plays marked in their colours
    g.fillStyle = pal.bg; g.fillRect(0, ruleY, W, H - ruleY);
    g.fillStyle = pal.ink; g.fillRect(0, ruleY - 1.5 * u, W, 3 * u);
    const lo = this.keyLo ?? 48, hi = this.keyHi ?? 71, whites = []; for (let m = lo; m <= hi; m++) if (!BLACK.has(m % 12)) whites.push(m);
    const PW = 560 * u, kw = PW / whites.length, kh = 150 * u, kx = cx - PW / 2, ky = ruleY + 58 * u, bkw = kw * 0.62, bkh = kh * 0.62;
    this.keys = {};
    whites.forEach((m, k) => { this.keys[m] = { x: kx + k * kw, y: ky, w: kw, h: kh, black: false }; });
    for (let m = lo; m <= hi; m++) if (BLACK.has(m % 12)) { const left = this.keys[m - 1]; if (left) this.keys[m] = { x: left.x + kw - bkw / 2, y: ky, w: bkw, h: bkh, black: true }; }
    g.lineWidth = 1.5 * u; g.strokeStyle = pal.ink;
    for (const m of whites) { const k = this.keys[m]; g.fillStyle = pal.bg; g.fillRect(k.x, k.y, k.w, k.h); g.strokeRect(k.x, k.y, k.w, k.h); }
    for (const m of whites) if (this.played && this.played.has(m)) { const k = this.keys[m]; g.fillStyle = COLORS[m % 12]; g.fillRect(k.x + 1.5 * u, k.y + k.h - 14 * u, k.w - 3 * u, 12.5 * u); }
    for (let m = lo; m <= hi; m++) {
      const k = this.keys[m]; if (!k || !k.black) continue;
      g.fillStyle = pal.ink; g.fillRect(k.x, k.y, k.w, k.h);
      if (this.played && this.played.has(m)) { g.fillStyle = COLORS[m % 12]; g.fillRect(k.x + 2.5 * u, k.y + k.h - 12 * u, k.w - 5 * u, 9.5 * u); }
    }
    g.font = `400 ${13 * u}px ${MONO}`; g.fillStyle = pal.mute; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (const m of whites) if (m % 12 === 0) { const k = this.keys[m]; g.fillText(`C${m / 12 - 1}`, k.x + k.w / 2, ky + kh + 20 * u); }
    this.kx = kx; this.pw = PW; this.progY = ky + kh + 58 * u;
  },

  label(g, text, x, y, nx, ny, font, col, force) {
    g.font = font; g.textBaseline = 'middle';
    const align = nx > 0.35 ? 'left' : nx < -0.35 ? 'right' : 'center'; g.textAlign = align;
    const yy = y + (Math.abs(nx) <= 0.35 ? ny * 8 * u : 0), tw = g.measureText(text).width, th = parseFloat(font.split(' ')[1]) * 0.8;
    const x0 = align === 'left' ? x : align === 'right' ? x - tw : x - tw / 2, box = [x0 - 4 * u, yy - th / 2 - 4 * u, x0 + tw + 4 * u, yy + th / 2 + 4 * u];
    if (this.boxes) {
      if (!force && this.boxes.some(b => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return false;
      this.boxes.push(box);
    }
    g.lineJoin = 'round'; g.strokeStyle = this.pal.bg; g.lineWidth = 6 * u; g.strokeText(text, x, yy);
    g.fillStyle = col; g.fillText(text, x, yy);
    return true;
  },
  station(g, x, y, col, lit) {
    const r = this.sr * (1 + 0.35 * lit);
    g.fillStyle = this.pal.bg; g.beginPath(); g.arc(x, y, r + 3 * u, 0, TAU); g.fill();
    g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  },
  tick(g, f, lit) {
    const p = at(this.ring, f, this.kickO), q = at(this.ring, f, this.kickO - (11 + 13 * lit) * u);
    g.lineWidth = (2.5 + 2 * lit) * u; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
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
    const ring = this.ring, seg = S.seg || [], notes = this.notes || [];
    const keyLit = {};

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, this.ruleY); ctx.clip();
    // micro trams: little cars in the note's colour leaving the station along the loop
    const life = bd * (0.45 + 1.3 * M.trams), reach = 0.03 + 0.09 * M.trams;
    if (M.trams > 0.01) for (const o of notes) {
      if (o.sx == null || o.stk) continue;
      const age = mod(tau - o.rt, sl); if (age > life) continue;
      const a = age / life, p = at(ring, o.rt / sl + reach * (1 - (1 - a) ** 3), 0);
      const al = Math.min(1, a * 12) * (1 - a ** 4), L = 13 * u, T = this.rw * 0.42;
      ctx.globalAlpha = al; ctx.lineCap = 'round';
      ctx.strokeStyle = pal.bg; ctx.lineWidth = T * 2 + 4 * u; ctx.beginPath(); ctx.moveTo(p.x - p.tx * L, p.y - p.ty * L); ctx.lineTo(p.x + p.tx * L, p.y + p.ty * L); ctx.stroke();
      ctx.strokeStyle = COLORS[o.pc]; ctx.lineWidth = T * 2; ctx.stroke();
      ctx.fillStyle = pal.bg; for (const s of [-0.5, 0.5]) { ctx.beginPath(); ctx.arc(p.x + p.tx * L * s, p.y + p.ty * L * s, T * 0.32, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    // kicks: the tick reaches in and a faint ring opens round the line
    ctx.strokeStyle = pal.ink;
    for (const o of this.kicks || []) {
      const age = mod(tau - o.rt, sl); if (age > 0.45) continue;
      const k = 1 - age / 0.45; this.tick(ctx, o.rt / sl, k ** 2);
    }
    // hats pop on the dotted line
    ctx.fillStyle = pal.ink;
    for (const o of seg) {
      if (o.type !== 'high') continue; const age = mod(tau - o.rt, sl); if (age > 0.22) continue;
      const k = 1 - age / 0.22, p = at(ring, o.rt / sl, this.hatO);
      ctx.globalAlpha = k; ctx.beginPath(); ctx.arc(p.x, p.y, (3 + 3.5 * o.s * k) * u, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // notes: the station flares, its octave station lights up, its key goes down
    for (const o of notes) {
      const age = mod(tau - o.rt, sl), hold = o.dur > 0 ? Math.min(o.dur, sl * 0.9) : 0;
      if (age > hold + 0.9) continue;
      const k = age < hold ? 1 : Math.exp(-(age - hold) / 0.25), col = COLORS[o.pc];
      keyLit[o.mm] = Math.max(keyLit[o.mm] || 0, k);
      if (o.sx != null && age < 0.6) {
        const e = age / 0.6;
        ctx.strokeStyle = col; ctx.lineWidth = 3 * u; ctx.globalAlpha = (1 - e) ** 1.5;
        ctx.beginPath(); ctx.arc(o.sx, o.sy, this.sr + 3 * u + e * 30 * u, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        this.station(ctx, o.sx, o.sy, col, 1 - e);
      }
      const st = this.octSt && this.octSt.get(`${o.pc}:${o.oct}`);
      if (st) { const p = at(st.b.P, st.f); this.octDot(ctx, p.x, p.y, k, col); }
    }
    // "now": a red dot riding the dotted line
    { const p = at(ring, tau / sl, this.hatO); ctx.fillStyle = pal.bg; ctx.beginPath(); ctx.arc(p.x, p.y, 10 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(p.x, p.y, 7 * u, 0, TAU); ctx.fill(); }

    // the title, set in the widest part of the shape
    const c = this.center, words = titleCase(S.title || '').split(/\s+/).filter(Boolean);
    if (words.length && c) {
      let ts = 86 * u; ctx.font = `700 ${ts}px ${HEL}`;
      let lines = [words.join(' ')];
      if (words.length > 1 && ctx.measureText(lines[0]).width > c.r * 1.6) {
        let best = null; for (let i = 1; i < words.length; i++) { const a = words.slice(0, i).join(' '), b = words.slice(i).join(' '), m = Math.max(ctx.measureText(a).width, ctx.measureText(b).width); if (!best || m < best.m) best = { a, b, m }; }
        lines = [best.a, best.b];
      }
      // the block (half width, half height) has to fit inside the circle of radius r round the centre
      const wMax = Math.max(...lines.map(l => ctx.measureText(l).width)) / 2, hMax = lines.length * ts * 1.04 / 2, fit = c.r * 0.9 / Math.hypot(wMax, hMax);
      if (fit < 1) { ts *= fit; ctx.font = `700 ${ts}px ${HEL}`; }
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.ink;
      const y0 = c.y - (lines.length - 1) * ts * 0.52;
      lines.forEach((l, i) => ctx.fillText(l, c.x, y0 + i * ts * 1.04));
    }
    ctx.restore();

    // top line: who and what
    const mx = W * 0.08, yT = H * 0.058;
    ctx.font = `400 ${17 * u}px ${MONO}`; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = pal.bg; ctx.globalAlpha = 0.85; ctx.fillRect(0, yT - 30 * u, W, 44 * u); ctx.globalAlpha = 1;
    ctx.fillStyle = pal.mute;
    spaced((S.tag || '').toUpperCase(), mx, yT, 2.5 * u, 'left');
    spaced([`${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('  ·  '), W - mx, yT, 2.5 * u, 'right');

    // the piano: each played key goes down in its note's colour
    for (const m in keyLit) {
      const k = this.keys && this.keys[m], v = keyLit[m]; if (!k || v < 0.02) continue;
      ctx.globalAlpha = v; ctx.fillStyle = COLORS[m % 12];
      ctx.fillRect(k.x + 2 * u, k.y + 2 * u, k.w - 4 * u, k.h - 4 * u);
    }
    ctx.globalAlpha = 1;
    // progress: the section as a line, bars ticked, time underneath
    const kx = this.kx, pw = this.pw, py = this.progY, prog = tau / sl;
    ctx.fillStyle = pal.mute; ctx.globalAlpha = 0.5; ctx.fillRect(kx, py - 1 * u, pw, 2 * u); ctx.globalAlpha = 1;
    ctx.fillStyle = pal.ink; ctx.fillRect(kx, py - 2 * u, pw * prog, 4 * u);
    for (let b = 0; b <= S.lenBars; b++) { const x = kx + pw * b / S.lenBars; ctx.fillRect(x - 0.75 * u, py + 6 * u, 1.5 * u, (b % 4 === 0 ? 10 : 5) * u); }
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(kx + pw * prog, py, 6 * u, 0, TAU); ctx.fill();
    const bar = S.startBar + Math.floor(tau / bd) + 1, beat = Math.floor(mod(tau, bd) / (bd / 4)) + 1;
    ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced(fmtT(tau), kx, py + 40 * u, 1.5 * u, 'left');
    spaced(`BAR ${pad(bar, 2)}.${beat} / ${pad(S.startBar + S.lenBars, 2)}`, kx + pw, py + 40 * u, 1.5 * u, 'right');

    if (pal.grain) grain(pal.grain);
  }
};

export default METRO;
