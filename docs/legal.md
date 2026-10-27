# Legal pages (for Robokassa and Russian law)

Pages in `legal/` (in Russian, since the seller, the law and Robokassa's moderators are Russian):

| Page | What it is |
|---|---|
| `legal/index.html` | Documents and seller details: who sells, what, price, payment, how access is given, refunds, links |
| `legal/offer.html` | Public offer: free and paid parts, price, payment via Robokassa, auto-renewal, access, refusal and refunds, rights to videos |
| `legal/privacy.html` | Personal data policy (152-FZ) |
| `legal/consent.html` | Consent to personal data processing, a separate document (required since 1 Sep 2025, 156-FZ) |

The site footer (home, presets, about, account, studio) carries the seller's name, INN, city, contacts and a link to `legal/`, as Robokassa asks. Every sign-in form has an unticked, required consent tick linking to `consent.html` and `privacy.html`.

## Fill in before merging / before sending the site to Robokassa

Placeholders are marked in yellow on the legal pages and in square brackets in the footer:
`[ФИО полностью]`, `[ИНН]`, `[город]`, `[e-mail]`, `[телефон]`, `[цена]` (rubles per 30 days),
plus two lines in `privacy.html` section 6: who stores accounts (and in which country) and who hosts the site.

## Open points (not solved by the documents)

1. **Data localisation (152-FZ art. 18 part 5, stricter since 1 Jul 2025).** Russian citizens' personal data must first be collected into databases in Russia. The Supabase project is in `eu-north-1` (Stockholm). Before taking Russian users' emails for real: move accounts to a Russian database (or self-host on a Russian server), or get a lawyer's view. Until then the line in `privacy.html` that says data is collected in Russia is not true — it's marked to fix.
2. **Roskomnadzor notification.** An operator (self-employed included) notifies RKN before processing personal data with automated means (pd.rkn.gov.ru). If any data goes abroad, a separate cross-border transfer notification too (art. 12).
3. **Subscriptions (376-FZ, art. 16.1 consumer law, from 1 Mar 2026).** After a user refuses renewal or removes the card, no more auto-debits. Cancelling must be simple (in the account, without support). The offer also promises an email at least 24 hours before each charge with a cancel link — the server side must actually do this when payments are built.
4. **Robokassa recurring payments** need to be enabled by Robokassa; confirm they're available for a self-employed seller, and the fees, with their support.
5. **Price in rubles.** The offer states the ruble price; the site may also show ≈ $5.
6. **Subscribe step (when payments are built):** a tick accepting the offer, and a separate unticked tick agreeing to auto-renewal; log when and how each was given.

These are templates written from the law and Robokassa's published requirements, not legal advice; a lawyer's read before launch is worth it.
