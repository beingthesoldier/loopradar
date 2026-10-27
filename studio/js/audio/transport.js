// Playback of the section on a loop, and the clock every frame reads its time from.
import { S, segStart, segLen, status } from '../state.js';
import { $, mod } from '../util.js';

let gainNode = null, srcNode = null;
export let actx = null;

function makeCtx() {
  actx = new (window.AudioContext || window.webkitAudioContext)();
  gainNode = actx.createGain(); gainNode.gain.value = 0.9; gainNode.connect(actx.destination);
}
export function ensureCtx() { if (!actx) makeCtx(); return actx; }

// Call this first thing inside a click or key press, before any await. The context the beat was decoded with
// is made at page load, outside any tap, and Safari can keep such a context silent even after resume(); so if
// it isn't running yet, it is swapped for a fresh one made inside the tap (the decoded beat works with either),
// woken, and given one silent sample, which is what WebKit needs to let a context play.
export function wake() {
  if (actx && actx.state !== 'running') {
    stopSource(); try { actx.close(); } catch (e) {}
    actx = null;
  }
  ensureCtx();
  try { actx.resume(); } catch (e) {}
  try { const b = actx.createBuffer(1, 1, actx.sampleRate), s = actx.createBufferSource(); s.buffer = b; s.connect(actx.destination); s.start(0); } catch (e) {}
  return actx;
}

// seconds into the section for the frame being drawn
export function currentTau() {
  const sl = segLen();
  if (S.embed) return mod((performance.now() - S.t0) / 1000, sl);   // previews start at the top of the section
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
  if (!S.buffer || S.recording || S.exporting) return;
  wake();
  // don't wait forever on a context the browser holds back: start anyway, and say so if it stays silent
  await Promise.race([actx.resume().catch(() => {}), new Promise(r => setTimeout(r, 400))]);
  const when = actx.currentTime + 0.04, off = mod(S.tau, segLen());
  startSource(null, when, off); S.t0 = when - off; S.playing = true; $('play').textContent = '❚❚ Pause';
  if (actx.state !== 'running') status('the browser is holding the sound back: allow sound / auto-play for this site', 'err');
}
export function pause() { if (!S.playing) return; S.tau = currentTau(); stopSource(); S.playing = false; $('play').textContent = '▶ Play'; }
export function restartIfPlaying() { if (S.playing) { pause(); S.tau = 0; play(); } else { S.tau = 0; } }
