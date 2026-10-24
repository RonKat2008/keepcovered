// Simulator: turns the generator's ground-truth sidecar into what a perfect reader would return.
import {
  CountyLetterExtraction,
  DocKind,
  EarningsExtraction,
  TriageResult,
  type CountyLetterExtraction as CountyLetterExtractionT,
  type EarningsExtraction as EarningsExtractionT,
  type TriageResult as TriageResultT,
} from "@/lib/schemas";
import { readTruth } from "./fixtures";
import type { TruthSidecar } from "./types";

const EARNINGS_KEYS = Object.keys(EarningsExtraction.shape) as (keyof EarningsExtractionT)[];

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

export function truthEarnings(truth: TruthSidecar): EarningsExtractionT | null {
  const src = obj(truth.extraction) ?? obj(truth.earnings) ?? truth;
  if (!EARNINGS_KEYS.some((k) => k !== "unreadable_reason" && k in src)) return null;
  const filled = Object.fromEntries(EARNINGS_KEYS.map((k) => [k, src[k] ?? null]));
  const parsed = EarningsExtraction.safeParse(filled);
  return parsed.success ? parsed.data : null;
}

export function truthLetter(truth: TruthSidecar): CountyLetterExtractionT | null {
  const src = obj(truth.letter) ?? truth;
  if (!("letter_type" in src) && !("response_deadline" in src)) return null;
  const parsed = CountyLetterExtraction.safeParse({
    letter_type: src.letter_type ?? "other",
    notice_date: src.notice_date ?? null,
    response_deadline: src.response_deadline ?? null,
    requested_items: src.requested_items ?? [],
    months_requested: src.months_requested ?? [],
    language: src.language ?? "en",
    county_name: src.county_name ?? null,
    unreadable_reason: src.unreadable_reason ?? null,
  });
  return parsed.success ? parsed.data : null;
}

export function truthTriage(truth: TruthSidecar): TriageResultT | null {
  const explicit = TriageResult.safeParse(truth.triage);
  if (explicit.success) return explicit.data;
  const kind = DocKind.safeParse(truth.kind ?? truth.doc_kind);
  const earnings = truthEarnings(truth);
  const letter = truthLetter(truth);
  const resolvedKind = kind.success ? kind.data : earnings ? "earnings_screenshot" : letter ? "county_letter" : null;
  if (!resolvedKind) return null;
  const unreadable = earnings?.unreadable_reason ?? letter?.unreadable_reason ?? null;
  const language = letter?.language ?? (truth.language === "es" ? "es" : "en");
  return {
    kind: resolvedKind,
    platform: earnings?.platform ?? null,
    language,
    is_readable: unreadable === null,
    reason: unreadable ?? "Simulated from synthetic ground truth.",
  };
}

export function simulateFrom<T>(truthPath: string | undefined, pick: (t: TruthSidecar) => T | null): () => T | null {
  return () => {
    const truth = readTruth(truthPath);
    return truth ? pick(truth) : null;
  };
}
