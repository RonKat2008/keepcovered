import type { ExemptionAnswers, ExemptionScreen } from "@/lib/schemas";
import type { WorkRules } from "./workRules";

type Item = {
  id: string;
  label_en: string;
  label_es: string;
  question_en: string;
  question_es: string;
  source: ExemptionScreen["source"];
};

/** Self-reportable items only. Items the county checks automatically (open question exemption_classification) are skipped. */
function selfReportable(rules: WorkRules): Item[] {
  const mandatory = rules.mandatory_exemptions.flatMap((e) =>
    e.automatic || !e.screener_question_en || !e.screener_question_es
      ? []
      : [{ id: e.id, label_en: e.label_en, label_es: e.label_es, question_en: e.screener_question_en, question_es: e.screener_question_es, source: e.source }],
  );
  const hardships = rules.short_term_hardship.items.map((e) => ({
    id: e.id,
    label_en: e.label_en,
    label_es: e.label_es,
    question_en: e.screener_question_en,
    question_es: e.screener_question_es,
    source: e.source,
  }));
  return [...mandatory, ...hardships];
}

export function getScreenerQuestions(
  rules: WorkRules,
): Array<{ id: string; question_en: string; question_es: string; label_en: string; label_es: string }> {
  return selfReportable(rules).map(({ id, question_en, question_es, label_en, label_es }) => ({ id, question_en, question_es, label_en, label_es }));
}

/** Screening only: the outcome is never "exempt". The county decides. */
export function screenExemptions(answers: ExemptionAnswers, rules: WorkRules): ExemptionScreen[] {
  return selfReportable(rules).map((item) => {
    const answer = answers[item.id];
    return {
      id: item.id,
      outcome: answer === "yes" ? "may_qualify" : answer === "not_sure" ? "ask_navigator" : "not_indicated",
      label_en: item.label_en,
      label_es: item.label_es,
      source: item.source ? { doc: item.source.doc, page: item.source.page, quote: item.source.quote } : null,
    };
  });
}
