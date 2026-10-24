// Shared types for the Claude layer. Other lanes (RAG, orchestrator) import from here.
import type { CountyLetter, Deadline, MonthStatus } from "@/lib/schemas";

/** One uploaded document. `truthPath` points at the generator's `<image>.truth.json` sidecar (synthetic data only). */
export type InputDoc = {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
  truthPath?: string;
};

/** A retrieved rule chunk. Built by src/rag; passed to explainCase as search_result blocks. */
export type RuleChunk = {
  id: string;
  source_id: string;
  title: string;
  page: number;
  text: string;
  score?: number;
};

/** Rule-engine outputs handed to explainCase. All decisions here were made by code. */
export type ExplainFacts = {
  months?: MonthStatus[];
  deadlines?: Deadline[];
  letter?: CountyLetter | null;
  needs_navigator?: boolean;
  navigator_reasons?: string[];
  [key: string]: unknown;
};

/**
 * Accepted shapes for the `<image>.truth.json` sidecar (simulated mode):
 *  - a flat EarningsExtraction or CountyLetterExtraction object, or
 *  - `{ kind?, triage?, extraction? | earnings?, letter? }`.
 * Missing extraction fields are treated as null.
 */
export type TruthSidecar = Record<string, unknown>;
