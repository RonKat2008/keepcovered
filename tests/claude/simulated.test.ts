import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { resetClaudeClients } from "@/claude/client";
import { fixtureKey, saveFixture } from "@/claude/fixtures";
import { explainCase } from "@/claude/tasks/explain";
import { extractCountyLetter } from "@/claude/tasks/letter";
import { triageDocument } from "@/claude/tasks/triage";
import { verifyEarnings } from "@/claude/tasks/earnings";
import type { InputDoc, RuleChunk } from "@/claude/types";

const truth = {
  kind: "earnings_screenshot",
  extraction: {
    platform: "doordash",
    period_start: "2026-09-01",
    period_end: "2026-09-07",
    gross_earnings: 320.5,
    tips: 60,
    platform_fees: 20.5,
    net_payout: 300,
    online_hours: 24,
    active_hours: 18,
    trips_or_deliveries: 35,
    unreadable_reason: null,
  },
};

const letterTruth = {
  kind: "county_letter",
  letter: {
    letter_type: "work_rule_notice",
    notice_date: "2026-10-01",
    response_deadline: "2026-11-10",
    requested_items: ["Proof of work hours"],
    months_requested: ["2026-09"],
    language: "es",
    county_name: "Alameda",
  },
};

let dir: string;
let earningsDoc: InputDoc;
let letterDoc: InputDoc;
const saved = { ...process.env };

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "kc-claude-"));
  const truthPath = path.join(dir, "shot.png.truth.json");
  writeFileSync(truthPath, JSON.stringify(truth));
  const letterTruthPath = path.join(dir, "letter.png.truth.json");
  writeFileSync(letterTruthPath, JSON.stringify(letterTruth));
  earningsDoc = { id: "doc-1", name: "shot.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3, 4]), truthPath };
  letterDoc = { id: "doc-2", name: "letter.png", mime: "image/png", bytes: new Uint8Array([9, 9, 9]), truthPath: letterTruthPath };
});

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_FOUNDRY_API_KEY;
  delete process.env.ANTHROPIC_FOUNDRY_RESOURCE;
  delete process.env.RECORD_FIXTURES;
  process.env.CLAUDE_FIXTURES_DIR = path.join(dir, "fixtures");
  resetClaudeClients();
});

afterAll(() => {
  process.env = saved;
  rmSync(dir, { recursive: true, force: true });
});

describe("simulated mode", () => {
  it("triage reads the sidecar", async () => {
    const r = await triageDocument(earningsDoc);
    expect(r.data).toMatchObject({ kind: "earnings_screenshot", platform: "doordash", is_readable: true });
    expect(r.calls[0]).toMatchObject({ route: "triage", model: "claude-haiku-5-5", simulated: true, provider: "simulator" });
  });

  it("verifyEarnings: readers agree, high confidence, two simulated calls", async () => {
    const r = await verifyEarnings(earningsDoc);
    expect(r.error).toBeUndefined();
    expect(r.data?.net_payout).toBe(300);
    expect(new Set(Object.values(r.data!.field_confidence))).toEqual(new Set(["high"]));
    expect(r.calls.map((c) => c.route).sort()).toEqual(["extract_primary", "extract_secondary"]);
    expect(r.calls.every((c) => c.simulated && c.cost_usd > 0 && c.latency_ms > 0)).toBe(true);
  });

  it("a recorded fixture overrides the simulator and triggers adjudication", async () => {
    const wrong = { ...truth.extraction, net_payout: 310 };
    saveFixture("extract_primary", fixtureKey("extract_primary", earningsDoc.bytes), {
      model: "claude-sonnet-5-5",
      text: JSON.stringify(wrong),
      usage: { input_tokens: 1500, output_tokens: 120, cache_read_input_tokens: 900, cache_creation_input_tokens: 0 },
      latency_ms: 1234,
      recorded_at: "2026-10-23T00:00:00Z",
    });
    const r = await verifyEarnings(earningsDoc);
    expect(r.calls.map((c) => c.route)).toContain("adjudicate");
    expect(r.calls.find((c) => c.route === "extract_primary")).toMatchObject({ provider: "fixture", cache_read_tokens: 900 });
    expect(r.data?.net_payout).toBe(300);
    expect(r.data?.field_confidence.net_payout).toBe("medium");
  });

  it("abstains when there is no fixture and no truth", async () => {
    const r = await verifyEarnings({ id: "x", name: "x.png", mime: "image/png", bytes: new Uint8Array([7]) });
    expect(r.data?.unreadable_reason).not.toBeNull();
    expect(r.error).toMatch(/no_fixture/);
  });

  it("county letter: deadline agreed by both readers is high", async () => {
    const r = await extractCountyLetter(letterDoc);
    expect(r.data).toMatchObject({ response_deadline: "2026-11-10", source_doc_id: "doc-2", county_name: "Alameda" });
    expect(r.data?.field_confidence.response_deadline).toBe("high");
    expect(r.data?.field_confidence.county_name).toBe("medium");
  });

  it("explain: deterministic EN/ES template citing real chunks", async () => {
    const chunks: RuleChunk[] = [
      { id: "a", source_id: "acwdl-25-30", title: "ACWDL 25-30", page: 7, text: "have a monthly income of at least $580, or" },
      { id: "b", source_id: "acwdl-25-30", title: "ACWDL 25-30", page: 8, text: "the month before (look-back month)" },
    ];
    const facts = { letter: null, deadlines: [], needs_navigator: true };
    const es = await explainCase({ facts, chunks, lang: "es" });
    const en = await explainCase({ facts, chunks, lang: "en" });
    expect(es.data!.some((s) => s.text.includes("$580") && s.citations[0]?.page === 7)).toBe(true);
    expect(es.data!.some((s) => s.text.includes("navegador"))).toBe(true);
    expect(en.data!.every((s) => !/you (comply|are exempt)/i.test(s.text))).toBe(true);
    expect(en.data!.some((s) => /80 hours/.test(s.text))).toBe(false); // no chunk supports it
    expect(en.calls[0]).toMatchObject({ route: "explain", simulated: true });
  });

  it("DEMO_MODE forces simulation even with a key", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
    process.env.DEMO_MODE = "true";
    resetClaudeClients();
    const r = await triageDocument(earningsDoc);
    expect(r.calls[0].simulated).toBe(true);
    delete process.env.DEMO_MODE;
  });
});
