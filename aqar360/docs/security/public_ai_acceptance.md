# Public AI launch gate — blocked pending Appendix G

The user requires all 14 Appendix G tests to pass before launch. The original Appendix G was not provided. This register deliberately does not fabricate test definitions.

| Required test ID | Definition | Automated evidence | Launch status |
|---|---|---|---|
| G.5-1 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-2 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-3 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-4 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-5 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-6 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-7 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-8 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-9 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-10 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-11 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-12 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-13 | Await original Appendix G definition | Not implemented | BLOCKED |
| G.5-14 | Await original Appendix G definition | Not implemented | BLOCKED |

Known controls from the supplied prompt: separate public/staff gateway; fixed allowed tools; record authorization outside the model; no CRM/invoice/commission/supplier/secrets exposure; untrusted file/text handling; encoded outputs and link validation; rate/spend limits; signed/replay-safe webhooks; redacted minimal retention; kill switch; core operation during dependency outage; independent LLM-focused penetration test; no critical/high findings.

These known themes are design requirements, not a replacement for the exact fourteen acceptance tests. Public AI is disabled by server-side settings validation in Phase 0. A later implementation must supply explicit per-feature rollout/kill controls and executable tests.

