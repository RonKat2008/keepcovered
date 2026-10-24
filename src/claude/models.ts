// Model routing and pricing. Prices are USD per million tokens (first-party = Foundry rates).

export const MODELS = {
  haiku: "claude-haiku-5-5",
  sonnet: "claude-sonnet-5-5",
  opus: "claude-opus-5-5",
} as const;
export type ModelId = (typeof MODELS)[keyof typeof MODELS];

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type Route = "triage" | "extract_primary" | "extract_secondary" | "adjudicate" | "letter" | "explain";

/** Effort is always set explicitly: Opus 5.5 and Haiku 5.5 default to medium, Sonnet 5.5 to high. */
export const ROUTES: Readonly<Record<Route, { model: ModelId; effort: Effort }>> = {
  triage: { model: MODELS.haiku, effort: "low" },
  extract_primary: { model: MODELS.sonnet, effort: "medium" },
  extract_secondary: { model: MODELS.haiku, effort: "high" },
  adjudicate: { model: MODELS.opus, effort: "high" },
  letter: { model: MODELS.sonnet, effort: "medium" },
  explain: { model: MODELS.sonnet, effort: "medium" },
};

export const PRICES: Readonly<Record<ModelId, { input: number; output: number }>> = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};

const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;
const PER_MTOK = 1_000_000;

export type UsageLike = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

/** Cost in USD. `input_tokens` is the uncached portion; cache reads bill at 0.1x input, writes at 1.25x. */
export function costUsd(model: string, usage: UsageLike): number {
  const price = PRICES[model as ModelId];
  if (!price) return 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;
  const inputCost =
    usage.input_tokens * price.input +
    cacheRead * price.input * CACHE_READ_MULTIPLIER +
    cacheWrite * price.input * CACHE_WRITE_MULTIPLIER;
  const outputCost = usage.output_tokens * price.output;
  return (inputCost + outputCost) / PER_MTOK;
}
