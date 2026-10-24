import { describe, it, expect, vi } from "vitest";
import { MemorySessionStore } from "@/store/memory";
import { getStore } from "@/store";
import type { AgentEvent } from "@/lib/schemas";

const ev = (id: string): AgentEvent => ({ id, at: 1, step: "triage", kind: "start", title: id });

function mk(ttl = 1000) {
  let t = 0;
  const s = new MemorySessionStore(ttl, () => t, false);
  return { s, advance: (ms: number) => (t += ms) };
}

describe("MemorySessionStore", () => {
  it("stores docs, events, results, answers", async () => {
    const { s } = mk();
    const id = await s.create({ lang: "es" });
    expect((await s.get(id))!.meta.lang).toBe("es");
    await s.putDocs(id, [{ id: "d1", name: "a.png", mime: "image/png", bytes: new Uint8Array([1]) }]);
    expect(await s.getDocs(id)).toHaveLength(1);
    await s.appendEvent(id, ev("e1"));
    expect(s.events(id).map((e) => e.id)).toEqual(["e1"]);
    await s.setAnswer(id, "q1", "yes");
    expect(await s.getAnswers(id)).toEqual({ q1: "yes" });
    expect(await s.getResult(id)).toBeNull();
  });
  it("notifies subscribers and unsubscribes", async () => {
    const { s } = mk();
    const id = await s.create({});
    const got: string[] = [];
    const off = s.subscribe(id, (e) => got.push(e.id));
    await s.appendEvent(id, ev("a"));
    off();
    await s.appendEvent(id, ev("b"));
    expect(got).toEqual(["a"]);
  });
  it("expires lazily and via purge", async () => {
    const { s, advance } = mk(1000);
    const a = await s.create({});
    const b = await s.create({});
    advance(1001);
    expect(await s.get(a)).toBeNull();
    expect(s.purgeExpired()).toBe(1);
    expect(await s.get(b)).toBeNull();
    await expect(s.putDocs(a, [])).rejects.toThrow();
  });
  it("waitForAnswer resolves on answer, existing answer, and null on timeout", async () => {
    const { s } = mk();
    const id = await s.create({});
    const p = s.waitForAnswer(id, "q", 5000);
    await s.setAnswer(id, "q", "driving");
    expect(await p).toBe("driving");
    expect(await s.waitForAnswer(id, "q", 10)).toBe("driving");
    vi.useFakeTimers();
    const w = s.waitForAnswer(id, "other", 50);
    vi.advanceTimersByTime(60);
    expect(await w).toBeNull();
    vi.useRealTimers();
  });
  it("delete releases waiters", async () => {
    const { s } = mk();
    const id = await s.create({});
    const p = s.waitForAnswer(id, "q", 5000);
    await s.delete(id);
    expect(await p).toBeNull();
  });
  it("getStore is a globalThis singleton (memory without CONVEX_URL)", () => {
    delete process.env.CONVEX_URL;
    expect(getStore()).toBe(getStore());
  });
});
