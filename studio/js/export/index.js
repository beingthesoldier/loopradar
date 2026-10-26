// The Export button. Frame by frame (frames.js) wherever the browser can encode video itself;
// real-time recording (recorder.js) only as a fallback. The audio offset belongs to real-time recording
// alone, so it's shown only then.
import { S } from '../state.js';
import { $ } from '../util.js';
import { probe, exportFrames, cancelFrames } from './frames.js';
import { startRecording } from './recorder.js';
import { canExport, onAuth, configured } from '../../../assets/js/auth.js';

let mode = 'live', hint = '';
const label = () => mode === 'frames' ? 'Export video' : 'Record video';

// a paid visual can be tried by anyone; exporting it needs an account with full access
function lockState() {
  const rec = $('rec'); if (!rec || S.exporting || S.recording) return;
  const locked = !canExport(S.visual);
  rec.classList.toggle('locked', locked);
  rec.textContent = locked ? 'Unlock to export' : label();
  $('recHint').textContent = locked
    ? `${S.visual.title} is a paid preset: play with it as much as you like; exporting it needs full access.` + (configured() ? ' Sign in from the account button, top right.' : ' Accounts are coming soon.')
    : hint;
}
export const refreshExportLock = lockState;

export async function setupExport() {
  const c = await probe();
  mode = c ? 'frames' : 'live';
  $('leadRow').hidden = mode === 'frames';
  $('fpsRow').hidden = mode !== 'frames';
  $('rec').textContent = label();
  hint = mode === 'frames'
    ? 'Every frame is drawn at its exact moment and the sound is encoded straight from the beat, so they line up to the sample and no frame gets dropped. It doesn\'t run in real time: light visuals export faster than they play, heavy ones a bit slower.'
    : 'This browser can\'t encode video frame by frame, so the export is recorded in real time. Keep this tab in front while it records, or the browser slows the animation down. The offset moves only the audio: if you hear a hit before its flash, raise it; if after, lower it.';
  $('recHint').textContent = hint;
  onAuth(lockState);
  return mode;
}

export function onExportClick() {
  if (S.exporting) { cancelFrames(); return; }
  if (!canExport(S.visual)) { location.href = '../#/account'; return; }
  if (mode === 'frames') exportFrames(); else startRecording();
}
