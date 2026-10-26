// SEISMO: the beat written by a seismograph. Three pens on a strip of chart paper that runs past them:
// SUB (kick and 808), MELODY and HATS. Every hit is a spike that rings out like a tremor: the kick a big
// slow swing, the hats a short fine shiver, and a melody note rings faster the higher it is, with its name
// stamped over the peak. Under the hits, each pen trembles with the loudness of its band.
// Time is the paper: the pens write at the right, the record runs off to the left. Everything is worked
// out from the time alone (hit ages wrap round the section), so the video loops without a seam.
import { S, segLen, segStart, barDur } from '../state.js';
import { ctx, W, H, u, cx, spaced, MONO } from '../render/canvas.js';
import { clamp, mod, TAU, pad, fmtT, titleCase } from '../util.js';

const HEL = '"Helvetica Neue", Helvetica, Inter, Arial, sans-serif';
const PALS = {
  carbon: { bg: '#0d0d0c', paper: '#151513', ink: '#ece7dc', faint: 'rgba(236,231,220,0.07)', mid: 'rgba(236,231,220,0.16)', mute: '#8a857b', red: '#e5482f' },
  paper:  { bg: '#e7e1d4', paper: '#f2ede2', ink: '#1b1a18', faint: 'rgba(27,26,24,0.07)', mid: 'rgba(27,26,24,0.17)', mute: '#857f74', red: '#c8352a' }
};
const SPEEDS = { slow: 0.3, normal: 0.45, fast: 0.7 };   // paper speed, frame widths a second
// how each pen rings after a hit: frequency (Hz), decay (s), height (share of the row)
const RING = { low: { f: 7, d: 0.22, a: 1 }, mid: { f: 12, d: 0.14, a: 0.8 }, high: { f: 34, d: 0.045, a: 0.55 } };
const ROWS = [['low', 'SUB · 808 · KICK'], ['mid', 'MELODY'], ['high', 'HATS · PERC']];
const FLAT = ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'], SHARP = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

const SEISMO = {
  id: 'seismo', name: 'Seismograph',
  defaults: { pal: 'carbon', speed: 'normal', gain: 1, notes: 'on' },
  controls: [
    { key: 'speed', label: 'Paper speed', type: 'choice', options: [['slow', 'slow'], ['normal', 'normal'], ['fast', 'fast']] },
    { key: 'gain', label: 'Gain', type: 'range', min: 0.4, max: 1.6, step: 0.01, format: v => v.toFixed(2) + '×' },
    { key: 'notes', label: 'Note names', type: 'choice', options: [['on', 'on'], ['off', 'off']] },
    { key: 'pal', label: 'Paper', type: 'choice', options: [['carbon', 'carbon'], ['paper', 'paper']] }
  ],
  setup() {},
  prepare(seg) {
    const flats = seg.some(o => /b/.test(o.note || '')) || /^[A-G]\s*[b♭]/.test((S.key || '').trim());
    this.by = { low: [], mid: [], high: [] };
    for (const o of seg) {
      if (!this.by[o.type]) continue;
      const h = { rt: o.rt, s: o.s, f: RING[o.type].f, label: '' };
      if (o.type === 'mid' && o.p > 20) {
        const m = o.mm || Math.round(69 + 12 * Math.log2(o.p / 440));
        h.f = clamp(8 + (m - 48) * 0.45, 7, 26);   // higher notes ring faster
        h.label = (flats ? FLAT : SHARP)[mod(m, 12)] + (Math.floor(m / 12) - 1);
      }
      this.by[o.type].push(h);
    }
  },

  // the pen's swing at time t (seconds into the section, any value: it wraps)
  trace(type, t, sl, gain) {
    const R = RING[type]; let y = 0;
    for (const h of this.by[type]) {
      const age = mod(t - h.rt, sl); if (age > R.d * 7) continue;
      y += h.s * Math.exp(-age / R.d) * Math.sin(TAU * h.f * age) * (1 - Math.exp(-age / 0.004));
    }
    // a tremble under it all, as loud as the band; frequencies fit the section so it repeats exactly
    const A = S.A;
    if (A) {
      const tm = mod(t, sl), fi = clamp(Math.round((segStart() + tm) * A.frameRate), 0, A.nF - 1);
      const env = type === 'low' ? A.lowS[fi] : type === 'high' ? A.highN[fi] : A.rmsN[fi];
      const q = f => Math.max(1, Math.round(f * sl)) / sl;
      y += env * (type === 'low' ? 0.035 : 0.06) * (Math.sin(TAU * q(23) * tm) + 0.6 * Math.sin(TAU * q(41) * tm + 1.7) + 0.35 * Math.sin(TAU * q(67) * tm + 0.4));
    }
    return y * R.a * gain;
  },

  draw(tau, F) {
    const P = S.seismo, pal = PALS[P.pal] || PALS.carbon, sl = segLen(), bd = barDur();
    if (!this.by) this.prepare(S.seg || []);
    const v = (SPEEDS[P.speed] || SPEEDS.normal) * W, penX = W * 0.8, x0 = W * 0.06;
    const top = H * 0.155, bot = H * 0.655, rowH = (bot - top) / 3;

    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = pal.bg; ctx.fillRect(0, 0, W, H);
    // the paper strip with its grid: a line every sixteenth, stronger every beat, strongest every bar
    ctx.fillStyle = pal.paper; ctx.fillRect(0, top - 26 * u, W, bot - top + 52 * u);
    const tAt = x => tau - (penX - x) / v, xAt = t => penX - (tau - t) * v;
    const sixteenth = bd / 16, firstK = Math.ceil(tAt(0) / sixteenth), lastK = Math.floor(tAt(W) / sixteenth);
    for (let k = firstK; k <= lastK; k++) {
      const x = xAt(k * sixteenth), kk = mod(k, 16);
      ctx.fillStyle = kk === 0 ? pal.mid : kk % 4 === 0 ? pal.faint : pal.faint; ctx.globalAlpha = kk === 0 ? 1 : kk % 4 === 0 ? 1 : 0.45;
      ctx.fillRect(x - (kk === 0 ? 1 : 0.5) * u, top - 10 * u, (kk === 0 ? 2 : 1) * u, bot - top + 20 * u);
      if (kk === 0) {   // the bar number printed on the paper
        const bar = mod(Math.round(k / 16), S.lenBars) + 1;
        ctx.globalAlpha = 1; ctx.font = `400 ${14 * u}px ${MONO}`; ctx.fillStyle = pal.mute; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(pad(S.startBar + bar, 2), x + 6 * u, top - 12 * u);
      }
    }
    ctx.globalAlpha = 1;
    for (let r = 0; r <= 3; r++) { ctx.fillStyle = pal.faint; ctx.fillRect(0, top + r * rowH - 0.5 * u, W, 1 * u); }
    // sprocket holes along both edges, running with the paper
    // (spaced in time, an eighth of a beat apart, so they repeat with the section)
    const hstep = bd / 32;
    ctx.fillStyle = pal.bg;
    for (let k = Math.ceil(tAt(0) / hstep); k <= Math.floor(tAt(W) / hstep); k++) { const x = xAt(k * hstep); for (const y of [top - 18 * u, bot + 18 * u]) { ctx.beginPath(); ctx.arc(x, y, 4 * u, 0, TAU); ctx.fill(); } }

    // the three records
    const gain = P.gain, step = 2 * u;
    ROWS.forEach(([type, name], r) => {
      const cy = top + rowH * (r + 0.5), amp = rowH * 0.42;
      ctx.fillStyle = pal.mid; ctx.fillRect(x0, cy - 0.5 * u, penX - x0, 1 * u);   // the baseline
      ctx.font = `400 ${14 * u}px ${MONO}`; ctx.fillStyle = pal.mute; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      spaced(name, x0, top + rowH * r + 24 * u, 2 * u, 'left');
      const gr = ctx.createLinearGradient(x0, 0, penX, 0); gr.addColorStop(0, pal.ink + '00'); gr.addColorStop(0.3, pal.ink + 'aa'); gr.addColorStop(1, pal.ink);
      ctx.strokeStyle = gr; ctx.lineWidth = (type === 'low' ? 2.4 : type === 'mid' ? 2 : 1.6) * u; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath();
      for (let x = x0; x <= penX + 0.01; x += step) { const y = cy - clamp(this.trace(type, tAt(x), sl, gain), -1.15, 1.15) * amp; x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
      ctx.stroke();
      // stamps on the record: a red tick for every kick-sized hit, the note's name over every melody peak
      for (const h of this.by[type]) {
        {
          const x = penX - mod(tau - h.rt, sl) * v; if (x < x0 || x > penX) continue;
          if (type === 'low' && h.s > 0.45) { ctx.fillStyle = pal.red; ctx.beginPath(); ctx.moveTo(x, top + rowH * r + 34 * u); ctx.lineTo(x - 5 * u, top + rowH * r + 26 * u); ctx.lineTo(x + 5 * u, top + rowH * r + 26 * u); ctx.fill(); }
          if (type === 'mid' && h.label && P.notes === 'on') {
            const fade = clamp((x - x0) / (W * 0.18), 0, 1);
            ctx.globalAlpha = fade; ctx.font = `600 ${18 * u}px ${HEL}`; ctx.fillStyle = pal.ink; ctx.textAlign = 'center';
            ctx.fillText(h.label, x + 0.25 / h.f * v, cy - amp * 0.95 - 8 * u); ctx.globalAlpha = 1;
          }
        }
      }
      // the pen: an arm from the right, the tip on the paper, red ink
      const yp = cy - clamp(this.trace(type, tau, sl, gain), -1.15, 1.15) * amp;
      ctx.strokeStyle = pal.mute; ctx.lineWidth = 2 * u; ctx.beginPath(); ctx.moveTo(W + 10 * u, cy - rowH * 0.32); ctx.lineTo(penX + 6 * u, yp); ctx.stroke();
      ctx.fillStyle = pal.ink; ctx.beginPath(); ctx.arc(penX + 6 * u, yp, 6 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = pal.red; ctx.beginPath(); ctx.arc(penX, yp, 3.5 * u, 0, TAU); ctx.fill();
    });
    // the line under the pens: now
    ctx.fillStyle = pal.red; ctx.globalAlpha = 0.5; ctx.fillRect(penX - 0.5 * u, top - 10 * u, 1 * u, bot - top + 20 * u); ctx.globalAlpha = 1;

    // header
    const mx = W * 0.06;
    const title = titleCase(S.title || ''); let ts = 60 * u; ctx.font = `700 ${ts}px ${HEL}`;
    const tw = ctx.measureText(title).width; if (tw > W - 2 * mx) { ts *= (W - 2 * mx) / tw; ctx.font = `700 ${ts}px ${HEL}`; }
    ctx.fillStyle = pal.ink; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(title, mx, H * 0.075);
    ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced([`STATION ${(S.tag || '').replace(/^PROD\.?\s*/i, '').toUpperCase() || 'LR'}`, `${+S.bpm.toFixed(2)} BPM`, (S.key || '').toUpperCase()].filter(Boolean).join('   ·   '), mx, H * 0.075 + 34 * u, 2 * u, 'left');

    // readouts under the paper: magnitude from the loudness, the strongest swing this bar, time
    const yR = bot + 82 * u, mag = 1 + 8 * (F ? F.rmsN : 0);
    let hits = 0; for (const k of ['low', 'mid', 'high']) for (const h of this.by[k]) if (mod(tau - h.rt, sl) < bd) hits++;
    ctx.font = `400 ${14 * u}px ${MONO}`; ctx.fillStyle = pal.mute; ctx.textAlign = 'left';
    spaced('MAGNITUDE', mx, yR, 2.5 * u, 'left'); spaced('TREMORS, LAST BAR', W * 0.42, yR, 2.5 * u, 'left');
    ctx.font = `700 ${62 * u}px ${HEL}`; ctx.fillStyle = pal.ink;
    ctx.fillText(mag.toFixed(1), mx, yR + 64 * u); ctx.fillText(String(hits), W * 0.42, yR + 64 * u);
    ctx.fillStyle = pal.red; ctx.fillRect(mx, yR + 84 * u, (W - 2 * mx) * clamp((mag - 1) / 8, 0, 1), 3 * u);
    ctx.fillStyle = pal.faint; ctx.fillRect(mx, yR + 84 * u, W - 2 * mx, 3 * u);
    const bar = S.startBar + Math.floor(tau / bd) + 1, beat = Math.floor(mod(tau, bd) / (bd / 4)) + 1;
    ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = pal.mute;
    spaced(fmtT(tau), mx, yR + 122 * u, 1.5 * u, 'left');
    spaced(`BAR ${pad(bar, 2)}.${beat} / ${pad(S.startBar + S.lenBars, 2)}`, W - mx, yR + 122 * u, 1.5 * u, 'right');
  }
};

export default SEISMO;
