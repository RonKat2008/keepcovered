import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import type { AgentEvent, CaseResult } from "../lib/schemas";
import type { MemorySessionStore } from "./memory";
import type { SessionDoc, SessionMeta, SessionStore } from "./types";

const api = anyApi as any;

/**
 * Write-through mirror: the memory store stays the source of truth for the hot path (SSE, waits,
 * document bytes). Sessions, events and results are mirrored to Convex best-effort.
 * Document bytes are NEVER sent to Convex.
 */
export class ConvexMirrorStore implements SessionStore {
  private client: ConvexHttpClient;
  private seq = new Map<string, number>();

  constructor(private mem: MemorySessionStore, url: string) {
    this.client = new ConvexHttpClient(url);
  }

  private mirror(fn: () => Promise<unknown>): void {
    fn().catch((e) => console.warn("convex mirror failed:", (e as Error).message));
  }

  async create(meta: SessionMeta): Promise<string> {
    const id = await this.mem.create(meta);
    this.mirror(() => this.client.mutation(api.sessions.create, { sessionId: id, lang: meta.lang }));
    return id;
  }
  get(id: string) { return this.mem.get(id); }
  putDocs(id: string, docs: SessionDoc[]) { return this.mem.putDocs(id, docs); }
  getDocs(id: string) { return this.mem.getDocs(id); }
  async appendEvent(id: string, ev: AgentEvent): Promise<void> {
    await this.mem.appendEvent(id, ev);
    const seq = (this.seq.get(id) ?? 0) + 1;
    this.seq.set(id, seq);
    this.mirror(() => this.client.mutation(api.sessions.appendEvent, { sessionId: id, seq, event: ev }));
  }
  events(id: string) { return this.mem.events(id); }
  subscribe(id: string, cb: (ev: AgentEvent) => void) { return this.mem.subscribe(id, cb); }
  async setResult(id: string, r: CaseResult): Promise<void> {
    await this.mem.setResult(id, r);
    this.mirror(() => this.client.mutation(api.sessions.setResult, { sessionId: id, result: r }));
  }
  getResult(id: string) { return this.mem.getResult(id); }
  setAnswer(id: string, q: string, value: string) { return this.mem.setAnswer(id, q, value); }
  getAnswers(id: string) { return this.mem.getAnswers(id); }
  waitForAnswer(id: string, q: string, ms: number) { return this.mem.waitForAnswer(id, q, ms); }
  purgeExpired() { return this.mem.purgeExpired(); }
  async delete(id: string): Promise<void> {
    await this.mem.delete(id);
    this.seq.delete(id);
    this.mirror(() => this.client.mutation(api.sessions.remove, { sessionId: id }));
  }
}
