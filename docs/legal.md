# Legal pages (for Robokassa and Russian law)

Pages in `legal/` (in Russian, since the seller, the law and Robokassa's moderators are Russian):

| Page | What it is |
|---|---|
| `legal/index.html` | Service, terms and seller details: who sells, the service and every preset described in Russian (the site itself is in English), price, how to subscribe, payment, how access is given, step-by-step refund, links |
| `legal/offer.html` | Public offer: free and paid parts, price, payment via Robokassa, one-month subscription without auto-renewal, access, refusal and refunds, rights to videos |
| `legal/privacy.html` | Personal data policy (152-FZ) |
| `legal/consent.html` | Consent to personal data processing, a separate document (required since 1 Sep 2025, 156-FZ) |

The site footer (home, presets, about, account, studio) carries the seller's name, INN, city, contacts and a link to `legal/`, as Robokassa asks. Every sign-in form has an unticked, required consent tick linking to `consent.html` and `privacy.html`.

## Seller details

Filled in on every legal page and in the footer: name, INN, city (Vladivostok), e-mail (mom3ntofsilence@gmail.com),
phone, price (499 ₽ per 30 days). The e-mail must actually receive mail before the site goes to Robokassa.

## Open points (not solved by the documents)

1. **Data localisation (152-FZ art. 18 part 5, stricter since 1 Jul 2025).** Russian citizens' personal data must first be collected into databases in Russia. The Supabase project is in `eu-north-1` (Stockholm); for now that's a conscious choice. The policy says truthfully where the data is; moving accounts to a Russian database is what would close this.
2. **Roskomnadzor notification.** An operator (self-employed included) notifies RKN before processing personal data with automated means (pd.rkn.gov.ru). If any data goes abroad, a separate cross-border transfer notification too (art. 12).
3. **No auto-renewal (decided 28 Oct 2026).** The subscription is one calendar month, paid by hand each time; nothing is charged without the user. That keeps the 376-FZ rules on recurring charges (consent tick, an email before each charge, one-click cancel) out of scope. If auto-renewal is ever added, those rules come back, the offer needs its renewal section again, and Robokassa has to enable recurring payments for a self-employed seller.
4. **Price in rubles.** The offer states the ruble price; the site shows rubles first, ≈ $5 after them.
5. **Subscribe step:** paying means accepting the offer (art. 438 GK), so the account page links the offer next to the pay button and asks for a tick before it.
6. **Russian language.** Consumer information has to be in Russian (Robokassa's check, 31 Oct 2026). The site is in English, so `legal/index.html` describes the service and each preset in Russian; when a preset is added to `catalog.js`, add its Russian description there too. If Robokassa insists on the whole site, the next step is a RU switch.
7. **Refunds (Robokassa's check, 31 Oct 2026).** Step by step on `legal/index.html` and in offer §7: a full refund before the period starts, unused days pro rata during it, no payment-service or bank fee kept back (deducting it is against the law), answer within 3 days, money back within 10.

These are templates written from the law and Robokassa's published requirements, not legal advice; a lawyer's read before launch is worth it.
