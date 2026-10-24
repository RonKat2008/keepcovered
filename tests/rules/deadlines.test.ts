import { describe, expect, it } from "vitest";
import { buildDeadlines, loadWorkRules, toIcs } from "@/rules";
import type { CountyLetter } from "@/lib/schemas";

const rules = loadWorkRules();
const letter = (deadline: string | null): CountyLetter => ({
  letter_type: "work_rule_notice", notice_date: "2026-12-01", response_deadline: deadline, requested_items: [], months_requested: [], language: "en", county_name: "Alameda", unreadable_reason: null, source_doc_id: "L", field_confidence: {},
});

describe("buildDeadlines", () => {
  it("builds letter deadline, reminder, rule start and next monthly report, sorted", () => {
    const d = buildDeadlines({ letter: letter("2026-12-20"), today: "2026-12-01", months: [] }, rules);
    expect(d.map((x) => [x.date, x.kind])).toEqual([
      ["2026-12-13", "reminder"],
      ["2026-12-20", "respond_to_letter"],
      ["2027-01-01", "monthly_report"],
      ["2027-01-01", "rule_start"],
    ]);
    expect(d.map((x) => x.id)).toEqual(["reminder-2026-12-13", "respond_to_letter-2026-12-20", "monthly_report-2027-01", "rule_start-2027-01-01"]);
    expect(buildDeadlines({ letter: letter("2026-12-20"), today: "2026-12-01", months: [] }, rules)).toEqual(d);
  });
  it("skips reminder when it is not in the future", () => {
    const d = buildDeadlines({ letter: letter("2026-12-05"), today: "2026-12-01", months: [] }, rules);
    expect(d.some((x) => x.kind === "reminder")).toBe(false);
    expect(d.some((x) => x.kind === "respond_to_letter")).toBe(true);
  });
  it("handles no letter, null or invalid deadline, and a rule start in the past", () => {
    for (const l of [null, letter(null), letter("2026-13-45")]) {
      const d = buildDeadlines({ letter: l, today: "2027-02-10", months: [] }, rules);
      expect(d.map((x) => x.kind)).toEqual(["monthly_report"]);
      expect(d[0].date).toBe("2027-03-01");
    }
  });
  it("rolls the monthly report over a year end", () => {
    expect(buildDeadlines({ letter: null, today: "2027-12-15", months: [] }, rules).find((x) => x.kind === "monthly_report")?.date).toBe("2028-01-01");
  });
  it("keeps a rule start that is today", () => {
    expect(buildDeadlines({ letter: null, today: "2027-01-01", months: [] }, rules).some((x) => x.kind === "rule_start")).toBe(true);
  });
  it("omits rule start when key date is missing", () => {
    expect(buildDeadlines({ letter: null, today: "2026-01-01", months: [] }, { ...rules, key_dates: [] }).some((x) => x.kind === "rule_start")).toBe(false);
  });
  it("sorts equal dates by id", () => {
    const d = buildDeadlines({ letter: letter("2027-01-01"), today: "2026-12-01", months: [] }, rules);
    const same = d.filter((x) => x.date === "2027-01-01").map((x) => x.id);
    expect(same).toEqual([...same].sort());
  });
});

describe("toIcs", () => {
  const ds = buildDeadlines({ letter: letter("2026-12-20"), today: "2026-12-01", months: [] }, rules);
  it("produces a valid, CRLF-delimited, stable calendar", () => {
    const ics = toIcs(ds, "en", "2026-12-01T08:30:15.123Z");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(ds.length);
    expect(ics).toContain("DTSTAMP:20261201T083015Z");
    expect(ics).toContain("DTSTART;VALUE=DATE:20261220\r\nDTEND;VALUE=DATE:20261221");
    expect(ics).toContain("UID:respond_to_letter-2026-12-20@keepcovered.app");
    expect(toIcs(ds, "en", "2026-12-01T08:30:15.123Z")).toBe(ics);
  });
  it("defaults DTSTAMP deterministically and handles empty input", () => {
    expect(toIcs(ds, "en")).toContain("DTSTAMP:20261213T000000Z");
    expect(toIcs([], "en")).toBe("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//KeepCovered//Deadlines//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nEND:VCALENDAR\r\n");
  });
  it("uses Spanish titles, escapes text and folds long lines at 75 octets", () => {
    const d = [{ id: "x", date: "2027-01-31", title_en: "a", title_es: "Envíe, guarde; todo\\ñ " + "á".repeat(80), kind: "reminder" as const }];
    const ics = toIcs(d, "es", "2027-01-01T00:00:00Z");
    expect(ics).toContain("DTEND;VALUE=DATE:20270201");
    expect(ics).toContain("SUMMARY:Envíe\\, guarde\; todo\\\\ñ");
    for (const line of ics.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("á".repeat(80));
  });
  it("escapes newlines", () => {
    const ics = toIcs([{ id: "n", date: "2027-01-01", title_en: "a\nb", title_es: "", kind: "reminder" }], "en", "2027-01-01T00:00:00Z");
    expect(ics).toContain("SUMMARY:a\\nb");
  });
});
