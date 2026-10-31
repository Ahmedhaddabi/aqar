# Phase 0 progress — review checkpoint

Date: 2026-10-29, Asia/Muscat. Scope: foundation only. **Local foundation implemented; external activation and missing-strategy reconciliation remain pending. Phase 1 has not started.**

## Completed locally

- Audited the five installed apps: 1,068 DocTypes and their fields/permissions, active workflows, Web Forms, print metadata, portal files and selected security settings. Evidence contains metadata only.
- Drafted the capability gap matrix, Contact-based person master, extension-based property/project design, API plan, provisional per-field governance register and architecture decisions.
- Created the requested repository directories, Frappe Python development container configuration and aqar360 custom app, installed on staging.localhost only. No upstream app source files changed.
- Created twelve namespaced roles, with no implicit operational finance/HR/portal grants. Set staging privileged-role TOTP, two-hour session expiry, restricted uploads and error-traceback policy.
- Added four canonical/schema-repair custom fields and two Property metadata repairs via fixtures/Property Setters. Tracking enabled for Contact and confirmed for CRM Lead/Deal and Property/Unit.
- Disabled unsafe legacy tenant-portal actions on Aqar staging. Kept the direct-provider Claude key absent; no AI service active.
- Created independent local staging site/database, routing by hostname, with loopback-only web publication. Original localhost site remains available.
- Configured GPG-encrypted staging backups and performed actual successful decryption verification of DB/public/private artifacts. Added off-server restic script and recovery/key-escrow runbook.
- Enabled native transaction monitoring on staging; native Error Log remains available; local healthcheck produces machine-readable status.
- Added push/PR CI configuration for Frappe integration tests and credential-pattern scanning. Seven actual integration tests passed locally; see evidence/foundation_tests.txt. No Git remote is configured, so no hosted CI run is claimed.
- Created separate local Mailpit capture at http://localhost:8025 for MFA enrolment mail. No real email provider is used. Password-only staging login returns an MFA challenge instead of a session.
- Wrote deploy, backup/restore, incident-response, onboarding and Phase 0 demo runbooks.

## Pending dependencies / release gates

| Item | Status and reason |
|---|---|
| Master strategy DOCX / exact numbered appendix reconciliation | Not supplied; do not claim every original section covered |
| External Oman-approved staging host/domain | User will link a domain later; local staging only |
| Separate-account off-server backup repository and credentials | Not available; encrypted local backup is not off-server protection |
| Backup schedule, external failure alerts, independent key escrow | Configuration/runbook prepared; not activated without destinations/owners |
| Full restore drill and RPO/RTO measurement | Not yet performed; must pass before external acceptance |
| Remote Git repository and hosted CI execution | No remote configured; workflow present and core test command passed locally |
| Custom app Git URL for apps.json staging/production builds | Pending approved subtree repository; example URL is not deployable |
| Named staff OTP enrolment/recovery exercise | HTTP challenge and role logic verified; a human must enrol an OTP app |
| Legal/commercial/retention/tax/rights/hosting policy | Pending legal approval; synthetic-only local staging |
| Public launch security | Upstream owner-role broad reads, complete customer isolation/scanning/audit/outbox controls remain Phase 1 launch gates |

## Validation

- Seven Frappe v16 IntegrationTestCase tests (aliased FrappeTestCase): identity links, property schema, guest inventory denial, idempotent roles/MFA scoping, legacy portal denial, legal/phase gates and change tracking.
- HTTP 200 for local and staging login pages; valid staging Administrator password requires MFA.
- Encrypted backup DB/public/private files decrypt successfully.
- Development Compose validates. Shell/Python/JSON/YAML validation results are recorded at the end of verification.
- No payment, WhatsApp, AI, public Next.js site or n8n production workflow implemented.

## Configured versus built

Configured through install hooks and exported fixtures: roles, MFA/session policy, canonical links, metadata compatibility fixes and change tracking. Local-only operational setup: site, SMTP capture, monitor, backup settings. Built: settings validation, disabled legacy API handler, backup integrity check, healthcheck and CI/runbooks. UI-only configuration: none.

Stop here for review before Phase 1.


Final static verification: 12 JSON files parsed; Python compileall, both shell scripts' bash -n checks, YAML parsing and Docker Compose validation passed. Credentials, upstream checkout and runtime logs are ignored by Git. Seven integration tests passed in 3.440 seconds on the final run. Healthcheck reported OK. Local Mailpit returned HTTP 200.

ERPNext company/accounting setup is not completed with invented business identity, tax or chart-of-account choices. Confirm these during the finance configuration work; authenticated HTTP/MFA and foundation metadata were tested independently of the setup wizard.

Project relocation: moved to C:\Users\LENOVO\Desktop\aqar at the user's request. Docker source mounts now use the Desktop folder; existing databases and uploaded files remain in their Docker volumes.


Access/email repair: named admin account created as requested, portal signup enabled with Aqar Customer only, signup/reset link hostnames corrected, and local email-capture delivery verified. Real SMTP delivery remains pending provider configuration. See runbooks/local_access_email.md.


Gmail SMTP preparation: accounts created on both local sites; TLS/587 configured, awaiting locally entered Google App Password. External delivery has not been activated or verified.



## M1 — Platform core (2026-10-30)

Built in the aqar360 app on staging.localhost (see implementation_plan.md M1):

- Aqar Audit Event: append-only (ORM edits/deletes rejected for every role), SHA-256 hash chain with sequence; aqar360.core.audit.verify_chain() detects direct database tampering. Audited: Terms Versions, Feature Flags, Platform Settings, user role changes, Sales Invoice/Payment Entry/Journal Entry submit and cancel, consent, terms acceptance, secure link creation.
- Aqar Consent Log: per contact × purpose × channel, append-only, latest row wins, "All Channels" withdrawal overrides; Marketing/Ads consent must cite an approved wording version; staff-recorded consent needs evidence.
- Aqar Terms Version / Aqar Terms Acceptance: eleven §12.2 policy types, Draft → Legal Review → Approved → Retired, approved text locked with content hash and approver; acceptance only of approved versions, with IP/user agent/reference.
- Aqar Secure Link: random token returned once, only SHA-256 stored, single purpose, expiry, optional max uses, revoke-only edits, identical error for every failure.
- Aqar Feature Flag: seven seeded flags, all disabled; later-phase flags cannot be enabled while Platform Settings gates are closed; stable per-user percentage rollout.
- Geography: Aqar Governorate (11), Aqar Wilayat (6 Muscat wilayats), Aqar Area (5 starter areas; coordinates left for verified entry).
- Aqar Source Observation: §27.21 source ranking, first/last seen, last verified, freshness status; daily job marks stale observations.
- Arabic translations for all new labels and messages.

Validation: 19 integration tests pass (7 foundation + 12 M1) on staging.localhost; staging audit chain verifies OK. Not yet built: forms or APIs that call these services (M2 onwards). Terms texts themselves await legal drafting.

## M2 — Demand and opportunity intake (2026-10-30) — checkpoint for review

Built on staging.localhost:

- Aqar Search Request (+ area child table): §4.1 fields, §4.2 statuses, corporate and investment-mandate variants, 20% near-match tolerance (0 when the customer says "don't exceed budget"), 90-day expiry.
- Aqar Opportunity Intake: sell / let / content only / market project, owner accuracy declaration, internal decline reasons and opportunity score on a separate permission level, native Workflow "Aqar Opportunity Review" (Submitted → Under Review → Need More Info / Adjustment Suggested / Accepted / Not Selected); Decline is impossible without an internal reason.
- Aqar Consultation Request (§11.2) with scope disclaimer.
- Public API (api.md): strict allowlists, per-IP rate limits, idempotency keys, Turnstile hook, E.164 phones, consent and privacy-acceptance recording, secure self-service link, customer-language errors.
- Customer messages (Arabic/English drafts): confirmation with self-service link, need more info, adjustment suggested, accepted, and the §2.3 decline text verbatim; sent only with Request Updates email consent; failures logged, never blocking.
- Duplicate-person rule (ADR-019) and decision-only audit (ADR-020).

Validation: 33 integration tests pass (14 new for M2), including F.8 tests 1 (email failure), 2 (same person from Instagram and website keeps both sources) and 4 (stop alerts). Live HTTP check on staging: an Arabic Instagram-sourced request was accepted, appears to staff with contact, three consents, five audit events (chain verified) and a queued confirmation; a malformed payload returned HTTP 400 with per-field errors. The `public_request_forms` flag was closed again afterwards.

Deferred: careers and supplier intake move to M8 (they reuse native Job Applicant / Supplier); photo/document upload by customers waits for the secure post-submission upload in M11 (guest uploads stay disabled); email footer still says "Sent via ERPNext" until the M9 outbox/branding work.

## M3 — Supply registry (2026-10-30)

- Aqar Development Project (P-#####): developer, focal point, area, construction status (Pre-Launch / Under Construction / Ready) separate from sales availability (Active / Limited / Paused / Sold Out / Withdrawn / Closed / Archived), visibility (internal by default, off-market, selected public page), verification with last-verified date and reverification window, foreign ownership Unknown unless verified, unit-type table with price range roll-up and "available units" left blank when unknown, duplicate prevention by developer + normalized name (reactivate instead), source fields and brochure attachment. ADR-021.
- Aqar Unit Type master (14 seeded types) and Aqar Price Change (append-only price history for Property, Property Unit and projects; direction and % change).
- Property and Property Unit extended through custom fields only: Aqar property type, area, listing purpose, asking sale/rent prices (OMR, 3 decimals), bedrooms/bathrooms/size in m², furnished, parking, construction status, availability, visibility, verification; units fetch project and area from their property. Aqar staff roles now have explicit permissions (marketing/content read-only; customers and suppliers none).
- Lifecycle: verifying stamps date and verifier; a record reopened from Sold Out/Withdrawn/Closed/Archived is forced to Needs Reverification; daily job marks verified records stale after their window; match_state() gives M4 the rule (closed → excluded, stale → match but reverify before sending).
- Accepting an Opportunity Intake now registers one Property (AQP-#####) with the owner contact, mapped facts and asking price, linked both ways.
- Property Digital File: Aqar 360 connections panel on the Property form and get_property_timeline() combining audit events, field changes, price history, sources and intakes for the property and its units.
- Fixtures re-exported; Arabic labels added.

Validation: 41 integration tests pass (8 new for M3).

## M4 — Matching engine (2026-10-30) — checkpoint for review

- Aqar Match (MATCH-#######): one request + exactly one supply target (Property Unit, unit-less Property, or a Development Project unit type when the project has no registered units), score 0–100 with components (budget 35, location 25, type 20, rooms 10, size 5, readiness 5, minus deductions), reasons and "points to check", price and budget snapshot, supply verification and visibility.
- Rules (§27.15): at or below budget always qualifies (below budget_min included); up to the request's tolerance above is a Near Match (default 20%, 0 = never); beyond is excluded. Area must be requested (25) or in the same wilayat (10); type exact (20) or related (10); rent vs sale purpose and content-only respected; sold-out/withdrawn/closed/archived supply excluded; foreign-ownership "Not Eligible (Verified)" excluded and "Unknown" flagged; unverified or stale supply allowed as a suggestion but cannot be approved. Minimum score 50.
- Triggers: request save, property/unit/project save (new supply, price change, availability change, reactivation) re-match in the background after commit; a price decrease is labelled "Price drop" in the staff alert. Open matches are withdrawn when supply or request no longer fits and restored when they fit again; Sent and Rejected decisions are never overwritten; an approved match whose price changes returns to Team Reviewed.
- Staff actions with buttons on the match form: Mark Reviewed, Approve, Reject (reason), Mark Shared (channel). The request status advances automatically: Potential Match → Team Reviewed → Client Contacted. Staff get bell notifications for new matches. "Find Matches" button on the request; Matching panels on request, property and project forms.
- Nothing is sent to customers in M4 (F.8 test 3 holds: no automatic offer, off-market requires senior approval).

Validation: 51 integration tests pass (10 new). Live on staging: saving a verified demo flat queued match_supply; the worker created MATCH-0000007 (score 100) for demo request REQ-2026-00006 within ~1.5 s and moved it to Potential Match.

## M5 — SLA, ownership, viewings, offers, approvals (2026-10-30)

- Business calendar in Aqar Platform Settings (Sun–Thu, 08:00–17:00, optional Holiday List) with working-time arithmetic.
- Aqar SLA Policy: the 14 §8.3 targets seeded (ranges use the upper bound as due and the lower bound as amber). Aqar SLA Timer per record and policy: Running → Paused (Waiting on Client) → Completed/Cancelled, due time extended by paused working time, Green/Amber/Red, outcome On Time/Late and response minutes. Bound now: new request first response (2 working hours, completed by "Log First Contact"), opportunity review (same business day, paused on Need More Info / Adjustment Suggested), consultation first response. Content and campaign policies are seeded for M6.
- Escalation every 5 minutes: Amber → owner; breach → owner + team leads; 150% of target → managers (cumulative). sla_summary() KPIs.
- Ownership: Owner field on requests, intakes and consultations; round-robin auto-assignment among Opportunity Staff (setting), to-do for the owner, reassignment closes the old to-do and moves the timer. New-match alerts now go to the request owner (team only when unowned).
- Aqar Viewing: only for an approved/shared match; booking moves the request to Viewing and creates a to-do; outcomes Interested/Negotiating → Interested, Not Suitable (reason required) → match rejected and request Not Suitable, Wants Alternatives → back to Searching with re-matching; "too expensive"/"wrong area" feedback lowers similar suggestions; follow-up to-do.
- Aqar Offer with counter-offer rounds: request moves to Offer; rounds set Countered; Accepted fixes the agreed amount and locks the offer; daily expiry of lapsed offers.
- Approval engine: Aqar Approval Rule (percent decrease / percent change / amount above, approver role) and Aqar Approval Request; blocked saves, "Request Price Change Approval" button on Property, Unit and Project; approver applies the change; no self-approval; four price-cut rules seeded inactive.

Validation: 62 integration tests pass (11 new). Staging migrated; scheduler jobs registered; refresh_timers ran cleanly.

## M6 — Content services and commerce (2026-10-31)

- Placeholder company "Aqar 360 (Placeholder)" set up on staging only (backup taken first); security settings restored by migrate (ADR-026). customer_inputs.md lists every customer-owned value.
- §6 services as ERPNext Items with draft prices on Standard Selling, delivery SLA policy and included revision rounds; campaign fee, extra revision and a Client Media Budget item whose income account is the liability "Client Media Funds Held" (§9.2: pass-through money never becomes revenue).
- Aqar Content Order: client, property/intake link, clean-final vs branded delivery (§5.3), services priced from the price list, media budget, shoot schedule, versioned deliverables per service, revision log with included-round limit, coordinator auto-assignment, manager overrides. Status flow Draft → Quoted → Confirmed → Scheduled → Shot → In Production → Client Review ⇄ Changes Requested → Delivered → Closed, Waiting on Client pause, Cancelled; rules: confirm only after the quotation is submitted, schedule and deliver only after full payment (or manager override), review only when every service has a deliverable, delivery only after client approval of every deliverable.
- SLA: shoot confirmation (4 working hours), per-service delivery timers (photos 24 h, floor plan 48 h, videos 48–72 h, presenter 3 / lifestyle 5 working days) starting at the shoot and completing per service, repeatable minor-revision timer (24 h), all pausing on Waiting on Client.
- Billing: Create Quotation / Create Invoice / Record Payment (Contact → Customer reuse, Quotation, Sales Invoice, Payment Entry); payment status mirrored from accounting events; bilingual Arabic/English invoice and quotation print formats with pass-through note; discount approval rules (seeded inactive) now also guard new documents; narrow commerce permissions (ADR-027).

Validation: 69 integration tests pass (7 new), including a full lifecycle (quote → partial and full payment → shoot → per-service SLA → revisions within and beyond the included round → client approval → delivery) and a GL check that a 500 OMR media budget is credited to the liability account while 220 OMR services go to Sales.

## M10 — Public website (2026-10-31)

Moved ahead of M7–M9 at the user's request.

- Next.js 15.5 site in `web/` (App Router, TypeScript, no UI framework): Arabic `/ar` (default, RTL) and English `/en`, middleware language redirect, IBM Plex Sans Arabic self-hosted at build. Pages per §3.1: home (§22 wireframe: four intents, quick request, why us, services with live prices, consulting, trust, latest guides, careers/suppliers), find-me-a-property, market-my-property (sell / let / content only), market-my-project, content services, consulting, areas + area guides, insights + guides, careers (open Job Openings, JobPosting only with a closing date), suppliers, about, contact, legal policies (approved Terms Versions only; unapproved pages say "being finalised" and are noindex), my-request.
- Forms post to the site's own API routes, which relay to the M2 intake API server-side with the visitor IP (rate limits stay per visitor), reject cross-site posts and oversized bodies, send a one-time idempotency key and first-touch attribution (UTM, landing page, referrer → CRM source). Field errors from Frappe appear beside the right field in the visitor's language. Marketing consent is offered only when an approved wording exists; Turnstile renders only when configured. Forms switch to a contact panel when `public_request_forms` is off.
- My-request: private link page (noindex, no-referrer) with status, budget/timing/notes edits, pause/resume/close and stop-all-alerts.
- SEO (§13, §15): canonical + hreflang (ar, en, x-default) on every page, one H1 with an answer-first summary, breadcrumbs, ProfessionalService/BreadcrumbList/Article/FAQPage/JobPosting structured data, sitemap.xml with language alternates and only real guides (no thin area pages), robots.txt that keeps private paths out and does not block AI search crawlers.
- Analytics (§20): GTM loads only after consent (and only if configured); events request_start, request_submit, consultation_requested, whatsapp_click, call_click, content_service_select without personal data.
- Security headers: CSP (third-party origins only when GTM/Turnstile are configured), frame-ancestors none, nosniff, referrer policy, permissions policy. Public CMS images proxied from Frappe /files only.
- Frappe side: Aqar Content Page CMS (guide types, both languages required to publish, sources required for market insights, review date/reviewer stamped), area URL slugs, Arabic names/scopes for public services, public read-only content API (aqar360.api.content: list_pages, get_page, list_areas, list_services, list_jobs, get_policy, sitemap_entries) returning published data only with sanitised HTML.
- Staging: `public_request_forms` opened for Everyone (synthetic data only); two sample guides published, both titled "(sample)" for the customer to replace.

Validation: backend 74 integration tests pass (5 new for the content API). Website: `tsc` clean, production build OK, smoke test 50/50 on a clean build (all pages in both languages, lang/dir, hreflang, structured data, 404s, sitemap/robots, security headers, field-level validation errors, cross-site rejection, a real request created through the site, private request page, forged token rejected, stop alerts).

Not yet: customer login account (requests, invoices, payments in one place) — planned with M11, the my-request link covers request status now; careers/supplier online applications (M8); editable message templates (M9).

## M11 — Staff workspace, document vault and customer account (2026-10-31)

- Customer 360: "Customer 360" button on every Contact (profile, duplicate candidates, consents by purpose/channel, requests, matches, viewings, offers, intakes, consultations, owned properties, content orders, invoices with totals, documents, merged timeline) plus a connections panel; everything goes through permission-aware queries.
- Aqar Daily Workbench (Script Report, Excel export): open requests, owner intakes and consultations with SLA colour, best match and score, open matches, source, owner, and a rule-based next best action (first response → open offer → viewing due → share approved → review suggested → expiring → stale → waiting list); "only my records" by default.
- Aqar Management Summary (Script Report): KPI cards for demand, intake acceptance, matches, viewings, offers, deliveries, SLA compliance, overdue, revenue from income accounts, client media money shown separately (never revenue) and receivables; conversion by source channel with chart.
- Document vault: Aqar Document with classification (Public / Internal / Confidential / Highly Restricted — the last visible only to managers, finance and admins via permission hooks), private files only, upload checks (ADR-029), SHA-256 and size, single-use 15-minute download links, audit of link issue, download and deletion.
- Customer account on the website (ADR-028): /account with sign-in, create account, password reset; my requests, my content orders, my invoices (bilingual invoice in a sandboxed frame, own invoices only), message preferences (withdraw any optional consent), sign out; noindex and excluded in robots.txt. "My account" added to the menu.
- Demo customer login for staging stored in aqar360/credentials.local.txt (git-ignored).

Incident: Docker Desktop's engine stopped responding (≈0.3 GB RAM free on the 8 GB PC). Docker and its WSL VM were restarted; all containers recovered with no data loss. Memory remains the main local constraint (see risks in implementation_plan.md).

Validation: 84 backend integration tests pass (10 new); website type-check and production build OK; smoke test 56/56 including account login, own-data only, logout ending the server session, anonymous sign-in only. Two real bugs were caught and fixed: corrupted binary downloads (decoded file content) and a logout that did not end the Frappe session.

## M9 — Notification center and customer lifecycle (2026-10-31)

- Aqar Message Template: bilingual, versioned, approved by Aqar Manager/Admin, locked once approved (new version retires the old), rendered with escaped variables and checked before saving. 11 draft templates seeded (received, need more info, adjustment suggested, accepted, not selected with the §2.3 wording, viewing reminder, still searching, request expiring, content ready, payment reminder, staff daily digest).
- Aqar Outbox (ADR-030): one record per message with template version, channel, consent purpose, idempotency key, attempts, status and reason. Suppression rules: no address, no contact, unsubscribed (follow-ups), consent per purpose/channel, weekly cap (default 2). Quiet hours 21:00–08:00 delay follow-ups only. 3 delivery attempts with back-off, then Failed + Error Log; the business action never fails. WhatsApp falls back to email until the Phase 2 flag and a WhatsApp template exist.
- All existing request emails (received / review decisions) now go through the outbox and templates.
- Lifecycle jobs: viewing reminder in the 24 h before a viewing (again if rescheduled), "still searching?" check-in after 14 quiet days with a fresh self-service link (skipped when alerts are paused), renewal notice 7 days before a request expires (self-update renews it for 90 days), weekly reminder for overdue content invoices, "content ready for review" per revision round, staff daily digest at 07:30 for users with open items.
- "Sent via ERPNext" email footer disabled.
- Staff-first by design: post-viewing follow-up stays a staff task (M5 viewing follow-up date) and price-drop/new-supply matches go to staff for approval before a customer hears about them (M4).

Validation: 100 backend integration tests pass (16 new, plus a content-ready check in the commerce flow) covering F.8 tests 1, 2, 4 and 6 (sending failure, no duplicates, opt-out/consent, idempotent jobs), quiet hours, weekly cap, template locking and escaping.

## M13A — Property map (2026-10-31, added at the user's request)

- Website /ar/map and /en/map (also in the menu, sitemap, a home-page banner and a "Map" button per area): coloured areas with listing counts, project pins with names, price pins, filters (all/sale/rent, type, area), map/list switch, detail panel (price, facts, unit types with availability, payment plan, summary), "Register interest" opening the request form pre-filled (purpose, type, area, budget, a note naming the listing), shareable links, 3D buildings, Arabic and English map labels, mobile layout. The list is server-rendered, so the page works and is indexable even when the map cannot load.
- Privacy (ADR-031): only public + verified + available records; owner properties without exact-location consent are shown inside their area and their coordinates never leave the server (checked in the page source).
- Desk: Property gets Latitude/Longitude (kept in sync with its map pin) and "Show Exact Location on Website"; Aqar Development Project gets a map pin, coordinates (also read from a pasted Google Maps link) and a cover image; Aqar Area gets a drawable boundary. Property and projects get Frappe's built-in Map view.
- Library: MapLibre GL 6.14.0 (open source); its worker is served from the site itself (CSP: worker-src 'self'). Map style configurable (NEXT_PUBLIC_MAP_STYLE_URL), default OpenFreeMap.
- Security patch: Next.js 15.5.27 → 15.5.28 (fixes a critical advisory, GHSA-2464-fhr4-w9xw). Remaining `npm audit` item: PostCSS inside Next's build tooling (build-time only, our own CSS; fix requires a Next major upgrade).
- Also fixed: wilayat names on the Arabic request form were shown in English.
- Staging only: 2 "(Demo)" projects and 5 "(Demo)" properties so the map has something to show.

Validation: 108 backend tests pass (8 new: location sync, map-link parsing, area boundary centre, public map rules and privacy); website type-check and production build OK; smoke 62/62 (6 new map checks); visual checks in headless Chrome (Arabic overview, English project detail, area-only listing deep link, mobile, register-interest prefill). Bugs caught in the visual pass: canvas collapsed by MapLibre's own CSS, price pins pushed off-screen in Arabic (marker positioning overridden), deep links cleared before the map was ready, Arabic plural forms.

## M13B — Project pages (2026-10-31)

- Website /projects (cards: image, status, area, developer, price from, units available) and /projects/<slug> (in the menu, the sitemap and linked from the map panel): photo gallery with thumbnails and keyboard support, summary card (price range, units available, register interest, brochure, view on map), key facts, description, unit types, live unit list (filter by type or available only, "Ask" pre-fills the request form with the unit), payment plan bar, location map loaded only when scrolled into view, call to action, phone action bar, BreadcrumbList + Place structured data.
- Desk: Aqar Development Project gets an automatic unique website slug, Description (Arabic), Payment Plan (Arabic) and a Website Gallery table (Aqar Project Image, captions in both languages). Private files are never published.
- Live availability: units are the existing registry Property Units of the project's buildings; available / reserved / sold follows their availability and status, and unit-type counts come from them when present.
- Shared website helpers (lib/format.ts) now serve both the map and project pages (numbers, Arabic plurals, request links, MapLibre loading).
- Staging only: drawn placeholder images marked "DEMO IMAGE", Arabic texts and 6 demo units for the demo projects.

Validation: 112 backend tests pass (4 new: slugs, public page with live units/gallery/language/sanitising/private files, listing and 404 rules, map link to the page); website type-check and build OK; smoke 67/67 on the first run after the final build (5 new project checks) — later reruns in the same hour hit the intake form rate limit, as designed; visual checks of the Arabic desktop page, English index and English phone layout.

## Website interest → CRM (2026-10-31)

- Every website form already creates CRM records (Search Request / Opportunity Intake / Consultation Request + Contact + consent log, auto-assignment, SLA timer, confirmation message); the map and project pages read registry records maintained in the desk.
- New: "Register interest" (map, project page) and "Ask" (unit list) now pass the listing itself. The Search Request stores Interested In (project or property), Interested Unit and Source Page — validated server-side, public listings only.
- Matching: matches for the chosen project/property carry "The customer asked about this listing on the website" first; the exact unit or unit-less property becomes a "Customer Interest" match when it is outside the request's criteria but available, and it survives re-matching. Requests of type "Project" now also match a project's registered units (previously only its unit-type rows) — a real gap found while building this.
- Staff views: "Asked About" column and "Call now: asked about …" action in the Daily Workbench; "Asked About" in Customer 360; new report "Aqar Website Enquiries" (per listing: enquiries, about a unit, still open, viewings, offers, latest, top source page) for managers, team leads and business development.
- Incident: Docker's engine stopped responding again on start (0.3 GB RAM free: Chrome ≈1.9 GB, VS Code ≈1.2 GB). Docker Desktop and its WSL VM were restarted; all data intact.
