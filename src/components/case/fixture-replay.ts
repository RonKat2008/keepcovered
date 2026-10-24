// Timed fake agent run for UI development and offline demos.
// Mirrors what GET /api/cases/{id}/events will stream: AgentEvents, one question, then the result.
import demoCase from "../../../fixtures/demo-case.json";
import { CaseResult, type AgentEvent, type ExplanationSpan, type Lang } from "@/lib/schemas";

export const FIXTURE_RESULT: CaseResult = CaseResult.parse(demoCase);

type ScriptedEvent = Omit<AgentEvent, "id" | "at"> & { delay: number };

const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-5-5";
const OPUS = "claude-opus-5-5";

const SCRIPT: ScriptedEvent[] = [
  { delay: 350, step: "triage", kind: "start", title: "Sorting 8 documents", decided_by: "code" },
  { delay: 650, step: "triage", kind: "model", title: "Sorted: 7 app screenshots, 1 county letter", detail: "Uber ×4, DoorDash ×1, Lyft ×1, Instacart ×1. Letter in Spanish.", model: HAIKU, effort: "low", input_tokens: 9120, output_tokens: 410, cache_read_tokens: 2048, cost_usd: 0.0112, latency_ms: 1180, decided_by: "claude" },
  { delay: 700, step: "extract", kind: "model", title: "Read Uber, September", detail: "Gross $612.40, net $472.20, 34 active hours", model: SONNET, effort: "medium", input_tokens: 2210, output_tokens: 186, cache_read_tokens: 1536, cost_usd: 0.0041, latency_ms: 1240, decided_by: "claude" },
  { delay: 500, step: "extract", kind: "model", title: "Read DoorDash, September", detail: "Gross $298.00, net $258.90, 15.5 active hours", model: SONNET, effort: "medium", input_tokens: 2190, output_tokens: 174, cache_read_tokens: 1536, cost_usd: 0.0039, latency_ms: 1120, decided_by: "claude" },
  { delay: 500, step: "extract", kind: "model", title: "Read Uber, October", detail: "Gross $402.15, 26 active hours", model: SONNET, effort: "medium", input_tokens: 2240, output_tokens: 181, cache_read_tokens: 1536, cost_usd: 0.004, latency_ms: 1310, decided_by: "claude" },
  { delay: 600, step: "verify", kind: "tool", title: "Second reader disagreed on one number", detail: "Uber October net payout: $318.70 vs $316.70", decided_by: "code", latency_ms: 4 },
  { delay: 800, step: "verify", kind: "model", title: "Checked the disagreement", detail: "Net payout is $318.70. Gross minus fees matches.", model: OPUS, effort: "high", input_tokens: 3020, output_tokens: 240, cost_usd: 0.0212, latency_ms: 2380, decided_by: "claude" },
  { delay: 500, step: "extract", kind: "model", title: "Read 3 screenshots for November", detail: "Uber $540.25, Lyft $410.50, Instacart $290.00", model: SONNET, effort: "medium", input_tokens: 6480, output_tokens: 522, cache_read_tokens: 4608, cost_usd: 0.0118, latency_ms: 1890, decided_by: "claude" },
  { delay: 500, step: "letter", kind: "model", title: "Read the county letter", detail: "Asks for proof of Sept to Nov income. Due December 8, 2026.", model: SONNET, effort: "medium", input_tokens: 2860, output_tokens: 212, cache_read_tokens: 1536, cost_usd: 0.0049, latency_ms: 1420, decided_by: "claude" },
  { delay: 500, step: "bank", kind: "tool", title: "Matched bank deposits to screenshots", detail: "8 deposits matched. 4 deposits have no screenshot.", decided_by: "code", latency_ms: 38 },
  { delay: 450, step: "reconcile", kind: "tool", title: "Found a duplicate screenshot", detail: "Uber November was uploaded twice. Counted once.", decided_by: "code", latency_ms: 12 },
  { delay: 500, step: "reconcile", kind: "question", title: "Asked you about 4 deposits with no screenshot", detail: "3 DoorDash deposits and 1 Venmo deposit", decided_by: "user" },
  { delay: 600, step: "status", kind: "done", title: "Added up each month against $580 and 80 hours", detail: "September meets, October is open, November meets", decided_by: "code", latency_ms: 3 },
  { delay: 450, step: "exemptions", kind: "done", title: "Checked your answers against the exemption list", detail: "1 item to ask a navigator about", decided_by: "code", latency_ms: 2 },
  { delay: 700, step: "explain", kind: "model", title: "Wrote the explanation with sources", detail: "3 quotes from ACWDL 25-30", model: SONNET, effort: "medium", input_tokens: 7340, output_tokens: 488, cache_read_tokens: 6144, cost_usd: 0.0096, latency_ms: 2950, decided_by: "claude" },
  { delay: 500, step: "packet", kind: "done", title: "Built your proof packet and calendar file", detail: "PDF, 9 pages", decided_by: "code", latency_ms: 210 },
  { delay: 400, step: "handoff", kind: "done", title: "Suggested a navigator", detail: "October needs more proof", decided_by: "code", latency_ms: 1 },
];

/** Index of the scripted question event; replay pauses here until answered or timed out. */
const QUESTION_INDEX = SCRIPT.findIndex((e) => e.kind === "question");
const QUESTION_TIMEOUT_MS = 20000;

const EXPLANATION_EN: ExplanationSpan[] = [
  { text: "For each month, the county looks at whether your gross income reaches $580. ", citations: FIXTURE_RESULT.explanation[0].citations },
  { text: "We used what you earned before app fees, because the rule talks about gross income. ", citations: [] },
  { text: "September ($910.40) and November ($1,240.75) pass the $580 line. ", citations: FIXTURE_RESULT.explanation[2].citations },
  { text: "October is missing DoorDash screenshots. We saw 3 DoorDash deposits in your bank, but without screenshots we don't know your gross pay. If you upload them, we can check October again. ", citations: [] },
  { text: "When you apply for Medi-Cal, the county checks the month right before you apply. That is why it helps to have proof for every month ready.", citations: FIXTURE_RESULT.explanation[4].citations },
];

/** The fixture is María's Spanish case. When the UI is in English, show the same explanation in English. */
export function fixtureResultFor(lang: Lang): CaseResult {
  return lang === "en" ? { ...FIXTURE_RESULT, explanation: EXPLANATION_EN } : FIXTURE_RESULT;
}

export interface ReplayHandlers {
  onEvent: (event: AgentEvent) => void;
  onQuestion: (question: CaseResult["questions"][number]) => void;
  onResult: (result: CaseResult) => void;
}

export interface ReplayHandle {
  /** Tell the replay a question was answered; it resumes once every question is answered. */
  answered: (questionId: string) => void;
  cancel: () => void;
}

export function replayFixture(handlers: ReplayHandlers, opts: { instant?: boolean } = {}): ReplayHandle {
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resumeWaiting: (() => void) | undefined;
  let index = 0;
  let simulatedAt = 0;
  const pending = new Set<string>();

  // `at` follows the scripted timeline, so instant replays (trace page) still show realistic times.
  const emit = (scripted: ScriptedEvent, i: number) => {
    const { delay, ...rest } = scripted;
    simulatedAt += delay;
    handlers.onEvent({ ...rest, id: `fx-${i}`, at: simulatedAt });
  };

  const next = () => {
    if (cancelled) return;
    if (index >= SCRIPT.length) {
      handlers.onResult(FIXTURE_RESULT);
      return;
    }
    const i = index++;
    emit(SCRIPT[i], i);
    if (i === QUESTION_INDEX) {
      FIXTURE_RESULT.questions.forEach((q) => {
        pending.add(q.id);
        handlers.onQuestion(q);
      });
      const proceed = () => {
        if (timer) clearTimeout(timer);
        resumeWaiting = undefined;
        schedule();
      };
      resumeWaiting = proceed;
      timer = setTimeout(proceed, opts.instant ? 0 : QUESTION_TIMEOUT_MS);
      return;
    }
    schedule();
  };

  const schedule = () => {
    const delay = opts.instant ? 0 : (SCRIPT[index]?.delay ?? 400);
    timer = setTimeout(next, delay);
  };

  schedule();
  return {
    answered: (questionId: string) => {
      pending.delete(questionId);
      if (pending.size === 0) resumeWaiting?.();
    },
    cancel: () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

/** All scripted events at once, for the trace page in fixture mode. */
export function fixtureEvents(): AgentEvent[] {
  let at = 0;
  return SCRIPT.map(({ delay, ...rest }, i) => {
    at += delay;
    return { ...rest, id: `fx-${i}`, at };
  });
}
