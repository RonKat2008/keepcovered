// Deterministic RNG + date/number helpers for the synthetic data generator.

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(lo = 0, hi = 1): number {
    return lo + this.next() * (hi - lo);
  }
  /** Inclusive integer range. */
  int(lo: number, hi: number): number {
    return Math.floor(this.float(lo, hi + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(xs: readonly T[]): T {
    return xs[this.int(0, xs.length - 1)];
  }
  shuffle<T>(xs: readonly T[]): T[] {
    const out = [...xs];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

export function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Split an integer total into parts proportional to weights; parts always sum to total exactly. */
export function splitUnits(total: number, weights: readonly number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (total * w) / sum);
  const parts = raw.map(Math.floor);
  let rem = total - parts.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, f: r - Math.floor(r) })).sort((a, b) => b.f - a.f || a.i - b.i);
  for (let k = 0; rem > 0; k = (k + 1) % order.length, rem--) parts[order[k].i] += 1;
  return parts;
}

export const r2 = (n: number): number => Math.round(n * 100) / 100;
export const dollars = (cents: number): number => r2(cents / 100);
export const hours = (tenths: number): number => Math.round(tenths) / 10;

// ---------- dates (UTC, ISO strings) ----------

const DAY = 86400000;
export const parseIso = (s: string): number => {
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const toIso = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso: string, n: number): string => toIso(parseIso(iso) + n * DAY);
export const daysBetween = (a: string, b: string): number => Math.round((parseIso(b) - parseIso(a)) / DAY);
export const daysInMonth = (month: string): number => {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
};
export const monthStart = (month: string): string => `${month}-01`;
export const monthEnd = (month: string): string => `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
export const monthOf = (iso: string): string => iso.slice(0, 7);
export const nextMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
/** Inclusive overlap, in days, of [aStart,aEnd] with [bStart,bEnd]. */
export function overlapDays(aStart: string, aEnd: string, bStart: string, bEnd: string): number {
  const s = Math.max(parseIso(aStart), parseIso(bStart));
  const e = Math.min(parseIso(aEnd), parseIso(bEnd));
  return e < s ? 0 : Math.round((e - s) / DAY) + 1;
}
