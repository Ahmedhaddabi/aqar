# Development, staging and release

1. Start Docker Desktop with WSL 2.
2. In PowerShell, run ./aqar360/infra/scripts/start-dev.ps1 from the workspace. Set AQAR360_ROOT before opening the devcontainer folder; the Compose overlay bind-mounts custom source only.
3. Use docker exec -it frappe-dev-1 bash for Bench development; do not edit upstream apps.
4. Local site: http://localhost:8080. Local staging: http://staging.localhost:8080. Staging credentials are in ignored aqar360/credentials.local.txt. The original local credentials remain in frappe_docker/credentials.local.txt.
5. If staging.localhost does not resolve on the workstation, add a local hosts entry 127.0.0.1 staging.localhost, or test using curl --resolve staging.localhost:8080:127.0.0.1. No public DNS is required.
6. Staging privileged login requires an OTP app. Enrol from the login QR prompt. Do not reset/bypass MFA to make a demo pass.

Before migration: encrypted DB/files/config backup and a tested rollback. Run bench --site staging.localhost migrate and custom-app tests in dev; only approve staging after tests and demo succeed. Both sites share app code and infrastructure, so this local setup is not production isolation.

External deployment is pending an approved host, domain, secrets, TLS/WAF rules, backup account and legal data-location approval. No production site has been created. For published images, export the custom app subtree to a dedicated approved Git repository, add its real URL/branch to apps.json, build immutable image digests and install/migrate on external staging before production. infra/apps.custom.example.json is not deployable.

Rollback: keep the previous image digest and restore the pre-migration database/files/config into an isolated rollback site before switching traffic. Never assume a code rollback reverses schema changes. Do not use docker compose down -v on the existing local project.

Phase 0 CI runs native Frappe integration tests. Playwright and gateway pytest suites are Phase 1/AI-component deliverables; they are not falsely represented by empty passing jobs.


Local email capture uses the already-cached public.ecr.aws/supabase/mailpit:v1.30.2 image, isolated from the news-extraction inbox. Native first-time TOTP setup depends on delivery of an enrolment email. Configure a real approved SMTP provider before external staging; never expose Mailpit publicly.
