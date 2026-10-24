// Deterministic helpers for the orchestrator: which months to assess, when to route to a
// navigator, and the pre-written case summary a navigator receives.
import type { CaseResult, CountyLetter, EarningsRecord, ExemptionScreen, MonthStatus } from "@/lib/schemas";

const DEFAULT_LOOKBACK_MONTHS = 3;

function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Every month from the earliest to the latest one we have evidence or a request for, so gaps show up as missing. */
export function caseMonths(letter: CountyLetter | null, records: EarningsRecord[], today: string): string[] {
  const seeds = new Set<string>(letter?.months_requested ?? []);
  for (const r of records) {
    if (r.period_start) seeds.add(monthOf(r.period_start));
    if (r.period_end) seeds.add(monthOf(r.period_end));
  }
  if (seeds.size === 0) {
    const current = monthOf(today);
    for (let i = DEFAULT_LOOKBACK_MONTHS; i >= 1; i--) seeds.add(addMonths(current, -i));
  }
  const sorted = [...seeds].sort();
  const months: string[] = [];
  for (let m = sorted[0]; m <= sorted[sorted.length - 1]; m = addMonths(m, 1)) months.push(m);
  return months;
}

export function navigatorReasons(months: MonthStatus[], exemptions: ExemptionScreen[], unreadableCount: number): string[] {
  const reasons: string[] = [];
  const unsure = months.filter((m) => m.overall === "unsure").map((m) => m.month);
  const missing = months.filter((m) => m.overall === "missing_data").map((m) => m.month);
  if (unsure.length) reasons.push(`Unsure months: ${unsure.join(", ")} (depends on rules the state has not clarified)`);
  if (missing.length) reasons.push(`Missing records for: ${missing.join(", ")}`);
  const possible = exemptions.filter((e) => e.outcome !== "not_indicated").map((e) => e.label_en);
  if (possible.length) reasons.push(`Possible exemption to discuss: ${possible.join("; ")}`);
  if (unreadableCount) reasons.push(`${unreadableCount} document(s) could not be read`);
  return reasons;
}

/** Plain-text summary for a navigator. No names or case numbers are ever included. */
export function buildCaseSummary(result: CaseResult): string {
  const lines = [
    "KeepCovered case summary (member's own records; not a determination)",
    result.letter
      ? `County letter: ${result.letter.letter_type.replace(/_/g, " ")}, reply due ${result.letter.response_deadline ?? "unknown"}, months asked ${result.letter.months_requested.join(", ") || "not listed"}`
      : "No county letter uploaded",
    ...result.months.map(
      (m) =>
        `${m.month}: gross $${m.gross_income.toFixed(2)}, net $${m.net_income.toFixed(2)}, active ${m.active_hours}h, online ${m.online_hours}h → ${m.overall.replace(/_/g, " ")}${m.open_question_ids.length ? ` [open: ${m.open_question_ids.join(", ")}]` : ""}`,
    ),
    `Duplicates removed: ${result.reconcile.duplicates.length}; payouts matched to bank: ${result.reconcile.matches.length}; bank-only income deposits: ${result.reconcile.user_labeled_income.length}`,
    ...result.navigator_reasons.map((r) => `Needs help: ${r}`),
  ];
  return lines.join("\n");
}
