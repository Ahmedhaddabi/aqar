# Online payments: Thawani and Paymob — setup

Customers pay an invoice from its private link (`/doc/<id>?s=…`, sent by email or WhatsApp from the invoice page).
The page shows a button for each gateway that is connected and switched on. Each payment is recorded once, as
method "Online", and the invoice becomes Partly paid or Paid automatically. Nothing needs to be built; only keys.

Where things live:

| What | Where |
|---|---|
| Keys and secrets | Vercel → Project → Settings → Environment Variables (never in the admin, never in Git) |
| Show / hide a gateway, webhook addresses to copy | Admin → Setup → Settings → Online payments |
| Payment attempts per invoice | Admin → ERP → Invoices → the invoice |
| Code | `web/src/lib/payments/` (thawani.ts, paymob.ts, index.ts), `web/src/app/api/pay/`, `web/src/app/api/webhooks/` |

After changing environment variables in Vercel, redeploy (Deployments → … → Redeploy).

## 1. Thawani

1. Open a merchant account with Thawani (business documents: CR, bank account). Ask for **UAT (test) keys** first.
2. In the Thawani merchant portal copy the **Secret key** and the **Publishable key**.
3. In Vercel add:
   - `THAWANI_MODE` = `test` (later `live`)
   - `THAWANI_SECRET_KEY`, `THAWANI_PUBLISHABLE_KEY`
4. In the Thawani portal → Webhooks, add the address shown in Admin → Settings → Online payments
   (`https://<your-domain>/api/webhooks/thawani`) and copy the **webhook secret** into `THAWANI_WEBHOOK_SECRET`.
   Without it, payments are still confirmed when the customer returns to the invoice page (the system asks Thawani
   for the session status), but a customer who closes the browser before returning would be confirmed only by the webhook.
5. Redeploy. Settings should show "Connected · Test mode".
6. Test: create an invoice for yourself, mark it sent, open the customer link, press "Pay with Thawani", pay with
   Thawani's UAT test card, and check the invoice shows the payment.
7. Go live: replace the keys with live keys, set `THAWANI_MODE=live`, update the webhook in the live portal, redeploy.

Technical notes (from Thawani's API): `POST /api/v1/checkout/session` with header `thawani-api-key`, amounts in baisa
(minimum 100), payment page `https://(uat)checkout.thawani.om/pay/<session_id>?key=<publishable key>`, status from
`GET /api/v1/checkout/session/<session_id>` (`payment_status: paid`). Webhook signature: `thawani-signature` =
HMAC-SHA256(webhook secret, `<raw body>-<thawani-timestamp>`) in hex.

## 2. Paymob (Oman)

1. Open a Paymob Oman merchant account. Test mode is available immediately after sign-up.
2. Dashboard → Settings → Account info: copy the **Secret key**, **Public key** and **HMAC secret**.
3. Dashboard → Developers → Payment integrations: note the **integration ID(s)** for Card (and OmanNet if enabled),
   in test mode first. The integration currency must be OMR.
4. In Vercel add `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_IDS` (comma-separated).
   Keep `PAYMOB_BASE_URL=https://oman.paymob.com`, `PAYMOB_CHECKOUT_URL=https://om.checkout.paymob.com`, `PAYMOB_AMOUNT_FACTOR=1000`.
5. In each payment integration set the **Transaction processed callback** to `https://<your-domain>/api/webhooks/paymob`
   and the **Transaction response callback** to `https://<your-domain>/api/pay/return/paymob`
   (the system also sends both addresses with every payment).
6. Redeploy. Settings should show "Connected · Test mode" (the mode follows the secret key: `…_test_…` or `…_live_…`).
7. Test with Paymob's test card. **Check the amount on Paymob's page**: an invoice of 12.500 OMR must show 12.500 OMR.
   If it shows 1000× too much or too little, change `PAYMOB_AMOUNT_FACTOR` (Paymob counts in the smallest unit).
8. Go live: switch to the live keys and live integration IDs, set the callbacks on the live integrations, redeploy.

Technical notes (from Paymob's docs): `POST https://oman.paymob.com/v1/intention/` with `Authorization: Token <secret key>`,
`amount` in the smallest unit, `special_reference` = our payment reference (returned as `merchant_order_id`), redirect to
`https://om.checkout.paymob.com/?publicKey=…&clientSecret=…`. Callbacks are verified with HMAC-SHA512 over the 20 fields of
Paymob's "HMAC Transaction Callback" page, in order; anything that fails the check is ignored.

## Safety built in

- The pay buttons work only from a valid signed invoice link; the amount is always the invoice's remaining balance,
  calculated on the server.
- A payment is recorded only after the gateway confirms it (status lookup or signed webhook) and only if the amount
  matches; mismatches are written to the activity log for a person to check.
- The same payment can be confirmed by the return page and the webhook; it is recorded once.
- Card details never touch our server: customers pay on Thawani's or Paymob's own page.
