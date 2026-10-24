import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const batches = { create: vi.fn(), retrieve: vi.fn(), results: vi.fn() };
const create = vi.fn();
let hasKey = true;
vi.mock("@/claude/client", () => ({
  isLive: () => true,
  getClaude: () => (hasKey ? { client: { messages: { create, batches } }, provider: "anthropic" } : null),
}));

const { prefetchViaBatch, planBatch, customIdFor } = await import("@/claude/batch");
const { buildStructuredParams } = await import("@/claude/call");
const { getFixture } = await import("@/claude/fixtures");
const { triageArgs, triageDocument } = await import("@/claude/tasks/triage");
const { extractArgs } = await import("@/claude/tasks/earnings");

const doc = { id: "d1", name: "a.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) };
const pdf = { id: "d2", name: "b.pdf", mime: "application/pdf", bytes: new Uint8Array([4, 5]) };
const usage = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const triageOut = { kind: "earnings_screenshot", platform: "uber", language: "en", is_readable: true, reason: "ok" };
let dir: string;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "kc-batch-"));
  process.env.CLAUDE_FIXTURES_DIR = dir;
});
afterAll(() => {
  delete process.env.CLAUDE_FIXTURES_DIR;
  delete process.env.CLAUDE_REPLAY_FIXTURES;
  rmSync(dir, { recursive: true, force: true });
});

const message = (text: string, model: string, stop_reason = "end_turn") => ({
  model,
  content: [{ type: "text", text }],
  stop_reason,
  usage,
});

async function* stream(items: unknown[]) {
  for (const i of items) yield i;
}

describe("planBatch", () => {
  it("plans one request per (doc, task), letter as two readers, valid custom_ids", () => {
    const plan = planBatch([doc, pdf, doc], ["triage", "extract_primary", "letter"]);
    expect(plan.map((p) => p.task).sort()).toEqual(
      ["extract_primary", "extract_primary", "letter_primary", "letter_primary", "letter_secondary", "letter_secondary", "triage", "triage"],
    );
    for (const p of plan) expect(p.customId).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(new Set(plan.map((p) => p.customId)).size).toBe(plan.length);
    expect(customIdFor("triage:abc")).toBe("triage-abc");
  });

  it("uses the same params as the live path, including output_config", () => {
    const [p] = planBatch([doc], ["extract_secondary"]);
    const params = buildStructuredParams(p.args);
    expect(params).toEqual(buildStructuredParams(extractArgs(doc, "secondary")));
    expect(params.model).toBe("claude-haiku-5-5");
    expect(params.output_config?.effort).toBe("high");
    expect(params.output_config?.format?.type).toBe("json_schema");
  });
});

describe("prefetchViaBatch", () => {
  it("throws a clear error without a first-party key", async () => {
    hasKey = false;
    await expect(prefetchViaBatch([doc], ["triage"])).rejects.toThrow(/ANTHROPIC_API_KEY/);
    hasKey = true;
  });

  it("submits, polls, saves succeeded results as fixtures at half cost, then replays", async () => {
    const plan = planBatch([doc], ["triage", "extract_primary"]);
    const triageId = plan.find((p) => p.task === "triage")!.customId;
    const extractId = plan.find((p) => p.task === "extract_primary")!.customId;
    batches.create.mockResolvedValueOnce({ id: "msgbatch_1", processing_status: "in_progress" });
    batches.retrieve.mockResolvedValueOnce({
      id: "msgbatch_1",
      processing_status: "ended",
      request_counts: { succeeded: 1, errored: 1, canceled: 0, expired: 0, processing: 0 },
    });
    batches.results.mockResolvedValueOnce(
      stream([
        { custom_id: extractId, result: { type: "errored", error: {} } },
        { custom_id: triageId, result: { type: "succeeded", message: message(JSON.stringify(triageOut), "claude-haiku-5-5") } },
      ]),
    );

    const statuses: string[] = [];
    const r = await prefetchViaBatch([doc], ["triage", "extract_primary"], { pollMs: 0, onStatus: (s) => statuses.push(s) });

    const sent = batches.create.mock.calls[0][0].requests;
    expect(sent).toHaveLength(2);
    expect(sent.find((q: { custom_id: string }) => q.custom_id === triageId).params).toEqual(buildStructuredParams(triageArgs(doc)));
    // haiku: (1000 * 0.10 + 100 * 0.50) / 1e6 = 0.00015, halved
    expect(r).toEqual({ batchId: "msgbatch_1", succeeded: 1, errored: 1, costUsd: 0.000075 });
    expect(statuses.length).toBeGreaterThan(0);

    const key = plan.find((p) => p.task === "triage")!.key;
    expect(getFixture("triage", key)).toMatchObject({ batch_id: "msgbatch_1", cost_usd: 0.000075 });
    expect(getFixture("extract_primary", plan.find((p) => p.task === "extract_primary")!.key)).toBeNull();

    process.env.CLAUDE_REPLAY_FIXTURES = "1";
    const replayed = await triageDocument(doc);
    expect(create).not.toHaveBeenCalled();
    expect(replayed.data).toEqual(triageOut);
    expect(replayed.calls[0]).toMatchObject({ provider: "fixture", cost_usd: 0.000075 });
  });

  it("does not save refused or invalid outputs", async () => {
    const plan = planBatch([pdf], ["triage"]);
    batches.create.mockResolvedValueOnce({ id: "msgbatch_2", processing_status: "ended" });
    batches.results.mockResolvedValueOnce(
      stream([{ custom_id: plan[0].customId, result: { type: "succeeded", message: message("", "claude-haiku-5-5", "refusal") } }]),
    );
    const r = await prefetchViaBatch([pdf], ["triage"], { pollMs: 0 });
    expect(r.succeeded).toBe(0);
    expect(r.errored).toBe(1);
    expect(getFixture("triage", plan[0].key)).toBeNull();
  });
});
