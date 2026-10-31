# Data model — Phase 0 draft

This is a design covering the supplied prompt. Appendix B has not been supplied; Appendix B completeness is unverified. Only the foundation settings and four custom fields (three links plus the owner-type discriminator) are implemented.

## Person, property and project masters

Contact represents a person, Customer/Supplier represent commercial parties, and Employee remains the staff employment record. Customer.customer_primary_contact and Contact.links reference existing records. CRM Deal.contact is reused. CRM Lead.custom_aqar_contact is the canonical link; copied phone/name fields are historical/source snapshots, not new masters. A person may have buyer, owner, supplier and former-client relationships simultaneously. Phase 1 resolution uses normalized email/E.164 phone candidates and a human merge decision, retaining source events and foreign-key history; shared contact details do not establish identity. Identity documents stay in the classified vault, not CRM matching fields.

Property and Property Unit retain their upstream IDs, existing leases and document children. Property.custom_aqar_owner_contact points to Contact; custom_aqar_project points to ERPNext Project. Do not equate Property.status=Available/Occupied with verified sales availability. Distinct construction, sales availability and verification fields will be added in Phase 1. Dimensions must record units (existing upstream areas are square feet; display/conversion to square metres must be explicit).

Project is ERPNext Project extended for the developer registry; Task remains work execution. Developer organizations use Customer/Supplier as appropriate with Contact focal points. Unit Type is a proposed domain master because the installed unit type is a Select, not a reusable entity. Sale/Lease Agreement are evaluated for legal transactions, not automatically treated as approved commission contracts.

## Planned entity catalogue

| Domain | Reuse | Proposed extensions / domain records | Phase |
|---|---|---|---|
| Identity | Contact, Contact Email, Contact Phone, Address, Dynamic Link, Customer, Supplier, User | Human-reviewed resolution/merge evidence; Source Touchpoint | 1 |
| CRM | CRM Lead, CRM Deal, CRM Organization, CRM Contacts, CRM Lead Source | Canonical Contact link; separate pipelines; UTM/source snapshots | 1 |
| Geography | Address, Country | Aqar Governorate → Wilayat → Area; coordinates; optional approved distances | 1 |
| Demand | CRM Lead/Deal | Aqar Search Request, Request Area children; investment/corporate fields; expiry/tolerance | 1 |
| Intake | Property, Property Unit, Visitor Lead Inquiry (selected reuse) | Aqar Opportunity Intake; approved decline template; internal reason restrictions | 1 |
| Supply | Property, Property Unit, ERPNext Project | Unit Type; source observations per field, freshness policy; separate construction/availability/verification fields | 1 |
| Matching | Existing supply and request masters | Aqar Match; score components; suggested/approved/sent/rejected; staff override evidence | 1 |
| SLA/work | Workflow, Assignment Rule, Notification, Task, Project, CRM Service Level Agreement, CRM Holiday List | Cross-DocType Aqar SLA Policy and timer/escalation evidence, only where native CRM SLA cannot cover | 1 |
| Content | Item, Price List, Item Price, Quotation, Sales Invoice, File, Project, Task | Aqar Content Order, Order Deliverable, revision counters; derivative media relationships | 1 |
| Campaign | Campaign, Campaign Schedule, CRM Lead Source | Campaign property/project links, client media liability, fees, UTM, qualified outcomes | 1 |
| Finance | Quotation, Sales Invoice (returns for credits), Payment Entry, Journal Entry, Purchase Invoice, Cost Center, Project | Print formats, approval thresholds, cost dimensions, forecast scenarios; no duplicate ledger | 1 |
| People costs | Expense Claim, Employee Advance, Salary Structure, Salary Slip, Payroll Entry | Property/project/campaign dimensions and approvals; reimbursement workflow | 1 |
| Renewals | Task, Notification | Aqar Licence/Renewal register with owner, expiry, evidence and 30/14/7 alerts | 1 |
| Lifecycle | CRM Deal, Event, Task | Aqar Viewing, Viewing Outcome, Aqar Offer and counter-offer children; follow-up plan | 1 |
| Privacy | Contact.unsubscribed (one input only), Email Queue | Aqar Consent Log per purpose/channel/version, suppression decision, idempotent message outbox | 1 |
| Legal | File, Print Format | Aqar Terms Version, Terms Acceptance, vendor processor register, retention policy, data-subject request linkage | 1 |
| Vault | File, Property Document | Classification, scan state, rights/provenance, grant/revoke/expiry; Aqar Secure Link and access event | 1 |
| Audit | Version, Access Log, Activity Log | Append-only domain audit event with immutable remote export; sensitive-download evidence | 1 |
| Notification | Notification, Email Template, Email Queue, Communication | Approved bilingual template/version; outbox channel/status; suppression receipt | 1 |
| Careers | Job Opening, Job Applicant, Interview, Job Offer | Closing date, structured data, retention evidence, ATS workflow | 1 |
| Suppliers | Supplier, Supplier Scorecard, Supplier Scorecard Criteria | Application/profile extensions, expertise, territory, safety, onboarding; bank data post approval | 1 |
| Consulting | Project, Task, Quotation, Sales Invoice | Aqar Consultation Request, Assessment Scorecard, report/recommendations/90-day plan | 1 |
| CMS | Web Page, Blog Post, Blog Category | Aqar Area Guide, Guide, FAQ, Market Insight where needed; editorial review and factual provenance | 1 |
| Administration | Role, Role Profile, User Permission, System Settings, Error Log | Aqar Platform Settings (implemented); feature rollout and per-field governance later | 0–1 |
| Payments/chat | Payment Entry, Integration Request, CRM WhatsApp code | Thawani event/idempotency registry; approved WhatsApp template/cost integration | 2 |
| Review ingestion | File, Contact, Project, Property Unit | Aqar Extraction Review; per-field evidence/confidence; transcript/proposed change | 2 |
| Partner rights | Contact, Customer/Supplier | Relationship, Commission Agreement, Introduction Event, restricted Reliability Record | 2 |
| Approval/media | Existing content records and File | Versioned client approval; brochure template/version; confidential data-room grants | 2 |
| Recommendations | Existing outcomes/source observations | Rule score, heatmap aggregates, business-fit evidence, experiment assignment/outcome | 2 |
| Intelligence | Source registry, existing projects/requests | Watchlist, Discovery Alert, Market Signal, Mandate Watch, human-reviewed draft | 3 |
| AI security | User permissions, API credentials, public CMS subset | Gateway budget/redaction/tool authorization ledger; separate public/staff boundary; kill switch | 3 |

## Core relation and lifecycle constraints

Search Request → Contact; Intake → Contact → Property; Property Unit → Property → Project; Match → Request + exactly one supply target (unit preferred). Viewing/Offer reference the approved request/supply pair. Content Order links Property/Project and native commercial documents. Source Observation identifies its target record and field group with first/last seen, verified by/date, source, confidence and usage rights.

Every outgoing message references an approved template version and successful current suppression decision. Consent is purpose/channel specific, not an unchecked marketing boolean. An approval event preserves prior/proposed values and actor. Append-only audit and outbox delivery are Phase 1 implementation, not claims about native Version.

Aqar Platform Settings has environment, legal approval status, real-personal-data permission, selected-campaign policy and locked phase/AI switches. These flags are foundation guardrails, not a substitute for future endpoint record authorization.

## Field types and validation to implement

Budgets/OMR values: Currency with three decimal precision; zero budget tolerance is valid. Timestamps stored consistently and rendered Asia/Muscat; business-calendar SLA uses configured working hours. IDs are opaque/naming-series values, never access tokens. Secure tokens are random, hashed at rest, revocable and expiring. Eligibility, commission, availability and publication need human approval; unknown is never inferred as zero/false.

No public inventory API. No AI permission to query the operational database. Every supplier/customer endpoint must bind records to the authenticated canonical person and reject arbitrary record IDs.


