"use client";

import { cn } from "@/lib/utils";

export type BarTone = "meets" | "short" | "unsure" | "missing" | "muted";

const FILL: Record<BarTone, string> = {
  meets: "bg-meets",
  short: "bg-short-bar",
  unsure: "bg-unsure",
  missing: "bg-missing",
  muted: "bg-ink-soft/40",
};

type Props = {
  value: number;
  threshold: number;
  /** Shared scale so bars line up across months */
  max: number;
  tone: BarTone;
  thresholdLabel: string;
  /** Visually hidden description for screen readers */
  label: string;
  hatched?: boolean;
  className?: string;
};

/**
 * A ledger bar that fills toward a threshold tick. The fill starts at scaleX(0) and is
 * animated by the parent with anime.js (data-bar-fill / data-target) so rows can stagger.
 */
export function ThresholdBar({ value, threshold, max, tone, thresholdLabel, label, hatched, className }: Props) {
  const safeMax = Math.max(max, threshold, 1);
  const target = Math.min(value / safeMax, 1);
  const tickPct = (threshold / safeMax) * 100;
  return (
    <div className={cn("relative pt-5", className)} role="img" aria-label={label}>
      <div
        className="absolute top-0 -translate-x-1/2 text-[0.7rem] font-semibold tabular text-ink-soft"
        style={{ left: `${tickPct}%` }}
        aria-hidden
      >
        {thresholdLabel}
      </div>
      <div
        className={cn(
          "relative h-3.5 overflow-hidden rounded-full bg-paper-deep ring-1 ring-inset ring-rule",
          hatched && "hatch",
        )}
        aria-hidden
      >
        <div
          data-bar-fill
          data-target={target}
          className={cn("absolute inset-y-0 left-0 w-full origin-left rounded-full", FILL[tone])}
          style={{ transform: `scaleX(${target})` }}
        />
      </div>
      <div
        className="absolute bottom-[-4px] top-4 w-[2px] -translate-x-1/2 rounded-full bg-ink"
        style={{ left: `${tickPct}%` }}
        aria-hidden
      />
    </div>
  );
}
