// Pure helpers shared by the rules modules. No I/O, no clocks.

const MS_PER_DAY = 86_400_000;

export const roundTo = (value: number, places: number): number => {
  const f = 10 ** places;
  return Math.round((value + Number.EPSILON * Math.sign(value)) * f) / f;
};
export const round2 = (v: number): number => roundTo(v, 2);
/** Hours are never overstated: floor to 0.1. */
export const floorTenth = (v: number): number => Math.floor(roundTo(v, 6) * 10) / 10;
/** Shortfalls are never understated: ceil to 0.1. */
export const ceilTenth = (v: number): number => Math.ceil(roundTo(v, 6) * 10) / 10;

export const isValidIso = (iso: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
};
export const dayNumber = (iso: string): number => Math.round(Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY);
export const fromDayNumber = (n: number): string => new Date(n * MS_PER_DAY).toISOString().slice(0, 10);
export const addDays = (iso: string, days: number): string => fromDayNumber(dayNumber(iso) + days);
export const monthOf = (iso: string): string => iso.slice(0, 7);

export const monthStart = (month: string): string => `${month}-01`;
export const nextMonth = (month: string): string => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
};
export const monthEnd = (month: string): string => addDays(monthStart(nextMonth(month)), -1);
export const prevMonth = (month: string): string => monthOf(addDays(monthStart(month), -1));
