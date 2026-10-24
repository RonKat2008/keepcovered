import { CountyLetter, CountyLetterExtraction, type Confidence } from "@/lib/schemas";
import { callStructured, type Traced } from "../call";
import { docContent } from "../content";
import { systemFor } from "../prompts";
import { simulateFrom, truthLetter } from "../simulate";
import type { InputDoc } from "../types";

const MAX_TOKENS = 4000;
const LETTER_FIELDS = [
  "letter_type",
  "notice_date",
  "response_deadline",
  "requested_items",
  "months_requested",
  "language",
  "county_name",
] as const;

/** Pure: confidence per field. Only response_deadline is double-read; everything else is a single read. */
export function letterConfidence(
  primary: CountyLetterExtraction,
  secondary: CountyLetterExtraction | null,
): Record<string, Confidence> {
  const unreadable = primary.unreadable_reason !== null;
  const conf: Record<string, Confidence> = Object.fromEntries(
    LETTER_FIELDS.map((f) => [f, unreadable ? "low" : "medium"]),
  );
  const agree =
    secondary !== null && primary.response_deadline !== null && primary.response_deadline === secondary.response_deadline;
  conf.response_deadline = agree && !unreadable ? "high" : "low";
  return conf;
}

function readLetter(doc: InputDoc, route: "letter" | "extract_secondary") {
  return callStructured({
    route,
    task: route === "letter" ? "letter_primary" : "letter_secondary",
    system: systemFor("letter"),
    content: docContent(doc, "Extract the details of this county letter."),
    schema: CountyLetterExtraction,
    maxTokens: MAX_TOKENS,
    fixtureInput: doc.bytes,
    simulate: simulateFrom(doc.truthPath, truthLetter),
  });
}

export async function extractCountyLetter(doc: InputDoc): Promise<Traced<CountyLetter>> {
  let primary: Traced<CountyLetterExtraction>;
  let secondary: Traced<CountyLetterExtraction>;
  try {
    [primary, secondary] = await Promise.all([readLetter(doc, "letter"), readLetter(doc, "extract_secondary")]);
  } catch (err) {
    return { data: null, calls: [], error: (err as Error).message };
  }
  const calls = [...primary.calls, ...secondary.calls];
  const errors = [primary.error, secondary.error].filter(Boolean).join("; ") || undefined;
  if (!primary.data) return { data: null, calls, error: errors ?? "letter_unreadable" };

  const letter: CountyLetter = {
    ...primary.data,
    source_doc_id: doc.id,
    field_confidence: letterConfidence(primary.data, secondary.data),
  };
  return { data: CountyLetter.parse(letter), calls, error: errors };
}
