import raw from "../../data/rules/work_rules.json";
import type { BankTransaction, EarningsRecord, MonthStatus, OtherActivity } from "@/lib/schemas";
import {
  ceilTenth,
  dayNumber,
  floorTenth,
  isValidIso,
  monthEnd,
  monthOf,
  monthStart,
  nextMonth,
  prevMonth,
  round2,
  roundTo,
} from "./util";

type Source = { doc: string; page: number; quote: string };

export type WorkRules = {
  version: string;
  effective_date: string;
  federal_minimum_wage_hourly: number;
  income_threshold_monthly: number;
  hours_threshold_monthly: number;
  income_counting: { seasonal_averaging_months: number };
  open_questions: Array<{ id: string; text: string; default_behavior: string }>;
  key_dates: Array<{ id: string; date: string; label_en: string; label_es: string; source: Source }>;
  mandatory_exemptions: Array<{
    id: string;
    label_en: string;
    label_es: string;
    automatic?: boolean;
    screener_question_en: string | null;
    screener_question_es: string | null;
    source: Source;
  }>;
  short_term_hardship: {
    items: Array<{
      id: string;
      label_en: string;
      label_es: string;
      screener_question_en: string;
      screener_question_es: string;
      source: Source;
    }>;
  };
};

export function loadWorkRules(): WorkRules {
  return raw as unknown as WorkRules;
}

export type MonthAllocation = {
  month: string;
  share: number;
  gross: number | null;
  net: number | null;
  online: number | null;
  active: number | null;
  split: boolean;
};

/** Pro-rata (by calendar days) allocation of one record to the months its period touches. */
export function allocateToMonths(record: EarningsRecord): MonthAllocation[] {
  const { period_start: start, period_end: end } = record;
  if (!start || !end || !isValidIso(start) || !isValidIso(end) || end < start) return [];
  const totalDays = dayNumber(end) - dayNumber(start) + 1;

  const slices: Array<{ month: string; days: number }> = [];
  for (let m = monthOf(start); m <= monthOf(end); m = nextMonth(m)) {
    const from = start > monthStart(m) ? start : monthStart(m);
    const to = end < monthEnd(m) ? end : monthEnd(m);
    slices.push({ month: m, days: dayNumber(to) - dayNumber(from) + 1 });
  }

  const split = slices.length > 1;
  const portion = (value: number | null, places: number) => {
    if (value === null) return slices.map(() => null as number | null);
    let allocated = 0;
    return slices.map((s, i) => {
      const part =
        i === slices.length - 1 ? roundTo(value - allocated, places) : roundTo((value * s.days) / totalDays, places);
      allocated += part;
      return part;
    });
  };
  const gross = portion(record.gross_earnings, 2);
  const net = portion(record.net_payout, 2);
  const online = portion(record.online_hours, 4);
  const active = portion(record.active_hours, 4);
  return slices.map((s, i) => ({
    month: s.month,
    share: s.days / totalDays,
    gross: gross[i],
    net: net[i],
    online: online[i],
    active: active[i],
    split,
  }));
}

const CRITICAL_FIELDS = ["gross_earnings", "net_payout", "period_start", "period_end", "active_hours"] as const;
const lowFields = (r: EarningsRecord): string[] => CRITICAL_FIELDS.filter((f) => r.field_confidence[f] === "low");

type Alloc = { record: EarningsRecord; a: MonthAllocation };
type Totals = {
  gross: number;
  net: number;
  online: number;
  active: number;
  other: number;
  education: number;
  income: MonthStatus["meets_income_path"];
  hours: MonthStatus["meets_hours_path"];
  hoursDependsOnOnline: boolean;
};

const sum = (xs: Array<number | null>): number => xs.reduce<number>((t, x) => t + (x ?? 0), 0);

function evaluate(
  allocs: Alloc[],
  labeled: BankTransaction[],
  activities: OtherActivity[],
  rules: WorkRules,
): Totals {
  const cash = sum(labeled.map((t) => t.amount));
  const gross = round2(sum(allocs.map((x) => x.a.gross)) + cash);
  const net = round2(sum(allocs.map((x) => x.a.net)) + cash);
  const online = roundTo(sum(allocs.map((x) => x.a.online)), 2);
  const active = roundTo(sum(allocs.map((x) => x.a.active)), 2);
  const education = roundTo(sum(activities.filter((x) => x.kind === "education").map((x) => x.hours)), 2);
  const other = roundTo(sum(activities.map((x) => x.hours)), 2);

  const t = rules.income_threshold_monthly;
  const h = rules.hours_threshold_monthly;
  const income = gross < t ? false : net >= t ? true : ("depends_on_open_question" as const);

  const confirmedOther = other - education;
  let hours: Totals["hours"];
  let hoursDependsOnOnline = false;
  if (active + confirmedOther >= h) hours = true;
  else if (active + other >= h) hours = "depends_on_open_question"; // needs unconfirmed school hours
  else if (online + other >= h) {
    hours = "depends_on_open_question";
    hoursDependsOnOnline = true;
  } else hours = false;
  return { gross, net, online, active, other, education, income, hours, hoursDependsOnOnline };
}

type StatusInput = {
  months: string[];
  records: EarningsRecord[];
  labeledIncome: BankTransaction[];
  activities: OtherActivity[];
};
type Reason = MonthStatus["reasons"][number];

function buildMonth(month: string, input: StatusInput, rules: WorkRules): MonthStatus {
  const t = rules.income_threshold_monthly;
  const h = rules.hours_threshold_monthly;
  const allocs: Alloc[] = input.records.flatMap((record) =>
    allocateToMonths(record)
      .filter((a) => a.month === month)
      .map((a) => ({ record, a })),
  );
  const labeled = input.labeledIncome.filter((x) => monthOf(x.date) === month);
  const activities = input.activities.filter((x) => x.month === month);

  const all = evaluate(allocs, labeled, activities, rules);
  const evidence = [...new Set([...allocs.map((x) => x.record.source_doc_id), ...labeled.map((x) => `txn:${x.id}`)])];

  const reasons: Reason[] = [];
  const questions: string[] = [];

  if (all.income === true) reasons.push({ code: "income_met", params: { gross: all.gross } });
  else if (all.income === false) reasons.push({ code: "income_short", params: { gross: all.gross, short_by: round2(t - all.gross) } });
  else {
    reasons.push({ code: "gross_meets_net_short", params: { gross: all.gross, net: all.net, threshold: t } });
    questions.push("gross_vs_net");
  }

  if (all.hours === true) reasons.push({ code: "hours_met", params: { active: floorTenth(all.active) } });
  else if (all.hours === false)
    reasons.push({ code: "hours_short", params: { hours: floorTenth(all.active + all.other), short_by: ceilTenth(h - all.active - all.other) } });
  else if (all.hoursDependsOnOnline) {
    reasons.push({ code: "online_only_hours", params: { online: floorTenth(all.online), active: floorTenth(all.active) } });
    questions.push("hours_definition");
  }

  if (all.other > 0) reasons.push({ code: "combined_activities", params: { other_hours: floorTenth(all.other) } });
  if (labeled.length > 0)
    reasons.push({ code: "bank_only_income", params: { amount: round2(sum(labeled.map((x) => x.amount))), count: labeled.length } });
  for (const id of new Set(allocs.filter((x) => x.a.split).map((x) => x.record.source_doc_id)))
    reasons.push({ code: "split_across_months", params: { doc_id: id } });
  if (all.education > 0) {
    reasons.push({ code: "education_unconfirmed", params: {} });
    questions.push("education_hours_in_combination");
  }
  if (all.income !== true && all.hours !== true && all.gross > 0 && all.active + all.other > 0)
    questions.push("income_to_hours_conversion");

  const lowDocs = new Map<string, EarningsRecord>();
  for (const { record } of allocs) if (lowFields(record).length > 0) lowDocs.set(record.source_doc_id, record);
  for (const [docId, record] of lowDocs)
    for (const field of lowFields(record)) reasons.push({ code: "low_confidence_excluded", params: { doc_id: docId, field } });

  const hasData = allocs.length > 0 || labeled.length > 0 || activities.length > 0;
  const meets = all.income === true || all.hours === true;
  let overall: MonthStatus["overall"];
  if (!hasData) {
    overall = "missing_data";
    reasons.unshift({ code: "missing_month", params: {} });
  } else if (meets) {
    const trusted = evaluate(
      allocs.filter((x) => lowFields(x.record).length === 0),
      labeled,
      activities,
      rules,
    );
    overall = trusted.income === true || trusted.hours === true ? "meets" : "unsure";
  } else if (all.income === "depends_on_open_question" || all.hours === "depends_on_open_question") overall = "unsure";
  else overall = "does_not_meet";

  const known = new Set(rules.open_questions.map((q) => q.id));
  return {
    month,
    gross_income: all.gross,
    net_income: all.net,
    online_hours: floorTenth(all.online),
    active_hours: floorTenth(all.active),
    other_activity_hours: floorTenth(all.other),
    meets_income_path: all.income,
    meets_hours_path: all.hours,
    overall,
    evidence_doc_ids: evidence,
    reasons,
    open_question_ids: [...new Set(questions)].filter((q) => known.has(q)),
  };
}

export function computeMonthlyStatus(input: StatusInput, rules: WorkRules): MonthStatus[] {
  return input.months.map((month) => buildMonth(month, input, rules));
}

/** Informational backup path only (open question fluctuating_vs_seasonal). Never changes `overall`. */
export function sixMonthAverage(
  statuses: MonthStatus[],
  endMonth: string,
  rules: WorkRules,
): { average_gross: number; months_counted: number; meets_average: boolean } {
  const n = rules.income_counting.seasonal_averaging_months;
  const window = new Set<string>();
  for (let m = endMonth, i = 0; i < n; m = prevMonth(m), i++) window.add(m);
  const counted = statuses.filter((s) => window.has(s.month) && s.overall !== "missing_data");
  const total = sum(counted.map((s) => s.gross_income));
  const average = counted.length === 0 ? 0 : round2(total / counted.length);
  return {
    average_gross: average,
    months_counted: counted.length,
    // Missing months are never filled in, so the average only "meets" with a full window of data.
    meets_average: counted.length === n && average >= rules.income_threshold_monthly,
  };
}
