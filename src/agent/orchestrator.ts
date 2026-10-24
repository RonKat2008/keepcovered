// Case orchestrator. A code-controlled workflow: Claude reads (triage, extraction, letter)
// and explains (citations); every decision about money, months, exemptions and deadlines
// is made by the pure functions in src/rules. Each step emits AgentEvents for the live UI
// and the judge-facing trace.
import { randomUUID } from "node:crypto";

import { getBankSource } from "@/bank";
import { explainCase } from "@/claude/tasks/explain";
import { extractCountyLetter } from "@/claude/tasks/letter";
import { triageDocument } from "@/claude/tasks/triage";
import { verifyEarnings } from "@/claude/tasks/verify";
import type { InputDoc } from "@/claude/types";
import type { ModelCallMeta } from "@/claude/call";
import { suggestPayers } from "@/rag/payers";
import { duplicateCandidates } from "@/rag/imageDedupe";
import { retrieveForCase } from "@/rag/retrieve";
import {
  buildDeadlines,
  computeMonthlyStatus,
  loadWorkRules,
  reconcile,
  screenExemptions,
} from "@/rules";
import type {
  AgentEvent,
  AgentStep,
  BankTransaction,
  CaseResult,
  CountyLetter,
  DepositLabel,
  EarningsRecord,
  ExemptionAnswers,
  Lang,
  MonthStatus,
  UserQuestion,
} from "@/lib/schemas";
import { redact } from "@/lib/redact";
import { getStore } from "@/store";
import { postQuestion, resolveQuestion } from "./questions";
import { buildCaseSummary, caseMonths, navigatorReasons } from "./summary";

const TRIAGE_CONCURRENCY = 4;
const ANSWER_TIMEOUT_MS = 90_000;
const BANK_WINDOW_DAYS = 10;

export interface CaseInput {
  sessionId: string;
  lang: Lang;
  answers: ExemptionAnswers;
  /** Bank customer reference (Nessie customer or mock driver id); null when the user skipped bank data. */
  bankRef: string | null;
  today: string;
}

type Emit = (ev: Omit<AgentEvent, "id" | "at">) => void;

function makeEmitter(sessionId: string): Emit {
  const store = getStore();
  return (ev) => {
    store.appendEvent(sessionId, { ...ev, id: randomUUID(), at: Date.now(), detail: ev.detail ? redact(ev.detail) : undefined });
  };
}

function emitCalls(emit: Emit, step: AgentStep, title: string, calls: ModelCallMeta[]): void {
  for (const call of calls) {
    emit({
      step,
      kind: "model",
      title,
      model: call.model,
      effort: call.effort,
      input_tokens: call.input_tokens,
      output_tokens: call.output_tokens,
      cache_read_tokens: call.cache_read_tokens,
      cost_usd: call.cost_usd,
      latency_ms: call.latency_ms,
      decided_by: "claude",
      detail: call.simulated ? `${call.route} (simulated: no API key)` : `${call.route} via ${call.provider}`,
    });
  }
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function readDocuments(docs: InputDoc[], emit: Emit) {
  emit({ step: "triage", kind: "start", title: `Sorting ${docs.length} documents` });
  const triaged = await mapLimit(docs, TRIAGE_CONCURRENCY, async (doc) => {
    const t = await triageDocument(doc);
    emitCalls(emit, "triage", `Sorted ${doc.name}`, t.calls);
    return { doc, triage: t.data };
  });
  const earningsDocs = triaged.filter((t) => t.triage?.kind === "earnings_screenshot").map((t) => t.doc);
  const letterDocs = triaged.filter((t) => t.triage?.kind === "county_letter").map((t) => t.doc);
  const ignored = triaged.filter((t) => !t.triage || t.triage.kind === "unrelated");
  emit({
    step: "triage",
    kind: "done",
    title: `${earningsDocs.length} earnings, ${letterDocs.length} letter, ${ignored.length} set aside`,
    detail: ignored.map((t) => `${t.doc.name}: ${t.triage?.reason ?? "could not read"}`).join("; ") || undefined,
  });

  emit({ step: "extract", kind: "start", title: "Reading earnings with two independent readers" });
  const verified = await mapLimit(earningsDocs, TRIAGE_CONCURRENCY, async (doc) => {
    const v = await verifyEarnings(doc);
    emitCalls(emit, "verify", `Read ${doc.name}`, v.calls);
    return { doc, record: v.data };
  });
  const records: EarningsRecord[] = verified.flatMap((v) => (v.record ? [v.record] : []));
  const unreadable = verified.filter((v) => !v.record || v.record.unreadable_reason);
  emit({
    step: "verify",
    kind: "done",
    title: `${records.length - unreadable.filter((u) => u.record).length} statements verified`,
    detail: records.flatMap((r) => r.verification_notes).join(" · ") || undefined,
    decided_by: "code",
  });

  let letter: CountyLetter | null = null;
  if (letterDocs.length > 0) {
    emit({ step: "letter", kind: "start", title: "Reading the county letter" });
    const l = await extractCountyLetter(letterDocs[0]);
    emitCalls(emit, "letter", "Read county letter", l.calls);
    letter = l.data;
    emit({
      step: "letter",
      kind: "done",
      title: letter?.response_deadline ? `Reply due ${letter.response_deadline}` : "No deadline found on the letter",
      detail: letter ? `Months asked: ${letter.months_requested.join(", ") || "none listed"}` : undefined,
    });
  }
  return { records, letter, unreadable: unreadable.map((u) => u.doc) };
}

async function loadBank(bankRef: string | null, records: EarningsRecord[], months: string[], emit: Emit): Promise<BankTransaction[]> {
  if (!bankRef) return [];
  emit({ step: "bank", kind: "start", title: "Loading bank deposits" });
  const starts = records.map((r) => r.period_start).filter((d): d is string => Boolean(d));
  const from = [...starts, `${months[0] ?? "2026-01"}-01`].sort()[0];
  const to = shiftDate(`${months[months.length - 1] ?? "2026-12"}-28`, BANK_WINDOW_DAYS);
  try {
    const txns = await getBankSource().listTransactions(bankRef, from, to);
    emit({ step: "bank", kind: "done", title: `${txns.filter((t) => t.amount > 0).length} deposits found`, decided_by: "code" });
    return txns;
  } catch (err) {
    emit({ step: "bank", kind: "error", title: "Bank data unavailable", detail: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

function depositQuestion(txn: BankTransaction): UserQuestion {
  const amount = `$${txn.amount.toFixed(2)}`;
  return {
    id: `label:${txn.id}`,
    kind: "label_deposit",
    ref: txn.id,
    prompt_en: `Is this ${amount} deposit on ${txn.date} ("${txn.description}") money from driving?`,
    prompt_es: `¿Este depósito de ${amount} del ${txn.date} ("${txn.description}") es dinero de manejar?`,
    options: [
      { value: "driving", label_en: "Yes, from driving", label_es: "Sí, de manejar" },
      { value: "not_driving", label_en: "No", label_es: "No" },
      { value: "unknown", label_en: "Not sure", label_es: "No estoy seguro" },
    ],
  };
}

async function askAboutDeposits(
  sessionId: string,
  questions: UserQuestion[],
  emit: Emit,
): Promise<Record<string, DepositLabel>> {
  const store = getStore();
  const labels: Record<string, DepositLabel> = {};
  await Promise.all(
    questions.map(async (q) => {
      emit({ step: "reconcile", kind: "question", title: q.prompt_en, detail: q.id, decided_by: "user" });
      postQuestion(sessionId, q);
      const answer = await store.waitForAnswer(sessionId, q.id, ANSWER_TIMEOUT_MS);
      resolveQuestion(sessionId, q.id);
      labels[q.ref] = answer === "driving" || answer === "not_driving" ? answer : "unknown";
    }),
  );
  return labels;
}

export async function runCase(input: CaseInput): Promise<CaseResult> {
  const store = getStore();
  const emit = makeEmitter(input.sessionId);
  const rules = loadWorkRules();
  const docs = (await store.getDocs(input.sessionId)) as InputDoc[];

  const { records, letter, unreadable } = await readDocuments(docs, emit);
  const months = caseMonths(letter, records, input.today);

  const transactions = await loadBank(input.bankRef, records, months, emit);
  const [suggestions, dupes] = await Promise.all([suggestPayers(transactions), duplicateCandidates(docs)]);
  if (dupes.length > 0) {
    emit({ step: "reconcile", kind: "progress", title: `${dupes.length} possible duplicate photo(s)`, detail: dupes.map((d) => `${d.a}≈${d.b} (${d.method})`).join(", ") });
  }

  emit({ step: "reconcile", kind: "start", title: "Matching app payouts to bank deposits", decided_by: "code" });
  let rec = reconcile({ records, transactions, labels: {}, suggestions });
  const questions = rec.unmatched_deposits.map(depositQuestion);
  let depositLabels: Record<string, DepositLabel> = {};
  if (questions.length > 0) {
    const labels = await askAboutDeposits(input.sessionId, questions, emit);
    depositLabels = labels;
    rec = reconcile({ records, transactions, labels, suggestions });
  }
  emit({
    step: "reconcile",
    kind: "done",
    title: `${rec.matches.length} payouts matched, ${rec.duplicates.length} duplicates removed`,
    decided_by: "code",
  });

  emit({ step: "status", kind: "start", title: "Applying the DHCS rule to each month", decided_by: "code" });
  const monthStatuses: MonthStatus[] = computeMonthlyStatus(
    { months, records: rec.records, labeledIncome: rec.user_labeled_income, activities: [], unreadableDocIds: unreadable.map((d) => d.id) },
    rules,
  );
  emit({
    step: "status",
    kind: "done",
    title: monthStatuses.map((m) => `${m.month}: ${m.overall.replace(/_/g, " ")}`).join(" · "),
    decided_by: "code",
  });

  const exemptions = screenExemptions(input.answers, rules);
  emit({
    step: "exemptions",
    kind: "done",
    title: `${exemptions.filter((e) => e.outcome !== "not_indicated").length} possible exemption(s) to tell the county about`,
    decided_by: "code",
  });

  const deadlines = buildDeadlines({ letter, today: input.today, months: monthStatuses }, rules);

  emit({ step: "explain", kind: "start", title: "Writing a plain-language explanation with sources" });
  const chunks = await retrieveForCase(
    [
      "income $580 total gross income month",
      "80 hours work self-employment qualifying activity",
      "look-back month verify compliance",
      "30 days to respond notice comply",
      "exemption parent caretaker child 13",
    ],
    8,
  );
  const facts = { months: monthStatuses, letter, deadlines, exemptions, lang: input.lang };
  const explained = await explainCase({ facts, chunks, lang: input.lang });
  emitCalls(emit, "explain", "Explained with citations", explained.calls);

  const reasons = navigatorReasons(monthStatuses, exemptions, unreadable.length, input.lang);
  const result: CaseResult = {
    session_id: input.sessionId,
    lang: input.lang,
    months: monthStatuses,
    letter,
    records: rec.records,
    reconcile: rec,
    exemptions,
    explanation: explained.data ?? [],
    deadlines,
    questions: [
      // Only questions still open (unanswered or "not sure") stay on the result.
      ...questions.filter((q) => (depositLabels[q.ref] ?? "unknown") === "unknown"),
      ...unreadable.map(
        (doc): UserQuestion => ({
          id: `reupload:${doc.id}`,
          kind: "reupload",
          ref: doc.id,
          prompt_en: `We couldn't read ${doc.name} clearly. Please take a new photo.`,
          prompt_es: `No pudimos leer bien ${doc.name}. Por favor tome otra foto.`,
          options: [],
        }),
      ),
    ],
    needs_navigator: reasons.length > 0,
    navigator_reasons: reasons,
    case_summary: "",
  };
  const finalResult = { ...result, case_summary: redact(buildCaseSummary(result)) };
  await store.setResult(input.sessionId, finalResult);
  emit({ step: "handoff", kind: "done", title: finalResult.needs_navigator ? "A navigator can help with the open items" : "Proof packet ready" });
  return finalResult;
}
