import { CATEGORIES, VISUALS, findVisual } from './catalog.js';

const $ = id => document.getElementById(id);
const poster = v => `assets/posters/${v.id}.jpg`;
const catName = id => id === 'all' ? 'All' : (CATEGORIES.find(c => c.id === id) || {}).name || 'All';

// routes: #/all, #/<category>, #/<category>/<visual>
function parseRoute() {
  const [cat = 'all', vid = ''] = location.hash.replace(/^#\/?/, '').split('/');
  const known = cat === 'all' || CATEGORIES.some(c => c.id === cat);
  return { cat: known ? cat : 'all', visual: vid ? findVisual(vid) : null };
}

function renderCats(active) {
  const nav = $('cats'); nav.textContent = '';
  const items = [{ id: 'all', name: 'All', n: VISUALS.length }, ...CATEGORIES.map(c => ({ ...c, n: VISUALS.filter(v => v.category === c.id).length }))];
  for (const c of items) {
    const a = document.createElement('a'); a.href = `#/${c.id}`; a.textContent = c.name;
    const sup = document.createElement('sup'); sup.textContent = c.n; a.appendChild(sup);
    if (c.id === active) a.setAttribute('aria-current', 'page');
    nav.appendChild(a);
  }
  const cat = CATEGORIES.find(c => c.id === active);
  $('catNote').textContent = cat ? cat.note : 'Every visual reacts to the track: the kick, the 808, the melody, the hats.';
}

function renderGrid(cat) {
  const grid = $('grid'); grid.textContent = '';
  const list = VISUALS.filter(v => cat === 'all' || v.category === cat);
  list.forEach((v, i) => {
    const a = document.createElement('a'); a.className = 'card in'; a.href = `#/${cat}/${v.id}`; a.style.setProperty('--i', i);
    const th = document.createElement('div'); th.className = 'thumb';
    const img = document.createElement('img'); img.src = poster(v); img.alt = v.title; img.loading = 'lazy'; img.decoding = 'async';
    img.onerror = () => { img.remove(); };
    th.appendChild(img);
    const t = document.createElement('span'); t.className = 't'; t.textContent = v.title;
    const s = document.createElement('span'); s.className = 's'; s.textContent = v.line || '';
    a.append(th, t, s); grid.appendChild(a);
  });
}

function renderDetail(cat, v) {
  const list = VISUALS.filter(x => cat === 'all' || x.category === cat);
  const i = Math.max(0, list.findIndex(x => x.id === v.id));
  const prev = list[(i - 1 + list.length) % list.length], next = list[(i + 1) % list.length];
  $('back').href = `#/${cat}`; $('back').textContent = `← ${catName(cat)}`;
  $('detailTitle').textContent = v.title;
  $('detailMeta').textContent = catName(v.category);
  $('detailAbout').textContent = v.about;
  $('tryIt').href = `studio/?visual=${encodeURIComponent(v.id)}`;
  $('prev').href = `#/${cat}/${prev.id}`; $('next').href = `#/${cat}/${next.id}`;
  const img = $('detailPoster'); img.src = poster(v); img.alt = v.title;
  const fr = $('preview'); fr.classList.remove('live');
  const src = `studio/?visual=${encodeURIComponent(v.id)}&embed=1`;
  if (fr.dataset.src !== src) {
    fr.dataset.src = src; fr.src = src;
    // the studio needs a moment to decode and analyse the demo beat; show the poster until then
    fr.onload = () => setTimeout(() => fr.classList.add('live'), 1200);
  } else fr.classList.add('live');
}

function route() {
  const { cat, visual } = parseRoute();
  renderCats(cat);
  const detail = $('detail'), grid = $('grid');
  if (visual) {
    grid.hidden = true; detail.hidden = false;
    detail.classList.remove('in'); void detail.offsetWidth; detail.classList.add('in');
    renderDetail(cat, visual);
    document.title = `${visual.title} · Loop Radar`;
  } else {
    detail.hidden = true; grid.hidden = false;
    const fr = $('preview'); fr.src = 'about:blank'; fr.dataset.src = '';
    renderGrid(cat);
    document.title = cat === 'all' ? 'Loop Radar' : `${catName(cat)} · Loop Radar`;
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
document.addEventListener('keydown', e => {
  if ($('detail').hidden) return;
  if (e.key === 'ArrowRight') location.hash = $('next').getAttribute('href');
  if (e.key === 'ArrowLeft') location.hash = $('prev').getAttribute('href');
  if (e.key === 'Escape') location.hash = $('back').getAttribute('href');
});
if (!location.hash) history.replaceState(null, '', '#/all');
route();
