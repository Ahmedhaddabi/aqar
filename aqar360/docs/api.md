# API contract plan and Phase 0 surface

Phase 0 adds no guest submission API or public AI API. Native Frappe routes remain upstream functionality, not an approved customer platform.

| Surface | Current status |
|---|---|
| GET /api/method/ping | Native liveness only; does not prove app/database readiness |
| /api/resource/Aqar Platform Settings | Native authenticated resource API; System Manager/Aqar Admin only |
| Legacy real_estate tenant-portal mutation/PDF methods | Denied by aqar360 override on the staging site |
| Public forms, customer account, secure edit links | Planned Phase 1; unavailable |
| Staff/integration service accounts | Not provisioned; scoped permissions required before use |
| AI tools/provider calls | Disabled; no gateway implementation yet |

Future guest methods: submit search/property/project/consultation/supplier/job application; token-bound status/update/consent. Each requires strict schemas, captcha, server-side rate limits, idempotency, consent version and captured attribution. Customer methods expose only owned requests/invoices/deliverables/preferences/export. Cross-record authorization tests are mandatory.

Proposed error envelope: {error: {code, message, request_id, fields?}} without tracebacks or secret values. UTM may not contain PII. Public matching alerts and AI-proposed changes must be reviewed before delivery.

Staging uses Host: staging.localhost and production uses a future approved domain. Local HTTP is a loopback development exception only; external environments require HTTPS and restricted desk access.


## M2 public intake API (implemented 2026-10-30)

All methods live under `/api/method/aqar360.api.public.<name>`. Frappe wraps the return value in `{"message": ...}`. Errors return HTTP 400/403 with `{"message": {"error": {code, message, request_id, fields}}}`; codes are `invalid_input` (per-field messages in `fields`), `invalid_request`, `not_permitted`. Messages follow the payload `language` (ar/en). Every guest method requires the `public_request_forms` feature flag with audience Everyone, and is closed in Production until real personal data is legally allowed.

| Method | HTTP | Limit (per IP/hour) | Purpose |
|---|---|---|---|
| get_form_config(language) | GET | 120 | Active areas, select options, current Privacy Policy / Marketing Consent versions, whether captcha is required |
| submit_search_request | POST | 10 | §4.1 find-me-a-property (incl. corporate and investment mandate fields) |
| submit_property_intake | POST | 10 | §5.1 sell / let / content only / market project, owner accuracy declaration required |
| submit_consultation_request | POST | 10 | §11.2 site/project assessment |
| get_my_request(token) | GET/POST | 60 | Customer-safe status view; internal reasons and contact data never returned |
| update_my_request(token, ...) | POST | 30 | Search requests only: budget, areas, strict budget, bedrooms, timing, notes, state pause/resume/close |
| stop_alerts(token) | POST | 30 | Withdraws Match Alerts and Marketing on all channels and pauses alerts |

Submission rules: unknown keys are rejected; `idempotency_key` (≤64 chars) is required and replays return the original request number without a new token; phones are normalized to E.164 (+968 default); Turnstile is verified when `aqar_turnstile_secret` is set in site config and required outside Local/Staging; a Privacy Policy version is required in Production; marketing consent must cite the current approved Marketing Consent version. The response returns `request_number`, customer status and a 90-day `self_service_token` (shown once; only its hash is stored). Confirmation email failure never blocks the submission.

## M4 staff matching methods (authenticated desk users)

| Method | Permission | Purpose |
|---|---|---|
| aqar360.matching.engine.rematch_request(request_name) | write on the request | Re-run matching for one request; returns new and open match counts |
| aqar360.matching.actions.update_match(match, action, reason?, channel?, notes?) | write on Aqar Match + opportunity role | review, approve (verified supply only; off-market needs Team Lead/Manager), reject (reason required), mark_sent (channel required) |

No customer or guest method exposes matches. Customer delivery of approved matches is M9 (and automated alerts stay behind the Phase 2 `customer_match_alerts` flag).

## M5 staff methods

| Method | Permission | Purpose |
|---|---|---|
| aqar360.operations.sla.sla_summary(from_date?, to_date?) | Admin, Manager, Team Lead | Compliance %, average response minutes, overdue and at-risk counts |
| aqar360.operations.approvals.request_change_approval(doctype, name, fieldname, proposed_value, note) | write on the record | Raise an approval request for a change blocked by an active rule |
| aqar360.operations.approvals.decide_approval(request, decision, note?) | the rule's approver role, not the requester | Approve (applies the change) or reject |

## M10 public content API (guest, GET, read-only)

`aqar360.api.content.*`: list_pages(language, page_type?), get_page(slug, language), list_areas(language), list_services(language), list_jobs(language), get_policy(slug, language), sitemap_entries(). Published records only; HTML sanitised; 404 envelope (`not_found`) for unknown or unpublished items. The Next.js site calls these server-side and caches them for 5 minutes.

## M11 methods

Staff (desk): `aqar360.crm.customer360.get_customer_360(contact)` / `render_customer_360(contact)` (permission-aware), `aqar360.vault.access.get_download_link(document)` → single-use 15-minute link to `aqar360.vault.access.download?token=` (audited). Reports: "Aqar Daily Workbench", "Aqar Management Summary".

Customer (website user with Aqar Customer role, session cookie; POST needs X-Frappe-CSRF-Token): `aqar360.api.account.session_info`, `session_token`, `get_overview(language)`, `get_invoice(name)` (own invoices only), `withdraw_consent(purpose, channel)`. The website proxies these through `/api/account` (login, logout, signup, reset, withdraw).

## M9 messaging (server-side only, no public endpoints)

`aqar360.messaging.outbox.queue_message(key, *, recipient, language, context, contact, reference_doctype, reference_name, idempotency_key, preferred_channel, now)` → Aqar Outbox (Sent / Queued / Suppressed / Skipped). The same idempotency key always returns the same record. Scheduler: `process_outbox` every 5 minutes (due messages, retries, Email Queue delivery sync); `lifecycle.send_viewing_reminders` hourly; `send_still_searching`, `send_expiry_notices`, `send_payment_reminders` daily; `send_staff_digest` at 07:30. `update_my_request` now also renews the request for 90 days (unless closing it).

## Map (guest, GET, read-only)

`aqar360.api.content.get_map_data(language)` → `{areas: [{id, name, slug, wilayat, guide_slug, center: [lng, lat] | null, boundary: GeoJSON Polygon/MultiPolygon | null}], listings: [...]}`. Listings are projects (`type: "project"`, exact `point`, unit types, payment plan, available units, cover image) and properties (`type: "property"`, kind, purpose, prices, bedrooms, size; `point` only when "Show Exact Location on Website" is ticked, otherwise null). No owner names, addresses, internal titles or private files. The website caches it for 5 minutes.

## Projects (guest, GET, read-only)

`aqar360.api.content.list_projects(language)` → public project cards. `aqar360.api.content.get_project(slug, language)` → one project: gallery (public files only), sanitised description and payment plan in the requested language (falls back to English), unit types, `unit_list` (registry units: number, floor, type, size, price, state available/reserved/sold; withdrawn, paused and archived units are omitted), brochure (public file only), area and guide link. Unknown or non-public slugs return the 404 envelope. Unit-type availability is counted live from registry units when a type has any, otherwise the typed number is used.

## Website interest on search requests

`submit_search_request` also accepts `interest_type` (`project` | `property`), `interest_id` (project name or property code), `interest_unit` (unit number within the project) and `source_page`. They are stored on the request (Interested In / Interested Unit / Source Page) only when the listing is public, verified and available; otherwise ignored. Report: "Aqar Website Enquiries" (enquiries per listing, unit enquiries, still open, viewings, offers, latest enquiry, top source page).
