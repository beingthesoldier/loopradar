# Payments (Robokassa)

A subscription is **one month** of full access for **499 ₽**, paid by hand. It never renews by itself; paying again
before the month is up adds a month after the current one. The account page shows the end date and the button.

## How it works

1. Account page → tick the offer → **Subscribe for a month** (or **Renew**). The browser calls the `pay` function.
2. `pay` (Supabase Edge Function) checks who is signed in, writes a pending row in `purchases` (its `inv_id` is the
   Robokassa invoice number), signs `MerchantLogin:OutSum:InvId:Password#1` and returns the Robokassa page.
3. The person pays on Robokassa's page. Robokassa calls the **Result URL** (`robokassa-result`), which checks
   `OutSum:InvId:Password#2` and calls `grant_month` in the database: the purchase becomes `paid` and
   `profiles.paid_until` moves a month on. It answers `OK<InvId>`.
4. Robokassa sends the person back to `#/account?paid=1` (or `?paid=0` if they cancelled); the page waits until the
   new date shows up.

Card details never touch the site. Receipts for the self-employed go through the "Мой налог" link set up in
Robokassa; the receipt's line is the payment description, "kristudio: подписка Full access на 1 месяц".

## Robokassa shop settings (Технические настройки)

| Setting | Value |
| --- | --- |
| Алгоритм расчёта хеша | SHA256 |
| Result URL | `https://viiaumpjzeenkdhvrxwp.supabase.co/functions/v1/robokassa-result`, method POST |
| Success URL | `https://kristudio.tech/#/account?paid=1`, method GET |
| Fail URL | `https://kristudio.tech/#/account?paid=0`, method GET |
| Пароль #1, #2 | generate; live and test pairs are separate |

## Secrets (Supabase → Edge Functions → Secrets)

Set them in the dashboard; never in the code, GitHub or a chat.

| Name | Value |
| --- | --- |
| `ROBOKASSA_LOGIN` | the shop's identifier (MerchantLogin) |
| `ROBOKASSA_PASS1`, `ROBOKASSA_PASS2` | live passwords #1 and #2 |
| `ROBOKASSA_TEST_PASS1`, `ROBOKASSA_TEST_PASS2` | test passwords #1 and #2 |
| `ROBOKASSA_TEST` | `1` while testing, `0` when live |
| `ROBOKASSA_HASH` | only if the shop uses another algorithm: `md5` or `sha512` (default `sha256`) |

## Testing, then going live

1. Set the test passwords, `ROBOKASSA_LOGIN` and `ROBOKASSA_TEST=1`. Pay from the account page; Robokassa's test
   page lets you finish without a real card. The account should show "Full access until …" within seconds.
2. Check: Supabase → Table editor → `purchases` (the row is `paid`) and Edge Functions → logs if it isn't.
3. Live: set the live passwords and `ROBOKASSA_TEST=0`. Test payments are refused from then on.

## Giving access by hand

`profiles.access = 'paid'` still means full access with no end date (the owner, friends). To give someone a month,
add to `paid_until` in the table editor.
