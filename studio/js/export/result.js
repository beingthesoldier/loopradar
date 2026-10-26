// The finished video under the frame: preview, file info, and saving it. Both export paths end here.
import { S } from '../state.js';
import { $ } from '../util.js';

let lastBlob = null, lastExt = 'mp4';

// blob: the video file; info: { ext, seconds, fps?, hint }
export function showVideo(blob, info) {
  lastBlob = blob; lastExt = info.ext;
  const v = $('vid'); if (v.src) URL.revokeObjectURL(v.src); v.src = URL.createObjectURL(blob);
  $('result').hidden = false;
  $('vidMeta').textContent = [
    info.ext.toUpperCase(), `${S.res}×${Math.round(S.res * 16 / 9)}`, info.fps ? `${info.fps} fps` : '',
    `${info.seconds.toFixed(2)} s`, `${(blob.size / 1048576).toFixed(1)} MB`
  ].filter(Boolean).join(' · ');
  $('saveHint').textContent = info.hint || '';
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

export function setLocked(on) { document.querySelectorAll('.rack input, .rack button, #play').forEach(el => { el.disabled = on; }); }

const dlP = (window.claude && typeof window.claude.use === 'function') ? window.claude.use('downloads').catch(() => null) : Promise.resolve(null);
function fileBase() { return ((S.title || 'beat') + '_' + S.preset + '_' + Math.round(S.bpm) + 'bpm').toLowerCase().replace(/[^a-z0-9а-яё_\-]+/gi, '_').replace(/_+/g, '_'); }
$('save').addEventListener('click', async () => {
  if (!lastBlob) return; const name = fileBase() + '.' + lastExt;
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
