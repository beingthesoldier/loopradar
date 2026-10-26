// Studio entry point: wires the page, restores settings, opens the visual from the URL, starts the frame loop.
//   ?visual=<id>          open that visual with only its own settings
//   ?visual=<id>&embed=1  silent looping preview (used by the gallery and the poster tool)
import { S, status } from './state.js';
import { $, clamp, fmtT } from './util.js';
import { setupCanvas, render } from './render/engine.js';
import { PRESETS } from './presets/index.js';
import { rebuild } from './audio/hits.js';
import { actx, currentTau } from './audio/transport.js';
import { loadArrayBuffer } from './audio/load.js';
import { finishRecording } from './export/recorder.js';
import { setupExport } from './export/index.js';
import { exportFrames } from './export/frames.js';
import { measureDelay } from './export/audio.js';
import { wireControls } from './ui/controls.js';
import { applyAll, restoreAtBoot, syncUI, renderLooks, wireSettings, saveSoon, loadVisualSettings } from './ui/settings.js';
import { findVisual, VISUALS, CATEGORIES } from '../../assets/js/catalog.js';

function useVisual(v, embed) {
  if (!v || !v.look) return;
  const pid = v.look.preset;
  if (embed) {
    S.embed = true; document.body.classList.add('embed');
    applyAll({ res: 720, title: 'DIGITAL HEAVEN', tag: 'PROD. ANX', key: 'G MIN', lenBars: 8, ...v.look });
    return;
  }
  S.visual = v; S.hide = v.hide || [];
  // the visual's starting look, then whatever this viewer last set for it (the settings it fixes always win)
  applyAll(v.look);
  const mine = loadVisualSettings(v.id);
  if (mine) {
    const fixed = Object.fromEntries(S.hide.map(k => [k, (v.look[pid] || {})[k]]));
    applyAll({ ...mine, preset: pid, [pid]: { ...(mine[pid] || {}), ...fixed } });
  }
  const cat = (CATEGORIES.find(c => c.id === v.category) || {}).name;
  $('vTitle').textContent = v.title; $('vAbout').textContent = v.about || '';
  $('vBack').href = `../#/presets/${v.category}`; $('vBack').textContent = `← ${cat || 'All presets'}`;
  document.title = `${v.title} · Loop Radar`;
  renderLooks();
}

function loop() {
  if (S.exporting) { requestAnimationFrame(loop); return; }   // the export draws its own frames
  S.frame++;
  const tau = currentTau();
  render(tau);
  $('tc').textContent = fmtT(tau);
  if (S.recording) {
    const el = actx.currentTime - S.recT0; $('recBar').style.width = clamp(el / S.recTotal, 0, 1) * 100 + '%';
    if (el >= S.recTotal + 0.03) finishRecording();
  }
  requestAnimationFrame(loop);
}

/* ---------------- boot ---------------- */
wireControls(); wireSettings();

restoreAtBoot();
setupCanvas(); syncUI(); rebuild(); renderLooks();

const q = new URLSearchParams(location.search);
useVisual(findVisual(q.get('visual') || '') || VISUALS[0], q.get('embed') === '1');
requestAnimationFrame(loop);
if (!S.embed) setupExport();

const fontsReady = document.fonts ? Promise.all([
  document.fonts.load('400 30px Michroma'), document.fonts.load('500 20px "IBM Plex Mono"'), document.fonts.load('400 20px "IBM Plex Mono"'),
  document.fonts.load('300 40px Inter'), document.fonts.load('400 30px Inter')
]).catch(() => {}) : Promise.resolve();
fontsReady
  .then(() => { setupCanvas(); return fetch('demo.mp3'); })   // glyph atlases need the real fonts, so build again once they're in
  .then(r => { if (!r.ok) throw new Error('no demo'); return r.arrayBuffer(); })
  .then(ab => loadArrayBuffer(ab, '134_gm_anx87hosty.mp3'))
  .catch(() => { status('drop a beat on the left', 'ok'); $('fileName').textContent = 'no file chosen'; });

// for the poster tool and quick checks in the console
window.__LR = { S, render, setTau: t => { S.tau = t; }, useVisual, PRESETS, saveSoon, exportFrames, measureDelay };
