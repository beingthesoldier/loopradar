// The account button in the header (gallery and studio): signed out, a field for the email to send a
// sign-in link to; signed in, who you are, your access, the account page and signing out.
import { configured, initAuth, onAuth, sendLink, signOut } from './auth.js';

const btn = document.querySelector('.acct-btn'), menu = document.querySelector('.acct-menu');
const logo = document.querySelector('.logo');
const accountHref = (logo ? logo.getAttribute('href') : '#/').replace(/#\/.*$/, '#/account');
const el = (tag, attrs = {}, text) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };

function render(st) {
  if (!menu) return;
  menu.textContent = '';
  menu.appendChild(el('strong', {}, 'Account'));
  if (!configured()) { menu.appendChild(el('span', {}, 'Sign in is coming soon.')); return; }
  if (!st.ready) { menu.appendChild(el('span', {}, 'Loading…')); return; }
  if (!st.user) {
    const form = el('form', { class: 'acct-form' });
    const input = el('input', { type: 'email', required: '', placeholder: 'you@email.com', 'aria-label': 'Email', autocomplete: 'email' });
    const go = el('button', { type: 'submit', class: 'acct-go' }, 'Send sign-in link');
    const note = el('span', { class: 'acct-note' }, 'No password: we email you a link.');
    form.append(input, go, note);
    form.addEventListener('submit', async e => {
      e.preventDefault(); go.disabled = true; note.textContent = 'Sending…';
      try { await sendLink(input.value.trim()); note.textContent = 'Check your inbox and open the link in this browser.'; }
      catch (err) { note.textContent = err.message || 'Could not send the link.'; go.disabled = false; }
    });
    menu.appendChild(form);
    return;
  }
  menu.appendChild(el('span', { class: 'acct-email' }, st.user.email || ''));
  menu.appendChild(el('span', {}, st.profile && st.profile.access === 'paid' ? 'Full access' : 'Free presets'));
  menu.appendChild(el('a', { href: accountHref }, 'Your account'));
  const out = el('button', { type: 'button', class: 'acct-link' }, 'Sign out');
  out.addEventListener('click', () => signOut());
  menu.appendChild(out);
}

if (btn && menu) {
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', e => { if (!menu.contains(e.target) && e.target !== btn) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  menu.addEventListener('click', e => { if (e.target.tagName === 'A') close(); });
}
onAuth(st => { render(st); if (btn) btn.classList.toggle('in', !!st.user); });
initAuth();
