// The "Melody MIDI" box under the beat: drop a .mid, pick which of its tracks are the melody,
// say whether it plays once from bar 1 or repeats, or remove it to go back to the audio's guess.
import { S, status } from '../state.js';
import { $ } from '../util.js';
import { parseMidi, useMidi, clearMidi } from '../audio/midi.js';
import { rebuild } from '../audio/hits.js';
import { pressIn } from './controls.js';

const noteLabel = n => ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][n % 12] + (Math.floor(n / 12) - 1);

function render() {
  const m = S.midi, box = $('midiBox');
  $('midiDrop').classList.toggle('on', !!m);
  if (!m) {
    box.hidden = true;
    $('midiName').textContent = 'Melody MIDI, optional';
    $('midiSub').textContent = 'Drop the melody as a .mid and the notes come from it instead of being guessed from the audio. In FL Studio: piano roll → File → Export as MIDI file.';
    return;
  }
  box.hidden = false;
  $('midiName').textContent = m.name;
  const used = m.notes.filter(o => m.tracks[o.tr].on), lo = Math.min(...used.map(o => o.n)), hi = Math.max(...used.map(o => o.n));
  $('midiSub').textContent = used.length ? `${used.length} notes · ${noteLabel(lo)}–${noteLabel(hi)} · ${m.bars} bar${m.bars > 1 ? 's' : ''}` : 'No track chosen: the melody comes from the audio.';
  const tb = $('midiTracks'); tb.textContent = '';
  m.tracks.forEach((t, i) => {
    if (!t.count) return;
    const bt = document.createElement('button'); bt.type = 'button'; bt.textContent = `${t.name} (${t.count})`;
    bt.setAttribute('aria-pressed', t.on ? 'true' : 'false');
    bt.addEventListener('click', () => { t.on = !t.on; rebuild(); render(); });
    tb.appendChild(bt);
  });
  $('midiMode-loop').textContent = `repeat every ${m.loopBars} bar${m.loopBars > 1 ? 's' : ''}`;
  pressIn('midiMode', m.mode);
  const warn = m.tempo && Math.abs(m.tempo - S.bpm) > 0.5 ? ` The file says ${+m.tempo.toFixed(2)} bpm and the beat is set to ${S.bpm}: the notes follow the beat's BPM.` : '';
  $('midiInfo').textContent = (m.mode === 'loop'
    ? `The pattern starts at bar 1 and repeats every ${m.loopBars} bars.`
    : 'Beat 1 of the file is bar 1 of the track, like a whole-song export.') + warn;
}

export async function loadMidiFile(file) {
  try {
    const m = parseMidi(await file.arrayBuffer());
    useMidi(m, file.name); rebuild(); render();
    const n = S.midi.notes.filter(o => S.midi.tracks[o.tr].on).length;
    status(`melody from MIDI · ${n} notes`, 'ok');
  } catch (e) {
    console.error(e); status(`couldn't read the MIDI: ${e.message}`, 'err');
  }
}

export function wireMidi() {
  $('midiFile').addEventListener('change', e => { const f = e.target.files[0]; if (f) loadMidiFile(f); e.target.value = ''; });
  const drop = $('midiDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) loadMidiFile(f); });
  $('midiMode').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || !S.midi) return; S.midi.mode = b.dataset.v; rebuild(); render(); });
  $('midiClear').addEventListener('click', () => { clearMidi(); rebuild(); render(); status('melody from the audio again', 'ok'); });
  render();
}
export { render as renderMidi };
