// STRINGS: the beat played on strings. On the left the thick bass string, plucked by the kick and the 808;
// in the middle a string for each note the melody uses most (lower notes to the left); on the right a thin
// string the hats tick. A hit plucks its string at a point; the string swings in a few harmonics and rings
// out, slower for long notes, and the shape it sweeps stays faintly visible while it rings, like a long
// exposure. Every swing is worked out from the time since its hit, so the video loops without a seam.
// Melody notes come from a MIDI when one is loaded, otherwise from the audio analysis.
import { S, segLen, barDur } from '../state.js';
import { ctx, W, H, u, cx, spaced, MONO } from '../render/canvas.js';
import { waveStrip, SAFE_TOP } from '../render/hud.js';
import { clamp, mod, TAU, hsh, pad, fmtT, titleCase } from '../util.js';

const HEL = '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif';
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'], SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const PALS = {
  linen:    { bg: '#ecebe6', rest: 'rgba(27,26,24,0.32)', ink: '#1b1a18', ghost: 'rgba(27,26,24,0.05)', mute: '#8a867e', accent: '#b5452f', wood: 'rgba(27,26,24,0.028)' },
  graphite: { bg: '#101012', rest: 'rgba(238,234,226,0.28)', ink: '#eeeae2', ghost: 'rgba(238,234,226,0.055)', mute: '#7d7a74', accent: '#e0603f', wood: 'rgba(238,234,226,0.022)' }
};
const pcDist = (a, b) => { const d = Math.abs(a - b) % 12; return Math.min(d, 12 - d); };

const STRINGS = {
  id: 'strings', name: 'Strings',
  defaults: { pal: 'linen', sustain: 1, swing: 1, labels: 'on' },
  controls: [
    { key: 'sustain', label: 'Ring', type: 'range', min: 0.4, max: 2, step: 0.01, format: v => v.toFixed(2) + '×' },
    { key: 'swing', label: 'Swing', type: 'range', min: 0.4, max: 1.4, step: 0.01, format: v => v.toFixed(2) + '×' },
    { key: 'labels', label: 'Note names', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'pal', label: 'Colour', type: 'choice', options: [['linen', 'linen'], ['graphite', 'graphite']] }
  ],
  setup() {},
  prepare(seg) {
    const flats = seg.some(o => /b/.test(o.note || '')) || /^[A-G]\s*[b♭]/.test((S.key || '').trim());
    const name = m => (flats ? FLAT : SHARP)[mod(m, 12)];
    const mids = seg.filter(o => o.type === 'mid' && o.p > 20).map(o => ({ o, m: o.mm || Math.round(69 + 12 * Math.log2(o.p / 440)) }));
    const count = {}, sum = {};
    for (const { m } of mids) { const pc = mod(m, 12); count[pc] = (count[pc] || 0) + 1; sum[pc] = (sum[pc] || 0) + m; }
    // melody strings for the notes used most, ordered by how high they're usually played
    const pcs = Object.keys(count).map(Number).sort((a, b) => count[b] - count[a]).slice(0, 5).sort((a, b) => sum[a] / count[a] - sum[b] / count[b]);
    const strings = [{ kind: 'low', label: '808', w: 7, hits: [] }];
    pcs.forEach((pc, i) => strings.push({ kind: 'mid', pc, label: name(pc), w: 4.4 - i * 0.45, hits: [] }));
    strings.push({ kind: 'high', label: 'HAT', w: 1.5, hits: [] });
    const hitOf = (o, f, d, label) => ({ rt: o.rt, s: o.s, f, d, p: 0.3 + 0.4 * hsh(o.i * 1.7 + o.rt), label });
    for (const o of seg) {
      if (o.type === 'low') strings[0].hits.push(hitOf(o, 5.5, 0.55, ''));
      else if (o.type === 'high') strings[strings.length - 1].hits.push(hitOf(o, 9, 0.16, ''));
    }
    for (const { o, m } of mids) {
      if (!pcs.length) break;
      let best = 0, bd = 99; pcs.forEach((pc, i) => { const d = pcDist(pc, mod(m, 12)); if (d < bd) { bd = d; best = i; } });
      const dur = o.dur > 0 ? o.dur : 0;
      strings[1 + best].hits.push(hitOf(o, clamp(5 + (m - 48) * 0.18, 4.5, 11), Math.max(0.7, dur * 0.8), name(m) + (Math.floor(m / 12) - 1)));
    }
    this.strings = strings;
  },

  draw(tau) {
    const P = S.strings, pal = PALS[P.pal] || PALS.linen, sl = segLen(), bd = barDur();
    if (!this.strings) this.prepare(S.seg || []);
    const strs = this.strings, n = strs.length;
    const y0 = H * 0.215, y1 = H * 0.63, L = y1 - y0, xL = W * 0.13, xR = W * 0.87, gap = (xR - xL) / Math.max(1, n - 1);
    const maxA = gap * 0.42 * P.swing, segs = 90;

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    // the body: a sound hole with its rings, and the two bridges
    const hy = y0 + L * 0.62;
    ctx.strokeStyle = pal.wood; for (let k = 0; k < 4; k++) { ctx.lineWidth = (k ? 2 : 10) * u; ctx.beginPath(); ctx.arc(cx, hy, W * (0.25 + k * 0.03), 0, TAU); ctx.stroke(); }
    ctx.fillStyle = pal.wood; ctx.beginPath(); ctx.arc(cx, hy, W * 0.22, 0, TAU); ctx.fill();
    ctx.fillStyle = pal.ink; ctx.fillRect(xL - gap * 0.4, y0 - 7 * u, xR - xL + gap * 0.8, 7 * u); ctx.fillRect(xL - gap * 0.4, y1, xR - xL + gap * 0.8, 7 * u);

    strs.forEach((st, i) => {
      const x = xL + i * gap, tauK = P.sustain;
      // the plucks still ringing on this string
      const live = [];
      for (const h of st.hits) { const age = mod(tau - h.rt, sl), d = h.d * tauK; if (age < d * 5) live.push({ h, age, d }); }
      const disp = new Float32Array(segs + 1), env = new Float32Array(segs + 1);
      for (const { h, age, d } of live) {
        const A = maxA * h.s * (1 - Math.exp(-age / 0.008));
        for (let mode = 1; mode <= 4; mode++) {
          const c = Math.sin(mode * Math.PI * h.p) / (mode * mode), dec = Math.exp(-age * mode / d);
          const osc = Math.cos(TAU * h.f * mode * age), amp = A * c * dec;
          for (let k = 0; k <= segs; k++) { const sv = Math.sin(mode * Math.PI * k / segs); disp[k] += amp * osc * sv; env[k] += Math.abs(amp * sv); }
        }
      }
      const energy = env.reduce((a, b) => Math.max(a, b), 0) / Math.max(1, maxA);
      // the shape it sweeps while it rings
      if (energy > 0.01) {
        ctx.fillStyle = pal.ghost; ctx.beginPath();
        for (let k = 0; k <= segs; k++) ctx.lineTo(x + env[k], y0 + L * k / segs);
        for (let k = segs; k >= 0; k--) ctx.lineTo(x - env[k], y0 + L * k / segs);
        ctx.fill();
      }
      // the string
      ctx.strokeStyle = energy > 0.01 ? pal.ink : pal.rest; ctx.globalAlpha = energy > 0.01 ? clamp(0.35 + energy * 1.6, 0.35, 1) : 1;
      ctx.lineWidth = st.w * u; ctx.lineCap = 'butt'; ctx.beginPath();
      for (let k = 0; k <= segs; k++) { const y = y0 + L * k / segs; k ? ctx.lineTo(x + disp[k], y) : ctx.moveTo(x + disp[k], y); }
      ctx.stroke(); ctx.globalAlpha = 1;
      // where it was plucked: a small mark that fades
      for (const { h, age } of live) {
        if (age > 0.5) continue;
        const k = 1 - age / 0.5, py = y0 + L * h.p;
        ctx.strokeStyle = pal.accent; ctx.globalAlpha = k * 0.8; ctx.lineWidth = 2 * u;
        ctx.beginPath(); ctx.arc(x, py, (8 + 22 * (1 - k)) * u, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
        if (P.labels === 'on' && h.label) {
          ctx.globalAlpha = Math.min(1, age / 0.05) * k; ctx.font = `600 ${20 * u}px ${HEL}`; ctx.fillStyle = pal.ink;
          ctx.textAlign = i < n / 2 ? 'left' : 'right'; ctx.textBaseline = 'middle';
          ctx.fillText(h.label, x + (i < n / 2 ? 18 : -18) * u, py - 4 * u - (1 - k) * 10 * u); ctx.globalAlpha = 1;
        }
      }
      // pegs and names
      ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(x, y0 - 26 * u, 7 * u, 0, TAU); ctx.fill();
      ctx.font = `${st.kind === 'mid' ? 700 : 400} ${(st.kind === 'mid' ? 22 : 14) * u}px ${st.kind === 'mid' ? HEL : MONO}`;
      ctx.fillStyle = energy > 0.05 ? pal.ink : pal.mute; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(st.label, x, y1 + 46 * u);
    });

    // header and footer
    const mx = W * 0.075;
    const title = titleCase(S.title || ''); let ts = 60 * u; ctx.font = `700 ${ts}px ${HEL}`;
    const tw = ctx.measureText(title).width; if (tw > W - 2 * mx) { ts *= (W - 2 * mx) / tw; ctx.font = `700 ${ts}px ${HEL}`; }
    ctx.fillStyle = pal.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(title, mx, H * SAFE_TOP);
    ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced([(S.tag || '').toUpperCase(), `${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('   ·   '), mx, H * SAFE_TOP + 34 * u, 2 * u, 'left');
    waveStrip(tau, { x: mx, y: y1 + 84 * u, w: W - 2 * mx, ink: pal.ink, dim: pal.rest, mute: pal.mute, head: pal.accent });
  }
};

export default STRINGS;
