// The account page (#/account): sign in, or who you are, your access, your saved looks, signing out.
import { VISUALS, PRICE } from './catalog.js';
import { configured, onAuth, signOut, cloudLooks, cloudDeleteLook } from './auth.js';
import { signinForm } from './signin.js';

const el = (tag, attrs = {}, text) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
const row = (dl, k, v) => { dl.append(el('dt', {}, k)); const dd = el('dd'); if (typeof v === 'string') dd.textContent = v; else dd.append(v); dl.append(dd); return dd; };

let box = null, unsub = null;
export function renderAccount(target) {
  box = target;
  if (unsub) unsub();
  unsub = onAuth(draw);
}

function draw(st) {
  if (!box || box.hidden) return;
  box.textContent = '';
  box.append(el('h1', { class: 'lead' }, 'Account'));
  if (!configured()) { box.append(el('p', { class: 'intro' }, 'Accounts are coming soon. Every preset can already be tried in the studio.')); return; }
  if (!st.ready) { box.append(el('p', { class: 'intro' }, 'Loading…')); return; }

  if (!st.user) {
    const free = VISUALS.filter(v => v.access === 'free').map(v => v.title).join(' and ');
    box.append(el('p', { class: 'intro' }, `One code by email, no password: it signs you in, or makes your account if you don't have one yet. ${free} need no account at all; full access, every preset with your own beats and the export, lives here.`));
    box.append(signinForm({ base: '', look: { form: 'signin', button: 'try', note: 'hint-line' } }));
    return;
  }

  const paid = st.profile && st.profile.access === 'paid';
  const dl = el('dl', { class: 'facts' });
  row(dl, 'Email', st.user.email || '');
  row(dl, 'Access', paid ? 'Full access: every preset, your own beats, the export.' : `Free: ${VISUALS.filter(v => v.access === 'free').map(v => v.title).join(' and ')}, with your own beats and the export.`);
  if (!paid) {
    const wrap = el('div', { class: 'sub-offer' });
    wrap.append(el('p', {}, `Every preset with your own beats, and the export. ${PRICE}.`));
    wrap.append(el('button', { type: 'button', class: 'try', disabled: '' }, 'Subscribe · soon'));
    wrap.append(el('p', { class: 'hint-line' }, 'Payments open soon. Everything else here already works.'));
    row(dl, 'Full access', wrap);
  }
  const looksDd = row(dl, 'Saved looks', 'Loading…');
  box.append(dl);
  const out = el('button', { type: 'button', class: 'acct-link' }, 'Sign out');
  out.addEventListener('click', () => signOut());
  box.append(out);

  cloudLooks().then(looks => {
    looksDd.textContent = '';
    if (!looks || !looks.length) { looksDd.textContent = 'None yet. Looks you save in the studio while signed in show up here, in every browser.'; return; }
    const ul = el('ul', { class: 'looklist' });
    for (const l of looks) {
      const v = VISUALS.find(x => x.look && x.look.preset === (l.data && l.data.preset));
      const li = el('li'); li.append(el('span', {}, l.name), el('span', { class: 'mute' }, v ? v.title : (l.data && l.data.preset) || ''));
      const x = el('button', { type: 'button', class: 'acct-link', 'aria-label': 'Delete ' + l.name }, 'Delete');
      x.addEventListener('click', async () => { if (await cloudDeleteLook(l.name)) li.remove(); });
      li.append(x); ul.append(li);
    }
    looksDd.append(ul);
  });
}
