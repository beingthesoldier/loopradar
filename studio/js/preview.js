// A live preset for pages outside the studio (the home page): it draws from the demo beat's hits, which
// tools/make-demo.mjs saved to assets/demo/demo.json, so nothing is decoded or analysed here.
// The sound is fetched only when someone turns it on.
// Needs a <canvas id="cv"> in the page before this module is imported (render/canvas.js draws on it).
import { S } from './state.js';
import { mod } from './util.js';
import { cv, sizeCanvas } from './render/canvas.js';
import { render } from './render/engine.js';
import { PRESETS } from './presets/index.js';

const FONTS = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;700&family=IBM+Plex+Mono:wght@400;500&family=Michroma&display=swap';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function loadFonts() {
  if (!document.querySelector(`link[href="${FONTS}"]`)) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTS; document.head.appendChild(l);
  }
  if (!document.fonts) return Promise.resolve();
  const want = Promise.all(['400 30px Michroma', '500 20px "IBM Plex Mono"', '400 20px "IBM Plex Mono"', '300 40px Inter', '400 30px Inter'].map(f => document.fonts.load(f))).catch(() => {});
  return Promise.race([want, new Promise(r => setTimeout(r, 2500))]);   // a slow font never holds the picture back for long
}

export async function createPreview({ dataUrl, audioUrl, res = 720 }) {
  const [D] = await Promise.all([fetch(dataUrl).then(r => r.json()), loadFonts()]);
  Object.assign(S, { embed: true, bpm: D.bpm, key: D.key, tag: 'PROD. ANX', lenBars: D.lenBars, startBar: 0, offset: 0, quant: D.quant, res });
  S.A = { frameRate: D.frameRate, nF: D.nF, rmsN: D.rmsN, lowS: D.lowS, highN: D.highN, slow: D.slow, rmsDb: D.rmsDb, dur: D.nF / D.frameRate };
  S.wave = Float32Array.from(D.wave);
  sizeCanvas();
  const sl = () => S.lenBars * 240 / S.bpm;

  let visual = null, host = null, visible = true, raf = 0, still = reduced();
  let t0 = performance.now();                 // the picture's own clock while the sound is off
  let actx = null, gain = null, buffer = null, src = null, at0 = 0, soundOn = false, loading = null;
  const listeners = new Set();
  const emit = () => { for (const f of listeners) f({ visual, soundOn, loading: !!loading }); };

  const tau = () => soundOn
    ? mod(actx.currentTime - at0 - (actx.outputLatency || actx.baseLatency || 0), sl())
    : mod((performance.now() - t0) / 1000, sl());

  function look(v) {
    const L = v.look, pid = L.preset;
    S.preset = pid;
    S[pid] = { ...JSON.parse(JSON.stringify(PRESETS[pid].defaults)), ...(L[pid] || {}) };
    S.quant = L.quant ?? D.quant;
    S.title = v.title.toUpperCase();
    PRESETS[pid].setup();
    S.seg = D.seg.map(o => ({ ...o }));
    if (PRESETS[pid].prepare) PRESETS[pid].prepare(S.seg);
  }
  function frame() {
    raf = 0;
    if (!visible || document.hidden) return;
    // with reduced motion the picture holds still on the visual's poster moment, unless the sound is on
    const moving = !still || soundOn;
    if (moving) S.frame++;
    render(moving ? tau() : (visual.posterAt ?? 4));
    if (moving) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && visible && !document.hidden) raf = requestAnimationFrame(frame); };
  document.addEventListener('visibilitychange', wake);
  const io = new IntersectionObserver(es => { visible = es.some(e => e.isIntersecting); if (visible) wake(); }, { threshold: 0.05 });

  // show a visual in a box: the one canvas moves there, so only one preset is ever drawing
  function show(v, box) {
    if (v !== visual) {
      // the first picture starts on the poster's moment, so the poster underneath hands over without a jump
      if (!visual && !soundOn) t0 = performance.now() - (v.posterAt ?? 4) * 1000;
      visual = v; look(v);
    }
    if (box && box !== host) { host = box; box.appendChild(cv); io.disconnect(); io.observe(box); }
    wake(); emit();
  }

  async function sound(on) {
    if (on === soundOn && !loading) return;
    if (!on) {
      const t = tau(); if (src) { try { src.stop(); } catch (e) {} src.disconnect(); src = null; }
      soundOn = false; t0 = performance.now() - t * 1000; emit(); return;
    }
    // created and resumed inside the tap, or Safari keeps it silent
    if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); gain = actx.createGain(); gain.gain.value = 0.9; gain.connect(actx.destination); }
    actx.resume();
    // one silent sample inside the tap: WebKit lets a context play once something has started in a gesture
    try { const b = actx.createBuffer(1, 1, actx.sampleRate), s0 = actx.createBufferSource(); s0.buffer = b; s0.connect(actx.destination); s0.start(0); } catch (e) {}
    if (!buffer) {
      loading = loading || fetch(audioUrl).then(r => r.arrayBuffer()).then(ab => new Promise((res, rej) => { const p = actx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }));
      emit();
      try { buffer = await loading; } finally { loading = null; }
    }
    const off = tau(), when = actx.currentTime + 0.05;
    src = actx.createBufferSource(); src.buffer = buffer; src.loop = true; src.loopStart = 0; src.loopEnd = Math.min(buffer.duration, sl());
    src.connect(gain); src.start(when, off);
    at0 = when - off; soundOn = true; wake(); emit();
  }

  return {
    show, sound,
    get soundOn() { return soundOn; },
    get visual() { return visual; },
    onState(fn) { listeners.add(fn); fn({ visual, soundOn, loading: !!loading }); return () => listeners.delete(fn); }
  };
}
