# Aqar 360 — rebuild plan (simple stack, free hosting)

Decision 2026-10-31 (ADR-033): replace Frappe/ERPNext with one Next.js application so the whole system runs on free
hosting (Vercel + Neon Postgres, no card) and stays simple for staff who are new to software. The Frappe app in
`aqar360/frappe-app` stays in the repo as the reference implementation (rules, wording, tests) until the rebuild covers it.

## Principles

- One app, two parts: the public website (existing pages) and `/admin` for staff. Same code, one deployment.
- Few screens, plain words, Arabic first with English. Every screen answers "what do I do next?".
- Only what the business uses now. Anything else waits until someone asks for it.
- Rules from the strategy stay: consent, privacy (no owner exact location unless allowed), audit log, approved
  messages, staff approve matches before customers see them.

## Stack

| Part | Choice | Why |
|---|---|---|
| App | Next.js 15 (existing `aqar360/web`) | Already built: website, map, projects, forms |
| Database | Postgres on Neon (free: 0.5 GB, 100 compute-hours/month, no card) | Real database, sleeps when idle |
| Data access | Drizzle ORM + `postgres` driver | Small, typed, serverless-friendly |
| Login | Email + password (bcrypt), database sessions in httpOnly cookies, 3 roles | Simple, no third party |
| Files (photos) | Vercel Blob (free allowance) | Works with Vercel, no card |
| Email | Resend free tier (later) | 100 emails/day free |
| Scheduled jobs | Vercel Cron (daily on the free plan) | Reminders; SLA status is computed when a page loads |
| Local development | The Neon database (no Docker) | Docker and local Postgres were unreliable on the 8 GB PC; same engine as production |

Known limits: Vercel's free plan is officially non-commercial; Neon free has 0.5 GB. Both are fine for the demo and
early use; moving to paid tiers later needs no code change.

## What staff get (admin)

| Screen | What it does |
|---|---|
| Today | New requests to answer, overdue follow-ups, viewings today, numbers at a glance |
| Requests (inbox) | Everything from the website in one list: Buy/Rent searches, owners who want to sell/let, consulting, content services. Assign, change status, add notes/calls/viewings, see matches |
| Customers | One page per person: details, consent, all their requests, activity timeline |
| Properties & Projects | Add/edit properties, units and projects: price, photos, map pin, public on website yes/no, available/reserved/sold |
| Matching | Suggested properties for each request (same scoring rules), approve → mark sent |
| Apps: CRM / ERP | Frappe-style switch: CRM = requests, customers, matching, listings, website, messages, reports; ERP = overview, invoices, expenses, finance, HR, hiring |
| Invoices | Simple quotes/invoices for services, record payments, print/PDF, private customer link with online payment (Thawani, Paymob) (no full accounting ledger) |
| Expenses & Finance | Company spending with receipt photos (bank / petty cash / card); income, client media money, profit and what customers owe for a period |
| Team (HR) | Staff files with ID/passport/visa expiry, leave with approval and balance, monthly payroll with payslips (paid payroll becomes an expense), company renewals; expiry warnings on Today |
| Hiring & suppliers | Job posts shown on the careers page, online applications with CV, supplier sign-up, review statuses |
| Website | Areas (map centre + drawn outline), guides/insights pages with facts and FAQ |
| Messages | Editable email wording (Arabic/English) and a sent log |
| Reports | Requests by stage/type/source/area, staff performance, CSV downloads |
| Settings | Users and roles (Admin, Manager, Agent), company details, website contact buttons, response-time targets, activity log |

## Milestones

| # | Scope | Result |
|---|---|---|
| R1 ✅ | Database + schema, login and roles, admin shell (Arabic/English), Users, seed data (areas, unit types, services). Public site reads areas/pages/projects/map from the new database | Admin login works; website works without Frappe |
| R2 ✅ | Website forms save to the database (contact dedupe, consent, request numbers, listing interest); Requests inbox + Customers + activities + assignment | Leads flow end to end |
| R3 ✅ | Properties, units, projects with photos and map pin; public flags drive the map and project pages | Staff manage the listings the website shows |
| R4 ✅ | Matching engine (ported rules), viewings, offers, Today dashboard | Daily work in one place |
| R5 ✅ | Services, quotes/invoices, payments, print/PDF; message templates + email (Resend); expenses and finance; HR lite; hiring and suppliers; website editor; reports and CSV; settings and activity log | Money, messages and operations |
| R6 | Deploy: Neon + Vercel, demo data, checklist for the client | Two links for the client |
