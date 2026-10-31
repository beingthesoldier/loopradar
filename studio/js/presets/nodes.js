// NODES: the melody as a graph that grows out of one point while it plays, over a soft piano roll.
// Every loop starts from a single point, the beat itself. Each note that plays becomes a new node and grows
// out of the node of the closest pitch heard in the bar before it (the first ones out of the centre), so the
// melody branches the way it moves. Nodes sit further out the later they play: bar 1 close round the point,
// bar 2 a shell further out, then 3, 4…, so the graph keeps moving out into space and the camera pulls back
// to keep it in frame. A faint ring marks each bar's shell. A note's node swells while it sounds; a light
// runs out along its link as it grows; nodes of the same pitch are linked too, like a notes app's graph view.
// In the last moments of the loop the whole graph draws back into the point, so the next loop starts clean.
// Everything is worked out from the time alone, so the loop has no seam.
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


const smooth = k => k * k * (3 - 2 * k);
const shell = t => 0.35 + 0.6 * Math.max(0, t) ** 0.85;   // how far out a note sits, t in bars: each bar a shell further out

const NODES = {
  id: 'nodes', name: 'Nodes',
  defaults: { pal: 'cloud', motion: 'orbit', walk: 'on', web: 'on', labels: 'on', zoom: 2 },
  controls: [
    { key: 'pal', label: 'Colour', type: 'choice', options: [['cloud', 'cloud'], ['paper', 'paper'], ['sky', 'sky'], ['night', 'night'], ['aurora', 'aurora']], then: 'buildBG' },
    { key: 'motion', label: 'Motion', type: 'choice', options: [['orbit', 'orbit'], ['sway', 'sway'], ['still', 'still']] },
    { key: 'walk', label: 'Light on new links', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'web', label: 'Link same notes', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'labels', label: 'Note names', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'zoom', label: 'Piano roll', type: 'choice', options: [[1, '1 bar'], [2, '2 bars'], [4, '4 bars']] }
  ],
  bg: document.createElement('canvas'),
  notes: [],

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
    const ms = notes.map(n => n.m), mLo = ms.length ? Math.min(...ms) : 60, mHi = ms.length ? Math.max(...ms) : 72;
    // where each note grows: out of the closest pitch heard within the bar before it (or the centre),
    // carrying on in that node's direction with a turn of its own, as far out as its time in the loop
    const lastOf = new Map();
    for (const n of notes) {
      let parent = null;
      for (let j = n.i - 1; j >= 0; j--) {
        const c = notes[j]; if (n.rt - c.rt < 1e-3) continue; if (n.rt - c.rt > bd + 1e-6) break;
        if (!parent || Math.abs(c.m - n.m) < Math.abs(parent.m - n.m)) parent = c;
      }
      const r = dir3(n.i * 3.17 + n.m * 0.13 + 1.1);
      let d;
      if (parent) d = norm([parent.dir[0] + r[0] * 0.95, parent.dir[1] + r[1] * 0.95, parent.dir[2] + r[2] * 0.95]);
      else { const up = mHi > mLo ? ((mLo + mHi) / 2 - n.m) / (mHi - mLo) : 0; d = norm([r[0], r[1] * 0.5 + up * 0.9, r[2]]); }   // y points down: high notes up
      const rad = shell(n.rt / bd);
      n.dir = d; n.p = [d[0] * rad, d[1] * rad, d[2] * rad]; n.parent = parent ? parent.i : -1;
      const same = lastOf.get(n.m); n.web = same && same !== parent ? same.i : -1; lastOf.set(n.m, n);
    }
    this.notes = notes;
    // the piano roll's rows: the melody's range, at least an octave
    let lo = mLo - 1, hi = mHi + 1;
    if (hi - lo < 11) { const c = (hi + lo) / 2; lo = Math.floor(c - 5.5); hi = lo + 11; }
    this.lo = lo; this.hi = hi;
  },

  /* ---------------- a frame ---------------- */
  draw(tau) {
    const N = S.nodes, pal = this.pal || PALS.cloud, sl = segLen(), bd = barDur();
    if (!this.gh) this.layoutBoxes();
    ctx.drawImage(this.bg, 0, 0);
    const notes = this.notes, colOf = pc => pal.hues ? pal.hues[pc] : pal.accent;

    // the loop's last moments: everything draws back into the point
    const close = Math.min(bd * 0.5, sl * 0.12), k = tau > sl - close ? smooth((tau - (sl - close)) / close) : 0, keep = 1 - k;
    const th = N.motion === 'orbit' ? TAU * tau / sl : N.motion === 'sway' ? 0.5 * Math.sin(TAU * tau / sl) : 0;
    const ct = Math.cos(th), st = Math.sin(th), tilt = 0.32, cp = Math.cos(tilt), sp = Math.sin(tilt);

    // the nodes born so far: each slides out of its parent as it grows (and all of them back in at the end)
    const born = [], at = new Map(), O = [0, 0, 0];
    for (const n of notes) {
      if (tau < n.rt) break;
      const age = tau - n.rt, g = smooth(Math.min(1, age / 0.3)), from = n.parent >= 0 ? notes[n.parent].p : O;
      const w = [(from[0] + (n.p[0] - from[0]) * g) * keep, (from[1] + (n.p[1] - from[1]) * g) * keep, (from[2] + (n.p[2] - from[2]) * g) * keep];
      const e = { n, w, g, a: lit(age, n.dur), age }; born.push(e); at.set(n.i, e);
    }
    // the camera flies with the graph: it aims between the point and what's grown, and pulls back so all of it fits
    let sw = 1, c = [0, 0, 0];
    for (const e of born) { const q = 0.6 * e.g; sw += q; for (let j = 0; j < 3; j++) c[j] += e.w[j] * q; }
    c = c.map(v => v / sw * 0.8);
    let ext = Math.hypot(...c);
    for (const e of born) ext = Math.max(ext, Math.hypot(e.w[0] - c[0], e.w[1] - c[1], e.w[2] - c[2]));
    ext = Math.max(shell(0) + 0.2, ext + 0.25);
    const gcx = cx, gcy = this.gy + this.gh * 0.5, SC = Math.min(this.gw, this.gh) * 0.47 / ext;
    const proj = p => {
      const px = p[0] - c[0], py = p[1] - c[1], pz = p[2] - c[2];
      const x = px * ct - pz * st, z0 = px * st + pz * ct, y = py * cp - z0 * sp, z = (py * sp + z0 * cp) / ext, f = 1 / (1 + z * 0.3);
      return { x: gcx + x * SC * f, y: gcy + y * SC * f, f, z, d: clamp(0.4 + 0.6 * (1 - (z + 1.2) / 2.4), 0.25, 1) };
    };
    for (const e of born) e.P = proj(e.w);
    const root = proj(O), fade = keep;
    const bar = Math.min(S.lenBars, Math.floor(Math.min(tau, sl - 1e-6) / bd) + 1);

    ctx.save(); ctx.beginPath(); ctx.rect(0, this.gy - 30 * u, W, this.gh + 60 * u); ctx.clip();
    // a faint ring for each bar's shell, as the graph reaches it
    ctx.lineWidth = 1 * u; ctx.font = `400 ${11 * u}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (let b = 1; b <= bar; b++) {
      const t0 = (b - 1) * bd, show = smooth(clamp((tau - t0) / 0.5, 0, 1)) * fade, R = shell(b - 0.5) * SC * keep;
      if (show < 0.01 || R < 4 * u) continue;
      ctx.globalAlpha = 0.24 * show; ctx.strokeStyle = pal.ink; ctx.setLineDash([3 * u, 6 * u]);
      ctx.beginPath(); ctx.ellipse(root.x, root.y, R, R * 0.92, 0, 0, TAU); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 0.7 * show; ctx.fillStyle = pal.mute;
      ctx.fillText(String(S.startBar + b), root.x + R * 0.7071 + 5 * u, root.y - R * 0.92 * 0.7071 - 5 * u);
    }
    ctx.globalAlpha = 1; ctx.lineCap = 'round';
    // links between nodes of the same pitch: hairlines
    if (N.web !== 'off') for (const e of born) {
      if (e.n.web < 0) continue; const o = at.get(e.n.web); if (!o) continue;
      ctx.globalAlpha = 0.16 * e.g * fade * Math.min(e.P.d, o.P.d); ctx.strokeStyle = pal.link; ctx.lineWidth = 0.8 * u;
      ctx.beginPath(); ctx.moveTo(o.P.x, o.P.y); ctx.lineTo(e.P.x, e.P.y); ctx.stroke();
    }
    // each node's link to the node it grew out of, tinted with its colour
    for (const e of born) {
      const from = e.n.parent >= 0 ? at.get(e.n.parent).P : root, col = colOf(e.n.pc);
      ctx.globalAlpha = (0.5 + 0.4 * e.a) * fade * Math.min(e.P.d, from.d); ctx.strokeStyle = pal.hues ? mix(pal.link, col, 0.45) : pal.link; ctx.lineWidth = (1.2 + 0.9 * e.a) * u;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(e.P.x, e.P.y); ctx.stroke();
      // the light running out along a new link
      if (N.walk !== 'off' && e.age < 0.45) {
        const q = 1 - e.age / 0.45, bx = from.x + (e.P.x - from.x) * 0.55, by = from.y + (e.P.y - from.y) * 0.55;
        ctx.globalAlpha = 0.85 * q * fade; ctx.strokeStyle = col; ctx.lineWidth = 2.2 * u;
        ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(e.P.x, e.P.y); ctx.stroke();
      }
    }
    // the point everything grows from: the beat
    ctx.globalAlpha = 0.9; ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(root.x, root.y, 6.5 * u, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.25; ctx.strokeStyle = pal.ink; ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(root.x, root.y, 13 * u, 0, TAU); ctx.stroke();
    // the nodes, far ones first: their colour, a little paler as they get older; swell and a ring while sounding
    born.sort((a, b) => b.P.z - a.P.z);
    for (const e of born) {
      const n = e.n, P = e.P, col = colOf(n.pc), r = (5 + 4 * n.s + 3.5 * Math.min(1, n.dur / (bd / 2))) * u * P.f * (0.3 + 0.7 * e.g) * (1 + 0.4 * e.a);
      const warm = clamp(1 - e.age / (bd * 4), 0.4, 1);
      if (e.a > 0.02) { ctx.globalAlpha = 0.4 * e.a * fade * P.d; ctx.strokeStyle = col; ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.arc(P.x, P.y, r + (4 + 5 * e.a) * u * P.f, 0, TAU); ctx.stroke(); }
      ctx.globalAlpha = fade * P.d; ctx.fillStyle = pal.bg; ctx.beginPath(); ctx.arc(P.x, P.y, r + 1.6 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = e.a > 0.05 ? col : mix(pal.node, col, warm); ctx.globalAlpha = (0.6 + 0.4 * Math.max(e.a, warm)) * fade * P.d;
      ctx.beginPath(); ctx.arc(P.x, P.y, r, 0, TAU); ctx.fill();
    }
    // names: a note's name shows as it's born and while it sounds; the beat's under the point
    if (N.labels !== 'off') {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (const e of born) {
        const v = Math.max(e.a, 1 - e.age / (bd * 0.6)); if (v <= 0.02) continue;
        ctx.globalAlpha = 0.85 * v * fade * e.P.d; ctx.fillStyle = pal.ink; ctx.font = `${e.a > 0.5 ? 500 : 400} ${13.5 * u}px ${SANS}`;
        ctx.fillText(nameOf(e.n.m), e.P.x, e.P.y + 9 * u * e.P.f + 5 * u);
      }
      ctx.globalAlpha = 0.8; ctx.fillStyle = pal.ink; ctx.font = `500 ${14 * u}px ${SANS}`;
      ctx.fillText(titleCase(S.title || 'kristudio'), root.x, root.y + 19 * u);
    }
    ctx.restore(); ctx.globalAlpha = 1;

    this.header(pal, Math.round(born.length * keep), bar);
    this.roll(tau, pal, colOf);
    waveStrip(tau, { x: this.mx, y: this.stripY, w: W - 2 * this.mx, ink: pal.ink, dim: pal.grid, mute: pal.mute, head: pal.hues ? pal.ink : pal.accent });
  },

  header(pal, count, bar) {
    const mx = this.mx, y = H * SAFE_TOP;
    const title = titleCase(S.title || ''); let ts = 50 * u; ctx.font = `300 ${ts}px ${SANS}`;
    const tw = ctx.measureText(title).width, max = W * 0.6; if (tw > max) { ts *= max / tw; ctx.font = `300 ${ts}px ${SANS}`; }
    ctx.fillStyle = pal.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(title, mx, y);
    ctx.font = `400 ${14 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced([(S.tag || '').toUpperCase(), `${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('  ·  '), mx, y + 32 * u, 2 * u, 'left');
    spaced(`${String(count).padStart(2, '0')} NODES · BAR ${S.startBar + bar}`, W - mx, y, 2 * u, 'right');
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
