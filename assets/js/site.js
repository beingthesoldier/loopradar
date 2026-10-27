import { CATEGORIES, VISUALS, findVisual } from './catalog.js';
import { renderAccount } from './account.js';
import { enterHome, leaveHome } from './home.js';

const $ = id => document.getElementById(id);
const poster = v => `assets/posters/${v.id}.jpg`;
const isCat = id => CATEGORIES.some(c => c.id === id);
const catName = id => (CATEGORIES.find(c => c.id === id) || {}).name || 'All presets';
// links inside Presets: #/presets, #/presets/<category>, #/presets/<visual>, #/presets/<category>/<visual>
const presetsHref = (cat, v) => '#/presets' + (cat !== 'all' ? '/' + cat : '') + (v ? '/' + v.id : '');

// routes: #/ home, #/about, #/presets/…  (links from before Presets existed, #/all, #/dark/radar, still work)
function parseRoute() {
  let parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'all' || isCat(parts[0])) {
    parts = ['presets', ...(parts[0] === 'all' ? parts.slice(1) : parts)];
    history.replaceState(null, '', '#/' + parts.join('/'));
  }
  const [page = 'home', a = '', b = ''] = parts;
  if (page === 'about') return { page: 'about' };
  if (page === 'account') return { page: 'account' };
  if (page !== 'presets') return { page: 'home' };
  if (isCat(a)) return { page: 'presets', cat: a, visual: b ? findVisual(b) : null };
  return { page: 'presets', cat: 'all', visual: a ? findVisual(a) : null };
}

function renderNav(r) {
  const box = $('cats'); box.textContent = '';
  for (const c of CATEGORIES) {
    const a = document.createElement('a'); a.href = presetsHref(c.id); a.textContent = c.name;
    const sup = document.createElement('sup'); sup.textContent = VISUALS.filter(v => v.category === c.id).length; a.appendChild(sup);
    if (r.page === 'presets' && r.cat === c.id) a.setAttribute('aria-current', 'page');
    box.appendChild(a);
  }
  $('navCount').textContent = VISUALS.length;
  const cur = (el, on) => on ? el.setAttribute('aria-current', 'page') : el.removeAttribute('aria-current');
  cur($('navHome'), r.page === 'home');
  cur($('navAbout'), r.page === 'about');
  cur($('navPresets'), r.page === 'presets' && r.cat === 'all');
  $('nav').dataset.sec = r.page;
  const cat = CATEGORIES.find(c => c.id === r.cat);
  $('catNote').hidden = r.page !== 'presets';
  // the home page keeps the menu to its three places; the categories show once you're in Presets
  $('cats').hidden = r.page === 'home';
  $('catNote').textContent = cat ? cat.note : 'Every preset reacts to the track: the kick, the 808, the melody, the hats.';
}

function renderGrid(cat) {
  const grid = $('grid'); grid.textContent = '';
  const list = VISUALS.filter(v => cat === 'all' || v.category === cat);
  list.forEach((v, i) => {
    const a = document.createElement('a'); a.className = 'card in'; a.href = presetsHref(cat, v); a.style.setProperty('--i', i);
    const th = document.createElement('div'); th.className = 'thumb';
    const img = document.createElement('img'); img.src = poster(v); img.alt = v.title; img.loading = 'lazy'; img.decoding = 'async';
    img.onerror = () => { img.remove(); };
    th.appendChild(img);
    const t = document.createElement('span'); t.className = 't'; t.textContent = v.title;
    const tag = document.createElement('i'); tag.className = 'tag ' + (v.access || 'paid'); tag.textContent = v.access === 'free' ? 'Free' : 'Paid';
    t.appendChild(tag);
    const s = document.createElement('span'); s.className = 's'; s.textContent = v.line || '';
    a.append(th, t, s); grid.appendChild(a);
  });
}

function renderDetail(cat, v) {
  const list = VISUALS.filter(x => cat === 'all' || x.category === cat);
  const i = Math.max(0, list.findIndex(x => x.id === v.id));
  const prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
  $('back').href = presetsHref(cat); $('back').textContent = `← ${catName(cat)}`;
  $('detailTitle').textContent = v.title;
  $('detailMeta').textContent = `${catName(v.category)} · ${v.access === 'free' ? 'Free' : 'Paid'}`;
  $('detailAbout').textContent = v.about;
  $('tryIt').href = `studio/index.html?visual=${encodeURIComponent(v.id)}`;
  $('prev').href = presetsHref(cat, prev); $('next').href = presetsHref(cat, next);
  const img = $('detailPoster'); img.src = poster(v); img.alt = v.title;
  const fr = $('preview'); fr.classList.remove('live');
  const src = `studio/index.html?visual=${encodeURIComponent(v.id)}&embed=1`;
  if (fr.dataset.src !== src) {
    fr.dataset.src = src; fr.src = src;
    // the studio needs a moment to decode and analyse the demo beat; show the poster until then
    fr.onload = () => setTimeout(() => fr.classList.add('live'), 1200);
  } else fr.classList.add('live');
}

const SECTIONS = ['home', 'about', 'account', 'grid', 'detail'];
function show(id) {
  for (const s of SECTIONS) $(s).hidden = s !== id;
  const el = $(id); el.classList.remove('in'); void el.offsetWidth; el.classList.add('in');
  if (id !== 'detail') { const fr = $('preview'); fr.src = 'about:blank'; fr.dataset.src = ''; }
}

function route() {
  const r = parseRoute();
  renderNav(r);
  if (r.page !== 'home') leaveHome();
  if (r.page === 'home') { show('home'); enterHome(); document.title = 'kristudio'; }
  else if (r.page === 'about') { show('about'); document.title = 'About · kristudio'; }
  else if (r.page === 'account') { show('account'); renderAccount($('account')); document.title = 'Account · kristudio'; }
  else if (r.visual) { show('detail'); renderDetail(r.cat, r.visual); document.title = `${r.visual.title} · kristudio`; }
  else { show('grid'); renderGrid(r.cat); document.title = r.cat === 'all' ? 'Presets · kristudio' : `${catName(r.cat)} · kristudio`; }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
document.addEventListener('keydown', e => {
  if ($('detail').hidden) return;
  if (e.key === 'ArrowRight') location.hash = $('next').getAttribute('href');
  if (e.key === 'ArrowLeft') location.hash = $('prev').getAttribute('href');
  if (e.key === 'Escape') location.hash = $('back').getAttribute('href');
});
route();
