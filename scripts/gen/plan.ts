// Plans the 30 random drivers (traps, month types, apps) and the hand-crafted demo driver.
import { Rng, hashSeed, addDays, monthEnd } from "../lib/util";
import { monthTotals, splitAcrossApps, type AppKey, type AppMonth, type MonthType } from "./model";
import type { DriverSpec } from "./driver";

export const SEED = 2026;
export const ALL_MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"];
const APPS: AppKey[] = ["uber", "lyft", "doordash", "instacart"];
const ES_DRIVERS = new Set([2, 4, 7, 9, 12, 14, 17, 19, 22, 24, 27, 29]);
const EN_FIRST = ["Alex", "Jordan", "Sam", "Casey", "Taylor", "Morgan", "Riley", "Devon", "Jamie", "Avery", "Quinn", "Reese"];
const ES_FIRST = ["Carlos", "Lucía", "Mateo", "Valentina", "Diego", "Camila", "Javier", "Sofía", "Luis", "Ximena", "Andrés", "Rosa"];
const LAST = ["Vance", "Okoro", "Lindqvist", "Moreno", "Ibarra", "Tran", "Whitfield", "Castellanos", "Park", "Dube", "Ferreira", "Nakamura"];

/** Traps per driver index (1-based). Threshold traps are mutually exclusive per driver. */
const TRAPS: Record<number, string[]> = {
  2: ["missing_month"],
  3: ["duplicate_exact"],
  4: ["near_miss_income"],
  5: ["duplicate_rephotographed"],
  6: ["income_low_hours"],
  7: ["net_below_gross_above"],
  8: ["online_not_active"],
  9: ["missing_month", "duplicate_exact"],
  10: ["straddle_week"],
  11: ["duplicate_exact", "venmo_not_driving"],
  12: ["unreadable_total"],
  13: ["venmo_not_driving", "instant_cashout_list"],
  14: ["near_miss_income"],
  15: ["income_low_hours", "duplicate_rephotographed"],
  16: ["venmo_not_driving", "instant_cashout_list"],
  17: ["duplicate_rephotographed"],
  18: ["prompt_injection"],
  19: ["net_below_gross_above"],
  20: ["online_not_active", "instant_cashout_list"],
  21: ["missing_month"],
  22: ["straddle_week"],
  23: ["venmo_not_driving", "instant_cashout_list"],
  24: ["income_low_hours"],
  25: ["unreadable_total"],
  26: ["near_miss_income"],
  27: ["prompt_injection"],
  28: ["net_below_gross_above"],
  29: ["online_not_active"],
  30: ["venmo_not_driving", "instant_cashout_list"],
};
const CASHOUT = new Set([1, 6, 8]);
const THRESHOLD: Record<string, MonthType> = {
  near_miss_income: "near_miss",
  income_low_hours: "income_low_hours",
  net_below_gross_above: "net_fail",
  online_not_active: "online_not_active",
};

export const driverId = (i: number): string => `drv-${String(i).padStart(2, "0")}`;

export function planDriver(i: number): DriverSpec {
  const rng = new Rng(hashSeed(`kc-${SEED}-${i}`));
  const lang = ES_DRIVERS.has(i) ? "es" : "en";
  const name = `${rng.pick(lang === "es" ? ES_FIRST : EN_FIRST)} ${rng.pick(LAST)}`;
  const traps = [...(TRAPS[i] ?? []), ...(CASHOUT.has(i) ? ["instant_cashout_list"] : [])];
  const nApps = rng.pick([1, 2, 2, 2, 3, 3]);
  const apps = rng.shuffle(APPS).slice(0, nApps) as AppKey[];
  const n = rng.int(3, 6);
  const start = rng.int(0, 6 - n);
  const months = ALL_MONTHS.slice(start, start + n);

  const appMode = Object.fromEntries(APPS.map((a) => [a, rng.chance(0.15) ? "weekly" : "monthly"])) as DriverSpec["appMode"];
  const straddle = traps.includes("straddle_week");
  const chainApp = straddle ? apps[0] : undefined;
  if (chainApp) appMode[chainApp] = "weekly";

  // Month types.
  const baseKind = (["meets_income", "meets_hours", "fails", "mixed"] as const)[i % 4];
  const monthType: Record<string, MonthType> = {};
  months.forEach((m) => {
    const k = baseKind === "mixed" ? rng.pick(["meets_income", "meets_income", "meets_hours", "fails", "fails"] as const) : baseKind;
    monthType[m] = straddle ? "meets_income" : k;
  });
  const taken = new Set<number>();
  const freeIdx = (lo = 0, hi = n - 1): number => {
    let idx = rng.int(lo, hi);
    for (let t = 0; t < 20 && taken.has(idx); t++) idx = rng.int(lo, hi);
    taken.add(idx);
    return idx;
  };
  const missingMonths: string[] = [];
  if (traps.includes("missing_month")) missingMonths.push(months[freeIdx(1, n - 2)]);
  for (const t of traps) if (THRESHOLD[t]) monthType[months[freeIdx()]] = THRESHOLD[t];
  let venmoMonth: string | undefined;
  if (traps.includes("venmo_not_driving")) {
    venmoMonth = months[freeIdx()];
    monthType[venmoMonth] = "fails";
  }

  const monthTargets: DriverSpec["monthTargets"] = {};
  const netByMonth: Record<string, number> = {};
  for (const m of months) {
    const totals = monthTotals(monthType[m], rng);
    netByMonth[m] = totals.net;
    monthTargets[m] = splitAcrossApps(totals, apps, rng) as Record<string, AppMonth>;
  }

  const lastMonth = months[n - 1];
  const variant = (["work_rule_notice", "verification_request", "renewal"] as const)[i % 3];
  const noticeDate = addDays(monthEnd(lastMonth), rng.int(5, 12));
  const letterMonths = variant === "renewal" ? months.slice(-3) : variant === "verification_request" ? months.slice(-2) : [];

  return {
    id: driverId(i),
    name,
    lang,
    apps,
    months,
    traps,
    appMode,
    chainApp,
    monthTargets,
    monthType,
    missingMonths,
    missingAppMonths: [],
    dupExact: traps.includes("duplicate_exact"),
    dupRephoto: traps.includes("duplicate_rephotographed"),
    unreadable: traps.includes("unreadable_total"),
    injection: traps.includes("prompt_injection"),
    venmoTrap: venmoMonth
      ? { month: venmoMonth, amount: Math.max(300, Math.ceil(650 - netByMonth[venmoMonth] / 100) + rng.int(0, 60)) }
      : undefined,
    cashoutApp: traps.includes("instant_cashout_list") ? apps[0] : undefined,
    letter: { variant, months: letterMonths, noticeDate, deadline: addDays(noticeDate, variant === "verification_request" ? 14 : 30) },
    commaDecimals: lang === "es" && rng.chance(0.5),
    caseRef: `DEMO-0000-${100 + i}`,
  };
}

/** Hand-crafted demo driver: Spanish speaker, 3 apps, county letter asks for Oct and Nov. */
export function planMaria(): DriverSpec {
  const m = (gross: number, tips: number, promos: number, fees: number, online: number, active: number): AppMonth => ({
    gross, tips, promos, fees, online, active,
  });
  return {
    id: "demo-maria",
    name: "María Ortega",
    lang: "es",
    apps: ["uber", "doordash", "instacart"],
    months: ["2026-09", "2026-10", "2026-11"],
    traps: ["missing_app_statements", "venmo_not_driving", "duplicate_rephotographed", "demo"],
    appMode: { uber: "monthly", lyft: "monthly", doordash: "monthly", instacart: "monthly" },
    monthTargets: {
      "2026-09": { uber: m(69000, 6900, 0, 8000, 660, 520) },
      "2026-10": {
        uber: m(37240, 3800, 0, 7448, 290, 210),
        doordash: m(23350, 2600, 500, 1800, 195, 140),
        instacart: m(14860, 1500, 0, 1486, 120, 95),
      },
      "2026-11": {
        uber: m(61280, 6128, 0, 12256, 450, 330),
        doordash: m(41830, 5200, 1000, 2510, 365, 265),
        instacart: m(20900, 2300, 0, 2090, 160, 120),
      },
    },
    monthType: { "2026-09": "custom", "2026-10": "custom", "2026-11": "custom" },
    missingMonths: [],
    missingAppMonths: ["doordash|2026-10"],
    dupExact: false,
    dupRephoto: true,
    dupIndex: 1,
    unreadable: false,
    injection: false,
    letter: { variant: "verification_request", months: ["2026-10", "2026-11"], noticeDate: "2026-11-24", deadline: "2026-12-08" },
    commaDecimals: true,
    caseRef: "DEMO-0000-123",
    photoPlan: () => false,
    instantProb: 0,
    noRandomUnrelated: true,
    extraTxns: [
      { date: "2026-11-12", amount: 85, description: "VENMO *LUCIA R", label: "not_driving" },
      { date: "2026-10-03", amount: 150, description: "TRANSFER FROM SAVINGS", label: "not_driving" },
    ],
    notes: [
      "October: DoorDash screenshots intentionally missing but DoorDash deposits are in the bank ledger.",
      "November meets the income path across three apps (gross 1240.10, net 1071.54).",
      "VENMO deposit (85.00) is not driving income; the user must label it.",
    ],
  };
}
