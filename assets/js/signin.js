// The sign-in form, in the header menu and on the account page. Two steps on one spot:
// the email (and the consent tick), then the code from the email. Nothing leaves this page.
import { sendCode, verifyCode } from './auth.js';
import { consentBox } from './consent.js';

const el = (tag, attrs = {}, text) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); if (text != null) n.textContent = text; return n; };
const say = err => {
  const m = (err && err.message) || '';
  if (/rate|security purposes|after \d+ seconds/i.test(m)) return 'Too many tries. Wait a minute and send it again.';
  if (/expired|invalid/i.test(m)) return "That code didn't work. Check it, or send a new one.";
  return m || 'Something went wrong. Try again.';
};

// look: { form, input, button, note } class names for where it sits
export function signinForm({ base = '', look }) {
  const box = el('div');
  let email = '';

  function askEmail() {
    box.textContent = '';
    const form = el('form', { class: look.form });
    const input = el('input', { type: 'email', required: '', placeholder: 'you@email.com', 'aria-label': 'Email', autocomplete: 'email', class: look.input || '' });
    if (email) input.value = email;
    const go = el('button', { type: 'submit', class: look.button }, 'Send code');
    const note = el('p', { class: look.note }, 'No password: we email you a code.');
    form.append(input, consentBox(base), go);
    box.append(form, note);
    form.addEventListener('submit', async e => {
      e.preventDefault(); go.disabled = true; note.textContent = 'Sending…';
      email = input.value.trim();
      try { await sendCode(email); askCode(); }
      catch (err) { note.textContent = say(err); go.disabled = false; }
    });
  }

  function askCode() {
    box.textContent = '';
    const form = el('form', { class: look.form });
    const input = el('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', required: '', maxlength: '14', placeholder: 'Code from the email', 'aria-label': 'Code from the email', class: (look.input || '') + ' code' });
    const go = el('button', { type: 'submit', class: look.button }, 'Sign in');
    const note = el('p', { class: look.note });
    note.append(`We sent a code to ${email}. It can take a minute; check spam too.`);
    const again = el('p', { class: look.note + ' again' });
    const resend = el('button', { type: 'button', class: 'linkish' }, 'Send a new code');
    const other = el('button', { type: 'button', class: 'linkish' }, 'Use another email');
    again.append(resend, ' · ', other);
    form.append(input, go);
    box.append(note, form, again);
    input.focus();
    form.addEventListener('submit', async e => {
      e.preventDefault(); go.disabled = true; note.textContent = 'Checking…';
      try { await verifyCode(email, input.value.replace(/\D/g, '')); }   // the page redraws itself once signed in
      catch (err) { note.textContent = say(err); go.disabled = false; }
    });
    resend.addEventListener('click', async () => {
      resend.disabled = true; note.textContent = 'Sending…';
      try { await sendCode(email); note.textContent = `A new code is on its way to ${email}.`; }
      catch (err) { note.textContent = say(err); }
      setTimeout(() => { resend.disabled = false; }, 30000);
    });
    other.addEventListener('click', askEmail);
  }

  askEmail();
  return box;
}
