// METRO: a night transit network that runs on the melody.
// Every note the melody uses most is a line, drawn as a loop through the city: the main line takes the
// shape chosen in the settings, the others are octilinear loops that cross it (interchanges where they do).
// Each line has one train and a stop for every moment it plays in the loop. The train waits at its stop,
// pulls out, and arrives at the next one exactly on that note, with a light trail behind it and the track
// it just ran glowing as it cools. The camera glides over the city after the trains and jumps on the kick;
// the board at the bottom flips to the name of every note as its train pulls in, and the piano under it
// plays along. Everything that moves repeats once per section, so the video loops without a seam.
// The notes come from a MIDI when one is loaded (audio/midi.js), otherwise from the audio analysis.
import { S, segLen, barDur } from '../state.js';
import { ctx, W, H, u, cx, grain, spaced, MONO } from '../render/canvas.js';
import { clamp, mod, TAU, mulberry, pad, fmtT, titleCase } from '../util.js';

const HEL = '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif';
const SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
// a colour per note; a semitone or a fifth apart never look alike. Neon for the night, inks for paper.
const NEON = ['#ff3b4e', '#2fd0ff', '#ffd23a', '#b56bff', '#2dff8f', '#ff8a2a', '#ff3fb4', '#3a7bff', '#b8ff3a', '#ff9e6b', '#22f2d0', '#7f73ff'];
const INK = ['#e8352e', '#19a7e0', '#f2c200', '#7d3c98', '#00a651', '#f26b21', '#d81b84', '#0a52b5', '#86c440', '#9a5b34', '#00a199', '#3d3d9e'];
const PALS = {
  night: { bg: '#06070b', ink: '#f2f2f2', mute: '#7b7f8c', grid: 'rgba(255,255,255,0.06)', river: '#0a1424', glow: true, colors: NEON, grain: 0.04, key: '#15161c', keyB: '#000000' },
  paper: { bg: '#ffffff', ink: '#111111', mute: '#8c8c8c', grid: 'rgba(0,0,0,0.08)', river: '#dcEFf8', glow: false, colors: INK, grain: 0, key: '#ffffff', keyB: '#111111' },
  dust:  { bg: '#ddd5d0', ink: '#1d1a19', mute: '#7b726d', grid: 'rgba(0,0,0,0.08)', river: '#cbd3d3', glow: false, colors: INK, grain: 0.045, key: '#ece6e2', keyB: '#1d1a19' }
};
const BLACK = new Set([1, 3, 6, 8, 10]);
const RED = '#ff3b30';
const textOn = hex => { const v = parseInt(hex.slice(1), 16), r = v >> 16, g = (v >> 8) & 255, b = v & 255; return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111' : '#fff'; };

// the main line's outline, in units of its radius, clockwise from the top (y down)
const SHAPES = {
  square: [[0, -0.86], [0.86, -0.86], [0.86, 0.86], [-0.86, 0.86], [-0.86, -0.86]],
  diamond: [[0, -1.1], [1.1, 0], [0, 1.1], [-1.1, 0]],
  octagon: [[0, -0.95], [0.4, -0.95], [0.95, -0.4], [0.95, 0.4], [0.4, 0.95], [-0.4, 0.95], [-0.95, 0.4], [-0.95, -0.4], [-0.4, -0.95]],
  heart: [[0, -0.5], [0.32, -0.82], [0.72, -0.82], [1.04, -0.5], [1.04, -0.08], [0, 0.96], [-1.04, -0.08], [-1.04, -0.5], [-0.72, -0.82], [-0.32, -0.82]]
};

/* ---------------- paths ---------------- */
function fillet(V, r) {
  const out = [], n = V.length;
  for (let i = 0; i < n; i++) {
    const P = V[(i - 1 + n) % n], C = V[i], N = V[(i + 1) % n];
    const l1 = Math.hypot(C[0] - P[0], C[1] - P[1]), l2 = Math.hypot(N[0] - C[0], N[1] - C[1]);
    const d1 = [(C[0] - P[0]) / l1, (C[1] - P[1]) / l1], d2 = [(N[0] - C[0]) / l2, (N[1] - C[1]) / l2];
    if (Math.abs(d1[0] * d2[1] - d1[1] * d2[0]) < 1e-3) { out.push(C); continue; }
    const t = Math.min(r, 0.45 * l1, 0.45 * l2), A = [C[0] - d1[0] * t, C[1] - d1[1] * t], B = [C[0] + d2[0] * t, C[1] + d2[1] * t];
    for (let k = 0; k <= 12; k++) { const s = k / 12, a = (1 - s) ** 2, b = 2 * s * (1 - s), c = s * s; out.push([a * A[0] + b * C[0] + c * B[0], a * A[1] + b * C[1] + c * B[1]]); }
  }
  return out;
}
// a closed path, evenly resampled: point i is at arc length i * len / n
function loopPath(pts, n) {
  const m = pts.length, L = [0];
  for (let i = 1; i <= m; i++) { const a = pts[i - 1], b = pts[i % m]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
  const len = L[m], x = new Float32Array(n), y = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = len * i / n; while (j < m - 1 && L[j + 1] < d) j++;
    const a = pts[j], b = pts[(j + 1) % m], f = (d - L[j]) / Math.max(1e-9, L[j + 1] - L[j]);
    x[i] = a[0] + (b[0] - a[0]) * f; y[i] = a[1] + (b[1] - a[1]) * f;
  }
  return { x, y, n, len };
}
// position and heading at arc length s (wraps round the loop)
function pos(P, s) {
  const t = mod(s / P.len, 1) * P.n, i = Math.floor(t) % P.n, j = (i + 1) % P.n, k = t - Math.floor(t);
  const x = P.x[i] + (P.x[j] - P.x[i]) * k, y = P.y[i] + (P.y[j] - P.y[i]) * k;
  const dx = P.x[j] - P.x[i], dy = P.y[j] - P.y[i], l = Math.hypot(dx, dy) || 1;
  return { x, y, dx: dx / l, dy: dy / l };
}
function tracePath(g, P) { g.beginPath(); g.moveTo(P.x[0], P.y[0]); for (let i = 1; i < P.n; i++) g.lineTo(P.x[i], P.y[i]); g.closePath(); }
// the stretch of a path between arc lengths a and b (b below a when running backwards)
function traceSpan(g, P, a, b) {
  const n = Math.max(1, Math.ceil(Math.abs(b - a) / (P.len / P.n)));
  g.beginPath(); for (let k = 0; k <= n; k++) { const p = pos(P, a + (b - a) * k / n); k ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); }
}
const ease = x => x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;

function keyTriad() {
  const m = (S.key || '').trim().match(/^([A-Ga-g])\s*([#♯b♭]?)\s*(.*)$/); if (!m) return [0, 4, 7];
  const root = mod({ C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()] + (/[#♯]/.test(m[2]) ? 1 : /[b♭]/.test(m[2]) ? -1 : 0), 12);
  const minor = /^m(in|inor)?\b|^m$/i.test(m[3].trim()) && !/maj/i.test(m[3]);
  return [root, mod(root + (minor ? 3 : 4), 12), mod(root + 7, 12)];
}
const midiOf = p => Math.round(69 + 12 * Math.log2(p / 440));
const pcDist = (a, b) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };

const METRO = {
  id: 'metro', name: 'Metro',
  defaults: { ring: 'circle', pal: 'night', camera: 0.6, punch: 0.5, trails: 0.6 },
  controls: [
    { key: 'ring', label: 'Main line', type: 'choice', options: [['circle', 'circle'], ['heart', 'heart'], ['diamond', 'diamond'], ['square', 'square'], ['octagon', 'octagon']], then: 'build' },
    { key: 'pal', label: 'Map', type: 'choice', options: [['night', 'night'], ['paper', 'paper'], ['dust', 'dust']], then: 'build' },
    { key: 'camera', label: 'Camera', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'punch', label: 'Kick punch', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'trails', label: 'Light trails', type: 'range', min: 0, max: 1, step: 0.01 }
  ],
  notes: [], pcs: null, flats: true, kicks: [], hats: [],

  setup() { this.build(); },

  prepare(seg) {
    const count = new Array(12).fill(0), notes = [];
    for (const o of seg) {
      if (o.type !== 'mid' || !(o.p > 20)) continue;
      o.mm = o.mm || midiOf(o.p); o.pc = mod(o.mm, 12); o.oct = Math.floor(o.mm / 12) - 1;
      count[o.pc]++; notes.push(o);
    }
    this.notes = notes;
    // lines for the notes used most (at most five); the busiest one is the main line
    const pcs = count.map((n, pc) => [n, pc]).filter(a => a[0] > 0).sort((a, b) => b[0] - a[0]).slice(0, 5).map(a => a[1]);
    for (const pc of keyTriad()) if (pcs.length < 3 && !pcs.includes(pc)) pcs.push(pc);
    this.pcs = pcs;
    // every note rides its own note's line, or the nearest one that has a line
    for (const o of notes) { let best = 0, bd = 99; pcs.forEach((pc, i) => { const d = pcDist(pc, o.pc); if (d < bd) { bd = d; best = i; } }); o.line = best; }
    this.flats = seg.some(o => /b/.test(o.note || '')) || /^[A-G]\s*[b♭]/.test((S.key || '').trim());
    // the piano: from the C or F below the lowest note to the E or B above the highest, one to three octaves
    let lo = 60, hi = 71;
    if (notes.length) { lo = Math.min(...notes.map(o => o.mm)); hi = Math.max(...notes.map(o => o.mm)); }
    if (hi - lo > 35) { const per = new Array(128).fill(0); for (const o of notes) per[o.mm]++; let bl = lo, bv = -1; for (let l = lo; l + 35 <= hi; l++) { let v = 0; for (let k = l; k <= l + 35; k++) v += per[k]; if (v > bv) { bv = v; bl = l; } } lo = bl; hi = bl + 35; }
    while (![0, 5].includes(mod(lo, 12))) lo--;
    while (![4, 11].includes(mod(hi, 12))) hi++;
    while (hi - lo < 11) { hi++; while (![4, 11].includes(mod(hi, 12))) hi++; }
    this.keyLo = lo; this.keyHi = hi;
    // the kicks that hit hardest, at most one a beat, punch the camera
    const lows = seg.filter(o => o.type === 'low'), cut = Math.max(0.35, lows.map(o => o.s).sort((a, b) => a - b)[Math.floor(lows.length * 0.5)] || 0);
    let last = -1e9; this.kicks = [];
    for (const o of lows) { if (o.s < cut || o.rt - last < barDur() / 4 - 1e-6) continue; last = o.rt; this.kicks.push(o); }
    this.hats = seg.filter(o => o.type === 'high');
    this.build();
  },

  name12(pc) { return (this.flats ? FLAT : SHARP)[pc]; },

  /* ---------------- the network ---------------- */
  build() {
    if (!W) return;
    const M = S.metro, pal = PALS[M.pal] || PALS.night, sl = segLen();
    const pcs = this.pcs || keyTriad(), notes = this.notes || [];
    const fx = cx, fy = H * 0.42, R = W * 0.3;
    const rnd = mulberry(4111 + pcs.reduce((a, b) => a * 17 + b, 0));
    const lines = [];
    pcs.forEach((pc, i) => {
      let V, round = false;
      if (i === 0) {
        if (M.ring === 'circle' || !SHAPES[M.ring]) { round = true; V = []; for (let k = 0; k < 180; k++) { const a = -Math.PI / 2 + TAU * k / 180; V.push([fx + Math.cos(a) * R, fy + Math.sin(a) * R]); } }
        else V = SHAPES[M.ring].map(([x, y]) => [fx + x * R, fy + y * R]);
      } else {
        // an octilinear loop that crosses the main line: a rectangle with some corners cut at 45°
        const a = -Math.PI / 2 + TAU * (i - 0.5) / (pcs.length - 1) + (rnd() - 0.5) * 0.5;
        const d = R * (0.6 + rnd() * 0.45), ox = fx + Math.cos(a) * d * 1.05, oy = fy + Math.sin(a) * d * 1.3;
        const hx = W * (0.15 + rnd() * 0.16), hy = W * (0.17 + rnd() * 0.24), c = Math.min(hx, hy) * (0.3 + rnd() * 0.45);
        V = [[ox, oy - hy]];
        if (rnd() < 0.7) V.push([ox + hx - c, oy - hy], [ox + hx, oy - hy + c]); else V.push([ox + hx, oy - hy]);
        if (rnd() < 0.5) V.push([ox + hx, oy + hy - c], [ox + hx - c, oy + hy]); else V.push([ox + hx, oy + hy]);
        if (rnd() < 0.7) V.push([ox - hx + c, oy + hy], [ox - hx, oy + hy - c]); else V.push([ox - hx, oy + hy]);
        if (rnd() < 0.5) V.push([ox - hx, oy - hy + c], [ox - hx + c, oy - hy]); else V.push([ox - hx, oy - hy]);
      }
      const P = loopPath(round ? V : fillet(V, 70 * u), 1200);
      const mine = notes.filter(o => o.line === i).sort((a, b) => a.rt - b.rt || a.mm - b.mm);
      // one stop per moment: a chord on one line is one arrival
      const stops = []; for (const o of mine) { const l = stops[stops.length - 1]; if (l && Math.abs(l.rt - o.rt) < 1e-3) l.notes.push(o); else stops.push({ rt: o.rt, notes: [o] }); }
      const dir = i % 2 ? -1 : 1, phase = rnd() * P.len, n = stops.length;
      stops.forEach((st, k) => { st.s = phase + dir * k * P.len / Math.max(1, n); st.p = pos(P, st.s); });
      lines.push({ i, pc, P, stops, dir, phase, col: pal.colors[pc] });
    });
    this.lines = lines; this.pal = pal; this.focus = [fx, fy];

    // interchanges: where two lines cross
    const X = [];
    for (let a = 0; a < lines.length; a++) for (let b = a + 1; b < lines.length; b++) {
      const A = lines[a].P, B = lines[b].P, st = 6;
      for (let i = 0; i < A.n; i += st) {
        const i2 = (i + st) % A.n, ax = A.x[i], ay = A.y[i], bx = A.x[i2], by = A.y[i2];
        for (let j = 0; j < B.n; j += st) {
          const j2 = (j + st) % B.n, qx = B.x[j], qy = B.y[j], rx = B.x[j2], ry = B.y[j2];
          const den = (bx - ax) * (ry - qy) - (by - ay) * (rx - qx); if (Math.abs(den) < 1e-9) continue;
          const t = ((qx - ax) * (ry - qy) - (qy - ay) * (rx - qx)) / den, s = ((qx - ax) * (by - ay) - (qy - ay) * (bx - ax)) / den;
          if (t >= 0 && t <= 1 && s >= 0 && s <= 1) { const x = ax + (bx - ax) * t, y = ay + (by - ay) * t; if (!X.some(p => Math.hypot(p[0] - x, p[1] - y) < 30 * u)) X.push([x, y]); }
        }
      }
    }
    this.cross = X;

    // the camera follows the trains' middle, smoothed round the loop so it repeats exactly
    const N = 360, cam = new Float32Array(N * 2);
    for (let k = 0; k < N; k++) {
      let sx = 0, sy = 0; for (const L of lines) { const p = pos(L.P, this.trainS(L, k / N * sl, sl)); sx += p.x; sy += p.y; }
      cam[k * 2] = sx / lines.length; cam[k * 2 + 1] = sy / lines.length;
    }
    const r = Math.max(1, Math.round(N * Math.min(0.2, 1.2 / sl)));
    for (let pass = 0; pass < 3; pass++) for (const c of [0, 1]) {
      const src = Array.from({ length: N }, (_, k) => cam[k * 2 + c]);
      for (let k = 0; k < N; k++) { let s = 0; for (let d = -r; d <= r; d++) s += src[mod(k + d, N)]; cam[k * 2 + c] = s / (2 * r + 1); }
    }
    this.cam = cam;
  },

  // where a line's train is at tau: waiting at a stop, or on its way to the next, arriving on its note
  trainS(L, tau, sl) {
    const st = L.stops, n = st.length;
    if (!n) return L.phase + L.dir * (tau / sl) * L.P.len;   // a line without notes just circulates, one lap a loop
    let j = -1; for (let k = 0; k < n; k++) if (st[k].rt <= tau + 1e-9) j = k;
    let tj; if (j < 0) { j = n - 1; tj = st[j].rt - sl; } else tj = st[j].rt;
    const k = (j + 1) % n; let tk = st[k].rt; if (tk <= tj + 1e-9) tk += sl;
    const gap = tk - tj, dist = n === 1 ? L.P.len : L.P.len / n;
    const travel = gap * 0.82, dep = tk - travel;   // a short dwell at the stop, then on the move until the next note
    if (tau < dep) return st[j].s;
    return st[j].s + L.dir * dist * ease(clamp((tau - dep) / travel, 0, 1));
  },
  // the stop a line's train is heading for, and how far along the way it is (0 while it waits)
  trainLeg(L, tau, sl) {
    const st = L.stops, n = st.length; if (!n) return null;
    let j = -1; for (let k = 0; k < n; k++) if (st[k].rt <= tau + 1e-9) j = k;
    let tj; if (j < 0) { j = n - 1; tj = st[j].rt - sl; } else tj = st[j].rt;
    const k = (j + 1) % n; let tk = st[k].rt; if (tk <= tj + 1e-9) tk += sl;
    const travel = (tk - tj) * 0.82;
    return { from: st[j], to: st[k], x: clamp((tau - (tk - travel)) / travel, 0, 1) };
  },

  /* ---------------- a frame ---------------- */
  draw(tau) {
    const M = S.metro, sl = segLen(), bd = barDur();
    if (!this.lines) this.build();
    const pal = this.pal, lines = this.lines, night = pal.glow;

    // how hard the camera jumps right now
    let kick = 0; for (const o of this.kicks) { const a = mod(tau - o.rt, sl); if (a < 0.6) kick = Math.max(kick, clamp(o.s * 1.3, 0, 1) * Math.exp(-a / 0.11)); }
    // the camera: after the trains, a slow sway, a jump on the kick
    const N = this.cam.length / 2, f = mod(tau / sl, 1) * N, i0 = Math.floor(f) % N, i1 = (i0 + 1) % N, fr = f - Math.floor(f);
    const camX = this.cam[i0 * 2] + (this.cam[i1 * 2] - this.cam[i0 * 2]) * fr, camY = this.cam[i0 * 2 + 1] + (this.cam[i1 * 2 + 1] - this.cam[i0 * 2 + 1]) * fr;
    const c = M.camera, ph = TAU * tau / sl;
    const tx = this.focus[0] + (camX - this.focus[0]) * c * 0.85 + Math.sin(ph) * 30 * u * c;
    const ty = this.focus[1] + (camY - this.focus[1]) * c * 0.85 + Math.sin(ph * 2) * 20 * u * c;
    const zoom = (1 + 0.3 * c + 0.06 * c * Math.sin(ph * 2 + 1)) * (1 + 0.08 * M.punch * kick), rot = Math.sin(ph) * 0.05 * c;

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    ctx.translate(cx, H * 0.42); ctx.rotate(rot); ctx.scale(zoom, zoom); ctx.translate(-tx, -ty);

    // the city underneath: a river and a grid of blocks
    const span = Math.max(W, H) * 0.9 / zoom;
    ctx.strokeStyle = pal.river; ctx.lineWidth = 120 * u; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let k = 0; k <= 48; k++) { const x = tx - span + 2 * span * k / 48, y = this.focus[1] + H * 0.17 + Math.sin(x / W * 2.6 + 1.3) * H * 0.06 + (x - this.focus[0]) * 0.32; k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
    const gs = 56 * u; ctx.fillStyle = pal.grid;
    for (let gx = Math.floor((tx - span) / gs) * gs; gx < tx + span; gx += gs) for (let gy = Math.floor((ty - span) / gs) * gs; gy < ty + span; gy += gs) ctx.fillRect(gx - 1.3 * u, gy - 1.3 * u, 2.6 * u, 2.6 * u);

    // tracks: neon with a halo at night, cased ink lines on paper
    const lw = 9 * u, boost = 1 + 0.9 * M.punch * kick;
    for (const L of lines) {
      tracePath(ctx, L.P);
      if (night) {
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = L.col;
        ctx.globalAlpha = 0.06 * boost; ctx.lineWidth = lw * 5.5; ctx.stroke();
        ctx.globalAlpha = 0.14 * boost; ctx.lineWidth = lw * 2.6; ctx.stroke();
        ctx.globalAlpha = 0.5; ctx.lineWidth = lw; ctx.stroke();
        ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = pal.bg; ctx.lineWidth = lw + 8 * u; ctx.stroke();
        ctx.strokeStyle = L.col; ctx.lineWidth = lw; ctx.stroke();
      }
    }
    // the track lights up under a running train and cools after it pulls in
    const glowSpan = (L, a, b, heat) => {
        traceSpan(ctx, L.P, a, b);
        if (night) {
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = L.col;
          ctx.globalAlpha = 0.4 * heat; ctx.lineWidth = lw * 3.4; ctx.stroke();
          ctx.globalAlpha = 0.85 * heat; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = lw * 0.42; ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        } else { ctx.globalAlpha = 0.9 * heat; ctx.strokeStyle = pal.ink; ctx.lineWidth = lw * 0.36; ctx.stroke(); }
        ctx.globalAlpha = 1;
    };
    for (const L of lines) {
      const leg = this.trainLeg(L, tau, sl); if (leg && leg.x > 0) glowSpan(L, leg.from.s, this.trainS(L, tau, sl), 1);
    }
    for (const L of lines) {
      const n = L.stops.length; if (!n) continue;
      for (const st of L.stops) {
        const age = mod(tau - st.rt, sl); if (age > 1.5) continue;
        const heat = Math.exp(-age / 0.6), from = st.s - L.dir * (n === 1 ? L.P.len : L.P.len / n);
        if (heat > 0.02) glowSpan(L, from, st.s, heat);
      }
    }
    // interchanges
    for (const [x, y] of this.cross) {
      ctx.fillStyle = night ? pal.bg : '#ffffff'; ctx.strokeStyle = night ? `rgba(255,255,255,${0.6 + 0.4 * kick})` : pal.ink;
      ctx.lineWidth = 3 * u; ctx.beginPath(); ctx.arc(x, y, (9 + 6 * kick * M.punch) * u, 0, TAU); ctx.fill(); ctx.stroke();
    }
    // stops: a ring opens and the note's name pops up when a train pulls in
    for (const L of lines) for (const st of L.stops) {
      const p = st.p, age = mod(tau - st.rt, sl);
      ctx.fillStyle = night ? pal.bg : '#ffffff'; ctx.strokeStyle = L.col; ctx.lineWidth = 3 * u;
      ctx.beginPath(); ctx.arc(p.x, p.y, 6.5 * u, 0, TAU); ctx.fill(); ctx.stroke();
      if (age > 1.1) continue;
      const e = age / 1.1, k = 1 - e;
      if (age < 0.5) { ctx.globalAlpha = (1 - age / 0.5) ** 1.4; ctx.beginPath(); ctx.arc(p.x, p.y, (8 + age / 0.5 * 50) * u, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = k; ctx.fillStyle = night ? '#ffffff' : L.col; ctx.beginPath(); ctx.arc(p.x, p.y, 6.5 * u, 0, TAU); ctx.fill();
      const o = st.notes[0], txt = `${this.name12(o.pc)}${o.oct}` + (st.notes.length > 1 ? ` +${st.notes.length - 1}` : '');
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-rot); ctx.scale(1 / zoom, 1 / zoom);   // names stay upright and the same size
      ctx.font = `700 ${27 * u}px ${HEL}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      const y = -26 * u - e * 16 * u;
      ctx.globalAlpha = Math.min(1, age / 0.06) * k ** 0.7;
      ctx.lineJoin = 'round'; ctx.lineWidth = 7 * u; ctx.strokeStyle = pal.bg; ctx.strokeText(txt, 14 * u, y);
      ctx.fillStyle = night ? '#ffffff' : pal.ink; ctx.fillText(txt, 14 * u, y);
      ctx.restore(); ctx.globalAlpha = 1;
    }
    // trains: a light trail behind, a bright car in front
    const trail = 0.05 + 0.4 * M.trails, steps = 18;
    for (const L of lines) {
      const head = pos(L.P, this.trainS(L, tau, sl));
      let prev = head;
      ctx.lineCap = 'round';
      if (night) ctx.globalCompositeOperation = 'lighter';
      for (let k = 1; k <= steps; k++) {
        const q = pos(L.P, this.trainS(L, mod(tau - trail * k / steps, sl), sl)), a = 1 - k / steps;
        if (Math.hypot(q.x - prev.x, q.y - prev.y) > L.P.len * 0.3) break;
        ctx.strokeStyle = L.col; ctx.globalAlpha = 0.9 * a; ctx.lineWidth = lw * (0.5 + 1.5 * a);
        ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(q.x, q.y); ctx.stroke();
        prev = q;
      }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      // three cars, each following the curve of the track behind the head
      const sH = this.trainS(L, tau, sl), carL = 20 * u, hw = lw * 0.9;
      for (let k = 2; k >= 0; k--) {
        const q = pos(L.P, sH - L.dir * (k * (carL + 4 * u) + carL / 2)), ang = Math.atan2(q.dy, q.dx);
        ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(ang);
        ctx.fillStyle = pal.bg; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-carL / 2 - 2 * u, -hw - 2 * u, carL + 4 * u, hw * 2 + 4 * u, hw); else ctx.rect(-carL / 2, -hw, carL, hw * 2); ctx.fill();
        ctx.fillStyle = k === 0 ? (night ? '#ffffff' : pal.ink) : L.col; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-carL / 2, -hw, carL, hw * 2, hw * 0.7); else ctx.rect(-carL / 2, -hw, carL, hw * 2); ctx.fill();
        ctx.fillStyle = k === 0 ? L.col : (night ? 'rgba(255,255,255,0.85)' : '#ffffff');
        for (const s of [-0.28, 0.12]) ctx.fillRect(s * carL, -hw * 0.42, carL * 0.18, hw * 0.84);
        ctx.restore();
      }
      if (night) {   // headlight
        const fwd = pos(L.P, sH + L.dir * 6 * u), g2 = ctx.createRadialGradient(fwd.x, fwd.y, 0, fwd.x, fwd.y, 40 * u);
        g2.addColorStop(0, 'rgba(255,255,255,0.55)'); g2.addColorStop(0.35, L.col + '55'); g2.addColorStop(1, L.col + '00');
        ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(fwd.x, fwd.y, 40 * u, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
      }
    }
    // hats: sparks thrown off a train
    for (const o of this.hats) {
      const age = mod(tau - o.rt, sl); if (age > 0.3) continue;
      const L = lines[Math.abs(o.i) % lines.length], p = pos(L.P, this.trainS(L, tau, sl)), r = mulberry(o.i * 7 + 3);
      ctx.fillStyle = night ? '#ffffff' : pal.ink; ctx.globalAlpha = (1 - age / 0.3) * 0.9;
      for (let k = 0; k < 4; k++) { const a = r() * TAU, d = (12 + age * 170 * (0.5 + r())) * u; ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, 2.3 * u, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }

    // ---- screen: signage on top, the arrivals board and the piano below ----
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const hexA = a => Math.round(clamp(a, 0, 1) * 255).toString(16).padStart(2, '0');
    const band = (y0, y1, a0, a1) => { const gr = ctx.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, pal.bg + hexA(a0)); gr.addColorStop(1, pal.bg + hexA(a1)); ctx.fillStyle = gr; ctx.fillRect(0, y0, W, y1 - y0); };
    band(0, H * 0.2, 0.96, 0); band(H * 0.56, H * 0.68, 0, 0.97); ctx.fillStyle = pal.bg + hexA(0.97); ctx.fillRect(0, H * 0.68, W, H * 0.32);

    const mx = W * 0.075, yT = H * 0.085;
    const title = titleCase(S.title || ''); let ts = 64 * u; ctx.font = `700 ${ts}px ${HEL}`;
    const tw = ctx.measureText(title).width; if (tw > W - 2 * mx) { ts *= (W - 2 * mx) / tw; ctx.font = `700 ${ts}px ${HEL}`; }
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = pal.ink; ctx.fillText(title, mx, yT);
    ctx.font = `400 ${16 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced([(S.tag || '').toUpperCase(), `${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('   ·   '), mx, yT + 36 * u, 2.2 * u, 'left');
    // the line bullets, like the sign at a station entrance; a line's bullet lights while its train moves
    let bx = mx + 16 * u;
    for (const L of lines) {
      const by = yT + 82 * u, moving = Math.abs(this.trainS(L, tau, sl) - this.trainS(L, mod(tau - 0.03, sl), sl)) % L.P.len > 0.5;
      ctx.fillStyle = L.col; ctx.globalAlpha = moving ? 1 : 0.85; ctx.beginPath(); ctx.arc(bx, by, (moving ? 17 : 15) * u, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = textOn(L.col); ctx.font = `700 ${14 * u}px ${HEL}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(this.name12(L.pc), bx, by + 1 * u);
      bx += 40 * u;
    }

    // arrivals board: the last train that pulled in, its letters flipping over when it changes
    let lastSt = null, lastAge = Infinity, lastL = null;
    for (const L of lines) for (const st of L.stops) { const a = mod(tau - st.rt, sl); if (a < lastAge) { lastAge = a; lastSt = st; lastL = L; } }
    const yB = H * 0.715;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced('NOW ARRIVING', mx, yB - 70 * u, 3 * u, 'left');
    if (lastSt) {
      const flip = clamp(lastAge / 0.13, 0, 1), bob = 1 + 0.12 * Math.exp(-lastAge / 0.08);
      ctx.fillStyle = lastL.col; ctx.beginPath(); ctx.arc(mx + 27 * u, yB - 20 * u, 27 * u * bob, 0, TAU); ctx.fill();
      ctx.fillStyle = textOn(lastL.col); ctx.font = `700 ${22 * u}px ${HEL}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(this.name12(lastL.pc), mx + 27 * u, yB - 19 * u);
      ctx.save(); ctx.translate(mx + 74 * u, yB - 20 * u); ctx.scale(1, 0.1 + 0.9 * flip);
      ctx.textAlign = 'left'; ctx.fillStyle = pal.ink; ctx.font = `700 ${68 * u}px ${HEL}`;
      ctx.fillText(lastSt.notes.slice(0, 3).map(n => `${this.name12(n.pc)}${n.oct}`).join(' · '), 0, 4 * u);
      ctx.restore();
      ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'; ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
      spaced(`${this.name12(lastL.pc)} LINE · STOP ${pad(lastL.stops.indexOf(lastSt) + 1, 2)}/${pad(lastL.stops.length, 2)}`, W - mx, yB - 70 * u, 2.2 * u, 'right');
    }
    // the piano: each played key goes down in its note's colour, for as long as the note lasts
    const lo = this.keyLo ?? 48, hi = this.keyHi ?? 71, whites = []; for (let m = lo; m <= hi; m++) if (!BLACK.has(mod(m, 12))) whites.push(m);
    const PW = W - 2 * mx, kw = PW / whites.length, kh = 92 * u, ky = yB + 26 * u, keys = {};
    whites.forEach((m, k) => { keys[m] = { x: mx + k * kw, w: kw, h: kh }; });
    for (let m = lo; m <= hi; m++) if (BLACK.has(mod(m, 12)) && keys[m - 1]) keys[m] = { x: keys[m - 1].x + kw * 0.69, w: kw * 0.62, h: kh * 0.6, black: true };
    const lit = {};
    for (const o of this.notes) {
      const age = mod(tau - o.rt, sl), hold = o.dur > 0 ? Math.min(o.dur, sl * 0.9) : 0.12;
      if (age > hold + 0.6) continue;
      lit[o.mm] = Math.max(lit[o.mm] || 0, age < hold ? 1 : Math.exp(-(age - hold) / 0.18));
    }
    ctx.lineWidth = 1.2 * u; ctx.strokeStyle = night ? 'rgba(255,255,255,0.3)' : pal.ink;
    for (const m of whites) { const k = keys[m]; ctx.fillStyle = pal.key; ctx.fillRect(k.x, ky, k.w, k.h); ctx.strokeRect(k.x, ky, k.w, k.h); }
    for (const m of whites) if (lit[m]) { const k = keys[m]; ctx.globalAlpha = lit[m]; ctx.fillStyle = pal.colors[mod(m, 12)]; ctx.fillRect(k.x + 1.5 * u, ky + 1.5 * u, k.w - 3 * u, k.h - 3 * u); ctx.globalAlpha = 1; }
    for (let m = lo; m <= hi; m++) {
      const k = keys[m]; if (!k || !k.black) continue;
      ctx.fillStyle = pal.keyB; ctx.fillRect(k.x, ky, k.w, k.h);
      if (lit[m]) { ctx.globalAlpha = lit[m]; ctx.fillStyle = pal.colors[mod(m, 12)]; ctx.fillRect(k.x + 1.5 * u, ky + 1.5 * u, k.w - 3 * u, k.h - 3 * u); ctx.globalAlpha = 1; }
    }
    // progress and time
    const py = ky + kh + 34 * u, prog = tau / sl;
    ctx.fillStyle = pal.mute; ctx.globalAlpha = 0.45; ctx.fillRect(mx, py - 1 * u, PW, 2 * u); ctx.globalAlpha = 1;
    ctx.fillStyle = pal.ink; ctx.fillRect(mx, py - 1.5 * u, PW * prog, 3 * u);
    ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(mx + PW * prog, py, 5.5 * u, 0, TAU); ctx.fill();
    const bar = S.startBar + Math.floor(tau / bd) + 1, beat = Math.floor(mod(tau, bd) / (bd / 4)) + 1;
    ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = pal.mute; ctx.textBaseline = 'alphabetic';
    spaced(fmtT(tau), mx, py + 32 * u, 1.5 * u, 'left');
    spaced(`BAR ${pad(bar, 2)}.${beat} / ${pad(S.startBar + S.lenBars, 2)}`, W - mx, py + 32 * u, 1.5 * u, 'right');

    if (pal.grain) grain(pal.grain);
  }
};

export default METRO;
