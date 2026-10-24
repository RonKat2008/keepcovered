import type { BankTransaction, Platform, PayerSuggestion } from "../lib/schemas";
import { cosine, embedTexts, hasVoyageKey } from "../embeddings/voyage";

export const SIMILARITY_THRESHOLD = 0.55;
const K = 3;

type Label = Platform | null;
export const SEED_DESCRIPTORS: ReadonlyArray<readonly [string, Label]> = [
  ["UBER TECHNOLOGIES PAYOUT", "uber"],
  ["UBER *EATS PAYOUT", "uber"],
  ["UBER USA 8005928996 PAYMENT", "uber"],
  ["UBER DRIVER WEEKLY DEPOSIT", "uber"],
  ["UBER BV TRIP EARNINGS", "uber"],
  ["LYFT INC DIRECT DEP", "lyft"],
  ["LYFT RIDES PAYMENT", "lyft"],
  ["LYFT DRIVER PAYOUT EXPRESS", "lyft"],
  ["LYFT *DRIVER EARNINGS", "lyft"],
  ["DOORDASH DASHER DIRECT", "doordash"],
  ["DD DOORDASH INSTANT", "doordash"],
  ["DOORDASH INC PAYMENT", "doordash"],
  ["DOORDASH DRIVE PAYOUT", "doordash"],
  ["DOORDASH*DASHER FAST PAY", "doordash"],
  ["MAPLEBEAR INSTACART", "instacart"],
  ["INSTACART SHOPPER PAYMENT", "instacart"],
  ["MAPLEBEAR INC DIRECT DEP", "instacart"],
  ["INSTACART FAST PAYOUT", "instacart"],
  ["GRUBHUB HOLDINGS PAYMENT", "other"],
  ["SPARK DRIVER WALMART PAYOUT", "other"],
  ["SHIPT INC PAYMENT", "other"],
  ["AMAZON FLEX DIRECT DEP", "other"],
  ["PAYROLL ACME CORP DIRECT DEP", "other"],
  ["ADP PAYROLL DEPOSIT", "other"],
  ["GUSTO PAYROLL NET PAY", "other"],
  ["PAYCHEX DIRECT DEPOSIT", "other"],
  ["SALARY DEPOSIT EMPLOYER", "other"],
  ["VENMO PAYMENT FROM FRIEND", null],
  ["VENMO *CASHOUT", null],
  ["ZELLE FROM MARIA GARCIA", null],
  ["ZELLE PAYMENT FROM JOHN", null],
  ["CASH APP*TRANSFER", null],
  ["PAYPAL TRANSFER", null],
  ["IRS TREAS 310 TAX REF", null],
  ["EDD UI BENEFIT PAYMENT", null],
  ["SSA TREAS 310 XXSOC SEC", null],
  ["TRANSFER FROM SAVINGS", null],
  ["ATM CASH DEPOSIT", null],
  ["MOBILE CHECK DEPOSIT", null],
  ["INTEREST PAID", null],
  ["REFUND AMAZON.COM", null],
  ["CALFRESH EBT DEPOSIT", null],
];

// ---- Keyless vectorizer: character trigram term-frequency vectors ----
export function normalizeDescriptor(s: string): string {
  return s.toUpperCase().replace(/[^A-Z\s]/g, " ").replace(/\s+/g, " ").trim();
}

export function trigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of normalizeDescriptor(s).split(" ").filter(Boolean)) {
    const p = `^${w}$`;
    for (let i = 0; i + 3 <= p.length; i++) {
      const g = p.slice(i, i + 3);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
  }
  return out;
}

export function sparseCosine(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0, na = 0, nb = 0;
  for (const [g, v] of a) {
    na += v * v;
    const w = b.get(g);
    if (w) dot += v * w;
  }
  for (const v of b.values()) nb += v * v;
  return na === 0 || nb === 0 ? 0 : dot / Math.sqrt(na * nb);
}

type Neighbor = { sim: number; label: Label };

function vote(neighbors: Neighbor[]): { platform: Label; similarity: number } {
  const top = [...neighbors].sort((a, b) => b.sim - a.sim).slice(0, K);
  if (!top.length) return { platform: null, similarity: 0 };
  const tally = new Map<Label, number>();
  for (const n of top) tally.set(n.label, (tally.get(n.label) ?? 0) + 1);
  let best: Label = top[0].label;
  let bestCount = 0;
  for (const [label, c] of tally) {
    // majority; ties go to the nearest neighbor's label
    if (c > bestCount || (c === bestCount && label === top[0].label)) {
      best = label;
      bestCount = c;
    }
  }
  const similarity = top[0].sim;
  return { platform: similarity < SIMILARITY_THRESHOLD ? null : best, similarity };
}

let seedVectors: number[][] | null = null;

async function voyageNeighbors(descs: string[]): Promise<Neighbor[][] | null> {
  if (!hasVoyageKey()) return null;
  try {
    seedVectors ??= await embedTexts(SEED_DESCRIPTORS.map(([t]) => t), "document");
    const qs = await embedTexts(descs, "query");
    if (!seedVectors || !qs) return null;
    return qs.map((q) => seedVectors!.map((s, i) => ({ sim: cosine(q, s), label: SEED_DESCRIPTORS[i][1] })));
  } catch {
    return null; // fall back to trigram path
  }
}

function trigramNeighbors(descs: string[]): Neighbor[][] {
  const seeds = SEED_DESCRIPTORS.map(([t, label]) => ({ v: trigrams(t), label }));
  return descs.map((d) => {
    const v = trigrams(d);
    return seeds.map((s) => ({ sim: sparseCosine(v, s.v), label: s.label }));
  });
}

export async function suggestPayers(txns: BankTransaction[]): Promise<PayerSuggestion[]> {
  const descs = txns.map((t) => t.description);
  const neighbors = (await voyageNeighbors(descs)) ?? trigramNeighbors(descs);
  return txns.map((t, i) => {
    const { platform, similarity } = vote(neighbors[i]);
    return { txn_id: t.id, platform, similarity: Math.round(similarity * 1000) / 1000 };
  });
}
