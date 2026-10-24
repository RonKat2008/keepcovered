"use client";

// Consumes GET /api/cases/{id}/events (SSE) into React state.
// Falls back to a timed replay of fixtures/demo-case.json when the backend is missing.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BackendUnavailableError,
  CaseStreamMessage,
  fixtureForced,
  openCaseEvents,
  postAnswer,
  readSSE,
} from "@/lib/api";
import type { AgentEvent, CaseResult, UserQuestion } from "@/lib/schemas";
import { replayFixture, type ReplayHandle } from "@/components/case/fixture-replay";

export type CasePhase = "connecting" | "running" | "waiting" | "done" | "error";
export type CaseSource = "live" | "fixture";

export interface CaseState {
  phase: CasePhase;
  source: CaseSource;
  events: AgentEvent[];
  /** Questions the agent asked that are not answered yet, in arrival order. The agent may wait on all of them. */
  questions: UserQuestion[];
  result: CaseResult | null;
  answered: Record<string, string>;
  error: string | null;
}

const INITIAL: CaseState = {
  phase: "connecting",
  source: "live",
  events: [],
  questions: [],
  result: null,
  answered: {},
  error: null,
};

function isResult(m: CaseStreamMessage): m is Extract<CaseStreamMessage, { type: "result" }> {
  return "type" in m && m.type === "result";
}
function isQuestion(m: CaseStreamMessage): m is Extract<CaseStreamMessage, { type: "question" }> {
  return "type" in m && m.type === "question";
}

function enqueue(s: CaseState, question: UserQuestion): CaseState {
  if (question.id in s.answered || s.questions.some((q) => q.id === question.id)) return s;
  return { ...s, questions: [...s.questions, question], phase: s.phase === "done" ? "done" : "waiting" };
}

export function useCase(
  id: string,
  opts: { instant?: boolean } = {},
): CaseState & { answer: (questionId: string, value: string) => Promise<void> } {
  const [state, setState] = useState<CaseState>(INITIAL);
  const replayRef = useRef<ReplayHandle | null>(null);
  const sourceRef = useRef<CaseSource>("live");
  const instant = Boolean(opts.instant);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const update = (fn: (s: CaseState) => CaseState) => {
      if (!disposed) setState(fn);
    };

    const startFixture = () => {
      sourceRef.current = "fixture";
      update(() => ({ ...INITIAL, source: "fixture", phase: "running" }));
      replayRef.current = replayFixture(
        {
          onEvent: (event) => update((s) => ({ ...s, events: [...s.events, event] })),
          onQuestion: (question) => update((s) => enqueue(s, question)),
          onResult: (result) => update((s) => ({ ...s, result, questions: [], phase: "done" })),
        },
        { instant },
      );
    };

    const handle = (raw: unknown) => {
      const parsed = CaseStreamMessage.safeParse(raw);
      if (!parsed.success) return;
      const msg = parsed.data;
      if (isResult(msg)) {
        update((s) => ({ ...s, result: msg.result, questions: [], phase: "done" }));
      } else if (isQuestion(msg)) {
        update((s) => enqueue(s, msg.question));
      } else {
        update((s) =>
          s.events.some((e) => e.id === msg.id)
            ? s
            : { ...s, events: [...s.events, msg], phase: s.phase === "waiting" ? "waiting" : "running" },
        );
      }
    };

    const run = async () => {
      if (fixtureForced()) return startFixture();
      try {
        const res = await openCaseEvents(id, controller.signal);
        update((s) => ({ ...s, phase: "running" }));
        await readSSE(res, handle, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof BackendUnavailableError) return startFixture();
        update((s) => ({
          ...s,
          phase: "error",
          error: err instanceof Error ? err.message : "stream failed",
        }));
      }
    };
    void run();

    return () => {
      disposed = true;
      controller.abort();
      replayRef.current?.cancel();
      replayRef.current = null;
    };
  }, [id, instant]);

  const answer = useCallback(
    async (questionId: string, value: string) => {
      if (sourceRef.current === "live") {
        await postAnswer(id, questionId, value);
      }
      setState((s) => ({
        ...s,
        answered: { ...s.answered, [questionId]: value },
        questions: s.questions.filter((q) => q.id !== questionId),
        phase: s.phase === "waiting" && s.questions.every((q) => q.id === questionId) ? "running" : s.phase,
      }));
      replayRef.current?.answered(questionId);
    },
    [id],
  );

  return { ...state, answer };
}
