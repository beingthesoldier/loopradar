// The account page (#/account): sign in, or who you are, your access, the one-month subscription, your saved
// looks, signing out. The subscription is a month paid by hand through Robokassa; it never renews by itself.
// Paying again before the month is up adds a month after the current one, so no days are lost.
// Robokassa sends people back to #/account?paid=1 (paid) or ?paid=0 (cancelled).
import { VISUALS } from './catalog.js';
import { configured, onAuth, signOut, cloudLooks, cloudDeleteLook, isPaid, paidUntil, refreshProfile, startPayment } from './auth.js';
import { signinForm } from './signin.js';

const el = (tag, attrs = {}, text) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
const row = (dl, k, v) => { dl.append(el('dt', {}, k)); const dd = el('dd'); if (typeof v === 'string') dd.textContent = v; else dd.append(v); dl.append(dd); return dd; };

let box = null, unsub = null;
export function renderAccount(target) {
  box = target;
  if (unsub) unsub();
  readReturn();
  unsub = onAuth(draw);
}

const PRICE_RUB = 499;
const day = 864e5;
const fmtDate = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const left = d => { const n = Math.floor((d - Date.now()) / day); return n >= 2 ? `${n} days left` : n === 1 ? '1 day left' : 'ends today'; };

// back from Robokassa: say what happened, and wait for the server to open the month
let notice = null, last = null;   // notice: { kind: 'wait' | 'ok' | 'off', text }; last: the last auth state drawn
function readReturn() {
  const q = new URLSearchParams((location.hash.split('?')[1] || ''));
  const paid = q.get('paid');
  if (paid == null) return;
  history.replaceState(null, '', location.pathname + location.search + '#/account');
  if (paid === '0') { notice = { kind: 'off', text: 'The payment was cancelled. Nothing was charged.' }; return; }
  notice = { kind: 'wait', text: 'Thanks! The payment went through; opening your month of full access…' };
  const before = paidUntil(), t0 = Date.now();
  const tick = async () => {
    const p = await refreshProfile();
    const until = paidUntil(p);
    if (until && (!before || until > before)) { notice = { kind: 'ok', text: `Done: full access until ${fmtDate(until)}.` }; if (last) draw(last); return; }
    if (Date.now() - t0 > 90e3) { notice = { kind: 'off', text: 'The payment is taking longer than usual to come through. Refresh this page in a minute; if access still isn\'t on, write to mom3ntofsilence@gmail.com and it will be sorted.' }; if (last) draw(last); return; }
    setTimeout(tick, 2500);
  };
  setTimeout(tick, 1200);
}

// the subscription block: what a month gives, the offer tick, the pay button
function subBlock(st) {
  const until = paidUntil(st.profile), on = isPaid(st.profile);
  const wrap = el('div', { class: 'sub-offer' });
  const head = el('p', { class: 'sub-head' }); head.append(el('strong', {}, `One month · ${PRICE_RUB} ₽`), ' (about $5)'); wrap.append(head);
  wrap.append(el('p', {}, on
    ? 'Renew whenever you like: the new month starts when this one ends, so no days are lost.'
    : 'Every preset with your own beats and MIDI, and the export, for a month. It never renews by itself: nothing is charged unless you pay again.'));
  const label = el('label', { class: 'consent' }), tick = el('input', { type: 'checkbox' }), txt = el('span');
  const offer = el('a', { href: 'legal/offer.html', target: '_blank', rel: 'noopener' }, 'offer');
  txt.append('I accept the ', offer, ' (in Russian): a one-month subscription, no auto-renewal');
  label.append(tick, txt); wrap.append(label);
  const go = el('button', { type: 'button', class: 'try', disabled: '' }, `${on && until ? 'Renew' : 'Subscribe'} for a month · ${PRICE_RUB} ₽`);
  const msg = el('p', { class: 'hint-line', 'aria-live': 'polite' }, 'Paid through Robokassa: cards and the other ways they offer. The receipt comes to your email.');
  tick.addEventListener('change', () => { go.disabled = !tick.checked; });
  go.addEventListener('click', async () => {
    go.disabled = true; msg.textContent = 'Opening Robokassa…';
    try { await startPayment(); } catch (e) { msg.textContent = e.message; go.disabled = !tick.checked; }
  });
  wrap.append(go, msg);
  return wrap;
}

function draw(st) {
  last = st;
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

  if (notice) box.append(el('p', { class: 'notice ' + notice.kind, role: 'status' }, notice.text));
  const on = isPaid(st.profile), until = paidUntil(st.profile), frees = VISUALS.filter(v => v.access === 'free').map(v => v.title).join(' and ');
  const dl = el('dl', { class: 'facts' });
  row(dl, 'Email', st.user.email || '');
  let access;
  if (on && until) access = `Full access until ${fmtDate(until)} · ${left(until)}. Every preset, your own beats, the export.`;
  else if (on) access = 'Full access: every preset, your own beats, the export.';
  else if (until) access = `Free: ${frees}. Your month of full access ended on ${fmtDate(until)}.`;
  else access = `Free: ${frees}, with your own beats and the export.`;
  row(dl, 'Access', access);
  // access given by hand, with no end date, has nothing to renew
  if (!(on && !until)) row(dl, 'Subscription', subBlock(st));
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
