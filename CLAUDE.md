@AGENTS.md

# Hackathon project. Read `docs/STATUS.md` first.

This repo runs in **hackathon mode**: ship a working, deployed, well-pitched demo before the deadline. The main session runs the `hackathon:orchestrator` agent from the `hackathon` plugin (`~/.claude/skills/hackathon`). Run `/hackathon:mode` once per event to start tracking.

## Overrides to global rules
- No TDD and no coverage targets. Done means `npm run verify` is green, the demo path works in a real browser, and critical demo steps have a smoke test if time allows.
- `docs/SPEC.md` is the plan. Don't create other planning docs. Don't run ECC plan/tdd/orch/multi/santa/gan pipelines.
- Reviews flag only correctness or security issues that could break the demo or leak data.

## Stack
- **Next.js 16** App Router under `src/`, with TypeScript and Tailwind v4. Read `node_modules/next/dist/docs/` before writing Next-specific code.
- **shadcn/ui:** add components with `npx shadcn@latest add <name>`. `cn` comes from `@/lib/utils`.
- **Supabase** via `@supabase/ssr`:
  - browser client: `src/lib/supabase/client.ts`
  - server client: `src/lib/supabase/server.ts`
  - session refresh: `src/proxy.ts` (Next 16 renamed middleware to proxy)
- **Claude:** `src/app/api/ai/route.ts` streams plain text. Invoke the `claude-api` skill before touching Claude code. The default model is `claude-sonnet-5-5`; override it with `ANTHROPIC_MODEL`.
- **Deploy:** Vercel.

## Commands
| Command | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run verify` | Typecheck + lint + build. **Must pass before every commit and deploy.** |
| `npm run preflight` | Readiness check: env, Supabase link, Vercel link, verify |
| `hack status` / `hack gate <id>` / `hack next` | Hackathon stage tracking (plugin CLI) |
| `npx supabase migration new <name>` | New migration. RLS on every table. |
| `npx supabase db push` | Apply migrations to the linked project (ask first) |
| `npm run db:types` | Regenerate `src/lib/supabase/database.types.ts` from the linked project (`db:types:local` uses local Docker) |
| `vercel deploy` / `vercel deploy --prod` | Preview / production deploy |

## Conventions
- Server-only secrets never get the `NEXT_PUBLIC_` prefix. Never create Supabase or Anthropic clients at module top level.
- Every table gets RLS plus explicit policies. API routes validate request bodies and return `{ error }` with the right status code.
- `DEMO_MODE=true` serves seeded data and canned AI replies from `src/lib/demo.ts`. Every AI feature needs a canned path.
- Commits are small (`feat:` / `fix:` / `chore:`), one after each green slice.

## State (lives in files, not in chat)
- `.hackathon/state.json`: stage, deadline, gates and prod URL. Change it **only** through the `hack` CLI (`hack status`, `hack gate <id>`, `hack next`). The status line and the hooks read it.
- `docs/STATUS.md`: narrative (done, in progress, next, blockers, what's stubbed). Update it after every slice.
- `docs/IDEA.md`, then `docs/SPEC.md`, then `docs/API.md` (the frozen contract), then `docs/PITCH.md`.

## Do NOT
- Force-push, run `supabase db reset --linked`, drop remote tables, commit `.env*` files, or deploy with a red `verify`.
- Add libraries without a reason recorded in SPEC.md, or build features that aren't in the demo script.
