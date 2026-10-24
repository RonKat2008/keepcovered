import { CircleCheck, CircleDashed, CircleHelp, CircleMinus, type LucideIcon } from "lucide-react";
import type { CopyKey } from "@/lib/i18n";
import type { MonthStatus } from "@/lib/schemas";
import type { BarTone } from "@/components/motion/ThresholdBar";

export type Overall = MonthStatus["overall"];

export const INCOME_THRESHOLD = 580;
export const HOURS_THRESHOLD = 80;

export const STATUS_META: Record<
  Overall,
  { tone: BarTone; icon: LucideIcon; label: CopyKey; short: CopyKey; text: string; tint: string; ring: string }
> = {
  meets: {
    tone: "meets",
    icon: CircleCheck,
    label: "status.meets",
    short: "status.meets.short",
    text: "text-meets",
    tint: "bg-meets-tint",
    ring: "ring-meets/30",
  },
  does_not_meet: {
    tone: "short",
    icon: CircleMinus,
    label: "status.does_not_meet",
    short: "status.does_not_meet.short",
    text: "text-short",
    tint: "bg-short-tint",
    ring: "ring-short/30",
  },
  unsure: {
    tone: "unsure",
    icon: CircleHelp,
    label: "status.unsure",
    short: "status.unsure.short",
    text: "text-unsure",
    tint: "bg-unsure-tint",
    ring: "ring-unsure/30",
  },
  missing_data: {
    tone: "missing",
    icon: CircleDashed,
    label: "status.missing_data",
    short: "status.missing_data.short",
    text: "text-missing",
    tint: "bg-missing-tint",
    ring: "ring-missing/30",
  },
};

/** Tone for a single bar: green if that path clears the line, else the month's own state color. */
export function pathTone(month: MonthStatus, path: "income" | "hours"): BarTone {
  const result = path === "income" ? month.meets_income_path : month.meets_hours_path;
  if (month.overall === "missing_data") return "missing";
  if (result === true) return "meets";
  if (result === "depends_on_open_question") return "unsure";
  return month.overall === "meets" ? "muted" : "short";
}
