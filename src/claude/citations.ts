// Maps Messages API text blocks + search_result_location citations to ExplanationSpan[].
import type Anthropic from "@anthropic-ai/sdk";
import type { Citation, ExplanationSpan } from "@/lib/schemas";
import type { RuleChunk } from "./types";

/** search_result `source` strings are `${source_id}#p${page}`. */
export function chunkSource(chunk: Pick<RuleChunk, "source_id" | "page">): string {
  return `${chunk.source_id}#p${chunk.page}`;
}

export function parseSource(source: string): { source_id: string; page: number | null } {
  const match = /^(.*)#p(\d+)$/.exec(source);
  return match ? { source_id: match[1], page: Number(match[2]) } : { source_id: source, page: null };
}

function mapCitation(c: Anthropic.TextCitation, chunks: readonly RuleChunk[]): Citation | null {
  if (c.type !== "search_result_location") return null;
  const chunk = chunks[c.search_result_index];
  const parsed = parseSource(c.source);
  const fromChunk = chunk && chunkSource(chunk) === c.source ? chunk : undefined;
  return {
    source_id: fromChunk?.source_id ?? parsed.source_id,
    title: c.title ?? fromChunk?.title ?? parsed.source_id,
    page: fromChunk?.page ?? parsed.page,
    cited_text: c.cited_text,
  };
}

/** Keeps only text blocks (thinking blocks are dropped). Empty uncited blocks are skipped. */
export function mapCitedResponse(content: readonly Anthropic.ContentBlock[], chunks: readonly RuleChunk[]): ExplanationSpan[] {
  const spans: ExplanationSpan[] = [];
  for (const block of content) {
    if (block.type !== "text") continue;
    const citations = (block.citations ?? [])
      .map((c) => mapCitation(c, chunks))
      .filter((c): c is Citation => c !== null);
    if (block.text.length === 0 && citations.length === 0) continue;
    spans.push({ text: block.text, citations });
  }
  return spans;
}
