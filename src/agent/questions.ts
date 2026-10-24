// Pending questions the agent is waiting on, per session. Kept in memory with the session
// (globalThis so Next dev hot reloads keep it); the SSE route forwards them to the UI.
import type { UserQuestion } from "@/lib/schemas";

type Listener = (q: UserQuestion) => void;

interface QuestionHub {
  pending: Map<string, UserQuestion[]>;
  listeners: Map<string, Set<Listener>>;
}

const hub: QuestionHub = ((globalThis as { __kcQuestions?: QuestionHub }).__kcQuestions ??= {
  pending: new Map(),
  listeners: new Map(),
});

export function postQuestion(sessionId: string, q: UserQuestion): void {
  hub.pending.set(sessionId, [...(hub.pending.get(sessionId) ?? []), q]);
  hub.listeners.get(sessionId)?.forEach((fn) => fn(q));
}

export function resolveQuestion(sessionId: string, questionId: string): void {
  hub.pending.set(sessionId, (hub.pending.get(sessionId) ?? []).filter((q) => q.id !== questionId));
}

export function pendingQuestions(sessionId: string): UserQuestion[] {
  return hub.pending.get(sessionId) ?? [];
}

export function onQuestion(sessionId: string, fn: Listener): () => void {
  const set = hub.listeners.get(sessionId) ?? new Set<Listener>();
  set.add(fn);
  hub.listeners.set(sessionId, set);
  return () => set.delete(fn);
}
