import type { RuleChunk } from "./types";

const STOP = new Set(
  ("a an the and or but of to in on at by for with from as is are was were be been being it its this that these those " +
    "if then than so not no do does did has have had will would can could may might shall should must which who whom what when where " +
    "el la los las un una unos unas y o pero de del al en con por para como es son fue ser se su sus lo que si no mas " +
    "yo tu mi me te le les nos ya muy").split(/\s+/),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9$%\s]/g, " ")
    .replace(/\$/g, " usd ")
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOP.has(t) && (t.length > 1 || /\d/.test(t)));
}

export class BM25 {
  private tf: Map<string, number>[] = [];
  private len: number[] = [];
  private df = new Map<string, number>();
  private avg = 0;
  constructor(private chunks: RuleChunk[], private k1 = 1.4, private b = 0.75) {
    for (const c of chunks) {
      const toks = tokenize(`${c.title} ${c.text}`);
      const m = new Map<string, number>();
      for (const t of toks) m.set(t, (m.get(t) ?? 0) + 1);
      this.tf.push(m);
      this.len.push(toks.length);
      for (const t of m.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avg = this.len.reduce((a, b) => a + b, 0) / Math.max(1, this.len.length);
  }

  /** Returns indexes into chunks with positive score, best first. */
  rank(query: string): { index: number; score: number }[] {
    const q = [...new Set(tokenize(query))];
    const N = this.chunks.length;
    const out: { index: number; score: number }[] = [];
    for (let i = 0; i < N; i++) {
      let score = 0;
      for (const t of q) {
        const f = this.tf[i].get(t);
        if (!f) continue;
        const n = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += (idf * f * (this.k1 + 1)) / (f + this.k1 * (1 - this.b + (this.b * this.len[i]) / this.avg));
      }
      if (score > 0) out.push({ index: i, score });
    }
    return out.sort((a, b) => b.score - a.score);
  }
}
