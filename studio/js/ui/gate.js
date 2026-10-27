// Full access in the studio. A preset with full access plays on the demo beat for anyone, as long as they like;
// bringing your own beat (audio or MIDI) and exporting it are what full access opens.
// When someone reaches for one of those, a quiet note says so and points to the account page.
import { S } from '../state.js';
import { $ } from '../util.js';
import { canExport, configured, getState, onAuth } from '../../../assets/js/auth.js';
import { VISUALS, PRICE } from '../../../assets/js/catalog.js';

export const locked = () => !!S.visual && !canExport(S.visual);
const ready = () => new Promise(res => { const off = onAuth(st => { if (st.ready || !configured()) { setTimeout(() => off(), 0); res(st); } }); });

const el = (tag, attrs = {}, text) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };

let dlg = null;
function build() {
  dlg = el('dialog', { class: 'gate', 'aria-labelledby': 'gateTitle' });
  dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // a click outside the card closes it
  document.body.appendChild(dlg);
}

// why: 'beat' (their own audio or MIDI) or 'export'
export async function gate(why) {
  const st = configured() ? await ready() : getState();
  if (!locked()) return false;
  if (!dlg) build();
  dlg.textContent = '';
  const v = S.visual, free = VISUALS.filter(x => x.access === 'free');
  const card = el('div', { class: 'gate-card' });
  card.append(el('p', { class: 'gate-k' }, 'Full access'));
  card.append(el('h2', { id: 'gateTitle' }, why === 'export' ? `Exporting ${v.title} comes with full access` : `${v.title} with your own beat comes with full access`));
  card.append(el('p', {}, `Play with it on the demo beat as long as you like. Your own beats and the export open with full access: every preset, ${PRICE}.`));
  const act = el('div', { class: 'gate-act' });
  if (!configured()) act.append(el('span', { class: 'hint' }, 'Accounts are coming soon.'));
  else act.append(el('a', { class: 'btn primary', href: '../#/account' }, st.user ? 'Get full access' : 'Sign in or create an account'));
  const stay = el('button', { type: 'button', class: 'btn' }, 'Keep playing'); stay.addEventListener('click', () => dlg.close());
  act.append(stay); card.append(act);
  if (free.length) {
    const alt = el('p', { class: 'hint' }, 'Or take ');
    free.forEach((x, i) => { alt.append(el('a', { href: `?visual=${x.id}` }, x.title)); if (i < free.length - 1) alt.append(i === free.length - 2 ? ' or ' : ', '); });
    alt.append(': free, with your own beat and the export.');
    card.append(alt);
  }
  if (st.user === null && configured()) card.append(el('p', { class: 'hint' }, 'Signing in is one email link, no password.'));
  dlg.append(card);
  dlg.showModal();
  return true;
}

// a beat dropped or picked on a locked preset stops here, before the loaders see it
function guard(e) {
  if (!locked()) return;
  e.preventDefault(); e.stopImmediatePropagation();
  gate('beat');
}
export function wireGate() {
  for (const id of ['drop', 'midiDrop']) {
    const z = $(id); if (!z) continue;
    z.addEventListener('click', guard, true);
    z.addEventListener('drop', guard, true);
  }
  // a quiet line under the beat box while the preset is locked
  const hint = el('p', { class: 'hint gate-hint', hidden: '' }, 'This preset plays on the demo beat. Your own beat comes with full access.');
  const box = $('midiDrop'); if (box) box.after(hint);
  onAuth(() => { hint.hidden = !locked(); });
}
