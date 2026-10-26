// The studio's sidebar. Shared controls (beat, labels, section, hits, export) are in the HTML;
// the Look panel is built from the current preset's `controls` list, so a new preset needs no HTML.
//
// Control types a preset can declare:
//   { key, label, type: 'range',  min, max, step, format?(v), then? }
//   { key, label, type: 'choice', options: [[value, text], ...], then? }
//   { key, label, type: 'ink',    swatches: [[hex | '', name, css?], ...], then? }   colour swatches + a free picker
// `then` runs after a change: 'rebuild' re-reads the hits, any other name calls that method on the preset.
import { S } from '../state.js';
import { $, clamp } from '../util.js';
import { current } from '../presets/index.js';
import { rebuild, pickOnsets, autoSegment } from '../audio/hits.js';
import { setupCanvas } from '../render/engine.js';
import { play, pause, restartIfPlaying } from '../audio/transport.js';
import { onExportClick } from '../export/index.js';

export function pressIn(id, v) { const g = $(id); if (g) g.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === String(v) ? 'true' : 'false')); }
function segGroup(id, cb) {
  $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; pressIn(id, b.dataset.v); cb(b.dataset.v); });
}
function slider(id, fn, fmt) { $(id).addEventListener('input', e => { const v = +e.target.value; fn(v); $(id + 'Out').textContent = fmt ? fmt(v) : Math.round(v * 100); }); }

export function wireControls() {
  segGroup('len', v => { S.lenBars = +v; $('lenNum').value = v; rebuild(); restartIfPlaying(); });
  $('lenNum').addEventListener('change', e => {
    const v = clamp(Math.round(+e.target.value) || 8, 1, 64); e.target.value = v; S.lenBars = v; pressIn('len', v);
    rebuild(); restartIfPlaying();
  });
  segGroup('quant', v => { S.quant = +v; rebuild(); });
  segGroup('res', v => { S.res = +v; setupCanvas(); });
  segGroup('loops', v => { S.loops = +v; });
  segGroup('fps', v => { S.fps = +v; });
  slider('sens', v => { S.sens = v; pickOnsets(); rebuild(); });
  $('start').addEventListener('input', e => { S.startBar = +e.target.value; rebuild(); restartIfPlaying(); });
  $('auto').addEventListener('click', () => { autoSegment(); rebuild(); restartIfPlaying(); });
  $('title').addEventListener('input', e => { S.title = e.target.value; });
  $('tag').addEventListener('input', e => { S.tag = e.target.value; });
  $('key').addEventListener('input', e => { S.key = e.target.value; rebuild(); });
  $('bpm').addEventListener('change', e => { const v = +e.target.value; if (v >= 50 && v <= 220) { S.bpm = v; rebuild(); restartIfPlaying(); } else e.target.value = S.bpm; });
  $('offset').addEventListener('change', e => { S.offset = clamp(+e.target.value || 0, -500, 500); e.target.value = S.offset; rebuild(); restartIfPlaying(); });
  $('lead').addEventListener('change', e => { S.lead = clamp(+e.target.value || 0, -300, 300); e.target.value = S.lead; });
  $('play').addEventListener('click', () => S.playing ? pause() : play());
  $('rec').addEventListener('click', onExportClick);
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !/INPUT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); S.playing ? pause() : play(); }
  });
}

/* ---------------- the Look panel ---------------- */
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
const fmtRange = (c, v) => c.format ? c.format(v) : Math.round(v * 100);
function after(p, c) { if (c.then === 'rebuild') rebuild(); else if (c.then && typeof p[c.then] === 'function') p[c.then](); }

export function buildLook() {
  const p = current(), box = $('lookControls'), set = S[p.id];
  if (!box) return;
  box.textContent = '';
  for (const c of p.controls) {
    if ((S.hide || []).includes(c.key)) continue;
    const id = `lk-${p.id}-${c.key}`, f = el('div', 'f');
    if (c.type === 'range') {
      const lab = el('label'); lab.htmlFor = id;
      const out = el('output', null, fmtRange(c, set[c.key])); lab.append(el('span', null, c.label), out);
      const inp = el('input'); inp.type = 'range'; inp.id = id; inp.min = c.min; inp.max = c.max; inp.step = c.step; inp.value = set[c.key];
      inp.addEventListener('input', () => { set[c.key] = +inp.value; out.textContent = fmtRange(c, set[c.key]); after(p, c); });
      f.append(lab, inp);
    } else if (c.type === 'choice') {
      const seg = el('div', 'seg'); seg.setAttribute('role', 'group'); seg.setAttribute('aria-label', c.label);
      c.options.forEach(([val, text], i) => {
        const b = el('button', null, text); b.type = 'button'; b.id = `${id}-${i}`; b.setAttribute('aria-pressed', String(set[c.key] === val));
        b.addEventListener('click', () => {
          if (b.disabled) return; set[c.key] = val;
          seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); after(p, c);
        });
        seg.appendChild(b);
      });
      const lbl = el('div', 'lbl'); lbl.appendChild(el('span', null, c.label));
      f.append(lbl, seg);
    } else if (c.type === 'ink') {
      const out = el('output'), lbl = el('div', 'lbl'); lbl.append(el('span', null, c.label), out);
      const sw = el('div', 'swatches'), pick = el('label', 'pick'), picker = el('input');
      picker.type = 'color'; picker.id = `${id}-custom`; pick.htmlFor = picker.id; pick.title = 'Any color';
      const named = new Map(c.swatches.map(s => [s[0], s[1]]));
      const show = (v, custom) => {
        sw.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(!custom && x.dataset.v === v)));
        pick.classList.toggle('on', custom); out.textContent = custom ? v : (named.get(v) || 'palette');
      };
      const choose = (v, custom) => { set[c.key] = v; show(v, custom); after(p, c); };
      c.swatches.forEach(([val, name, css], i) => {
        const b = el('button'); b.type = 'button'; b.id = `${id}-${i}`; b.dataset.v = val; b.setAttribute('aria-label', name);
        const dot = el('i'); dot.style.background = css || val; b.appendChild(dot);
        b.addEventListener('click', () => { if (!b.disabled) choose(val, false); });
        sw.appendChild(b);
      });
      const v0 = set[c.key] || '', isCustom = !!v0 && !named.has(v0);
      picker.value = isCustom ? v0 : '#3346d3';
      picker.addEventListener('input', () => choose(picker.value, true));
      pick.append(picker, el('span', null, 'custom')); sw.appendChild(pick);
      show(v0, isCustom);
      f.append(lbl, sw);
    }
    box.appendChild(f);
  }
}
