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

## R1 — New foundation: Neon database, admin sign-in, website off Frappe (2026-10-31)

- Decision: rebuild as one simple Next.js app on free hosting (ADR-033, rebuild_plan.md).
- Neon Postgres (project green-sky-40372348, branch production, us-east-2): 12 tables via Drizzle migrations (`npm run db:migrate`, also run before every Vercel build); seed with geography, 5 areas with centres, services and prices, 2 sample guides, settings and demo listings (`npm run db:seed -- --demo`).
- Public website now reads everything from the database: areas, guides, services, map, projects and units (live states). Forms and the "My request" link show "not available yet" until R2. Customer account pages and the Frappe file proxy were removed.
- Admin at /admin (Arabic first, English switch): first-admin setup, sign in/out, Today (live counts), Staff (add, role, disable/enable, reset password; disabling or resetting signs the person out everywhere). Every sign-in, change and failure is in the audit log.
- Verified: production build; public pages 200 with database content (projects with A-101 available / A-102 reserved / A-302 sold, map 7 results, owner coordinates absent, 404 for unknown); admin in headless Chrome: setup refuses a wrong code then creates the first admin, wrong password refused, admin sign-in, live counts, staff list, language switch both ways, disable works, sign-out closes the admin, agent refused the staff page, lockout after 5 failures (audit log confirms each step).
- Accounts: admin = the user's email; password and the (disabled) demo agent in aqar360/credentials.local.txt (git-ignored).
- Environment issues met: C: drive full (0 GB; Docker's 31 GB virtual disk is the main user), RAM pressure; Docker and PGlite abandoned for development.

## R2 — Website requests into the CRM: Requests inbox and Customers (2026-10-31)

- The three website forms (find me a property, market my property/project, consulting) save into Neon: request number REQ-YYYY-#####, customer matched by phone (any format) then email, consent per channel, the project/unit the visitor clicked, source page and campaign tags, 90-day validity. The private "My request" link works again (status, update budget/timing/notes, pause, close, stop alerts).
- Admin: Requests inbox (New / Mine / All open / Finished, search, red marking when waiting longer than the first-reply target), request page (call / WhatsApp / email buttons, status buttons, take it / assign, details in the words the customer saw, "asked about" listing, timeline with notes, calls, follow-ups and viewings with a date), Customers list and page (edit details, message permissions, all requests, full history), Today (new waiting, overdue, follow-ups and viewings due, latest new requests).
- Rules: the first call/WhatsApp/email or status change records the first reply; working on an unassigned request makes it yours; agents see only their own and unassigned requests; a later "stop all channels" overrides older per-channel permissions.
- Verified against Neon: 12 HTTP checks (forms, duplicates, validation per field, cross-site refusal, same customer by phone, private link, update, stop alerts) + database inspection; 20 headless-Chrome admin checks (inbox, request page, call log, status, follow-up on Today, customers, permissions, agent scope); smoke 57/57. Test customers were removed from the live database afterwards.
- Also: Frappe's Docker containers, images, volumes and build cache deleted at the user's request (the news-extraction project untouched); WSL swap moved to E:\wsl\swap.vhdx; Docker's 31 GB disk file still needs compacting with administrator rights (E:\wsl\compact-docker.txt).

## R3 — Properties, units and projects managed in the admin (2026-10-31)

- Admin → "Properties & projects" (admins and managers): list with Projects / Properties tabs and search; one editor for add and edit.
- Project editor: names (Arabic/English), developer, category, area, construction status, handover, map pin (click the map or paste a Google Maps link), unit types table (price range calculated from it unless typed), payment plan and description in both languages (typed as plain text, stored as safe HTML), sales status, "Show on website" + "Checked by our team", foreign ownership; photos (cover + gallery); units with live status (available/reserved/sold) that drive the public unit list.
- Property editor: type, purpose, prices, rooms, size, furnished, area, map pin with "show exact location" (owner permission), status, owner name/phone (internal only), descriptions, photos; automatic codes AQ-00001.
- Photos: shrunk in the browser (max 1920 px JPEG), sent one per request (fits Vercel's 4.5 MB limit), file type checked from the bytes; stored in Vercel Blob (BLOB_READ_WRITE_TOKEN) or, for local testing only, the git-ignored .uploads folder (ALLOW_LOCAL_UPLOADS=1).
- Every save refreshes the public website immediately (cache tag) and is written to the audit log.
- Verified in headless Chrome against Neon (19 + 1 corrected checks): map pin from link, unit-type prices, photo upload → cover → public page, unit added and marked sold → website shows it, injected <script> shown as text, new property on the map with an automatic code, owner details never public, unticking "Show on website" → 404. Test records and photos removed afterwards. Smoke 57/57.

## R4 + R5 — Matching, money, messages and operations (2026-10-31)

- Matching (R4): the Frappe scoring rules ported (area, type, budget within/near, rooms, readiness; minimum 50; the listing the customer asked about is always kept). Suggestions per request with approve / not suitable / mark sent (email + WhatsApp text), viewings with results, offers (accepting one wins the request and marks the property sold/rented). Re-runs when a request or listing changes; staff decisions are never overwritten.
- Money: quotes and invoices from services or free lines (client media money marked separately and excluded from income), quote → invoice on acceptance, payments (partly paid / paid), bilingual printable document (browser "Save as PDF"), private customer link `/doc/<id>?s=<signature>` (signed with AUTH_SECRET, nothing stored, drafts/cancelled hidden) with a WhatsApp share button. Expenses with receipt photos; finance summary (income, client media, expenses, petty cash, profit, receivable, by category).
- Messages: 7 templates editable in Arabic/English (reset to original), outbox log with the reason when not sent (no email, no consent, email not switched on). Daily cron: viewing reminders, expiring requests, "still searching?" after the follow-up days in Settings, weekly payment reminders with the invoice link.
- HR lite: employees (documents and salary), leave with approval and annual balance, payroll per month with editable allowances/deductions, payslips, paid payroll recorded as one salaries expense; company renewals; staff documents and renewals ending within 30 days shown on Today.
- Hiring & suppliers: job posts (published + closing date) on /careers, online application with CV and supplier registration on /partners-suppliers (`POST /api/apply`), review screen with statuses and notes.
- Website editor: areas with map centre and outline drawn by clicking, guides/pages with facts, FAQ, sources and review date. Settings: company details (invoices), website contact buttons (override the NEXT_PUBLIC_* values), response/follow-up/validity days; activity log viewer. Reports with CSV downloads (Excel-safe UTF-8, formula injection neutralised).
- Admin menu grouped: Daily work / Money / Team / Setup. Agents still see only Today, Requests and Customers.
- Verified in headless Chrome against Neon: 57 checks pass on a clean run (access control, settings → website, quote → invoice → payments, customer link incl. tampered signature, receipts, finance, HR incl. payroll and expiry warnings, job post → public application with PDF CV, supplier sign-up in Arabic, wrong file type refused, area outline drawing, guide with FAQ and escaped text, message wording save/reset, sent log, reports, CSV with BOM, activity log). Bug found and fixed: buttons/inputs named "reset" and "action" shadowed the form's own properties. Test data, uploads and settings restored afterwards. Smoke 57/57.

## CRM / ERP apps and online payments (Thawani, Paymob) (2026-10-31)

- Admin split like Frappe's apps: a CRM / ERP switch at the top of the menu, each showing only its own pages; an Apps page (logo) with CRM, ERP and Setup tiles; Setup (Settings, Staff accounts) at the bottom for admins. CRM: Today, Requests, Customers, Properties & projects, Website content, Messages, Reports. ERP: new Overview (income and expenses this month, customers owe, paid online, leave to approve, new applications, unpaid invoices with overdue, expiring documents and renewals), Invoices, Expenses, Finance, Team (HR), Hiring & suppliers. Agents still see only their CRM pages.
- Online payments: "Pay with Thawani" and "Pay by card (Paymob)" on the customer's invoice link for the remaining balance; table `online_payments` (migration 0004); return pages ask the gateway / check the HMAC; webhooks `/api/webhooks/thawani` (HMAC-SHA256 of body-timestamp, then session lookup) and `/api/webhooks/paymob` (HMAC-SHA512, 20 ordered fields); each payment recorded once as method "Online", amount must match; Settings → Online payments shows connection/test mode, show-to-customer switches and the addresses to paste in the dashboards. Keys only as environment variables (`web/.env.example`), guide in `runbooks/payments_setup.md`.
- Fix: cross-site check now uses Sec-Fetch-Site first. Pages with a no-referrer policy make browsers send `Origin: null` on form posts, which blocked the pay buttons (found by the browser test; the my-request page uses fetch and was not affected).
- Verified: 45 checks (menus, apps, ERP overview, settings status, real Thawani UAT checkout session with the public test keys → redirect to Thawani's card page, reuse within 30 min, return while unpaid, signed/unsigned Thawani webhooks, cancel; Paymob failure path with dummy keys, wrong/tampered HMAC refused, signed success recorded exactly once on retry, invoice paid, customer return page, amount mismatch ignored, admin attempts list, hiding a gateway) + the 57 operations checks again + smoke 57/57. Test data removed; no keys stored anywhere.

## Apps launcher, HR app, end-to-end operations and strategy gaps closed (2026-10-31)

- Speed: the slowness in local testing is the distance to the database (about 200 ms per query from Oman to Neon us-east-2). Production runs the server functions next to the database (vercel.json `regions: ["cle1"]`). Every click and save now shows an instant progress bar and dims the page (admin/Progress.tsx). A group-level loading.tsx was tried and removed: in Next 15.5 it stopped pages refreshing after saving.
- Apps like Frappe / Citrix: after sign-in a full-screen launcher with tiles (CRM, ERP, HR, Setup for admins) and today's key numbers; inside an app the menu shows only that app; per-person app access on the Staff page (admins open everything); every page checks app access, not only role.
- Two-step sign-in (TOTP, QR code, key encrypted with AUTH_SECRET); My account (own password, two-step); admins can reset a lost two-step.
- Notification centre (bell): new website requests and owner opportunities, assignments, online payments, job details/approvals/changes, late jobs and late first replies (daily escalation), applications, claims, refunds.
- ERP: payment methods (bank details printed on invoices and the customer page; cash/cheque/card; online gateways), service jobs (created when an invoice is paid; SLA hours per service from strategy §8.3; pause while waiting on the customer; green/amber/red; schedule, supplier and cost, deliveries, customer approval or changes with revision rounds; margin and supplier rating), approvals inbox (refunds need an admin who did not request them; claims; leave), refunds as negative payments with a credit note, recurring expenses, expense claims with reimbursement, receipts, customers-owe aging, ERP overview.
- HR app: People, Leave, Payroll, Renewals and Hiring as separate pages; hiring stages (Screening → Interview → Offer → Hired; suppliers Verified → Approved → Active) and a supplier scorecard.
- CRM: new customer / request by staff (calls, WhatsApp, walk-ins; phone deduplication; source; consent with evidence), global search, request-type pipelines, owner opportunity review (accept → draft property; not selected → polite message), document vault (customers, properties, requests, jobs, employees; access-checked and logged opening; share with the customer), Customer 360 (invoices, jobs, documents, portal link).
- Customer portal (/portal): sign-in link by email or sent by staff; requests, invoices with pay buttons, receipts and credit notes, jobs (details form after payment, approve or ask for changes), shared files.
- Knowledge base with 7 starter articles from the strategy (SLA, prices, owner review checklist, contact rules, client media money, refunds and approvals, answering a new request); readable per role.
- Bugs found by the browser tests and fixed: buttons relying on their own name/value lost it (claims approve/reject, template reset) — each button now has its own action; the progress bar crashed on forms with a field named "method"; pay buttons blocked by `Origin: null` (Sec-Fetch-Site check).
- Verified: 4 browser suites against Neon — launcher/apps/MFA/jobs/portal/vault/claims/review 57, operations 58, CRM/ERP menus and payments 33, round 3 (staff entry, search, refunds/credit notes, margin/rating, recurring, knowledge base, key numbers) 26 — plus website smoke 57. All pass; test data removed after each run.

## Phase 2/3: market intelligence, staff mobile app, WhatsApp automation, AI (2026-11-01)

- Market intelligence (CRM → Market intelligence, strategy §27.2): demand heat map by area (demand / shortage / unmatched), by-area table (people looking buy/rent, unmatched, our supply, shortage, median budgets and prices), wanted vs available property types, buy and rent budget bands, sources with win rate, 12-week trend. Our own data only.
- Staff mobile app (Field, strategy §26.8): installable on the phone (manifest + server-drawn icons; opens on Field), today's viewings / follow-ups / jobs with call, WhatsApp, directions, check-in with location saved on the request, viewing results, quick actions (new request, photos, receipt, search). Location allowed for staff pages only.
- WhatsApp (Meta Cloud API, strategy §8.2 + Appendix F): automatic messages also sent as approved templates to customers who agreed to WhatsApp (outbox channel, delivery receipts), inbox and conversations in the CRM, replies within the 24-hour window, new numbers become customers, STOP opt-out, signed webhook (X-Hub-Signature-256), template mapping on Messages → WhatsApp. Migration 0007.
- AI (Claude via the official SDK, claude-opus-5-5 by default, server-side refusal fallbacks on): staff assistant with read-only, permission-limited tools (requests, properties, customers, unpaid invoices, open jobs, my day, waiting requests); fill a new request from a pasted message (structured output); Arabic + English listing drafts. Hourly limit, audit log, customer text treated as data.
- All four are off until keys are set (docs/runbooks/whatsapp_ai_setup.md); market intelligence and the field app work now.
- Verified: new suite 29 checks (market page and map, field check-in with emulated GPS, viewing result, manifest/icon, permissions policy, WhatsApp verification/signature/inbound/retry/notification/inbox/reply/receipt/STOP/templates/auto template, AI screens and graceful failure with a test key) + regression 57 + 58 + 33 + 26 = 203 checks, no page errors. Real WhatsApp and AI calls not made (no keys yet).

## Integrations page: connect services without a developer (2026-11-01)

- Admin → Integrations (🔌, admins only), like credentials in n8n: one card each for Email (Resend), Thawani, Paymob, WhatsApp Business and AI (Claude). Each card has the fields, step-by-step "where to find these" in Arabic and English with a link to the provider, the webhook/return addresses to paste, an on/off switch, **Save and test**, and the last test result (green/red with the provider's own message). Removing keys needs a confirmation.
- Keys are stored in `settings` (`integration:<id>`), secrets encrypted with AES-256-GCM (AUTH_SECRET); the page only shows their last 4 characters; saves, tests and removals go to the activity log without values. Environment variables still work as a fallback, so nothing already set in Vercel breaks.
- Tests: Resend sends one email to the admin; Thawani lists checkout sessions; Paymob creates an unpaid 1 OMR intention; WhatsApp reads the number's name from Meta; Anthropic looks up the chosen model (no cost). AI model (Opus 5.5 / Sonnet 5.5 / Haiku 5.5) and the hourly AI limit per staff member are set on the card.
- All five services now read their keys through `lib/integrations.ts`. Webhook signature checks became async; every call site was reviewed by hand (a missing `await` on `!validSignature(...)` would have skipped the check — the type checker does not catch that).
- Verified: `npm run test:integrations` 29/29 (encryption at rest, keep/clear secrets, on/off, the modules reading saved keys, WhatsApp/Thawani/Paymob signatures accepted and tampered ones refused, each real provider rejecting fake keys, rows removed afterwards); unsigned webhooks refused on the built site (403/401); smoke 57/57; typecheck and production build clean.

## Viewing booking, team calendar, saved properties, AI reply drafts (2026-11-01)

- Customers book viewings online from their portal (strategy §8.2 viewing flow): "Suggested for you" lists the properties staff sent (photo, area, price, map link) with **Book a viewing** and ❤ **Save**; "My viewings" lets them change or cancel. Free times follow Admin → Settings → Viewings booked online (days, hours, slot length, notice, days ahead; default Sat–Thu 09:00–18:00, 60 min, 24 h, 14 days) and skip times when the agent or the property already has a viewing. A booking moves the request to Viewing, tells the agent (or managers when unassigned), sends the editable "Viewing booked online" message with the portal link, and shows 🌐 in the timeline; at most 3 upcoming online viewings per customer; a per-property advisory lock stops double booking. The "property suggested" message now links to the portal ({{portal}}).
- Team calendar (CRM → Calendar): the week's viewings, follow-ups and scheduled jobs, Sunday–Saturday in Muscat time; agents see their own, managers pick a person or everyone; online bookings and results shown.
- Saved properties: ❤ on the request's suggestions for staff, and a "Customer saved a property" notification.
- AI in the WhatsApp inbox: "✨ Draft reply" (customer's language, facts from the data only, may offer the customer's booking link; staff edit and send) and "✨ Summary" on the conversation and customer pages. On demand only, within the hourly AI limit.
- Migration 0008 (saved_properties, activities.source).
- Verified: `npm run test:viewings` 31/31 (opening hours, notice, no Fridays, booking, taken/invalid/foreign times refused, two parallel bookings → one wins, reschedule, limit, cancel only own, notifications, save/unsave, portal pages render, forged link refused, test data removed) + integrations 29/29 + smoke 57/57; typecheck and production build clean. AI draft and summary not called for real (no Anthropic key yet).

## Owner dashboard, fair auto-assignment, weekly manager report (2026-11-01)

- Owner dashboard in the portal ("My properties"): for each property the owner listed with us (accepted from their own listing request, or entered with their phone): status and whether it is on the website, map views (30 days and total), buyers it was shown to or who asked, saves, viewings done/booked and their outcomes, offers and the best offer, the median asking price of at least 3 similar available listings in the area (never fewer, so no single competitor's price shows) and how many people are looking there within the price. No buyer's name or contact is ever shown. Map views: the map posts one view per listing per browser session to `/api/views` (same-origin, public listings only), counted per Muscat day.
- Fair auto-assignment (Settings → New requests, off by default): new website searches go to the person in the rotation (Staff page → "Gets new requests") with the fewest open requests, then whoever waited longest; optional move to the next person after N hours without a first reply (once per request, both told). The check runs after staff page views (at most every 10 minutes, atomic claim) and in the daily cron, since Vercel's free plan runs cron once a day.
- Weekly manager report: every Sunday 09:00 Muscat (daily cron), emailed to admins and managers in their language and added to the bell: new requests by type and source, first-reply average and late count, viewings and outcomes, online bookings, offers, wins, income (our share), expenses, overdue and total receivable, and a per-person line (open, new, late replies, viewings). Page: Reports → Weekly report, with "send now" for admins. Same figures as the Finance page helpers.
- Migration 0009 (property_views, users.receives_requests).
- Verified: `npm run test:owners` 30/30 (owner sees own properties by both links, counts, best offer, median only with ≥3, demand within price, no buyer names in data or page, views counted once and only for public listings, cross-site refused; rotation off/on, fewer-open then longest-waiting, listings untouched, notification and timeline, reassign once and only unanswered, throttle; weekly report sections in both languages, Sundays only, once per week) + viewings 31/31 + integrations 29/29 + smoke 57/57; typecheck and build clean. Settings it changed were restored and test data removed.

## Release A: website chat, calculators, reviews and referrals, online agreements (2026-11-01)

- Website chat assistant (Settings → Website chat assistant, off by default; needs the AI connection): a chat button on every public page answers from public listings and projects only (read-only tools), and turns the conversation into a CRM request through the same `submitForm` path as the website forms (validation, customer match, consent, numbering, auto-assignment, confirmation) with source "Website chat". Limits: 40 messages per visitor per day (hashed IP) and a daily total cap, counted atomically in `chat_usage`.
- Calculators page (/calculators, both languages): monthly mortgage payment, affordability (highest price from income, other repayments, savings) and rental yield (gross and net); computed in the browser; buttons open the search form with the budget filled in.
- Reviews: asked automatically when a request is marked Won or a service job is completed (editable "Review request" message); one per deal or job; shown on the home page only if the customer allowed it and staff approved it (Admin → Reviews & referrals), first name only; optional Google review link for 4–5 stars.
- Referrals: every customer has an invite link (/r/CODE, in the portal and after a review) that opens the search form with utm_campaign=ref-CODE; the request records "Referred by" (never self); referrals table in the admin. The language middleware skips /r/.
- Online agreements (Admin → Agreements; panels on customer and request pages): start from a template (exclusive marketing, marketing, reservation, blank) filled from the records, edit, send; the text is fixed with SHA-256 when sent; the customer signs on a private link by typing their name and drawing a signature (or declines); name, time, device and IP hash kept; signing refused if the text changed; staff notified; printable signed copy. Template wording is a draft for the customer's lawyer (customer_inputs #36).
- Migration 0010 (chat_usage, reviews, agreements, contacts.referral_code / id_number / nationality / id_expiry, requests.referred_by).
- Verified: `npm run test:release-a` 52/52 (calculator maths, chat off by default, per-visitor and daily caps, chat lead validation and creation, invite code, crediting and self-referral, review request, one review per deal, approval and publish consent, job completion asks for a review, agreement fill, number, draft not signable, hash on send, link queued, missing name/signature refused, sign once, staff told, changed text refused, empty text not sent, decline, calculators/invite/review/agreement pages, forged links refused, chat API closed and same-site only) + owners 30/30 + viewings 31/31 + integrations 29/29 + smoke 59/59. Found and fixed: invite links were redirected by the language middleware; a dynamic import in jobs.ts failed outside Next. Real chat replies not tested (no Anthropic key yet).

## Release B: ID photo to form, commission and targets, marketing kit, offline field app (2026-11-01)

- ID card / passport photo → form (new customer page and customer page, needs the AI connection): the photo is shrunk in the browser, read once by Claude (structured output: name, number, nationality, birth and expiry dates; nulls for anything unreadable), the fields are filled for staff to check, and the photo is not stored. Customers now have ID number, nationality and ID expiry (used in agreements).
- Performance (CRM → Performance): per person and month, deals won, viewings done, income on their deals (payments on invoices linked to their requests, our share only, as on the Finance page) and commission (income × the person's %), against monthly targets set by managers; agents see only themselves; medals for the top three.
- Marketing kit (property page): "Write posts" (AI: Instagram and WhatsApp texts in Arabic and English plus hashtags, from the listing's facts only, never the owner) with copy buttons, and a listing card (1080×1350: photo, Arabic and English title, price, QR code to the listing) drawn in the browser so Arabic renders correctly, with download and share. The cover photo is served from our own address for the canvas.
- Offline field app: a service worker scoped to /admin/field keeps the last loaded day (deleted when signed out); check-in, viewing results and a new quick note are queued on the phone (IndexedDB) and sent to /api/field/sync when there is signal, each action applied once (the phone's id), with "sent later" and the original time when recorded offline; a banner shows no-signal and waiting counts.
- Migration 0011 (targets, users.commission_pct).
- Verified: `npm run test:release-b` 25/25 (ID shape and fields, won/viewings/income share/commission/targets/ranking/month in Muscat time, card data, AI facts without owner or private link, check-in once with map link, offline note time, result and request to Offer, first result kept, someone else's viewing refused, bad shapes rejected, service worker served, sync/photo/performance need sign-in) + release A 52/52 + owners 30/30 + viewings 31/31 + integrations 29/29 + smoke 59/59. Not tested for real: AI reading of a real ID and AI captions (no Anthropic key yet); offline behaviour on a real phone.

## Map: croquis plots and nearby places; new database (2026-11-01)

- Croquis (كروكي) on the property page (Plot section, admins and managers): upload the PDF or photo (kept privately in the property's documents); AI reads plot number, block, location, land use, area and the corner coordinates; staff correct the table; WGS 84 or PSD93, UTM 40N or 39N. Conversion in `lib/geo.ts` (inverse UTM, PSD93 → WGS 84 with EPSG:1439, position vector) matches PROJ 9.5.1 within 3 mm at reference points across Oman (scripts/fixtures/geo-reference.json, made with pyproj). Live preview map; when the croquis does not state the datum the other system's outline is drawn dashed (~380 m apart); computed area vs croquis area and side lengths. "Show on the public map" per plot (decided by staff); a published plot shows the exact place (pin at the plot centre), never the plot number or owner. Staff "Plots map" (CRM): every plot, red = public, grey = staff only.
- Public map: published plot outlines from street-level zoom with area and land use; "Nearby" in the listing panel (schools, hospitals and clinics, pharmacies, supermarkets and malls, mosques, parks, beaches) with the nearest of each and distances, show on map; OpenStreetMap via public Overpass servers (tried in turn), cached 30 days per ~1 km cell, points in Oman only, credited. When all servers are busy the panel says so and the map works as usual.
- Database: the original Neon database (host ep-damp-water-…) stopped accepting its password on 2026-11-01 and could not be found in the customer's Neon account (the server still answers "wrong password", so it probably still exists, e.g. in a Neon account linked to Vercel; its data can be recovered if it is found). At the customer's request the app now uses a new Neon database (ep-young-dawn-…): all 13 migrations, reference data, demo listings and the knowledge base were loaded; there are no staff accounts yet (first admin via /admin/setup). Integrations, settings and test data from the old database are not in the new one.
- Migration 0012 (plots, nearby_cache).
- Verified on the new database: `npm run test:map` 17/17 + release B 25/25 + release A 52/52 + owners 30/30 + viewings 31/31 + integrations 29/29 + smoke 59/59 (two tests now create their own manager instead of relying on real staff). Not verified: reading a real croquis (needs the AI key and a sample) and a live OpenStreetMap answer (all public Overpass servers were busy during testing).

## Test database, map decision tools, calendar subscription, payouts, area rotation, offline photos, staff guide (2026-11-01)

- Tests no longer touch live data: a separate database `aqar_test` on the same Neon server (`.env.test.local`, git-ignored); `npm run db:test:setup`; every test refuses to run unless pointed at it (scripts/test-guard.mts); runbooks/testing.md.
- Map for visitors: price badge (vs the middle price of 3+ similar listings in the same area, type and sale/rent), area insights (typical sale price, rent, price per m², buyer interest as high/medium/low from open search requests, never a number), "My budget" (monthly amount → rent limit and, with the calculators' 25 years / 5.5 % / 20 % down, a buying limit), compare up to 3 listings, "only what's on the map", "alert me about new listings here" (search form with area, purpose and budget). Satellite view not added: no free source for commercial use (Esri World Imagery needs an account and no revenue).
- Nearby places: daily cron warm-up of grid cells for areas, public listings and projects (a few per day, stops when the servers are busy).
- Staff: calendar subscription (private iCalendar link per person for Google / Apple / Outlook; "make a new link" revokes), areas covered per person (rotation prefers them, else everyone), commission payouts (record; Performance shows paid and still due), field app photos (kept on the phone offline, uploaded to the request's documents once each).
- Staff guide: 9 how-to articles (Arabic + English summary) in the knowledge base (`npm run db:seed-guide`, adds only missing titles; run on the live database).
- Migration 0013 (users.area_ids, users.calendar_key, commission_payouts).
- Verified on the test database: test:pages 60/60 (every admin page and tab signed in as a temporary admin), test:extras 11/11, map 17/17, release B 25/25, release A 52/52, owners 30/30, viewings 31/31, integrations 29/29, smoke 59/59.
- Not done: nightly database backup to GitHub (blocked: the repository is public, so even encrypted dumps should not be stored there) — see runbooks/backup_restore.md.

## New website design and customer accounts (2026-11-02)

- Website restyled to the client's design (artifact "home"): Instrument Sans + Tajawal, blue accent #1020F0, glass header with "Log in / My account" and "Start a request", blue hero, rounded cards and fields, light footer (src/app/design.css, loaded after globals.css). The customer portal pages use the same look (src/app/customer.css, scoped under `.cust`). Dark mode from the design is not built yet.
- Customer accounts: /[lang]/account/login (log in / create account tabs, mobile number or email + password, keep me logged in, continue as guest), /[lang]/account/forgot (6-digit email code, new password, every old login ends), /[lang]/account (My account: requests, viewings, saved properties, owner dashboard, jobs, invoices, receipts, invite link, files — the same sections as the private portal link, now one shared component).
- An account shows customer data only after ownership is proven (ADR-051): email code, opening a private link we sent while logged in ("Add to my account"), staff linking (Admin → customer → Website account, managers/admins), or a request sent while logged in that creates a new record with the account's own mobile/email.
- Security: bcrypt passwords, database sessions (SHA-256 of the cookie), 30 days with "keep me logged in" else 12 hours, 5 failed logins in 15 minutes lock the account, same answers for unknown accounts, codes hashed with AUTH_SECRET (15 minutes, 5 tries, 3 per hour).
- Migration 0014 (customer_accounts, customer_sessions, customer_codes), applied to the live and test databases.
- Verified on the test database: new test:accounts 32/32 (through the real pages and forms); test:pages, viewings, owners, release A, release B, map, extras and integrations all pass; public pages load with the new header.
- Not done: SMS codes for accounts made with a mobile number only (they connect through the private link or staff; password reset by contacting the team).

## Website layout matched to the client design (2026-11-02)

- Side menu on wide screens (right side in Arabic) with icons, Explore and Company groups, "Start a request", language and log in at the bottom; top bar with a menu button on phones (components/Header.tsx). Floating "WhatsApp us" button when a WhatsApp number is set.
- Home page rebuilt like the design: photo hero with type chips, search card over the hero (Buy/Rent, type, area, budget, bedrooms → pre-fills the request form, bedrooms now included), map link, area ticker, "Aqar in numbers", featured banners (projects + selling + content services, auto-rotating), "Available now" project cards, why us, content services row, consulting band, reviews, FAQ, guides, "Talk to our team" band.
- Every inner page header is the blue photo banner (components/PageHead.tsx); login on a photo band; new footer (brand, social links, three columns, legal line); request forms as one rounded panel; project cards like the design.
- Admin → Settings → Website: Instagram, Facebook and Threads links (footer and contact band; https only).
- Styles: src/app/site.css (layout pieces), design.css keeps tokens and shared pieces. Photos from the design in public/img/photo-1…5.jpg.
- Checked with screenshots (desktop English and Arabic, 390 px phone: no sideways scrolling) and all test suites on the test database.

## Admin matched to the client admin design (2026-11-03)

- Shell: glass side rail (brand, CRM / ERP / HR switch, "All apps", menu in groups with line icons, general pages, the signed-in person with sign out) and a glass top bar (where you are, search with Ctrl K, New, language, light/dark, open website, notifications). On phones the rail slides in from the side (right side in Arabic).
- Look: soft blue canvas with light orbs, glass cards, Instrument Sans + Tajawal, pill statuses, underline tabs, rounded 40 px fields and buttons; blue band with key numbers on Today, ERP overview and All apps (now inside the shell, same address); sign-in and setup on the blue band.
- Dark mode: the moon/sun button in the top bar; the choice is kept per browser (light until someone picks dark). Invoices and agreements stay white for printing.
- Everything is the shared admin stylesheet (src/app/admin/admin.css) and src/admin/Nav.tsx, so all admin pages, including Staff accounts and settings, follow it.
- Not built (shown in the design as sample data): AI agents (social listening, market scrapers, matcher app) and "Add a property by photos".
- Checked with screenshots (English, Arabic, dark, phone) and test:pages (every admin page), accounts, release A/B, viewings, extras on the test database. scripts/shot-admin.mts makes a temporary admin session for screenshots (test database only).

## The built-in agent (2026-11-05)

- One agent inside the admin (fourth app next to CRM, ERP, HR; admins and managers). Each run: reads the web pages an admin listed, compares them with our requests and listings, writes suggestions. Runs daily (/api/cron/agent), on "Run now", and re-compares our own data at most hourly (no web reading).
- Suggestions: late first reply, matches to review, request with no match, ad that fits a request (same rules as lib/matching.ts, top 3 per request), our listing 15%+ above or below the market (3+ similar ads), price drop of 5%+, more demand than listings in an area. They carry the reasons, leave the list when no longer true, and a person's decision is never overwritten.
- Actions: open the request, property or ad; add a follow-up for tomorrow; re-check our listings; done; dismiss. Nothing happens without a button, nothing reaches a customer, and every decision is in the activity log.
- Reading the web (lib/agent-web.ts): obeys robots.txt, identifies itself, one try and stops on a refusal or challenge page, public https addresses only (also after redirects). Reads structured data first; the model chosen from OpenRouter's live list (Admin → Integrations, optional, free models available) reads other pages. Phone numbers and emails are removed before anything is stored or sent; no customer data goes to OpenRouter; AI answers are only data and addresses not on the page are thrown away.
- An admin adds each page and must confirm the site allows automatic reading. No sites are preconfigured.
- Migration 0015 (agent_sources, market_listings, agent_suggestions, agent_runs). Must be applied to the live database BEFORE this code is deployed.
- Fixed: the customer page "Unlink" button relied on the button's own value (ADR-040), so it did not unlink.
- Verified on the test database: test:agent (pretend web and AI), test:pages, test:integrations; real page opening over the internet on our own live site. Not verified: a real model answering through OpenRouter (no key yet), and no real property site has been read.
- OpenRouter replaced Gemini (not yet released). Admin → Integrations shows OpenRouter's live model list in a scrolling box with search: only models that read text and can answer in JSON, free ones first, with prices. The chosen model is used on the next read. Also fixed: "Save and test" on every integration only saved and never tested, because it relied on the button's value (ADR-040); it now has its own action. Verified in a browser on the test database. Not verified: a real model answering (no key yet).
- Sign-up emails not arriving: the live sender is Resend's test address (onboarding@resend.dev), which only delivers to the Resend account owner; the live message log shows provider_403. A verified domain is needed (customer_inputs 48). The account page no longer says a code was sent when it was not, unsent codes no longer use up the limit of 3 an hour, and the Email card warns about the test sender. The forgot-password page keeps its neutral wording so it does not reveal which emails have accounts.

## Customized digital invoice (2026-11-10)

- ERP → Invoice design (admins and managers): logo, brand colour, layout (colour band, classic, minimal), company stamp or signature, VAT on/off and rate (Oman 5%), terms and footer in English and Arabic, default due days and quote validity, QR code and amount-in-words switches. Stored in the settings table; the page shows a preview of a sample invoice.
- The quote / invoice document (InvoiceDocument) is redesigned: "TAX INVOICE / فاتورة ضريبية" when VAT is charged, From / Bill to / number-date-due box, numbered lines, subtotal, discount, VAT, total, paid and balance, amount in words (Arabic and English, lib/invoice-math.ts), PAID / PARTLY PAID / OVERDUE / DRAFT / CANCELLED stamp, QR code to the signed customer link (where they can pay), how to pay, terms, stamp. Fits one A4 page when printed; always light even in dark mode.
- Invoices get subtotal, discount, vat_rate and vat_total (migration 0016; old invoices get subtotal = total). Discount and VAT apply to our fees only; client media money has neither. Each invoice keeps the VAT rate it was made with. Must be applied to the live database BEFORE this code is deployed (Vercel's prebuild runs it).
- Drafts can be edited (lines, discount, VAT, due date, notes) and any quote or invoice can be duplicated. The line editor shows subtotal, discount, VAT and total as you type. A form error now returns to the form with a message instead of the invoice list.
- VAT collected is not income: the finance summary and performance income leave it out, and Finance shows "VAT collected".
- Fixed: the invoice was unreadable in admin dark mode (white headings and dark table header on the white page).
- Verified on a local test database: created, edited, sent and part-paid an invoice with VAT, discount and client media money; the customer page, an A4 PDF, mobile and dark mode; a quote; test:pages passes (Invoice design page added to it). Not verified: the Arabic amount in words should be checked by an Arabic speaker for unusual amounts, and against the Oman Tax Authority's e-invoicing rules.

## WhatsApp customer agent (2026-11-10)

- The agent answers customers on the WhatsApp Business number from the live database (lib/wa-agent.ts): public, verified, available listings only. It replies in the language of the customer's latest message (Arabic in a friendly Omani tone, or formal Arabic if the customer writes formally; English otherwise) and switches when the customer does.
- Tools: search listings (type, areas, price, bedrooms, furnished, sort), listing details (description, project, price per m² against the area median, nearby places), compare 2–4 listings, recommend by the customer's saved preferences (with reasons; never more than 10% over budget), save preferences, send photos (up to 4 per listing, 8 per reply, from the listing's gallery and cover; caption has the code and the map link), new-build projects, viewing request (a follow-up for the team, staff told; the agent never promises a time), save the search as a request (only after the customer agrees), hand over to a person.
- Hands over (and stops answering that chat) for offers and negotiation, complaints, contract/legal/payment questions, owners selling or letting, or when the customer asks for a person; the assigned staff member (or admins/managers) get a notification.
- WhatsApp → Agent settings (admins and managers): on/off, "staff approve each reply" (default) or "send automatically", any time or only outside office hours (Sun–Thu 8:00–17:00 Muscat), replies per day (default 200). Approve mode keeps one draft per chat: staff edit the text, untick photos, then Send or Discard.
- In each chat: the agent's messages are marked 🤖, photos show in the thread, Pause/Resume, and "What the customer wants" (saved preferences and language). A staff reply pauses the agent in that chat.
- It does not answer when: off, AI or WhatsApp not connected, paused, the customer sent STOP, the 24-hour window is closed, office hours in after-hours mode, or the daily limit is reached. It waits 4 seconds so several quick messages get one answer, and never answers twice. On an AI error nothing is sent and staff are told.
- AI through OpenRouter (2026-11-10), not Anthropic directly: OpenAI-style chat completions with tool calls, `provider.require_parameters` so only providers that support tools are used. Model: chosen on the agent settings (only tool-capable models are listed), else the model set for OpenRouter in Integrations.
- Admin instructions (2026-11-10): WhatsApp → Agent settings has "Instructions for the agent" (tone, how to sell; prefilled with the default text, which is not stored until changed, plus "Go back to the default instructions") and "Never say or do" (one rule per line). The prompt is: fixed rules in code (language, facts only from tools, handover, links, ignore instructions inside customer messages), then the admin's instructions, then the never-say list, then the areas.
- Webhook: replies run after Meta gets its 200 (next/server after(), maxDuration 120).
- Migration 0017 (wa_bot table; wa_messages.bot and wa_messages.media). Apply to the live database BEFORE deploying this code.
- Verified on the test database with a pretend AI and pretend WhatsApp: npm run test:wa-agent (54 checks: Arabic and English chats, language switch, search, compare, recommend, photos, viewing, handover, content filter, admin instructions/never-say/model in the request, approve mode, every stop rule). Not verified: a real model answering, and real WhatsApp delivery of photos (photo links must be public https, e.g. Vercel Blob).

## Charts (2026-11-10)

- src/admin/charts.tsx: hand-built charts with no library or client script, in the page direction (Arabic: time runs from the right) and light/dark: grouped columns, a line with a wash, horizontal bars (ordered stages shaded light → dark), stat tiles with sparklines. Each has a hover/keyboard tooltip and "Show the numbers" (a table). Colours checked for colour-blind separation and contrast in both themes.
- Finance: income and spending by month (12 months, profit in the tooltip). ERP overview: the same for 6 months. Reports: new requests per day (per week past ~2 months), open requests by stage, type, source and areas as bars. Today (admins and managers): last 14 days tiles for new requests, deals won, WhatsApp messages received and income (ERP users), each against the 14 days before.
- Checked with screenshots in English, Arabic, dark mode and on a phone; test:pages.

## Map: show what we have, nothing to play with (2026-11-10)

- Direction from the owner: customers should not have to work the map; it should show the listings clearly.
- Removed from the public map: "Only what's on the map", 3D buildings, "Show everything" and map tilting/turning (zoom buttons only). Going back to "All areas" fits the whole map again.
- Clearer display: sale pins blue and rent pins orange (a ring and a dot; filled when chosen), each area label shows the number of listings and the lowest price ("from 62K"), areas with nothing matching step back, labels hang below the area so pins and labels do not cover each other, a one-line legend in the map corner, and hovering a listing card lights up its pin (and the other way round).
- Kept: For sale / For rent, type, area, "My budget" and compare (both kept at the owner's request), Map/List, the listing panel with "Register interest", price compared with similar listings, area insights, "Alert me" and nearby places.
- Checked with screenshots (English, Arabic, phone) using demo listings on the test database (removed after) and test:pages. The map tiles themselves could not load in the test environment, so the base map was a plain background.
- Hovering a pin (on a computer) shows a small card with the photo, title, price and bedrooms.

## Selling and simpler screens (2026-11-10)

- All AI now goes through OpenRouter (lib/ai.ts): the website chat, the WhatsApp agent and the staff helpers (summaries, ID scan, pasted messages). Integrations → "AI (OpenRouter)" holds the key, the model and the AI calls allowed per hour (default 60). The old Claude setup is used only when OpenRouter is not connected. Checked with npm run test:ai-openrouter (a pretend OpenRouter; 14 checks).
- The WhatsApp agent can book a viewing when it sends replies automatically: it offers free times for the listing and books one only after the customer agrees, then sends the customer their portal link to see or change it. Staff are told. In "staff approve each reply" mode the booking tools are hidden (it still asks staff as before). Checked in test:wa-agent.
- What the customer wants (saved by the agent) now also shows on the customer file.
- Invoices and quotes: the customer's address and VAT number (saved on the customer file and editable there) and "For" the listing (by its code, prefilled from the request) print on the bill, with the request number as reference. A wrong code shows an error and keeps what was typed. Migration 0018 (contacts.address, contacts.vat_number, invoices.property_id): apply to the live database BEFORE deploying.
- Requests: "+ Quote" and "+ Invoice" buttons for admins and managers with ERP access.
- Empty lists say what to do: a search with no results says so with "Clear search"; an empty list offers "+ New entry" (requests, customers) or "+ New quote/invoice".
- Not done: errors shown next to each form field.
