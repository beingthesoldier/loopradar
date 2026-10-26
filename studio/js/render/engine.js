// Sizing the frame and drawing one frame of the current preset at time tau (seconds into the section).
import { S, segStart } from '../state.js';
import { clamp } from '../util.js';
import { ctx, sizeCanvas } from './canvas.js';
import { PRESETS, current } from '../presets/index.js';

export function setupCanvas() {
  sizeCanvas();
  for (const p of Object.values(PRESETS)) p.setup();
}

// what the music is doing at tau, in the shape every preset reads
export function features(tau) {
  const A = S.A, F = { rmsN: 0, low: 0, high: 0, slow: 0.4, db: -60 };
  if (A) {
    const fi = clamp(Math.round((segStart() + tau) * A.frameRate), 0, A.nF - 1);
    F.rmsN = A.rmsN[fi]; F.low = Math.min(1, A.lowS[fi]); F.high = Math.min(1, A.highN[fi]); F.slow = A.slow[fi]; F.db = A.rmsDb[fi];
  }
  return F;
}

export function render(tau) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  current().draw(tau, features(tau));
}
