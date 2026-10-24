import type Anthropic from "@anthropic-ai/sdk";
import { ExplanationSpan, type Lang, type MonthStatus } from "@/lib/schemas";
import { callCited, simulatedMeta, type Traced } from "../call";
import { chunkSource, mapCitedResponse } from "../citations";
import { fixtureKey } from "../fixtures";
import { systemFor } from "../prompts";
import type { ExplainFacts, RuleChunk } from "../types";

const MAX_TOKENS = 6000;

export type ExplainInput = { facts: ExplainFacts; chunks: RuleChunk[]; lang: Lang };

export function searchResultBlocks(chunks: readonly RuleChunk[]): Anthropic.SearchResultBlockParam[] {
  return chunks.map((chunk) => ({
    type: "search_result",
    source: chunkSource(chunk),
    title: `${chunk.title} (page ${chunk.page})`,
    content: [{ type: "text", text: chunk.text }],
    citations: { enabled: true },
  }));
}

function instruction(facts: ExplainFacts, lang: Lang): string {
  const language = lang === "es" ? "Spanish" : "English";
  return [
    "<facts> (computed by the rules engine; restate them, do not change them)",
    JSON.stringify(facts, null, 2),
    "</facts>",
    `Write the explanation in ${language}.`,
  ].join("\n");
}

export async function explainCase({ facts, chunks, lang }: ExplainInput): Promise<Traced<ExplanationSpan[]>> {
  const content: Anthropic.ContentBlockParam[] = [...searchResultBlocks(chunks), { type: "text", text: instruction(facts, lang) }];
  const fixtureInput = JSON.stringify({ facts, chunks: chunks.map((c) => c.id), lang });
  const result = await callCited({ route: "explain", task: "explain", system: systemFor("explain"), content, maxTokens: MAX_TOKENS, fixtureInput });

  if (result.data) {
    const spans = mapCitedResponse(result.data, chunks).map((s) => ExplanationSpan.parse(s));
    return { data: spans, calls: result.calls };
  }
  if (result.error !== "no_fixture") return { data: null, calls: result.calls, error: result.error };

  const spans = simulateExplanation(facts, chunks, lang);
  const chars = spans.reduce((n, s) => n + s.text.length, 0);
  const inputTokens = 900 + chunks.reduce((n, c) => n + Math.round(c.text.length / 4), 0);
  return { data: spans, calls: [simulatedMeta("explain", fixtureKey("explain", fixtureInput), chars, inputTokens)] };
}

// ---------- Simulated explanation (deterministic EN/ES template) ----------

const COPY = {
  en: {
    intro: "Here is what we found in your papers. This is not legal advice. The county decides if you meet the rule.",
    income: "One way to meet the rule is to earn at least $580 in a month.",
    hours: "Another way is to work at least 80 hours in a month.",
    lookback: "The county looks at the month before you apply, called the look-back month.",
    month: (m: MonthStatus, status: string) =>
      `For ${m.month}, your papers show $${m.gross_income.toFixed(2)} in earnings and ${m.online_hours.toFixed(1)} online hours. ${status}`,
    status: {
      meets: "These numbers look like they reach the amount in the rule, but the county decides.",
      does_not_meet: "These numbers look lower than the amount in the rule. The county decides, and other activities may count.",
      unsure: "We are not sure about this month. A navigator can help.",
      missing_data: "We do not have papers for this month yet. Please add them if you can.",
    } as Record<MonthStatus["overall"], string>,
    deadline: (d: string) => `Please respond to the county by ${d}. Do not wait, even if you are unsure.`,
    noDeadline: "Please respond to the county by the date on your letter. Do not wait, even if you are unsure.",
    navigator: "Some things are unclear, so we suggest you talk to a free navigator before you send your papers.",
  },
  es: {
    intro: "Esto es lo que encontramos en sus papeles. Esto no es consejo legal. El condado decide si usted cumple la regla.",
    income: "Una forma de cumplir la regla es ganar al menos $580 en un mes.",
    hours: "Otra forma es trabajar al menos 80 horas en un mes.",
    lookback: "El condado revisa el mes antes de su solicitud, llamado el mes de revisión.",
    month: (m: MonthStatus, status: string) =>
      `En ${m.month}, sus papeles muestran $${m.gross_income.toFixed(2)} en ganancias y ${m.online_hours.toFixed(1)} horas en línea. ${status}`,
    status: {
      meets: "Estos números parecen llegar a la cantidad de la regla, pero el condado decide.",
      does_not_meet: "Estos números parecen menores que la cantidad de la regla. El condado decide, y otras actividades pueden contar.",
      unsure: "No estamos seguros sobre este mes. Un navegador le puede ayudar.",
      missing_data: "Todavía no tenemos papeles de este mes. Por favor agréguelos si puede.",
    } as Record<MonthStatus["overall"], string>,
    deadline: (d: string) => `Por favor responda al condado antes del ${d}. No espere, aunque no esté seguro.`,
    noDeadline: "Por favor responda al condado antes de la fecha en su carta. No espere, aunque no esté seguro.",
    navigator: "Algunas cosas no están claras, así que le sugerimos hablar con un navegador gratuito antes de enviar sus papeles.",
  },
} as const;

function citeFirst(chunks: readonly RuleChunk[], needle: RegExp): ExplanationSpan["citations"] {
  const chunk = chunks.find((c) => needle.test(c.text));
  if (!chunk) return [];
  const match = needle.exec(chunk.text);
  const at = match?.index ?? 0;
  const start = Math.max(0, at - 120);
  const cited = chunk.text.slice(start, Math.min(chunk.text.length, at + 160)).trim();
  return [{ source_id: chunk.source_id, title: chunk.title, page: chunk.page, cited_text: cited }];
}

/** Deterministic, citation-backed explanation. Rule sentences appear only when a chunk supports them. */
export function simulateExplanation(facts: ExplainFacts, chunks: readonly RuleChunk[], lang: Lang): ExplanationSpan[] {
  const t = COPY[lang];
  const spans: ExplanationSpan[] = [{ text: t.intro, citations: [] }];
  const ruleLines: [string, RegExp][] = [
    [t.income, /\$?580/],
    [t.hours, /80\s+hours/i],
    [t.lookback, /look-?back/i],
  ];
  for (const [text, needle] of ruleLines) {
    const citations = citeFirst(chunks, needle);
    if (citations.length > 0) spans.push({ text, citations });
  }
  for (const m of facts.months ?? []) spans.push({ text: t.month(m, t.status[m.overall]), citations: [] });

  const deadline = facts.letter?.response_deadline ?? facts.deadlines?.find((d) => d.kind === "respond_to_letter")?.date;
  spans.push({ text: deadline ? t.deadline(deadline) : t.noDeadline, citations: [] });

  const unsure = (facts.months ?? []).some((m) => m.overall === "unsure" || m.overall === "missing_data");
  if (facts.needs_navigator || unsure) spans.push({ text: t.navigator, citations: [] });
  return spans;
}
