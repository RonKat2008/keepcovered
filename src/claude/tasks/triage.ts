import { TriageResult } from "@/lib/schemas";
import { callStructured, type StructuredArgs, type Traced } from "../call";
import { docContent } from "../content";
import { systemFor } from "../prompts";
import { simulateFrom, truthTriage } from "../simulate";
import type { InputDoc } from "../types";

const MAX_TOKENS = 2000;

/** Call args for triage. Throws UnsupportedDocError for unsupported file types. */
export function triageArgs(doc: InputDoc): StructuredArgs<TriageResult> {
  return {
    route: "triage",
    task: "triage",
    system: systemFor("triage"),
    content: docContent(doc, "Classify this document."),
    schema: TriageResult,
    maxTokens: MAX_TOKENS,
    fixtureInput: doc.bytes,
    simulate: simulateFrom(doc.truthPath, truthTriage),
  };
}

export async function triageDocument(doc: InputDoc): Promise<Traced<TriageResult>> {
  let args;
  try {
    args = triageArgs(doc);
  } catch (err) {
    return { data: null, calls: [], error: (err as Error).message };
  }
  return callStructured(args);
}
