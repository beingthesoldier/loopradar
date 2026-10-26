// Frame-by-frame export. Every frame is drawn at its exact moment of the section and encoded with WebCodecs;
// the sound is encoded straight from the decoded beat; both go into one MP4 (mp4-muxer, vendored).
// Nothing here runs in real time: the picture and the sound line up to the sample, no frame is ever dropped,
// and a heavy preset only makes the export take longer.
import { S, segLen, status } from '../state.js';
import { $, mod, fmtT } from '../util.js';
import { cv, W, H } from '../render/canvas.js';
import { render } from '../render/engine.js';
import { pause } from '../audio/transport.js';
import { Muxer, ArrayBufferTarget } from '../vendor/mp4-muxer.mjs';
import { addAudioEdit } from './mp4edit.js';
import { sectionAudio, feedAudio, audioSink, measureDelay, checkFile } from './audio.js';
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
    let delay = opts.delay ?? await measureDelay(acfg);

    let fail = null;
    const muxer = new Muxer({
      target: new ArrayBufferTarget(), fastStart: false, firstTimestampBehavior: 'offset',
      video: { codec: 'avc', width: w, height: h, frameRate: fps },
      audio: { codec: a.kind, sampleRate: a.sampleRate, numberOfChannels: 2 }
    });
    ae = new AudioEncoder({ output: audioSink(muxer, { kind: a.kind, sampleRate: a.sampleRate, channels: 2 }), error: e => { fail = e; } });
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
    const raw = muxer.target.buffer, ms = Math.round(seconds * 1000);
    const withEdit = d => (d > 0 && addAudioEdit(raw, { mediaTime: d, durationMs: ms })) || raw;
    let buf = withEdit(delay);

    // read the sound back out of the file; if it lands off, move the edit list by what was measured and look again
    status('checking the sound…', 'busy');
    let check = await checkFile(buf, pcm[0], a.sampleRate);
    if (a.kind === 'aac' && opts.delay === undefined && check.lag && Math.abs(check.lag) > 24 && delay + check.lag >= 0) {
      delay += check.lag; buf = withEdit(delay);
      check = await checkFile(buf, pcm[0], a.sampleRate);
    }
    const took = (performance.now() - started) / 1000;
    const off = check.lag == null ? null : Math.round(check.lag / a.sampleRate * 1000);
    const sound = !check.readable ? "This browser couldn't read the sound back to check it, so give it a listen before posting."
      : check.silent ? "The sound didn't make it into the file in this browser. Try exporting in Chrome."
      : off == null || Math.abs(off) <= 1 ? 'Sound checked: in sync.'
      : `Sound checked: ${Math.abs(off)} ms ${off > 0 ? 'late' : 'early'}.`;
    console.info('[export]', { audio: a.kind, sampleRate: a.sampleRate, delay, check, took });
    showVideo(new Blob([buf], { type: 'video/mp4' }), {
      ext: 'mp4', seconds, fps,
      hint: a.kind === 'aac'
        ? (check.silent ? sound : `H.264 + AAC, ready to post. ${sound} Rendered frame by frame in ${took.toFixed(0)} s.`)
        : `${sound} The sound is Opus: this browser has no AAC encoder, and Instagram may refuse Opus. Chrome or Safari on a Mac give AAC.`
    });
    status(check.silent ? 'video ready, but without sound' : 'video ready', check.silent ? 'err' : 'ok');
    return { frames, seconds, delay, check, took, bytes: buf.byteLength, audio: a.kind };
  } catch (e) {
    console.error(e);
    status(`export failed: ${(e && e.message) || e}`, 'err');
  } finally {
    for (const enc of [ve, ae]) if (enc && enc.state !== 'closed') try { enc.close(); } catch (e) {}
    S.exporting = false; S.tau = 0;
    setLocked(false); rec.textContent = label; $('recProg').hidden = true;
  }
}
