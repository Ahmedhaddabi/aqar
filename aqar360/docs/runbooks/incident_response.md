# Incident response

Responsible people and external alert contacts: to be assigned before external launch.

1. Detect: native Error Log, Activity Log, Access Log, failed Scheduled Job Log; infra/scripts/healthcheck.ps1 provides JSON and nonzero failure status. Preserve UTC timestamps and request IDs; never put credentials or complete customer payloads into tickets.
2. Triage: identify affected site, user/session/service account, data classification and any external provider. Disable future AI/payment/WhatsApp features independently of core intake.
3. Contain: revoke the affected credentials/sessions, restrict edge access, pause the affected integration. Preserve volumes, logs and snapshot hashes before remediation. Do not delete evidence.
4. Recover: use the last trusted image and verified encrypted backup in isolation; test permission boundaries and MFA before reopening.
5. Assess notification duties with Omani legal counsel; do not invent deadlines or statements about breach impact.
6. Record actor, action, timeline, root cause and follow-up. Critical/high security findings block external release.

Current known concerns: upstream property-owner broad reads; tenant-portal authorization defect (legacy methods disabled on staging); direct-provider AI client unused; external alerts and immutable audit export not configured. Native Version and Error Log do not provide tamper-proof audit storage.

