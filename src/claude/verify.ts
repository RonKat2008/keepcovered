// Pure verification logic for dual-read extraction. Code assigns confidence; models never do.
import {
  EARNINGS_FIELDS,
  type Confidence,
  type EarningsExtraction,
  type EarningsField,
  type EarningsRecord,
} from "@/lib/schemas";

export const MONEY_TOLERANCE = 0.5;
export const HOURS_TOLERANCE = 0.25;
export const NET_TOLERANCE = 1;
export const MAX_PERIOD_DAYS = 31;

const MONEY_FIELDS = new Set<EarningsField>(["gross_earnings", "tips", "platform_fees", "net_payout"]);
const HOURS_FIELDS = new Set<EarningsField>(["online_hours", "active_hours"]);

export const FIELD_LABELS: Readonly<Record<EarningsField, string>> = {
  platform: "app name",
  period_start: "start date",
  period_end: "end date",
  gross_earnings: "total earnings",
  tips: "tips",
  platform_fees: "app fees",
  net_payout: "take-home pay",
  online_hours: "online hours",
  active_hours: "active hours",
  trips_or_deliveries: "number of trips",
};

type FieldValue = EarningsExtraction[EarningsField];

export function fieldsAgree(field: EarningsField, a: FieldValue, b: FieldValue): boolean {
  if (a === null || b === null) return a === b;
  if (MONEY_FIELDS.has(field)) return Math.abs(Number(a) - Number(b)) <= MONEY_TOLERANCE;
  if (HOURS_FIELDS.has(field)) return Math.abs(Number(a) - Number(b)) <= HOURS_TOLERANCE;
  return a === b;
}

/** Fields where the two readers disagree. */
export function compareReadings(a: EarningsExtraction, b: EarningsExtraction): EarningsField[] {
  return EARNINGS_FIELDS.filter((f) => !fieldsAgree(f, a[f], b[f]));
}

export type ArithmeticIssue = { fields: EarningsField[]; note: string };

function daysBetween(start: string, end: string): number {
  const ms = Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

const money = (n: number) => `$${n.toFixed(2)}`;

/** Arithmetic and date sanity checks. Each failing check names the fields it casts doubt on. */
export function arithmeticChecks(x: EarningsExtraction): ArithmeticIssue[] {
  const issues: ArithmeticIssue[] = [];
  const { gross_earnings: gross, platform_fees: fees, net_payout: net, tips } = x;
  if (gross !== null && fees !== null && net !== null) {
    const diff = gross - fees - net;
    if (Math.abs(diff) > NET_TOLERANCE) {
      issues.push({
        fields: ["gross_earnings", "platform_fees", "net_payout"],
        note: `Total earnings minus app fees does not equal take-home pay (off by ${money(Math.abs(diff))}). Please check these numbers.`,
      });
    }
  }
  if (tips !== null && gross !== null && tips > gross) {
    issues.push({ fields: ["tips", "gross_earnings"], note: "Tips are larger than total earnings, which should not happen. Please check these numbers." });
  }
  if (x.period_start !== null && x.period_end !== null) {
    const days = daysBetween(x.period_start, x.period_end);
    if (days < 0) {
      issues.push({ fields: ["period_start", "period_end"], note: "The end date comes before the start date. Please check the dates." });
    } else if (days > MAX_PERIOD_DAYS) {
      issues.push({ fields: ["period_start", "period_end"], note: `The dates cover ${days} days, more than one month. Please check the dates.` });
    }
  }
  return issues;
}

function show(field: EarningsField, v: FieldValue): string {
  if (v === null) return "nothing";
  return MONEY_FIELDS.has(field) && typeof v === "number" ? money(v) : String(v);
}

export type VerifyInput = {
  docId: string;
  primary: EarningsExtraction | null;
  secondary: EarningsExtraction | null;
  /** Opus tie-break reading; null when not needed or when it failed. */
  adjudicated: EarningsExtraction | null;
};

const EMPTY: EarningsExtraction = {
  platform: null,
  period_start: null,
  period_end: null,
  gross_earnings: null,
  tips: null,
  platform_fees: null,
  net_payout: null,
  online_hours: null,
  active_hours: null,
  trips_or_deliveries: null,
  unreadable_reason: null,
};

export function unreadableRecord(docId: string, reason: string, notes: string[] = []): EarningsRecord {
  const field_confidence = Object.fromEntries(EARNINGS_FIELDS.map((f) => [f, "low" as Confidence]));
  return {
    ...EMPTY,
    unreadable_reason: reason,
    source_doc_id: docId,
    field_confidence,
    verification_notes: [...notes, "We could not read this picture clearly. Please upload a sharper photo of the full screen."],
  };
}

/** True when both readers report the image is unreadable (or the only reading does). */
export function isUnreadable(input: VerifyInput): string | null {
  const { primary, secondary, adjudicated } = input;
  if (adjudicated?.unreadable_reason) return adjudicated.unreadable_reason;
  if (primary?.unreadable_reason && (secondary === null || secondary.unreadable_reason)) return primary.unreadable_reason;
  if (!primary && secondary?.unreadable_reason) return secondary.unreadable_reason;
  return null;
}

/** Merge two readings (+ optional adjudication) into a record with code-assigned confidence. */
export function buildRecord(input: VerifyInput): EarningsRecord {
  const { docId, primary, secondary, adjudicated } = input;
  if (!primary && !secondary) return unreadableRecord(docId, "No reader could extract this document.");
  const unreadable = isUnreadable(input);
  if (unreadable) return unreadableRecord(docId, unreadable);

  const notes: string[] = [];
  const confidence: Record<string, Confidence> = {};
  const merged: EarningsExtraction = { ...EMPTY };

  if (!primary || !secondary) {
    const only = (primary ?? secondary) as EarningsExtraction;
    Object.assign(merged, only, { unreadable_reason: null });
    for (const f of EARNINGS_FIELDS) confidence[f] = "low";
    notes.push("Only one reader returned a result, so nothing was double-checked. Please confirm these numbers.");
  } else {
    const disagreements = compareReadings(primary, secondary);
    for (const f of EARNINGS_FIELDS) {
      if (!disagreements.includes(f)) {
        Object.assign(merged, { [f]: primary[f] });
        confidence[f] = "high";
        continue;
      }
      const label = FIELD_LABELS[f];
      const seen = `${show(f, primary[f])} vs ${show(f, secondary[f])}`;
      if (!adjudicated) {
        Object.assign(merged, { [f]: primary[f] });
        confidence[f] = "low";
        notes.push(`The two readers saw different ${label} (${seen}) and the tie-break did not finish. Please check this number.`);
        continue;
      }
      const value = adjudicated[f];
      Object.assign(merged, { [f]: value });
      const matchesReader = fieldsAgree(f, value, primary[f]) || fieldsAgree(f, value, secondary[f]);
      confidence[f] = matchesReader ? "medium" : "low";
      notes.push(
        matchesReader
          ? `The two readers saw different ${label} (${seen}). A third, careful check chose ${show(f, value)}.`
          : `The two readers saw different ${label} (${seen}) and a third check saw ${show(f, value)}. Please check this number.`,
      );
    }
    if (disagreements.length === 0) notes.push("Two separate readers agreed on every field.");
  }

  for (const issue of arithmeticChecks(merged)) {
    for (const f of issue.fields) confidence[f] = "low";
    notes.push(issue.note);
  }

  return { ...merged, source_doc_id: docId, field_confidence: confidence, verification_notes: notes };
}
