import { describe, expect, it } from "vitest";
import type { EarningsExtraction } from "@/lib/schemas";
import { arithmeticChecks, buildRecord, compareReadings, fieldsAgree } from "@/claude/verify";

const base: EarningsExtraction = {
  platform: "uber",
  period_start: "2026-09-01",
  period_end: "2026-09-07",
  gross_earnings: 500,
  tips: 40,
  platform_fees: 100,
  net_payout: 400,
  online_hours: 30,
  active_hours: 22.5,
  trips_or_deliveries: 41,
  unreadable_reason: null,
};

describe("fieldsAgree", () => {
  it("allows money within $0.50 and hours within 0.25", () => {
    expect(fieldsAgree("net_payout", 400, 400.5)).toBe(true);
    expect(fieldsAgree("net_payout", 400, 400.51)).toBe(false);
    expect(fieldsAgree("online_hours", 30, 30.25)).toBe(true);
    expect(fieldsAgree("online_hours", 30, 30.3)).toBe(false);
  });
  it("requires exact dates, platform and counts; null only matches null", () => {
    expect(fieldsAgree("period_end", "2026-09-07", "2026-09-08")).toBe(false);
    expect(fieldsAgree("trips_or_deliveries", 41, 41)).toBe(true);
    expect(fieldsAgree("tips", null, null)).toBe(true);
    expect(fieldsAgree("tips", null, 0)).toBe(false);
  });
});

describe("compareReadings", () => {
  it("lists only disagreeing fields", () => {
    expect(compareReadings(base, { ...base, net_payout: 410, tips: 40.2 })).toEqual(["net_payout"]);
  });
});

describe("arithmeticChecks", () => {
  it("passes a consistent record", () => {
    expect(arithmeticChecks(base)).toEqual([]);
  });
  it("flags gross - fees != net beyond $1", () => {
    expect(arithmeticChecks({ ...base, net_payout: 398.9 })[0].fields).toContain("net_payout");
    expect(arithmeticChecks({ ...base, net_payout: 399.2 })).toEqual([]);
  });
  it("skips the net check when a value is missing", () => {
    expect(arithmeticChecks({ ...base, platform_fees: null, net_payout: 1 })).toEqual([]);
  });
  it("flags tips > gross, reversed dates and periods over 31 days", () => {
    expect(arithmeticChecks({ ...base, tips: 600 }).some((i) => i.fields.includes("tips"))).toBe(true);
    expect(arithmeticChecks({ ...base, period_end: "2026-08-30" })).toHaveLength(1);
    expect(arithmeticChecks({ ...base, period_end: "2026-10-03" })).toHaveLength(1);
    expect(arithmeticChecks({ ...base, period_end: "2026-10-02" })).toEqual([]);
  });
});

describe("buildRecord", () => {
  it("agreement + clean arithmetic gives high everywhere", () => {
    const r = buildRecord({ docId: "d1", primary: base, secondary: { ...base, net_payout: 400.3 }, adjudicated: null });
    expect(new Set(Object.values(r.field_confidence))).toEqual(new Set(["high"]));
    expect(r.net_payout).toBe(400);
    expect(r.source_doc_id).toBe("d1");
  });

  it("adjudicated value matching a reader gives medium", () => {
    const r = buildRecord({
      docId: "d1",
      primary: { ...base, online_hours: 31 },
      secondary: base,
      adjudicated: base,
    });
    expect(r.online_hours).toBe(30);
    expect(r.field_confidence.online_hours).toBe("medium");
    expect(r.field_confidence.gross_earnings).toBe("high");
    expect(r.verification_notes.join(" ")).toMatch(/online hours/);
  });

  it("adjudicated value matching neither reader gives low", () => {
    const r = buildRecord({
      docId: "d1",
      primary: { ...base, online_hours: 31 },
      secondary: { ...base, online_hours: 32 },
      adjudicated: { ...base, online_hours: 35 },
    });
    expect(r.field_confidence.online_hours).toBe("low");
    expect(r.online_hours).toBe(35);
  });

  it("failed arithmetic forces the involved fields to low even when readers agree", () => {
    const bad = { ...base, net_payout: 350 };
    const r = buildRecord({ docId: "d1", primary: bad, secondary: bad, adjudicated: null });
    expect(r.field_confidence.net_payout).toBe("low");
    expect(r.field_confidence.gross_earnings).toBe("low");
    expect(r.field_confidence.online_hours).toBe("high");
    expect(r.verification_notes.some((n) => n.includes("take-home pay"))).toBe(true);
  });

  it("disagreement with failed tie-break keeps the primary value at low", () => {
    const r = buildRecord({ docId: "d1", primary: { ...base, tips: 10 }, secondary: base, adjudicated: null });
    expect(r.tips).toBe(10);
    expect(r.field_confidence.tips).toBe("low");
  });

  it("unreadable gives all-null fields, a reason, and low confidence", () => {
    const blank = Object.fromEntries(Object.keys(base).map((k) => [k, null])) as EarningsExtraction;
    const u = { ...blank, unreadable_reason: "too blurry" };
    const r = buildRecord({ docId: "d1", primary: u, secondary: u, adjudicated: null });
    expect(r.unreadable_reason).toBe("too blurry");
    expect(r.gross_earnings).toBeNull();
    expect(new Set(Object.values(r.field_confidence))).toEqual(new Set(["low"]));
    expect(r.verification_notes.join(" ")).toMatch(/sharper photo/);
  });

  it("single reader marks everything low", () => {
    const r = buildRecord({ docId: "d1", primary: base, secondary: null, adjudicated: null });
    expect(r.field_confidence.gross_earnings).toBe("low");
    expect(r.gross_earnings).toBe(500);
  });
});
