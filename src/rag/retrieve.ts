import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { BM25 } from "./bm25";
import { loadChunks } from "./chunk";
import { cosine, embedTexts, hasVoyageKey } from "../embeddings/voyage";
import type { RuleChunk, RuleIndex } from "./types";

const RRF_K = 60;

type Loaded = { index: RuleIndex; bm25: BM25 };
let cache: Loaded | null = null;

function load(): Loaded {
  if (cache) return cache;
  const file = path.join(process.cwd(), "data", "rules", "index.json");
  let index: RuleIndex;
  if (existsSync(file)) index = JSON.parse(readFileSync(file, "utf8")) as RuleIndex;
  else index = { chunks: loadChunks(), embeddings: null, model: null };
  cache = { index, bm25: new BM25(index.chunks) };
  return cache;
}

/** For tests: drop the cached index. */
export function resetRetrieveCache(): void {
  cache = null;
}

/** Reciprocal rank fusion over ranked lists of chunk indexes. */
export function rrf(lists: number[][], k = RRF_K): Map<number, number> {
  const scores = new Map<number, number>();
  for (const list of lists) list.forEach((idx, rank) => scores.set(idx, (scores.get(idx) ?? 0) + 1 / (k + rank + 1)));
  return scores;
}

async function rankLists(query: string, L: Loaded): Promise<number[][]> {
  const lists: number[][] = [L.bm25.rank(query).slice(0, 30).map((r) => r.index)];
  if (L.index.embeddings && hasVoyageKey()) {
    try {
      const qv = (await embedTexts([query], "query"))?.[0];
      if (qv) {
        const sims = L.index.embeddings.map((e, i) => ({ i, s: cosine(qv, e) }));
        lists.push(sims.sort((a, b) => b.s - a.s).slice(0, 30).map((x) => x.i));
      }
    } catch {
      // vector side is best-effort; BM25 still answers
    }
  }
  return lists;
}

function finish(scores: Map<number, number>, chunks: RuleChunk[], k: number): RuleChunk[] {
  const seen = new Set<string>();
  const out: RuleChunk[] = [];
  for (const [idx, score] of [...scores].sort((a, b) => b[1] - a[1])) {
    const c = chunks[idx];
    const key = c.text.slice(0, 120);
    if (seen.has(c.id) || seen.has(key)) continue;
    seen.add(c.id);
    seen.add(key);
    out.push({ ...c, score });
    if (out.length >= k) break;
  }
  return out;
}

export async function retrieve(query: string, k = 6): Promise<RuleChunk[]> {
  const L = load();
  return finish(rrf(await rankLists(query, L)), L.index.chunks, k);
}

export const CASE_QUERIES = [
  "income $580 gross per month",
  "80 hours per month work or self-employment",
  "look-back month verification",
  "exemptions parent of child age 13 or under",
  "30 days to respond to notice",
];

export async function retrieveForCase(topics: string[] = [], k = 8): Promise<RuleChunk[]> {
  const L = load();
  const queries = [...CASE_QUERIES, ...topics];
  const lists = (await Promise.all(queries.map((q) => rankLists(q, L)))).flat();
  return finish(rrf(lists), L.index.chunks, k);
}
