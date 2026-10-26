// VEIL: a field of points (cloud, orb or halo) that breathes with the loudness; kicks send ripples, notes drift up.
import { S, segLen, segStart, barDur } from '../state.js';
import { cv, ctx, W, H, u, cx, grain, spaced, MONO, DISP, SFP } from '../render/canvas.js';
import { clamp, mod, TAU, hsh, mulberry, rgba, pad, fmtT, titleCase } from '../util.js';

const VEIL_PAL = {
  mist: { bg: [221, 225, 229], hi: [246, 247, 248], ink: [28, 33, 40] },
  milk: { bg: [230, 225, 216], hi: [250, 247, 241], ink: [40, 36, 31] },
  rose: { bg: [231, 221, 223], hi: [250, 244, 244], ink: [48, 36, 43] }
};
const VEIL_ALPHA = [0.6, 0.42, 0.25, 0.15, 0.095, 0.06], VEIL_SIZE = [1.9, 2.6, 3.7, 5.3, 7.6, 10.5];
// amp: how far the surface moves; focus/dof: where the lens is sharp and how fast it blurs with depth
const VEIL_SHAPES = {
  cloud: { amp: 1, breathe: 0, focus: -0.05, dof: 7.5, rip: 1 },
  orb:   { amp: 0.5, breathe: 0.05, focus: -0.45, dof: 4.2, rip: 0.8 },
  halo:  { amp: 0.3, breathe: 0.04, focus: -0.25, dof: 4.6, rip: 0.7 }
};
const VEIL = {
  id: 'veil', name: 'Veil',
  defaults: { pal: 'mist', shape: 'orb', ink: '', flow: 0.5, ripple: 0.6, haze: 0.55, detail: 1 },
  controls: [
    { key: 'shape', label: 'Shape', type: 'choice', options: [['cloud', 'cloud'], ['orb', 'orb'], ['halo', 'halo']], then: 'buildShape' },
    { key: 'pal', label: 'Palette', type: 'choice', options: [['mist', 'mist'], ['milk', 'milk'], ['rose', 'rose']], then: 'buildBG' },
    { key: 'ink', label: 'Point color', type: 'ink', then: 'buildBG', swatches: [
      ['', 'palette', 'linear-gradient(135deg,#1c2128 50%,#e3e6e9 50%)'], ['#3346d3', 'cobalt'], ['#a3213a', 'blood red'],
      ['#3c6a4f', 'moss'], ['#b07a2a', 'amber'], ['#7d5fcf', 'lilac']] },
    { key: 'flow', label: 'Flow', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'ripple', label: 'Ripples from 808 & kick', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'haze', label: 'Haze', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'detail', label: 'Detail', type: 'choice', options: [[0, 'low'], [1, 'mid'], [2, 'high']], then: 'setup' }
  ],
  // melody notes that float up as dust: strongest ones, spaced out in time
  prepare(seg) {
    const sl = segLen(), bd = barDur();
    for (const o of seg) o.vlabel = false;
    const vc = seg.filter(o => o.type === 'mid' && o.note && o.s > 0.3).sort((a, b) => b.s - a.s), vt = [];
    for (const o of vc) { if (vt.some(t => Math.abs(mod(t - o.rt + sl / 2, sl) - sl / 2) < bd * 0.3)) continue; vt.push(o.rt); o.vlabel = true; if (vt.length >= S.lenBars * 3) break; }
  },
  bgCv: document.createElement('canvas'), ovCv: document.createElement('canvas'),
  layer: document.createElement('canvas'), f1: document.createElement('canvas'), f2: document.createElement('canvas'),
  setup() {
    const det = [[46, 66], [62, 90], [80, 116]][S.veil.detail], nu = det[0], nv = det[1], n = nu * nv;
    this.n = n; this.U = new Float32Array(n); this.V = new Float32Array(n); this.Rn = new Float32Array(n);
    const rnd = mulberry(1234);
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const k = j * nu + i;
      this.U[k] = (i / (nu - 1)) * 2 - 1 + (rnd() - 0.5) * 1.6 / nu;
      this.V[k] = (j / (nv - 1)) * 2 - 1 + (rnd() - 0.5) * 1.6 / nv;
      this.Rn[k] = rnd();
    }
    this.buildShape();
    this.layer.width = W; this.layer.height = H; this.lctx = this.layer.getContext('2d');
    this.f1.width = Math.ceil(W / 4); this.f1.height = Math.ceil(H / 4); this.f2.width = Math.ceil(W / 16); this.f2.height = Math.ceil(H / 16);
    this.cy = H * 0.465; this.SC = W * 0.33;
    this.B = Array.from({ length: 8 }, () => []);
    this.buildBG();
  },
  // base surface + normals for the chosen shape; motion is pushed along the normal
  buildShape() {
    const n = this.n, U = this.U, V = this.V, sh = S.veil.shape;
    const PX = this.PX = new Float32Array(n), PY = this.PY = new Float32Array(n), PZ = this.PZ = new Float32Array(n);
    const NX = this.NX = new Float32Array(n), NY = this.NY = new Float32Array(n), NZ = this.NZ = new Float32Array(n);
    const HA = this.HA = new Float32Array(n), gr = mulberry(777), gauss = () => { const a = Math.max(1e-6, gr()), b = gr(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(TAU * b); };
    for (let k = 0; k < n; k++) {
      const uu = U[k], vv = V[k];
      if (sh === 'orb') {
        const r = 0.82, th = Math.PI * uu, ph = Math.acos(clamp(vv, -1, 1));
        const sx = Math.sin(ph) * Math.cos(th), sy = Math.cos(ph), sz = Math.sin(ph) * Math.sin(th);
        PX[k] = r * sx; PY[k] = r * sy; PZ[k] = r * sz; NX[k] = sx; NY[k] = sy; NZ[k] = sz;
      } else if (sh === 'halo') {
        // a sprayed ring: dense thin core, a wider mist around it, a few particles flung far out
        const a = Math.PI * uu + (gr() - 0.5) * 0.08, ca = Math.cos(a), sa = Math.sin(a), q = gr();
        const spread = q < 0.5 ? 0.028 : q < 0.85 ? 0.085 : 0.22;
        const rad = 0.8 + gauss() * spread * 1.15 + (q > 0.85 ? Math.abs(gauss()) * 0.08 : 0), yy = gauss() * spread * 0.75;
        PX[k] = rad * ca; PY[k] = yy; PZ[k] = rad * sa; NX[k] = ca; NY[k] = 0; NZ[k] = sa; HA[k] = a;
      } else {
        PX[k] = uu * 0.95; PY[k] = vv * 1.15; PZ[k] = 0.2 * (1 - uu * uu); NX[k] = 0; NY[k] = 0; NZ[k] = 1;
      }
    }
  },
  pointInk() {
    const h = S.veil.ink; if (!h || !/^#[0-9a-f]{6}$/i.test(h)) return VEIL_PAL[S.veil.pal].ink;
    return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  },
  rippleSeed(i) {
    for (let t = 0; t < 8; t++) { const k = Math.floor(hsh(i + t * 13.7) * this.n) % this.n; if (S.veil.shape !== 'cloud' || this.U[k] ** 2 + this.V[k] ** 2 < 0.35) return k; }
    return 0;
  },
  buildBG() {
    const P = VEIL_PAL[S.veil.pal], c = this.bgCv; c.width = W; c.height = H; const b = c.getContext('2d');
    b.fillStyle = rgba(P.bg, 1); b.fillRect(0, 0, W, H);
    const g = b.createRadialGradient(cx, this.cy, 0, cx, this.cy, H * 0.6); g.addColorStop(0, rgba(P.hi, 1)); g.addColorStop(1, rgba(P.hi, 0));
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    const o = this.ovCv; o.width = W; o.height = H; const x = o.getContext('2d');
    const v = x.createRadialGradient(cx, H * 0.47, H * 0.3, cx, H * 0.47, H * 0.75); v.addColorStop(0, rgba(P.ink, 0)); v.addColorStop(1, rgba(P.ink, 0.16));
    x.fillStyle = v; x.fillRect(0, 0, W, H);
    // one soft light sprite, reused for the drifting blobs and the backlight
    const bs = this.blob = document.createElement('canvas'); bs.width = bs.height = 256; const bx = bs.getContext('2d');
    const bgr = bx.createRadialGradient(128, 128, 0, 128, 128, 128); bgr.addColorStop(0, rgba(P.hi, 1)); bgr.addColorStop(0.5, rgba(P.hi, 0.45)); bgr.addColorStop(1, rgba(P.hi, 0));
    bx.fillStyle = bgr; bx.fillRect(0, 0, 256, 256);
    const ws = this.white = document.createElement('canvas'); ws.width = ws.height = 256; const wx = ws.getContext('2d');
    const wgr = wx.createRadialGradient(128, 128, 0, 128, 128, 128); wgr.addColorStop(0, 'rgba(255,255,255,1)'); wgr.addColorStop(0.5, 'rgba(255,255,255,0.4)'); wgr.addColorStop(1, 'rgba(255,255,255,0)');
    wx.fillStyle = wgr; wx.fillRect(0, 0, 256, 256);
    // pre-rendered soft dots for the out-of-focus levels: one drawImage per point instead of thousands of arcs
    this.spr = [];
    for (let lv = 0; lv < 6; lv++) {
      const s = VEIL_SIZE[lv] * u, d = Math.ceil(s + 4), sc = document.createElement('canvas'); sc.width = sc.height = d;
      const g2 = sc.getContext('2d'), gr = g2.createRadialGradient(d / 2, d / 2, 0, d / 2, d / 2, s / 2);
      const pc = this.pointInk();
      gr.addColorStop(0, rgba(pc, VEIL_ALPHA[lv])); gr.addColorStop(lv >= 4 ? 0.5 : 0.78, rgba(pc, VEIL_ALPHA[lv] * 0.85)); gr.addColorStop(1, rgba(pc, 0));
      g2.fillStyle = gr; g2.beginPath(); g2.arc(d / 2, d / 2, s / 2, 0, TAU); g2.fill();
      this.spr.push(sc);
    }
  },
  draw(tau, F) {
    const P = VEIL_PAL[S.veil.pal], ink = P.ink, c = a => rgba(ink, a), sl = segLen(), bd = barDur();
    const p = tau / sl, slow = F.slow, cy = this.cy, SC = this.SC;
    ctx.drawImage(this.bgCv, 0, 0);
    // soft light blobs drifting behind the veil (integer cycles per loop, so it loops clean)
    ctx.globalCompositeOperation = 'source-over';
    for (let k = 0; k < 4; k++) {
      const x = cx + W * 0.3 * Math.sin(TAU * (p * (k % 2 ? 1 : 2)) + k * 1.7);
      const y = H * (0.46 + 0.17 * Math.sin(TAU * (p * (k < 2 ? 1 : 3)) + k * 2.3));
      const r = W * (0.22 + 0.06 * (k % 3)) * (1 + 0.1 * slow);
      ctx.globalAlpha = 0.55 + 0.3 * slow; ctx.drawImage(this.blob, x - r, y - r, r * 2, r * 2);
    }
    // backlight that swells with 808 / kick
    const br = W * 0.55;
    ctx.globalAlpha = clamp((0.18 + 0.4 * F.low) * (0.4 + 0.6 * S.veil.ripple), 0, 1); ctx.drawImage(this.white, cx - br, cy - br, br * 2, br * 2);
    ctx.globalAlpha = 1;

    // ripples from low hits: each starts at a point on the surface and runs across it
    const n = this.n, PX = this.PX, PY = this.PY, PZ = this.PZ, NX = this.NX, NY = this.NY, NZ = this.NZ, rip = [];
    if (S.veil.ripple > 0) for (const o of S.seg) {
      if (o.type !== 'low' || o.s < 0.3) continue; const age = mod(tau - o.rt, sl); if (age > 2.4) continue;
      const k0 = this.rippleSeed(o.i);
      rip.push([PX[k0], PY[k0], PZ[k0], age, o.s * S.veil.ripple]);
    }
    const shape = S.veil.shape, sh = VEIL_SHAPES[shape], cloud = shape === 'cloud';
    const flow = S.veil.flow, amp = (0.25 + 0.75 * flow) * (0.45 + 0.85 * slow) * sh.amp, grow = 1 + sh.breathe * slow;
    let yaw, pit;
    if (cloud) { yaw = 0.3 * Math.sin(TAU * p); pit = -0.3 + 0.07 * Math.sin(TAU * 2 * p + 1.1); }
    else if (shape === 'orb') { yaw = TAU * p; pit = -0.22 + 0.08 * Math.sin(TAU * 2 * p); }
    else { yaw = TAU * p; pit = -0.55 + 0.08 * Math.sin(TAU * 2 * p); }
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pit), sp = Math.sin(pit);
    const ph1 = TAU * p, ph2 = TAU * 2 * p, ph3 = TAU * 3 * p, tb = Math.floor(tau * 10), shimmer = F.high * F.high * 0.05;
    const B = this.B; for (const a of B) a.length = 0;
    const U = this.U, V = this.V, Rn = this.Rn;
    for (let k = 0; k < n; k++) {
      if (cloud) {
        // the edge dissolves into an uneven oval that slowly breathes, so it reads as fabric, not a card
        const uu = U[k], vv = V[k];
        const er = uu * uu * 1.05 + vv * vv * 0.92 + 0.1 * Math.sin(3 * uu + 2.2 * vv + ph1) + 0.06 * Math.sin(5.1 * vv - 2.3 * uu - ph2);
        const et = clamp((er - 0.48) / 0.66, 0, 1);
        if (Rn[k] > 1 - et * et * (3 - 2 * et)) continue;
      } else if (shape === 'halo') {
        // the ring thins out in places, and the thin spots travel around it over the loop
        const ha = this.HA[k];
        if (Rn[k] > 0.7 + 0.3 * Math.sin(2 * ha + ph1) * Math.sin(3 * ha - ph2 + 0.7)) continue;
      }
      const bx = PX[k], by = PY[k], bz = PZ[k];
      let d = amp * (0.22 * Math.sin(2.1 * bx + 1.2 * by + ph1) + 0.15 * Math.sin(3.3 * by - ph2 + 1.0 + 0.8 * bx + 0.9 * bz) + 0.07 * Math.sin(5.3 * bx + 4.1 * bz + 2.7 * by + ph3));
      let wave = 0;
      for (let r = 0; r < rip.length; r++) {
        const R = rip[r], dx = bx - R[0], dy = by - R[1], dz = bz - R[2], front = Math.sqrt(dx * dx + dy * dy + dz * dz) - 0.75 * R[3];
        wave += R[4] * Math.exp(-front * front * 45) * Math.exp(-R[3] * 1.3);
      }
      d += wave * 0.28 * sh.rip;
      const x3 = (bx + NX[k] * d) * grow, y3 = (by + NY[k] * d) * grow + (cloud ? 0.025 * Math.sin(ph1 + bx * 3) : 0), z3 = (bz + NZ[k] * d) * grow;
      const xr = x3 * cyw + z3 * syw, zr = -x3 * syw + z3 * cyw;
      const yr = y3 * cp - zr * sp, zz = y3 * sp + zr * cp;
      const s = 2.8 / (2.8 + zz), X = cx + xr * s * SC, Y = cy + yr * s * SC;
      let lv = Math.min(5, (Math.abs(zz - sh.focus) * sh.dof) | 0);
      if (wave > 0.22) lv = 6;
      B[lv].push(X, Y);
      if (hsh(k * 3.17 + tb * 7.71) < shimmer) B[7].push(X, Y);
    }
    const L = this.lctx; L.clearRect(0, 0, W, H);
    const inkMul = 0.78 + 0.3 * slow, pink = this.pointInk();
    for (let lv = 0; lv < 6; lv++) {
      const arr = B[lv]; if (!arr.length) continue;
      if (lv < 2) {
        const s = VEIL_SIZE[lv] * u; L.globalAlpha = 1; L.fillStyle = rgba(pink, VEIL_ALPHA[lv] * inkMul); L.beginPath();
        for (let i = 0; i < arr.length; i += 2) L.rect(arr[i] - s / 2, arr[i + 1] - s / 2, s, s);
        L.fill();
      } else {
        const sp = this.spr[lv], h = sp.width / 2; L.globalAlpha = Math.min(1, inkMul);
        for (let i = 0; i < arr.length; i += 2) L.drawImage(sp, arr[i] - h, arr[i + 1] - h);
      }
    }
    L.globalAlpha = 1;
    if (B[6].length) { const s = 2.6 * u; L.fillStyle = rgba(pink, 0.85); L.beginPath(); for (let i = 0; i < B[6].length; i += 2) L.rect(B[6][i] - s / 2, B[6][i + 1] - s / 2, s, s); L.fill(); }
    // haze: the same ink, blurred by downscaling, laid under the sharp points
    const f1 = this.f1.getContext('2d'), f2 = this.f2.getContext('2d');
    f1.clearRect(0, 0, this.f1.width, this.f1.height); f1.drawImage(this.layer, 0, 0, this.f1.width, this.f1.height);
    f2.clearRect(0, 0, this.f2.width, this.f2.height); f2.drawImage(this.f1, 0, 0, this.f2.width, this.f2.height);
    ctx.imageSmoothingEnabled = true;
    ctx.globalAlpha = S.veil.haze * 0.95; ctx.drawImage(this.f2, 0, 0, W, H);
    ctx.globalAlpha = S.veil.haze * 0.35; ctx.drawImage(this.f1, 0, 0, W, H);
    ctx.globalAlpha = 1; ctx.drawImage(this.layer, 0, 0);
    if (B[7].length) { const s = 2.4 * u; ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); for (let i = 0; i < B[7].length; i += 2) ctx.rect(B[7][i] - s / 2, B[7][i + 1] - s / 2, s, s); ctx.fill(); }

    // melody notes drifting up like dust
    ctx.textBaseline = 'middle';
    for (const o of S.seg) {
      if (!o.vlabel) continue; const age = mod(tau - o.rt, sl); if (age > 2.8) continue;
      const fadeIn = Math.min(1, age / 0.18), al = fadeIn * Math.pow(1 - age / 2.8, 1.3);
      const lp = clamp((Math.log(o.p || 400) - Math.log(160)) / (Math.log(1900) - Math.log(160)), 0, 1);
      const x = cx + (hsh(o.i + 3.3) - 0.5) * W * 0.5, y = cy + (0.62 - 1.24 * lp) * SC * 1.1 - age * 26 * u;
      ctx.fillStyle = c(al * 0.75); ctx.beginPath(); ctx.arc(x, y, 2.6 * u, 0, TAU); ctx.fill();
      ctx.strokeStyle = c(al * 0.35); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.moveTo(x, y + 6 * u); ctx.lineTo(x, y + (16 + age * 26) * u); ctx.stroke();
      ctx.font = `400 ${23 * u}px ${SFP}`; ctx.fillStyle = c(al * 0.85); ctx.textAlign = 'left'; ctx.fillText(o.note.toLowerCase(), x + 10 * u, y - 1 * u);
    }

    // HUD: quiet, centred, lowercase
    const mx = W * 0.14, yT = H * 0.185;
    ctx.textBaseline = 'alphabetic';
    { const tt = (S.title || '').toLowerCase(); let ts = 58 * u; ctx.font = `300 ${ts}px ${SFP}`;
      const tw = ctx.measureText(tt).width + 0.6 * u * Math.max(0, tt.length - 1);
      if (tw > W - 2 * mx) { ts *= (W - 2 * mx) / tw; ctx.font = `300 ${ts}px ${SFP}`; }
      ctx.fillStyle = c(0.88); spaced(tt, cx, yT, 0.6 * u * ts / (58 * u), 'center'); }
    ctx.font = `400 ${17 * u}px ${MONO}`; ctx.fillStyle = c(0.6);
    const meta = [`${+S.bpm.toFixed(2)} bpm`, (S.key || '').toLowerCase(), (S.tag || '').toLowerCase()].filter(Boolean).join('   ·   ');
    spaced(meta, cx, yT + 46 * u, 3.2 * u, 'center');
    // waveform of the section with the playhead, same layout as the radar, in ink
    const wy = H * 0.715, wh = 42 * u, ww = W - 2 * mx, prog = tau / sl;
    if (S.wave) {
      const nw = S.wave.length, cw = ww / nw;
      for (let i = 0; i < nw; i++) { const h = Math.max(1.5 * u, S.wave[i] * wh); ctx.fillStyle = c(i / nw < prog ? 0.62 : 0.16); ctx.fillRect(mx + i * cw, wy + (wh - h) / 2, Math.max(1, cw - 1.6 * u), h); }
    }
    for (let b = 0; b <= S.lenBars; b++) { const x = mx + ww * b / S.lenBars; ctx.fillStyle = c(b % 4 === 0 ? 0.42 : 0.2); ctx.fillRect(x - 0.5 * u, wy + wh + 8 * u, 1.2 * u, (b % 4 === 0 ? 10 : 6) * u); }
    ctx.fillStyle = c(0.85); ctx.fillRect(mx + ww * prog - 1 * u, wy - 8 * u, 2 * u, wh + 16 * u);
    const bar = S.startBar + Math.floor(tau / bd) + 1, beat = Math.floor(mod(tau, bd) / (bd / 4)) + 1, yB = wy + wh + 48 * u;
    ctx.font = `400 ${16 * u}px ${MONO}`; ctx.fillStyle = c(0.6);
    spaced(fmtT(tau), mx, yB, 1.5 * u, 'left');
    ctx.fillStyle = c(0.5); spaced(`bar ${pad(bar, 2)}.${beat}  /  ${pad(S.startBar + S.lenBars, 2)}`, W - mx, yB, 1.5 * u, 'right');

    ctx.drawImage(this.ovCv, 0, 0);
    grain(0.05);
  }
};

export default VEIL;
