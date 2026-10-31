# Capability gap report — Phase 0

Audit date: 2026-10-29 (Asia/Muscat). Baseline: Frappe 16.54.0, ERPNext 16.53.0, HRMS 16.52.0, CRM 1.89.2, real_estate 1.0.0. Evidence is local installed source and live metadata, not a feature brochure.

**Provided** means native capability exists, not that Aqar's policy is configured. **Configure** means reuse native records/fixtures/workflows. **Build** means custom functionality is required. Phase 0 is not approval for public launch.

The source strategy DOCX is absent. This matrix covers every supplied brief capability and enumerated Phase 2/3 item. Exact coverage of every numbered strategy section or appendix is **unverified**; missing definitions are not fabricated.

## Native capability verification

| Capability | Finding |
|---|---|
| 2FA | Role.two_factor_auth + System Settings.enable_two_factor_auth + OTP App code; baseline disabled, configured on new staging |
| Track changes | Native Version/track_changes; foundation ensures tracking on canonical person/lead/deal/property/unit; not append-only audit |
| Workflow/assignments/notifications | Native DocTypes exist; baseline has zero active workflows |
| Webhook/Web Form/portal | Native framework; baseline has 7 Web Forms; existing customer invoice/career pages and tenant portal need Aqar authorization review |
| Arabic print | Translation infrastructure exists; no approved Arabic business print-format render test. Configure fonts, tax fields and bilingual layouts |
| Supplier Scorecard | Native ERPNext scorecard/criteria/variables/standing/period records exist |
| Expenses/advances/payroll | HRMS Expense Claim, Employee Advance, Salary Structure etc. exist |
| Careers | Job Applicant, Job Opening, Interview and Job Offer exist |
| CRM SLA | CRM Service Level Agreement has working hours, holiday list and priority rows; Lead/Deal have response deadlines and rolling response fields |
| CRM WhatsApp | API, frontend and tests exist; not configured or accepted as the centralized consent-aware messaging service |
| real_estate | 22 DocTypes including Property, Property Unit, Property Document, Property Listing, Visitor Lead Inquiry, inspections, sale/lease, rent invoices and maintenance |
| Tenant portal | Links tenant by Customer.email_id. Maintenance action accepts arbitrary unit with ignore_permissions; invoice retrieval requires review. Legacy actions disabled on aqar360 sites |
| AI | Direct Anthropic client exists upstream. Leave its provider key absent; gateway-only architecture is not provided by that client |
| Permissions | Property Owner native role has broad read grants; do not assign it to customer users without record isolation tests |
| Backup/error logging | Native backups/GPG/restic and Error Log available; external account/alerts and restore-drill evidence still needed |

## Traceable capability matrix

| Brief item | Classification | Reuse / gap | Phase / evidence |
|---|---|---|---|
| B.1 | Provided | 1,068 native DocTypes, fields and permissions inventoried; 0 active workflows; 7 Web Forms | evidence/installed_metadata.json |
| B.2 | Configure | Contact master; native Customer primary contact/Contact Dynamic Link/CRM Deal contact; CRM Lead canonical link added | data_model.md |
| B.3 | Configure | Extend Property and Property Unit; reuse ERPNext Project; upstream owner role not safe for portal assignment | decisions ADR-004/011 |
| B.4 | Build | This gap report covers supplied requirements; unseen strategy sections remain unverified | Missing strategy DOCX |
| B.5 | Build | Draft model covers prompt entities; Appendix B exact coverage unverified | data_model.md |
| B.6 | Configure | App/dev/local-staging/roles/MFA/backup scripts/CI prepared; external staging, backup destination and alerting pending | PROGRESS.md |
| C.1 | Configure + Build | CRM Service Level Agreement and native Workflow/Assignment Rule/Notification/Task; cross-domain timers, pause/escalations and SLA policy need custom work | Phase 1 |
| C.2 | Configure + Build | Contact, CRM Lead/Deal, Customer, Supplier, Property, Version; unified timeline/dedupe/profitability links need implementation | Phase 1 |
| C.3 | Build | Search Request with multi-area/investment/corporate demand, 20% tolerance (0 valid), lifecycle and source fields | Phase 1 |
| C.4 | Configure + Build | Extend Property intake links; human qualification and approved-decline workflow, internal-only reasons | Phase 1 |
| C.5 | Configure + Build | Project + Property + Property Unit; separate availability/construction/verification; source observation/freshness and human confirmation | Phase 1 |
| C.6 | Build | Deterministic unit-level Match with reasons, exclusions, near-match tolerance and approval before sending; no AI SQL path | Phase 1 |
| C.7 | Configure + Build | Item/Item Price/Price List/Quotation/Invoice/Project/Task; Content Order, deliverables and revision constraints | Phase 1 |
| C.8 | Configure + Build | Campaign and CRM attribution; client media liability/pass-through accounting and management fees; approved creatives | Phase 1 |
| C.9 | Configure + Build | Native quotations/invoices/payments/credits/GL/payroll/expenses/advances; approval thresholds, bilingual print QA and forecast extensions | Phase 1 |
| C.10 | Build | Viewing/Offer/follow-up/outbox; native Event/Task reuse; exact F.2 channel-event list unverified | Phase 1 |
| C.11 | Build | Consent Log, Terms Version/Acceptance, suppression/withdrawal/retention jobs; native GDPR forms require review | Phase 1 / legal policy pending |
| C.12 | Configure + Build | File and Property Document exist; private classification/scanning/secure links/append-only audit do not | Phase 1 |
| C.13 | Configure + Build | Email Queue/Notification/Communication exist; approved bilingual central outbox and provider delivery state need implementation | Phase 1 |
| C.14 | Configure + Build | Job Opening/Applicant/Interview/Offer and Supplier/Scorecard exist; public ATS/supplier/consulting workflows need implementation | Phase 1 |
| C.15 | Build | Staff workbench over canonical data; export respects row and field permissions | Phase 1 |
| C.16 | Configure + Build | Native reports/charts/number cards; role-bound executive/ops/finance/demand dashboards | Phase 1 |
| C.17 | Build | Bilingual Next.js, CMS, private account, SEO/structured data/performance/accessibility; existing tenant portal not adopted as public account | Phase 1 |
| C.18 | Build | Strict guest/customer/staff endpoints; schemas/rate limit/captcha/token auth/idempotency; no new guest API in foundation | Phase 1 |
| C.19 | Configure + Build | GTM/GA4/server events/UTM/consent; offline events and no-PII tests | Phase 1 |
| C.20 | Build | End-to-end Arabic request → staff-approved match → viewing → content billing/delivery audit | Phase 1 demo pending |
| D.1.1 | Configure + Build | Thawani hosted checkout; native Payment Entry/Integration Request; gateway decision pending | Phase 2 flag |
| D.1.2 | Configure + Build | CRM WhatsApp code exists; Meta/BSP route, signatures, approved templates, suppression/cost controls pending | Phase 2 flag |
| D.1.3 | Build | PDF local extraction + gateway + evidence-bound human review; never infer unit counts | Phase 2 flag |
| D.1.4 | Build | Voice transcription and proposed record changes, human-confirmed | Phase 2 flag |
| D.1.5 | Build | Free-text demand parsing with customer-confirmed structured output | Phase 2 flag |
| D.1.6 | Build | Relationship Registry/Commission Agreement/Introduction Event; legal approval gate | Phase 2 flag |
| D.1.7 | Build | Restricted partner reliability record; human decisions | Phase 2 flag |
| D.1.8 | Build | Client content approval portal and version/revision accounting | Phase 2 flag |
| D.1.9 | Build | Versioned brochure PDF/share/QR/freshness/private watermark; exact strategy layout unverified | Phase 2 flag |
| D.1.10 | Build | Confidential off-market data room; exclusion from all public search | Phase 2 flag |
| D.1.11 | Build | Verified badges with source/date and expiry/reverification | Phase 2 flag |
| D.1.12 | Build | Rule scores and advisory recommendations; human approval | Phase 2 flag |
| D.1.13 | Configure + Build | Supplier assignments/invoices/ratings and actual service cost/margin | Phase 2 flag |
| D.1.14 | Configure + Build | Versioned role-bound internal knowledge base | Phase 2 flag |
| D.1.15 | Build | Anonymous reverse-demand campaigns and demand heatmap; no identities | Phase 2 flag |
| D.1.16 | Build | Advisory commercial Business Fit score from observed physical facts | Phase 2 flag |
| D.1.17 | Build | Property funnel diagnostic and owner-safe next action | Phase 2 flag |
| D.1.18 | Build | Offline QR/referrals; optional call tracking behind flag | Phase 2 flag |
| D.1.19 | Build | A/B experiments with assignment and outcome evidence | Phase 2 flag |
| D.1.20 | Build | Consented audience syncing only | Phase 2 flag |
| D.1.21 | Configure + Build | Advanced forecasts/ratings/travel/source UI and investment/workbench extensions | Phase 2 flag |
| D.1.22 | Build | Lease renewal reminders only with legitimately available lease data | Phase 2 flag |
| D.2.1 | Build | Permitted-source opportunity intelligence; internal registry first; staff-only discovery | Phase 3 approval |
| D.2.2 | Build | Project/developer watch; reactivate existing project, no duplicate master | Phase 3 approval |
| D.2.3 | Build | Market Radar signals/momentum with source, demand and agreement context; never infer ad spend | Phase 3 approval |
| D.2.4 | Build | Minimal social intent discovery; permitted sources and explicit legal sign-off | Phase 3 approval |
| D.2.5 | Build | Staff AI assistant uses authenticated user's permissions; proposed mutations confirmed/audited | Phase 3 approval |
| D.2.6 | Build | AI report drafts reviewed by specialist | Phase 3 approval |
| D.2.7 | Build | Public chatbot separate gateway/tool boundary; no launch until exact 14 G.5 tests and penetration test pass | Missing Appendix G definitions |
| D.2.8 | Build | Separate BI warehouse/predictive scoring after sufficient outcomes | Phase 3 approval |
| D.2.9 | Build | Staff PWA before native mobile | Phase 3 approval |
| D.2.10 | Build | Developer portal/international/HA/PITR/DR only when justified | Phase 3 approval |
| E.1 | Configure | Namespaced roles; staging TOTP and two-hour sessions; operational row/field grants and live enrolment exercise pending | Phase 0 configuration + Phase 1 permissions |
| E.2 | Configure + Build | Local loopback only; no public DB. External TLS/WAF/encryption/scanning/SAST/DAST/pen-test require deployment/components | External launch gate |
| E.3 | Configure + Build | Encrypted backups + decrypt verification + off-server restic script; full restore drill, remote copy and schedules pending | No external backup destination |
| E.4 | Configure + Build | Native Error/Activity/Access/Scheduled Job logs; scripted ping; external alert delivery pending | No alert destination |
| E.5 | Configure + Build | Provisional per-field review register generated; retention/erasure enforcement is not yet implemented | Legal policy pending |
| E.6 | Configure | No paid services activated; no AI requests; exact E.6 upgrade thresholds absent | Strategy Appendix E unverified |
| E.7 | Build | No-dead-end rules and contextual navigation belong to Phase 1; property secondary actions preserved in design | Phase 1 |
| F | Configure | Commercial/legal items remain pending: fees, rental fee, VAT, retention, hosting/transfer, usage rights, social intent and provider choices | No legal decisions made |
| G | Configure + Build | Code/fixtures/tests/docs/local demo per phase. Phase 0 external dependencies explicitly pending; stop before Phase 1 | PROGRESS.md |

## Missing strategy source

Appendix B's exact entities, Appendix E cost-trigger table, Appendix F's complete event/channel matrix and all fourteen Appendix G go/no-go definitions must be reconciled when supplied. Referenced section IDs can be found in evidence/strategy_references.csv. Presence of an ID there is not evidence that its full source requirement is known.

## Configuration versus code

Configuration through aqar360 install hooks/fixtures: roles, privileged-role TOTP, session policy, guest/public-upload restrictions, selected change-tracking setters and canonical Contact/Project links. Code: settings validation, legacy portal denial, backup verification. No direct upstream source edits and no UI-only changes. Operational workflows, messaging, matching, financial approvals and Next.js are deferred to Phase 1.


## Verified compatibility repairs

Staging custom-field validation detected two upstream Property defects: owner_link referenced absent owner_type, and amenities was Table MultiSelect even though Property Feature has no Link field. Aqar's four custom fields and narrowly selected Property Setters repair these without editing real_estate. The extended Property schema now passes the native Frappe validator. Unrelated existing setters are not exported in Aqar fixtures.

## Strategy V10 reconciliation — 2026-10-30

The master strategy (*Aqar 360 Master Strategy V10, AI + Security*, PDF) was supplied on 2026-10-30. The "Missing strategy source" note above is superseded: Appendices B, E, F and G are now known and are mapped to milestones in implementation_plan.md. Requirements present in the strategy but not previously tracked:

| Strategy § | Requirement | Classification | Milestone |
|---|---|---|---|
| §2.3 | Customer-friendly decline message; internal reasons hidden | Build | M2 |
| §6 | Content price list (120/100/150/180/250/300/600 OMR) as Items/Price List; draft until approved | Configure | M6 |
| §8.3 | SLA target table values and Green/Amber/Red escalation chain | Configure + Build | M5 |
| §9.3 | Licence & renewal register with 30/14/7-day alerts; recurring expense reminders | Build | M7 |
| §9.5 | Petty cash / cash advance custody (issued/spent/remaining/settled) | Configure | M7 |
| §10.1 / §15.3 | JobPosting structured data for real vacancies with closing date | Build | M10 |
| §3.3 / §15.4 | hreflang, segmented sitemaps, canonical/noindex rules | Build | M10 |
| §20.2 | 18-event analytics dictionary; no PII in GA4 | Build | M10 |
| §27.11 | Feature flags and controlled rollout | Build | M1 |
| §27.21 | Source provenance + freshness fields and reverification job | Build | M1/M3 |
| §27.27 | Ten company inputs (master lists, data dictionary, matching rules, freshness policy, commission process, consent, watchlists, migration, roles, pilot) | Business input | implementation_plan.md §3 |
| App. B | 15 entities: Customer, Request, Property Opportunity, Match, Campaign, Content Order, Invoice/Payment, Expense, Employee/Vendor, SLA Task, Consent, Terms Acceptance, Consultation, Job Application, Audit Log | Configure + Build | M1–M8 |
| App. E | Lean/Upgrade/Scale tiers and upgrade triggers (E.6); stack reconciled in ADR-018 | Configure | M12 |
| App. F | 8 lifecycle functions, event/message matrix (F.2), no-spam rules (F.4), 6 pre-launch tests (F.8) | Build | M9 |
| App. G | Public chatbot: tool boundary (G.2), 12 threat classes (G.3), controls (G.4), 14 go/no-go tests (G.5) | Build | Phase 3 |
