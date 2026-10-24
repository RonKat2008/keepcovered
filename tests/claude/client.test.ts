import { afterEach, describe, expect, it } from "vitest";
import { getClaude, isLive, resetClaudeClients } from "@/claude/client";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
  resetClaudeClients();
});

function clear() {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_FOUNDRY_API_KEY;
  delete process.env.ANTHROPIC_FOUNDRY_RESOURCE;
  delete process.env.DEMO_MODE;
  resetClaudeClients();
}

describe("getClaude", () => {
  it("returns null without credentials", () => {
    clear();
    expect(getClaude("runtime")).toBeNull();
    expect(isLive()).toBe(false);
  });
  it("prefers Foundry for runtime, first-party for batch/files", () => {
    clear();
    process.env.ANTHROPIC_FOUNDRY_API_KEY = "test";
    process.env.ANTHROPIC_FOUNDRY_RESOURCE = "example-resource";
    process.env.ANTHROPIC_API_KEY = "sk-test";
    expect(getClaude("runtime")?.provider).toBe("foundry");
    expect(getClaude("batch")?.provider).toBe("anthropic");
    expect(getClaude("files")?.provider).toBe("anthropic");
  });
  it("Foundry alone cannot serve batch", () => {
    clear();
    process.env.ANTHROPIC_FOUNDRY_API_KEY = "test";
    process.env.ANTHROPIC_FOUNDRY_RESOURCE = "example-resource";
    expect(getClaude("batch")).toBeNull();
  });
  it("DEMO_MODE turns live off", () => {
    clear();
    process.env.ANTHROPIC_API_KEY = "sk-test";
    process.env.DEMO_MODE = "true";
    expect(isLive()).toBe(false);
  });
});
