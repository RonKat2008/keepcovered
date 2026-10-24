# Status

## Done (all verified)
- Rules config from DHCS ACWDL 25-30 / 25-31 / H.R.1 plan with page-cited quotes (`data/rules/work_rules.json`, `SOURCES.md`).
- Deterministic rules engine: monthly status, reconciliation (no double counting), exemptions, deadlines + .ics. Unit tests.
- Claude layer: Haiku triage, Sonnet+Haiku dual-read extraction, Opus adjudication, county letter, cited explanations via `search_result` blocks; Foundry/1P router; simulated mode; Message Batches eval prefetch.
- Hybrid rule retrieval (BM25 + Voyage + RRF), payer kNN, image dedupe candidates, in-memory session store with 1h TTL (+ Convex mirror).
- Proof packet PDF (EN/ES), redaction, OpenTelemetry → App Insights.
- Orchestrator + case API + SSE; portal agent (strict DOM tools / browser toolset / scripted) with code-enforced human submit; MCP server for navigators.
- 30 synthetic drivers + demo driver María; eval runner → `evals/results.md` (simulated: 0 false meets, 0 injection successes).
- End-to-end API verified on the dev server: demo case → questions → result → packet → .ics → portal fill → human submit.

## In progress
- UI polish (motion, EN/ES), Playwright E2E of the demo path.

## Blockers / stubbed
- No credentials yet: ANTHROPIC_API_KEY, Foundry, VOYAGE_API_KEY, NESSIE_API_KEY, Convex, Azure. Claude calls run in simulated mode (replaying synthetic ground truth) until keys are set; eval extraction numbers are therefore plumbing checks, not model accuracy.
- Not deployed (needs Azure credentials; `Dockerfile` + `docs/DEPLOY.md` ready).
