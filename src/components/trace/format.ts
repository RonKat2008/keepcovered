import type { AgentEvent } from "@/lib/schemas";

/** "claude-sonnet-5-5" → "Sonnet 5.5" */
export function modelName(model?: string): string {
  if (!model) return "";
  const m = model.match(/claude-([a-z]+)-(\d+)(?:-(\d+))?/i);
  if (!m) return model;
  const family = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return m[3] ? `${family} ${m[2]}.${m[3]}` : `${family} ${m[2]}`;
}

export function fmtLatency(ms?: number): string {
  if (ms === undefined) return "";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms)}ms`;
}

export function fmtCost(usd?: number): string {
  if (usd === undefined) return "";
  return usd < 0.01 ? `$${usd.toFixed(4)}` : `$${usd.toFixed(3)}`;
}

export type Decider = "claude" | "code" | "user";

export function decidedBy(e: AgentEvent): Decider {
  if (e.decided_by) return e.decided_by;
  return e.model ? "claude" : "code";
}

export interface TraceTotals {
  cost: number;
  inputTokens: number;
  outputTokens: number;
  cacheTokens: number;
  modelMs: number;
  byWho: Record<Decider, number>;
}

export function traceTotals(events: AgentEvent[]): TraceTotals {
  return events.reduce<TraceTotals>(
    (acc, e) => {
      const who = decidedBy(e);
      return {
        cost: acc.cost + (e.cost_usd ?? 0),
        inputTokens: acc.inputTokens + (e.input_tokens ?? 0),
        outputTokens: acc.outputTokens + (e.output_tokens ?? 0),
        cacheTokens: acc.cacheTokens + (e.cache_read_tokens ?? 0),
        modelMs: acc.modelMs + (e.model ? (e.latency_ms ?? 0) : 0),
        byWho: { ...acc.byWho, [who]: acc.byWho[who] + 1 },
      };
    },
    { cost: 0, inputTokens: 0, outputTokens: 0, cacheTokens: 0, modelMs: 0, byWho: { claude: 0, code: 0, user: 0 } },
  );
}
