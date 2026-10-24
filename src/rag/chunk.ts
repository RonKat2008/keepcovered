import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { RuleChunk } from "./types";

export const MIN_WORDS = 120;
export const MAX_WORDS = 220;

type PageText = { file: string; totalPages: number; pages: { page: number; text: string }[] };

/** Split one page into chunks of roughly MIN..MAX words, breaking at sentence ends. Never crosses pages. */
export function chunkPage(text: string, minWords = MIN_WORDS, maxWords = MAX_WORDS): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?;:]+(?:[.!?;:]+|$)\s*/g) ?? [clean];
  const chunks: string[] = [];
  let cur: string[] = [];
  let count = 0;
  const flush = () => {
    if (cur.length) chunks.push(cur.join(" ").trim());
    cur = [];
    count = 0;
  };
  for (const s of sentences) {
    const words = s.trim().split(" ").filter(Boolean);
    if (!words.length) continue;
    if (words.length > maxWords) {
      flush();
      for (let i = 0; i < words.length; i += maxWords) chunks.push(words.slice(i, i + maxWords).join(" "));
      continue;
    }
    if (count + words.length > maxWords && count > 0) flush();
    cur.push(words.join(" "));
    count += words.length;
  }
  if (count > 0) {
    // Merge a short tail into the previous chunk if it fits.
    const prev = chunks[chunks.length - 1];
    if (count < minWords / 2 && prev && prev.split(" ").length + count <= maxWords) {
      chunks[chunks.length - 1] = `${prev} ${cur.join(" ")}`.trim();
    } else flush();
  }
  return chunks;
}

export function chunkDocument(sourceId: string, title: string, doc: PageText): RuleChunk[] {
  const out: RuleChunk[] = [];
  for (const p of doc.pages) {
    chunkPage(p.text).forEach((text, i) => {
      out.push({ id: `${sourceId}-p${p.page}-c${i + 1}`, source_id: sourceId, title, page: p.page, text });
    });
  }
  return out;
}

export function loadChunks(rulesDir = path.join(process.cwd(), "data", "rules")): RuleChunk[] {
  const rules = JSON.parse(readFileSync(path.join(rulesDir, "work_rules.json"), "utf8")) as {
    sources: { id: string; title: string }[];
  };
  const titles = new Map(rules.sources.map((s) => [s.id, s.title]));
  const textDir = path.join(rulesDir, "text");
  const chunks: RuleChunk[] = [];
  for (const f of readdirSync(textDir).filter((x) => x.endsWith(".json")).sort()) {
    const id = f.replace(/\.json$/, "");
    const doc = JSON.parse(readFileSync(path.join(textDir, f), "utf8")) as PageText;
    chunks.push(...chunkDocument(id, titles.get(id) ?? id, doc));
  }
  return chunks;
}
