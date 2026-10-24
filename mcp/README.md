# KeepCovered MCP server

Deterministic tools for Medi-Cal navigators and Coverage Ambassadors, usable in Claude Desktop or Claude.ai. No LLM calls run inside the server: the pure rules engine in `src/rules/` decides, Claude explains.

Tools: `compute_monthly_status`, `list_screener_questions`, `screen_exemptions`, `search_rules`, `reconcile_income`, `build_deadlines_ics`, `build_packet` (writes a PDF to the OS temp dir and returns the path).
Resources: `rules://work_rules`, `rules://open_questions`. Prompt: `help_driver`.

## Run

```
cd /path/to/keepcovered
npx tsx mcp/server.ts
```

## Claude Desktop config

Add to `claude_desktop_config.json` (use absolute paths; `--tsconfig` makes the `@/` imports resolve regardless of cwd):

```json
{
  "mcpServers": {
    "keepcovered": {
      "command": "npx",
      "args": ["tsx", "--tsconfig", "<abs path>/tsconfig.json", "<abs path>/mcp/server.ts"],
      "cwd": "<abs path>"
    }
  }
}
```

If your Claude Desktop build ignores `cwd`, the `--tsconfig` flag and the server's own `chdir` still make it work. Restart Claude Desktop after editing.

## Guarantees

- Results are never "you comply" or "you are exempt"; screening says "may qualify, tell the county" and the county decides.
- Inputs are validated with the zod schemas in `src/lib/schemas.ts`.
- `search_rules` is BM25 (plus Voyage vectors if `VOYAGE_API_KEY` is set and the index has embeddings).
- Synthetic or consented data only.

## Test

`npx vitest run tests/mcp`
