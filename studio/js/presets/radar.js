// RADAR: a scope that sweeps once per bar. Hits become targets; angle = place in the bar, distance = pitch.
import { S, segLen, segStart, barDur } from '../state.js';
import { cv, ctx, W, H, u, cx, grain, spaced, MONO, DISP, SFP } from '../render/canvas.js';
import { clamp, mod, TAU, hsh, mulberry, rgba, pad, fmtT, titleCase } from '../util.js';

const sweepDur = () => S.radar.sweepBars * barDur();

// radar zones; inside each zone the distance follows pitch on a log scale
const ZONES = {
  low:  { r0: 0.13, r1: 0.35, f0: 32, f1: 150, name: 'SUB', hz: '40–150' },
  mid:  { r0: 0.41, r1: 0.67, f0: 160, f1: 1900, name: 'MID', hz: '150–2K' },
  high: { r0: 0.74, r1: 0.95, f0: 2100, f1: 12000, name: 'TOP', hz: '2K–12K' }
};
function zr(type, f) {
  const z = ZONES[type], ff = clamp(f || z.f0 * 2, z.f0, z.f1);
  return z.r0 + (z.r1 - z.r0) * (Math.log(ff) - Math.log(z.f0)) / (Math.log(z.f1) - Math.log(z.f0));
}

const TINTS = {
  bone: { fg: [236, 230, 215], bg: [10, 9, 8] },
  ice:  { fg: [214, 228, 238], bg: [6, 9, 12] },
  ash:  { fg: [208, 208, 204], bg: [13, 13, 13] }
};
const B8 = [0,32,8,40,2,34,10,42,48,16,56,24,50,18,58,26,12,44,4,36,14,46,6,38,60,28,52,20,62,30,54,22,3,35,11,43,1,33,9,41,51,19,59,27,49,17,57,25,15,47,7,39,13,45,5,37,63,31,55,23,61,29,53,21].map(v => (v + 0.5) / 64);
const RADAR = {
  id: 'radar', name: 'Radar',
  defaults: { tint: 'bone', sweepBars: 1, persist: 1.5, glitch: 0.35 },
  controls: [
    { key: 'sweepBars', label: 'One sweep rotation', type: 'choice', options: [[1, '1 bar'], [2, '2 bars']], then: 'rebuild' },
    { key: 'persist', label: 'Afterglow', type: 'range', min: 0.4, max: 3, step: 0.1, format: v => v.toFixed(1) + ' rev' },
    { key: 'glitch', label: 'Glitch on hard hits', type: 'range', min: 0, max: 1, step: 0.01 },
    { key: 'tint', label: 'Tint', type: 'choice', options: [['bone', 'bone'], ['ice', 'ice'], ['ash', 'ash']], then: 'buildBG' }
  ],
  // angle = place in the sweep, distance = pitch; then pick which hits get a note label and which glitch the frame
  prepare(seg) {
    const sd = sweepDur(), bd = barDur();
    for (const o of seg) { o.a = -Math.PI / 2 + mod(o.rt / sd, 1) * TAU; o.r = zr(o.type, o.type === 'high' ? o.fc : o.p); o.label = false; o.gl = false; }
    const cand = seg.filter(o => o.type !== 'high' && o.s > 0.28 && o.note).sort((a, b) => b.s - a.s), placed = [];
    for (const o of cand) {
      const x = Math.cos(o.a) * o.r, y = Math.sin(o.a) * o.r;
      if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < 0.16)) continue;
      placed.push([x, y]); o.label = true; if (placed.length >= 22) break;
    }
    const lows = seg.filter(o => o.type === 'low');
    const gcut = lows.map(o => o.s).sort((a, b) => b - a)[Math.max(0, Math.floor(lows.length * 0.25))] || 1;
    let lastG = -9; for (const o of lows) if (o.s >= gcut && o.s > 0.5 && o.rt - lastG > bd * 0.9) { o.gl = true; lastG = o.rt; }
  },
  pcv: document.createElement('canvas'), pout: document.createElement('canvas'),
  bgCv: document.createElement('canvas'), ovCv: document.createElement('canvas'), scratch: document.createElement('canvas'),
  setup() {
    this.pctx = this.pctx || this.pcv.getContext('2d', { willReadFrequently: true });
    this.poctx = this.poctx || this.pout.getContext('2d');
    this.cy = H * 0.455; this.R = W * 0.3;
    this.px = W >= 1000 ? 4 : 3; this.pw = Math.ceil(W / this.px); this.ph = Math.ceil(H / this.px);
    this.pcv.width = this.pout.width = this.pw; this.pcv.height = this.pout.height = this.ph;
    this.pimg = this.poctx.createImageData(this.pw, this.ph);
    const pw = this.pw, ph = this.ph, mask = this.mask = new Uint8Array(pw * ph);
    const pcx = cx / this.px, pcy = this.cy / this.px, pr = this.R * 1.02 / this.px;
    for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) mask[y * pw + x] = (x - pcx) ** 2 + (y - pcy) ** 2 < pr * pr ? 1 : 0;
    this.scratch.width = W; this.scratch.height = Math.ceil(120 * u);
    this.buildBG(); this.buildOverlay();
  },
  buildBG() {
    const T = TINTS[S.radar.tint], cy = this.cy, R = this.R, c = this.bgCv; c.width = W; c.height = H; const b = c.getContext('2d');
    b.fillStyle = rgba(T.bg, 1); b.fillRect(0, 0, W, H);
    const g = b.createRadialGradient(cx, cy, R * 0.2, cx, cy, H * 0.75); g.addColorStop(0, rgba(T.fg, 0.035)); g.addColorStop(1, rgba(T.fg, 0)); b.fillStyle = g; b.fillRect(0, 0, W, H);
    const step = 18 * u; b.fillStyle = rgba(T.fg, 0.075);
    for (let y = step / 2; y < H; y += step) for (let x = step / 2; x < W; x += step) b.fillRect(x, y, 1.4 * u, 1.4 * u);
    b.fillStyle = rgba(T.bg, 0.82); b.beginPath(); b.arc(cx, cy, R, 0, TAU); b.fill();
  },
  buildOverlay() {
    const o = this.ovCv; o.width = W; o.height = H; const x = o.getContext('2d');
    const g = x.createRadialGradient(cx, H * 0.47, H * 0.25, cx, H * 0.47, H * 0.72); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(0,0,0,0.10)'; const s = Math.max(3, Math.round(4 * u)); for (let y = 0; y < H; y += s) x.fillRect(0, y, W, 1);
  },
  draw(tau, F) {
    const T = TINTS[S.radar.tint], fg = T.fg, c = a => rgba(fg, a), A = S.A;
    const sl = segLen(), sd = sweepDur(), bd = barDur(), cy = this.cy, R = this.R;
    const { pctx, poctx, pw, ph, px, mask, pimg } = this;
    ctx.drawImage(this.bgCv, 0, 0);
    const low = F.low, high = F.high, rmsN = F.rmsN;
    const phase = mod(tau / sd, 1), ang = -Math.PI / 2 + phase * TAU;
    const Rp = R * (1 + 0.014 * low);
    const maxAge = Math.min(S.radar.persist * sd, sl * 0.96), vis = [];
    for (const o of S.seg) { const age = mod(tau - o.rt, sl); if (age < maxAge) vis.push({ o, age, k: Math.pow(1 - age / maxAge, 1.5) }); }

    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Rp * 1.3);
    g.addColorStop(0, c(0.05 + 0.12 * low)); g.addColorStop(1, c(0)); ctx.fillStyle = g; ctx.fillRect(0, cy - Rp * 1.3, W, Rp * 2.6);

    // phosphor layer: low-res, ordered dither
    pctx.setTransform(1, 0, 0, 1, 0, 0); pctx.globalCompositeOperation = 'source-over'; pctx.fillStyle = '#000'; pctx.fillRect(0, 0, pw, ph);
    pctx.setTransform(1 / px, 0, 0, 1 / px, 0, 0); pctx.globalCompositeOperation = 'lighter';
    const wedge = Math.PI * 0.45, frac = wedge / TAU, peak = A ? 0.32 + 0.55 * rmsN : 0.45;
    if (pctx.createConicGradient) {
      const cg = pctx.createConicGradient(ang - wedge, cx, cy);
      cg.addColorStop(0, 'rgba(255,255,255,0)'); cg.addColorStop(frac * 0.55, `rgba(255,255,255,${peak * 0.18})`);
      cg.addColorStop(frac * 0.97, `rgba(255,255,255,${peak})`); cg.addColorStop(frac, `rgba(255,255,255,${Math.min(1, peak + 0.3)})`);
      cg.addColorStop(Math.min(1, frac + 0.003), 'rgba(255,255,255,0)'); cg.addColorStop(1, 'rgba(255,255,255,0)');
      pctx.fillStyle = cg; pctx.beginPath(); pctx.arc(cx, cy, Rp, 0, TAU); pctx.fill();
    } else {
      for (let i = 0; i < 16; i++) { const a0 = ang - wedge * (i + 1) / 16, a1 = ang - wedge * i / 16; pctx.fillStyle = `rgba(255,255,255,${peak * Math.pow(1 - i / 16, 2)})`; pctx.beginPath(); pctx.moveTo(cx, cy); pctx.arc(cx, cy, Rp, a0, a1); pctx.fill(); }
    }
    for (const v of vis) {
      const o = v.o, x = cx + Math.cos(o.a) * o.r * Rp, y = cy + Math.sin(o.a) * o.r * Rp;
      const birth = v.age < 0.12 ? 1 - v.age / 0.12 : 0;
      const rr = (o.type === 'low' ? 30 : o.type === 'mid' ? 22 : 10) * u * (0.55 + 0.6 * o.s) * (1 + birth * 0.8);
      const gg = pctx.createRadialGradient(x, y, 0, x, y, rr), al = Math.min(1, v.k * (0.35 + 0.65 * o.s) + birth * 0.5);
      gg.addColorStop(0, `rgba(255,255,255,${al})`); gg.addColorStop(1, 'rgba(255,255,255,0)');
      pctx.fillStyle = gg; pctx.beginPath(); pctx.arc(x, y, rr, 0, TAU); pctx.fill();
    }
    const src = pctx.getImageData(0, 0, pw, ph).data, d = pimg.data, dens = 0.0015 + 0.011 * high * high;
    let seed = (S.frame * 2654435761) >>> 0 || 1;
    for (let y = 0; y < ph; y++) {
      const by = (y & 7) << 3;
      for (let x = 0; x < pw; x++) {
        const i = y * pw + x, j = i << 2, v = src[j] / 255;
        let on = v > 0.035 && v > B8[by | (x & 7)], a = v > 0.8 ? 255 : 190;
        if (!on && mask[i]) { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; const r = (seed >>> 0) / 4294967296; if (r < dens) { on = true; a = 70 + (r / dens) * 150; } }
        if (on) { d[j] = fg[0]; d[j + 1] = fg[1]; d[j + 2] = fg[2]; d[j + 3] = a; } else d[j + 3] = 0;
      }
    }
    poctx.putImageData(pimg, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.pout, 0, 0, pw * px, ph * px); ctx.imageSmoothingEnabled = true;

    // zone rings
    ctx.lineWidth = 1.1 * u; ctx.textBaseline = 'middle';
    for (const r of [0.38, 0.705]) { ctx.strokeStyle = c(0.22); ctx.beginPath(); ctx.arc(cx, cy, Rp * r, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([1 * u, 5 * u]);
    for (const r of [0.13, 0.54, 0.845]) { ctx.strokeStyle = c(0.13); ctx.beginPath(); ctx.arc(cx, cy, Rp * r, 0, TAU); ctx.stroke(); }
    ctx.setLineDash([]);
    for (const k of ['low', 'mid', 'high']) {
      const z = ZONES[k], r = Rp * (z.r0 + z.r1) / 2, y = cy + r;
      ctx.textAlign = 'right'; ctx.font = `500 ${14 * u}px ${MONO}`; ctx.fillStyle = c(0.5); ctx.fillText(z.name, cx - 20 * u, y - 9 * u);
      ctx.font = `400 ${12 * u}px ${MONO}`; ctx.fillStyle = c(0.32); ctx.fillText(z.hz, cx - 20 * u, y + 9 * u);
    }
    ctx.setLineDash([2 * u, 7 * u]); ctx.strokeStyle = c(0.16); ctx.beginPath();
    ctx.moveTo(cx - Rp, cy); ctx.lineTo(cx + Rp, cy); ctx.moveTo(cx, cy - Rp); ctx.lineTo(cx, cy + Rp); ctx.stroke(); ctx.setLineDash([]);
    ctx.lineWidth = (1.8 + 1.4 * low) * u; ctx.strokeStyle = c(0.55 + 0.35 * low); ctx.beginPath(); ctx.arc(cx, cy, Rp, 0, TAU); ctx.stroke();
    const sub = S.radar.sweepBars * 16; ctx.lineWidth = 1.2 * u;
    for (let i = 0; i < sub; i++) {
      const a = -Math.PI / 2 + i / sub * TAU, L = (i % 16 === 0 ? 24 : i % 4 === 0 ? 15 : 7) * u;
      ctx.strokeStyle = c(i % 4 === 0 ? 0.6 : 0.3); ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * Rp, cy + Math.sin(a) * Rp); ctx.lineTo(cx + Math.cos(a) * (Rp - L), cy + Math.sin(a) * (Rp - L)); ctx.stroke();
    }
    // bezel: loudness painted by the sweep
    const K = 180; ctx.lineWidth = 2 * u;
    for (let kk = 0; kk < K; kk++) {
      const p = kk / K, dp = mod(phase - p, 1);
      let v = 0.08; if (A) { const tt = mod(tau - dp * sd, sl), f2 = clamp(Math.round((segStart() + tt) * A.frameRate), 0, A.nF - 1); v = A.rmsN[f2]; }
      const a = -Math.PI / 2 + p * TAU, r0 = Rp + 10 * u, r1 = r0 + (2 + 30 * v * v) * u;
      ctx.strokeStyle = c((0.12 + 0.75 * (1 - dp)) * (0.35 + 0.65 * v)); ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); ctx.stroke();
    }
    const curBeat = Math.floor(mod(tau, sd) / (bd / 4));
    ctx.font = `500 ${16 * u}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let b = 0; b < S.radar.sweepBars * 4; b++) {
      const a = -Math.PI / 2 + b / (S.radar.sweepBars * 4) * TAU, r = Rp + 62 * u;
      const lab = S.radar.sweepBars === 1 ? String(b + 1) : `${Math.floor(b / 4) + 1}.${b % 4 + 1}`;
      ctx.fillStyle = c(b === curBeat ? 0.95 : 0.38); ctx.fillText(lab, cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    // contacts
    ctx.textBaseline = 'alphabetic';
    for (const v of vis) {
      const o = v.o, x = cx + Math.cos(o.a) * o.r * Rp, y = cy + Math.sin(o.a) * o.r * Rp;
      const al = v.age < 0.1 ? 1 : 0.25 + 0.75 * v.k;
      ctx.strokeStyle = c(al); ctx.fillStyle = c(al); ctx.lineWidth = 1.6 * u;
      if (o.type === 'low') {
        const s = (9 + 12 * o.s) * u; ctx.strokeRect(x - s / 2, y - s / 2, s, s);
        if (v.age < 0.6) { const rr = s * 0.7 + (v.age / 0.6) * 70 * u; ctx.strokeStyle = c((1 - v.age / 0.6) * 0.7 * o.s); ctx.beginPath(); ctx.arc(x, y, rr, 0, TAU); ctx.stroke(); }
        if (o.s > 0.45 && v.age < 0.8) { const rr = (v.age / 0.8) * Rp * 0.95; ctx.lineWidth = 1 * u; ctx.strokeStyle = c((1 - v.age / 0.8) * 0.3 * o.s); ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); }
      } else if (o.type === 'mid') {
        const s = (6 + 8 * o.s) * u, gp = 2.5 * u; ctx.beginPath();
        ctx.moveTo(x - s, y); ctx.lineTo(x - gp, y); ctx.moveTo(x + gp, y); ctx.lineTo(x + s, y);
        ctx.moveTo(x, y - s); ctx.lineTo(x, y - gp); ctx.moveTo(x, y + gp); ctx.lineTo(x, y + s); ctx.stroke();
      } else {
        const L = (8 + 16 * o.s) * u, ca = Math.cos(o.a), sa = Math.sin(o.a); ctx.lineWidth = (1.6 + 1.6 * o.s) * u;
        ctx.beginPath(); ctx.moveTo(x - ca * L / 2, y - sa * L / 2); ctx.lineTo(x + ca * L / 2, y + sa * L / 2); ctx.stroke();
      }
      if (o.label && v.k > 0.18) {
        const lx = x + 14 * u, ly = y - 14 * u; ctx.lineWidth = 1 * u; ctx.strokeStyle = c(al * 0.6);
        ctx.beginPath(); ctx.moveTo(x + 5 * u, y - 5 * u); ctx.lineTo(lx, ly); ctx.lineTo(lx + 6 * u, ly); ctx.stroke();
        ctx.font = `500 ${17 * u}px ${MONO}`; ctx.fillStyle = c(al * 0.9); ctx.textAlign = 'left'; ctx.fillText(o.note, lx + 9 * u, ly + 6 * u);
      }
    }
    ctx.lineWidth = 2 * u; ctx.strokeStyle = c(0.95); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ang) * (Rp + 6 * u), cy + Math.sin(ang) * (Rp + 6 * u)); ctx.stroke();
    ctx.fillStyle = c(0.95); ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * (Rp + 6 * u), cy + Math.sin(ang) * (Rp + 6 * u), 3.5 * u, 0, TAU); ctx.fill();
    ctx.strokeStyle = c(0.35); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(cx, cy, 14 * u, 0, TAU); ctx.stroke();
    ctx.fillStyle = c(0.9); ctx.beginPath(); ctx.arc(cx, cy, 4 * u, 0, TAU); ctx.fill();

    // HUD
    const mx = W * 0.14, yT = H * 0.2;
    ctx.textBaseline = 'alphabetic';
    { const tt = (S.title || '').toUpperCase(); let ts = 33 * u; ctx.font = `400 ${ts}px ${DISP}`;
      const tw = ctx.measureText(tt).width + 7 * u * Math.max(0, tt.length - 1);
      if (tw > W - 2 * mx) { ts *= (W - 2 * mx) / tw; ctx.font = `400 ${ts}px ${DISP}`; }
      ctx.fillStyle = c(0.96); spaced(tt, mx, yT, 7 * u * ts / (33 * u), 'left'); }
    ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = c(0.5);
    spaced((S.tag || '').toUpperCase(), mx, yT + 44 * u, 3 * u, 'left');
    ctx.font = `500 ${17 * u}px ${MONO}`; ctx.fillStyle = c(0.85);
    spaced(`${+S.bpm.toFixed(2)} BPM  ·  ${(S.key || '').toUpperCase()}`, W - mx, yT + 44 * u, 2.2 * u, 'right');
    const bar = S.startBar + Math.floor(tau / bd) + 1, beat = Math.floor(mod(tau, bd) / (bd / 4)) + 1;
    const wy = H * 0.705, wh = 46 * u, ww = W - 2 * mx, prog = tau / sl;
    if (S.wave) {
      const n = S.wave.length, cw = ww / n;
      for (let i = 0; i < n; i++) { const h = Math.max(1.5 * u, S.wave[i] * wh); ctx.fillStyle = c(i / n < prog ? 0.78 : 0.22); ctx.fillRect(mx + i * cw, wy + (wh - h) / 2, Math.max(1, cw - 1.6 * u), h); }
    }
    for (let b = 0; b <= S.lenBars; b++) { const x = mx + ww * b / S.lenBars; ctx.fillStyle = c(b % 4 === 0 ? 0.5 : 0.25); ctx.fillRect(x - 0.5 * u, wy + wh + 8 * u, 1.2 * u, (b % 4 === 0 ? 10 : 6) * u); }
    ctx.fillStyle = c(0.95); ctx.fillRect(mx + ww * prog - 1 * u, wy - 8 * u, 2 * u, wh + 16 * u);
    const yB = wy + wh + 50 * u;
    ctx.font = `400 ${16 * u}px ${MONO}`; ctx.fillStyle = c(0.7); spaced(fmtT(tau), mx, yB, 1.5 * u, 'left');
    ctx.fillStyle = c(0.55); spaced(`BAR ${pad(bar, 2)}.${beat}  /  ${pad(S.startBar + S.lenBars, 2)}`, W - mx, yB, 1.5 * u, 'right');

    // glitch on hard hits
    if (S.radar.glitch > 0) {
      const sc = this.scratch.getContext('2d');
      for (const o of S.seg) {
        if (!o.gl) continue; const age = mod(tau - o.rt, sl); if (age > 0.09) continue;
        const rnd = mulberry(o.i * 7919 + Math.floor(age * 60)), nS = 3 + (o.i % 4);
        for (let j = 0; j < nS; j++) {
          const sh = Math.min(this.scratch.height, (8 + rnd() * 90) * u), sy = H * (0.2 + rnd() * 0.55), dx = (rnd() - 0.5) * 2 * S.radar.glitch * 70 * u;
          sc.clearRect(0, 0, W, this.scratch.height); sc.drawImage(cv, 0, sy, W, sh, 0, 0, W, sh);
          ctx.drawImage(this.scratch, 0, 0, W, sh, dx, sy, W, sh);
          if (j === 0 && S.radar.glitch > 0.3) { ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = c(0.9 * S.radar.glitch); ctx.fillRect(0, sy, W, Math.min(sh, 6 * u)); ctx.globalCompositeOperation = 'source-over'; }
        }
      }
    }
    grain(0.055);
    ctx.drawImage(this.ovCv, 0, 0);
  }
};

export default RADAR;
