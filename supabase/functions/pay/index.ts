// pay: starts a one-month subscription payment. The signed-in user calls it from the account page; it writes a
// pending purchase (which gives the Robokassa invoice number), signs the payment with password #1 and returns the
// Robokassa page to send the browser to. Nothing secret reaches the browser.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ROBOKASSA_LOGIN        the shop's identifier (MerchantLogin)
//   ROBOKASSA_PASS1        password #1           ROBOKASSA_TEST_PASS1   test password #1
//   ROBOKASSA_PASS2        password #2           ROBOKASSA_TEST_PASS2   test password #2   (used by robokassa-result)
//   ROBOKASSA_TEST         '1' while testing (payments go through Robokassa's test mode), '0' or unset when live
//   ROBOKASSA_HASH         the signature algorithm chosen in the shop's settings: sha256 (default), md5 or sha512
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { crypto } from 'jsr:@std/crypto@1';
import { encodeHex } from 'jsr:@std/encoding@1/hex';

const PRICE = 499;   // rubles for one month; the offer and the site say the same
const DESCRIPTION = 'kristudio: подписка Full access на 1 месяц';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ALG: Record<string, string> = { md5: 'MD5', sha256: 'SHA-256', sha512: 'SHA-512' };
async function sign(s: string) {
  const alg = ALG[(Deno.env.get('ROBOKASSA_HASH') || 'sha256').toLowerCase()] || 'SHA-256';
  return encodeHex(await crypto.subtle.digest(alg as 'SHA-256', new TextEncoder().encode(s))).toUpperCase();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);

  const login = Deno.env.get('ROBOKASSA_LOGIN');
  const test = Deno.env.get('ROBOKASSA_TEST') === '1';
  const pass1 = Deno.env.get(test ? 'ROBOKASSA_TEST_PASS1' : 'ROBOKASSA_PASS1');
  if (!login || !pass1) return json({ error: 'Payments are not open yet. Try again a bit later.' }, 503);

  // who is paying: the user's own session token, checked here
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: who, error: whoErr } = await admin.auth.getUser(token);
  if (whoErr || !who?.user) return json({ error: 'Sign in first.' }, 401);
  const user = who.user;

  const { data: pur, error } = await admin.from('purchases')
    .insert({ user_id: user.id, product: 'month', provider: 'robokassa', amount: PRICE, currency: 'RUB', status: 'pending' })
    .select('inv_id').single();
  if (error || !pur) { console.error(error); return json({ error: 'Could not start the payment. Try again.' }, 500); }

  const outSum = PRICE.toFixed(2), inv = String(pur.inv_id);
  const params = new URLSearchParams({
    MerchantLogin: login, OutSum: outSum, InvId: inv, Description: DESCRIPTION,
    SignatureValue: await sign(`${login}:${outSum}:${inv}:${pass1}`), Culture: 'ru', Encoding: 'utf-8'
  });
  if (user.email) params.set('Email', user.email);   // the receipt goes to the account's email
  if (test) params.set('IsTest', '1');
  return json({ url: 'https://auth.robokassa.ru/Merchant/Index.aspx?' + params.toString() });
});
