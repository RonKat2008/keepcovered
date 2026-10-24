"use client";

import { useLayoutEffect, useRef } from "react";
import { animateBars } from "@/components/motion/animateBars";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { useLang } from "@/components/lang/useLang";
import { fmtMoney, fmtMonthName } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const SAMPLE = [
  { month: "2026-09", gross: 910, ok: true },
  { month: "2026-10", gross: 402, ok: false },
  { month: "2026-11", gross: 1241, ok: true },
] as const;

const SCALE = 1300;
const LINE = 580;

/** The page's one orchestrated moment: three months of earnings drawn against the $580 line. */
export function HeroLedger() {
  const { lang, t } = useLang();
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const linePct = (LINE / SCALE) * 100;

  useLayoutEffect(() => {
    if (!ref.current || reduced) return;
    return animateBars(ref.current, { delay: 350, step: 220 });
  }, [reduced]);

  return (
    <figure
      ref={ref}
      className="sheet relative rounded-[1.25rem] px-5 pb-5 pt-6 sm:px-7 sm:pb-7 sm:pt-8"
      aria-label={t("hero.threshold")}
    >
      <div className="relative">
        {/* the $580 line runs through every row */}
        <div
          className="absolute -bottom-2 -top-7 z-10 w-0 border-l-2 border-dashed border-ink"
          style={{ left: `${linePct}%` }}
          aria-hidden
        >
          <span className="absolute -top-0.5 left-2 whitespace-nowrap text-[0.78rem] font-semibold text-ink">
            {t("hero.threshold")}
          </span>
        </div>
        <ol className="space-y-5">
          {SAMPLE.map((row) => (
            <li key={row.month} className="grid grid-cols-[4.8rem_1fr] items-center gap-3 sm:grid-cols-[6rem_1fr]">
              <span className="font-display text-[1.05rem] capitalize text-ink sm:text-lg">
                {fmtMonthName(row.month, lang)}
              </span>
              <div className="relative">
                <div className="h-9 overflow-hidden rounded-md bg-paper-deep ring-1 ring-inset ring-rule">
                  <div
                    data-bar-fill
                    data-target={row.gross / SCALE}
                    className={cn("h-full w-full origin-left rounded-md", row.ok ? "bg-meets" : "bg-short-bar")}
                    style={{ transform: `scaleX(${row.gross / SCALE})` }}
                  />
                </div>
                <span
                  className={cn(
                    "absolute top-1/2 text-[0.95rem] font-semibold tabular",
                    row.ok ? "-translate-x-full -translate-y-1/2 text-sheet" : "-translate-y-1/2 text-ink",
                  )}
                  style={{
                    left: row.ok
                      ? `calc(${(row.gross / SCALE) * 100}% - 0.6rem)`
                      : `calc(${(row.gross / SCALE) * 100}% + 0.6rem)`,
                  }}
                >
                  {fmtMoney(row.gross, lang, false)}
                </span>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[0.85rem] text-ink-soft">
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-sm bg-meets" aria-hidden />
          {t("hero.legend.meets")}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="size-3 rounded-sm bg-short-bar" aria-hidden />
          {t("hero.legend.short")}
        </span>
      </figcaption>
    </figure>
  );
}
