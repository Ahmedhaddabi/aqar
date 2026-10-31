# Customer inputs checklist

The platform is built with editable placeholders wherever the information belongs to the customer's business. Nothing below blocks development; each item must be completed (and the related tests re-run) before the customer goes live.

| # | Input | Placeholder now | Where the customer changes it |
|---|---|---|---|
| 1 | Company legal name, CR number, address, logo | Staging uses "Aqar 360 (Placeholder)" | Production setup wizard → Company |
| 2 | VAT registration and Oman VAT 5% tax template | None (no tax lines) | Company → Tax ID; Sales Taxes and Charges Template; tax_id shows on the bilingual invoice |
| 3 | Fiscal year and chart of accounts | 2026 calendar year, Standard chart | Setup wizard / Fiscal Year / Chart of Accounts |
| 4 | Content service prices (§6) | 120 / 100 / 150 / 180 / 250 / 300 / 600 OMR draft | Item Price (price list "Standard Selling"); seeding never overwrites edits |
| 5 | Included revision rounds per service | 1 per service | Item → "Included Revision Rounds" |
| 6 | Campaign management fee, extra revision price | 0 OMR | Item Price for AQ-CAMPAIGN-MGMT, AQ-EXTRA-REVISION |
| 7 | Payment-before-scheduling policy | Required (manager can override per order) | Content Order → Manager Overrides |
| 8 | Legal texts: terms, privacy, marketing consent, careers notice, supplier/consulting/content terms (§12.2) | No approved versions | Aqar Terms Version (Draft → Legal Review → Approved) |
| 9 | Customer email wording (Arabic/English) | 11 draft templates × 2 languages (v1, approved for staging) incl. §2.3 decline message | Aqar Message Template → create a new version and approve it (Aqar Manager/Admin); the old version retires automatically |
| 10 | Approval thresholds and approver roles | 6 rules seeded inactive (price cuts, discounts > 10%) | Aqar Approval Rule |
| 11 | SLA targets and working calendar | §8.3 values; Sun–Thu 08:00–17:00 | Aqar SLA Policy; Aqar Platform Settings → Working Hours; Holiday List |
| 12 | Areas, wilayats and coordinates | 11 governorates, 6 Muscat wilayats, 5 areas with approximate centres (no drawn boundaries) | Aqar Governorate / Wilayat / Area → Map Location (draw the area outline with the polygon tool) |
| 13 | Developer and project master lists, focal points (§27.27) | Empty | Aqar Development Project |
| 14 | Staff users and role assignment | Test users only | User → Roles (Aqar roles; add Accounts User for full accounting staff) |
| 15 | Outgoing email provider | Local Mailpit capture | Email Account (SMTP or provider) |
| 16 | Payment gateway (e.g. Thawani) | Not connected; payments recorded manually | Phase 2 `online_payment_checkout` flag + provider credentials |
| 17 | WhatsApp Business route | Not connected | Phase 2 `whatsapp_messaging` flag + Meta/BSP credentials |
| 18 | Form protection (Cloudflare Turnstile) | Not configured (Local/Staging only accept forms) | site_config `aqar_turnstile_secret` |
| 19 | Domain, hosting, off-server backup account | Local staging | Deployment runbook |
| 20 | Real personal data approval | Off | Aqar Platform Settings → Legal Approval Status (Approved) |
| 21 | Website contact details and company display name | Empty phone/WhatsApp/email; "عقار 360 / Aqar 360" | web/.env.local (NEXT_PUBLIC_CONTACT_*, NEXT_PUBLIC_COMPANY_NAME_*) |
| 22 | Website marketing copy (home, about, service intros) | Draft text based on the strategy | web/src/i18n/dictionaries.ts |
| 23 | Guides, area guides, FAQs, market insights (§14.3 90-day plan) | Two "(sample)" guides on staging | Aqar Content Page (unpublish/replace the samples) |
| 24 | Public domain and site URL | http://localhost:3000 | NEXT_PUBLIC_SITE_URL, FRAPPE_URL, FRAPPE_SITE |
| 25 | Google Tag Manager container | Not configured (no analytics loaded) | NEXT_PUBLIC_GTM_ID |
| 26 | Antivirus scanning for uploads | Basic checks only | Run ClamAV (clamd) and set `aqar_clamav_host` / `aqar_clamav_port` in site_config |
| 27 | Document retention periods per type | Optional "Retain Until" per document | Aqar Document; retention policy (legal) |
| 28 | Customer account email domain for sign-up links | Frappe site host | Frappe Website Settings / site URL (password links point to the Frappe host) |
| 29 | Messaging rules: quiet hours, weekly follow-up cap, "still searching?" interval | 21:00–08:00, 2 per week, 14 days | Aqar Platform Settings → Customer Messages |
| 30 | Staff daily digest time | 07:30 (server time) | hooks.py scheduler (developer change) |
| 31 | Map provider for production | OpenFreeMap (free, no key, community-run) | web/.env.local NEXT_PUBLIC_MAP_STYLE_URL (e.g. a MapTiler style URL with the customer's key) |
| 32 | Which projects/properties appear on the public map, and exact-location consent for owner properties | 2 "(Demo)" projects + 5 "(Demo)" properties on staging only | Visibility = Selected Public Page, Verification = Verified; Property → "Show Exact Location on Website" |
| 33 | Project cover images | None | Aqar Development Project → Cover Image (public file) |
| 34 | Project page content: gallery photos, Arabic description and payment plan, brochure (public file) | Drawn "DEMO IMAGE" placeholders and demo text on staging only | Aqar Development Project → Website Gallery, Description (Arabic), Payment Plan (Arabic), Brochure |
| 35 | Units per project for live availability | 6 demo units in "(Demo) Mawaleh Gardens" | Property (the building, linked to the project) → Property Units with Aqar Unit Type, size, price, status |
