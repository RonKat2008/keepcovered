import { describe, expect, it } from "vitest";
import { CaseResult } from "@/lib/schemas";
import { hasCopy } from "@/lib/i18n";
import demoCase from "../../fixtures/demo-case.json";

describe("fixtures/demo-case.json", () => {
  it("parses against the CaseResult contract", () => {
    const parsed = CaseResult.safeParse(demoCase);
    expect(parsed.success, JSON.stringify(parsed.error?.issues, null, 2)).toBe(true);
  });

  it("covers the demo story: two months meet, October is unsure, four deposit questions", () => {
    const result = CaseResult.parse(demoCase);
    expect(result.months.map((m) => [m.month, m.overall])).toEqual([
      ["2026-09", "meets"],
      ["2026-10", "unsure"],
      ["2026-11", "meets"],
    ]);
    expect(result.letter?.response_deadline).toBe("2026-12-08");
    expect(result.questions).toHaveLength(4);
    expect(result.questions.every((q) => q.kind === "label_deposit")).toBe(true);
    expect(result.needs_navigator).toBe(true);
  });

  it("has UI copy for every reason code it uses", () => {
    const result = CaseResult.parse(demoCase);
    const codes = result.months.flatMap((m) => m.reasons.map((r) => r.code));
    for (const code of codes) expect(hasCopy(`reason.${code}`), code).toBe(true);
  });
});
