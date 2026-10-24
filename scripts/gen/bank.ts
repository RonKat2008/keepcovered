// Synthetic bank ledger for a driver: payouts that match statements, instant cash-outs, unrelated deposits, debits.
import type { z } from "zod";
import type { BankTransaction } from "../../src/lib/schemas";
import { Rng, splitUnits, addDays, daysBetween, dollars, monthStart, monthEnd, daysInMonth } from "../lib/util";
import type { AppKey, Block } from "./model";

export type DepositTruth = "driving" | "not_driving";
type Txn = z.infer<typeof BankTransaction>;

const PAYOUT: Record<AppKey, string> = {
  uber: "UBER TECHNOLOGIES PAYOUT",
  lyft: "LYFT INC DIRECT DEP",
  doordash: "DOORDASH DASHER DIRECT",
  instacart: "MAPLEBEAR INSTACART",
};
const INSTANT: Record<AppKey, string> = {
  uber: "UBER INSTANT PAY",
  lyft: "LYFT EXPRESS PAY",
  doordash: "DOORDASH FAST PAY",
  instacart: "INSTACART EXPRESS CASH OUT",
};
const PEOPLE = ["M GARCIA", "T NGUYEN", "D OKAFOR", "S PATEL", "L HERNANDEZ", "R KIM"];
const MERCHANTS: [string, number, number][] = [
  ["SAFEWAY #1234", 25, 140],
  ["SHELL OIL 5710", 22, 68],
  ["CHEVRON 0042", 20, 64],
  ["COSTCO WHSE #118", 60, 210],
  ["PG&E WEB PAYMENT", 70, 190],
  ["AT&T WIRELESS", 55, 95],
  ["GEICO AUTO INS", 90, 180],
  ["WALGREENS #77", 8, 45],
  ["MCDONALDS F1234", 6, 18],
];

export interface InstantInfo {
  block: Block;
  chunks: number[]; // cents, pre-fee
  fees: number[]; // cents
  dates: string[];
}

export interface BankOptions {
  driverId: string;
  months: readonly string[];
  /** Large non-driving Venmo deposit planted in a month. */
  venmoTrap?: { month: string; amount: number; descriptor?: string };
  /** Force the first block of this app to be paid via instant cash-outs. */
  forceInstantApp?: AppKey;
  instantProb?: number;
  /** Skip random unrelated deposits/debits (used for hand-crafted drivers needing exact content). */
  /** Skip random unrelated deposits (hand-crafted drivers). Debits are kept. */
  noRandomUnrelated?: boolean;
  extraTxns?: { date: string; amount: number; description: string; label: DepositTruth }[];
}

export interface BankResult {
  txns: Txn[];
  truth: Record<string, DepositTruth>;
  instant: InstantInfo[];
}

export function buildBank(blocks: readonly Block[], opts: BankOptions, rng: Rng): BankResult {
  type Raw = { date: string; amount: number; description: string; label: DepositTruth };
  const raw: Raw[] = [];
  const instant: InstantInfo[] = [];
  const ref = () => (rng.chance(0.5) ? ` ${rng.int(1000, 9999)}` : "");
  const forcedBlock = opts.forceInstantApp
    ? [...blocks]
        .filter((b) => b.app === opts.forceInstantApp && daysBetween(b.start, b.end) >= 2)
        .sort((a, b) => b.net - a.net)[0]
    : undefined;

  for (const b of blocks) {
    if (b.net < 600 && b !== forcedBlock) continue;
    const len = daysBetween(b.start, b.end) + 1;
    const wantForced = b === forcedBlock;
    const useInstant = (wantForced || rng.chance(opts.instantProb ?? 0.2)) && b.net >= (wantForced ? 1500 : 4000) && len >= 3;
    if (useInstant) {
      const n = rng.int(2, 4);
      const chunks = splitUnits(b.net, Array.from({ length: n }, () => rng.float(0.6, 1.4)));
      const dates = Array.from({ length: n }, () => addDays(b.start, rng.int(1, len - 1))).sort();
      const fees = chunks.map(() => rng.int(10, 25) * 5);
      b.instant = true;
      instant.push({ block: b, chunks, fees, dates });
      chunks.forEach((c, i) =>
        raw.push({ date: dates[i], amount: dollars(c - fees[i]), description: INSTANT[b.app], label: "driving" }),
      );
    } else {
      raw.push({
        date: addDays(b.end, rng.int(1, 3)),
        amount: dollars(b.net),
        description: PAYOUT[b.app] + ref(),
        label: "driving",
      });
    }
  }

  for (const m of opts.months) {
    const dim = daysInMonth(m);
    const day = () => `${m}-${String(rng.int(1, dim)).padStart(2, "0")}`;
    const nUnrelated = opts.noRandomUnrelated ? 0 : rng.int(1, 3);
    for (let i = 0; i < nUnrelated; i++) {
      const kind = rng.int(0, 3);
      if (kind === 0) raw.push({ date: day(), amount: rng.int(20, 180), description: "VENMO *J. RIVERA", label: "not_driving" });
      else if (kind === 1)
        raw.push({ date: day(), amount: rng.int(50, 400), description: `ZELLE FROM ${rng.pick(PEOPLE)}`, label: "not_driving" });
      else if (kind === 2)
        raw.push({ date: day(), amount: rng.int(100, 600), description: "TRANSFER FROM SAVINGS", label: "not_driving" });
      else raw.push({ date: day(), amount: rng.int(100, 500), description: "MOBILE CHECK DEPOSIT", label: "not_driving" });
    }
    const nDebits = rng.int(6, 12);
    for (let i = 0; i < nDebits; i++) {
      const [name, lo, hi] = rng.pick(MERCHANTS);
      raw.push({ date: day(), amount: -Math.round(rng.float(lo, hi) * 100) / 100, description: name, label: "not_driving" });
    }
    raw.push({ date: `${m}-01`, amount: -rng.int(1100, 1900), description: "RENT PAYMENT DEMO PROPERTIES", label: "not_driving" });
  }
  const irsMonth = opts.months[rng.int(0, opts.months.length - 1)];
  if (!opts.noRandomUnrelated && rng.chance(0.3))
    raw.push({ date: `${irsMonth}-${String(rng.int(5, 20)).padStart(2, "0")}`, amount: rng.int(400, 1500), description: "IRS TREAS 310 TAX REF", label: "not_driving" });

  if (opts.venmoTrap) {
    const v = opts.venmoTrap;
    raw.push({
      date: `${v.month}-${String(rng.int(8, 24)).padStart(2, "0")}`,
      amount: v.amount,
      description: v.descriptor ?? "VENMO *J. RIVERA",
      label: "not_driving",
    });
  }
  for (const e of opts.extraTxns ?? []) raw.push(e);

  const last = monthEnd(opts.months[opts.months.length - 1]);
  const first = monthStart(opts.months[0]);
  raw.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : b.amount - a.amount));
  const txns: Txn[] = [];
  const truth: Record<string, DepositTruth> = {};
  raw
    .filter((r) => r.date >= first && r.date <= addDays(last, 3))
    .forEach((r, i) => {
      const id = `${opts.driverId}-t${String(i + 1).padStart(3, "0")}`;
      txns.push({ id, date: r.date, amount: r.amount, description: r.description });
      truth[id] = r.label;
    });
  return { txns, truth, instant };
}
