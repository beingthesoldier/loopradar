// The "Melody MIDI" box under the beat: drop up to five .mid files (the lead, the pads, a counter-melody...),
// pick which of each file's tracks are melody, say whether each plays once from bar 1 or repeats, remove one,
// or remove them all to go back to the audio's guess.
import { S, status } from '../state.js';
import { $ } from '../util.js';
import { parseMidi, useMidi, removeMidi, clearMidi, MAX_MIDI } from '../audio/midi.js';
import { rebuild } from '../audio/hits.js';

const noteLabel = n => ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'][n % 12] + (Math.floor(n / 12) - 1);
const el = (tag, attrs = {}, text) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

function summary(notes) {
  if (!notes.length) return '';
  const lo = Math.min(...notes.map(o => o.n)), hi = Math.max(...notes.map(o => o.n));
  return `${plural(notes.length, 'note')} · ${noteLabel(lo)}–${noteLabel(hi)}`;
}

// one file: its name, its tracks, where it goes
function fileBlock(f, fi) {
  const m = S.midi, box = el('div', { class: 'mfile' });
  const head = el('div', { class: 'mhead' }); head.append(el('strong', {}, f.name));
  const x = el('button', { type: 'button', class: 'mx', 'aria-label': `Remove ${f.name}` }, 'remove');
  x.addEventListener('click', () => { removeMidi(fi); rebuild(); render(); status(S.midi ? `removed ${f.name}` : 'melody from the audio again', 'ok'); });
  head.append(x); box.append(head);
  const used = m.notes.filter(o => o.f === fi && m.tracks[o.tr].on);
  box.append(el('small', { class: 'hint' }, used.length ? `${summary(used)} · ${plural(f.bars, 'bar')}` : 'No track chosen: nothing from this file.'));
  const named = f.tracks.filter(t => t.count);
  if (named.length > 1) {
    const fld = el('div', { class: 'f' }), lbl = el('div', { class: 'lbl' }); lbl.append(el('span', {}, 'Melody tracks')); fld.append(lbl);
    const seg = el('div', { class: 'seg' });
    f.tracks.forEach(t => {
      if (!t.count) return;
      const bt = el('button', { type: 'button', 'aria-pressed': t.on ? 'true' : 'false' }, `${t.name} (${t.count})`);
      bt.addEventListener('click', () => { t.on = !t.on; rebuild(); render(); });
      seg.append(bt);
    });
    fld.append(seg); box.append(fld);
  }
  const fld = el('div', { class: 'f' }), lbl = el('div', { class: 'lbl' }); lbl.append(el('span', {}, 'Place it')); fld.append(lbl);
  const seg = el('div', { class: 'seg' });
  for (const [v, txt] of [['song', 'once, from bar 1'], ['loop', `repeat every ${plural(f.loopBars, 'bar')}`]]) {
    const bt = el('button', { type: 'button', 'aria-pressed': f.mode === v ? 'true' : 'false' }, txt);
    bt.addEventListener('click', () => { f.mode = v; rebuild(); render(); });
    seg.append(bt);
  }
  fld.append(seg); box.append(fld);
  const warn = f.tempo && Math.abs(f.tempo - S.bpm) > 0.5 ? ` The file says ${+f.tempo.toFixed(2)} bpm and the beat is set to ${S.bpm}: the notes follow the beat's BPM.` : '';
  box.append(el('p', { class: 'hint' }, (f.mode === 'loop' ? `Starts at bar 1 and repeats every ${plural(f.loopBars, 'bar')}.` : 'Beat 1 of the file is bar 1 of the track, like a whole-song export.') + warn));
  return box;
}

function render() {
  const m = S.midi, box = $('midiBox');
  $('midiDrop').classList.toggle('on', !!m);
  if (!m) {
    box.hidden = true;
    $('midiName').textContent = 'Melody MIDI, optional';
    $('midiSub').textContent = `Drop the melody as .mid files, up to ${MAX_MIDI} (lead, pads, a counter-melody), and the notes come from them instead of being guessed from the audio. In FL Studio: piano roll → File → Export as MIDI file.`;
    return;
  }
  box.hidden = false;
  const n = m.files.length, used = m.notes.filter(o => m.tracks[o.tr].on);
  $('midiName').textContent = n === 1 ? m.files[0].name : `${n} MIDI files`;
  $('midiSub').textContent = (used.length ? summary(used) + '. ' : 'No track chosen: the melody comes from the audio. ')
    + (n < MAX_MIDI ? `Drop or pick more to add them, up to ${MAX_MIDI}.` : `${MAX_MIDI} of ${MAX_MIDI}: remove one to add another.`);
  const list = $('midiFiles'); list.textContent = '';
  m.files.forEach((f, i) => list.append(fileBlock(f, i)));
  $('midiClear').textContent = n > 1 ? 'Remove all MIDI' : 'Remove MIDI';
}

// one or more files at once; anything past five, or anything that isn't a MIDI, is skipped and said so
export async function loadMidiFiles(list) {
  const files = [...list]; let added = 0; const skipped = [];
  for (const f of files) {
    const have = S.midi ? S.midi.files : [];
    if (have.length >= MAX_MIDI && !have.some(x => x.name === f.name)) { skipped.push(`${f.name} (already ${MAX_MIDI} files)`); continue; }
    try { useMidi(parseMidi(await f.arrayBuffer()), f.name); added++; }
    catch (e) { console.error(e); skipped.push(`${f.name} (${e.message})`); }
  }
  if (added) { rebuild(); render(); }
  const m = S.midi, n = m ? m.notes.filter(o => m.tracks[o.tr].on).length : 0;
  if (!added && skipped.length) status(`couldn't add the MIDI: ${skipped.join(', ')}`, 'err');
  else if (added) status(`melody from MIDI · ${plural(m.files.length, 'file')} · ${n} notes` + (skipped.length ? ` · skipped ${skipped.join(', ')}` : ''), skipped.length ? 'err' : 'ok');
}
export const loadMidiFile = f => loadMidiFiles([f]);

export function wireMidi() {
  $('midiFile').addEventListener('change', e => { if (e.target.files.length) loadMidiFiles(e.target.files); e.target.value = ''; });
  const drop = $('midiDrop');
  ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => { if (e.dataTransfer.files.length) loadMidiFiles(e.dataTransfer.files); });
  $('midiClear').addEventListener('click', () => { clearMidi(); rebuild(); render(); status('melody from the audio again', 'ok'); });
  render();
}
export { render as renderMidi };
