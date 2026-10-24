// Earnings model: month targets -> per-app targets -> statement-period blocks.
import { Rng, splitUnits, addDays, daysInMonth, monthStart, monthEnd, overlapDays, daysBetween } from "../lib/util";

export type AppKey = "uber" | "lyft" | "doordash" | "instacart";
export type MonthType =
  | "meets_income"
  | "meets_hours"
  | "fails"
  | "near_miss"
  | "income_low_hours"
  | "net_fail"
  | "online_not_active";

/** Units: money in cents, hours in tenths. */
export interface AppMonth {
  gross: number;
  tips: number;
  promos: number;
  fees: number;
  online: number;
  active: number;
}

export interface Block {
  app: AppKey;
  start: string;
  end: string;
  gross: number;
  tips: number;
  promos: number;
  fees: number;
  net: number;
  online: number;
  active: number;
  trips: number;
  instant: boolean;
  /** Set by the plan: a readable statement exists for this block. */
  hasReadableDoc: boolean;
}

export interface MonthTotals {
  gross: number;
  net: number;
  online: number;
  active: number;
}

const FIELDS = ["gross", "tips", "promos", "fees", "online", "active"] as const;

export function monthTotals(type: MonthType, rng: Rng): MonthTotals {
  const cap = (online: number) => Math.min(online, 770);
  switch (type) {
    case "meets_income": {
      const gross = rng.int(95000, 190000);
      const net = gross - Math.round(gross * rng.float(0.08, 0.22));
      const active = rng.int(300, 750);
      return { gross, net, active, online: Math.round(active * rng.float(1.15, 1.5)) };
    }
    case "meets_hours": {
      const gross = rng.int(28000, 52000);
      const net = gross - Math.round(gross * rng.float(0.08, 0.18));
      const active = rng.int(820, 1150);
      return { gross, net, active, online: Math.round(active * rng.float(1.1, 1.35)) };
    }
    case "fails": {
      const gross = rng.int(22000, 52000);
      const net = gross - Math.round(gross * rng.float(0.08, 0.18));
      const active = rng.int(250, 620);
      return { gross, net, active, online: cap(Math.round(active * rng.float(1.1, 1.4))) };
    }
    case "near_miss": {
      const gross = rng.int(57500, 57999);
      const net = gross - Math.round(gross * rng.float(0.06, 0.14));
      const active = rng.int(450, 740);
      return { gross, net, active, online: cap(Math.round(active * rng.float(1.05, 1.2))) };
    }
    case "income_low_hours": {
      const gross = rng.int(82000, 120000);
      const net = gross - Math.round(gross * rng.float(0.1, 0.18));
      const active = rng.int(380, 740);
      return { gross, net, active, online: cap(Math.round(active * rng.float(1.05, 1.2))) };
    }
    case "net_fail": {
      const gross = rng.int(59000, 64000);
      const net = rng.int(52000, 57500);
      const active = rng.int(400, 740);
      return { gross, net, active, online: cap(Math.round(active * rng.float(1.05, 1.2))) };
    }
    case "online_not_active": {
      const gross = rng.int(30000, 52000);
      const net = gross - Math.round(gross * rng.float(0.08, 0.18));
      const active = rng.int(550, 740);
      return { gross, net, active, online: rng.int(820, 1000) };
    }
  }
}

/** Split month totals across the apps active that month. */
export function splitAcrossApps(totals: MonthTotals, apps: readonly AppKey[], rng: Rng): Record<string, AppMonth> {
  const shares = apps.map(() => rng.float(0.5, 1.5));
  const noisy = () => shares.map((s) => s * rng.float(0.85, 1.15));
  const tipsTotal = Math.round(totals.gross * rng.float(0.06, 0.13));
  const promosTotal = rng.chance(0.5) ? Math.round(totals.gross * rng.float(0.01, 0.05)) : 0;
  const feesTotal = totals.gross - totals.net;
  const wGross = noisy();
  const gross = splitUnits(totals.gross, wGross);
  const fees = splitUnits(feesTotal, wGross.map((w) => w * rng.float(0.9, 1.1)));
  const tips = splitUnits(tipsTotal, wGross);
  const promos = splitUnits(promosTotal, wGross);
  const wHours = noisy();
  const online = splitUnits(totals.online, wHours);
  const active = splitUnits(totals.active, wHours.map((w) => w * rng.float(0.98, 1.02)));
  const out: Record<string, AppMonth> = {};
  apps.forEach((app, i) => {
    out[app] = {
      gross: gross[i],
      tips: tips[i],
      promos: promos[i],
      fees: fees[i],
      online: online[i],
      active: active[i],
    };
  });
  return out;
}

const AVG_FARE: Record<AppKey, [number, number]> = {
  uber: [11, 19],
  lyft: [11, 19],
  doordash: [7, 12],
  instacart: [14, 26],
};

function tripsFor(app: AppKey, grossCents: number, rng: Rng): number {
  if (grossCents <= 0) return 0;
  const [lo, hi] = AVG_FARE[app];
  return Math.max(1, Math.round(grossCents / 100 / rng.float(lo, hi)));
}

function finishBlock(
  app: AppKey,
  start: string,
  end: string,
  v: Record<(typeof FIELDS)[number], number>,
  rng: Rng,
): Block {
  const fees = Math.min(v.fees, v.gross);
  return {
    app,
    start,
    end,
    gross: v.gross,
    tips: Math.min(v.tips, v.gross),
    promos: Math.min(v.promos, Math.max(0, v.gross - v.tips)),
    fees,
    net: v.gross - fees,
    online: Math.max(v.online, v.active),
    active: v.active,
    trips: tripsFor(app, v.gross, rng),
    instant: false,
    hasReadableDoc: true,
  };
}

/** Calendar-aligned blocks: 1-7, 8-14, 15-21, 22-28, plus a 29-end stub. Month sums are exact. */
export function alignedBlocks(app: AppKey, month: string, t: AppMonth, rng: Rng): Block[] {
  const dim = daysInMonth(month);
  const ranges: [number, number][] = [
    [1, 7],
    [8, 14],
    [15, 21],
    [22, 28],
  ];
  if (dim > 28) ranges.push([29, dim]);
  const weights = ranges.map(([a, b]) => (rng.float(0.6, 1.4) * (b - a + 1)) / 7);
  const parts: Record<string, number[]> = {};
  const wHours = weights.map((w) => w * rng.float(0.9, 1.1));
  for (const f of FIELDS) {
    const w = f === "online" ? wHours : f === "active" ? wHours.map((x) => x * rng.float(0.98, 1.02)) : weights.map((x) => x * rng.float(0.9, 1.1));
    parts[f] = splitUnits(t[f], w);
  }
  return ranges.map(([a, b], i) =>
    finishBlock(
      app,
      `${month}-${String(a).padStart(2, "0")}`,
      `${month}-${String(b).padStart(2, "0")}`,
      Object.fromEntries(FIELDS.map((f) => [f, parts[f][i]])) as Record<(typeof FIELDS)[number], number>,
      rng,
    ),
  );
}

/** Seven-day chain starting on the first day of the span; blocks may straddle months. */
export function chainBlocks(
  app: AppKey,
  months: readonly string[],
  targets: Record<string, AppMonth | undefined>,
  rng: Rng,
): Block[] {
  const spanStart = monthStart(months[0]);
  const spanEnd = monthEnd(months[months.length - 1]);
  const out: Block[] = [];
  for (let s = spanStart; daysBetween(s, spanEnd) >= 0; s = addDays(s, 7)) {
    const e = addDays(s, 6) > spanEnd ? spanEnd : addDays(s, 6);
    const v = Object.fromEntries(FIELDS.map((f) => [f, 0])) as Record<(typeof FIELDS)[number], number>;
    for (const m of months) {
      const t = targets[m];
      const d = overlapDays(s, e, monthStart(m), monthEnd(m));
      if (!t || d === 0) continue;
      for (const f of FIELDS) v[f] += (t[f] * d) / daysInMonth(m);
    }
    for (const f of FIELDS) v[f] = Math.round(v[f]);
    out.push(finishBlock(app, s, e, v, rng));
  }
  return out;
}

/** Pro-rata contribution of a block to a calendar month (by days). */
export function blockShare(b: Block, month: string): number {
  const total = daysBetween(b.start, b.end) + 1;
  return overlapDays(b.start, b.end, monthStart(month), monthEnd(month)) / total;
}
