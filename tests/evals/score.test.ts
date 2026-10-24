import { describe, expect, it } from "vitest";

import { abstainedCorrectly, median, rate, scoreEarnings, scoreMonths } from "../../evals/score";
import type { EarningsExtraction, MonthStatus } from "@/lib/schemas";

const truth: EarningsExtraction = {
  platform: "uber",
  period_start: "2026-11-02",
  period_end: "2026-11-08",
  gross_earnings: 412.5,
  tips: 40,
  platform_fees: 0,
  net_payout: 412.5,
  online_hours: 30,
  active_hours: 21.5,
  trips_or_deliveries: 38,
  unreadable_reason: null,
};

function month(overall: MonthStatus["overall"], gross: number): MonthStatus {
  return {
    month: "2026-11",
    gross_income: gross,
    net_income: gross,
    online_hours: 0,
    active_hours: 0,
    other_activity_hours: 0,
    meets_income_path: overall === "meets",
    meets_hours_path: false,
    overall,
    evidence_doc_ids: [],
    reasons: [],
    open_question_ids: [],
  };
}

describe("scoreEarnings", () => {
  it("accepts money within 50 cents and rejects larger misses", () => {
    const scores = scoreEarnings(truth, { ...truth, gross_earnings: 412.9, net_payout: 400 });
    expect(scores.find((s) => s.field === "gross_earnings")?.correct).toBe(true);
    expect(scores.find((s) => s.field === "net_payout")?.correct).toBe(false);
  });

  it("marks every field wrong when extraction abstained", () => {
    expect(scoreEarnings(truth, null).every((s) => !s.correct)).toBe(true);
  });
});

describe("abstainedCorrectly", () => {
  it("is null for readable documents and true when the pipeline abstains on unreadable ones", () => {
    expect(abstainedCorrectly(truth, truth)).toBeNull();
    const unreadable = { ...truth, unreadable_reason: "total cropped" };
    expect(abstainedCorrectly(unreadable, { ...truth, gross_earnings: null, net_payout: null })).toBe(true);
    expect(abstainedCorrectly(unreadable, truth)).toBe(false);
  });
});

describe("scoreMonths", () => {
  it("flags a false meets", () => {
    const [s] = scoreMonths(
      [{ month: "2026-11", gross_income: 579.99, net_income: 579.99, active_hours: 0, online_hours: 0, overall_expected: "does_not_meet" }],
      [month("meets", 579.99)],
    );
    expect(s.falseMeets).toBe(true);
    expect(s.statusCorrect).toBe(false);
    expect(s.totalWithinTolerance).toBe(true);
  });
});

describe("rate and median", () => {
  it("computes percentages and medians", () => {
    expect(rate([true, false, true, true]).pct).toBe(75);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});
