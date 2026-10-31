# Data governance — provisional field register

No retention durations, tax rules, cross-border processing permissions or commercial fees are approved. Synthetic data only. The settings flag is an administrative gate; it does not automatically validate the contents of every upstream document.

The complete existing field inventory and permission matrix are in evidence/installed_metadata.json. evidence/field_register.csv assigns each inventoried field a provisional classification, purpose, access-review dependency and unapproved retention status. This is a review register, not an assertion that upstream permissions enforce all desired policies.

| Foundation field/group | Purpose | Access | Retention/deletion | Marketing / matching / analytics |
|---|---|---|---|---|
| CRM Lead.custom_aqar_contact | Canonical identity reference | Native CRM permissions; Aqar role grants pending | Human merge/relationship review; period pending | Matching by approved purpose; no marketing consent implied; no PII analytics |
| Property.custom_aqar_owner_contact | Verified owner-person linkage | Native property permissions; owner-role isolation launch blocker | Preserve transaction evidence; policy pending | Internal matching only where authorized |
| Property.custom_aqar_project | Shared project relationship | Same as property | Historical reference; policy pending | Internal matching; aggregate analytics only |
| Aqar Platform Settings.* | Environment/policy gates | System Manager and Aqar Admin | Track administrative changes; duration pending | Never marketing data |
| Role.two_factor_auth / System Settings | Authentication/security | System Manager | Login/security history pending retention approval | No marketing/matching use |
| Backup and site config | Disaster recovery | Restricted operations only | Policy pending; do not prune automatically | Never analytics or model input |
| Source/media rights | Provenance and license evidence | Staff roles by classification | Expiry/reverification rules pending Phase 1 | Publish only with explicit rights |

Contact/identity/bank/payroll/commission/reliability documents require distinct least-privilege and field-level restrictions. Classification is Public / Internal / Confidential / Highly Restricted. Financial statutory retention may override erasure after legal confirmation; do not invent statutory periods.

Consent log, data-subject export/rectify/anonymize jobs and retention enforcement are Phase 1. Do not use the native unsubscribe field alone as the consent service. Native data-request web forms exist but must be reviewed before public use.

Hosting/vendor location, R2 region/account, Resend processing, AI provider retention and source content rights remain pending legal review. No real customer data may be transferred to an unapproved external host.

