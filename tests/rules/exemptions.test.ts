import { describe, expect, it } from "vitest";
import { getScreenerQuestions, loadWorkRules, screenExemptions } from "@/rules";

const rules = loadWorkRules();

describe("screener", () => {
  const qs = getScreenerQuestions(rules);
  it("excludes county-checked automatic items", () => {
    const ids = qs.map((q) => q.id);
    expect(ids).not.toContain("high_unemployment_county");
    expect(ids).not.toContain("federal_disaster_county");
    expect(ids).toContain("medicare");
    expect(ids).toContain("inpatient_care");
    expect(ids).toContain("medically_frail");
  });
  it("has bilingual question and label for every item", () => {
    for (const q of qs) for (const v of [q.question_en, q.question_es, q.label_en, q.label_es]) expect(v.length).toBeGreaterThan(0);
  });
  it("maps answers to outcomes and never says exempt", () => {
    const out = screenExemptions({ medicare: "yes", pregnant_postpartum: "not_sure", incarcerated: "no" }, rules);
    const by = Object.fromEntries(out.map((o) => [o.id, o.outcome]));
    expect(by).toMatchObject({ medicare: "may_qualify", pregnant_postpartum: "ask_navigator", incarcerated: "not_indicated" });
    expect(out).toHaveLength(qs.length);
    expect(out.every((o) => ["may_qualify", "ask_navigator", "not_indicated"].includes(o.outcome))).toBe(true);
    expect(out.find((o) => o.id === "medicare")?.source).toMatchObject({ doc: "acwdl-25-30", page: 4 });
    expect(out.find((o) => o.id === "tanf_work_requirements")?.outcome).toBe("not_indicated");
  });
  it("answers for automatic items are ignored", () => {
    expect(screenExemptions({ high_unemployment_county: "yes" }, rules).some((o) => o.id === "high_unemployment_county")).toBe(false);
  });
  it("yields null source when a rule item has none", () => {
    const patched = { ...rules, mandatory_exemptions: [{ ...rules.mandatory_exemptions[1], source: undefined as never }] };
    expect(screenExemptions({}, patched)[0].source).toBeNull();
  });
  it("skips items lacking a screener question", () => {
    const patched = { ...rules, mandatory_exemptions: [{ ...rules.mandatory_exemptions[1], screener_question_en: null }] };
    expect(getScreenerQuestions(patched).map((q) => q.id)).not.toContain("medicare");
  });
});
