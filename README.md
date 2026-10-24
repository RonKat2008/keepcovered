# Hackathon template

A starter for Next.js 16, shadcn/ui, Supabase, Claude and Vercel. It comes wired to the `hackathon` Claude Code plugin (`~/.claude/skills/hackathon`). Its orchestrator agent drives the whole event: kickoff → idea → spec → deployed skeleton → build → polish → pitch and submit.

## Start a new hackathon
```bash
~/hackathon-template/scripts/new-hackathon.sh ~/Projects/my-hack
cd ~/Projects/my-hack
# fill in .env.local, then:
npx supabase login && npx supabase link --project-ref <ref>
vercel link
claude          # accept the trust prompt; run /mcp once to sign in to Supabase + Vercel
/hackathon:mode # enter hackathon mode: event + deadline → stage tracking, docs, status line
```

## What's inside
- **`.claude/settings.json`:**
  - starts the `hackathon:orchestrator` agent and the deadline status line automatically
  - sets ECC hooks to the `minimal` profile, with GateGuard off
  - adds a hackathon permission allowlist; prod deploy, push and DB push still ask first
  - enables the project plugins: Supabase, Vercel, Exa, Agent SDK dev
- **`.mcp.json`:** shadcn MCP for component search and install.
- **`CLAUDE.md`:** hackathon-mode rules (no TDD ceremony; done means verify is green and the demo path works), the stack, and commands.
- **`docs/`:** created by `/hackathon:mode` from the plugin's templates: STATUS, IDEA, SPEC (demo-first plan), API (frozen contract), PITCH.
- **`src/lib/demo.ts`:** `DEMO_MODE` canned AI replies, so the live demo survives bad Wi-Fi.
- **`npm run preflight`:** checks env, the Supabase link, the Vercel link and `verify`.

## Commands
`npm run dev` · `npm run verify` · `npm run preflight` · `npm run db:types` · `npx supabase migration new <name>` · `vercel deploy [--prod]`
