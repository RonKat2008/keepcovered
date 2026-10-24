import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import type { AgentEvent, CaseResult } from "../lib/schemas";
import { SESSION_TTL_MS, type SessionDoc, type SessionMeta, type SessionStore } from "./types";

type Session = {
  id: string;
  meta: SessionMeta;
  createdAt: number;
  expiresAt: number;
  docs: SessionDoc[];
  events: AgentEvent[];
  result: CaseResult | null;
  answers: Record<string, string>;
};

const SWEEP_MS = 60_000;

export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, Session>();
  private bus = new EventEmitter();
  private sweeper: ReturnType<typeof setInterval> | null = null;

  constructor(private ttlMs = SESSION_TTL_MS, private now: () => number = Date.now, sweep = true) {
    this.bus.setMaxListeners(0);
    if (sweep) {
      this.sweeper = setInterval(() => this.purgeExpired(), SWEEP_MS);
      this.sweeper.unref?.();
    }
  }

  /** Lazy expiry: an expired session is removed on access. */
  private live(id: string): Session | null {
    const s = this.sessions.get(id);
    if (!s) return null;
    if (s.expiresAt <= this.now()) {
      this.drop(id);
      return null;
    }
    return s;
  }

  private drop(id: string): void {
    this.sessions.delete(id);
    this.bus.emit(`gone:${id}`);
  }

  async create(meta: SessionMeta): Promise<string> {
    const id = randomUUID();
    const t = this.now();
    this.sessions.set(id, {
      id, meta, createdAt: t, expiresAt: t + this.ttlMs, docs: [], events: [], result: null, answers: {},
    });
    return id;
  }

  async get(id: string) {
    const s = this.live(id);
    return s ? { id: s.id, meta: s.meta, createdAt: s.createdAt, expiresAt: s.expiresAt } : null;
  }

  async putDocs(id: string, docs: SessionDoc[]): Promise<void> {
    const s = this.require(id);
    s.docs = [...s.docs.filter((d) => !docs.some((n) => n.id === d.id)), ...docs];
  }

  async getDocs(id: string): Promise<SessionDoc[]> {
    return this.live(id)?.docs ?? [];
  }

  async appendEvent(id: string, ev: AgentEvent): Promise<void> {
    const s = this.require(id);
    s.events = [...s.events, ev];
    this.bus.emit(`ev:${id}`, ev);
  }

  events(id: string): AgentEvent[] {
    return this.live(id)?.events ?? [];
  }

  subscribe(id: string, cb: (ev: AgentEvent) => void): () => void {
    const key = `ev:${id}`;
    this.bus.on(key, cb);
    return () => this.bus.off(key, cb);
  }

  async setResult(id: string, r: CaseResult): Promise<void> {
    this.require(id).result = r;
  }

  async getResult(id: string): Promise<CaseResult | null> {
    return this.live(id)?.result ?? null;
  }

  async setAnswer(id: string, questionId: string, value: string): Promise<void> {
    const s = this.require(id);
    s.answers = { ...s.answers, [questionId]: value };
    this.bus.emit(`ans:${id}`, questionId, value);
  }

  async getAnswers(id: string): Promise<Record<string, string>> {
    return { ...(this.live(id)?.answers ?? {}) };
  }

  waitForAnswer(id: string, questionId: string, timeoutMs: number): Promise<string | null> {
    const existing = this.live(id)?.answers[questionId];
    if (existing !== undefined) return Promise.resolve(existing);
    if (!this.live(id)) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (v: string | null) => {
        clearTimeout(timer);
        this.bus.off(`ans:${id}`, onAns);
        this.bus.off(`gone:${id}`, onGone);
        resolve(v);
      };
      const onAns = (q: string, v: string) => q === questionId && done(v);
      const onGone = () => done(null);
      const timer = setTimeout(() => done(null), timeoutMs);
      timer.unref?.();
      this.bus.on(`ans:${id}`, onAns);
      this.bus.on(`gone:${id}`, onGone);
    });
  }

  purgeExpired(): number {
    const t = this.now();
    let n = 0;
    for (const [id, s] of this.sessions) {
      if (s.expiresAt <= t) {
        this.drop(id);
        n++;
      }
    }
    return n;
  }

  async delete(id: string): Promise<void> {
    if (this.sessions.has(id)) this.drop(id);
  }

  dispose(): void {
    if (this.sweeper) clearInterval(this.sweeper);
  }

  private require(id: string): Session {
    const s = this.live(id);
    if (!s) throw new Error(`session not found or expired: ${id}`);
    return s;
  }
}
