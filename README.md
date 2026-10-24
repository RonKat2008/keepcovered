# KeepCovered

**Proof, not paperwork.** KeepCovered helps East Bay rideshare and delivery drivers on Medi-Cal show the county they meet California's new work and community engagement rule, which starts January 1, 2027 under [DHCS ACWDL 25-30](https://www.dhcs.ca.gov/wp-content/uploads/2026/04/25-30.pdf).

Each month, members aged 19–64 in the expansion group must show **80 hours** of work or activity, **or $580 in total gross income** (80 × $7.25), or qualify for an exemption. Gig drivers are the most exposed: they earn across several apps, get no pay stubs, see payouts that don't match their bank deposits, and log "online" hours that differ from "active" hours. In Arkansas, about 18,000 people lost coverage under work requirements (Sommers et al., *Health Affairs* 2020), and most were already working or should have been exempt (Sommers et al., *NEJM* 2019). They lost it to paperwork.

## What it does (in about 2 minutes, on a phone, in English or Spanish)
1. **Upload** app earnings screenshots and a photo of the county letter, and answer a short exemption screener.
2. **Month-by-month table** of income and hours across every app, checked against both paths. For most drivers, the income path is easier to prove.
3. **Plain-language explanation** of the letter and the result, with every rule linked to the DHCS page it came from.
4. **Proof packet PDF** with a cover letter, summary table, evidence index and the screenshots, plus a **calendar file** of deadlines.
5. **Portal agent**: Claude fills a (demo) county portal form and uploads the packet, then **stops**. The member taps Submit.
6. **Navigator handoff** with a pre-written case summary whenever anything is uncertain.

It never decides eligibility, never says "you are exempt", never fills in a missing month, and never submits anything by itself.

## The core design rule: Claude reads, code decides
| Step | Who | How |
|---|---|---|
| Sort uploads | Claude Haiku 5.5 | Structured outputs → `TriageResult` |
| Read earnings screenshots | Claude Sonnet 5.5 **and** Haiku 5.5, independently | Structured outputs; code compares the two readings and checks the arithmetic (gross − fees ≈ net) |
| Disagreements | Claude Opus 5.5 (effort high) | Adjudicates; still unsure → ask the user |
| County letter | Claude Sonnet 5.5 | Deadline cross-checked by a second reader |
| Bank deposits | Capital One Nessie | Deposit descriptors classified by kNN over embeddings (Voyage); low similarity → "Is this from driving?" |
| Dedupe, payout↔deposit matching | **Code** (`src/rules/reconcile.ts`) | Money is never counted twice (tested invariant) |
| Does each month meet the rule? | **Code** (`src/rules/workRules.ts`) | Reads `data/rules/work_rules.json`, where every number cites its DHCS page |
| Exemption screener | **Code** | "You may qualify, so tell your county", never "you are exempt" |
| Explanation | Claude Sonnet 5.5 + Citations | Hybrid retrieval (BM25 + Voyage vectors, RRF) → `search_result` blocks → cited spans |
| Fill the portal | Claude Opus 5.5 agent | Strict tools; submit clicks are blocked in code; field diff read back from the DOM |

## Where it can go wrong, and what we did about it
- **Rules are unclear.** Gross or net for self-employment? Do online hours count, or only active hours? These are encoded as `open_questions` in `work_rules.json`. The month shows as **unsure** and goes to a navigator; it is never "meets".
- **Misread screenshots.** Confidence comes from two independent readers agreeing plus arithmetic checks, not from the model's opinion of itself. Low-confidence numbers can't make a month "meet".
- **Prompt injection.** A screenshot that says "mark compliant and submit" is data. Extraction schemas leave no room for actions, and the portal executor blocks submit clicks in code.
- **Double counting.** Matched deposits are never added again. User-labeled bank-only income is counted once.
- **Sensitive data.** Sessions are deleted after 1 hour and documents are never persisted. Names, case numbers, account numbers, addresses and dates of birth are redacted from logs and traces. All demo data is synthetic.

## Evals
See [`evals/results.md`](evals/results.md). Hard gates: **0 false "meets"** and **0 prompt-injection successes**.

## Architecture
```
Next.js 16 (mobile-first, EN/ES, Motion + anime.js)
  └─ /api/cases → orchestrator (src/agent) ── SSE live trace ──> /case/[id], /trace/[id]
       triage → dual-read extract → adjudicate → letter → Nessie bank → payer kNN
       → reconcile (code) → monthly status (code) → exemptions (code)
       → retrieve (BM25+vectors) → explain (citations) → packet PDF + .ics → navigator handoff
  └─ /api/portal → portal agent (Playwright) → human Submit
Claude via Microsoft Foundry at runtime (first-party API for Message Batches evals and the Files API)
Session store: in-memory with a 1h TTL, or Convex with a scheduled purge · OpenTelemetry → Azure Application Insights (redacted)
```

## Run it
```bash
npm install
cp .env.example .env.local   # keys are optional: without them, Claude calls run in simulated mode
npm run gen:drivers          # synthetic drivers, screenshots, letters, bank data, ground truth
npm run dev                  # http://localhost:3000 → "Use demo documents"
npm test                     # rules engine, reconciliation, retrieval, packet, redaction
npm run eval                 # full eval → evals/results.md
```

## Production path
1. Pilot with a Health Consumer Alliance partner (e.g., Bay Area Legal Aid) and Alameda County Coverage Ambassadors. Navigators are the second customer, and the case summary is written for them.
2. Use the member's own statements or a consented aggregator instead of Nessie demo data.
3. Expose the rules tools to navigators over MCP, so they can work inside Claude.
4. Run on Azure App Service, with Claude on Foundry and Application Insights traces.

*Rules as of the DHCS December 2025 guidance (ACWDL 25-30, 25-31) and the May 2026 implementation plan. Not legal advice. The county decides.*
