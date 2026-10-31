# Implementation plan — Strategy V10 reconciliation

Date: 2026-10-30. Source: *Aqar 360 Master Strategy V10 (AI + Security)* PDF, supplied 2026-10-30. This plan turns the strategy into ordered build milestones on top of the Phase 0 foundation. Section numbers (§) refer to that PDF.

## 1. Stack decision (ADR-018)

The strategy's §17 and Appendices E/F assume PostgreSQL + n8n Community + a modular monolith. The foundation is Frappe 16 / ERPNext / HRMS / CRM / real_estate on MariaDB (ADR-004/005). **We keep Frappe as the single source of truth.** Rationale:

- Appendix E's goal is "no per-user subscriptions, no duplicate systems, one database". Frappe is open source and already provides CRM, quotations/invoices/payments/GL, expense claims/advances/payroll, careers, supplier scorecards, workflows, assignment, notifications, Version history and a scheduler — most of the §9/§10 back office does not need to be written.
- Appendix F.5 explicitly allows running follow-up/matching/retention jobs inside the backend without n8n. Frappe `scheduler_events` and `doc_events` fill that role.
- n8n stays optional for later external integrations (Market Watch, provider glue). It never stores customer data and never writes sensitive decisions (Appendix E security controls).
- PostgreSQL/PostGIS is not adopted; geography uses Governorate → Wilayat → Area masters plus coordinates (ADR-005). Revisit only if a measured geo-query need appears.

Hosting consequence: the Frappe stack needs more RAM than Appendix E's smallest tier assumed (backend workers were OOM-killed on the 8 GB dev PC). A load test on the target VPS is a launch gate (M12).

## 2. How each feature is built

| Layer | Technique |
|---|---|
| Data | Custom DocTypes in the `aqar360` app (`aqar_360` module) as JSON + Python controllers; extensions to upstream DocTypes only via Custom Field / Property Setter fixtures. No edits to upstream app source. |
| Behaviour | Controller `validate`/`on_update`, `doc_events` hooks for cross-app reactions (e.g. Property price change → re-match), `scheduler_events` for SLA timers, follow-ups, freshness expiry and retention. |
| Workflow | Native Frappe Workflow for review states (Submitted → Under Review → Accepted/Need Info/Adjustment/Not Selected); Assignment Rule for routing. |
| APIs | `@frappe.whitelist(allow_guest=True)` methods only for public form submission and token-bound self-service; strict field allowlists, rate limits, captcha, idempotency keys, consent version, UTM capture; error envelope from `api.md`. |
| Public site | Next.js (App Router, TypeScript) in `web/`, server-rendered, `/ar/` + `/en/` with hreflang. Talks to Frappe server-side only; content from Frappe CMS records. |
| Messaging | One Aqar Outbox: every email/WhatsApp goes through template version + consent + suppression + idempotency checks. Email first; WhatsApp behind a flag. |
| Feature flags | `Aqar Feature Flag` DocType checked server-side (§27.11); replaces the coarse phase switches over time. |
| Tests | `IntegrationTestCase` per milestone: happy path, permission/isolation, idempotency, and every Appendix F.8 / G.5 test that applies. Run in CI. |
| Delivery | Each milestone ends with: fixtures exported, tests green, docs updated (`data_model.md`, `api.md`, `PROGRESS.md`), and a short demo on staging. |

## 3. Business inputs needed before or during build (§27.27, §25.2)

These are not code; build continues with placeholders where marked, but launch is blocked until they exist.

| Input | Needed by | Blocks launch? |
|---|---|---|
| ERPNext company setup: legal name, CR, chart of accounts, VAT status, currency OMR (3 decimals) | M6 | Yes |
| Approved content price list (§6 values used as draft) and revision limits | M6 | Yes |
| SLA hours/working calendar (§8.3 values used as draft) | M5 | No (draft values) |
| Master lists: areas, developers, projects, focal points (§27.27 1) | M3 | No (start small) |
| Matching rules confirmation: 20% near-match default, ownership rules (§27.27 3) | M4 | No |
| Legal approval: Terms set (§12.2), privacy/consent wording, retention periods, 3% fee wording, hosting outside Oman | M1/M9 | Yes |
| Payment gateway (Thawani vs alternative) and merchant account | M6 | Payment only |
| Email provider account (Resend or Gmail SMTP already prepared) | M9 | Yes |
| Domain, external staging host, off-server backup account | M12 | Yes |
| Git remote for CI and apps.json packaging (ADR-014) | M1 | Yes |

## 4. Phase 1 — MVP / Day 1 milestones

Ordered by dependency. Review checkpoints (stop for user review) after M2, M4, M6 and M10.

### M1 — Platform core (everything else depends on this) — DONE 2026-10-30
- `Aqar Audit Event`: append-only (no update/delete permission for any role, hash-chained), written from a shared helper; export hook for later remote copy. (§26.3, §18.1)
- `Aqar Consent Log` per purpose × channel × version; `Aqar Terms Version` + `Aqar Terms Acceptance` (order, version, timestamp, evidence). (§12.1, §18.3, App. B)
- `Aqar Secure Link`: random token hashed at rest, expiry, revoke, scope to one record. (§26.3, F.4)
- `Aqar Feature Flag`. (§27.11)
- Geography masters: `Aqar Governorate`, `Aqar Wilayat`, `Aqar Area` (bilingual names, coordinates).
- Source/freshness primitives: `Aqar Source Observation` (source type, URL/file, first/last seen, last verified, verified by, confidence, usage rights). (§27.21)
- Tests: audit rows cannot be modified; expired/revoked tokens rejected; consent withdrawal recorded.

### M2 — Demand and opportunity intake — DONE 2026-10-30 (review checkpoint)
- `Aqar Search Request` (buy/rent, property type, multi-area child table, budget from/to OMR, dynamic details, timing, notes, preferred channel, tolerance %, expiry/next review, source/UTM, corporate and investment-mandate flags). (§4.1, §27.10, §27.16, F.6)
- `Aqar Opportunity Intake` for owners/developers/content-only: goal, property facts, initial uploads, owner accuracy declaration. Review Workflow with internal reasons hidden from customers and the §2.3 decline template. (§2.2–2.3, §5.1–5.2)
- `Aqar Consultation Request` (§11.2) and supplier/careers intake reuse native Supplier / Job Applicant with Aqar fields. (§10)
- Guest submission APIs + confirmation with request number + secure self-update/stop-alerts link. Submission succeeds even if email fails (F.8 test 1).
- Duplicate detection: normalized E.164 phone / email candidates → link to existing Contact for human merge; source touchpoints preserved (F.8 test 2, §27.23).
- **Checkpoint:** an Arabic request submitted through the API appears in the staff queue with source, consent and audit trail.

### M3 — Supply registry — DONE 2026-10-30
- Property/Property Unit custom fields: construction status, sales availability, verification status + last verified date, price + price history, public/off-market visibility, Property ID shown everywhere. (§26.2, §27.4, §27.15)
- Project Registry as a dedicated Aqar Development Project (ADR-021; ERPNext Project stays for internal jobs): developer, location, unit types, price range, foreign ownership eligibility (verified/unknown), last updated, focal point. `Aqar Unit Type` master. (§27.14)
- Freshness job: fields past SLA → `Needs Reverification`; Sold Out/Withdrawn/Closed excluded from new matches but kept historically; re-activation reuses the same record. (§27.21)
- Property Digital File view: timeline of Version + Audit Events + linked requests, content, invoices, viewings. (§26.2)

### M4 — Matching engine — DONE 2026-10-30 (review checkpoint)
- `Aqar Match`: request + exactly one supply target (unit preferred), score components (budget, location, type, size, rooms, timing, ownership, readiness), human-readable reasons, status Suggested → Team Reviewed → Approved → Sent / Rejected. (§4.3, App. B)
- Deterministic SQL/Python rules, no AI: price ≤ budget always eligible; budget < price ≤ budget × (1 + tolerance) is Near Match (default 20%, 0% allowed); above excluded. (§27.15)
- Re-match triggers: new/updated unit, price drop, availability change, request edit, project re-activation (`doc_events`). Smart waiting list for requests with no match. (F.3 items 3, 5)
- Internal notification: "New property matches N active requests". Nothing reaches a customer without staff approval; confidential projects never exposed (F.8 test 3).
- **Checkpoint:** demo of a price drop moving a request into Near Match and producing a staff alert.

### M5 — Workflow engine, SLA, viewings, offers — DONE 2026-10-30
- `Aqar SLA Policy` (§8.3 targets as fixtures) applied to intake, content orders, leads, campaigns; reuse CRM Service Level Agreement for CRM Lead/Deal. Timer pauses on Waiting on Client; Green/Amber/Red; escalation employee → team lead → manager by scheduler. (§8.3, §26.1)
- `Aqar Viewing` with outcome (interested / negotiating / not suitable + reason / wants alternatives) feeding matching; `Aqar Offer` with counter-offer children. (§4.2, §27.5, F.3 item 4)
- Approval Engine: `Aqar Approval Rule` thresholds by value/action for discounts, refunds, price changes, expenses; approvals logged. (§26.3)

### M6 — Content services and commerce — DONE 2026-10-31
- Items + Price List from §6 (photos 120, floor plan 100, standard video 150, AI video 180, drone 250, presenter 300, lifestyle 600 OMR; draft until approved).
- `Aqar Content Order` with deliverables, schedule, revision rounds remaining, final clean vs branded assets. (§5.3, §6)
- Quote Builder over native Quotation → Sales Invoice → Payment Entry → Credit Note; bilingual Arabic/English print formats with tax fields; customer sees invoices/receipts. (§9.1, §26.3)
- Media budget recorded as pass-through liability, not revenue. (§7.2, §9.2)
- Payment: invoice + manual/bank payment recording first; Thawani hosted checkout behind a flag with webhook signature, replay and idempotency checks once the gateway is chosen. (§17.1, G.3)
- **Checkpoint:** content order → quotation → invoice PDF (Arabic) → payment recorded → deliverable approved.

### M7 — Back-office finance and operations
- Expense Claim / Employee Advance with property/project/campaign/cost-center dimensions and approval workflow. (§9.4)
- Petty cash: Employee Advance per custodian with issued/spent/remaining/settled report. (§9.5)
- `Aqar Licence Renewal` register with owner, expiry, amount, attachment and 30/14/7-day alerts; recurring expense reminders. (§9.3)
- Payroll Lite through HRMS Salary Structure/Slip (basic, allowances, deductions, paid). (§9.6)
- Reports: P&L, cash flow, AR/AP aging, budget vs actual, service/campaign/project profitability, 3-scenario forecast. (§9.7)

### M8 — Careers, suppliers, consulting workflows
- Careers: public vacancies, apply with CV/portfolio + retention consent, ATS states Applied → Hired/Not Selected. (§10.1)
- Supplier network: application → verified → approved → active → on job → rated/suspended; bank data collected only after approval; Supplier Scorecard reused. (§10.2)
- Consulting: request → scope → quotation → assessment scorecard → recommendations → 90-day plan; disclaimer that it is not a licensed valuation. (§11)

### M9 — Notification center and customer lifecycle (Appendix F, MVP subset) — DONE 2026-10-31
- `Aqar Outbox`: channel, template version, consent version, idempotency key, attempts, status Sent/Delivered/Failed, next follow-up, owner. (§26.4, F.6)
- Approved bilingual templates; quiet hours; max frequency; one follow-up per 7–14 days default. (F.4)
- MVP functions: confirmation, smart waiting list, self-update, post-viewing follow-up, price-drop alert (staff first), channel/frequency preferences, suppression and dedup (mandatory). Rental renewal reminder deferred to Phase 2. (F.3, F.7)
- Tests F.8 1–6 implemented as integration tests.

### M10 — Public website — DONE 2026-10-31 (built before M7–M9 at the user's request)
- Next.js bilingual site per §3.1 menu and §3.2 sub-links; forms call M2 APIs; customer account (requests, invoices, deliverables, preferences, delete request). (§3, §22)
- SEO architecture: one H1, summary answer, fact block, FAQ, internal links, canonical, hreflang, segmented XML sitemaps, robots/noindex for private pages; structured data Organization/ProfessionalService (not RealEstateAgent), BreadcrumbList, Article, VideoObject, JobPosting for real vacancies only. (§13, §15)
- CMS DocTypes for Area Guide, Guide, FAQ, Market Insight with reviewer and last-reviewed date; launch content per §14.3 is editorial work.
- YouTube facade embeds; AVIF/WebP; Core Web Vitals targets LCP ≤ 2.5 s, INP < 200 ms, CLS < 0.1 measured in CI. (§17.2, §17.4)
- GA4/GTM with the 18-event dictionary (§20.2); no phone/email in GA4; UTM → CRM source on lead creation; consent banner. (§20)
- Property page and brochure: Download PDF / Share / Save secondary actions only; brochure generation itself is Phase 2. (§27.13)
- **Checkpoint:** end-to-end Arabic visitor request → staff-approved match → viewing → content invoice, with audit evidence.

### M11 — Staff workspace — DONE 2026-10-31 (with customer account)
- Daily Opportunity Workbench (basic): who to call, best match, score, source, confidence, last contact, next best action; Excel export respecting permissions. (§27.23)
- Customer 360 view; admin dashboard: revenue/expenses/active requests/SLA/pipeline, opportunity queue, at-risk jobs, finance, alerts. (§22, §26.2)
- Document vault: file classification (Public/Internal/Confidential/Highly Restricted), private files, malware scan on upload, signed expiring download links, download audit. (§18.2, §26.3)
- Internal knowledge base (versioned policies/prices/templates) moved forward from Phase 2 only if time allows.

### M13 — Property map (added 2026-10-31 at the user's request; not in the strategy PDF)
- **A. Map search — DONE 2026-10-31.** Website /map: coloured areas (drawn boundary or a circle around the centre), project pins, price pins for properties allowed an exact location, buy/rent/type/area filters, map/list switch, detail panel with unit types and payment plan, "Register interest" pre-filling the request form, shareable links (?area=, ?listing=), 3D buildings. Desk: Map view for Property and Aqar Development Project; area boundaries drawn on the Area form.
- **B. Project pages — DONE 2026-10-31.** /projects index and /projects/<slug>: gallery, key facts, bilingual description and payment plan (shown as a bar when the steps add up to 100%), unit types, live unit list from the registry with filters and "ask about this unit", location map, brochure, register interest, phone action bar, Place structured data.
- **C. Immersive views** (Phase 2 flag): 360° tours (open-source viewer, 360° photos as a content service) and a unit picker on pre-rendered building images with clickable unit outlines.

### M12 — Launch gates
- External staging on the approved domain; HTTPS, Cloudflare WAF/rate limiting; desk access restricted. (§18.1)
- Off-server encrypted backups, schedule, alerts, full restore drill with measured RPO ≤ 24 h / RTO 4–8 h. (§19)
- Load test on the target VPS; monitoring and alerting for uptime, errors, failed payments/messages, backups, suspicious logins. (§19.4)
- Dependency/secret scanning, SAST/DAST, independent penetration test. (§27.18)
- Legal sign-off on Terms set, consent, retention, fee wording and data hosting. (§12, App. E.7)

## 5. Phase 2 (feature-flagged, after MVP is stable)

Built in this order, each behind an `Aqar Feature Flag`:
1. WhatsApp via Meta Cloud API or BSP: approved templates, opt-in, rate limits, cost tracking, webhook signatures. (§8.2)
2. Automated match alerts to customers (still with approval rules). (§4.4)
3. Opportunity / Lead / Match scoring and Recommendation Engine, advisory only. (§26.5)
4. Vendor assignment, service costing and true gross margin; vendor ratings. (§26.5)
5. Client Approval Portal for content with revision accounting. (§26.4)
6. Dynamic brochure PDF + shareable link + QR + freshness + private watermark mode. (§27.12)
7. Off-market opportunities and secure data room; verification badges. (§27.3–27.5)
8. Relationship / Focal Point registry, commission agreements, introduction events, partner reliability record (legal gate). (§27.22, §27.24)
9. AI gateway (FastAPI in `ai-gateway/`) for PDF brochure extraction and voice notes with human review queue; free-text request parsing with customer confirmation. (§16.2, §27.15)
10. Reverse demand campaigns, demand heatmap, business fit score, "why isn't it moving" diagnostic, QR/referral attribution, A/B testing, consented audience sync, rental renewal reminders. (§27.1–27.9, F.3)

## 6. Phase 3 (only with data and approval)

AI opportunity intelligence on permitted sources, developer watch, market radar, social intent discovery (legal sign-off), staff AI assistant using the caller's permissions, AI report drafting, data warehouse/BI and predictive scoring, staff mobile PWA, public chatbot. The chatbot ships only after all 14 Appendix G.5 tests and an independent LLM-focused penetration test pass. (§27.17–27.28, App. G)

## 7. Risks

- **Dev machine capacity:** 8 GB RAM already OOM-kills Frappe workers; adding Next.js dev server will be tight. Prefer building `web/` in a separate session with Frappe workers reduced, or use a cloud dev box.
- **Legal dependencies:** consent, Terms and fee wording block launch, not development. Build with versioned placeholders.
- **Upstream app behaviour:** real_estate portal and Property Owner role were already found unsafe; every customer-facing endpoint is new Aqar code with isolation tests.
- **Scope:** §24 MVP is large. M1–M6 deliver a usable internal system; M10 makes it public.
