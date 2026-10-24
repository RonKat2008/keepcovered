// Shared contract for KeepCovered. Every Claude output is parsed with these schemas;
// every module (rules engine, agent, UI, evals) imports types from here.
import { z } from "zod";

export const Confidence = z.enum(["high", "medium", "low"]);
export type Confidence = z.infer<typeof Confidence>;

export const Platform = z.enum(["uber", "lyft", "doordash", "instacart", "other"]);
export type Platform = z.infer<typeof Platform>;

export const Lang = z.enum(["en", "es"]);
export type Lang = z.infer<typeof Lang>;

/** YYYY-MM-DD */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
/** YYYY-MM */
export const MonthKey = z.string().regex(/^\d{4}-\d{2}$/);

// ---------- Documents ----------

export const DocKind = z.enum(["earnings_screenshot", "bank_statement", "county_letter", "unrelated"]);
export type DocKind = z.infer<typeof DocKind>;

export const TriageResult = z.object({
  kind: DocKind,
  platform: Platform.nullable(),
  language: z.enum(["en", "es", "other"]),
  is_readable: z.boolean(),
  reason: z.string(),
});
export type TriageResult = z.infer<typeof TriageResult>;

/** What Claude extracts from one earnings screenshot (structured outputs). */
export const EarningsExtraction = z.object({
  platform: Platform.nullable(),
  period_start: IsoDate.nullable(),
  period_end: IsoDate.nullable(),
  gross_earnings: z.number().nullable(),
  tips: z.number().nullable(),
  platform_fees: z.number().nullable(),
  net_payout: z.number().nullable(),
  online_hours: z.number().nullable(),
  active_hours: z.number().nullable(),
  trips_or_deliveries: z.number().int().nullable(),
  unreadable_reason: z.string().nullable(),
});
export type EarningsExtraction = z.infer<typeof EarningsExtraction>;

export const EARNINGS_FIELDS = [
  "platform",
  "period_start",
  "period_end",
  "gross_earnings",
  "tips",
  "platform_fees",
  "net_payout",
  "online_hours",
  "active_hours",
  "trips_or_deliveries",
] as const satisfies readonly (keyof EarningsExtraction)[];
export type EarningsField = (typeof EARNINGS_FIELDS)[number];

/** An extraction after the dual-read + arithmetic gate. Confidence is computed by code, not self-reported. */
export const EarningsRecord = EarningsExtraction.extend({
  source_doc_id: z.string(),
  field_confidence: z.record(z.string(), Confidence),
  /** Human-readable notes from the verification gate, e.g. "readers disagreed on net_payout; Opus adjudicated". */
  verification_notes: z.array(z.string()),
});
export type EarningsRecord = z.infer<typeof EarningsRecord>;

export const LetterType = z.enum([
  "work_rule_notice",
  "renewal",
  "verification_request",
  "termination_notice",
  "other",
]);

export const CountyLetterExtraction = z.object({
  letter_type: LetterType,
  notice_date: IsoDate.nullable(),
  response_deadline: IsoDate.nullable(),
  requested_items: z.array(z.string()),
  months_requested: z.array(MonthKey),
  language: z.enum(["en", "es", "other"]),
  county_name: z.string().nullable(),
  unreadable_reason: z.string().nullable(),
});
export type CountyLetterExtraction = z.infer<typeof CountyLetterExtraction>;

export const CountyLetter = CountyLetterExtraction.extend({
  source_doc_id: z.string(),
  field_confidence: z.record(z.string(), Confidence),
});
export type CountyLetter = z.infer<typeof CountyLetter>;

// ---------- Bank ----------

export const BankTransaction = z.object({
  id: z.string(),
  date: IsoDate,
  /** Positive = money in. */
  amount: z.number(),
  description: z.string(),
});
export type BankTransaction = z.infer<typeof BankTransaction>;

export const DepositLabel = z.enum(["driving", "not_driving", "unknown"]);
export type DepositLabel = z.infer<typeof DepositLabel>;

/** Payer suggestion for a deposit from descriptor embeddings (kNN). Code thresholds it. */
export const PayerSuggestion = z.object({
  txn_id: z.string(),
  platform: Platform.nullable(),
  similarity: z.number(),
});
export type PayerSuggestion = z.infer<typeof PayerSuggestion>;

// ---------- Reconciliation ----------

export const DuplicateGroup = z.object({
  kept_doc_id: z.string(),
  dropped_doc_ids: z.array(z.string()),
  reason: z.string(),
});

export const PayoutMatch = z.object({
  source_doc_id: z.string(),
  txn_ids: z.array(z.string()),
  amount_diff: z.number(),
});

export const ReconcileResult = z.object({
  records: z.array(EarningsRecord),
  duplicates: z.array(DuplicateGroup),
  matches: z.array(PayoutMatch),
  /** Deposits that look like they could be income but are not matched to a screenshot. The user labels them. */
  unmatched_deposits: z.array(BankTransaction.extend({ suggestion: PayerSuggestion.nullable() })),
  /** Deposits the user labeled as driving income that have no screenshot. Counted as net income only. */
  user_labeled_income: z.array(BankTransaction),
});
export type ReconcileResult = z.infer<typeof ReconcileResult>;

// ---------- Monthly status ----------

export const PathResult = z.union([z.boolean(), z.literal("depends_on_open_question")]);
export type PathResult = z.infer<typeof PathResult>;

export const MonthStatus = z.object({
  month: MonthKey,
  gross_income: z.number(),
  net_income: z.number(),
  online_hours: z.number(),
  active_hours: z.number(),
  other_activity_hours: z.number(),
  meets_income_path: PathResult,
  meets_hours_path: PathResult,
  overall: z.enum(["meets", "does_not_meet", "unsure", "missing_data"]),
  evidence_doc_ids: z.array(z.string()),
  /** Generated by the rules engine, never by the LLM. Codes map to EN/ES copy in the UI. */
  reasons: z.array(z.object({ code: z.string(), params: z.record(z.string(), z.union([z.string(), z.number()])) })),
  open_question_ids: z.array(z.string()),
});
export type MonthStatus = z.infer<typeof MonthStatus>;

export const OtherActivity = z.object({
  month: MonthKey,
  kind: z.enum(["community_service", "work_program", "education", "other_work"]),
  hours: z.number().nonnegative(),
});
export type OtherActivity = z.infer<typeof OtherActivity>;

// ---------- Exemptions ----------

export const ExemptionAnswers = z.record(z.string(), z.enum(["yes", "no", "not_sure"]));
export type ExemptionAnswers = z.infer<typeof ExemptionAnswers>;

export const ExemptionScreen = z.object({
  id: z.string(),
  outcome: z.enum(["may_qualify", "ask_navigator", "not_indicated"]),
  label_en: z.string(),
  label_es: z.string(),
  source: z.object({ doc: z.string(), page: z.number(), quote: z.string() }).nullable(),
});
export type ExemptionScreen = z.infer<typeof ExemptionScreen>;

// ---------- Explanation with citations ----------

export const Citation = z.object({
  source_id: z.string(),
  title: z.string(),
  page: z.number().nullable(),
  cited_text: z.string(),
});
export type Citation = z.infer<typeof Citation>;

export const ExplanationSpan = z.object({ text: z.string(), citations: z.array(Citation) });
export type ExplanationSpan = z.infer<typeof ExplanationSpan>;

// ---------- Deadlines ----------

export const Deadline = z.object({
  id: z.string(),
  date: IsoDate,
  title_en: z.string(),
  title_es: z.string(),
  kind: z.enum(["respond_to_letter", "monthly_report", "renewal", "rule_start", "reminder"]),
});
export type Deadline = z.infer<typeof Deadline>;

// ---------- Agent events (SSE) and the final case ----------

export const AgentStep = z.enum([
  "triage",
  "extract",
  "verify",
  "letter",
  "bank",
  "reconcile",
  "status",
  "exemptions",
  "explain",
  "packet",
  "handoff",
  "portal",
]);
export type AgentStep = z.infer<typeof AgentStep>;

export const AgentEvent = z.object({
  id: z.string(),
  at: z.number(),
  step: AgentStep,
  kind: z.enum(["start", "progress", "tool", "model", "question", "done", "error"]),
  title: z.string(),
  detail: z.string().optional(),
  model: z.string().optional(),
  effort: z.string().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_read_tokens: z.number().optional(),
  cost_usd: z.number().optional(),
  latency_ms: z.number().optional(),
  /** Pure-code steps are marked so the trace can show "decided by code" vs "read by Claude". */
  decided_by: z.enum(["code", "claude", "user"]).optional(),
});
export type AgentEvent = z.infer<typeof AgentEvent>;

export const UserQuestion = z.object({
  id: z.string(),
  kind: z.enum(["label_deposit", "confirm_field", "reupload", "missing_month"]),
  prompt_en: z.string(),
  prompt_es: z.string(),
  ref: z.string(),
  options: z.array(z.object({ value: z.string(), label_en: z.string(), label_es: z.string() })),
});
export type UserQuestion = z.infer<typeof UserQuestion>;

export const CaseResult = z.object({
  session_id: z.string(),
  lang: Lang,
  months: z.array(MonthStatus),
  letter: CountyLetter.nullable(),
  records: z.array(EarningsRecord),
  reconcile: ReconcileResult,
  exemptions: z.array(ExemptionScreen),
  explanation: z.array(ExplanationSpan),
  deadlines: z.array(Deadline),
  questions: z.array(UserQuestion),
  needs_navigator: z.boolean(),
  navigator_reasons: z.array(z.string()),
  case_summary: z.string(),
});
export type CaseResult = z.infer<typeof CaseResult>;
