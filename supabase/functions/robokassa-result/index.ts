// robokassa-result: the Result URL. Robokassa calls it when a payment has gone through. The signature is checked
// with password #2; then the purchase is marked paid and the account gets a month, added after any time it still
// has (grant_month in the database, which also makes a repeated call harmless). Robokassa expects "OK<InvId>".
// Test payments are accepted only while ROBOKASSA_TEST is '1'. Secrets: see ../pay/index.ts.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { crypto } from 'jsr:@std/crypto@1';
import { encodeHex } from 'jsr:@std/encoding@1/hex';

const ALG: Record<string, string> = { md5: 'MD5', sha256: 'SHA-256', sha512: 'SHA-512' };
async function sign(s: string) {
  const alg = ALG[(Deno.env.get('ROBOKASSA_HASH') || 'sha256').toLowerCase()] || 'SHA-256';
  return encodeHex(await crypto.subtle.digest(alg as 'SHA-256', new TextEncoder().encode(s))).toUpperCase();
}
const text = (body: string, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

Deno.serve(async (req) => {
  const params = req.method === 'POST' ? new URLSearchParams(await req.text()) : new URL(req.url).searchParams;
  const outSum = params.get('OutSum') || '', inv = params.get('InvId') || '', got = (params.get('SignatureValue') || '').toUpperCase();
  if (!/^\d+$/.test(inv) || !outSum || !got) return text('bad request', 400);

  // the live password always; the test one only while testing
  const passes = [Deno.env.get('ROBOKASSA_PASS2')];
  if (Deno.env.get('ROBOKASSA_TEST') === '1') passes.push(Deno.env.get('ROBOKASSA_TEST_PASS2'));
  const shp = [...params.keys()].filter(k => /^shp_/i.test(k)).sort().map(k => `${k}=${params.get(k)}`);
  let ok = false;
  for (const p of passes) if (p && (await sign([outSum, inv, p, ...shp].join(':'))) === got) ok = true;
  if (!ok) { console.error('bad signature for InvId', inv); return text('bad sign', 400); }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { error } = await admin.rpc('grant_month', { p_inv: Number(inv), p_amount: Number(outSum) });
  if (error) { console.error('grant_month', inv, error); return text('error', 500); }
  return text('OK' + inv);
});
