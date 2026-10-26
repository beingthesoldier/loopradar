// Real-time recording of the frame and the audio into a video file, and saving it.
import { S, segLen, status } from '../state.js';
import { $, mod } from '../util.js';
import { cv } from '../render/canvas.js';
import { actx, ensureCtx, pause, startSource, stopSource } from '../audio/transport.js';

let recorder = null, chunks = [], recMime = '', lastBlob = null;
// MP4 (H.264 + AAC) first, so Instagram takes it as is; WebM only as a last resort
const MIMES = ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d0028,mp4a.40.2', 'video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
function pickMime() { if (!window.MediaRecorder) return ''; for (const m of MIMES) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} } return ''; }
export async function startRecording() {
  if (!S.buffer || S.recording) return;
  if (!cv.captureStream || !window.MediaRecorder) { status("this browser can't record canvas video. Open the page in Chrome or Safari", 'err'); return; }
  pause(); ensureCtx(); await actx.resume();
  recMime = pickMime();
  const dest = actx.createMediaStreamDestination();
  const stream = cv.captureStream(60); dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  try { recorder = new MediaRecorder(stream, { mimeType: recMime || undefined, videoBitsPerSecond: S.res >= 1000 ? 18e6 : 10e6, audioBitsPerSecond: 256000 }); }
  catch (e) { recorder = new MediaRecorder(stream); }
  recMime = recorder.mimeType || recMime;
  chunks = []; recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
  recorder.onstop = onRecorded;
  S.recTotal = segLen() * S.loops; S.tau = 0;
  setLocked(true); $('recProg').hidden = false; $('recBar').style.width = '0%';
  recorder.start(250);
  const when = actx.currentTime + 0.08; S.recT0 = when; S.recording = true;
  const s = startSource(dest, when, mod(-S.lead / 1000, segLen())); s.stop(when + S.recTotal);
  status(`recording · ${S.recTotal.toFixed(1)} s · keep this tab in front`, 'rec');
}
export function finishRecording() { if (!S.recording) return; S.recording = false; stopSource(); try { recorder.stop(); } catch (e) {} }
function onRecorded() {
  const type = (recMime || 'video/webm').split(';')[0], ext = type.includes('mp4') ? 'mp4' : 'webm';
  lastBlob = new Blob(chunks, { type }); lastBlob._ext = ext;
  const v = $('vid'); if (v.src) URL.revokeObjectURL(v.src); v.src = URL.createObjectURL(lastBlob);
  $('result').hidden = false;
  $('vidMeta').textContent = `${ext.toUpperCase()} · ${S.res}×${Math.round(S.res * 16 / 9)} · ${S.recTotal.toFixed(2)} s · ${(lastBlob.size / 1048576).toFixed(1)} MB`;
  const aac = /mp4a/i.test(recMime);
  $('saveHint').textContent = ext !== 'mp4'
    ? "The browser recorded WebM, which Instagram won't take. Open the page in Safari or a recent Chrome to get MP4, or convert the file (HandBrake, ffmpeg)."
    : aac ? 'H.264 + AAC, ready to post.' : `Format: ${recMime}. If Instagram rejects the audio, record again in Safari.`;
  setLocked(false); $('recProg').hidden = true; S.tau = 0;
  status('video ready', 'ok');
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
export function setLocked(on) { document.querySelectorAll('.rack input, .rack button, #play').forEach(el => { el.disabled = on; }); }

const dlP = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
function fileBase() { return ((S.title || 'beat') + '_' + S.preset + '_' + Math.round(S.bpm) + 'bpm').toLowerCase().replace(/[^a-z0-9а-яё_\-]+/gi, '_').replace(/_+/g, '_'); }
$('save').addEventListener('click', async () => {
  if (!lastBlob) return; const name = fileBase() + '.' + lastBlob._ext;
  const dl = await dlP;
  if (dl) {
    try { await dl.save({ filename: name, data: lastBlob }); $('saveHint').textContent = 'Saved: ' + name; }
    catch (e) {
      const code = e && e.code;
      $('saveHint').textContent = code === 'declined' ? 'Save cancelled.' : code === 'rate_limited' ? 'A save prompt is already open, confirm it.' : "Couldn't save here. Right-click the video and choose Save Video As.";
    }
    return;
  }
  const a = document.createElement('a'); a.href = $('vid').src; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  $('saveHint').textContent = "If the download didn't start, right-click the video and choose Save Video As.";
});

