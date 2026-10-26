// Pieces of the frame several presets share. The waveform strip: the section's waveform with the played
// part brighter, a tick every bar, the playhead, and the time and bar underneath. Every preset ends with
// one, so a viewer always sees where the loop is.
import { S, segLen, barDur } from '../state.js';
import { ctx, u, spaced, MONO } from './canvas.js';
import { mod, pad, fmtT } from '../util.js';

// x, y: top left; w, h: size of the waveform; ink: colour for the played part and the head; dim: the rest
export function waveStrip(tau, { x, y, w, h = 42 * u, ink, dim, mute, head }) {
  const sl = segLen(), bd = barDur(), prog = tau / sl;
  if (S.wave) {
    const nw = S.wave.length, cw = w / nw;
    for (let i = 0; i < nw; i++) {
      const bh = Math.max(1.5 * u, S.wave[i] * h);
      ctx.fillStyle = i / nw < prog ? ink : dim;
      ctx.fillRect(x + i * cw, y + (h - bh) / 2, Math.max(1, cw - 1.6 * u), bh);
    }
  }
  ctx.fillStyle = mute;
  for (let b = 0; b <= S.lenBars; b++) { const bx = x + w * b / S.lenBars; ctx.fillRect(bx - 0.6 * u, y + h + 8 * u, 1.2 * u, (b % 4 === 0 ? 10 : 6) * u); }
  ctx.fillStyle = head || ink; ctx.fillRect(x + w * prog - 1 * u, y - 8 * u, 2 * u, h + 16 * u);
  const bar = S.startBar + Math.floor(tau / bd) + 1, beat = Math.floor(mod(tau, bd) / (bd / 4)) + 1;
  ctx.font = `400 ${15 * u}px ${MONO}`; ctx.fillStyle = mute; ctx.textBaseline = 'alphabetic';
  spaced(fmtT(tau), x, y + h + 44 * u, 1.5 * u, 'left');
  spaced(`BAR ${pad(bar, 2)}.${beat} / ${pad(S.startBar + S.lenBars, 2)}`, x + w, y + h + 44 * u, 1.5 * u, 'right');
}

// Instagram's own buttons and captions sit over the top ~12% and the bottom ~20% of a Reel;
// titles start below this line and the last text ends above SAFE_BOTTOM
export const SAFE_TOP = 0.15, SAFE_BOTTOM = 0.79;
