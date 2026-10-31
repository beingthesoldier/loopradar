// SONAR: a slow, soft radar where the melody blooms as living cells.
// A beam sweeps the scope (once a bar, every two bars, or once per loop). Each note sits where the beam
// passes it: its angle is its moment in the sweep, its distance from the centre its pitch. As the beam
// reaches it the note blooms into a cell: it swells, a star lights in its middle while the note holds,
// then it slowly dims and is gone before the beam comes round again. Where cells press together their
// walls glow as membranes, brightest where three meet; inside, fine fibres run out to the rim.
// A kick sends a sonar ping out from the centre that brightens the walls it crosses; hats are specks of dust.
// The cells' light is worked out on a small grid every frame and drawn up soft; fibres, flares and the
// scope go on a light layer that is added onto the dark palettes and inverted for the light ones (ink on paper).
import { S, segLen, barDur } from '../state.js';
import { ctx, W, H, u, cx, spaced, MONO } from '../render/canvas.js';
import { waveStrip, SAFE_TOP, SAFE_BOTTOM } from '../render/hud.js';
import { clamp, mod, TAU, hsh, mulberry, pad, titleCase } from '../util.js';

const SANS = 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const midiOf = p => Math.round(69 + 12 * Math.log2(p / 440));
const nameOf = m => FLAT[mod(m, 12)] + (Math.floor(m / 12) - 1);
const PALS = {
  night: { dark: true, bg: '#050506', tint: '#eef1f4', ink: '#e8eaee', mute: '#6b6f77', dim: '#2a2c31' },
  abyss: { dark: true, bg: '#03060c', tint: '#bfe1ff', ink: '#d6e8ff', mute: '#5a6a80', dim: '#1b2533' },
  paper: { dark: false, bg: '#f3f2ee', ink: '#141518', mute: '#8b8983', dim: '#d2d0ca' },
  pearl: { dark: false, bg: '#ece9f0', ink: '#251f2e', mute: '#8e879a', dim: '#d3cfda' }
};
const SPR = 512;   // the fibre texture's size
// a cell swelling up, with a little overshoot
const swell = k => { const c = 1.4; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; };

const SONAR = {
  id: 'sonar', name: 'Sonar',
  defaults: { pal: 'night', sweep: 2, cell: 1, glow: 0.7, ping: 0.5, fiber: 0.6, labels: 'on', grid: 'on' },
  controls: [
    { key: 'pal', label: 'Colour', type: 'choice', options: [['night', 'night'], ['abyss', 'abyss'], ['paper', 'paper'], ['pearl', 'pearl']] },
    { key: 'sweep', label: 'Sweep', type: 'choice', options: [[1, '1 bar'], [2, '2 bars'], [0, 'loop']], then: 'rebuild' },
    { key: 'cell', label: 'Cell size', type: 'range', min: 0.6, max: 1.6, step: 0.01, format: v => v.toFixed(2) + '×', then: 'rebuild' },
    { key: 'glow', label: 'Afterglow', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'ping', label: 'Ping from kick', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'fiber', label: 'Fibres', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'labels', label: 'Note names', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'grid', label: 'Scope', type: 'choice', options: [['on', 'on'], ['off', 'off']] }
  ],
  lum: document.createElement('canvas'), fld: document.createElement('canvas'), spr: null,
  notes: [], kicks: [], hats: [],

  setup() {
    // top to bottom: the header on SAFE_TOP, the scope, three readouts, the waveform strip ending on SAFE_BOTTOM
    const mx = W * 0.07, stripY = H * SAFE_BOTTOM - 86 * u, readY = stripY - 96 * u, top = H * SAFE_TOP + 66 * u;
    const D = Math.floor(Math.min(W * 0.88, readY - 40 * u - top)), cyS = top + D / 2;
    Object.assign(this, { mx, stripY, readY, D, cyS, Rr: D / 2 - 6 * u });
    this.Rc = this.Rr * 0.86;
    this.lum.width = this.lum.height = D; this.lctx = this.lum.getContext('2d');
    const FS = this.FS = Math.min(520, Math.round(D / 1.8));
    this.fld.width = this.fld.height = FS; this.fctx = this.fld.getContext('2d');
    this.img = this.fctx.createImageData(FS, FS);
    for (let i = 3; i < this.img.data.length; i += 4) this.img.data[i] = 255;
    this.buildNoise();
    if (!this.spr) this.buildSprite();
    if (this.notes.length) this.place();
  },

  // smooth noise, twice the grid's size: each cell reads it at its own offset, so the walls between
  // cells bend and wander instead of running as clean arcs
  buildNoise() {
    const NS = this.NS = this.FS * 2, N = this.noise = new Float32Array(NS * NS), r = mulberry(31);
    for (const [step, amp] of [[26, 0.7], [10, 0.3]]) {
      const gw = Math.ceil(NS / step) + 2, lat = Float32Array.from({ length: gw * gw }, () => r() * 2 - 1);
      for (let y = 0; y < NS; y++) {
        const fy = y / step, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
        for (let x = 0; x < NS; x++) {
          const fx = x / step, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx), k = iy * gw + ix;
          const top = lat[k] + (lat[k + 1] - lat[k]) * sx, bot = lat[k + gw] + (lat[k + gw + 1] - lat[k + gw]) * sx;
          N[y * NS + x] += (top + (bot - top) * sy) * amp;
        }
      }
    }
  },

  // the fibres inside a cell: hairlines from somewhere inside out to the rim, so the rim gathers the most light
  buildSprite() {
    const c = this.spr = document.createElement('canvas'); c.width = c.height = SPR;
    const g = c.getContext('2d'), r = mulberry(99), h = SPR / 2; g.lineCap = 'round';
    for (let i = 0; i < 2400; i++) {
      const a = r() * TAU, r0 = h * (0.05 + 0.75 * r() ** 0.7), r1 = h * (0.86 + 0.11 * r()), bend = (r() - 0.5) * 0.3, am = a + bend * 0.6;
      g.strokeStyle = `rgba(255,255,255,${0.05 + 0.12 * r()})`; g.lineWidth = 0.5 + r() * 0.9;
      g.beginPath(); g.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0);
      g.quadraticCurveTo(h + Math.cos(am) * (r0 + r1) / 2, h + Math.sin(am) * (r0 + r1) / 2, h + Math.cos(a + bend) * r1, h + Math.sin(a + bend) * r1); g.stroke();
    }
    for (let i = 0; i < 900; i++) { const a = r() * TAU, d = h * Math.sqrt(r()) * 0.95; g.fillStyle = `rgba(255,255,255,${0.04 + 0.1 * r()})`; g.fillRect(h + Math.cos(a) * d, h + Math.sin(a) * d, 1.3, 1.3); }
  },

  prepare(seg) {
    const sl = segLen(), bd = barDur();
    const notes = seg.filter(o => o.type === 'mid' && (o.mm || o.p > 20)).map(o => ({ rt: o.rt, s: o.s, m: o.mm || midiOf(o.p), dur: o.dur || 0 }));
    notes.sort((a, b) => a.rt - b.rt || a.m - b.m);
    notes.forEach((n, i) => {
      if (!n.dur) { let j = i + 1; while (j < notes.length && notes[j].rt - n.rt < 1e-3) j++; const nx = j < notes.length ? notes[j].rt : (notes[0] ? notes[0].rt + sl : n.rt + bd / 2); n.dur = clamp((nx - n.rt) * 0.9, bd / 16, bd / 2); }
      n.dur = Math.min(n.dur, sl * 0.8); n.i = i;
    });
    this.notes = notes;
    // pings: the strongest kicks, at most one a beat
    const lows = seg.filter(o => o.type === 'low'), cut = Math.max(0.35, lows.map(o => o.s).sort((a, b) => a - b)[Math.floor(lows.length * 0.5)] || 0);
    let last = -1e9; this.kicks = [];
    for (const o of lows) { if (o.s < cut || o.rt - last < bd / 4 - 1e-6) continue; last = o.rt; this.kicks.push({ rt: o.rt, s: o.s }); }
    this.hats = seg.filter(o => o.type === 'high').map(o => ({ rt: o.rt, s: o.s }));
    this.place();
  },

  // where every note sits on the scope, and how big its cell is
  place() {
    const P = S.sonar, sl = segLen(), bd = barDur(), notes = this.notes, Rc = this.Rc || 300;
    this.period = +P.sweep ? Math.min(sl, +P.sweep * bd) : sl;
    let lo = 60, hi = 72;
    if (notes.length) { lo = Math.min(...notes.map(n => n.m)); hi = Math.max(...notes.map(n => n.m)); }
    if (hi - lo < 12) { const c = (hi + lo) / 2; lo = c - 6; hi = c + 6; }
    // the notes of a chord (same moment): their cells are a little smaller
    const at = new Map(); for (const n of notes) { const k = n.rt.toFixed(3); if (!at.has(k)) at.set(k, []); at.get(k).push(n); }
    for (const g of at.values()) g.forEach(n => { n.fan = 0; n.small = 1 / (1 + 0.12 * (g.length - 1)); });
    for (const n of notes) {
      const ang = -Math.PI / 2 + TAU * mod(n.rt, this.period) / this.period + n.fan + (hsh(n.i + 0.3) - 0.5) * 0.05;
      const rad = (0.16 + 0.62 * (n.m - lo) / (hi - lo) + (hsh(n.i + 3.1) - 0.5) * 0.06) * Rc;
      n.x = Math.cos(ang) * rad; n.y = Math.sin(ang) * rad; n.ang = ang;
      n.r = Rc * (0.16 + 0.07 * n.s + 0.09 * clamp(n.dur / (bd / 2), 0, 1)) * P.cell * n.small;
      n.ph = hsh(n.i + 9.7) * TAU; n.rot = hsh(n.i + 1.9) * TAU; n.nx = hsh(n.i + 4.4); n.ny = hsh(n.i + 6.6);
    }
    // a chord's cells gather round one point (its average pitch), each pushed out in its own direction,
    // so they press together into a little colony with a bright junction in the middle
    for (const g of at.values()) {
      if (g.length < 2) continue;
      const mx = g.reduce((s, n) => s + n.x, 0) / g.length, my = g.reduce((s, n) => s + n.y, 0) / g.length, rAvg = g.reduce((s, n) => s + n.r, 0) / g.length;
      const spin = hsh(g[0].i + 0.77) * TAU, off = rAvg * (g.length === 2 ? 0.72 : 0.92);
      g.forEach((n, j) => { const a = spin + TAU * j / g.length; n.x = mx + Math.cos(a) * off; n.y = my + Math.sin(a) * off; n.ang = Math.atan2(n.y, n.x); });
    }
  },

  /* ---------------- a frame ---------------- */
  draw(tau) {
    const P = S.sonar, pal = PALS[P.pal] || PALS.night, sl = segLen(), bd = barDur(), D = this.D, half = D / 2, Rr = this.Rr;
    const period = this.period || sl, life = clamp(period * (0.3 + 0.62 * P.glow), 0.6, period * 0.95);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);

    // the cells alive now: swell in a third of a second, hold while the note sounds, then dim over the afterglow
    const live = [];
    for (const n of this.notes) {
      const age = mod(tau - n.rt, sl); if (age >= life) continue;
      const grow = swell(Math.min(1, age / 0.32)), on = age < 0.03 ? age / 0.03 : age < n.dur ? 1 : Math.max(0, 1 - (age - n.dur) / 0.35) ** 2;
      const fade = age < n.dur ? 1 : clamp(1 - (age - n.dur) / Math.max(0.2, life - n.dur), 0, 1), a = fade ** 1.3;
      const r = n.r * grow * (0.88 + 0.12 * a) * (1 + 0.03 * Math.sin(TAU * 3 * tau / sl + n.ph));
      live.push({ n, x: n.x, y: n.y, r, a: 0.22 + 0.78 * a, on, age });
    }
    const pings = [];
    for (const k of this.kicks) { const age = mod(tau - k.rt, sl); if (age < 1.2) pings.push({ r: (age / 1.2) ** 0.8 * Rr, amp: P.ping * k.s * (1 - age / 1.2) ** 1.5 }); }

    const sounding = live.filter(c => c.on > 0.01).length, dimStar = 1 / Math.sqrt(Math.max(1, sounding));

    // ---- the membranes, on a small grid ----
    const FS = this.FS, sc = FS / D, data = this.img.data, pc = FS / 2, Rf = Rr * sc, NS = this.NS, NZ = this.noise;
    // per cell: x, y, radius, light, where it reads the noise (row offset, column offset), how far the noise bends it
    const C = live.map(c => [(half + c.x) * sc, (half + c.y) * sc, c.r * sc, c.a + 0.3 * c.on * dimStar, Math.floor(c.n.ny * (NS - FS)), Math.floor(c.n.nx * (NS - FS)), c.r * sc * 0.09]);
    const PG = pings.map(p => [p.r * sc, p.amp * 2.2]), pw = 7, row = [];
    for (let y = 0; y < FS; y++) {
      row.length = 0; for (const c of C) if (Math.abs(y - c[1]) < c[2] + c[6] + 32) row.push(c);
      for (let x = 0; x < FS; x++) {
        const idx = (y * FS + x) * 4, dxC = x - pc, dyC = y - pc, rho = Math.sqrt(dxC * dxC + dyC * dyC);
        if (rho > Rf + 2 || !row.length) { data[idx] = data[idx + 1] = data[idx + 2] = 0; continue; }
        let e1 = 1e9, e2 = 1e9, e3 = 1e9, a1 = 0, a2 = 0, a3 = 0;
        for (let k = 0; k < row.length; k++) {
          const c = row[k], dx = x - c[0], dy = y - c[1], e = Math.sqrt(dx * dx + dy * dy) - c[2] + NZ[(y + c[4]) * NS + x + c[5]] * c[6];
          if (e < e3) { if (e < e2) { e3 = e2; a3 = a2; if (e < e1) { e2 = e1; a2 = a1; e1 = e; a1 = c[3]; } else { e2 = e; a2 = c[3]; } } else { e3 = e; a3 = c[3]; } }
        }
        // the nearest wall: a cell's own outline, or the wall it shares with the next cell (both lit, so brighter);
        // the same falloff on both sides, so the light never jumps
        let L = 0;
        if (e1 < 0) {
          const toRim = -e1, toSeam = e2 - e1, shared = toSeam < toRim, m = shared ? toSeam * 0.5 : toRim;
          const A = shared ? Math.max(a1, a2) + 0.2 * Math.min(a1, a2) : a1;
          L = A * (0.8 * Math.exp(-m / 1.3) + 0.2 * Math.exp(-m / 8)) + a1 * 0.035;
          if (e3 < 0) L += Math.min(a1, a2, a3) * 1.3 * Math.exp(-(e3 - e1) / 2.4);   // where three meet
        } else if (e1 < 40) L = a1 * (0.8 * Math.exp(-e1 / 1.3) + 0.2 * Math.exp(-e1 / 8));
        for (let k = 0; k < PG.length; k++) { const d = (rho - PG[k][0]) / pw; if (d > -3 && d < 3) L *= 1 + PG[k][1] * Math.exp(-d * d); }
        const v = 255 * (1 - Math.exp(-1.7 * L));   // a soft shoulder instead of a hard clip, so bright walls keep their shape
        data[idx] = data[idx + 1] = data[idx + 2] = v;
      }
    }
    this.fctx.putImageData(this.img, 0, 0);

    // ---- the light layer: membranes drawn up soft, fibres, flares, the scope ----
    const g = this.lctx;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, D, D);
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.fld, 0, 0, D, D);
    if (P.fiber > 0.01) for (const c of live) {
      g.save(); g.translate(half + c.x, half + c.y); g.rotate(c.n.rot); g.scale(c.r * 2 / SPR, c.r * 2 / SPR);
      g.globalAlpha = Math.min(1, (0.2 + 0.6 * c.a + 0.1 * c.on) * P.fiber); g.drawImage(this.spr, -SPR / 2, -SPR / 2); g.restore();
    }
    // a star in the middle of a cell while its note sounds (dimmer when a whole chord sounds)
    for (const c of live) {
      if (c.on < 0.01) continue;
      const x = half + c.x, y = half + c.y, R = 15 * u * (0.6 + 0.4 * c.on), gr = g.createRadialGradient(x, y, 0, x, y, R), k = c.on * dimStar;
      gr.addColorStop(0, `rgba(255,255,255,${0.8 * k})`); gr.addColorStop(0.25, `rgba(255,255,255,${0.28 * k})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 1; g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,255,255,${0.28 * k})`; g.lineWidth = 0.9 * u;
      for (let k = 0; k < 6; k++) { const a = c.n.rot + k * Math.PI / 3, l = (16 + 20 * c.on) * u * (k % 2 ? 0.6 : 1); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    }
    // hats: specks of dust that catch the light for a moment
    for (const o of this.hats) {
      const age = mod(tau - o.rt, sl); if (age > 0.35) continue;
      const a = hsh(o.rt * 13.1) * TAU, d = (0.3 + 0.65 * hsh(o.rt * 7.7)) * Rr;
      g.globalAlpha = (1 - age / 0.35) * 0.6 * o.s; g.fillStyle = '#fff'; g.beginPath(); g.arc(half + Math.cos(a) * d, half + Math.sin(a) * d, 1.5 * u, 0, TAU); g.fill();
    }
    // pings
    g.strokeStyle = '#fff'; g.lineWidth = 1.2 * u;
    for (const p of pings) { g.globalAlpha = Math.min(1, p.amp * 0.5); g.beginPath(); g.arc(half, half, p.r, 0, TAU); g.stroke(); }
    // the beam: a soft wedge of light trailing a thin line
    const phi = -Math.PI / 2 + TAU * mod(tau, period) / period, wedge = 1.3;
    if (g.createConicGradient) {
      const cg = g.createConicGradient(phi - wedge, half, half), k = wedge / TAU, peak = 0.045 + 0.05 * P.glow;
      cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(k * 0.55, `rgba(255,255,255,${peak * 0.25})`); cg.addColorStop(k * 0.999, `rgba(255,255,255,${peak})`);
      cg.addColorStop(k, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 1; g.fillStyle = cg; g.beginPath(); g.arc(half, half, Rr, 0, TAU); g.fill();
    }
    g.globalAlpha = 0.45; g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(half, half); g.lineTo(half + Math.cos(phi) * Rr, half + Math.sin(phi) * Rr); g.stroke();
    // the scope: dotted rings, the rim with a tick every beat, a faint cross
    if (P.grid !== 'off') {
      g.fillStyle = '#fff';
      for (const f of [0.25, 0.5, 0.75]) { const R = Rr * f, n = Math.round(TAU * R / (11 * u)); g.globalAlpha = 0.28; for (let k = 0; k < n; k++) { const a = TAU * k / n; g.beginPath(); g.arc(half + Math.cos(a) * R, half + Math.sin(a) * R, 0.9 * u, 0, TAU); g.fill(); } }
      g.globalAlpha = 0.32; g.lineWidth = 1 * u; g.beginPath(); g.arc(half, half, Rr, 0, TAU); g.stroke();
      const beats = Math.max(4, Math.round(period / (bd / 4)));
      for (let k = 0; k < beats; k++) {
        const a = -Math.PI / 2 + TAU * k / beats, l = (k % 4 === 0 ? 12 : 6) * u;
        g.globalAlpha = k % 4 === 0 ? 0.5 : 0.3; g.beginPath(); g.moveTo(half + Math.cos(a) * Rr, half + Math.sin(a) * Rr); g.lineTo(half + Math.cos(a) * (Rr - l), half + Math.sin(a) * (Rr - l)); g.stroke();
      }
      g.globalAlpha = 0.07; g.beginPath(); g.moveTo(half - Rr, half); g.lineTo(half + Rr, half); g.moveTo(half, half - Rr); g.lineTo(half, half + Rr); g.stroke();
      g.globalAlpha = 0.6; g.beginPath(); g.arc(half, half, 2 * u, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    // onto the frame: added to the dark, or turned into ink on the light palettes
    g.globalCompositeOperation = pal.dark ? 'multiply' : 'difference';
    g.fillStyle = pal.dark ? pal.tint : '#ffffff'; g.fillRect(0, 0, D, D);
    if (!pal.dark) { g.globalCompositeOperation = 'multiply'; g.fillStyle = pal.bg; g.fillRect(0, 0, D, D); }
    g.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over';
    ctx.drawImage(this.lum, Math.round(cx - half), Math.round(this.cyS - half));
    ctx.globalCompositeOperation = 'source-over';

    // names of the notes just born, outside their cells
    const x0 = cx - half, y0 = this.cyS - half;
    if (P.labels !== 'off') {
      ctx.font = `400 ${13 * u}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.ink;
      for (const c of live) {
        if (c.age > 1) continue;
        const ox = Math.cos(c.n.ang), oy = Math.sin(c.n.ang), x = x0 + half + c.x + ox * (c.r + 12 * u), y = y0 + half + c.y + oy * (c.r + 12 * u);
        ctx.globalAlpha = 0.85 * (1 - c.age); ctx.textAlign = ox > 0.3 ? 'left' : ox < -0.3 ? 'right' : 'center';
        ctx.fillText(nameOf(c.n.m), x, y);
      }
      ctx.globalAlpha = 1;
    }

    // header
    const mx = this.mx, yH = H * SAFE_TOP;
    const title = titleCase(S.title || ''); let ts = 50 * u; ctx.font = `300 ${ts}px ${SANS}`;
    const tw = ctx.measureText(title).width, max = W * 0.6; if (tw > max) { ts *= max / tw; ctx.font = `300 ${ts}px ${SANS}`; }
    ctx.fillStyle = pal.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(title, mx, yH);
    ctx.font = `400 ${14 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced([(S.tag || '').toUpperCase(), `${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('  ·  '), mx, yH + 32 * u, 2 * u, 'left');
    spaced(`SWEEP ${+P.sweep ? `${P.sweep} BAR${+P.sweep > 1 ? 'S' : ''}` : 'LOOP'}`, W - mx, yH, 2 * u, 'right');

    // readouts: where the beam points, the last echo, how many cells are alive
    let lastN = null, lastAge = 1e9; for (const c of live) if (c.age < lastAge) { lastAge = c.age; lastN = c.n; }
    const deg = Math.round(mod(phi + Math.PI / 2, TAU) / TAU * 360) % 360;
    const cols = [['BEARING', `${pad(deg, 3)}°`], ['ECHO', lastN ? nameOf(lastN.m) : '—'], ['CELLS', pad(live.length, 2)]];
    cols.forEach(([k, v], i) => {
      const x = mx + i * (W - 2 * mx) / 3;
      ctx.font = `400 ${12 * u}px ${MONO}`; ctx.fillStyle = pal.mute; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      spaced(k, x, this.readY, 2.5 * u, 'left');
      ctx.font = `300 ${36 * u}px ${SANS}`; ctx.fillStyle = pal.ink; ctx.fillText(v, x, this.readY + 42 * u);
    });
    waveStrip(tau, { x: mx, y: this.stripY, w: W - 2 * mx, ink: pal.ink, dim: pal.dim, mute: pal.mute, head: pal.ink });
  }
};

export default SONAR;
