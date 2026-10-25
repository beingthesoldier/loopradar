// The account button in the header. Accounts don't exist yet, so it opens a small note.
const btn = document.querySelector('.acct-btn'), menu = document.querySelector('.acct-menu');
if (btn && menu) {
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.addEventListener('click', e => { e.stopPropagation(); const open = menu.hidden; menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); });
  document.addEventListener('click', e => { if (!menu.contains(e.target)) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}
