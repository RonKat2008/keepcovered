import { describe, expect, test } from "vitest";
import { computeDiff, diffOk, expectedPortalValues, valuesMatch } from "@/agent/portal/diff";
import { makeCaseResult } from "./helpers";

describe("expectedPortalValues", () => {
  test("picks the latest month that meets and formats values from the rules engine output", () => {
    const v = expectedPortalValues(makeCaseResult());
    expect(v).toEqual({
      full_name: "Demo Driver",
      case_number: "DEMO-0000",
      report_month: "2026-04",
      income_amount: "1210.50",
      hours_worked: "92.2",
      platforms: "DoorDash, Uber",
    });
  });

  test("falls back to the latest month when none meets", () => {
    const r = makeCaseResult();
    const months = r.months.map((m) => ({ ...m, overall: "does_not_meet" as const }));
    expect(expectedPortalValues({ ...r, months }).report_month).toBe("2026-05");
  });

  test("throws when there are no months", () => {
    expect(() => expectedPortalValues({ ...makeCaseResult(), months: [] })).toThrow();
  });
});

describe("computeDiff", () => {
  const expected = { income_amount: "1210.50", platforms: "DoorDash, Uber" };
  const fileRow = { proof_packet: { input: "packet.pdf", review: "packet.pdf" } };

  test("all ok when readback matches (number and list normalisation)", () => {
    const diff = computeDiff(
      expected,
      { income_amount: { input: "1,210.5", review: "$1,210.50" }, platforms: { input: "uber, doordash", review: null }, ...fileRow },
      "/tmp/packet.pdf",
      true,
    );
    expect(diff.every((d) => d.ok)).toBe(true);
    expect(diffOk(diff)).toBe(true);
  });

  test("mismatch, missing field, input/review disagreement and missing review page all fail", () => {
    const diff = computeDiff(
      expected,
      { income_amount: { input: "1210.50", review: "1210.00" }, ...fileRow },
      "/tmp/packet.pdf",
      false,
    );
    const byField = Object.fromEntries(diff.map((d) => [d.field, d.ok]));
    expect(byField).toEqual({ income_amount: false, platforms: false, proof_packet: true, review_page: false });
    expect(diffOk(diff)).toBe(false);
  });

  test("valuesMatch is strict on text", () => {
    expect(valuesMatch("report_month", "2026-04", "2026-05")).toBe(false);
    expect(valuesMatch("full_name", "Demo Driver", " demo  driver ")).toBe(true);
  });
});
