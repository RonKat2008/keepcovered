import { describe, expect, it } from "vitest";
import { allocateToMonths, computeMonthlyStatus, loadWorkRules, sixMonthAverage } from "@/rules";
import { act, empty, rec, txn } from "./fixtures";

const rules = loadWorkRules();
const M = "2027-03";
const one = (over: Parameters<typeof computeMonthlyStatus>[0] extends infer I ? Partial<I> : never) =>
  computeMonthlyStatus({ months: [M], ...empty, ...over }, rules)[0];

describe("rules json", () => {
  it("threshold equals 80 x federal minimum wage", () => {
    expect(rules.income_threshold_monthly).toBe(80 * rules.federal_minimum_wage_hourly);
    expect(rules.hours_threshold_monthly).toBe(80);
  });
});

describe("allocateToMonths", () => {
  it("returns one full share for a single-month period", () => {
    const [a, ...rest] = allocateToMonths(rec({ source_doc_id: "a", gross_earnings: 100, net_payout: 90, online_hours: 10, active_hours: 8 }));
    expect(rest).toHaveLength(0);
    expect(a).toMatchObject({ month: M, share: 1, gross: 100, net: 90, online: 10, active: 8, split: false });
  });
  it("splits pro rata by days and preserves totals", () => {
    const r = rec({ source_doc_id: "s", period_start: "2027-03-29", period_end: "2027-04-04", gross_earnings: 700, net_payout: 600, online_hours: 14, active_hours: 7 });
    const [m, a] = allocateToMonths(r);
    expect(m).toMatchObject({ month: "2027-03", gross: 300, net: 257.14, split: true });
    expect(m.share).toBeCloseTo(3 / 7);
    expect(a.gross).toBe(400);
    expect((m.net ?? 0) + (a.net ?? 0)).toBeCloseTo(600, 6);
    expect((m.online ?? 0) + (a.online ?? 0)).toBeCloseTo(14, 6);
  });
  it("keeps nulls null", () => {
    const [a] = allocateToMonths(rec({ source_doc_id: "n", gross_earnings: null, net_payout: null }));
    expect(a.gross).toBeNull();
    expect(a.online).toBeNull();
  });
  it("spans year boundaries", () => {
    const out = allocateToMonths(rec({ source_doc_id: "y", period_start: "2027-12-30", period_end: "2028-01-02", gross_earnings: 400, net_payout: 400 }));
    expect(out.map((x) => x.month)).toEqual(["2027-12", "2028-01"]);
  });
  it("returns [] for missing, malformed or inverted dates", () => {
    expect(allocateToMonths(rec({ source_doc_id: "x", period_start: null }))).toEqual([]);
    expect(allocateToMonths(rec({ source_doc_id: "x", period_end: null }))).toEqual([]);
    expect(allocateToMonths(rec({ source_doc_id: "x", period_start: "2027-02-30" }))).toEqual([]);
    expect(allocateToMonths(rec({ source_doc_id: "x", period_start: "2027-04-01", period_end: "2027-03-01" }))).toEqual([]);
  });
});

describe("income path", () => {
  it("meets when gross and net are both >= 580", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 900, net_payout: 700 })] });
    expect(s).toMatchObject({ meets_income_path: true, overall: "meets", gross_income: 900, net_income: 700, evidence_doc_ids: ["a"] });
    expect(s.reasons[0]).toEqual({ code: "income_met", params: { gross: 900 } });
  });
  it("exactly 580 meets", () => {
    expect(one({ records: [rec({ source_doc_id: "a", gross_earnings: 580, net_payout: 580 })] }).overall).toBe("meets");
  });
  it("579.99 gross never meets", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 579.99, net_payout: 579.99 })] });
    expect(s.overall).toBe("does_not_meet");
    expect(s.meets_income_path).toBe(false);
    expect(s.reasons).toContainEqual({ code: "income_short", params: { gross: 579.99, short_by: 0.01 } });
  });
  it("float noise cannot flip a short month to met", () => {
    const parts = [193.33, 193.33, 193.33].map((g, i) => rec({ source_doc_id: `p${i}`, gross_earnings: g, net_payout: g }));
    expect(one({ records: parts }).overall).toBe("does_not_meet");
  });
  it("gross met but net short is unsure (gross_vs_net)", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 700, net_payout: 500 })] });
    expect(s).toMatchObject({ overall: "unsure", meets_income_path: "depends_on_open_question", open_question_ids: ["gross_vs_net"] });
    expect(s.reasons).toContainEqual({ code: "gross_meets_net_short", params: { gross: 700, net: 500, threshold: 580 } });
  });
  it("missing net on a gross-meeting record is unsure, never meets", () => {
    expect(one({ records: [rec({ source_doc_id: "a", gross_earnings: 700, net_payout: null })] }).overall).toBe("unsure");
  });
  it("sums several records and ignores records outside the month", () => {
    const s = one({
      records: [
        rec({ source_doc_id: "a", period_start: "2027-03-01", period_end: "2027-03-15", gross_earnings: 300, net_payout: 300 }),
        rec({ source_doc_id: "b", period_start: "2027-03-16", period_end: "2027-03-31", gross_earnings: 300, net_payout: 290 }),
        rec({ source_doc_id: "c", period_start: "2027-02-01", period_end: "2027-02-28", gross_earnings: 9999, net_payout: 9999 }),
      ],
    });
    expect(s).toMatchObject({ gross_income: 600, net_income: 590, overall: "meets", evidence_doc_ids: ["a", "b"] });
  });
  it("records with no dates contribute nothing", () => {
    expect(one({ records: [rec({ source_doc_id: "a", period_start: null, gross_earnings: 900, net_payout: 900 })] }).overall).toBe("missing_data");
  });
  it("split records add a reason and count only their share", () => {
    const r = rec({ source_doc_id: "w", period_start: "2027-03-29", period_end: "2027-04-04", gross_earnings: 700, net_payout: 700 });
    const s = one({ records: [r] });
    expect(s.gross_income).toBe(300);
    expect(s.overall).toBe("does_not_meet");
    expect(s.reasons).toContainEqual({ code: "split_across_months", params: { doc_id: "w" } });
  });
});

describe("bank-labeled income", () => {
  it("counts toward gross and net with bank_only_income", () => {
    const s = one({ labeledIncome: [txn("t1", "2027-03-05", 400, "UBER"), txn("t2", "2027-03-20", 250.5, "UBER"), txn("t3", "2027-04-02", 999, "x")] });
    // Self-labeled deposits count toward totals but cannot make a month "meets" on their own.
    expect(s).toMatchObject({ gross_income: 650.5, net_income: 650.5, overall: "unsure", evidence_doc_ids: ["txn:t1", "txn:t2"] });
    expect(s.reasons).toContainEqual({ code: "bank_only_income", params: { amount: 650.5, count: 2 } });
  });
  it("adds to screenshot income but a month carried by labeled deposits is unsure", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 300, net_payout: 300 })], labeledIncome: [txn("t1", "2027-03-05", 280, "x")] });
    expect(s.gross_income).toBe(580);
    expect(s.overall).toBe("unsure");
  });
});

describe("hours path", () => {
  it("active >= 80 meets", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 100, net_payout: 100, online_hours: 100, active_hours: 80 })] });
    expect(s).toMatchObject({ meets_hours_path: true, meets_income_path: false, overall: "meets" });
    expect(s.reasons).toContainEqual({ code: "hours_met", params: { active: 80 } });
  });
  it("online-only 85h is unsure, never meets", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 100, net_payout: 100, online_hours: 85, active_hours: 50 })] });
    expect(s).toMatchObject({ overall: "unsure", meets_hours_path: "depends_on_open_question", open_question_ids: expect.arrayContaining(["hours_definition"]) });
    expect(s.reasons).toContainEqual({ code: "online_only_hours", params: { online: 85, active: 50 } });
  });
  it("79.96 active hours does not round up to 80", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 100, net_payout: 100, online_hours: 79.96, active_hours: 79.96 })] });
    expect(s.overall).toBe("does_not_meet");
    expect(s.active_hours).toBe(79.9);
  });
  it("short hours report the shortfall", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 100, net_payout: 100, online_hours: 40, active_hours: 30 })], activities: [act(M, "community_service", 10)] });
    expect(s.overall).toBe("does_not_meet");
    expect(s.reasons).toContainEqual({ code: "hours_short", params: { hours: 40, short_by: 40 } });
    expect(s.reasons).toContainEqual({ code: "combined_activities", params: { other_hours: 10 } });
    expect(s.open_question_ids).toContain("income_to_hours_conversion");
  });
  it("combines active hours with other activities", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 100, net_payout: 100, active_hours: 50 })], activities: [act(M, "community_service", 20), act(M, "work_program", 10), act("2027-04", "other_work", 500)] });
    expect(s).toMatchObject({ overall: "meets", other_activity_hours: 30 });
  });
  it("hours reached only with unconfirmed school hours are unsure", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 100, net_payout: 100, active_hours: 50 })], activities: [act(M, "education", 30)] });
    expect(s).toMatchObject({ overall: "unsure", meets_hours_path: "depends_on_open_question" });
    expect(s.reasons).toContainEqual({ code: "education_unconfirmed", params: {} });
    expect(s.open_question_ids).toContain("education_hours_in_combination");
    expect(s.reasons.some((r) => r.code === "online_only_hours")).toBe(false);
  });
  it("school hours on top of an already-met hours path do not downgrade it", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 0, net_payout: 0, active_hours: 90 })], activities: [act(M, "education", 10)] });
    expect(s.overall).toBe("meets");
    expect(s.reasons.some((r) => r.code === "education_unconfirmed")).toBe(true);
  });
  it("never converts income into hours", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 500, net_payout: 500, active_hours: 20 })] });
    expect(s.overall).toBe("does_not_meet");
  });
  it("activities alone are enough data", () => {
    expect(one({ activities: [act(M, "community_service", 85)] }).overall).toBe("meets");
  });
});

describe("overall and confidence", () => {
  it("month with nothing is missing_data", () => {
    const s = one({});
    expect(s).toMatchObject({ overall: "missing_data", meets_income_path: false, meets_hours_path: false, gross_income: 0 });
    expect(s.reasons).toEqual([expect.objectContaining({ code: "missing_month", params: {} }), expect.anything(), expect.anything()]);
  });
  it("low-confidence-only meets is unsure", () => {
    const r = rec({ source_doc_id: "lo", gross_earnings: 900, net_payout: 900, field_confidence: { gross_earnings: "low" } });
    const s = one({ records: [r] });
    expect(s.overall).toBe("unsure");
    expect(s.reasons).toContainEqual({ code: "low_confidence_excluded", params: { doc_id: "lo", field: "gross_earnings" } });
  });
  it("still meets when high-confidence evidence alone is enough", () => {
    const hi = rec({ source_doc_id: "hi", period_start: "2027-03-01", period_end: "2027-03-15", gross_earnings: 700, net_payout: 700 });
    const lo = rec({ source_doc_id: "lo", period_start: "2027-03-16", period_end: "2027-03-31", gross_earnings: 50, net_payout: 50, field_confidence: { net_payout: "low", active_hours: "low" } });
    const s = one({ records: [hi, lo] });
    expect(s.overall).toBe("meets");
    expect(s.reasons.filter((r) => r.code === "low_confidence_excluded")).toHaveLength(2);
  });
  it("medium confidence is trusted", () => {
    expect(one({ records: [rec({ source_doc_id: "m", gross_earnings: 900, net_payout: 900, field_confidence: { gross_earnings: "medium" } })] }).overall).toBe("meets");
  });
  it("low confidence on a non-critical field is trusted", () => {
    expect(one({ records: [rec({ source_doc_id: "m", gross_earnings: 900, net_payout: 900, field_confidence: { tips: "low" } })] }).overall).toBe("meets");
  });
  it("one path depending beats does_not_meet but not meets", () => {
    const s = one({ records: [rec({ source_doc_id: "a", gross_earnings: 900, net_payout: 900, online_hours: 90, active_hours: 10 })] });
    expect(s.overall).toBe("meets");
  });
  it("handles multiple months in order", () => {
    const out = computeMonthlyStatus({ months: ["2027-02", M], ...empty, records: [rec({ source_doc_id: "a", gross_earnings: 900, net_payout: 900 })] }, rules);
    expect(out.map((x) => [x.month, x.overall])).toEqual([["2027-02", "missing_data"], [M, "meets"]]);
  });
  it("is deterministic and does not mutate inputs", () => {
    const input = { months: [M], ...empty, records: [rec({ source_doc_id: "a", gross_earnings: 700, net_payout: 700 })] };
    const snapshot = JSON.stringify(input);
    expect(computeMonthlyStatus(input, rules)).toEqual(computeMonthlyStatus(input, rules));
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});

describe("sixMonthAverage", () => {
  const mk = (month: string, gross: number, overall: "meets" | "missing_data" = "meets") => ({ ...one({}), month, gross_income: gross, overall });
  it("averages a full window and meets", () => {
    const st = ["2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2027-06"].map((m, i) => mk(m, i % 2 ? 300 : 900));
    expect(sixMonthAverage(st, "2027-06", rules)).toEqual({ average_gross: 600, months_counted: 6, meets_average: true });
  });
  it("crosses year boundaries and ignores months outside the window", () => {
    const st = ["2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05", "2026-11"].map((m) => mk(m, 100));
    expect(sixMonthAverage(st, "2027-05", rules)).toEqual({ average_gross: 100, months_counted: 6, meets_average: false });
  });
  it("does not meet with missing months even if the average is high", () => {
    const st = [mk("2027-05", 2000), mk("2027-04", 0, "missing_data")];
    expect(sixMonthAverage(st, "2027-05", rules)).toEqual({ average_gross: 2000, months_counted: 1, meets_average: false });
  });
  it("handles no data", () => {
    expect(sixMonthAverage([], "2027-05", rules)).toEqual({ average_gross: 0, months_counted: 0, meets_average: false });
  });
});

describe("bank-only months", () => {
  it("treats a short month with only labeled bank deposits as missing statements, not does_not_meet", () => {
    const rules = loadWorkRules();
    const [m] = computeMonthlyStatus(
      { months: ["2027-03"], records: [], labeledIncome: [{ id: "t1", date: "2027-03-10", amount: 300, description: "DOORDASH" }], activities: [] },
      rules,
    );
    expect(m.overall).toBe("missing_data");
    expect(m.reasons.map((r) => r.code)).toEqual(expect.arrayContaining(["missing_month", "bank_only_income"]));
  });
});

describe("self-labeled deposits", () => {
  it("never lets labeled bank deposits alone push a month to meets", () => {
    const rules = loadWorkRules();
    const statement = rec({ source_doc_id: "s", period_start: "2027-03-01", period_end: "2027-03-31", gross_earnings: 521, net_payout: 431.66 });
    const [m] = computeMonthlyStatus(
      { months: ["2027-03"], records: [statement], labeledIncome: [txn("t1", "2027-03-10", 200, "DOORDASH")], activities: [] },
      rules,
    );
    expect(m.overall).toBe("unsure");
    expect(m.reasons.map((r) => r.code)).toContain("relies_on_bank_only_income");
  });
});

describe("unreadable documents", () => {
  it("turns a short month into unsure while a photo is unreadable", () => {
    const rules = loadWorkRules();
    const statement = rec({ source_doc_id: "s", period_start: "2027-03-01", period_end: "2027-03-31", gross_earnings: 260, net_payout: 230 });
    const [m] = computeMonthlyStatus({ months: ["2027-03"], records: [statement], labeledIncome: [], activities: [], unreadableDocIds: ["x"] }, rules);
    expect(m.overall).toBe("unsure");
    expect(m.reasons.map((r) => r.code)).toContain("unreadable_document");
  });
});
