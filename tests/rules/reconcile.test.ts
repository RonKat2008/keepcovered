import { describe, expect, it } from "vitest";
import { reconcile } from "@/rules";
import type { DepositLabel, PayerSuggestion } from "@/lib/schemas";
import { rec, txn } from "./fixtures";

const base = { transactions: [], labels: {} as Record<string, DepositLabel>, suggestions: [] as PayerSuggestion[] };
const week = (id: string, start: string, end: string, gross: number, extra = {}) =>
  rec({ source_doc_id: id, period_start: start, period_end: end, gross_earnings: gross, net_payout: gross, ...extra });

describe("dedupe", () => {
  it("drops same platform, period and amount (keeps first by doc id)", () => {
    const r = reconcile({ ...base, records: [week("b", "2027-03-01", "2027-03-07", 100.005), week("a", "2027-03-01", "2027-03-07", 100)] });
    expect(r.records.map((x) => x.source_doc_id)).toEqual(["a"]);
    expect(r.duplicates).toEqual([{ kept_doc_id: "a", dropped_doc_ids: ["b"], reason: "same platform, period and amount" }]);
  });
  it("keeps same period when amounts differ, other platforms, or null platform/dates", () => {
    const r = reconcile({
      ...base,
      records: [
        week("a", "2027-03-01", "2027-03-07", 100),
        week("b", "2027-03-01", "2027-03-07", 150),
        week("c", "2027-03-01", "2027-03-07", 100, { platform: "lyft" }),
        week("d", "2027-03-01", "2027-03-07", 100, { platform: null }),
        week("e", "2027-03-01", "2027-03-07", 100, { platform: null }),
        week("f", "2027-03-01", "2027-03-07", 100, { period_start: null }),
        week("g", "2027-03-01", "2027-03-07", null as unknown as number, { gross_earnings: null }),
        week("h", "2027-03-01", "2027-03-07", null as unknown as number, { gross_earnings: null }),
      ],
    });
    expect(r.records).toHaveLength(8);
    expect(r.duplicates).toEqual([]);
  });
  it("drops a weekly summary contained in a monthly one, either order", () => {
    const monthly = week("m", "2027-03-01", "2027-03-31", 1000);
    const weekly = week("w", "2027-03-08", "2027-03-14", 250);
    for (const records of [[monthly, weekly], [weekly, monthly]]) {
      const r = reconcile({ ...base, records });
      expect(r.records.map((x) => x.source_doc_id)).toEqual([records[0].source_doc_id === "m" ? "m" : "m"]);
      expect(r.duplicates).toEqual([{ kept_doc_id: "m", dropped_doc_ids: ["w"], reason: "weekly summary already inside monthly summary" }]);
    }
  });
  it("merges several contained weeklies into one group", () => {
    const r = reconcile({ ...base, records: [week("m", "2027-03-01", "2027-03-31", 1000), week("w1", "2027-03-01", "2027-03-07", 100), week("w2", "2027-03-08", "2027-03-14", 100)] });
    expect(r.duplicates).toEqual([{ kept_doc_id: "m", dropped_doc_ids: ["w1", "w2"], reason: "weekly summary already inside monthly summary" }]);
  });
  it("keeps partially overlapping periods", () => {
    const r = reconcile({ ...base, records: [week("a", "2027-03-01", "2027-03-10", 100), week("b", "2027-03-08", "2027-03-14", 100)] });
    expect(r.records).toHaveLength(2);
    expect(r.duplicates).toEqual([]);
  });
  it("preserves input order of kept records", () => {
    const r = reconcile({ ...base, records: [week("z", "2027-03-01", "2027-03-07", 10), week("a", "2027-04-01", "2027-04-07", 10)] });
    expect(r.records.map((x) => x.source_doc_id)).toEqual(["z", "a"]);
  });
});

describe("matching payouts", () => {
  const r1 = week("r1", "2027-03-01", "2027-03-07", 400);
  it("matches a single deposit within $1 inside the window", () => {
    const r = reconcile({ ...base, records: [r1], transactions: [txn("t1", "2027-03-09", 399.5, "UBER PAYOUT")] });
    expect(r.matches).toEqual([{ source_doc_id: "r1", txn_ids: ["t1"], amount_diff: -0.5 }]);
    expect(r.unmatched_deposits).toEqual([]);
    expect(r.user_labeled_income).toEqual([]);
  });
  it("prefers the closest single deposit", () => {
    const r = reconcile({ ...base, records: [r1], transactions: [txn("t1", "2027-03-08", 400.8, "UBER"), txn("t2", "2027-03-09", 400.1, "UBER")] });
    expect(r.matches[0].txn_ids).toEqual(["t2"]);
    expect(r.unmatched_deposits.map((x) => x.id)).toEqual(["t1"]);
  });
  it("does not match outside the window, wrong platform, wrong amount or not_driving", () => {
    const r = reconcile({
      ...base,
      records: [r1],
      labels: { t4: "not_driving" },
      transactions: [
        txn("t1", "2027-03-06", 400, "UBER"),
        txn("t2", "2027-03-15", 400, "UBER"),
        txn("t3", "2027-03-09", 400, "LYFT"),
        txn("t4", "2027-03-09", 400, "UBER"),
        txn("t5", "2027-03-09", 390, "UBER"),
      ],
    });
    expect(r.matches).toEqual([]);
  });
  it("matches by suggestion when the descriptor is opaque", () => {
    const r = reconcile({ ...base, records: [r1], transactions: [txn("t1", "2027-03-10", 400, "ACH CREDIT 8841")], suggestions: [{ txn_id: "t1", platform: "uber", similarity: 0.9 }] });
    expect(r.matches[0].txn_ids).toEqual(["t1"]);
  });
  it("recognizes every platform pattern", () => {
    const mk = (id: string, p: "lyft" | "doordash" | "instacart", desc: string) => ({ rec: week(id, "2027-03-01", "2027-03-07", 100, { platform: p }), t: txn(`t-${id}`, "2027-03-08", 100, desc) });
    const items = [mk("a", "lyft", "Lyft Inc"), mk("b", "doordash", "DASHER DIRECT"), mk("c", "instacart", "MAPLEBEAR INC")];
    const r = reconcile({ ...base, records: items.map((i) => i.rec), transactions: items.map((i) => i.t) });
    expect(r.matches).toHaveLength(3);
  });
  it("matches instant payouts as a subset sum", () => {
    const txns = [txn("t1", "2027-03-08", 120, "DOORDASH"), txn("t2", "2027-03-08", 130, "DOORDASH"), txn("t3", "2027-03-09", 149.6, "DOORDASH"), txn("t9", "2027-03-09", 55, "DOORDASH")];
    const r = reconcile({ ...base, records: [week("r", "2027-03-01", "2027-03-07", 400, { platform: "doordash" })], transactions: txns });
    expect(r.matches).toEqual([{ source_doc_id: "r", txn_ids: ["t1", "t2", "t3"], amount_diff: -0.4 }]);
    expect(r.unmatched_deposits.map((x) => x.id)).toEqual(["t9"]);
  });
  it("prefers fewer deposits then closer sums, and fails when no subset fits", () => {
    const fits = reconcile({ ...base, records: [week("r", "2027-03-01", "2027-03-07", 300)], transactions: [txn("a", "2027-03-08", 100, "UBER"), txn("b", "2027-03-08", 100, "UBER"), txn("c", "2027-03-08", 100, "UBER"), txn("d", "2027-03-08", 150, "UBER"), txn("e", "2027-03-08", 150.3, "UBER")] });
    expect(fits.matches[0].txn_ids).toEqual(["d", "e"].sort());
    const none = reconcile({ ...base, records: [week("r", "2027-03-01", "2027-03-07", 300)], transactions: [txn("a", "2027-03-08", 100, "UBER"), txn("b", "2027-03-08", 50, "UBER")] });
    expect(none.matches).toEqual([]);
  });
  it("prefers the closer of two equal-size subsets", () => {
    const r = reconcile({ ...base, records: [week("r", "2027-03-01", "2027-03-07", 200)], transactions: [txn("a", "2027-03-08", 100.9, "UBER"), txn("b", "2027-03-08", 99.7, "UBER"), txn("c", "2027-03-08", 100, "UBER")] });
    expect(r.matches[0].txn_ids).toEqual(["b", "c"]);
  });
  it("limits subset search to seven deposits", () => {
    const eight = Array.from({ length: 8 }, (_, i) => txn(`t${i}`, "2027-03-08", 10, "UBER"));
    const r = reconcile({ ...base, records: [week("r", "2027-03-01", "2027-03-07", 80)], transactions: eight });
    expect(r.matches).toEqual([]);
  });
  it("each deposit matches at most once", () => {
    const a = week("a", "2027-03-01", "2027-03-07", 400);
    const b = week("b", "2027-03-02", "2027-03-08", 400);
    const r = reconcile({ ...base, records: [a, b], transactions: [txn("t1", "2027-03-09", 400, "UBER")] });
    expect(r.matches).toEqual([{ source_doc_id: "a", txn_ids: ["t1"], amount_diff: 0 }]);
  });
  it("skips records without payout, dates or platform", () => {
    const r = reconcile({
      ...base,
      records: [week("a", "2027-03-01", "2027-03-07", 400, { net_payout: null }), week("b", "2027-03-01", "2027-03-07", 400, { net_payout: 0 }), week("c", "2027-03-01", "2027-03-07", 400, { period_end: null }), week("d", "2027-03-01", "2027-03-07", 400, { platform: null })],
      transactions: [txn("t1", "2027-03-08", 400, "UBER")],
    });
    expect(r.matches).toEqual([]);
  });
});

describe("unmatched and labeled deposits", () => {
  const txns = [
    txn("d1", "2027-03-10", 200, "ZELLE FROM JOSE"),
    txn("d2", "2027-03-11", 300, "VENMO"),
    txn("d3", "2027-03-12", 50, "TRANSFER FROM SAVINGS"),
    txn("d4", "2027-03-12", 10, "Interest paid"),
    txn("d5", "2027-03-12", 40, "Refund AMAZON"),
    txn("d6", "2027-03-13", -75, "RENT"),
    txn("d7", "2027-03-14", 500, "CASH APP"),
    txn("d8", "2027-03-15", 60, "UNKNOWN LABELED"),
  ];
  it("lists unlabeled positive income-like deposits with suggestions, nothing else", () => {
    const r = reconcile({ ...base, records: [], transactions: txns, labels: { d2: "driving", d7: "not_driving", d8: "unknown" }, suggestions: [{ txn_id: "d1", platform: "uber", similarity: 0.5 }] });
    expect(r.unmatched_deposits.map((x) => [x.id, x.suggestion?.platform ?? null])).toEqual([["d1", "uber"], ["d8", null]]);
    expect(r.user_labeled_income.map((x) => x.id)).toEqual(["d2"]);
  });
  it("never double counts: a matched deposit labeled driving is not extra income", () => {
    const r = reconcile({ ...base, records: [week("r", "2027-03-01", "2027-03-07", 400)], transactions: [txn("t1", "2027-03-08", 400, "UBER"), txn("t2", "2027-03-20", 90, "CASH")], labels: { t1: "driving", t2: "driving" } });
    expect(r.matches[0].txn_ids).toEqual(["t1"]);
    expect(r.user_labeled_income.map((x) => x.id)).toEqual(["t2"]);
    const ids = [...r.matches.flatMap((m) => m.txn_ids), ...r.user_labeled_income.map((x) => x.id), ...r.unmatched_deposits.map((x) => x.id)];
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("ignores non-positive driving labels", () => {
    const r = reconcile({ ...base, records: [], transactions: [txn("n", "2027-03-01", -5, "x"), txn("z", "2027-03-01", 0, "x")], labels: { n: "driving", z: "driving" } });
    expect(r.user_labeled_income).toEqual([]);
  });
  it("does not mutate inputs", () => {
    const records = [week("b", "2027-03-01", "2027-03-07", 1), week("a", "2027-03-01", "2027-03-07", 1)];
    const t = [txn("t2", "2027-03-08", 1, "UBER"), txn("t1", "2027-03-08", 1, "UBER")];
    const snap = JSON.stringify([records, t]);
    reconcile({ ...base, records, transactions: t });
    expect(JSON.stringify([records, t])).toBe(snap);
  });
});
