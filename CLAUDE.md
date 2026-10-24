@AGENTS.md

# KeepCovered: Medi-Cal work-rule proof agent for gig drivers (Cal Hacks 13.0)

Read `docs/STATUS.md` first. `docs/SPEC.md` is the plan.

## Core rule
**Claude reads, extracts, classifies and explains. Code decides.** Whether a month meets the rule, exemption screening, reconciliation and deadline math are pure functions in `src/rules/` that read `data/rules/work_rules.json`. No LLM call may ever set `MonthStatus.overall`, `meets_*_path`, or an exemption outcome. The app never says "you are exempt" or "you comply". It says "the county decides".

## Stack
- Next.js 16 App Router under `src/` (read `node_modules/next/dist/docs/` before Next-specific code), TypeScript, Tailwind v4, shadcn/ui.
- Motion: `motion` (`motion/react`) for layout, gesture and presence; `animejs` v4 (`import { animate, stagger, createTimeline } from "animejs"`) for timelines, SVG and count-ups. Always respect `prefers-reduced-motion`.
- Claude: `src/claude/` holds the client router. It uses Foundry (`@anthropic-ai/foundry-sdk`) when `ANTHROPIC_FOUNDRY_*` is set and the first-party API otherwise, with 1P only for Batches and Files. Invoke the `claude-api` skill before touching Claude code. Models: `claude-haiku-5-5` triage, `claude-sonnet-5-5` extract/explain, `claude-opus-5-5` adjudicate/portal. Forced `tool_choice` is a 400 on these models, so use structured outputs or `auto` + `strict`.
- Embeddings: Voyage (`src/embeddings/`). The store goes behind `src/store/`: in-memory with a 1h TTL by default, Convex when `CONVEX_URL` is set.
- Bank: `src/bank/` (`BankSource`: Nessie when `NESSIE_API_KEY` is set, mock otherwise).

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Vitest (rules engine must stay 100% green) |
| `npm run verify` | Typecheck + lint + tests + build. Must pass before every commit. |
| `npm run gen:drivers` | Regenerate synthetic drivers, screenshots and ground truth |
| `npm run eval` / `npm run eval:smoke` | Batch eval (1P Message Batches) / 5-driver live smoke |

## Conventions
- Zod (`src/lib/schemas.ts`) on every model output: retry once, then abstain. Never invent numbers or fill missing months.
- Every rule value in `work_rules.json` carries a `{doc,page,quote}` source.
- No real personal data anywhere. Synthetic only. `src/lib/redact.ts` runs on all logs and traces.
- `DEMO_MODE=true` (or missing API keys) serves recorded Claude outputs from `fixtures/`, so the demo always works.
- Small commits: `feat:` / `fix:` / `chore:`.

## Do NOT
- Commit `.env*`, `uploads/`, or anything that looks like a real SSN, case number or account number.
- Let the portal agent click submit. Only user-initiated code clicks it.
