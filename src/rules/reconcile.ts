import type {
  BankTransaction,
  DepositLabel,
  EarningsRecord,
  PayerSuggestion,
  Platform,
  ReconcileResult,
} from "@/lib/schemas";
import { addDays, round2 } from "./util";

type Input = {
  records: EarningsRecord[];
  transactions: BankTransaction[];
  labels: Record<string, DepositLabel>;
  suggestions: PayerSuggestion[];
};

const PLATFORM_PATTERNS: Partial<Record<Platform, RegExp>> = {
  uber: /UBER/i,
  lyft: /LYFT/i,
  doordash: /DOORDASH|DASHER/i,
  instacart: /INSTACART|MAPLEBEAR/i,
};
const NON_INCOME = /REFUND|TRANSFER FROM SAVINGS|INTEREST/i;
const PAYOUT_WINDOW_DAYS = 7;
const AMOUNT_TOLERANCE = 1;
const DUP_TOLERANCE = 0.01;
const MAX_SUBSET_SIZE = 7;
const MAX_SUBSET_CANDIDATES = 14;

type Period = { start: string; end: string };
const periodOf = (r: EarningsRecord): Period | null =>
  r.period_start && r.period_end ? { start: r.period_start, end: r.period_end } : null;
const samePeriod = (a: Period, b: Period) => a.start === b.start && a.end === b.end;
const contains = (outer: Period, inner: Period) => outer.start <= inner.start && inner.end <= outer.end;

type Drop = { kept: string; dropped: string; reason: string };

function dedupe(records: EarningsRecord[]): { kept: EarningsRecord[]; duplicates: ReconcileResult["duplicates"] } {
  const ordered = [...records].sort((a, b) => (a.source_doc_id < b.source_doc_id ? -1 : a.source_doc_id > b.source_doc_id ? 1 : 0));
  let kept: EarningsRecord[] = [];
  const drops: Drop[] = [];

  for (const rec of ordered) {
    const p = periodOf(rec);
    const rivals = p === null || rec.platform === null ? [] : kept.filter((k) => k.platform === rec.platform && periodOf(k) !== null);

    const exact = rivals.find((k) => {
      const kp = periodOf(k)!;
      return (
        samePeriod(kp, p!) &&
        k.gross_earnings !== null &&
        rec.gross_earnings !== null &&
        Math.abs(k.gross_earnings - rec.gross_earnings) <= DUP_TOLERANCE
      );
    });
    if (exact) {
      drops.push({ kept: exact.source_doc_id, dropped: rec.source_doc_id, reason: "same platform, period and amount" });
      continue;
    }
    const outer = rivals.find((k) => !samePeriod(periodOf(k)!, p!) && contains(periodOf(k)!, p!));
    if (outer) {
      drops.push({ kept: outer.source_doc_id, dropped: rec.source_doc_id, reason: "weekly summary already inside monthly summary" });
      continue;
    }
    const inner = rivals.filter((k) => !samePeriod(periodOf(k)!, p!) && contains(p!, periodOf(k)!));
    for (const k of inner) {
      drops.push({ kept: rec.source_doc_id, dropped: k.source_doc_id, reason: "weekly summary already inside monthly summary" });
    }
    kept = [...kept.filter((k) => !inner.includes(k)), rec];
  }

  const keptIds = new Set(kept.map((k) => k.source_doc_id));
  const groups = new Map<string, { kept_doc_id: string; dropped_doc_ids: string[]; reason: string }>();
  for (const d of drops) {
    const key = `${d.kept}|${d.reason}`;
    const g = groups.get(key) ?? { kept_doc_id: d.kept, dropped_doc_ids: [], reason: d.reason };
    groups.set(key, { ...g, dropped_doc_ids: [...g.dropped_doc_ids, d.dropped] });
  }
  return {
    kept: records.filter((r) => keptIds.has(r.source_doc_id)),
    duplicates: [...groups.values()].filter((g) => keptIds.has(g.kept_doc_id)),
  };
}

function bestSubset(candidates: BankTransaction[], target: number): BankTransaction[] | null {
  const pool = candidates.slice(0, MAX_SUBSET_CANDIDATES);
  let best: { set: BankTransaction[]; diff: number } | null = null;
  const walk = (i: number, chosen: BankTransaction[], total: number) => {
    if (chosen.length >= 2) {
      const diff = Math.abs(total - target);
      if (diff <= AMOUNT_TOLERANCE && (best === null || chosen.length < best.set.length || (chosen.length === best.set.length && diff < best.diff)))
        best = { set: chosen, diff };
    }
    if (chosen.length === MAX_SUBSET_SIZE) return;
    for (let j = i; j < pool.length; j++) walk(j + 1, [...chosen, pool[j]], total + pool[j].amount);
  };
  walk(0, [], 0);
  return (best as { set: BankTransaction[] } | null)?.set ?? null;
}

export function reconcile(input: Input): ReconcileResult {
  const { kept, duplicates } = dedupe(input.records);
  const suggestionById = new Map(input.suggestions.map((s) => [s.txn_id, s]));
  const incomeLike = input.transactions
    .filter((t) => t.amount > 0 && !NON_INCOME.test(t.description))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const matchedIds = new Set<string>();
  const matches: ReconcileResult["matches"] = [];

  for (const rec of kept) {
    if (rec.net_payout === null || rec.net_payout <= 0 || rec.period_end === null || rec.platform === null) continue;
    const platform = rec.platform;
    const from = rec.period_end;
    const to = addDays(rec.period_end, PAYOUT_WINDOW_DAYS);
    const pattern = PLATFORM_PATTERNS[platform];
    const candidates = incomeLike.filter(
      (t) =>
        !matchedIds.has(t.id) &&
        input.labels[t.id] !== "not_driving" &&
        t.date >= from &&
        t.date <= to &&
        ((pattern?.test(t.description) ?? false) || suggestionById.get(t.id)?.platform === platform),
    );
    const net = rec.net_payout;
    const singles = candidates
      .filter((t) => Math.abs(t.amount - net) <= AMOUNT_TOLERANCE)
      .sort((a, b) => Math.abs(a.amount - net) - Math.abs(b.amount - net));
    const chosen = singles.length > 0 ? [singles[0]] : bestSubset(candidates, net);
    if (!chosen) continue;
    chosen.forEach((t) => matchedIds.add(t.id));
    matches.push({
      source_doc_id: rec.source_doc_id,
      txn_ids: chosen.map((t) => t.id),
      amount_diff: round2(chosen.reduce((s, t) => s + t.amount, 0) - net),
    });
  }

  // A platform deposit dated inside a kept statement's payout window is already represented by
  // that statement, even when amounts don't line up (monthly summaries paid weekly, instant
  // cash-outs net of fees). Counting it again would double count, so it is never income on its own.
  const platformOf = (t: BankTransaction): Platform | null => {
    for (const [p, re] of Object.entries(PLATFORM_PATTERNS) as [Platform, RegExp][]) if (re.test(t.description)) return p;
    return suggestionById.get(t.id)?.platform ?? null;
  };
  const coveredIds = new Set(
    incomeLike
      .filter((t) => !matchedIds.has(t.id))
      .filter((t) => {
        const platform = platformOf(t);
        return (
          platform !== null &&
          kept.some((r) => {
            if (r.platform !== platform || r.period_start === null || r.period_end === null || t.date < r.period_start) return false;
            // Inside the earning period, a deposit belongs to this statement. After it, only an
            // unmatched statement claims the deposit; a matched one leaves it for the member to label.
            const matched = matches.some((m) => m.source_doc_id === r.source_doc_id);
            return t.date <= (matched ? r.period_end : addDays(r.period_end, PAYOUT_WINDOW_DAYS));
          })
        );
      })
      .map((t) => t.id),
  );

  const unmatched = incomeLike.filter((t) => !matchedIds.has(t.id) && !coveredIds.has(t.id));
  return {
    records: kept,
    duplicates,
    matches,
    unmatched_deposits: unmatched
      .filter((t) => input.labels[t.id] !== "driving" && input.labels[t.id] !== "not_driving")
      .map((t) => ({ ...t, suggestion: suggestionById.get(t.id) ?? null })),
    user_labeled_income: input.transactions.filter(
      (t) => t.amount > 0 && !matchedIds.has(t.id) && !coveredIds.has(t.id) && input.labels[t.id] === "driving",
    ),
  };
}
