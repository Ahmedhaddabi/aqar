# Aqar 360

Phase 0 foundation for Frappe 16 / ERPNext / HRMS / CRM / real_estate.

Start with docs/PROGRESS.md, docs/gap_report.md, and docs/data_model.md.

The master strategy V10 PDF was supplied on 2026-10-30; see docs/implementation_plan.md for the reconciled build plan and docs/gap_report.md for the section mapping. Stop for review before each milestone checkpoint.

Use infra/compose.dev.yaml for development. It reuses the installed image as a Python foundation baseline and bind-mounts our custom app. Node tooling is deferred to Phase 1. Local staging shares MariaDB and Redis with the local site; this is not production isolation. Staging/production images must include aqar360 through apps.json once an approved custom-app Git URL exists.

