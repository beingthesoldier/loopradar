// The account button in the header (gallery and studio): signed out, the sign-in form (email, then the code
// from the email); signed in, who you are, your access, the account page and signing out.
import { configured, initAuth, onAuth, signOut } from './auth.js';
import { signinForm } from './signin.js';

const btn = document.querySelector('.acct-btn'), menu = document.querySelector('.acct-menu');
const logo = document.querySelector('.logo');
const accountHref = (logo ? logo.getAttribute('href') : '#/').replace(/#\/.*$/, '#/account');
const rootHref = (logo ? logo.getAttribute('href') : '#/').replace(/#.*$/, '');
const el = (tag, attrs = {}, text) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };

function render(st) {
  if (!menu) return;
  menu.textContent = '';
  menu.appendChild(el('strong', {}, 'Account'));
  if (!configured()) { menu.appendChild(el('span', {}, 'Sign in is coming soon.')); return; }
  if (!st.ready) { menu.appendChild(el('span', {}, 'Loading…')); return; }
  if (!st.user) {
    menu.appendChild(signinForm({ base: rootHref, look: { form: 'acct-form', button: 'acct-go', note: 'acct-note' } }));
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
  // composedPath: a button inside the menu that redraws the form is gone from the page by now, but was in the menu
  document.addEventListener('click', e => { const path = e.composedPath(); if (!path.includes(menu) && !path.includes(btn)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  menu.addEventListener('click', e => { if (e.target.tagName === 'A') close(); });
}
onAuth(st => { render(st); if (btn) btn.classList.toggle('in', !!st.user); });
initAuth();
