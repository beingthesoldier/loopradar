// The Export button. Frame by frame (frames.js) wherever the browser can encode video itself;
// real-time recording (recorder.js) only as a fallback. The audio offset belongs to real-time recording
// alone, so it's shown only then.
import { S } from '../state.js';
import { $ } from '../util.js';
import { probe, exportFrames, cancelFrames } from './frames.js';
import { startRecording } from './recorder.js';

let mode = 'live';

export async function setupExport() {
  const c = await probe();
  mode = c ? 'frames' : 'live';
  $('leadRow').hidden = mode === 'frames';
  $('fpsRow').hidden = mode !== 'frames';
  $('rec').textContent = mode === 'frames' ? 'Export video' : 'Record video';
  $('recHint').textContent = mode === 'frames'
    ? 'Every frame is drawn at its exact moment and the sound is encoded straight from the beat, so they line up to the sample and no frame gets dropped. It doesn\'t run in real time: light visuals export faster than they play, heavy ones a bit slower.'
    : 'This browser can\'t encode video frame by frame, so the export is recorded in real time. Keep this tab in front while it records, or the browser slows the animation down. The offset moves only the audio: if you hear a hit before its flash, raise it; if after, lower it.';
  return mode;
}

export function onExportClick() {
  if (S.exporting) { cancelFrames(); return; }
  if (mode === 'frames') exportFrames(); else startRecording();
}
