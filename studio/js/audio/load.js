// Getting a beat in: file picker, drag and drop, decoding, and BPM/key from the file name.
import { S, segLen, status } from '../state.js';
import { $ } from '../util.js';
import { actx, ensureCtx, pause } from './transport.js';
import { analyze } from './analysis.js';
import { pickOnsets, rebuild } from './hits.js';

function parseName(name) {
  const base = name.replace(/\.[^.]+$/, ''), toks = base.split(/[\s_\-.,()\[\]]+/).filter(Boolean); let bpm = null, key = null;
  for (const t of toks) {
    const b = t.match(/^(\d{2,3}(?:\.\d+)?)(?:bpm)?$/i); if (b && !bpm) { const v = +b[1]; if (v >= 60 && v <= 200) { bpm = v; continue; } }
    const k = t.match(/^([a-g])(#|s|b)?(m|min|minor|maj|major)?$/i);
    if (k && !key && (k[3] || k[2])) {
      const acc = k[2] ? (k[2].toLowerCase() === 'b' ? 'b' : '#') : '';
      const minor = k[3] && /^m(in(or)?)?$/i.test(k[3]); key = k[1].toUpperCase() + acc + (minor ? ' MIN' : ' MAJ');
    }
  }
  return { bpm, key };
}
export async function loadArrayBuffer(ab, name) {
  try {
    pause(); status('decoding audio…', 'busy'); ensureCtx();
    const buf = await new Promise((res, rej) => { const p = actx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    S.buffer = buf; $('fileName').textContent = name;
    const pn = parseName(name);
    if (pn.bpm) { S.bpm = pn.bpm; $('bpm').value = pn.bpm; }
    if (pn.key) { S.key = pn.key; $('key').value = pn.key; }
    S.A = await analyze(buf);
    // the section starts at bar 1 and the playhead at its beginning ("Auto: busiest part" is a button)
    S.startBar = 0; pickOnsets(); rebuild();
    S.tau = 0; S.t0 = performance.now();
    status(`ready · ${buf.duration.toFixed(1)} s · ${S.all.length} hits found`, 'ok');
  } catch (e) {
    console.error(e); status("couldn't read this file. Use WAV or MP3", 'err');
  }
}
// a .mid dropped on the beat goes to the MIDI box instead
const isMidi = f => /\.midi?$/i.test(f.name) || /midi/.test(f.type);
// several at once: the MIDI files go to the MIDI box together, the first audio file is the beat
async function take(list) {
  const files = [...list], midis = files.filter(isMidi), audio = files.find(f => !isMidi(f));
  if (midis.length) (await import('../ui/midi.js')).loadMidiFiles(midis);
  if (audio) loadArrayBuffer(await audio.arrayBuffer(), audio.name);
}
$('file').addEventListener('change', e => { if (e.target.files.length) take(e.target.files); });
const drop = $('drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) take(e.dataTransfer.files); });

