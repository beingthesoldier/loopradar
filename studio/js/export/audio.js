// The sound of an export: rendering the section, encoding it, getting it into the MP4 intact, and checking
// the finished file.
//
// Encoders don't all hand out what the spec says. Safari 26's AAC encoder gives a broken decoder description
// (WebKit bug 302253: an esds payload instead of an AudioSpecificConfig), and an MP4 built from it plays
// silent. So for AAC the description is always written here from what we asked the encoder for, ADTS headers
// are stripped if an encoder adds them, and a missing chunk duration falls back to one AAC frame.
import { S, segStart, segLen } from '../state.js';

// the section's audio, repeated, at the export's sample rate and in stereo. It runs a little past the
// last repeat when the frame count rounds up, and that tail is the start of the next repeat, as on a loop.
export async function sectionAudio(sr, seconds) {
  const n = Math.round(seconds * sr), sl = segLen(), st = segStart(), buf = S.buffer;
  const oc = new OfflineAudioContext(2, n, sr);
  const lead = Math.max(0, -st), from = Math.max(0, st), len = Math.min(sl - lead, buf.duration - from);
  for (let k = 0; k * sl < seconds; k++) {
    if (len <= 0) break;
    const src = oc.createBufferSource(); src.buffer = buf; src.connect(oc.destination);
    src.start(k * sl + lead, from, len);
  }
  const out = await oc.startRendering();
  return [out.getChannelData(0), out.getChannelData(1)];
}

export function feedAudio(enc, [L, R], sr) {
  for (let s = 0; s < L.length; s += sr) {
    const m = Math.min(sr, L.length - s), data = new Float32Array(m * 2);
    data.set(L.subarray(s, s + m), 0); data.set(R.subarray(s, s + m), m);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round(s * 1e6 / sr), data });
    enc.encode(ad); ad.close();
  }
}

/* ---------------- into the MP4 ---------------- */
const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
// AudioSpecificConfig for AAC LC: object type 2, sample rate index, channel count
export function aacConfig(sampleRate, channels) {
  const f = AAC_RATES.indexOf(sampleRate);
  if (f < 0) throw new Error(`AAC can't use ${sampleRate} Hz`);
  return new Uint8Array([(2 << 3) | (f >> 1), ((f & 1) << 7) | (channels << 3)]);
}
const isAdts = d => d.length > 7 && d[0] === 0xff && (d[1] & 0xf6) === 0xf0;
const adtsHeader = d => (d[1] & 1) ? 7 : 9;   // 9 when a CRC follows

// what the audio encoder's output callback should be: hands each chunk to the muxer, repaired where needed
export function audioSink(muxer, { kind, sampleRate, channels }) {
  const frameUs = kind === 'aac' ? 1024 * 1e6 / sampleRate : 20000;
  const fixed = kind === 'aac' ? { codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, description: aacConfig(sampleRate, channels) } : null;
  let first = true, adts = false, base = 0;
  return (chunk, meta) => {
    let data = new Uint8Array(chunk.byteLength); chunk.copyTo(data);
    if (first) { adts = kind === 'aac' && isAdts(data); base = Math.min(0, chunk.timestamp); }
    if (adts && isAdts(data)) data = data.subarray(adtsHeader(data));
    const m = first && fixed ? { ...(meta || {}), decoderConfig: { ...((meta && meta.decoderConfig) || {}), ...fixed } } : meta;
    first = false;
    muxer.addAudioChunkRaw(data, chunk.type, chunk.timestamp - base, chunk.duration > 0 ? chunk.duration : frameUs, m);
  };
}

/* ---------------- measuring ---------------- */
// the lag at which y best matches x around `at` (y[at + lag + i] ≈ x[at + i]), and how well it matches (0–1)
function bestLag(x, y, at, len, lo, hi) {
  let best = -Infinity, lag = 0;
  for (let l = lo; l <= hi; l++) {
    const o = at + l; if (o < 0 || o + len > y.length) continue;
    let s = 0; for (let i = 0; i < len; i++) s += x[at + i] * y[o + i];
    if (s > best) { best = s; lag = l; }
  }
  let ex = 0, ey = 0; for (let i = 0; i < len; i++) { ex += x[at + i] ** 2; ey += (y[at + lag + i] || 0) ** 2; }
  return { lag, corr: best / Math.sqrt(ex * ey || 1) };
}

function firstChannel(d) {
  const m = d.numberOfFrames, x = new Float32Array(m);
  try { d.copyTo(x, { planeIndex: 0, format: 'f32-planar' }); return x; } catch (e) {}
  if (d.format === 'f32') { const all = new Float32Array(m * d.numberOfChannels); d.copyTo(all, { planeIndex: 0 }); for (let i = 0; i < m; i++) x[i] = all[i * d.numberOfChannels]; return x; }
  if (d.format === 's16') { const all = new Int16Array(m * d.numberOfChannels); d.copyTo(all, { planeIndex: 0 }); for (let i = 0; i < m; i++) x[i] = all[i * d.numberOfChannels] / 32768; return x; }
  return x;
}

// First guess at how many samples the encoder puts in front of the sound (AAC "priming"): a noise burst goes
// through this exact encoder and back through the decoder. 0 when it can't be measured with confidence.
export async function measureDelay(cfg) {
  if (!window.AudioDecoder) return 0;
  const sr = cfg.sampleRate, n = 24576, at = 4096, len = 8192, sig = new Float32Array(n);
  let seed = 12345;
  for (let i = 0; i < len; i++) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; sig[at + i] = (seed / 4294967296 * 2 - 1) * 0.5 * Math.sin(Math.PI * i / len) ** 2; }
  const chunks = []; let dcfg = null;
  try {
    const enc = new AudioEncoder({
      output: (ch, meta) => { if (meta && meta.decoderConfig) dcfg = meta.decoderConfig; const b = new Uint8Array(ch.byteLength); ch.copyTo(b); chunks.push({ type: ch.type, timestamp: ch.timestamp, duration: ch.duration || undefined, data: b }); },
      error: () => {}
    });
    enc.configure(cfg); feedAudio(enc, [sig, sig], sr); await enc.flush(); enc.close();
    if (!chunks.length) return 0;
    const parts = [];
    const dec = new AudioDecoder({ output: d => { parts.push(firstChannel(d)); d.close(); }, error: () => {} });
    dec.configure({ codec: cfg.codec, sampleRate: sr, numberOfChannels: 2, ...(dcfg || {}) });
    for (const c of chunks) dec.decode(new EncodedAudioChunk(c));
    await dec.flush(); dec.close();
    const y = new Float32Array(parts.reduce((s, p) => s + p.length, 0)); let o = 0; for (const p of parts) { y.set(p, o); o += p.length; }
    const { lag, corr } = bestLag(sig, y, at, len, 0, 4096);
    return corr > 0.5 ? lag : 0;
  } catch (e) { return 0; }
}

// Reads the sound back out of the finished file the way this browser plays it, and compares it with what
// went in: is it there at all, and how far off is it (samples, + = late). `ref` is the left channel fed to the encoder.
export async function checkFile(buf, ref, sr) {
  let y;
  try { y = (await new OfflineAudioContext(2, 1, sr).decodeAudioData(buf.slice(0))).getChannelData(0); }
  catch (e) { return { readable: false }; }
  const n = Math.min(y.length, ref.length);
  let er = 0, ey = 0; for (let i = 0; i < n; i++) { er += ref[i] ** 2; ey += y[i] ** 2; }
  if (er / Math.max(1, n) < 1e-8) return { readable: true, silent: false, lag: null };   // the beat itself is silent here
  if (ey < er * 0.01) return { readable: true, silent: true };
  const len = 16384, M = 4096; let at = M, top = -1;   // line them up on the loudest stretch of the first seconds
  for (let s = M; s + len + M < Math.min(n, sr * 4); s += 2048) { let e = 0; for (let i = 0; i < len; i += 4) e += ref[s + i] ** 2; if (e > top) { top = e; at = s; } }
  const { lag, corr } = bestLag(ref, y, at, len, -M, M);
  return { readable: true, silent: false, lag: corr > 0.5 ? lag : null, corr };
}
