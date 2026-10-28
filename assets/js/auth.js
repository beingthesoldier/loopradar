// Accounts, on Supabase: sign in with a code sent by email, who is signed in, their access (free, or a paid
// month that ends on paid_until), paying for a month through Robokassa, and their saved looks. Shared by the gallery and the studio; everything here is a no-op until
// config.js is filled in, so the site keeps working without it.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const SB_MODULE = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
export const configured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

let clientP = null;
function client() {
  if (!configured()) return Promise.resolve(null);
  return clientP || (clientP = import(SB_MODULE)
    .then(m => m.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' } }))
    .catch(e => { console.error('accounts unavailable', e); return null; }));
}

// state: { ready, user, profile: { email, access, paid_until } }
let state = { ready: false, user: null, profile: null };
const listeners = new Set();
export const getState = () => state;
export function onAuth(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); }
function emit(patch) { state = { ...state, ...patch }; for (const f of listeners) f(state); }

async function loadProfile(sb, user) {
  if (!user) return null;
  const { data, error } = await sb.from('profiles').select('email, access, paid_until').eq('id', user.id).maybeSingle();
  if (error) console.error(error);
  return data || { email: user.email, access: 'free' };
}

let started = false;
export async function initAuth() {
  if (started) return; started = true;
  const sb = await client();
  if (!sb) { emit({ ready: true }); return; }
  const { data } = await sb.auth.getSession();
  const user = data.session ? data.session.user : null;
  emit({ ready: true, user, profile: await loadProfile(sb, user) });
  sb.auth.onAuthStateChange((_ev, session) => {
    const u = session ? session.user : null;
    if ((u && u.id) === (state.user && state.user.id)) return;
    loadProfile(sb, u).then(profile => emit({ user: u, profile }));
  });
}

// Signing in is a code sent by email (the same request also makes the account the first time).
// A code works wherever it's typed: Instagram's browser, another device, a mail app that opens links elsewhere.
// If the email still carries a link (template not switched yet), the link keeps working in the same browser.
export async function sendCode(email) {
  const sb = await client(); if (!sb) throw new Error('Accounts are not set up yet.');
  const base = location.origin + location.pathname.replace(/studio\/[^/]*$/, '').replace(/index\.html$/, '');
  const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: base + '#/account', shouldCreateUser: true } });
  if (error) throw error;
}
export const sendLink = sendCode;
export async function verifyCode(email, token) {
  const sb = await client(); if (!sb) throw new Error('Accounts are not set up yet.');
  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  const user = data && data.user;
  if (user) emit({ ready: true, user, profile: await loadProfile(sb, user) });
}
export async function signOut() { const sb = await client(); if (sb) await sb.auth.signOut(); emit({ user: null, profile: null }); }

// paid: a month that hasn't run out yet, or access given by hand ('paid' with no end date)
export const paidUntil = (p = state.profile) => p && p.paid_until ? new Date(p.paid_until) : null;
export const isPaid = (p = state.profile) => !!p && (p.access === 'paid' || (!!paidUntil(p) && paidUntil(p) > new Date()));
export const hasPaid = () => isPaid();

// read the profile again (after a payment, the server moves paid_until a month on)
export async function refreshProfile() {
  const sb = await client(); if (!sb || !state.user) return null;
  const profile = await loadProfile(sb, state.user);
  emit({ profile });
  return profile;
}

// a month of full access: the server writes the order and signs it, and the browser goes to Robokassa to pay
export async function startPayment() {
  const sb = await client(); if (!sb || !state.user) throw new Error('Sign in first.');
  const { data, error } = await sb.functions.invoke('pay', { body: {} });
  if (error) {
    let msg = 'Payments are not open yet. Try again a bit later.';
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (e) {}
    throw new Error(msg);
  }
  if (!data || !data.url) throw new Error('Payments are not open yet. Try again a bit later.');
  location.href = data.url;
}
// free visuals export for everyone; paid ones for accounts with paid access
export const canExport = v => !v || v.access !== 'paid' || hasPaid();

/* ---------------- saved looks in the account ---------------- */
export async function cloudLooks() {
  const sb = await client(); if (!sb || !state.user) return null;
  const { data, error } = await sb.from('looks').select('name, data, updated_at').order('updated_at');
  if (error) { console.error(error); return null; }
  return data;
}
export async function cloudSaveLook(name, data) {
  const sb = await client(); if (!sb || !state.user) return false;
  const { error } = await sb.from('looks').upsert({ user_id: state.user.id, name, data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,name' });
  if (error) console.error(error);
  return !error;
}
export async function cloudDeleteLook(name) {
  const sb = await client(); if (!sb || !state.user) return false;
  const { error } = await sb.from('looks').delete().eq('user_id', state.user.id).eq('name', name);
  if (error) console.error(error);
  return !error;
}
