// Pure scoring for the eval suite. Compares pipeline outputs with synthetic ground truth.
import type { CountyLetterExtraction, EarningsExtraction, MonthStatus } from "@/lib/schemas";

const MONEY_TOLERANCE = 0.5;
const HOURS_TOLERANCE = 0.25;
const MONTH_TOTAL_TOLERANCE = 1;

export interface ExpectedMonth {
  month: string;
  gross_income: number;
  net_income: number;
  active_hours: number;
  online_hours: number;
  overall_expected: MonthStatus["overall"];
  /** Statuses the ground truth accepts (e.g. "unsure" is acceptable when an open question applies). */
  acceptable?: MonthStatus["overall"][];
  /** True totals including documents the pipeline can't see (e.g. an unreadable photo). */
  underlying?: { overall: MonthStatus["overall"] };
}

export interface FieldScore {
  field: string;
  correct: boolean;
  expected: unknown;
  got: unknown;
}

const MONEY_FIELDS = new Set(["gross_earnings", "tips", "platform_fees", "net_payout"]);
const HOUR_FIELDS = new Set(["online_hours", "active_hours"]);
export const SCORED_EARNINGS_FIELDS = ["gross_earnings", "net_payout", "online_hours", "active_hours", "period_start", "period_end"] as const;

function fieldMatches(field: string, expected: unknown, got: unknown): boolean {
  if (expected === null || expected === undefined) return got === null || got === undefined;
  if (typeof expected === "number" && typeof got === "number") {
    if (MONEY_FIELDS.has(field)) return Math.abs(expected - got) <= MONEY_TOLERANCE;
    if (HOUR_FIELDS.has(field)) return Math.abs(expected - got) <= HOURS_TOLERANCE;
    return expected === got;
  }
  return expected === got;
}

export function scoreEarnings(truth: EarningsExtraction, got: EarningsExtraction | null): FieldScore[] {
  return SCORED_EARNINGS_FIELDS.map((field) => ({
    field,
    expected: truth[field],
    got: got ? got[field] : null,
    correct: got !== null && fieldMatches(field, truth[field], got[field]),
  }));
}

/** An unreadable document is handled correctly when the pipeline abstains instead of producing numbers. */
export function abstainedCorrectly(truth: EarningsExtraction, got: EarningsExtraction | null): boolean | null {
  if (!truth.unreadable_reason) return null;
  if (!got) return true;
  return Boolean(got.unreadable_reason) || (got.gross_earnings === null && got.net_payout === null);
}

export function scoreLetterDeadline(truth: CountyLetterExtraction, got: CountyLetterExtraction | null): boolean {
  return got !== null && got.response_deadline === truth.response_deadline;
}

export interface MonthScore {
  month: string;
  totalWithinTolerance: boolean;
  statusCorrect: boolean;
  /** The one failure we never accept: we said "meets" when the truth is anything else. */
  falseMeets: boolean;
  expected: ExpectedMonth["overall_expected"];
  got: MonthStatus["overall"] | "absent";
}

export function scoreMonths(expected: ExpectedMonth[], got: MonthStatus[]): MonthScore[] {
  return expected.map((e) => {
    const g = got.find((m) => m.month === e.month);
    const acceptable = [...(e.acceptable?.length ? e.acceptable : [e.overall_expected])];
    // When the readable statements alone already clear both income tests and the full truth also
    // meets, "meets" is a correct answer, not a false one: more income can't undo it.
    const visibleMeets = e.gross_income >= 580 && e.net_income >= 580;
    if (e.underlying?.overall === "meets" && visibleMeets) acceptable.push("meets");
    return {
      month: e.month,
      totalWithinTolerance: g !== undefined && Math.abs(g.gross_income - e.gross_income) <= MONTH_TOTAL_TOLERANCE,
      statusCorrect: g !== undefined && acceptable.includes(g.overall),
      falseMeets: g?.overall === "meets" && !acceptable.includes("meets"),
      expected: e.overall_expected,
      got: g?.overall ?? "absent",
    };
  });
}

export function rate(values: boolean[]): { n: number; correct: number; pct: number } {
  const correct = values.filter(Boolean).length;
  return { n: values.length, correct, pct: values.length ? (100 * correct) / values.length : 100 };
}

export function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
