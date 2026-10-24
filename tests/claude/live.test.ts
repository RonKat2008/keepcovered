import Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.fn();
vi.mock("@/claude/client", () => ({
  isLive: () => true,
  getClaude: () => ({ client: { messages: { create } }, provider: "foundry" }),
}));

const { callStructured, describeApiError } = await import("@/claude/call");

const schema = z.object({ n: z.number() });
const usage = { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 50, cache_creation_input_tokens: 0 };
const msg = (text: string, stop_reason = "end_turn") => ({
  content: [{ type: "text", text }],
  stop_reason,
  usage,
});
const args = { route: "triage" as const, system: "s", content: "c", schema, maxTokens: 100 };

beforeEach(() => create.mockReset());

describe("callStructured (live, mocked client)", () => {
  it("sends structured outputs, effort and a cached system prompt", async () => {
    create.mockResolvedValueOnce(msg('{"n": 1}'));
    const r = await callStructured(args);
    expect(r.data).toEqual({ n: 1 });
    const params = create.mock.calls[0][0];
    expect(params.output_config.effort).toBe("low");
    expect(params.output_config.format.type).toBe("json_schema");
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.tool_choice).toBeUndefined();
    expect(r.calls[0]).toMatchObject({ provider: "foundry", cache_read_tokens: 50, simulated: false });
  });

  it("retries once on validation failure, then abstains", async () => {
    create.mockResolvedValue(msg('{"n": "x"}'));
    const r = await callStructured(args);
    expect(create).toHaveBeenCalledTimes(2);
    expect(r.data).toBeNull();
    expect(r.error).toMatch(/validation_failed/);
    expect(r.calls).toHaveLength(2);
  });

  it("recovers on the retry", async () => {
    create.mockResolvedValueOnce(msg("not json")).mockResolvedValueOnce(msg('{"n": 2}'));
    expect((await callStructured(args)).data).toEqual({ n: 2 });
  });

  it("abstains immediately on refusal", async () => {
    create.mockResolvedValueOnce(msg("", "refusal"));
    const r = await callStructured(args);
    expect(create).toHaveBeenCalledTimes(1);
    expect(r.error).toMatch(/refusal/);
  });

  it("treats max_tokens as failure and retries with more room", async () => {
    create.mockResolvedValueOnce(msg('{"n"', "max_tokens")).mockResolvedValueOnce(msg('{"n": 3}'));
    const r = await callStructured(args);
    expect(create.mock.calls[1][0].max_tokens).toBe(200);
    expect(r.data).toEqual({ n: 3 });
  });

  it("maps typed SDK errors", async () => {
    const err = new Anthropic.RateLimitError(429, { type: "error" }, "slow down", new Headers());
    create.mockRejectedValueOnce(err);
    const r = await callStructured(args);
    expect(r.error).toMatch(/^rate_limited/);
    expect(describeApiError(new Error("boom"))).toMatch(/^unexpected_error/);
  });
});
