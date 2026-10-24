// Code-side verification: after the agent asks for human submit, read back every form value from
// the DOM and compare it to what the rules engine produced. Claude never decides "ok".
import path from "node:path";
import type { CaseResult, MonthStatus, Platform } from "@/lib/schemas";
import { DEMO_APPLICANT, PORTAL_IDS, type Applicant, type FieldDiff } from "./types";
import type { FormReadback } from "./executor";

const PLATFORM_LABEL: Record<Platform, string> = {
  uber: "Uber",
  lyft: "Lyft",
  doordash: "DoorDash",
  instacart: "Instacart",
  other: "Other",
};
const MONEY_TOLERANCE = 0.005;

/** Latest month that "meets"; else the latest month. Months are YYYY-MM so string order is date order. */
export function pickReportMonth(months: readonly MonthStatus[]): MonthStatus | null {
  if (months.length === 0) return null;
  const sorted = [...months].sort((a, b) => b.month.localeCompare(a.month));
  return sorted.find((m) => m.overall === "meets") ?? sorted[0];
}

function formatHours(h: number): string {
  const r = Math.floor(h * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function platformsFor(result: CaseResult, month: MonthStatus): string {
  const evidence = new Set(month.evidence_doc_ids);
  const inMonth = (d: string | null) => (d ? d.slice(0, 7) === month.month : false);
  const set = new Set<string>();
  for (const r of result.records) {
    const linked = evidence.size > 0 ? evidence.has(r.source_doc_id) : inMonth(r.period_start) || inMonth(r.period_end);
    if (linked && r.platform) set.add(PLATFORM_LABEL[r.platform]);
  }
  return [...set].sort().join(", ");
}

/** The exact strings the portal form should hold, derived only from the rules engine's CaseResult. */
export function expectedPortalValues(result: CaseResult, applicant: Applicant = DEMO_APPLICANT): Record<string, string> {
  const month = pickReportMonth(result.months);
  if (!month) throw new Error("No months in the case result; nothing to report.");
  return {
    full_name: applicant.full_name,
    case_number: applicant.case_number,
    report_month: month.month,
    income_amount: month.gross_income.toFixed(2),
    hours_worked: formatHours(month.active_hours),
    platforms: platformsFor(result, month),
  };
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const asNumber = (s: string): number | null => {
  const t = s.replace(/[$,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
};
const asList = (s: string) =>
  s
    .split(/[,;]/)
    .map(norm)
    .filter(Boolean)
    .sort()
    .join(",");

export function valuesMatch(field: string, expected: string, actual: string): boolean {
  if (field === "platforms") return asList(expected) === asList(actual);
  const en = asNumber(expected);
  const an = asNumber(actual);
  if (en !== null && an !== null) return Math.abs(en - an) < MONEY_TOLERANCE;
  return norm(expected) === norm(actual);
}

/**
 * One row per expected field plus the uploaded packet. When both the input and the Review-page
 * text exist they must agree with each other as well as with the packet.
 */
export function computeDiff(
  expected: Record<string, string>,
  readback: FormReadback,
  packetPath: string,
  onReviewPage: boolean,
): FieldDiff[] {
  const rows: FieldDiff[] = Object.entries(expected).map(([field, packet]) => {
    const rb = readback[field] ?? { input: null, review: null };
    const shown = rb.review ?? rb.input ?? "";
    const consistent = rb.input === null || rb.review === null || valuesMatch(field, rb.input, rb.review);
    const form = consistent ? shown : `${rb.input} (review shows ${rb.review})`;
    return { field, packet, form, ok: consistent && (rb.review !== null || rb.input !== null) && valuesMatch(field, packet, shown) };
  });
  const fileName = path.basename(packetPath);
  const file = readback[PORTAL_IDS.fileInput] ?? { input: null, review: null };
  const shownFile = file.review ?? file.input ?? "";
  rows.push({ field: PORTAL_IDS.fileInput, packet: fileName, form: shownFile, ok: shownFile.includes(fileName) });
  rows.push({ field: "review_page", packet: "shown", form: onReviewPage ? "shown" : "not shown", ok: onReviewPage });
  return rows;
}

export const diffOk = (diff: readonly FieldDiff[]): boolean => diff.length > 0 && diff.every((d) => d.ok);
