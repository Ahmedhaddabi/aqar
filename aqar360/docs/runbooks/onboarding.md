# Staff onboarding and MFA

Only synthetic users on local staging during Phase 0.

1. Manager identifies the person's role and approves access. Create a named System User; never share Administrator.
2. Assign the smallest Aqar role. Namespaced roles are deliberately empty of business permissions in Phase 0. Do not add System Manager or native finance/HR roles merely to make a page work.
3. Aqar Admin/Manager/Finance/HR and native privileged roles require OTP App 2FA on staging. Enrol with the first login QR, confirm a fresh OTP, then verify login without an OTP is rejected.
4. Enrolment/recovery and device-session review must be witnessed and recorded without storing OTP secrets in tickets. The seeded Administrator is break-glass, not a normal employee.
5. Test intended permissions and denied cross-customer/finance/payroll access. Portal roles have no desk access and no internal inventory grants.
6. Session expiry is two hours on staging. Review Activity Log / Access Log and revoke sessions when roles change.
7. Disable leavers, remove API credentials and review record assignments. Preservation/retention follows the legal policy once approved.

Only role configuration is tested automatically so far; a human OTP enrolment exercise is required before external staging acceptance.


Local staging captures first-enrolment messages at http://localhost:8025 in its separate Mailpit container. The first OTP App setup step is delivered by email; use that message to enrol, then enter the authenticator code. This inbox is development-only and must not be exposed publicly.
