// Playback of the section on a loop, and the clock every frame reads its time from.
import { S, segStart, segLen } from '../state.js';
import { $, mod } from '../util.js';

let gainNode = null, srcNode = null;
export let actx = null;

export function ensureCtx() {
  if (!actx) {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = actx.createGain(); gainNode.gain.value = 0.9; gainNode.connect(actx.destination);
  }
  return actx;
}

// seconds into the section for the frame being drawn
export function currentTau() {
  const sl = segLen();
  if (S.embed) return mod(performance.now() / 1000, sl);
  if (S.recording) { const t = actx.currentTime - S.recT0; return t < 0 ? 0 : mod(t, sl); }
  if (S.playing) { const lat = (actx.outputLatency || actx.baseLatency || 0); return mod(actx.currentTime - S.t0 - lat, sl); }
  return S.tau;
}

export function stopSource() { if (srcNode) { try { srcNode.stop(); } catch (e) {} srcNode.disconnect(); srcNode = null; } }
export function startSource(dest, when, offsetInSeg) {
  stopSource();
  const s = actx.createBufferSource(); s.buffer = S.buffer; s.loop = true;
  const st = Math.max(0, segStart()), en = Math.min(S.buffer.duration, st + segLen());
  s.loopStart = st; s.loopEnd = en; s.connect(gainNode); if (dest) s.connect(dest);
  s.start(when, st + offsetInSeg); srcNode = s; return s;
}

export async function play() {
  if (!S.buffer || S.recording) return; ensureCtx(); await actx.resume();
  const when = actx.currentTime + 0.04, off = mod(S.tau, segLen());
  startSource(null, when, off); S.t0 = when - off; S.playing = true; $('play').textContent = '❚❚ Pause';
}
export function pause() { if (!S.playing) return; S.tau = currentTau(); stopSource(); S.playing = false; $('play').textContent = '▶ Play'; }
export function restartIfPlaying() { if (S.playing) { pause(); S.tau = 0; play(); } else { S.tau = mod(S.tau, segLen()); } }
