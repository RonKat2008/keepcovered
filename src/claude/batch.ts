// Message Batches prefetch for evals (first-party only; Foundry has no Batches API).
// Submits every structured read up front at 50% cost and saves each success into the
// fixture store under the same task/key callStructured replays, so the normal eval loop
// then runs from fixtures. Adjudication depends on reader disagreement and stays live.
import type Anthropic from "@anthropic-ai/sdk";
import { buildStructuredParams, structuredFixtureRef, type StructuredArgs } from "./call";
import { getClaude } from "./client";
import { saveFixture } from "./fixtures";
import { costUsd } from "./models";
import { extractArgs } from "./tasks/earnings";
import { letterArgs } from "./tasks/letter";
import { triageArgs } from "./tasks/triage";
import type { InputDoc } from "./types";

export type BatchTask = "triage" | "extract_primary" | "extract_secondary" | "letter";
export type PrefetchOptions = { pollMs?: number; onStatus?: (s: string) => void };
export type PrefetchResult = { batchId: string; succeeded: number; errored: number; costUsd: number };

export const BATCH_DISCOUNT = 0.5;
const DEFAULT_POLL_MS = 30_000;
/** API limit for custom_id: ^[a-zA-Z0-9_-]{1,64}$ (no colons, max 64 chars). */
const CUSTOM_ID_MAX = 64;

type Planned = { customId: string; task: string; key: string; args: StructuredArgs<unknown> };

function argsFor(doc: InputDoc, task: BatchTask): StructuredArgs<unknown>[] {
  switch (task) {
    case "triage":
      return [triageArgs(doc)];
    case "extract_primary":
      return [extractArgs(doc, "primary")];
    case "extract_secondary":
      return [extractArgs(doc, "secondary")];
    case "letter":
      return [letterArgs(doc, "primary"), letterArgs(doc, "secondary")];
  }
}

/** Fixture key is `${task}:${sha256}`; custom_id is the same with "-" and the hash trimmed to fit 64 chars. */
export function customIdFor(key: string): string {
  const [task, hash] = key.split(":");
  return `${task}-${hash}`.slice(0, CUSTOM_ID_MAX);
}

/** One planned request per (doc, task), deduped by fixture key. Unsupported file types are skipped. */
export function planBatch(docs: readonly InputDoc[], tasks: readonly BatchTask[]): Planned[] {
  const planned = new Map<string, Planned>();
  for (const doc of docs) {
    for (const task of tasks) {
      let list: StructuredArgs<unknown>[];
      try {
        list = argsFor(doc, task);
      } catch {
        continue;
      }
      for (const args of list) {
        const ref = structuredFixtureRef(args);
        if (!planned.has(ref.key)) planned.set(ref.key, { customId: customIdFor(ref.key), ...ref, args });
      }
    }
  }
  return [...planned.values()];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function textOf(message: Anthropic.Message): string | null {
  const block = message.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  return block?.text ?? null;
}

/** Returns the output text when the message is a complete, schema-valid structured output. */
function validOutput(message: Anthropic.Message, args: StructuredArgs<unknown>): string | null {
  if (message.stop_reason !== "end_turn") return null;
  const text = textOf(message);
  if (text === null) return null;
  try {
    return args.schema.safeParse(JSON.parse(text)).success ? text : null;
  } catch {
    return null;
  }
}

export async function prefetchViaBatch(
  docs: InputDoc[],
  tasks: BatchTask[],
  opts: PrefetchOptions = {},
): Promise<PrefetchResult> {
  const claude = getClaude("batch");
  if (!claude) {
    throw new Error("Message Batches need the first-party API: set ANTHROPIC_API_KEY (Foundry has no Batches API).");
  }
  const { client } = claude;
  const status = opts.onStatus ?? (() => {});
  const plan = planBatch(docs, tasks);
  if (plan.length === 0) return { batchId: "", succeeded: 0, errored: 0, costUsd: 0 };

  const byCustomId = new Map(plan.map((p) => [p.customId, p]));
  const batch = await client.messages.batches.create({
    requests: plan.map((p) => ({ custom_id: p.customId, params: buildStructuredParams(p.args) })),
  });
  status(`batch ${batch.id} submitted with ${plan.length} requests`);

  let current = batch;
  while (current.processing_status !== "ended") {
    await sleep(opts.pollMs ?? DEFAULT_POLL_MS);
    current = await client.messages.batches.retrieve(batch.id);
    const c = current.request_counts;
    status(`batch ${batch.id}: ${current.processing_status} (done ${c.succeeded + c.errored + c.canceled + c.expired}/${plan.length})`);
  }

  let succeeded = 0;
  let errored = 0;
  let totalCost = 0;
  for await (const item of await client.messages.batches.results(batch.id)) {
    const planned = byCustomId.get(item.custom_id);
    if (!planned) continue;
    if (item.result.type !== "succeeded") {
      errored++;
      continue;
    }
    const message = item.result.message;
    const cost = costUsd(message.model, message.usage) * BATCH_DISCOUNT;
    totalCost += cost;
    const text = validOutput(message, planned.args);
    if (text === null) {
      // Refusal, truncation or invalid output: leave no fixture so the eval loop retries live.
      errored++;
      continue;
    }
    saveFixture(planned.task, planned.key, {
      model: message.model,
      text,
      usage: {
        input_tokens: message.usage.input_tokens,
        output_tokens: message.usage.output_tokens,
        cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
        cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
      },
      latency_ms: 0,
      cost_usd: cost,
      batch_id: batch.id,
      recorded_at: new Date().toISOString(),
    });
    succeeded++;
  }
  status(`batch ${batch.id}: ${succeeded} saved, ${errored} failed, $${totalCost.toFixed(4)}`);
  return { batchId: batch.id, succeeded, errored, costUsd: totalCost };
}
