// One place that talks to the Messages API: routing, structured outputs, retries,
// typed error handling, cost/latency tracing, fixture replay and recording.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { redact } from "@/lib/redact";
import { getClaude, isLive, type Provider } from "./client";
import {
  fixtureKey,
  getFixture,
  saveFixture,
  shouldRecord,
  simulatedStats,
  type FixtureEntry,
} from "./fixtures";
import { costUsd, ROUTES, type Effort, type Route } from "./models";

export type ModelCallMeta = {
  route: Route;
  model: string;
  effort: Effort;
  /** "fixture" = replayed recording, "simulator" = ground-truth sidecar. Both have simulated: true. */
  provider: Provider | "fixture" | "simulator";
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
  latency_ms: number;
  simulated: boolean;
};

export type Traced<T> = { data: T | null; calls: ModelCallMeta[]; error?: string };

type Content = string | Anthropic.ContentBlockParam[];

export type StructuredArgs<T> = {
  route: Route;
  system: string;
  content: Content;
  schema: z.ZodType<T>;
  maxTokens: number;
  /** Fixture namespace; defaults to the route. */
  task?: string;
  /** Bytes (or string) the fixture key hashes; defaults to the serialized content. */
  fixtureInput?: Uint8Array | string;
  /** Simulator used when not live and no fixture is recorded. Return null to abstain. */
  simulate?: () => unknown;
  /** Rough input-token count to report for a simulated call. */
  simInputTokens?: number;
};

const MAX_ATTEMPTS = 2;
const DEFAULT_SIM_INPUT_TOKENS = 1600;

function metaFrom(
  route: Route,
  provider: ModelCallMeta["provider"],
  usage: Pick<Anthropic.Usage, "input_tokens" | "output_tokens"> & {
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
  },
  latency_ms: number,
  model: string = ROUTES[route].model,
  cost_override?: number,
): ModelCallMeta {
  return {
    route,
    model,
    effort: ROUTES[route].effort,
    provider,
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_tokens: usage.cache_read_input_tokens ?? 0,
    cost_usd: cost_override ?? costUsd(model, usage),
    latency_ms,
    simulated: provider === "fixture" || provider === "simulator",
  };
}

/** Maps SDK errors to short, safe messages. Most specific class first. */
export function describeApiError(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError) return "rate_limited: the model is busy, try again shortly";
  if (err instanceof Anthropic.AuthenticationError) return "auth_failed: check the API key";
  if (err instanceof Anthropic.PermissionDeniedError) return "permission_denied: model not available for this key";
  if (err instanceof Anthropic.NotFoundError) return "not_found: model or deployment not found";
  if (err instanceof Anthropic.BadRequestError) return `bad_request: ${redact(err.message)}`;
  if (err instanceof Anthropic.InternalServerError) return "server_error: the model service failed";
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "timeout: the model took too long";
  if (err instanceof Anthropic.APIConnectionError) return "network_error: could not reach the model";
  if (err instanceof Anthropic.APIError) return `api_error ${err.status ?? ""}: ${redact(err.message)}`.trim();
  return `unexpected_error: ${redact(err instanceof Error ? err.message : String(err))}`;
}

function firstText(content: readonly { type: string }[]): string | null {
  for (const block of content) {
    if (block.type === "text") return (block as Anthropic.TextBlock).text;
  }
  return null;
}

function validate<T>(schema: z.ZodType<T>, raw: unknown): { ok: true; data: T } | { ok: false; error: string } {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: "parse_failed: model output was not JSON" };
    }
  }
  const result = schema.safeParse(value);
  if (result.success) return { ok: true, data: result.data };
  const issues = result.error.issues
    .slice(0, 3)
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  return { ok: false, error: `validation_failed: ${issues}` };
}

function systemBlocks(system: string): Anthropic.TextBlockParam[] {
  return [{ type: "text", text: system, cache_control: { type: "ephemeral" } }];
}

function keyFor(task: string, content: Content, fixtureInput?: Uint8Array | string): string {
  return fixtureKey(task, fixtureInput ?? JSON.stringify(content));
}

/** Fixture namespace and key used for replay; the batch path saves under the same pair. */
export function structuredFixtureRef<T>(args: StructuredArgs<T>): { task: string; key: string } {
  const task = args.task ?? args.route;
  return { task, key: keyFor(task, args.content, args.fixtureInput) };
}

/**
 * The exact Messages API params for a structured call. Shared by the live path and
 * the Message Batches path so they cannot drift.
 */
export function buildStructuredParams<T>(
  args: StructuredArgs<T>,
  maxTokens: number = args.maxTokens,
): Anthropic.MessageCreateParamsNonStreaming {
  const { model, effort } = ROUTES[args.route];
  const { type, schema } = zodOutputFormat(args.schema);
  return {
    model,
    max_tokens: maxTokens,
    system: systemBlocks(args.system),
    messages: [{ role: "user", content: args.content }],
    output_config: { effort, format: { type, schema } },
  };
}

/** When set (eval --batch), recorded fixtures are replayed even with live credentials. */
function replayFirst(): boolean {
  return process.env.CLAUDE_REPLAY_FIXTURES === "1";
}

function replayFixture<T>(args: StructuredArgs<T>, fixture: FixtureEntry): Traced<T> {
  const meta = metaFrom(args.route, "fixture", fixture.usage, fixture.latency_ms, fixture.model, fixture.cost_usd);
  const checked = validate(args.schema, fixture.text);
  return checked.ok ? { data: checked.data, calls: [meta] } : { data: null, calls: [meta], error: checked.error };
}

function replayStructured<T>(args: StructuredArgs<T>, key: string): Traced<T> {
  const task = args.task ?? args.route;
  const fixture = getFixture(task, key);
  if (fixture?.text !== undefined) return replayFixture(args, fixture);
  const simulated = args.simulate?.() ?? null;
  if (simulated === null) {
    return { data: null, calls: [], error: "no_fixture: no recorded output or ground truth for this input" };
  }
  const text = JSON.stringify(simulated);
  const stats = simulatedStats(key, text.length, args.simInputTokens ?? DEFAULT_SIM_INPUT_TOKENS);
  const meta = metaFrom(args.route, "simulator", stats.usage, stats.latency_ms);
  const checked = validate(args.schema, simulated);
  return checked.ok ? { data: checked.data, calls: [meta] } : { data: null, calls: [meta], error: checked.error };
}

function recordIfAsked(task: string, key: string, entry: Omit<FixtureEntry, "recorded_at">): void {
  if (!shouldRecord()) return;
  try {
    saveFixture(task, key, { ...entry, recorded_at: new Date().toISOString() });
  } catch (err) {
    console.warn("[claude] fixture save failed:", redact(String(err)));
  }
}

function usageForFixture(usage: Anthropic.Usage): FixtureEntry["usage"] {
  return {
    input_tokens: usage.input_tokens,
    output_tokens: usage.output_tokens,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * Structured-output call (output_config.format = json_schema). Validates with zod,
 * retries once on parse/validation/max_tokens failure, then abstains (data: null).
 * A refusal abstains immediately.
 */
export async function callStructured<T>(args: StructuredArgs<T>): Promise<Traced<T>> {
  const { task, key } = structuredFixtureRef(args);
  if (!isLive()) return replayStructured(args, key);
  if (replayFirst()) {
    const fixture = getFixture(task, key);
    if (fixture?.text !== undefined) return replayFixture(args, fixture);
  }

  const claude = getClaude("runtime");
  if (!claude) return { data: null, calls: [], error: "no_client" };
  const { model } = ROUTES[args.route];
  const calls: ModelCallMeta[] = [];
  let lastError = "unknown";
  let maxTokens = args.maxTokens;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const started = Date.now();
    let message: Anthropic.Message;
    try {
      message = await claude.client.messages.create(buildStructuredParams(args, maxTokens));
    } catch (err) {
      return { data: null, calls, error: describeApiError(err) };
    }
    const latency = Date.now() - started;
    calls.push(metaFrom(args.route, claude.provider, message.usage, latency, model));

    if (message.stop_reason === "refusal") {
      return { data: null, calls, error: "refusal: the model declined to read this document" };
    }
    if (message.stop_reason === "max_tokens") {
      lastError = "max_tokens: output was cut off";
      maxTokens *= 2;
      continue;
    }
    const text = firstText(message.content);
    if (text === null) {
      lastError = "empty_output: no text block in response";
      continue;
    }
    const checked = validate(args.schema, text);
    if (checked.ok) {
      recordIfAsked(task, key, { model, text, usage: usageForFixture(message.usage), latency_ms: latency });
      return { data: checked.data, calls };
    }
    lastError = checked.error;
  }
  return { data: null, calls, error: lastError };
}

export type CitedArgs = {
  route: Route;
  system: string;
  content: Anthropic.ContentBlockParam[];
  maxTokens: number;
  task?: string;
  fixtureInput?: Uint8Array | string;
};

/**
 * Free-text call that returns raw content blocks (for citations, which cannot be
 * combined with output_config.format). Replays fixtures when not live; returns
 * data null with error "no_fixture" when nothing is recorded (caller simulates).
 */
export async function callCited(args: CitedArgs): Promise<Traced<Anthropic.ContentBlock[]>> {
  const task = args.task ?? args.route;
  const key = keyFor(task, args.content, args.fixtureInput);
  if (!isLive()) {
    const fixture = getFixture(task, key);
    if (!fixture?.content) return { data: null, calls: [], error: "no_fixture" };
    const meta = metaFrom(args.route, "fixture", fixture.usage, fixture.latency_ms, fixture.model);
    return { data: fixture.content as Anthropic.ContentBlock[], calls: [meta] };
  }

  const claude = getClaude("runtime");
  if (!claude) return { data: null, calls: [], error: "no_client" };
  const { model, effort } = ROUTES[args.route];
  const started = Date.now();
  let message: Anthropic.Message;
  try {
    message = await claude.client.messages.create({
      model,
      max_tokens: args.maxTokens,
      system: systemBlocks(args.system),
      messages: [{ role: "user", content: args.content }],
      output_config: { effort },
    });
  } catch (err) {
    return { data: null, calls: [], error: describeApiError(err) };
  }
  const latency = Date.now() - started;
  const calls = [metaFrom(args.route, claude.provider, message.usage, latency, model)];
  if (message.stop_reason === "refusal") return { data: null, calls, error: "refusal" };
  if (message.stop_reason === "max_tokens") return { data: null, calls, error: "max_tokens: output was cut off" };
  recordIfAsked(task, key, { model, content: message.content, usage: usageForFixture(message.usage), latency_ms: latency });
  return { data: message.content, calls };
}

/** Exposed for tasks that build their own simulated meta (e.g. explain templates). */
export function simulatedMeta(route: Route, key: string, outputChars: number, inputTokens: number): ModelCallMeta {
  const stats = simulatedStats(key, outputChars, inputTokens);
  return metaFrom(route, "simulator", stats.usage, stats.latency_ms);
}
