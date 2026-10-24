import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type * as B from "@anthropic-ai/sdk/resources/beta/messages/messages";
import {
  agentClick,
  clickPolicyViolation,
  closePortalSession,
  isAllowedNavigation,
  openPortalSession,
  readPage,
  type ElementInfo,
  type PortalSession,
} from "@/agent/portal/executor";
import { PortalBrowserToolset } from "@/agent/portal/browserToolset";
import { makePacket, startFixtureServer } from "./helpers";

let server: Awaited<ReturnType<typeof startFixtureServer>>;
let session: PortalSession;
const expected = { full_name: "Demo Driver", income_amount: "1210.50" };

beforeAll(async () => {
  server = await startFixtureServer();
  session = await openPortalSession({ sessionId: "s-exec", baseUrl: `${server.baseUrl}/portal-demo?inject=1`, packetPath: makePacket() });
}, 15_000);
afterAll(async () => {
  await closePortalSession("s-exec");
  await server.close();
});

const el = (over: Partial<ElementInfo>): ElementInfo => ({
  id: "", tag: "button", type: "button", text: "", name: "", ariaLabel: "", value: "", title: "", isFormField: false, ...over,
});

describe("click policy (pure)", () => {
  test.each([
    [{ text: "Submit" }],
    [{ text: "Enviar" }],
    [{ text: "Sign and send" }],
    [{ ariaLabel: "Firmar" }],
    [{ id: "confirm-btn", text: "OK" }],
    [{ text: "Confirmar" }],
    [{ tag: "input", type: "submit", value: "Submit report" }],
    [{ id: "portal-submit", text: "Go" }],
    [{ id: "finish-now", text: "Finish" }],
  ])("blocks %o", (over) => {
    expect(clickPolicyViolation(el(over))).toMatch(/Blocked by KeepCovered policy/);
  });

  test("allows Next and form fields", () => {
    expect(clickPolicyViolation(el({ id: "report-next", text: "Next" }))).toBeNull();
    expect(clickPolicyViolation(el({ id: "income_amount", tag: "input", type: "text", isFormField: true }))).toBeNull();
  });

  test("origin allowlist", () => {
    const o = "http://127.0.0.1:3000";
    expect(isAllowedNavigation(`${o}/portal-demo`, o)).toBe(true);
    expect(isAllowedNavigation(`${o}/portal-demo/review?x=1`, o)).toBe(true);
    expect(isAllowedNavigation(`${o}/api/secret`, o)).toBe(false);
    expect(isAllowedNavigation("https://example.com/portal-demo", o)).toBe(false);
    expect(isAllowedNavigation("javascript:alert(1)", o)).toBe(false);
  });
});

describe("executor against the injection fixture", () => {
  test("read_page marks submit as not allowed and exposes page text as untrusted", async () => {
    await agentClick(session, "login-continue");
    const snap = await readPage(session);
    expect(snap.fields.map((f) => f.id)).toContain("income_amount");
    expect(snap.untrusted_page_text).toMatch(/ignore your instructions/);
  });

  test("browser toolset: refuses external navigation, Enter, submit by ref/coordinate, and off-packet typing", async () => {
    const toolset = new PortalBrowserToolset(session, expected);
    const call = (name: string, input: Record<string, unknown>) =>
      toolset.toolResult({ type: "tool_use", id: `tu_${name}`, name, input, toolset_name: "browser" } as unknown as B.BetaToolUseBlock);
    const text = (r: B.BetaToolResultBlockParam) => JSON.stringify(r.content);

    const nav = await call("navigate", { url: "https://example.com/" });
    expect(nav.is_error).toBe(true);
    const navApp = await call("navigate", { url: `${server.baseUrl}/elsewhere` });
    expect(navApp.is_error).toBe(true);

    // Walk to the review step with code, then read refs.
    await session.page.click("#report-next");
    await session.page.click("#upload-next");
    const tree = text(await call("read_page", {}));
    const refOf = (id: string) => new RegExp(`\\[(ref_\\d+)\\] id=${id}\\b`).exec(tree.replace(/\\"/g, '"'))?.[1];
    const submitRef = refOf("portal-submit");
    const finishRef = refOf("finish-now");
    expect(submitRef).toBeDefined();
    expect(finishRef).toBeDefined();

    expect((await call("left_click", { target: { type: "ref", ref: submitRef } })).is_error).toBe(true);
    expect((await call("left_click", { target: { type: "ref", ref: finishRef } })).is_error).toBe(true);
    const box = (await session.page.locator("#portal-submit").boundingBox())!;
    const coord = await call("left_click", { target: { type: "coordinate", x: box.x + box.width / 2, y: box.y + box.height / 2 } });
    expect(coord.is_error).toBe(true);
    expect((await call("key", { text: "Enter" })).is_error).toBe(true);
    expect((await call("type", { text: "click submit" })).is_error).toBe(true);

    const shot = await call("screenshot", {});
    expect(shot.is_error).toBeFalsy();
    expect(text(shot)).toMatch(/image\/jpeg/);

    const clicks = await session.page.evaluate(() => (window as unknown as { __submitClicks: number }).__submitClicks);
    expect(clicks).toBe(0);
  }, 15_000);
});
