import { TriageResult } from "@/lib/schemas";
import { callStructured, type Traced } from "../call";
import { docContent } from "../content";
import { systemFor } from "../prompts";
import { simulateFrom, truthTriage } from "../simulate";
import type { InputDoc } from "../types";

const MAX_TOKENS = 2000;

export async function triageDocument(doc: InputDoc): Promise<Traced<TriageResult>> {
  let content;
  try {
    content = docContent(doc, "Classify this document.");
  } catch (err) {
    return { data: null, calls: [], error: (err as Error).message };
  }
  return callStructured({
    route: "triage",
    task: "triage",
    system: systemFor("triage"),
    content,
    schema: TriageResult,
    maxTokens: MAX_TOKENS,
    fixtureInput: doc.bytes,
    simulate: simulateFrom(doc.truthPath, truthTriage),
  });
}
