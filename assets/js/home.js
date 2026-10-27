// The home page: one live preset on the demo beat, and a strip of every preset below it.
// The live picture comes from studio/js/preview.js; it's loaded only when the home page is shown.
// One canvas does all the drawing: it sits in the hero, and moves into a card in the strip while that
// card is hovered (or, on touch screens, while it's the one in the middle of the strip).
import { VISUALS, findVisual, accessLabel, PRICE } from './catalog.js';

const $ = id => document.getElementById(id);
const HERO = 'orb';
const NUM = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
const href = v => `#/presets/${v.category}/${v.id}`;
const touch = () => matchMedia('(hover: none)').matches;

let preview = null, started = false, ready = null;

function buildStrip() {
  const n = VISUALS.length, word = NUM[n] || String(n);
  $('proofH').textContent = `Same beat. ${word[0].toUpperCase() + word.slice(1)} presets.`;
  const strip = $('strip'); strip.textContent = '';
  for (const v of VISUALS) {
    const a = document.createElement('a'); a.className = 'mini'; a.href = href(v); a.dataset.id = v.id;
    const th = document.createElement('div'); th.className = 'mini-th';
    const img = document.createElement('img'); img.src = `assets/posters/small/${v.id}.jpg`; img.alt = v.title; img.loading = 'lazy'; img.decoding = 'async';
    th.appendChild(img);
    const t = document.createElement('span'); t.className = 'mini-t'; t.textContent = v.title;
    // only the free ones are marked here; the line under the strip says what the rest are
    if (v.access === 'free') { const tag = document.createElement('i'); tag.className = 'tag free'; tag.textContent = accessLabel(v); t.appendChild(tag); }
    a.append(th, t); strip.appendChild(a);
  }
  // how access works, said once and quietly
  const free = VISUALS.filter(v => v.access === 'free').map(v => v.title), rest = n - free.length;
  const names = free.length > 1 ? free.slice(0, -1).join(', ') + ' and ' + free[free.length - 1] : free[0];
  $('accessFree').textContent = `${names} ${free.length > 1 ? 'are' : 'is'} open to everyone: your beat in, a video out. No account.`;
  $('accessFull').textContent = `The other ${NUM[rest] || rest} open with full access: your own beats and the export, for ${PRICE}.`;
}

const hero = () => preview && preview.show(findVisual(HERO), $('heroFrame'));
function play(card) { if (preview) preview.show(findVisual(card.dataset.id), card.querySelector('.mini-th')); }

function wireStrip() {
  const strip = $('strip');
  // a pointer: the hovered card plays; leaving the strip sends the canvas back up to the hero
  strip.addEventListener('pointerover', e => { if (e.pointerType === 'touch') return; const c = e.target.closest('.mini'); if (c) play(c); });
  strip.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hero(); });
  // touch: whichever card is nearest the middle of the strip plays, once the strip is on screen
  let pending = 0, seen = false;
  const centred = () => {
    pending = 0; if (!touch() || !seen) return;
    const mid = strip.getBoundingClientRect().left + strip.clientWidth / 2;
    let best = null, bd = 1e9;
    for (const c of strip.children) { const r = c.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - mid); if (d < bd) { bd = d; best = c; } }
    if (best) play(best);
  };
  strip.addEventListener('scroll', () => { if (!pending) pending = requestAnimationFrame(centred); }, { passive: true });
  new IntersectionObserver(es => {
    for (const e of es) { seen = e.isIntersecting; if (!touch()) continue; if (seen) centred(); else hero(); }
  }, { threshold: 0.6 }).observe(strip);
}

function wireSound() {
  const b = $('heroSound');
  b.addEventListener('click', () => { if (preview) preview.sound(!preview.soundOn).catch(e => { console.error(e); b.textContent = 'No sound'; }); });
}

export function enterHome() {
  if (!started) {
    started = true; buildStrip(); wireStrip(); wireSound();
    ready = import('../../studio/js/preview.js')
      .then(m => m.createPreview({ dataUrl: 'assets/demo/demo.json', audioUrl: 'studio/demo.mp3' }))
      .then(p => {
        preview = p;
        const b = $('heroSound');
        p.onState(st => {
          b.textContent = st.loading ? 'Loading sound…' : st.soundOn ? 'Sound on' : 'Sound off';
          b.setAttribute('aria-pressed', String(st.soundOn));
        });
        hero();
        $('cv').classList.add('on');
        $('home').classList.add('live');
      })
      .catch(e => { console.error('live preview unavailable', e); $('heroSound').hidden = true; });   // the posters stay
  } else if (preview) hero();
}

// off the home page: no sound left playing somewhere the visitor can't see
export function leaveHome() { if (preview && preview.soundOn) preview.sound(false); }
