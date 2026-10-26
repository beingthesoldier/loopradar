// Remembering settings in this browser: the last session, each visual's own settings, and named looks.
import { S } from '../state.js';
import { $ } from '../util.js';
import { PRESET_IDS } from '../presets/index.js';
import { pressIn, buildLook } from './controls.js';
import { setupCanvas } from '../render/engine.js';
import { pickOnsets, rebuild } from '../audio/hits.js';
import { restartIfPlaying } from '../audio/transport.js';

const CTRL_INPUTS = { title: 'title', tag: 'tag', key: 'key', bpm: 'bpm', offset: 'offset', lead: 'lead', lenNum: 'lenBars', sens: 'sens' };
const CTRL_SEGS = { len: 'lenBars', quant: 'quant', res: 'res', loops: 'loops' };
export const LOOK_KEYS = ['preset', 'quant', 'sens', ...PRESET_IDS];
const ALL_KEYS = LOOK_KEYS.concat(['title', 'tag', 'key', 'bpm', 'offset', 'lenBars', 'res', 'loops', 'lead']);

export const snap = keys => { const o = {}; for (const k of keys) o[k] = JSON.parse(JSON.stringify(S[k])); return o; };
// settings saved before presets had their own section kept the radar's at the top level
function migrate(o) {
  if (!o || typeof o !== 'object') return null;
  const old = ['tint', 'sweepBars', 'persist', 'glitch'].filter(k => k in o);
  if (old.length && !o.radar) { o = { ...o, radar: {} }; for (const k of old) o.radar[k] = o[k]; }
  return o;
}
export function applySnap(o) {
  o = migrate(o); if (!o) return;
  for (const k of ALL_KEYS) {
    if (!(k in o)) continue;
    if (S[k] && typeof S[k] === 'object') Object.assign(S[k], o[k]); else S[k] = o[k];
  }
}
export function syncUI() {
  for (const [id, key] of Object.entries(CTRL_INPUTS)) { const e = $(id); if (e) e.value = S[key]; }
  if ($('sensOut')) $('sensOut').textContent = Math.round(S.sens * 100);
  for (const [id, key] of Object.entries(CTRL_SEGS)) pressIn(id, S[key]);
  buildLook();
}
export function applyAll(o) { applySnap(o); syncUI(); setupCanvas(); if (S.A) pickOnsets(); rebuild(); restartIfPlaying(); }

let saveT = 0;
export function saveSoon() {
  clearTimeout(saveT);
  saveT = setTimeout(() => {
    if (S.embed) return;
    try {
      localStorage.setItem('lr.settings', JSON.stringify(snap(ALL_KEYS)));
      if (S.visual) localStorage.setItem('lr.v.' + S.visual.id, JSON.stringify(snap(LOOK_KEYS)));
    } catch (e) {}
  }, 300);
}
export const loadVisualSettings = id => { try { return migrate(JSON.parse(localStorage.getItem('lr.v.' + id) || 'null')); } catch (e) { return null; } };

/* ---------------- named looks ---------------- */
function getLooks() { try { const a = JSON.parse(localStorage.getItem('lr.looks') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function setLooks(a) { try { localStorage.setItem('lr.looks', JSON.stringify(a)); return true; } catch (e) { return false; } }
// a saved look belongs to this visual when it is the same preset and agrees on the settings the visual fixes (e.g. the shape)
function fits(l) {
  const d = migrate(l.data); if (!d || d.preset !== S.preset) return false;
  if (!S.visual) return true;
  const mine = d[S.preset] || {}, base = S.visual.look[S.preset] || {};
  return (S.hide || []).every(k => mine[k] === base[k]);
}
export function renderLooks() {
  const box = $('looks'); if (!box) return;
  const looks = getLooks().filter(fits); box.textContent = '';
  if (!looks.length) { const sp = document.createElement('span'); sp.className = 'hint'; sp.textContent = 'No saved looks for this visual yet.'; box.appendChild(sp); return; }
  for (const lk of looks) {
    const chip = document.createElement('span'); chip.className = 'chip';
    const a = document.createElement('button'); a.type = 'button'; a.textContent = lk.name; a.title = 'Apply ' + lk.name;
    a.addEventListener('click', () => { applyAll(lk.data); saveSoon(); $('looksHint').textContent = 'Applied: ' + lk.name; });
    const x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.textContent = '×'; x.setAttribute('aria-label', 'Delete ' + lk.name);
    x.addEventListener('click', () => { setLooks(getLooks().filter(q => q.name !== lk.name)); renderLooks(); $('looksHint').textContent = 'Deleted: ' + lk.name; });
    chip.append(a, x); box.appendChild(chip);
  }
}
export function wireSettings() {
  ['input', 'change', 'click'].forEach(ev => document.querySelector('.rack').addEventListener(ev, saveSoon));
  $('lookSave').addEventListener('click', () => {
    const name = ($('lookName').value.trim() || `${S.visual ? S.visual.title : S.preset} ${getLooks().filter(fits).length + 1}`).slice(0, 24);
    const l = getLooks().filter(x => x.name !== name); l.push({ name, data: snap(LOOK_KEYS) });
    if (setLooks(l)) { $('lookName').value = ''; $('looksHint').textContent = 'Saved: ' + name; }
    else $('looksHint').textContent = "Couldn't save: this browser blocks page storage (private window?).";
    renderLooks();
  });
}

// at start: values the page kept from before an update, then the remembered session on top
export function restoreAtBoot() {
  for (const [id, key] of Object.entries(CTRL_INPUTS)) {
    const e = $(id); if (e && e.value !== e.defaultValue) S[key] = typeof S[key] === 'number' ? (+e.value || 0) : e.value;
  }
  let stored = null; try { stored = JSON.parse(localStorage.getItem('lr.settings') || 'null'); } catch (e) {}
  if (stored) applySnap(stored);
}
