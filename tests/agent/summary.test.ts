import { describe, expect, it } from "vitest";

import { caseMonths, navigatorReasons } from "@/agent/summary";
import type { CountyLetter, EarningsRecord, MonthStatus } from "@/lib/schemas";

const record = (start: string, end: string): EarningsRecord => ({
  platform: "uber",
  period_start: start,
  period_end: end,
  gross_earnings: 100,
  tips: null,
  platform_fees: null,
  net_payout: 100,
  online_hours: null,
  active_hours: null,
  trips_or_deliveries: null,
  unreadable_reason: null,
  source_doc_id: "d",
  field_confidence: {},
  verification_notes: [],
});

describe("caseMonths", () => {
  it("fills gaps between the earliest and latest month so missing months show up", () => {
    expect(caseMonths(null, [record("2026-08-03", "2026-08-09"), record("2026-11-02", "2026-11-08")], "2026-12-01")).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });

  it("includes months the county asked about even without records", () => {
    const letter = { months_requested: ["2026-10", "2026-11"] } as CountyLetter;
    expect(caseMonths(letter, [record("2026-09-07", "2026-09-13")], "2026-12-01")).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("defaults to the three months before today when nothing is known", () => {
    expect(caseMonths(null, [], "2027-02-15")).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
});

describe("navigatorReasons", () => {
  it("routes unsure and missing months to a navigator", () => {
    const m = (month: string, overall: MonthStatus["overall"]) => ({ month, overall }) as MonthStatus;
    const reasons = navigatorReasons([m("2026-10", "unsure"), m("2026-11", "missing_data"), m("2026-12", "meets")], [], 1);
    expect(reasons).toHaveLength(3);
    expect(navigatorReasons([m("2026-12", "meets")], [], 0)).toEqual([]);
  });
});
