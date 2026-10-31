# Public website (M10)

Next.js 15 (App Router, TypeScript), bilingual: Arabic `/ar/...` (default, RTL) and English `/en/...`.
The browser only talks to this site; the site's server calls Frappe (`FRAPPE_URL`, site `FRAPPE_SITE`).

## Run locally

```powershell
./aqar360/infra/scripts/start-dev.ps1   # Frappe backend
./aqar360/infra/scripts/start-web.ps1   # website on http://localhost:3000 (add -Dev for hot reload)
```

Settings live in `web/.env.local` (copied from `.env.example`). Contact details, company name, GTM and Turnstile
keys are customer inputs (see `docs/customer_inputs.md`).

Public forms only accept requests while the Frappe feature flag `public_request_forms` is enabled with audience
"Everyone"; otherwise the pages show a contact panel instead of the form.

## What is where

| Path | Purpose |
|---|---|
| `src/app/[lang]/...` | Pages (home, request forms, content services, consulting, areas, insights, careers, suppliers, about, contact, legal, my-request) |
| `src/app/api/forms/[kind]` | Relays search / property / consultation forms to the Frappe intake API |
| `src/app/api/my-request` | Customer self-service via the private request link |
| `src/app/files/[...path]` | Public CMS images from Frappe (private files are never served) |
| `src/lib/frappe.ts` | Server-only Frappe client (passes the visitor IP for rate limiting) |
| `src/lib/content.ts` | Cached content getters (5 minutes) |
| `src/i18n/dictionaries.ts` | All interface text in Arabic and English; marketing copy is a draft for the customer |

Guides, area guides and FAQs are written in Frappe under **Aqar Content Page** (both languages are required to publish).

## Checks

```powershell
npm run typecheck
npm run build
npm run smoke            # against a running site; submits one synthetic request — staging only
```
