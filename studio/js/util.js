// Small helpers shared by every module.
export const $ = id => document.getElementById(id);
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const mod = (a, n) => ((a % n) + n) % n;
export const TAU = Math.PI * 2;
// deterministic pseudo-random in [0,1) from any number: same input, same output, every frame
export const hsh = n => { const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return x - Math.floor(x); };
export function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${clamp(a, 0, 1)})`;
export const pad = (n, l) => String(n).padStart(l, '0');
export const fmtT = t => `${pad(Math.floor(t / 60), 2)}:${pad(Math.floor(t % 60), 2)}.${pad(Math.floor((t % 1) * 1000), 3)}`;
export function pct(arr, p) {
  const step = Math.max(1, Math.floor(arr.length / 4000)); const tmp = [];
  for (let i = 0; i < arr.length; i += step) tmp.push(arr[i]);
  tmp.sort((a, b) => a - b); return tmp[Math.min(tmp.length - 1, Math.floor(p * tmp.length))] || 1e-9;
}
export const titleCase = s => s.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase());
