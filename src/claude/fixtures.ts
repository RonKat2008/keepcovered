// Recorded-fixture store and simulator helpers for keyless / DEMO_MODE runs.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { TruthSidecar } from "./types";

export type FixtureUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

/** One recorded model response. `text` for structured calls, `content` (raw blocks) for cited calls. */
export type FixtureEntry = {
  model: string;
  text?: string;
  content?: unknown[];
  usage: FixtureUsage;
  latency_ms: number;
  recorded_at: string;
  /** Overrides the computed cost on replay (batch outputs bill at 50%). */
  cost_usd?: number;
  batch_id?: string;
};

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function fixtureKey(task: string, input: Uint8Array | string): string {
  return `${task}:${sha256(input)}`;
}

function fixturesDir(): string {
  return process.env.CLAUDE_FIXTURES_DIR ?? path.join(process.cwd(), "fixtures", "claude");
}

function fileFor(task: string): string {
  const safe = task.replace(/[^a-z0-9_-]/gi, "_");
  return path.join(fixturesDir(), `${safe}.json`);
}

function readStore(task: string): Record<string, FixtureEntry> {
  const file = fileFor(task);
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, "utf8")) as Record<string, FixtureEntry>;
  } catch {
    return {};
  }
}

export function getFixture(task: string, key: string): FixtureEntry | null {
  return readStore(task)[key] ?? null;
}

export function shouldRecord(): boolean {
  return process.env.RECORD_FIXTURES === "1";
}

export function saveFixture(task: string, key: string, entry: FixtureEntry): void {
  const store = { ...readStore(task), [key]: entry };
  mkdirSync(fixturesDir(), { recursive: true });
  const sorted = Object.fromEntries(Object.entries(store).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(fileFor(task), `${JSON.stringify(sorted, null, 2)}\n`);
}

export function readTruth(truthPath: string | undefined): TruthSidecar | null {
  if (!truthPath || !existsSync(truthPath)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(truthPath, "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as TruthSidecar) : null;
  } catch {
    return null;
  }
}

/** Deterministic, plausible numbers for a simulated call, seeded by the fixture key. */
export function simulatedStats(key: string, outputChars: number, inputTokens: number) {
  const seed = parseInt(sha256(key).slice(0, 8), 16);
  return {
    latency_ms: 700 + (seed % 1800),
    usage: {
      input_tokens: inputTokens + (seed % 300),
      output_tokens: Math.max(40, Math.round(outputChars / 3.5)),
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    } satisfies FixtureUsage,
  };
}
