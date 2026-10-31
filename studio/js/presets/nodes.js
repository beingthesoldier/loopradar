// NODES: the melody as a graph that grows while it plays, like Obsidian's graph view, over a soft piano roll.
// The beat itself is the centre node. Every pitch the melody uses is a hub, linked to the pitches it moves
// to (a link gets heavier the more often that step is taken); the hubs are laid out once, in 3D, by a small
// force simulation, and the whole graph turns slowly (once per loop, or sways). When a note plays, a light
// runs along the link from the note before, its hub swells and takes its colour, and a new branch grows out
// of it with a leaf at the end; a long note grows a second twig off the leaf. Branches live a few bars and
// fold back, so the graph keeps changing bar to bar, and what has played lately is warm while the rest
// stays a pale outline. Everything is worked out from the time alone, so the loop has no seam.
// The bottom third is the melody as a piano roll (rounded notes, a light grid) scrolling under a playhead.
import { S, segLen, barDur } from '../state.js';
import { ctx, W, H, u, cx, spaced, MONO } from '../render/canvas.js';
import { waveStrip, SAFE_TOP, SAFE_BOTTOM } from '../render/hud.js';
import { clamp, mod, TAU, hsh, mulberry, titleCase } from '../util.js';

const SANS = 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const midiOf = p => Math.round(69 + 12 * Math.log2(p / 440));
const nameOf = m => FLAT[mod(m, 12)] + (Math.floor(m / 12) - 1);
// a colour per pitch class: notes a semitone or a fifth apart get colours far from each other
const SOFT = ['#e2646d', '#3fa3d9', '#e0a92e', '#9466d1', '#3fb07c', '#ec7f45', '#d65c9f', '#5b7fe0', '#85b844', '#bb8457', '#2fada4', '#7a6fdc'];
const AIRY = ['#f08f9a', '#6fc0ea', '#eec06a', '#b18ef0', '#6fd0b0', '#f2a57e', '#e690cf', '#86a9f5', '#a9d77d', '#d5ad8f', '#68ccd4', '#a39ef3'];
const GLOW = ['#ff9aa5', '#86d6ff', '#ffd47f', '#c6a2ff', '#84f0c8', '#ffb489', '#ffa3e2', '#95b9ff', '#c9f590', '#ecc7a8', '#80efe9', '#b0abff'];
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
// light and dark; `hues` colours the notes by pitch, `accent` paints every note one colour
const PALS = {
  cloud:  { dark: false, bg: '#f6f7f9', glow: '#ffffff', ink: '#23272e', mute: '#9aa1ab', link: '#9ea6b2', node: '#c4cad3', panel: '#ffffff', edge: '#e4e7ec', keyW: '#f2f4f7', keyB: '#dde1e7', grid: '#c8ced7', hues: SOFT },
  paper:  { dark: false, bg: '#faf9f6', glow: '#ffffff', ink: '#1f1d1a', mute: '#9b968e', link: '#a8a29a', node: '#c9c4bc', panel: '#ffffff', edge: '#e8e4dd', keyW: '#f4f2ee', keyB: '#e0dcd5', grid: '#cfc9c0', accent: '#7b5cf0' },
  sky:    { dark: false, bg: '#ecf2fb', glow: '#fbfdff', ink: '#1e2a3e', mute: '#8c9bb2', link: '#9db0cc', node: '#c2d1e6', panel: '#f8fbff', edge: '#dbe5f3', keyW: '#eef3fa', keyB: '#d6e1f0', grid: '#bccde4', hues: AIRY },
  night:  { dark: true, bg: '#141416', glow: '#1e1e23', ink: '#e7e7ea', mute: '#76767e', link: '#4d4d55', node: '#6c6c75', panel: '#1a1a1e', edge: '#26262b', keyW: '#28282e', keyB: '#1f1f24', grid: '#3a3a42', accent: '#a58bff' },
  aurora: { dark: true, bg: '#0b0e1a', glow: '#18203a', ink: '#e8ecf7', mute: '#6f7a96', link: '#3b4566', node: '#56608a', panel: '#111629', edge: '#1c2340', keyW: '#1e2541', keyB: '#161c33', grid: '#323b5e', hues: GLOW }
};
const ease = k => 1 - (1 - k) ** 3;

function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
// a deterministic direction in 3D from a seed
function dir3(seed) { const z = hsh(seed) * 2 - 1, a = hsh(seed + 7.3) * TAU, r = Math.sqrt(1 - z * z); return [r * Math.cos(a), z, r * Math.sin(a)]; }
const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
// how lit a note is at tau: up in 30 ms, held while it sounds, back down over 0.5 s
function lit(age, dur) {
  if (age < 0.03) return age / 0.03;
  if (age < dur) return 1;
  const r = (age - dur) / 0.5; return r < 1 ? (1 - r) * (1 - r) : 0;
}

const NODES = {
  id: 'nodes', name: 'Nodes',
  defaults: { pal: 'cloud', motion: 'orbit', growth: 0.5, walk: 'on', labels: 'on', zoom: 2 },
  controls: [
    { key: 'pal', label: 'Colour', type: 'choice', options: [['cloud', 'cloud'], ['paper', 'paper'], ['sky', 'sky'], ['night', 'night'], ['aurora', 'aurora']], then: 'buildBG' },
    { key: 'motion', label: 'Motion', type: 'choice', options: [['orbit', 'orbit'], ['sway', 'sway'], ['still', 'still']] },
    // how long a branch lives before it folds back: under a bar … about four bars
    { key: 'growth', label: 'Branches live', type: 'range', min: 0, max: 1, step: 0.01, format: v => `${(0.75 + 3.25 * v).toFixed(1)} bars` },
    { key: 'walk', label: 'Light on the links', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'labels', label: 'Note names', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'zoom', label: 'Piano roll', type: 'choice', options: [[1, '1 bar'], [2, '2 bars'], [4, '4 bars']] }
  ],
  bg: document.createElement('canvas'),
  notes: [], hubs: [], links: [],

  setup() { this.bg.width = W; this.bg.height = H; this.bctx = this.bg.getContext('2d'); this.layoutBoxes(); this.buildBG(); },

  // the frame, top to bottom: the header on SAFE_TOP, the graph (two thirds), the piano roll (one third),
  // the waveform strip ending on SAFE_BOTTOM
  layoutBoxes() {
    const mx = W * 0.07, stripY = H * SAFE_BOTTOM - 86 * u, top = H * SAFE_TOP + 56 * u, bot = stripY - 34 * u, gap = 22 * u;
    const area = bot - top - gap, gh = area * 2 / 3;
    Object.assign(this, { mx, stripY, gx: mx, gy: top, gw: W - 2 * mx, gh, rx: mx, ry: top + gh + gap, rw: W - 2 * mx, rh: area - gh });
  },

  buildBG() {
    const g = this.bctx; if (!g) return;
    const pal = PALS[S.nodes.pal] || PALS.cloud;
    this.pal = pal;
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
    g.fillStyle = pal.bg; g.fillRect(0, 0, W, H);
    // a soft light behind the graph, so it seems to float
    const gcy = this.gy + this.gh / 2, R = Math.max(this.gw, this.gh) * 0.62, gr = g.createRadialGradient(cx, gcy, 0, cx, gcy, R);
    gr.addColorStop(0, pal.glow); gr.addColorStop(1, pal.bg);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // dark skies get a few faint stars
    if (pal.dark) {
      const r = mulberry(4242);
      for (let i = 0; i < 160; i++) {
        const x = r() * W, y = H * SAFE_TOP + r() * (this.gh + 90 * u), s = r();
        g.globalAlpha = 0.08 + 0.22 * s * s; g.fillStyle = pal.ink;
        g.beginPath(); g.arc(x, y, (0.6 + 1.1 * s) * u, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
  },

  prepare(seg) {
    const sl = segLen(), bd = barDur();
    // the melody: MIDI notes when loaded (exact length), otherwise what the analysis heard
    const notes = seg.filter(o => o.type === 'mid' && (o.mm || o.p > 20)).map(o => ({ rt: o.rt, s: o.s, m: o.mm || midiOf(o.p), dur: o.dur || 0 }));
    notes.sort((a, b) => a.rt - b.rt || a.m - b.m);
    // notes from the audio have no length: until a little before the next one, a sixteenth to half a bar
    notes.forEach((n, i) => {
      if (!n.dur) { let j = i + 1; while (j < notes.length && notes[j].rt - n.rt < 1e-3) j++; const nx = j < notes.length ? notes[j].rt : (notes[0] ? notes[0].rt + sl : n.rt + bd / 2); n.dur = clamp((nx - n.rt) * 0.9, bd / 16, bd / 2); }
      n.dur = Math.min(n.dur, sl * 0.9); n.pc = mod(n.m, 12); n.i = i;
    });
    this.notes = notes;

    // hubs: one per pitch; hub 0 is the beat itself, in the middle
    const byM = new Map(), hubs = [{ root: true, m: null, count: 0 }];
    for (const n of notes) { if (!byM.has(n.m)) { byM.set(n.m, hubs.length); hubs.push({ m: n.m, count: 0 }); } n.hub = byM.get(n.m); hubs[n.hub].count++; }
    // links: each note to the nearest pitch of the moment before (a chord also links its own notes)
    const groups = [];
    for (const n of notes) { const gl = groups[groups.length - 1]; if (gl && n.rt - gl.rt < 1e-3) gl.notes.push(n); else groups.push({ rt: n.rt, notes: [n] }); }
    const L = new Map(), link = (a, b) => { if (a === b) return; const k = a < b ? `${a}|${b}` : `${b}|${a}`; L.set(k, (L.get(k) || 0) + 1); };
    groups.forEach((gr, k) => {
      const prev = groups[(k - 1 + groups.length) % groups.length];
      for (let i = 1; i < gr.notes.length; i++) link(gr.notes[i - 1].hub, gr.notes[i].hub);
      for (const n of gr.notes) {
        if (groups.length < 2) { n.from = 0; n.fromRt = n.rt - 0.3; continue; }
        const p = prev.notes.reduce((b, q) => Math.abs(q.m - n.m) < Math.abs(b.m - n.m) ? q : b, prev.notes[0]);
        n.from = p.hub; n.fromRt = p.rt; link(p.hub, n.hub);
      }
    });
    // the centre holds the three pitches heard most
    hubs.map((h, i) => [h.count, i]).filter(a => a[1] > 0).sort((a, b) => b[0] - a[0]).slice(0, 3).forEach(([, i]) => link(0, i));
    this.links = [...L.entries()].map(([k, w]) => { const [a, b] = k.split('|').map(Number); return { a, b, w }; });
    this.hubs = hubs;
    this.layoutGraph();

    // branches: every note grows one off its hub, a long note a second off the leaf
    const beat = bd / 4;
    for (const n of notes) {
      const h = hubs[n.hub].p, out = norm(Math.hypot(...h) > 1e-3 ? h : dir3(n.m)), d = dir3(n.i * 3.17 + n.m), len = 0.17 + 0.11 * hsh(n.i + 0.5);
      const dv = norm([out[0] * 1.1 + d[0], out[1] * 1.1 + d[1], out[2] * 1.1 + d[2]]);
      n.leaf = [h[0] + dv[0] * len, h[1] + dv[1] * len, h[2] + dv[2] * len];
      if (n.dur >= beat * 0.5) {
        const d2 = dir3(n.i * 5.71 + 1), tv = norm([dv[0] + d2[0] * 0.9, dv[1] + d2[1] * 0.9, dv[2] + d2[2] * 0.9]), tl = len * 0.6;
        n.twig = [n.leaf[0] + tv[0] * tl, n.leaf[1] + tv[1] * tl, n.leaf[2] + tv[2] * tl];
        n.twigAt = Math.min(n.dur * 0.5, beat * 0.5);
      } else n.twig = null;
    }
    // the piano roll's rows: the melody's range, at least an octave
    let lo = 60, hi = 71;
    if (notes.length) { lo = Math.min(...notes.map(n => n.m)) - 1; hi = Math.max(...notes.map(n => n.m)) + 1; }
    if (hi - lo < 11) { const c = (hi + lo) / 2; lo = Math.floor(c - 5.5); hi = lo + 11; }
    this.lo = lo; this.hi = hi;
  },

  // hubs in 3D: pushed apart, pulled together along their links, higher notes a little higher up
  layoutGraph() {
    const hubs = this.hubs, n = hubs.length, links = this.links;
    const ms = hubs.slice(1).map(h => h.m), mLo = ms.length ? Math.min(...ms) : 60, mHi = ms.length ? Math.max(...ms) : 72;
    const P = hubs.map((h, i) => {
      if (h.root) return [0, 0, 0];
      const k = i - 0.5, z = 1 - 2 * k / Math.max(1, n - 1), r = Math.sqrt(Math.max(0, 1 - z * z)), a = i * 2.39996;
      return [r * Math.cos(a) * 0.8, z * 0.8, r * Math.sin(a) * 0.8];
    });
    const V = P.map(() => [0, 0, 0]), L0 = 0.62;
    for (let it = 0; it < 420; it++) {
      const F = P.map(() => [0, 0, 0]);
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const d = [P[i][0] - P[j][0], P[i][1] - P[j][1], P[i][2] - P[j][2]], q = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + 0.01, f = 0.035 / q;
        for (let c = 0; c < 3; c++) { F[i][c] += d[c] * f; F[j][c] -= d[c] * f; }
      }
      for (const { a, b, w } of links) {
        const d = [P[b][0] - P[a][0], P[b][1] - P[a][1], P[b][2] - P[a][2]], l = Math.hypot(...d) || 1e-3, f = (l - L0) * 0.06 * Math.sqrt(Math.min(4, w)) / l;
        for (let c = 0; c < 3; c++) { F[a][c] += d[c] * f; F[b][c] -= d[c] * f; }
      }
      for (let i = 0; i < n; i++) {
        if (i > 0) { const ty = mHi > mLo ? ((mLo + mHi) / 2 - hubs[i].m) / (mHi - mLo) * 0.9 : 0; F[i][1] += (ty - P[i][1]) * 0.02; }   // y points down: high notes up
        for (let c = 0; c < 3; c++) F[i][c] -= P[i][c] * (i ? 0.004 : 0.03);   // the beat stays near the middle
        for (let c = 0; c < 3; c++) { V[i][c] = (V[i][c] + F[i][c]) * 0.82; P[i][c] += V[i][c]; }
      }
    }
    // centred on its middle, scaled so the widest point of the turn is 1; the height is kept for the camera
    const m = [0, 1, 2].map(c => P.reduce((a, p) => a + p[c], 0) / n);
    for (const p of P) for (let c = 0; c < 3; c++) p[c] -= m[c];
    const rxz = Math.max(0.3, ...P.map(p => Math.hypot(p[0], p[2])));
    hubs.forEach((h, i) => { h.p = P[i].map(v => v / rxz); });
    this.span = Math.max(0.4, ...hubs.map(h => Math.abs(h.p[1])));
  },

  /* ---------------- a frame ---------------- */
  draw(tau, F) {
    const N = S.nodes, pal = this.pal || PALS.cloud, sl = segLen(), bd = barDur();
    if (!this.gh) this.layoutBoxes();
    ctx.drawImage(this.bg, 0, 0);
    const notes = this.notes, hubs = this.hubs;
    const life = Math.min(sl * 0.9, bd * (0.75 + 3.25 * N.growth));
    const colOf = pc => pal.hues ? pal.hues[pc] : pal.accent;

    // the camera: a slow turn round the vertical, tilted a little so the depth shows
    const th = N.motion === 'orbit' ? TAU * tau / sl : N.motion === 'sway' ? 0.5 * Math.sin(TAU * tau / sl) : 0;
    const ct = Math.cos(th), st = Math.sin(th), tilt = 0.32, cp = Math.cos(tilt), sp = Math.sin(tilt);
    const gcx = cx, gcy = this.gy + this.gh * 0.5, SC = Math.min(this.gw * 0.36, this.gh * 0.38 / ((this.span || 1) + 0.3));
    const proj = p => {
      const x = p[0] * ct - p[2] * st, z0 = p[0] * st + p[2] * ct, y = p[1] * cp - z0 * sp, z = p[1] * sp + z0 * cp, f = 1 / (1 + z * 0.3);
      return { x: gcx + x * SC * f, y: gcy + y * SC * f, f, z, d: clamp(0.38 + 0.62 * (1 - (z + 1.2) / 2.4), 0.25, 1) };
    };
    const HP = hubs.map(h => proj(h.p));

    // how each hub is doing: lit while its notes sound, warm while they've played lately
    const act = new Float32Array(hubs.length), warm = new Float32Array(hubs.length);
    for (const n of notes) {
      const age = mod(tau - n.rt, sl), a = lit(age, n.dur);
      if (a > act[n.hub]) act[n.hub] = a;
      const w = age < life ? (1 - age / life) ** 1.2 : 0; if (w > warm[n.hub]) warm[n.hub] = w;
    }
    let rootAct = 0; for (let i = 1; i < hubs.length; i++) rootAct = Math.max(rootAct, act[i] * 0.4);

    ctx.save(); ctx.beginPath(); ctx.rect(0, this.gy - 30 * u, W, this.gh + 60 * u); ctx.clip();
    ctx.lineCap = 'round';
    // links between hubs: hairlines, heavier for steps taken often, brighter for steps taken lately
    for (const L of this.links) {
      const A = HP[L.a], B = HP[L.b], w = Math.max(warm[L.a], warm[L.b]) * Math.min(warm[L.a] + 0.25, warm[L.b] + 0.25);
      ctx.globalAlpha = (0.3 + 0.5 * w) * Math.min(A.d, B.d);
      ctx.strokeStyle = w > 0.05 && pal.hues ? mix(pal.link, colOf(hubs[L.b].m != null ? mod(hubs[L.b].m, 12) : 0), w * 0.6) : pal.link;
      ctx.lineWidth = (1 + 0.5 * Math.log2(1 + L.w)) * u;
      ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
    }
    // branches: grow out in a third of a second, live a while, fold back
    for (const n of notes) {
      const age = mod(tau - n.rt, sl); if (age >= life) continue;
      const grow = ease(Math.min(1, age / 0.35)), tail = life * 0.3, k = age > life - tail ? (life - age) / tail : 1, ext = grow * (0.35 + 0.65 * k);
      const h = hubs[n.hub].p, Ph = HP[n.hub], tip = [h[0] + (n.leaf[0] - h[0]) * ext, h[1] + (n.leaf[1] - h[1]) * ext, h[2] + (n.leaf[2] - h[2]) * ext], T = proj(tip);
      const a = lit(age, n.dur), col = colOf(n.pc);
      ctx.globalAlpha = (0.3 + 0.5 * k) * T.d; ctx.strokeStyle = a > 0.05 ? col : pal.link; ctx.lineWidth = (0.9 + 0.6 * a) * u;
      ctx.beginPath(); ctx.moveTo(Ph.x, Ph.y); ctx.lineTo(T.x, T.y); ctx.stroke();
      // the twig off the leaf of a long note
      if (n.twig && age > n.twigAt) {
        const g2 = ease(Math.min(1, (age - n.twigAt) / 0.4)) * (0.35 + 0.65 * k), tw = [n.leaf[0] + (n.twig[0] - n.leaf[0]) * g2, n.leaf[1] + (n.twig[1] - n.leaf[1]) * g2, n.leaf[2] + (n.twig[2] - n.leaf[2]) * g2], Tw = proj(tw);
        ctx.beginPath(); ctx.moveTo(T.x, T.y); ctx.lineTo(Tw.x, Tw.y); ctx.stroke();
        ctx.globalAlpha = (0.45 + 0.4 * k) * Tw.d; ctx.fillStyle = mix(col, pal.bg, 0.35 * (1 - a));
        ctx.beginPath(); ctx.arc(Tw.x, Tw.y, (1.6 + 1.2 * g2) * u * Tw.f, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = (0.55 + 0.45 * k) * T.d; ctx.fillStyle = a > 0.05 ? col : mix(col, pal.bg, 0.45);
      ctx.beginPath(); ctx.arc(T.x, T.y, (2.2 + 2.2 * n.s + 1.4 * a) * u * T.f * grow, 0, TAU); ctx.fill();
    }
    // the walk: a light runs along the link from the note before and arrives as the note plays
    if (N.walk !== 'off') for (const n of notes) {
      if (n.from == null || n.from === n.hub) continue;
      const T = Math.min(mod(n.rt - n.fromRt, sl) || sl, 0.45), dt = mod(tau - (n.rt - T), sl); if (dt >= T) continue;
      const p = ease(dt / T), A = HP[n.from], B = HP[n.hub], q = Math.max(0, p - 0.3);
      const x = A.x + (B.x - A.x) * p, y = A.y + (B.y - A.y) * p, x0 = A.x + (B.x - A.x) * q, y0 = A.y + (B.y - A.y) * q, col = colOf(n.pc);
      ctx.globalAlpha = 0.55 * Math.min(A.d, B.d); ctx.strokeStyle = col; ctx.lineWidth = 2 * u;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, 3 * u, 0, TAU); ctx.fill();
    }
    // hubs, far ones first: a pale outline until played, then their colour; swell and a ring while sounding
    const order = hubs.map((h, i) => i).sort((a, b) => HP[b].z - HP[a].z);
    for (const i of order) {
      const h = hubs[i], P = HP[i];
      if (h.root) {
        const r = (13 + 3 * rootAct) * u * P.f;
        ctx.globalAlpha = 0.9 * P.d; ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, TAU); ctx.fill();
        ctx.globalAlpha = 0.25 * P.d; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(P.x, P.y, r + 7 * u * P.f, 0, TAU); ctx.stroke();
        continue;
      }
      const a = act[i], w = warm[i], col = colOf(mod(h.m, 12)), r = (6 + 3 * Math.sqrt(h.count)) * u * P.f * (1 + 0.3 * a);
      if (a > 0.02) { ctx.globalAlpha = 0.35 * a * P.d; ctx.strokeStyle = col; ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.arc(P.x, P.y, r + (5 + 5 * a) * u * P.f, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = P.d; ctx.fillStyle = pal.bg; ctx.beginPath(); ctx.arc(P.x, P.y, r + 2 * u, 0, TAU); ctx.fill();
      const fillK = Math.max(a, w * 0.85);
      ctx.fillStyle = mix(pal.node, col, fillK); ctx.globalAlpha = (0.55 + 0.45 * Math.max(fillK, 0.2)) * P.d;
      ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, TAU); ctx.fill();
      if (N.labels !== 'off') {
        ctx.globalAlpha = (0.28 + 0.72 * Math.max(a, w * 0.7)) * P.d; ctx.fillStyle = pal.ink;
        ctx.font = `${a > 0.5 ? 500 : 400} ${14.5 * u * Math.min(1.15, P.f)}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(nameOf(h.m), P.x, P.y + r + 6 * u);
      }
    }
    // the centre node is the beat: its name next to it
    if (N.labels !== 'off' && hubs.length) {
      const P = HP[0]; ctx.globalAlpha = 0.85 * P.d; ctx.fillStyle = pal.ink; ctx.font = `500 ${15 * u}px ${SANS}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(titleCase(S.title || 'kristudio'), P.x, P.y + 22 * u * P.f);
    }
    ctx.restore(); ctx.globalAlpha = 1;

    this.header(pal);
    this.roll(tau, pal, colOf);
    waveStrip(tau, { x: this.mx, y: this.stripY, w: W - 2 * this.mx, ink: pal.ink, dim: pal.grid, mute: pal.mute, head: pal.hues ? pal.ink : pal.accent });
  },

  header(pal) {
    const mx = this.mx, y = H * SAFE_TOP;
    const title = titleCase(S.title || ''); let ts = 50 * u; ctx.font = `300 ${ts}px ${SANS}`;
    const tw = ctx.measureText(title).width, max = W * 0.6; if (tw > max) { ts *= max / tw; ctx.font = `300 ${ts}px ${SANS}`; }
    ctx.fillStyle = pal.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(title, mx, y);
    ctx.font = `400 ${14 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced([(S.tag || '').toUpperCase(), `${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('  ·  '), mx, y + 32 * u, 2 * u, 'left');
    spaced(`${Math.max(0, this.hubs.length - 1)} NODES · ${this.links.length} LINKS`, W - mx, y, 2 * u, 'right');
  },

  // the melody as a piano roll: rounded notes, a light dotted grid, scrolling under the playhead
  roll(tau, pal, colOf) {
    const N = S.nodes, sl = segLen(), bd = barDur(), notes = this.notes;
    const bx = this.rx, by = this.ry, bw = this.rw, bh = this.rh, pad = 12 * u, kw = 30 * u;
    const lo = this.lo ?? 60, hi = this.hi ?? 71, rows = hi - lo + 1, ix = bx + pad + kw + 8 * u, iw = bw - (ix - bx) - pad, iy = by + pad, ih = bh - pad * 2, rh = ih / rows;
    const yOf = m => iy + ih - (m - lo + 1) * rh, win = bd * (+N.zoom || 2), headX = ix + iw * 0.3, t0 = tau - (headX - ix) / iw * win;
    ctx.save();
    ctx.globalAlpha = 1; ctx.fillStyle = pal.panel; rr(ctx, bx, by, bw, bh, 26 * u); ctx.fill();
    ctx.strokeStyle = pal.edge; ctx.lineWidth = 1 * u; ctx.stroke();
    rr(ctx, bx, by, bw, bh, 26 * u); ctx.clip();
    // rows of the black keys, barely there
    ctx.fillStyle = pal.keyB; ctx.globalAlpha = 0.2;
    for (let m = lo; m <= hi; m++) if (BLACK.has(mod(m, 12))) ctx.fillRect(ix, yOf(m), iw, rh);
    // beats as dotted lines, bars as hairlines with their number
    ctx.fillStyle = pal.grid;
    const beat = bd / 4;
    for (let b = Math.floor(t0 / beat) - 1; b * beat < t0 + win + beat; b++) {
      const x = ix + (b * beat - t0) / win * iw; if (x < ix - 1 || x > ix + iw) continue;
      if (mod(b, 4) === 0) {
        ctx.globalAlpha = 0.7; ctx.fillRect(x - 0.5 * u, iy, 1 * u, ih);
        ctx.globalAlpha = 0.9; ctx.fillStyle = pal.mute; ctx.font = `400 ${10.5 * u}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        ctx.fillText(String(S.startBar + mod(Math.round(b / 4), S.lenBars) + 1), x + 4 * u, iy + 2 * u); ctx.fillStyle = pal.grid;
      } else { ctx.globalAlpha = 0.6; for (let y = iy + 3 * u; y < iy + ih; y += 7 * u) { ctx.beginPath(); ctx.arc(x, y, 0.8 * u, 0, TAU); ctx.fill(); } }
    }
    // the notes: pills; coming up a little faded, sounding in full with a soft rim, played fading out
    const sounding = new Map();
    for (const n of notes) for (const c of [-1, 0, 1]) {
      const t = n.rt + c * sl, x = ix + (t - t0) / win * iw, h = Math.max(7 * u, rh * 0.84), w = Math.max(h, n.dur / win * iw);
      if (x > ix + iw || x + w < ix - 2 * u) continue;
      const on = tau >= t && tau < t + n.dur, past = tau >= t + n.dur, col = colOf(n.pc), y = yOf(n.m) + (rh - h) / 2;
      if (on) sounding.set(n.m, col);
      let a = on ? 1 : past ? 0.2 + 0.4 * clamp(1 - (tau - t - n.dur) / (win * 0.3), 0, 1) : 0.55 + 0.3 * n.s;
      if (on) { ctx.globalAlpha = 0.22; ctx.fillStyle = col; rr(ctx, x - 3 * u, y - 3 * u, w + 6 * u, h + 6 * u, (h + 6 * u) / 2); ctx.fill(); }
      ctx.globalAlpha = a; ctx.fillStyle = col; rr(ctx, x, y, w, h, h / 2); ctx.fill();
      if (w > 44 * u && h > 11 * u) {
        ctx.globalAlpha = on ? 0.95 : a * 0.9; ctx.fillStyle = pal.dark ? '#0b0c10' : '#ffffff';
        ctx.font = `500 ${Math.min(h * 0.6, 11.5 * u)}px ${SANS}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(nameOf(n.m), x + h * 0.55, y + h / 2 + 0.5 * u);
      }
    }
    // the playhead
    ctx.globalAlpha = 0.6; ctx.fillStyle = pal.ink; ctx.fillRect(headX - 0.7 * u, iy, 1.4 * u, ih);
    ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.arc(headX, iy, 3.5 * u, 0, TAU); ctx.fill();
    // the keys on the left: small rounded keys, lit in the note's colour while it sounds
    for (let m = lo; m <= hi; m++) {
      const black = BLACK.has(mod(m, 12)), y = yOf(m), col = sounding.get(m);
      ctx.globalAlpha = 1; ctx.fillStyle = col || (black ? pal.keyB : pal.keyW);
      rr(ctx, bx + pad, y + 1 * u, black ? kw * 0.68 : kw, Math.max(1, rh - 2 * u), Math.min(5 * u, rh / 2.4)); ctx.fill();
      if (mod(m, 12) === 0 && rh > 9 * u) { ctx.fillStyle = pal.mute; ctx.font = `400 ${Math.min(9.5 * u, rh * 0.7)}px ${MONO}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(`C${m / 12 - 1}`, bx + pad + kw - 3 * u, y + rh / 2); }
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
};

export default NODES;
