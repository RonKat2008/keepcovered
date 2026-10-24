import type { AgentEvent, CaseResult } from "../lib/schemas";

export const SESSION_TTL_MS = 60 * 60 * 1000;

export type SessionMeta = { lang?: "en" | "es"; [k: string]: unknown };
export type SessionDoc = { id: string; name: string; mime: string; bytes: Uint8Array };

export interface SessionStore {
  create(meta: SessionMeta): Promise<string>;
  get(id: string): Promise<{ id: string; meta: SessionMeta; createdAt: number; expiresAt: number } | null>;
  putDocs(id: string, docs: SessionDoc[]): Promise<void>;
  getDocs(id: string): Promise<SessionDoc[]>;
  appendEvent(id: string, ev: AgentEvent): Promise<void>;
  events(id: string): AgentEvent[];
  subscribe(id: string, cb: (ev: AgentEvent) => void): () => void;
  setResult(id: string, r: CaseResult): Promise<void>;
  getResult(id: string): Promise<CaseResult | null>;
  setAnswer(id: string, questionId: string, value: string): Promise<void>;
  getAnswers(id: string): Promise<Record<string, string>>;
  waitForAnswer(id: string, questionId: string, timeoutMs: number): Promise<string | null>;
  purgeExpired(): number;
  delete(id: string): Promise<void>;
}
