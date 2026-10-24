import { describe, expect, it } from "vitest";
import { costUsd, ROUTES } from "@/claude/models";

describe("costUsd", () => {
  it("prices input and output per MTok", () => {
    expect(costUsd("claude-sonnet-5-5", { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3);
  });
  it("bills cache reads at 0.1x and writes at 1.25x input", () => {
    const c = costUsd("claude-opus-5-5", {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
    });
    expect(c).toBeCloseTo(0.4 + 5);
  });
  it("returns 0 for unknown models", () => {
    expect(costUsd("other", { input_tokens: 10, output_tokens: 10 })).toBe(0);
  });
  it("routes each task to the specified model and effort", () => {
    expect(ROUTES.triage).toEqual({ model: "claude-haiku-5-5", effort: "low" });
    expect(ROUTES.adjudicate).toEqual({ model: "claude-opus-5-5", effort: "high" });
    expect(ROUTES.extract_secondary).toEqual({ model: "claude-haiku-5-5", effort: "high" });
  });
});
