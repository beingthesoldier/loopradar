// The video frame and the drawing helpers every preset uses.
// W, H, u, cx are live bindings: after sizeCanvas() every importer sees the new values.
import { S } from '../state.js';
import { $ } from '../util.js';

export const cv = $('cv');
export const ctx = cv.getContext('2d');
export let W = 1080, H = 1920, u = 0.88, cx = 540;

export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
export const DISP = 'Michroma, "Eurostile", "Arial Black", sans-serif';
export const SFP = '"SF Pro Display", -apple-system, BlinkMacSystemFont, system-ui, Inter, "Helvetica Neue", Arial, sans-serif';

let grains = [];
export function sizeCanvas() {
  W = S.res; H = Math.round(W * 16 / 9); u = W / 1080 * 0.88; cx = W / 2;
  cv.width = W; cv.height = H;
  grains = [];
  for (let k = 0; k < 4; k++) {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'), im = g.createImageData(256, 256);
    for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
    g.putImageData(im, 0, 0); grains.push(ctx.createPattern(c, 'repeat'));
  }
}
export function grain(a) { ctx.globalAlpha = a; ctx.fillStyle = grains[S.frame % grains.length]; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }

// text with manual letter spacing (canvas letterSpacing isn't everywhere yet)
export function spaced(text, x, y, sp, align) {
  const chars = [...text]; let w = 0; const ws = chars.map(ch => { const m = ctx.measureText(ch).width; w += m + sp; return m; }); w -= sp;
  let sx = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.textAlign = 'left'; chars.forEach((ch, i) => { ctx.fillText(ch, sx, y); sx += ws[i] + sp; });
  return w;
}
