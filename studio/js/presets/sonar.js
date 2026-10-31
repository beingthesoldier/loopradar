// SONAR: the melody as a round piano roll on a slow, soft radar.
// It is FL's piano roll bent into a circle: every note is an arc. It starts where its moment is round the
// circle and runs as long as the note lasts; its pitch is its distance from the centre, high notes out at
// the rim, low notes near the middle (a ring per semitone, a dotted ring at every C). The beam is the
// playhead: it sweeps round (once a bar, every two or four bars, or once per loop), the notes ahead of it
// wait, the note under it lights up with a star where the beam crosses it, and the notes behind it dim and
// go, so each turn shows the bars coming up. The notes are drawn like living cells: their walls glow, where
// two touch they share a bright wall, fine fibres run across them, and their edges bend a little.
// A small keyboard rides along the beam and lights the keys that sound. A kick sends a sonar ping out from
// the centre that brightens the walls it crosses; hats are specks of dust.
// Made for a MIDI melody (exact starts and lengths); without one it uses the melody the audio analysis heard.
// The walls are worked out on a small grid every frame and drawn up soft; the rest goes on a light layer
// that is added onto the dark palettes and inverted for the light ones (ink on paper).
import { S, segLen, barDur } from '../state.js';
import { ctx, W, H, u, cx, spaced, MONO } from '../render/canvas.js';
import { waveStrip, SAFE_TOP, SAFE_BOTTOM } from '../render/hud.js';
import { clamp, mod, TAU, hsh, mulberry, pad, titleCase } from '../util.js';

const SANS = 'Inter, "Helvetica Neue", Helvetica, Arial, sans-serif';
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'];
const BLACK = new Set([1, 3, 6, 8, 10]);
const midiOf = p => Math.round(69 + 12 * Math.log2(p / 440));
const nameOf = m => FLAT[mod(m, 12)] + (Math.floor(m / 12) - 1);
const PALS = {
  night: { dark: true, bg: '#050506', tint: '#eef1f4', ink: '#e8eaee', mute: '#6b6f77', dim: '#2a2c31' },
  abyss: { dark: true, bg: '#03060c', tint: '#bfe1ff', ink: '#d6e8ff', mute: '#5a6a80', dim: '#1b2533' },
  paper: { dark: false, bg: '#f3f2ee', ink: '#141518', mute: '#8b8983', dim: '#d2d0ca' },
  pearl: { dark: false, bg: '#ece9f0', ink: '#251f2e', mute: '#8e879a', dim: '#d3cfda' }
};
const FIB = 4096;   // the fibre pattern's length

const SONAR = {
  id: 'sonar', name: 'Sonar',
  defaults: { pal: 'night', sweep: 2, width: 1, glow: 0.6, ping: 0.5, fiber: 0.6, labels: 'on', grid: 'on' },
  controls: [
    { key: 'pal', label: 'Colour', type: 'choice', options: [['night', 'night'], ['abyss', 'abyss'], ['paper', 'paper'], ['pearl', 'pearl']] },
    { key: 'sweep', label: 'One turn', type: 'choice', options: [[1, '1 bar'], [2, '2 bars'], [4, '4 bars'], [0, 'loop']] },
    { key: 'width', label: 'Note width', type: 'range', min: 0.4, max: 2, step: 0.01, format: v => v.toFixed(2) + '×' },
    { key: 'glow', label: 'Played notes stay', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'ping', label: 'Ping from kick', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'fiber', label: 'Fibres', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'labels', label: 'Note names', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'grid', label: 'Scope', type: 'choice', options: [['on', 'on'], ['off', 'off']] }
  ],
  lum: document.createElement('canvas'), fld: document.createElement('canvas'),
  notes: [], kicks: [], hats: [],

  setup() {
    // top to bottom: the header on SAFE_TOP, the scope, three readouts, the waveform strip ending on SAFE_BOTTOM
    const mx = W * 0.07, stripY = H * SAFE_BOTTOM - 86 * u, readY = stripY - 96 * u, top = H * SAFE_TOP + 66 * u;
    const D = Math.floor(Math.min(W * 0.88, readY - 40 * u - top)), cyS = top + D / 2;
    Object.assign(this, { mx, stripY, readY, D, cyS, Rr: D / 2 - 6 * u });
    this.lum.width = this.lum.height = D; this.lctx = this.lum.getContext('2d');
    const FS = this.FS = Math.min(520, Math.round(D / 1.8));
    this.fld.width = this.fld.height = FS; this.fctx = this.fld.getContext('2d');
    this.img = this.fctx.createImageData(FS, FS);
    for (let i = 3; i < this.img.data.length; i += 4) this.img.data[i] = 255;
    // every grid pixel's distance and angle from the centre, worked out once
    this.RHO = new Float32Array(FS * FS); this.THE = new Float32Array(FS * FS);
    for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) { const dx = x - FS / 2, dy = y - FS / 2; this.RHO[y * FS + x] = Math.hypot(dx, dy); this.THE[y * FS + x] = Math.atan2(dy, dx); }
    this.buildNoise();
    if (!this.fib) { const r = mulberry(77); this.fib = Float32Array.from({ length: FIB }, () => r() ** 3); }
    this.lanes();
  },

  // smooth noise, twice the grid's size: each note reads it at its own offset, so its walls bend a little
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

  prepare(seg) {
    const sl = segLen(), bd = barDur();
    const notes = seg.filter(o => o.type === 'mid' && (o.mm || o.p > 20)).map(o => ({ rt: o.rt, s: o.s, m: o.mm || midiOf(o.p), dur: o.dur || 0 }));
    notes.sort((a, b) => a.rt - b.rt || a.m - b.m);
    // notes from the audio have no length: until a little before the next one, a sixteenth to half a bar
    notes.forEach((n, i) => {
      if (!n.dur) { let j = i + 1; while (j < notes.length && notes[j].rt - n.rt < 1e-3) j++; const nx = j < notes.length ? notes[j].rt : (notes[0] ? notes[0].rt + sl : n.rt + bd / 2); n.dur = clamp((nx - n.rt) * 0.9, bd / 16, bd / 2); }
      n.i = i; n.nx = hsh(i + 4.4); n.ny = hsh(i + 6.6); n.seed = Math.floor(hsh(i + 2.2) * FIB);
    });
    this.notes = notes;
    // pings: the strongest kicks, at most one a beat
    const lows = seg.filter(o => o.type === 'low'), cut = Math.max(0.35, lows.map(o => o.s).sort((a, b) => a - b)[Math.floor(lows.length * 0.5)] || 0);
    let last = -1e9; this.kicks = [];
    for (const o of lows) { if (o.s < cut || o.rt - last < bd / 4 - 1e-6) continue; last = o.rt; this.kicks.push({ rt: o.rt, s: o.s }); }
    this.hats = seg.filter(o => o.type === 'high').map(o => ({ rt: o.rt, s: o.s }));
    this.lanes();
  },

  // the rows of the roll: a ring per semitone, from the lowest note (inside) to the highest (outside)
  lanes() {
    const notes = this.notes, Rr = this.Rr || 300;
    let lo = 60, hi = 72;
    if (notes.length) { lo = Math.min(...notes.map(n => n.m)) - 1; hi = Math.max(...notes.map(n => n.m)) + 1; }
    if (hi - lo < 12) { const c = Math.round((hi + lo) / 2); lo = c - 6; hi = c + 6; }
    const r0 = Rr * 0.2, r1 = Rr * 0.93;
    Object.assign(this, { lo, hi, r0, r1, lane: (r1 - r0) / (hi - lo + 1) });
  },
  rOf(m) { return this.r0 + (m - this.lo + 0.5) * this.lane; },

  /* ---------------- a frame ---------------- */
  draw(tau) {
    const P = S.sonar, pal = PALS[P.pal] || PALS.night, sl = segLen(), bd = barDur(), D = this.D, half = D / 2, Rr = this.Rr;
    const per = +P.sweep ? Math.min(sl, +P.sweep * bd) : sl, phi = -Math.PI / 2 + TAU * mod(tau, per) / per;
    // the turn shows what's coming (ahead of the beam) and what just played (behind it, dimming)
    const back = per * (0.1 + 0.35 * P.glow), ahead = per - back;
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);

    // the notes on the roll now, as arcs round the centre
    const live = [], hw = clamp(this.lane * 1.15 * P.width, 8 * u, 46 * u);   // wider than a row: notes a few semitones apart press together like cells
    for (const n of this.notes) {
      const dt = mod(n.rt - tau + back, sl) - back, end = dt + n.dur;   // seconds until it starts / ends
      if (dt > ahead || end < -back) continue;
      const t0 = Math.max(dt, -back), t1 = Math.max(t0, Math.min(end, ahead)), age = -dt;
      const on = age < 0 ? 0 : age < 0.03 ? age / 0.03 : age < n.dur ? 1 : Math.max(0, 1 - (age - n.dur) / 0.35) ** 2;
      const vis = clamp((ahead - dt) / (per * 0.15), 0, 1) * (end >= 0 ? 1 : clamp((back + end) / (back * 0.8), 0, 1));
      const a = vis * (dt > 0 ? 0.5 : 0.85);
      if (a < 0.01 && on < 0.01) continue;
      live.push({ n, th: phi + TAU * t0 / per, span: TAU * (t1 - t0) / per, r: this.rOf(n.m), h: hw * (0.85 + 0.3 * n.s) * (1 + 0.12 * on), a, on, vis });
    }
    const sounding = live.filter(c => c.on > 0.01), dimStar = 1 / Math.sqrt(Math.max(1, sounding.length));
    const pings = [];
    for (const k of this.kicks) { const age = mod(tau - k.rt, sl); if (age < 1.2) pings.push({ r: (age / 1.2) ** 0.8 * Rr, amp: P.ping * k.s * (1 - age / 1.2) ** 1.5 }); }

    // ---- the walls, on a small grid ----
    const FS = this.FS, sc = FS / D, data = this.img.data, pc = FS / 2, Rf = Rr * sc, NS = this.NS, NZ = this.noise, FB = this.fib, fib = P.fiber;
    // per note, in grid pixels, sorted by radius so a pixel only looks at the rows near it
    const C = live.map(c => {
      const r = c.r * sc, h = c.h * sc, e = c.th + c.span;
      return { r, h, th: c.th, span: c.span, ax: pc + Math.cos(c.th) * r, ay: pc + Math.sin(c.th) * r, bx: pc + Math.cos(e) * r, by: pc + Math.sin(e) * r,
        a: c.a + 0.3 * c.on * dimStar, oy: Math.floor(c.n.ny * (NS - FS)), ox: Math.floor(c.n.nx * (NS - FS)), bend: h * 0.12, seed: c.n.seed };
    }).sort((p, q) => p.r - q.r);
    const reach = (C.length ? Math.max(...C.map(c => c.h + c.bend)) : 0) + 20, Rs = C.map(c => c.r);
    const PG = pings.map(p => [p.r * sc, p.amp * 2.2]), pw = 7;
    const RHO = this.RHO, THE = this.THE;
    for (let y = 0; y < FS; y++) for (let x = 0; x < FS; x++) {
      const pi = y * FS + x, idx = pi * 4, rho = RHO[pi];
      if (rho > Rf + 2 || !C.length) { data[idx] = data[idx + 1] = data[idx + 2] = 0; continue; }
      // the notes whose rows are near this radius
      let k0 = 0, k1 = C.length; { let lo = 0, hi = C.length; while (lo < hi) { const m = (lo + hi) >> 1; if (Rs[m] < rho - reach) lo = m + 1; else hi = m; } k0 = lo; lo = k0; hi = C.length; while (lo < hi) { const m = (lo + hi) >> 1; if (Rs[m] <= rho + reach) lo = m + 1; else hi = m; } k1 = lo; }
      let L = 0;
      if (k1 > k0) {
        const th = THE[pi], nzi = y * NS + x;
        let e1 = 1e9, e2 = 1e9, e3 = 1e9, a1 = 0, a2 = 0, a3 = 0, c1 = null, body1 = false, s1 = 0, t1 = 0;
        for (let k = k0; k < k1; k++) {
          const c = C[k]; let d = th - c.th; d -= Math.floor(d / TAU) * TAU;
          let e, body, sv, tv;
          if (d <= c.span) { e = Math.abs(rho - c.r) - c.h; body = true; sv = d * c.r; tv = (rho - c.r) / c.h; }   // along the arc
          else {   // past one end: the rounded cap
            const toB = d - c.span < TAU - d, ex = toB ? c.bx : c.ax, ey = toB ? c.by : c.ay, qx = x - ex, qy = y - ey, q = Math.sqrt(qx * qx + qy * qy);
            e = q - c.h; body = false; sv = Math.atan2(qy, qx) * c.h; tv = q / c.h;
          }
          e += NZ[nzi + c.oy * NS + c.ox] * c.bend;
          if (e < e3) { if (e < e2) { e3 = e2; a3 = a2; if (e < e1) { e2 = e1; a2 = a1; e1 = e; a1 = c.a; c1 = c; body1 = body; s1 = sv; t1 = tv; } else { e2 = e; a2 = c.a; } } else { e3 = e; a3 = c.a; } }
        }
        // the nearest wall: a note's own outline, or the wall it shares with a note touching it (brighter);
        // the same falloff on both sides, so the light never jumps
        if (e1 < 0) {
          const toRim = -e1, toSeam = e2 - e1, shared = toSeam < toRim, m = shared ? toSeam * 0.5 : toRim;
          const A = shared ? Math.max(a1, a2) + 0.2 * Math.min(a1, a2) : a1;
          L = A * (0.8 * Math.exp(-m / 1.3) + 0.2 * Math.exp(-m / 8)) + a1 * 0.035;
          if (e3 < 0) L += Math.min(a1, a2, a3) * 1.3 * Math.exp(-(e3 - e1) / 2.4);
          // fibres across the note, brighter towards its walls
          if (fib > 0.01) { const w = body1 ? t1 * t1 : t1 * t1 * t1; L += a1 * fib * (0.05 + 0.4 * w) * FB[(Math.floor(s1 * 1.4) + c1.seed) & (FIB - 1)]; }
        } else if (e1 < 20) { const f = 1 - e1 / 20; L = a1 * (0.8 * Math.exp(-e1 / 1.3) + 0.14 * Math.exp(-e1 / 6) * f * f); }   // the glow outside fades to nothing
      }
      for (let k = 0; k < PG.length; k++) { const d = (rho - PG[k][0]) / pw; if (d > -3 && d < 3) L *= 1 + PG[k][1] * Math.exp(-d * d); }
      const v = 255 * (1 - Math.exp(-1.7 * L));   // a soft shoulder instead of a hard clip, so bright walls keep their shape
      data[idx] = data[idx + 1] = data[idx + 2] = v;
    }
    this.fctx.putImageData(this.img, 0, 0);

    // ---- the light layer: walls drawn up soft, the stars, the scope, the beam ----
    const g = this.lctx;
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.fillStyle = '#000'; g.fillRect(0, 0, D, D);
    g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
    g.drawImage(this.fld, 0, 0, D, D);
    // a star where the beam crosses a note that sounds (dimmer when a whole chord sounds)
    const cs = Math.cos(phi), sn = Math.sin(phi);
    for (const c of sounding) {
      const x = half + cs * c.r, y = half + sn * c.r, k = c.on * dimStar, R = 15 * u * (0.6 + 0.4 * c.on), gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, `rgba(255,255,255,${0.8 * k})`); gr.addColorStop(0.25, `rgba(255,255,255,${0.28 * k})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 1; g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,255,255,${0.28 * k})`; g.lineWidth = 0.9 * u;
      for (let j = 0; j < 6; j++) { const a = c.n.seed + j * Math.PI / 3, l = (14 + 18 * c.on) * u * (j % 2 ? 0.6 : 1); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    }
    // hats: specks of dust that catch the light for a moment
    g.fillStyle = '#fff';
    for (const o of this.hats) {
      const age = mod(tau - o.rt, sl); if (age > 0.35) continue;
      const a = hsh(o.rt * 13.1) * TAU, d = (0.3 + 0.65 * hsh(o.rt * 7.7)) * Rr;
      g.globalAlpha = (1 - age / 0.35) * 0.6 * o.s; g.beginPath(); g.arc(half + Math.cos(a) * d, half + Math.sin(a) * d, 1.5 * u, 0, TAU); g.fill();
    }
    g.strokeStyle = '#fff'; g.lineWidth = 1.2 * u;
    for (const p of pings) { g.globalAlpha = Math.min(1, p.amp * 0.5); g.beginPath(); g.arc(half, half, p.r, 0, TAU); g.stroke(); }
    // the scope: a dotted ring at every C, the roll's inner and outer edge, a tick every beat round the rim
    if (P.grid !== 'off') {
      g.fillStyle = '#fff';
      for (let m = Math.ceil(this.lo / 12) * 12; m <= this.hi; m += 12) {
        const R = this.r0 + (m - this.lo) * this.lane, n = Math.round(TAU * R / (10 * u)); g.globalAlpha = 0.26;
        for (let k = 0; k < n; k++) { const a = TAU * k / n; g.beginPath(); g.arc(half + Math.cos(a) * R, half + Math.sin(a) * R, 0.9 * u, 0, TAU); g.fill(); }
      }
      g.lineWidth = 1 * u; g.globalAlpha = 0.14;
      for (const R of [this.r0, this.r1]) { g.beginPath(); g.arc(half, half, R, 0, TAU); g.stroke(); }
      g.globalAlpha = 0.32; g.beginPath(); g.arc(half, half, Rr, 0, TAU); g.stroke();
      const beats = Math.max(4, Math.round(per / (bd / 4)));
      for (let k = 0; k < beats; k++) {
        const a = -Math.PI / 2 + TAU * k / beats, l = (k % 4 === 0 ? 12 : 6) * u;
        g.globalAlpha = k % 4 === 0 ? 0.5 : 0.3; g.beginPath(); g.moveTo(half + Math.cos(a) * Rr, half + Math.sin(a) * Rr); g.lineTo(half + Math.cos(a) * (Rr - l), half + Math.sin(a) * (Rr - l)); g.stroke();
      }
      g.globalAlpha = 0.6; g.beginPath(); g.arc(half, half, 2 * u, 0, TAU); g.fill();
    }
    // the beam: a soft wedge of light trailing the playhead line
    const wedge = 1.3;
    if (g.createConicGradient) {
      const cg = g.createConicGradient(phi - wedge, half, half), k = wedge / TAU, peak = 0.04 + 0.04 * P.glow;
      cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(k * 0.55, `rgba(255,255,255,${peak * 0.25})`); cg.addColorStop(k * 0.999, `rgba(255,255,255,${peak})`);
      cg.addColorStop(k, 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = 1; g.fillStyle = cg; g.beginPath(); g.arc(half, half, Rr, 0, TAU); g.fill();
    }
    g.globalAlpha = 0.45; g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(half, half); g.lineTo(half + cs * Rr, half + sn * Rr); g.stroke();
    // the keyboard on the beam: a key for every row, a longer one on the white keys; a key that sounds lights up
    const on = new Map(); for (const c of sounding) on.set(c.n.m, Math.max(on.get(c.n.m) || 0, c.on));
    for (let m = this.lo; m <= this.hi; m++) {
      const R = this.rOf(m), v = on.get(m) || 0, l = (BLACK.has(mod(m, 12)) ? 2.5 : 4.5) * u + 7 * u * v, px = half + cs * R, py = half + sn * R;
      g.globalAlpha = 0.28 + 0.7 * v; g.lineWidth = (1 + 1.2 * v) * u;
      g.beginPath(); g.moveTo(px + sn * l, py - cs * l); g.lineTo(px - sn * l, py + cs * l); g.stroke();
    }
    g.globalAlpha = 1;
    // onto the frame: added to the dark, or turned into ink on the light palettes
    g.globalCompositeOperation = pal.dark ? 'multiply' : 'difference';
    g.fillStyle = pal.dark ? pal.tint : '#ffffff'; g.fillRect(0, 0, D, D);
    if (!pal.dark) { g.globalCompositeOperation = 'multiply'; g.fillStyle = pal.bg; g.fillRect(0, 0, D, D); }
    g.globalCompositeOperation = 'source-over';
    const x0 = Math.round(cx - half), y0 = Math.round(this.cyS - half);
    ctx.globalCompositeOperation = pal.dark ? 'lighter' : 'source-over';
    ctx.drawImage(this.lum, x0, y0);
    ctx.globalCompositeOperation = 'source-over';

    // the octave of every dotted ring, by the top of the scope; the names of the notes that sound, by the beam
    if (P.grid !== 'off') {
      ctx.font = `400 ${10.5 * u}px ${MONO}`; ctx.fillStyle = pal.mute; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.globalAlpha = 0.85;
      for (let m = Math.ceil(this.lo / 12) * 12; m <= this.hi; m += 12) ctx.fillText(`C${m / 12 - 1}`, x0 + half - 6 * u, y0 + half - (this.r0 + (m - this.lo) * this.lane));
      ctx.globalAlpha = 1;
    }
    if (P.labels !== 'off') {
      ctx.font = `400 ${12.5 * u}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.fillStyle = pal.ink;
      const nx = -sn, ny = cs;   // to the side of the beam it's heading for
      for (const c of sounding) {
        const x = x0 + half + cs * c.r + nx * (c.h + 12 * u), y = y0 + half + sn * c.r + ny * (c.h + 12 * u);
        ctx.globalAlpha = 0.9 * c.on; ctx.textAlign = nx > 0.3 ? 'left' : nx < -0.3 ? 'right' : 'center';
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
    spaced(`ONE TURN ${+P.sweep ? `${P.sweep} BAR${+P.sweep > 1 ? 'S' : ''}` : 'THE LOOP'}`, W - mx, yH, 2 * u, 'right');

    // readouts: where the beam points, the note under it (or the last one), how many notes are on the roll
    let echo = null, best = -1e9;
    for (const c of live) { const t = -mod(c.n.rt - tau + back, sl) + back; if (t >= 0 && -t > best) { best = -t; echo = c.n; } }
    const deg = Math.round(mod(phi + Math.PI / 2, TAU) / TAU * 360) % 360;
    const cols = [['BEARING', `${pad(deg, 3)}°`], ['ECHO', echo ? nameOf(echo.m) : '—'], ['NOTES', pad(live.length, 2)]];
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
