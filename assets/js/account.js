// The account page (#/account): sign in, or who you are, your access, your saved looks, signing out.
import { VISUALS } from './catalog.js';
import { configured, onAuth, sendLink, signOut, cloudLooks, cloudDeleteLook } from './auth.js';

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
    box.append(el('p', { class: 'intro' }, 'Sign in with your email: we send you a link, no password. The free presets export without an account; the paid ones need full access.'));
    const form = el('form', { class: 'signin' });
    const input = el('input', { type: 'email', required: '', placeholder: 'you@email.com', 'aria-label': 'Email', autocomplete: 'email' });
    const go = el('button', { type: 'submit', class: 'try' }, 'Send sign-in link');
    const note = el('p', { class: 'hint-line' });
    form.append(input, go); box.append(form, note);
    form.addEventListener('submit', async e => {
      e.preventDefault(); go.disabled = true; note.textContent = 'Sending…';
      try { await sendLink(input.value.trim()); note.textContent = 'Check your inbox and open the link in this browser.'; }
      catch (err) { note.textContent = err.message || 'Could not send the link.'; go.disabled = false; }
    });
    return;
  }

  const paid = st.profile && st.profile.access === 'paid';
  const dl = el('dl', { class: 'facts' });
  row(dl, 'Email', st.user.email || '');
  row(dl, 'Access', paid ? 'Full access: every preset exports.' : `Free presets: ${VISUALS.filter(v => v.access === 'free').map(v => v.title).join(', ')}.`);
  if (!paid) {
    const buy = el('button', { type: 'button', class: 'try', disabled: '' }, 'Get full access · soon');
    row(dl, 'Full access', buy);
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
