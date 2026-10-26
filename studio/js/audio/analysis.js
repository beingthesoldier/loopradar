// Reads the beat: FFT frames, loudness, three bands of hits (808/kick, melody, hats) and a pitch estimate per hit.
import { S, status } from '../state.js';
import { clamp, mod, pct } from '../util.js';

export function makeFFT(N) {
  const lev = Math.log2(N), rev = new Uint32Array(N);
  for (let i = 0; i < N; i++) { let r = 0, x = i; for (let b = 0; b < lev; b++) { r = (r << 1) | (x & 1); x >>= 1; } rev[i] = r; }
  const cs = new Float64Array(N / 2), sn = new Float64Array(N / 2);
  for (let i = 0; i < N / 2; i++) { cs[i] = Math.cos(2 * Math.PI * i / N); sn[i] = -Math.sin(2 * Math.PI * i / N); }
  const re = new Float64Array(N), im = new Float64Array(N);
  return (input, mag) => {
    for (let i = 0; i < N; i++) { re[rev[i]] = input[i]; im[rev[i]] = 0; }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const a = i + j, b = a + half;
          const tr = re[b] * cs[k] - im[b] * sn[k];
          const ti = re[b] * sn[k] + im[b] * cs[k];
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        }
      }
    }
    for (let i = 0; i < N / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]);
  };
}
export const hann = N => { const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); return w; };

/* ---------------- analysis ---------------- */
export async function analyze(buf) {
  const sr = buf.sampleRate, len = buf.length, ch = buf.numberOfChannels;
  const mono = new Float32Array(len);
  for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) mono[i] += d[i] / ch; }
  const dec = sr >= 88200 ? 4 : sr >= 44100 ? 2 : 1;
  const n = Math.floor(len / dec), s = new Float32Array(n);
  for (let i = 0; i < n; i++) { let a = 0; for (let k = 0; k < dec; k++) a += mono[i * dec + k]; s[i] = a / dec; }
  const fsr = sr / dec, N = 1024, hop = 256, nF = Math.max(1, Math.floor((n - N) / hop) + 1);
  const fft = makeFFT(N), win = hann(N), frame = new Float32Array(N), mag = new Float32Array(N / 2), prev = new Float32Array(N / 2);
  const binHz = fsr / N, bLow = Math.round(150 / binHz), bMid = Math.round(2000 / binHz);
  const rms = new Float32Array(nF), low = new Float32Array(nF), high = new Float32Array(nF);
  const fluxL = new Float32Array(nF), fluxM = new Float32Array(nF), fluxH = new Float32Array(nF), centH = new Float32Array(nF);
  for (let f = 0; f < nF; f++) {
    const i0 = f * hop; let sq = 0;
    for (let i = 0; i < N; i++) { const v = s[i0 + i]; sq += v * v; frame[i] = v * win[i]; }
    rms[f] = Math.sqrt(sq / N);
    fft(frame, mag);
    let eL = 0, eH = 0, fL = 0, fM = 0, fH = 0, cn = 0;
    for (let k = 1; k < N / 2; k++) {
      const m = mag[k] / (N / 4), e = m * m;
      const lg = Math.log1p(100 * m), d = lg - prev[k]; prev[k] = lg;
      if (k < bLow) { eL += e; if (d > 0) fL += d; }
      else if (k < bMid) { if (d > 0) fM += d; }
      else { eH += e; if (d > 0) { fH += d; cn += d * k * binHz; } }
    }
    low[f] = eL; high[f] = eH; fluxL[f] = fL; fluxM[f] = fM; fluxH[f] = fH; centH[f] = fH > 0 ? cn / fH : 4000;
    if (f % 500 === 0) { status('analyzing beat ' + Math.round(100 * f / nF) + '%', 'busy'); await new Promise(r => setTimeout(r, 0)); }
  }
  for (const a of [fluxL, fluxM, fluxH]) { const p = pct(a, 0.995) || 1; for (let f = 0; f < nF; f++) a[f] /= p; }
  const rmsDb = new Float32Array(nF); for (let f = 0; f < nF; f++) rmsDb[f] = Math.min(0, 20 * Math.log10(rms[f] + 1e-9));
  const top = pct(rmsDb, 0.99), rmsN = new Float32Array(nF);
  for (let f = 0; f < nF; f++) rmsN[f] = clamp((rmsDb[f] - (top - 30)) / 30, 0, 1);
  const pL = Math.sqrt(pct(low, 0.98)), pH = Math.sqrt(pct(high, 0.98)), lowS = new Float32Array(nF), highN = new Float32Array(nF);
  let env = 0;
  for (let f = 0; f < nF; f++) {
    const v = clamp(Math.sqrt(low[f]) / pL, 0, 1.2); env = v > env ? env + (v - env) * 0.7 : env * 0.86 + v * 0.14; lowS[f] = env;
    highN[f] = clamp(Math.sqrt(high[f]) / pH, 0, 1.2);
  }
  // slow, symmetric envelope (forward + backward pass): the "breathing" of the track, no lag
  const slow = new Float32Array(nF), a = Math.exp(-1 / (0.35 * fsr / hop));
  let y = rmsN[0]; for (let f = 0; f < nF; f++) { y = a * y + (1 - a) * rmsN[f]; slow[f] = y; }
  y = slow[nF - 1]; for (let f = nF - 1; f >= 0; f--) { y = a * y + (1 - a) * slow[f]; slow[f] = y; }
  const sp = pct(slow, 0.98) || 1; for (let f = 0; f < nF; f++) slow[f] = clamp(slow[f] / sp, 0, 1);
  return { s, fsr, hop, N, nF, frameRate: fsr / hop, dur: len / sr, rmsDb, rmsN, lowS, highN, slow, fluxL, fluxM, fluxH, centH, fmax: Math.min(12000, fsr / 2) };
}

const fft8 = makeFFT(8192), win8 = hann(8192), buf8 = new Float32Array(8192), mag8 = new Float32Array(4096);
export function pitchAt(A, f, type) {
  const st = f * A.hop + Math.round(0.015 * A.fsr);
  for (let i = 0; i < 8192; i++) buf8[i] = (A.s[st + i] || 0) * win8[i];
  fft8(buf8, mag8);
  const hz = A.fsr / 8192, lo = Math.floor((type === 'low' ? 38 : 110) / hz), hi = Math.ceil((type === 'low' ? 160 : 1800) / hz);
  let bi = lo, bv = 0; for (let k = lo; k <= hi; k++) if (mag8[k] > bv) { bv = mag8[k]; bi = k; }
  const a = mag8[bi - 1] || 0, b = mag8[bi], c = mag8[bi + 1] || 0, den = a - 2 * b + c;
  const off = den !== 0 ? 0.5 * (a - c) / den : 0;
  return (bi + off) * hz;
}
const SH = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FL = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
function useFlats() {
  const k = S.key.trim().toUpperCase(), m = k.match(/^([A-G])(#|B)?/); if (!m) return false;
  const root = m[1] + (m[2] === 'B' ? 'b' : m[2] || ''), minor = /M(IN)?\b|MINOR|^[A-G][#B]?M$/.test(k.replace(/\s+/g, '')) && !/MAJ/.test(k);
  if (/b$/.test(root)) return true;
  return minor ? ['D', 'G', 'C', 'F'].includes(root) : root === 'F';
}
export function noteName(f) {
  if (!(f > 20)) return '';
  const m = Math.round(69 + 12 * Math.log2(f / 440)); const names = useFlats() ? FL : SH;
  return names[mod(m, 12)] + (Math.floor(m / 12) - 1);
}
