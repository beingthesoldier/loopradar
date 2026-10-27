# Accounts (Supabase)

Sign-in is by a 6-digit code sent to the visitor's email (no passwords). A code works in any browser, Instagram's included; a link would only work in the browser that asked for it. Each account has an access level,
`free` or `paid`. Every preset can be tried by anyone; exporting a preset marked **Paid** in
`assets/js/catalog.js` (`access: 'paid'`) needs an account with `paid` access. Saved looks sync to the
account when signed in.

Until `assets/js/config.js` is filled in, the site works as before and the account menu says accounts are coming soon.

## Free and full access

- **Free** presets (Radar, Orb): anyone, with their own beat and the export, no account.
- **Full access** presets (the rest): anyone can play with them on the demo beat. Bringing your own beat
  (audio or MIDI) or exporting opens a short note in the studio (`studio/js/ui/gate.js`) that points to
  the account page, where full access will be a subscription (price in `PRICE`, `assets/js/catalog.js`).
- Which preset is which: `access` in `assets/js/catalog.js`. On the site it reads "Free" / "Full access".

## One-time setup

1. **Tables.** Supabase → SQL Editor → New query → paste all of `supabase/schema.sql` → Run.
   It creates `profiles` (one row per account, made automatically on sign-up), `purchases` and `looks`,
   all with row-level security: a visitor only ever sees and changes their own rows, and nobody can
   give themselves paid access from the browser.
2. **Keys.** Project Settings → API (or *Data API* / *API Keys*): copy the **Project URL** and the
   **publishable** key (or the legacy **anon public** key) into `assets/js/config.js`.
   Both are public by design. **Never** put the `secret` / `service_role` key there or anywhere in this repo.
3. **Redirects.** Authentication → URL Configuration:
   - Site URL: `http://localhost:8000` (later, the real domain)
   - Redirect URLs: add `http://localhost:8000/**` (later also `https://<your domain>/**`)
4. **Email.** The built-in sender only allows a few emails an hour and is meant for testing.
   Before launch: Authentication → Emails → SMTP Settings, plug in a real sender (Resend, Postmark, Brevo…).
   The link must be opened in the same browser it was requested from.

## Giving someone paid access by hand

Table Editor → `profiles` → find the row by email → set `access` to `paid` → Save.
They see it after reloading the page. This is also how to test the paid side.

## What is and isn't protected

- The database is protected for real: access can only be changed with the secret key (Table Editor,
  or a future payment handler on the server).
- The export lock itself runs in the browser, so someone who knows JavaScript can switch it off.
  That's fine for now; real protection would mean rendering or watermarking on a server.
- Payments aren't connected yet. When they are, a server function (Supabase Edge Function) receives
  the payment provider's confirmation, writes a row to `purchases` and sets `profiles.access = 'paid'`.

## Codes instead of links (one-time setup)

The site asks for the code from the email. For the email to carry a code, its template must use `{{ .Token }}`,
and on a free project the templates can only be edited once a custom SMTP sender is set.

1. **SMTP** (Authentication → Emails → SMTP Settings → enable custom SMTP). With a Gmail account:
   turn on 2-Step Verification in the Google account, create an App password, then
   host `smtp.gmail.com`, port `465`, username = the Gmail address, password = the app password,
   sender email = the Gmail address, sender name `kristudio`.
2. **Templates** (Authentication → Emails → Templates). Both **Confirm signup** (first sign-in) and **Magic link** (later ones):
   - Subject: `Your kristudio code: {{ .Token }}`
   - Body:
     ```html
     <p>Your code for kristudio:</p>
     <p style="font-size:28px;letter-spacing:6px;font-family:monospace">{{ .Token }}</p>
     <p>Type it on the page where you asked for it. It works once and expires in an hour.</p>
     ```
3. **Rate limit** (Authentication → Rate Limits): emails per hour, raise from the default if needed.

Until step 2 is done the emails still carry a link; it signs in only in the browser that asked for it.
