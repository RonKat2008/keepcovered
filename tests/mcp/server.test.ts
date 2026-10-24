import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readFileSync } from "node:fs";
import { createServer } from "../../mcp/server";
import { fixtureCase } from "../pdf/fixtures";

let client: Client;

beforeAll(async () => {
  delete process.env.VOYAGE_API_KEY;
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createServer().connect(a);
  client = new Client({ name: "test", version: "0" });
  await client.connect(b);
});
afterAll(async () => client.close());

const json = (r: unknown) => JSON.parse((r as { content: Array<{ text: string }> }).content[0].text);

const record = (net: number) => ({
  platform: "uber",
  period_start: "2026-09-01",
  period_end: "2026-09-30",
  gross_earnings: net,
  tips: null,
  platform_fees: null,
  net_payout: net,
  online_hours: 20,
  active_hours: 15,
  trips_or_deliveries: null,
  unreadable_reason: null,
  source_doc_id: "doc1",
  field_confidence: { gross_earnings: "high", net_payout: "high", period_start: "high", period_end: "high", active_hours: "high", online_hours: "high" },
  verification_notes: [],
});

describe("keepcovered MCP server", () => {
  it("lists all tools, resources and the prompt", async () => {
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(
      ["build_deadlines_ics", "build_packet", "compute_monthly_status", "list_screener_questions", "reconcile_income", "screen_exemptions", "search_rules"].sort(),
    );
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toContain("rules://work_rules");
    expect(uris).toContain("rules://open_questions");
    expect((await client.listPrompts()).prompts.map((p) => p.name)).toContain("help_driver");
  });

  it("$579.99 month does NOT meet", async () => {
    const out = json(await client.callTool({ name: "compute_monthly_status", arguments: { months: ["2026-09"], records: [record(579.99)] } }));
    expect(out.months[0].overall).toBe("does_not_meet");
    expect(out.months[0].meets_income_path).toBe(false);
    expect(out.rule_source.doc).toBe("acwdl-25-30");
    expect(out.rule_source.page).toBe(7);
    expect(out.plain_english[0]).toContain("2026-09");
  });

  it("rejects malformed records", async () => {
    const r = await client.callTool({ name: "compute_monthly_status", arguments: { months: ["2026-09"], records: [{ nope: 1 }] } });
    expect(r.isError).toBe(true);
  });

  it("search_rules('580') top hit is acwdl-25-30 page 7", async () => {
    const hits = json(await client.callTool({ name: "search_rules", arguments: { query: "580", k: 3 } }));
    expect(hits[0].source_id).toBe("acwdl-25-30");
    expect(hits[0].page).toBe(7);
    expect(hits[0].url).toContain("dhcs.ca.gov");
  });

  it("screener never says exempt", async () => {
    const qs = json(await client.callTool({ name: "list_screener_questions", arguments: { lang: "es" } }));
    expect(qs.length).toBeGreaterThan(0);
    const out = json(await client.callTool({ name: "screen_exemptions", arguments: { answers: { [qs[0].id]: "yes" } } }));
    expect(out.screens.find((s: { id: string }) => s.id === qs[0].id).outcome).toBe("may_qualify");
    expect(JSON.stringify(out)).not.toMatch(/"exempt"/);
  });

  it("serves resources", async () => {
    const r = await client.readResource({ uri: "rules://open_questions" });
    expect((r.contents[0] as { text: string }).text).toContain("gross_vs_net");
  });

  it("build_packet writes a PDF to the temp dir", async () => {
    const out = json(await client.callTool({ name: "build_packet", arguments: { case_result: fixtureCase("en"), lang: "en" } }));
    expect(out.path).toContain("keepcovered-packet-");
    expect(readFileSync(out.path).subarray(0, 4).toString()).toBe("%PDF");
  });
});
