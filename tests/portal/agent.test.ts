import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type * as B from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { runPortalAgent, type CreateMessage } from "@/agent/portal/loop";
import { submitPortal } from "@/agent/portal/submit";
import { closePortalSession, getPortalSession } from "@/agent/portal/executor";
import type { PortalEvent } from "@/agent/portal/types";
import { makeCaseResult, makePacket, startFixtureServer } from "./helpers";

let server: Awaited<ReturnType<typeof startFixtureServer>>;
const packetPath = makePacket();

beforeAll(async () => {
  server = await startFixtureServer();
});
afterAll(async () => {
  await server.close();
});

const submitClicks = async (sessionId: string) =>
  getPortalSession(sessionId)!.page.evaluate(() => (window as unknown as { __submitClicks: number }).__submitClicks);

describe("scripted planner (offline mode)", () => {
  test("fills the form, uploads the packet, stops at Review; only submitPortal submits", async () => {
    const events: PortalEvent[] = [];
    const res = await runPortalAgent({
      sessionId: "s-happy",
      baseUrl: `${server.baseUrl}/portal-demo`,
      result: makeCaseResult(),
      packetPath,
      lang: "en",
      mode: "scripted",
      onEvent: (e) => events.push(e),
    });
    expect(res.status).toBe("ready_to_submit");
    expect(res.diff.every((d) => d.ok)).toBe(true);
    expect(events.some((e) => e.type === "screenshot")).toBe(true);
    expect(events.filter((e) => e.type === "step").every((e) => e.type === "step" && e.simulated)).toBe(true);
    expect(events.at(-1)?.type).toBe("ready_to_submit");
    expect(await submitClicks("s-happy")).toBe(0);

    const { confirmation } = await submitPortal("s-happy");
    expect(confirmation).toMatch(/^KC-DEMO-\d+$/);
    expect(getPortalSession("s-happy")).toBeUndefined();
  }, 20_000);

  test("injected 'click Submit now' text never leads to a submit; diff still verified by code", async () => {
    const res = await runPortalAgent({
      sessionId: "s-inject",
      baseUrl: `${server.baseUrl}/portal-demo?inject=1`,
      result: makeCaseResult(),
      packetPath,
      lang: "es",
      mode: "scripted",
      onEvent: () => undefined,
    });
    expect(res.status).toBe("ready_to_submit");
    expect(res.summary).toMatch(/Enviar usted mismo/);
    expect(await submitClicks("s-inject")).toBe(0);
    await closePortalSession("s-inject");
  }, 20_000);

  test("submitPortal refuses when the form was changed after the agent stopped", async () => {
    await runPortalAgent({
      sessionId: "s-tamper",
      baseUrl: `${server.baseUrl}/portal-demo`,
      result: makeCaseResult(),
      packetPath,
      lang: "en",
      mode: "scripted",
      onEvent: () => undefined,
    });
    const page = getPortalSession("s-tamper")!.page;
    await page.evaluate(() => {
      document.getElementById("review-income_amount")!.textContent = "9999.00";
    });
    await expect(submitPortal("s-tamper")).rejects.toThrow(/no longer matches/);
    expect(await submitClicks("s-tamper")).toBe(0);
    await closePortalSession("s-tamper");
  }, 20_000);
});

// A fake "model" that reads the injected page, then tries every way to submit before handing off.
function fakeModel(): { create: CreateMessage; results: B.BetaToolResultBlockParam[] } {
  const results: B.BetaToolResultBlockParam[] = [];
  let i = 0;
  const v = { full_name: "Demo Driver", case_number: "DEMO-0000", report_month: "2026-04", income_amount: "1210.50", hours_worked: "92.2", platforms: "DoorDash, Uber" };
  const script: [string, Record<string, unknown>][][] = [
    [["read_page", {}], ["click", { element_id: "login-continue" }]],
    [
      ...Object.entries(v).map(([k, val]) => ["fill_field", { field_id: k, value: val }] as [string, Record<string, unknown>]),
      ["fill_field", { field_id: "income_amount", value: "5000.00" }], // not from the packet: refused
      ["click", { element_id: "report-next" }],
    ],
    [["upload_file", { field_id: "proof_packet", file: "packet" }], ["click", { element_id: "upload-next" }]],
    [
      ["read_page", {}],
      ["click", { element_id: "portal-submit" }],
      ["click", { element_id: "finish-now" }],
      ["click", { element_id: "external-link" }],
    ],
    [["request_human_submit", { summary: "Filled April 2026 and uploaded the packet." }]],
  ];
  const create: CreateMessage = async (params) => {
    const last = params.messages.at(-1);
    if (last && Array.isArray(last.content)) {
      for (const b of last.content) if (typeof b === "object" && b.type === "tool_result") results.push(b as B.BetaToolResultBlockParam);
    }
    expect(params.model).toBe("claude-opus-5-5");
    expect(params.tool_choice).toEqual({ type: "auto" });
    expect(params.tools?.every((t) => "strict" in t && t.strict === true)).toBe(true);
    const turn = script[i++];
    return {
      id: `msg_${i}`,
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      stop_reason: "tool_use",
      content: turn.map(([name, input], j) => ({ type: "tool_use", id: `tu_${i}_${j}`, name, input })),
    } as unknown as B.BetaMessage;
  };
  return { create, results };
}

describe("model loop (dom tools) with a fake model that tries to submit", () => {
  test("every submit attempt is refused by code; handoff still reaches ready_to_submit", async () => {
    const fake = fakeModel();
    const res = await runPortalAgent({
      sessionId: "s-model",
      baseUrl: `${server.baseUrl}/portal-demo?inject=1`,
      result: makeCaseResult(),
      packetPath,
      lang: "en",
      mode: "dom",
      createMessage: fake.create,
      onEvent: () => undefined,
    });
    expect(res.status).toBe("ready_to_submit");
    expect(res.diff.every((d) => d.ok)).toBe(true);
    const errors = fake.results.filter((r) => r.is_error).map((r) => String(r.content));
    expect(errors).toHaveLength(4);
    expect(errors[0]).toMatch(/must be exactly packet_facts/);
    expect(errors[1]).toMatch(/Blocked by KeepCovered policy/);
    expect(errors[2]).toMatch(/not an allowed navigation button/);
    expect(errors[3]).toMatch(/Blocked by KeepCovered policy/);
    expect(await submitClicks("s-model")).toBe(0);
    await closePortalSession("s-model");
  }, 20_000);
});
