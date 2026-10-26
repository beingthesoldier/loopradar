// Frame-by-frame export. Every frame is drawn at its exact moment of the section and encoded with WebCodecs;
// the sound is encoded straight from the decoded beat; both go into one MP4 (mp4-muxer, vendored).
// Nothing here runs in real time: the picture and the sound line up to the sample, no frame is ever dropped,
// and a heavy preset only makes the export take longer.
import { S, segStart, segLen, status } from '../state.js';
import { $, mod, fmtT } from '../util.js';
import { cv, W, H } from '../render/canvas.js';
import { render } from '../render/engine.js';
import { pause } from '../audio/transport.js';
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';
import { addAudioEdit } from './mp4edit.js';
import { showVideo, setLocked } from './result.js';

// H.264 High/Main/Baseline at level 4.2 (enough for 1080×1920 at 60 fps), then a couple of fallbacks
const AVC = ['avc1.64002a', 'avc1.4d002a', 'avc1.42002a', 'avc1.640033', 'avc1.640028'];
// AAC is what Instagram wants; Opus only where the browser has no AAC encoder (Linux, Firefox)
const AUDIO = [['aac', 'mp4a.40.2', 256000], ['opus', 'opus', 192000]];
const RATES = [48000, 44100];

const videoCfg = (codec, w, h, fps) => ({
  codec, width: w, height: h, framerate: fps,
  bitrate: Math.min(30e6, Math.round(w * h * fps * 0.3)),   // generous: the grain and the dither eat bits
  avc: { format: 'avc' }, latencyMode: 'quality'
});
async function supported(Enc, cfg) { try { return (await Enc.isConfigSupported(cfg)).supported; } catch (e) { return false; } }

let caps;   // undefined: not checked yet; null: can't; else { avc, audio: { kind, codec, bitrate, sampleRate } }
export async function probe() {
  if (caps !== undefined) return caps;
  caps = null;
  if (!(window.VideoEncoder && window.AudioEncoder && window.VideoFrame && window.AudioData && window.OfflineAudioContext)) return caps;
  let avc = null;
  for (const c of AVC) if (await supported(VideoEncoder, videoCfg(c, 1080, 1920, 30))) { avc = c; break; }
  if (!avc) return caps;
  for (const [kind, codec, bitrate] of AUDIO) for (const sampleRate of RATES) {
    if (await supported(AudioEncoder, { codec, sampleRate, numberOfChannels: 2, bitrate })) return (caps = { avc, audio: { kind, codec, bitrate, sampleRate } });
  }
  return caps;
}

// MessageChannel instead of setTimeout: it isn't slowed down when the tab is in the background
const tick = () => new Promise(r => { const c = new MessageChannel(); c.port1.onmessage = () => r(); c.port2.postMessage(0); });
const dequeued = enc => new Promise(r => { if ('ondequeue' in enc) enc.addEventListener('dequeue', r, { once: true }); else setTimeout(r, 4); });

// the section's audio, repeated, at the export's sample rate and in stereo. It runs a little past the
// last repeat when the frame count rounds up, and that tail is the start of the next repeat, as on a loop.
async function sectionAudio(sr, seconds) {
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

function feedAudio(enc, [L, R], sr) {
  for (let s = 0; s < L.length; s += sr) {
    const m = Math.min(sr, L.length - s), data = new Float32Array(m * 2);
    data.set(L.subarray(s, s + m), 0); data.set(R.subarray(s, s + m), m);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round(s * 1e6 / sr), data });
    enc.encode(ad); ad.close();
  }
}

function firstChannel(d) {
  const m = d.numberOfFrames, x = new Float32Array(m);
  try { d.copyTo(x, { planeIndex: 0, format: 'f32-planar' }); return x; } catch (e) {}
  if (d.format === 'f32') { const all = new Float32Array(m * d.numberOfChannels); d.copyTo(all, { planeIndex: 0 }); for (let i = 0; i < m; i++) x[i] = all[i * d.numberOfChannels]; return x; }
  if (d.format === 's16') { const all = new Int16Array(m * d.numberOfChannels); d.copyTo(all, { planeIndex: 0 }); for (let i = 0; i < m; i++) x[i] = all[i * d.numberOfChannels] / 32768; return x; }
  return x;
}

// How many samples the encoder puts in front of the sound (AAC "priming"). Measured rather than assumed,
// because it differs between encoders: a noise burst goes through this exact encoder and back through the
// decoder, and the lag of the best match is the delay. 0 when it can't be measured with confidence.
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
    let best = -Infinity, lag = 0, es = 0;
    for (let i = 0; i < len; i++) es += sig[at + i] ** 2;
    for (let l = 0; l <= 4096; l++) {
      let s = 0; for (let i = 0; i < len; i++) s += sig[at + i] * (y[at + i + l] || 0);
      if (s > best) { best = s; lag = l; }
    }
    let ey = 0; for (let i = 0; i < len; i++) ey += (y[at + i + lag] || 0) ** 2;
    const corr = best / Math.sqrt(es * ey || 1);
    return corr > 0.5 ? lag : 0;
  } catch (e) { return 0; }
}

let cancelled = false;
export const cancelFrames = () => { cancelled = true; };

export async function exportFrames(opts = {}) {
  const c = await probe();
  if (!c || !S.buffer || S.exporting || S.recording) return;
  pause(); cancelled = false; S.exporting = true;
  setLocked(true);
  const rec = $('rec'), label = rec.textContent; rec.disabled = false; rec.textContent = 'Cancel';
  $('recProg').hidden = false; $('recBar').style.width = '0%';
  const started = performance.now();
  let ve = null, ae = null;
  try {
    const fps = S.fps, sl = segLen(), frames = Math.max(1, Math.round(sl * S.loops * fps)), seconds = frames / fps, w = W, h = H;
    let vcfg = null;
    for (const codec of [c.avc, ...AVC]) if (await supported(VideoEncoder, videoCfg(codec, w, h, fps))) { vcfg = videoCfg(codec, w, h, fps); break; }
    if (!vcfg) throw new Error(`no H.264 encoder for ${w}×${h} at ${fps} fps`);

    status('preparing the sound…', 'busy');
    const a = c.audio, acfg = { codec: a.codec, sampleRate: a.sampleRate, numberOfChannels: 2, bitrate: a.bitrate };
    const pcm = await sectionAudio(a.sampleRate, seconds);
    const delay = opts.delay ?? await measureDelay(acfg);

    let fail = null;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(), fastStart: false, firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: w, height: h, frameRate: fps },
      audio: { codec: a.kind, sampleRate: a.sampleRate, numberOfChannels: 2 }
    });
    ae = new AudioEncoder({ output: (ch, meta) => muxer.addAudioChunk(ch, meta), error: e => { fail = e; } });
    ae.configure(acfg); feedAudio(ae, pcm, a.sampleRate); await ae.flush(); ae.close(); ae = null;
    if (fail) throw fail;

    ve = new VideoEncoder({ output: (ch, meta) => muxer.addVideoChunk(ch, meta), error: e => { fail = e; } });
    ve.configure(vcfg);
    const kf = fps * 2, dur = Math.round(1e6 / fps);
    for (let i = 0; i < frames && !cancelled && !fail; i++) {
      S.frame = i;
      const tau = mod(i / fps, sl);
      render(tau); $('tc').textContent = fmtT(tau);
      const vf = new VideoFrame(cv, { timestamp: Math.round(i * 1e6 / fps), duration: dur });
      ve.encode(vf, { keyFrame: i % kf === 0 }); vf.close();
      while (ve.encodeQueueSize > 2 && !fail) await dequeued(ve);
      $('recBar').style.width = ((i + 1) / frames * 100).toFixed(1) + '%';
      if (i % 10 === 0) {
        const el = (performance.now() - started) / 1000, left = i > 15 ? el / (i + 1) * (frames - i - 1) : 0;
        status(`exporting · frame ${i + 1} of ${frames}` + (left > 2 ? ` · about ${Math.ceil(left)} s left` : ''), 'rec');
      }
      await tick();
    }
    if (fail) throw fail;
    if (cancelled) { status('export cancelled', 'ok'); return; }
    status('finishing the file…', 'busy');
    await ve.flush(); ve.close(); ve = null;
    muxer.finalize();
    let buf = muxer.target.buffer;
    if (delay > 0) buf = addAudioEdit(buf, { mediaTime: delay, durationMs: Math.round(seconds * 1000) }) || buf;

    const took = (performance.now() - started) / 1000;
    showVideo(new Blob([buf], { type: 'video/mp4' }), {
      ext: 'mp4', seconds, fps,
      hint: a.kind === 'aac'
        ? `H.264 + AAC, ready to post. Rendered frame by frame in ${took.toFixed(0)} s.`
        : "The sound is Opus: this browser has no AAC encoder, and Instagram may refuse Opus. Chrome or Safari on a Mac give AAC."
    });
    status('video ready', 'ok');
    return { frames, seconds, delay, took, bytes: buf.byteLength, audio: a.kind };
  } catch (e) {
    console.error(e);
    status(`export failed: ${(e && e.message) || e}`, 'err');
  } finally {
    for (const enc of [ve, ae]) if (enc && enc.state !== 'closed') try { enc.close(); } catch (e) {}
    S.exporting = false; S.tau = 0;
    setLocked(false); rec.textContent = label; $('recProg').hidden = true;
  }
}
