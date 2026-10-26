// BLOOM: a 3D lily rendered into a grid of characters; closes and opens, notes light petals, an anatomy diagram tracks it.
import { S, segLen, segStart, barDur } from '../state.js';
import { cv, ctx, W, H, u, cx, grain, spaced, MONO, DISP, SFP } from '../render/canvas.js';
import { clamp, mod, TAU, hsh, mulberry, rgba, pad, fmtT, titleCase } from '../util.js';

const BLOOM_PAL = {
  meadow: { bg: [44, 66, 34], blobs: [[208, 190, 70], [110, 150, 60], [236, 214, 120]], glyph: [246, 238, 206], acc: [255, 255, 240], line: [250, 246, 228], vig: 0.45 },
  dusk:   { bg: [26, 40, 96], blobs: [[64, 104, 214], [140, 160, 236], [236, 164, 118]], glyph: [228, 236, 255], acc: [255, 216, 168], line: [236, 240, 255], vig: 0.45 },
  peach:  { bg: [236, 178, 146], blobs: [[250, 214, 186], [226, 136, 138], [255, 238, 218]], glyph: [116, 38, 56], acc: [255, 255, 255], line: [112, 40, 56], vig: 0.16 },
  night:  { bg: [9, 11, 10], blobs: [[34, 64, 44], [64, 54, 36], [28, 36, 64]], glyph: [230, 232, 222], acc: [255, 255, 255], line: [222, 226, 216], vig: 0.5 }
};
const BLOOM_RAMP = ['.', '-', '-', '=', '+', '+', '#'];
const BLOOM_ALPHA = [0.3, 0.42, 0.55, 0.66, 0.78, 0.9, 1];
const BLOOM = {
  id: 'bloom', name: 'Bloom',
  defaults: { pal: 'meadow', view: 'front', tcase: 'typed', breath: 'mid', depth: 0.9, open: 0.6, pulse: 0.6, anatomy: 0.5, ghost: 0.45, grid: 1 },
  controls: [
    { key: 'pal', label: 'Palette', type: 'choice', options: [['meadow', 'meadow'], ['dusk', 'dusk'], ['peach', 'peach'], ['night', 'night']], then: 'buildBG' },
    { key: 'tcase', label: 'Title text', type: 'choice', options: [['typed', 'as typed'], ['upper', 'UPPER'], ['lower', 'lower'], ['title', 'Title']] },
    { key: 'view', label: 'View', type: 'choice', options: [['front', 'front'], ['three', '3/4'], ['side', 'side']] },
    { key: 'breath', label: 'Breathing', type: 'choice', options: [['music', 'music'], ['slow', 'slow'], ['mid', 'mid'], ['fast', 'fast']] },
    { key: 'depth', label: 'How far it closes', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'open', label: 'Follow loudness', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'pulse', label: 'Pulse from 808 & kick', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'anatomy', label: 'Anatomy overlay', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'ghost', label: 'Soft image under the type', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'grid', label: 'Glyph size', type: 'choice', options: [[0, 'fine'], [1, 'mid'], [2, 'coarse']], then: 'setup' }
  ],
  lum: document.createElement('canvas'), glow: document.createElement('canvas'), atlas: document.createElement('canvas'), ov: document.createElement('canvas'), ghost: document.createElement('canvas'),
  setup() {
    this.cols = [112, 92, 72][S.bloom.grid]; this.cw = this.ch = W / this.cols; this.rows = Math.ceil(H / this.ch);
    this.lw = this.cols * 2; this.lh = this.rows * 2;
    this.lum.width = this.lw; this.lum.height = this.lh; this.lctx = this.lum.getContext('2d', { willReadFrequently: true });
    this.glow.width = Math.ceil(this.lw / 4); this.glow.height = Math.ceil(this.lh / 4); this.gctx = this.glow.getContext('2d');
    this.ghost.width = this.lw; this.ghost.height = this.lh; this.ghctx = this.ghost.getContext('2d'); this.gimg = this.ghctx.createImageData(this.lw, this.lh);
    this.fx = cx - W * 0.03; this.fy = H * 0.47; this.FR = W * 0.34;
    this.buildBG();
  },
  buildBG() {
    const P = BLOOM_PAL[S.bloom.pal];
    this.blobs = P.blobs.map(col => {
      const s = document.createElement('canvas'); s.width = s.height = 256; const x = s.getContext('2d'), g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
      g.addColorStop(0, rgba(col, 1)); g.addColorStop(0.55, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(0, 0, 256, 256); return s;
    });
    // glyph atlas: row 0 regular ink, row 1 accent (petals lit by melody notes)
    const cw = Math.ceil(this.cw), ch = Math.ceil(this.ch), a = this.atlas; a.width = cw * BLOOM_RAMP.length; a.height = ch * 2;
    const x = a.getContext('2d'); x.clearRect(0, 0, a.width, a.height); x.textAlign = 'center'; x.textBaseline = 'middle';
    for (let row = 0; row < 2; row++) for (let i = 0; i < BLOOM_RAMP.length; i++) {
      x.font = `${i >= 5 ? 600 : 500} ${ch * 1.08}px ${MONO}`; x.fillStyle = rgba(row ? P.acc : P.glyph, BLOOM_ALPHA[i]);
      x.fillText(BLOOM_RAMP[i], i * cw + cw / 2, row * ch + ch * 0.54);
    }
    this.acw = cw; this.ach = ch;
    const o = this.ov; o.width = W; o.height = H; const ox = o.getContext('2d');
    const v = ox.createRadialGradient(cx, H * 0.47, H * 0.28, cx, H * 0.47, H * 0.8); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, `rgba(0,0,0,${P.vig})`);
    ox.fillStyle = v; ox.fillRect(0, 0, W, H);
  },
  // one pointed, lily-like petal in its own coordinates (+x points to the tip). Brightness goes to G; R and B drop on lit petals,
  // so the sampler can tell them apart. bend curls the tip sideways.
  petal(L, len, wid, shade, lit, rib, unit, bend = 0) {
    const col = v => { v = clamp(v, 0, 1) * 255; const rb = v * (1 - 0.85 * lit); return `rgb(${rb | 0},${v | 0},${rb | 0})`; };
    const g = L.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, col(0.78 * shade)); g.addColorStop(0.22, col(0.42 * shade)); g.addColorStop(0.6, col(0.62 * shade)); g.addColorStop(0.9, col(0.88 * shade)); g.addColorStop(1, col(0.7 * shade));
    const b = bend * wid;
    L.beginPath(); L.moveTo(0, 0);
    L.bezierCurveTo(0.22 * len, 0.9 * wid, 0.52 * len, 1.0 * wid + b * 0.4, 0.8 * len, 0.45 * wid + b * 0.8);
    L.quadraticCurveTo(0.95 * len, 0.14 * wid + b, 1.06 * len, b * 1.2);
    L.quadraticCurveTo(0.95 * len, -0.12 * wid + b, 0.8 * len, -0.42 * wid + b * 0.8);
    L.bezierCurveTo(0.52 * len, -1.0 * wid + b * 0.4, 0.22 * len, -0.9 * wid, 0, 0);
    L.fillStyle = g; L.fill();
    // a dark seam around every petal keeps overlapping petals apart once they turn into type, then a bright rim on the edge
    L.lineWidth = unit * 3; L.strokeStyle = 'rgb(0,0,0)'; L.stroke();
    L.lineWidth = unit * 1.1; L.strokeStyle = col(Math.min(1, shade * 1.05)); L.stroke();
    if (rib) {
      L.lineWidth = unit * 1.3; L.strokeStyle = col(Math.min(1, shade)); L.beginPath();
      L.moveTo(0.06 * len, 0); L.quadraticCurveTo(0.6 * len, b * 0.4, 0.98 * len, b * 1.1); L.stroke();
    }
  },
  draw(tau, F) {
    const P = BLOOM_PAL[S.bloom.pal], sl = segLen(), bd = barDur(), p = tau / sl, ph1 = TAU * p, ph2 = TAU * 2 * p;
    const fx = this.fx, fy = this.fy, FR = this.FR, c = a => rgba(P.glyph, a), lc = a => rgba(P.line, a);
    // blurred colour field
    ctx.fillStyle = rgba(P.bg, 1); ctx.fillRect(0, 0, W, H);
    for (let k = 0; k < 5; k++) {
      const b = this.blobs[k % this.blobs.length];
      const x = cx + W * 0.38 * Math.sin(ph1 * (k % 2 ? 1 : 2) + k * 1.9), y = H * (0.45 + 0.22 * Math.sin(ph1 * (k < 3 ? 1 : 2) + k * 2.7));
      const r = W * (0.45 + 0.12 * (k % 3)) * (1 + 0.08 * F.slow);
      ctx.globalAlpha = 0.8; ctx.drawImage(b, x - r, y - r, 2 * r, 2 * r);
    }
    ctx.globalAlpha = 1;

    // what the music is doing right now
    const nO = 6, lit = new Float32Array(nO), litNote = new Array(nO).fill(''), rips = [];
    for (const o of S.seg) {
      const age = mod(tau - o.rt, sl);
      if (o.type === 'mid' && o.p && age < 1.4) {
        const m = Math.round(69 + 12 * Math.log2(o.p / 440)), i = mod(m, 12) % nO, v = o.s * Math.exp(-age / 0.45);
        if (v > lit[i]) { lit[i] = v; litNote[i] = o.note; }
      } else if (o.type === 'low' && o.s > 0.3 && age < 1.6) rips.push([age, o.s]);
    }
    // breathing: a full close/open cycle a whole number of times per loop (so it stays seamless), or just follow the loudness
    const br = S.bloom.breath, cyc = br === 'fast' ? S.lenBars : br === 'mid' ? Math.max(1, Math.round(S.lenBars / 2)) : 1;
    let open;
    if (br === 'music') open = 0.12 + 0.95 * Math.pow(F.slow, 1.3);
    else { const cc = 0.5 + 0.5 * Math.cos(TAU * p * cyc), e = cc * cc * (3 - 2 * cc); open = 1 - S.bloom.depth * e; }
    open = clamp(open + 0.12 * (F.slow - 0.5) * S.bloom.open + 0.06 * F.low * S.bloom.open, 0, 1.08);
    const o1 = Math.min(1, open);
    const sway = 0.12 * Math.sin(ph1), tilt = 0.86 + 0.05 * Math.sin(ph2 + 0.6);

    // ---- draw the flower in brightness on a small canvas ----
    const L = this.lctx, sx = this.lw / W, sy = this.lh / H, nodes = [], px1 = W / this.lw;
    L.setTransform(1, 0, 0, 1, 0, 0); L.globalCompositeOperation = 'source-over'; L.fillStyle = '#000'; L.fillRect(0, 0, this.lw, this.lh);
    L.setTransform(sx, 0, 0, sy, 0, 0); L.lineJoin = 'round'; L.lineCap = 'round';

    // 3D frame of the bloom: A is the flower's axis (where the trumpet points), e1/e2 span the plane the tepals start from
    const nrm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const crs = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
    const VIEW = { front: [0.06, -0.14, -1], three: [0.55, -0.4, -0.75], side: [0.92, -0.32, -0.3] }[S.bloom.view] || [0.55, -0.4, -0.75];
    const yw = 0.14 * Math.sin(ph1), pw0 = 0.06 * Math.sin(ph2 + 0.4);
    let A = [VIEW[0] * Math.cos(yw) + VIEW[2] * Math.sin(yw), VIEW[1], -VIEW[0] * Math.sin(yw) + VIEW[2] * Math.cos(yw)];
    A = nrm([A[0], A[1] * Math.cos(pw0) - A[2] * Math.sin(pw0), A[1] * Math.sin(pw0) + A[2] * Math.cos(pw0)]);
    { const cl = 0.5 * (1 - o1); A = nrm([A[0] * (1 - cl) + 0.75 * cl, A[1] * (1 - cl) - 0.5 * cl, A[2] * (1 - cl) - 0.42 * cl]); }   // a closing lily nods to the side, so the bud reads as a bud
    const e1 = nrm(Math.abs(A[2]) > 0.95 ? crs(A, [0, 1, 0]) : crs(A, [0, 0, 1])), e2 = crs(A, e1);
    const FD = 3.2, proj = (x, y, z) => { const k = FD / (FD + z); return [fx + x * FR * k, fy + y * FR * k, z]; };
    const LD = nrm([-0.45, -0.65, -0.62]), HV = nrm([LD[0], LD[1], LD[2] - 1]);
    const col = (v, lt) => { v = clamp(v, 0, 1) * 255; const rb = v * (1 - 0.85 * lt); return `rgb(${rb | 0},${v | 0},${rb | 0})`; };

    // stem, leaves and a bud: flat shapes behind the bloom
    const rc = proj(-A[0] * 0.14, -A[1] * 0.14, -A[2] * 0.14), sb = [rc[0], rc[1]];
    const se = [fx - W * 0.03 + Math.sin(ph1) * W * 0.012, H * 0.735];
    L.strokeStyle = 'rgb(120,120,120)'; L.lineWidth = W * 0.013;
    L.beginPath(); L.moveTo(se[0], se[1]); L.bezierCurveTo(se[0] + W * 0.04, H * 0.66, sb[0] - W * 0.03, sb[1] + FR * 0.5, sb[0], sb[1]); L.stroke();
    const leaf = (x, y, ang, len, bend) => { L.setTransform(sx, 0, 0, sy, 0, 0); L.translate(x, y); L.rotate(ang); L.scale(len, len); this.petal(L, 1, 0.15, 0.58, 0, true, px1 / len, bend); return { x: x + Math.cos(ang) * len, y: y + Math.sin(ang) * len }; };
    const leafTip = leaf(se[0] + W * 0.012, H * 0.665, -0.6 + 0.08 * Math.sin(ph1 + 1), W * 0.25, 0.8);
    leaf(se[0] + W * 0.004, H * 0.7, Math.PI + 0.5 + 0.07 * Math.sin(ph1 + 2.2), W * 0.21, -0.8);
    const bs0 = [se[0] + W * 0.01, H * 0.63], bs1 = [fx - W * 0.25 + Math.sin(ph1 + 0.5) * W * 0.01, H * 0.555], ba = -2.05 + 0.08 * Math.sin(ph1 + 0.5), bl = W * 0.15;
    L.setTransform(sx, 0, 0, sy, 0, 0); L.strokeStyle = 'rgb(105,105,105)'; L.lineWidth = W * 0.008;
    L.beginPath(); L.moveTo(bs0[0], bs0[1]); L.quadraticCurveTo(fx - W * 0.2, H * 0.63, bs1[0], bs1[1]); L.stroke();
    L.translate(bs1[0], bs1[1]); L.rotate(ba); L.scale(bl, bl);
    this.petal(L, 1, 0.24, 0.72, 0, true, px1 / bl);
    const budTip = { x: bs1[0] + Math.cos(ba) * bl, y: bs1[1] + Math.sin(ba) * bl };
    L.setTransform(sx, 0, 0, sy, 0, 0);

    // six tepals as real curved surfaces: narrow at the base, opening as a trumpet, recurving at the tips,
    // a groove down the middle, edges curling inward, a soft ruffle on the margin
    const SN = 26, TN = 10, items = [], pet = this.pet || (this.pet = []);
    const spin = 0.42 + 0.1 * Math.sin(ph1), th0 = 0.04 + 0.27 * o1, th1 = 0.06 + 1.92 * open, grow = 1 + 0.03 * F.low * S.bloom.pulse;
    for (let pi = 0; pi < 6; pi++) {
      const inner = pi % 2 === 1, phi = pi / 6 * TAU + spin + 0.05 * Math.sin(ph1 + pi * 1.3);
      const r = [e1[0] * Math.cos(phi) + e2[0] * Math.sin(phi), e1[1] * Math.cos(phi) + e2[1] * Math.sin(phi), e1[2] * Math.cos(phi) + e2[2] * Math.sin(phi)], bq = crs(A, r);
      const Lp = (inner ? 0.95 : 1.0) * (1 + 0.04 * Math.sin(pi * 2.1)) * grow, Wm = inner ? 0.27 : 0.2, curl = (inner ? 0.55 : 0.42) * (1 + 1.3 * (1 - o1));
      const P = pet[pi] || (pet[pi] = { X: new Float32Array((SN + 1) * (TN + 1)), Y: new Float32Array((SN + 1) * (TN + 1)), Z: new Float32Array((SN + 1) * (TN + 1)), Q: new Float32Array((SN + 1) * (TN + 1) * 3) });
      let rad = 0.03 + 0.02 * o1, axl = 0;
      for (let k = 0; k <= SN; k++) {
        const s = k / SN, th = th0 + th1 * Math.pow(s, 1.7) * (1 + 0.06 * Math.sin(pi * 1.7));
        if (k) { rad += Math.sin(th) * Lp / SN; axl += Math.cos(th) * Lp / SN; }
        const w = Wm * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.75)), 0.85) * (1 + 0.05 * Math.sin(16 * s + pi * 1.3)) * grow;
        const nr = -Math.cos(th), na = Math.sin(th);
        for (let j = 0; j <= TN; j++) {
          const t = j / TN * 2 - 1, off = (curl * t * t - 0.12 * Math.exp(-t * t * 25)) * w;
          const lr = rad + nr * off, la = axl + na * off, lb = t * w, q = k * (TN + 1) + j;
          const x = r[0] * lr + A[0] * la + bq[0] * lb, y = r[1] * lr + A[1] * la + bq[1] * lb, z = r[2] * lr + A[2] * la + bq[2] * lb;
          P.Q[q * 3] = x; P.Q[q * 3 + 1] = y; P.Q[q * 3 + 2] = z;
          const pr = proj(x, y, z); P.X[q] = pr[0]; P.Y[q] = pr[1]; P.Z[q] = z;
        }
      }
      for (let k = 0; k < SN; k++) for (let j = 0; j < TN; j++) {
        const a = k * (TN + 1) + j, b2 = a + 1, d = a + TN + 1, c2 = d + 1, Q = P.Q;
        const ux = Q[d * 3] - Q[a * 3], uy = Q[d * 3 + 1] - Q[a * 3 + 1], uz = Q[d * 3 + 2] - Q[a * 3 + 2];
        const vx = Q[b2 * 3] - Q[a * 3], vy = Q[b2 * 3 + 1] - Q[a * 3 + 1], vz = Q[b2 * 3 + 2] - Q[a * 3 + 2];
        const n = nrm([uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]);
        items.push({ z: (P.Z[a] + P.Z[b2] + P.Z[c2] + P.Z[d]) / 4, kind: 0, pi, k, j, a, b: b2, c: c2, d, n });
      }
      const tip = (SN) * (TN + 1) + TN / 2;
      nodes.push({ x: P.X[tip], y: P.Y[tip], lit: lit[pi], note: litNote[pi], big: true });
    }
    // stamens and pistil: filaments that reach out of the throat and lift a little, anthers at the ends
    const stv = Math.round(160 + 95 * Math.min(1, 0.35 + F.high));
    for (let k = 0; k < 7; k++) {
      const pistil = k === 6, ang = k / 6 * TAU + spin + 0.5, spread = pistil ? 0.04 : 0.05 + 0.23 * o1;
      const dir = nrm([A[0] + (e1[0] * Math.cos(ang) + e2[0] * Math.sin(ang)) * spread, A[1] + (e1[1] * Math.cos(ang) + e2[1] * Math.sin(ang)) * spread, A[2] + (e1[2] * Math.cos(ang) + e2[2] * Math.sin(ang)) * spread]);
      const len = (pistil ? 1.1 : 0.98) * grow * (0.3 + 0.7 * o1); let prev = proj(0, 0, 0);
      for (let q = 1; q <= 8; q++) {
        const s = q / 8, x = dir[0] * len * s, y = dir[1] * len * s - 0.16 * s * s, z = dir[2] * len * s, cur = proj(x, y, z);
        items.push({ z: (prev[2] + cur[2]) / 2, kind: 1, x0: prev[0], y0: prev[1], x1: cur[0], y1: cur[1] }); prev = cur;
        if (q === 8) items.push({ z: cur[2] - 0.01, kind: 2, x: cur[0], y: cur[1], pistil, ang: Math.atan2(cur[1] - fy, cur[0] - fx) + Math.PI / 2 });
      }
      if (pistil) nodes.push({ x: prev[0], y: prev[1], lit: 0, note: '' });
    }
    items.sort((p1, p2) => p2.z - p1.z);
    for (const it of items) {
      if (it.kind === 0) {
        const P = pet[it.pi], n = it.n, face = n[2] < 0 ? 1 : -1, nx = n[0] * face, ny = n[1] * face, nz = n[2] * face;
        const diff = Math.max(0, nx * LD[0] + ny * LD[1] + nz * LD[2]), spec = Math.pow(Math.max(0, nx * HV[0] + ny * HV[1] + nz * HV[2]), 24);
        const s = it.k / SN, t = it.j / TN * 2 - 1 + 1 / TN;
        let v = (0.3 + 0.6 * diff + 0.28 * spec) * (1 + 0.35 * (1 - o1));
        if (face < 0) v *= 0.74 + 0.2 * (1 - o1);
        else {
          v *= 0.78 + 0.28 * Math.min(1, s * 2.2);
          if (s > 0.12 && s < 0.6 && Math.abs(t) < 0.6 && hsh(it.pi * 997 + it.k * 31 + it.j * 7) < 0.08) v *= 0.45;   // freckles
          if (Math.abs(t) < 0.12) v *= 1.1;
        }
        const fill = col(v, lit[it.pi]);
        L.beginPath(); L.moveTo(P.X[it.a], P.Y[it.a]); L.lineTo(P.X[it.b], P.Y[it.b]); L.lineTo(P.X[it.c], P.Y[it.c]); L.lineTo(P.X[it.d], P.Y[it.d]); L.closePath();
        L.fillStyle = fill; L.fill(); L.lineWidth = px1 * 0.7; L.strokeStyle = fill; L.stroke();
        // silhouette edges: dark seam + bright rim, so overlapping tepals stay apart in type
        const e = [];
        if (it.j === 0) e.push(it.a, it.d); if (it.j === TN - 1) e.push(it.b, it.c); if (it.k === SN - 1) e.push(it.d, it.c);
        if (e.length) {
          L.beginPath(); for (let q = 0; q < e.length; q += 2) { L.moveTo(P.X[e[q]], P.Y[e[q]]); L.lineTo(P.X[e[q + 1]], P.Y[e[q + 1]]); }
          L.lineWidth = px1 * 2.6; L.strokeStyle = 'rgb(0,0,0)'; L.stroke();
          L.lineWidth = px1 * 1; L.strokeStyle = col(Math.min(1, v * 1.25 + 0.15), lit[it.pi]); L.stroke();
        }
      } else if (it.kind === 1) {
        L.beginPath(); L.moveTo(it.x0, it.y0); L.lineTo(it.x1, it.y1);
        L.lineWidth = px1 * 3; L.strokeStyle = 'rgb(0,0,0)'; L.stroke();
        L.lineWidth = px1 * 1.3; L.strokeStyle = 'rgb(205,205,205)'; L.stroke();
      } else {
        const a1 = FR * (it.pistil ? 0.032 : 0.052), a2 = FR * (it.pistil ? 0.032 : 0.02);
        L.fillStyle = 'rgb(0,0,0)'; L.beginPath(); L.ellipse(it.x, it.y, a1 + px1 * 1.4, a2 + px1 * 1.4, it.ang, 0, TAU); L.fill();
        L.fillStyle = `rgb(${stv},${stv},${stv})`; L.beginPath(); L.ellipse(it.x, it.y, a1, a2, it.ang, 0, TAU); L.fill();
      }
    }
    const ctr = proj(A[0] * 0.15, A[1] * 0.15, A[2] * 0.15);
    nodes.push({ x: ctr[0], y: ctr[1], lit: 0, note: '', big: true }, { x: se[0], y: se[1], lit: 0, note: '' }, { x: leafTip.x, y: leafTip.y, lit: 0, note: '' }, { x: budTip.x, y: budTip.y, lit: 0, note: '' }, { x: bs1[0], y: bs1[1], lit: 0, note: '' });
    L.setTransform(1, 0, 0, 1, 0, 0);

    // ---- title, behind the flower ----
    const mx = W * 0.08, ty = H * 0.262, tc = S.bloom.tcase, t0 = S.title || '', tt = tc === 'upper' ? t0.toUpperCase() : tc === 'lower' ? t0.toLowerCase() : tc === 'title' ? titleCase(t0) : t0;
    let ts = 150 * u; ctx.font = `600 ${ts}px ${SFP}`; const tw = ctx.measureText(tt).width;
    if (tw > W - 2 * mx) { ts *= (W - 2 * mx) / tw; ctx.font = `600 ${ts}px ${SFP}`; }
    const tg = ctx.createLinearGradient(0, ty - ts * 0.75, 0, ty); tg.addColorStop(0, c(0.95)); tg.addColorStop(1, rgba(P.acc, 0.5));
    ctx.fillStyle = tg; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.fillText(tt, cx, ty);
    const ym = H * 0.168; ctx.font = `400 ${16 * u}px ${MONO}`; ctx.fillStyle = c(0.72);
    spaced((S.tag || '').toLowerCase(), mx, ym, 2 * u, 'left');
    spaced(`${+S.bpm.toFixed(2)} bpm`, cx, ym, 2 * u, 'center');
    spaced((S.key || '').toLowerCase(), W - mx, ym, 2 * u, 'right');

    // ---- glow: the flower blurred and tinted, under the type ----
    const G = this.gctx, gw = this.glow.width, gh = this.glow.height;
    G.globalCompositeOperation = 'source-over'; G.drawImage(this.lum, 0, 0, gw, gh);
    G.globalCompositeOperation = 'multiply'; G.fillStyle = rgba(P.glyph, 1); G.fillRect(0, 0, gw, gh); G.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.18 + 0.2 * F.low * S.bloom.pulse; ctx.drawImage(this.glow, 0, 0, W, H);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';

    // ---- the flower, set in type ----
    const data = L.getImageData(0, 0, this.lw, this.lh).data, lw = this.lw, cols = this.cols, rows = this.rows, cw = this.cw, ch = this.ch;
    // the rendered lily itself, soft and tinted, under the type (like the photo under the characters in the reference)
    if (S.bloom.ghost > 0) {
      const gd = this.gimg.data, g0 = P.glyph, a0 = P.acc;
      for (let j = 0; j < gd.length; j += 4) {
        const gv = data[j + 1], acc = gv > 20 && (gv - data[j]) / gv > 0.3, cc = acc ? a0 : g0;
        gd[j] = cc[0]; gd[j + 1] = cc[1]; gd[j + 2] = cc[2]; gd[j + 3] = gv * 0.85;
      }
      this.ghctx.putImageData(this.gimg, 0, 0);
      ctx.imageSmoothingEnabled = true; ctx.globalAlpha = S.bloom.ghost; ctx.drawImage(this.ghost, 0, 0, W, H); ctx.globalAlpha = 1;
    }
    const atl = this.atlas, acw = this.acw, ach = this.ach, tb = Math.floor(tau * 12), shim = F.high * F.high * 0.08, NL = BLOOM_RAMP.length, pulse = S.bloom.pulse;
    for (let r = 0; r < rows; r++) {
      const y = r * ch, dy = (y + ch / 2 - fy) / FR;
      for (let col = 0; col < cols; col++) {
        const i0 = ((r * 2) * lw + col * 2) * 4, i1 = i0 + lw * 4;
        const g = (data[i0 + 1] + data[i0 + 5] + data[i1 + 1] + data[i1 + 5]) / 1020;
        let v = g;
        if (rips.length && pulse > 0) {
          const dx = (col * cw + cw / 2 - fx) / FR, d = Math.sqrt(dx * dx + dy * dy);
          for (let q = 0; q < rips.length; q++) { const R = rips[q], f = d - R[0] * 1.6; v += R[1] * pulse * 0.42 * Math.exp(-f * f * 18) * Math.exp(-R[0] * 2.2) * (g > 0.05 ? 1 : 0.55); }
        }
        if (v > 0.08 && hsh(r * 131 + col * 7 + tb * 17) < shim) v += 0.3;
        if (v < 0.07) continue;
        const rr = (data[i0] + data[i0 + 4] + data[i1] + data[i1 + 4]) / 1020;
        const lv = Math.min(NL - 1, (v * NL) | 0), acc = g > 0.08 && (g - rr) / g > 0.3 ? 1 : 0;
        ctx.drawImage(atl, lv * acw, acc * ach, acw, ach, col * cw, y, cw, ch);
      }
    }

    // ---- anatomy overlay: guides, circles, a plexus between petal tips, coordinates ----
    const an = S.bloom.anatomy;
    if (an > 0) {
      ctx.lineWidth = 1 * u;
      ctx.setLineDash([4 * u, 7 * u]); ctx.strokeStyle = lc(0.22 * an); ctx.beginPath();
      ctx.moveTo(fx, H * 0.29); ctx.lineTo(fx, H * 0.74); ctx.moveTo(W * 0.04, fy); ctx.lineTo(W * 0.96, fy); ctx.stroke(); ctx.setLineDash([]);
      const n0 = nodes[0], nh = nodes[Math.floor(nO / 2)] || n0;
      ctx.strokeStyle = lc(0.26 * an);
      for (const [x, y, r] of [[fx, fy, FR * (1.25 + 0.04 * F.slow)], [n0.x, n0.y, FR * 0.55], [nh.x, nh.y, FR * 0.85], [leafTip.x, leafTip.y, FR * 0.38]]) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
      ctx.strokeStyle = lc(0.34 * an); ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i], near = nodes.map((b, j) => [j, (b.x - a.x) ** 2 + (b.y - a.y) ** 2]).filter(e => e[0] !== i).sort((e1, e2) => e1[1] - e2[1]).slice(0, 3);
        for (const [j] of near) { ctx.moveTo(a.x, a.y); ctx.lineTo(nodes[j].x, nodes[j].y); }
      }
      ctx.stroke();
      ctx.font = `400 ${12 * u}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      for (const nd of nodes) {
        const s = (nd.big ? 24 : 16) * u;
        if (nd.lit > 0.15) { ctx.fillStyle = lc(Math.min(0.55, nd.lit) * an); ctx.fillRect(nd.x - s / 2, nd.y - s / 2, s, s); }
        ctx.strokeStyle = lc((0.45 + 0.5 * nd.lit) * an); ctx.strokeRect(nd.x - s / 2, nd.y - s / 2, s, s);
        const lab = nd.lit > 0.25 && nd.note ? nd.note.toLowerCase() : `${Math.round(nd.x / W * 1080)},${Math.round(nd.y / H * 1920)}`;
        ctx.fillStyle = lc((nd.lit > 0.25 ? 0.95 : 0.6) * an); ctx.fillText(lab, nd.x + s / 2 + 6 * u, nd.y);
      }
    }

    // ---- waveform + timecode, same layout as the other presets ----
    const wx = W * 0.14, ww = W - 2 * wx, wy = H * 0.772, wh = 42 * u, prog = tau / sl;
    if (S.wave) {
      const nw = S.wave.length, cwv = ww / nw;
      for (let i = 0; i < nw; i++) { const h = Math.max(1.5 * u, S.wave[i] * wh); ctx.fillStyle = c(i / nw < prog ? 0.8 : 0.25); ctx.fillRect(wx + i * cwv, wy + (wh - h) / 2, Math.max(1, cwv - 1.6 * u), h); }
    }
    for (let b = 0; b <= S.lenBars; b++) { const x = wx + ww * b / S.lenBars; ctx.fillStyle = c(b % 4 === 0 ? 0.5 : 0.25); ctx.fillRect(x - 0.5 * u, wy + wh + 8 * u, 1.2 * u, (b % 4 === 0 ? 10 : 6) * u); }
    ctx.fillStyle = c(0.95); ctx.fillRect(wx + ww * prog - 1 * u, wy - 8 * u, 2 * u, wh + 16 * u);
    const bar = S.startBar + Math.floor(tau / bd) + 1, beat = Math.floor(mod(tau, bd) / (bd / 4)) + 1, yB = wy + wh + 48 * u;
    ctx.textBaseline = 'alphabetic'; ctx.font = `400 ${16 * u}px ${MONO}`; ctx.fillStyle = c(0.72);
    spaced(fmtT(tau), wx, yB, 1.5 * u, 'left');
    ctx.fillStyle = c(0.6); spaced(`bar ${pad(bar, 2)}.${beat}  /  ${pad(S.startBar + S.lenBars, 2)}`, W - wx, yB, 1.5 * u, 'right');

    ctx.drawImage(this.ov, 0, 0);
    grain(0.06);
  }
};

export default BLOOM;
