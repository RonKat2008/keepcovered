"use client";

import { Fragment, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Quote, X } from "lucide-react";
import type { Citation, ExplanationSpan } from "@/lib/schemas";
import { useLang } from "@/components/lang/useLang";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { cn } from "@/lib/utils";

type Numbered = { n: number; citation: Citation };

/** Plain-language explanation. Each claim that has a source gets a numbered chip; tapping it opens the quote. */
export function Explanation({ spans }: { spans: ExplanationSpan[] }) {
  const { t } = useLang();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState<number | null>(null);

  let counter = 0;
  const numbered: Numbered[][] = spans.map((s) => s.citations.map((c) => ({ n: ++counter, citation: c })));
  const flat = numbered.flat();
  const active = flat.find((x) => x.n === open) ?? null;

  return (
    <div>
      <p className="max-w-[62ch] font-display text-[1.22rem] leading-[1.65] text-ink [font-variation-settings:'opsz'_18] sm:text-[1.3rem]">
        {spans.map((span, i) => (
          <Fragment key={i}>
            {span.text.trimEnd()}
            {numbered[i].map(({ n }) => (
              <sup key={n} className="ml-0.5 align-super">
                <button
                  type="button"
                  onClick={() => setOpen(open === n ? null : n)}
                  aria-expanded={open === n}
                  aria-controls="citation-card"
                  aria-label={t("explain.open", { n })}
                  className={cn(
                    "relative inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1.5 font-sans text-[0.72rem] font-bold leading-none transition-colors before:absolute before:-inset-2.5 before:content-['']",
                    open === n ? "bg-ink text-sheet" : "bg-unsure text-sheet hover:bg-ink",
                  )}
                >
                  {n}
                </button>
              </sup>
            ))}{" "}
          </Fragment>
        ))}
      </p>

      <AnimatePresence mode="wait">
        {active && (
          <motion.figure
            id="citation-card"
            key={active.n}
            initial={reduced ? false : { opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="relative mt-5 max-w-[62ch] rounded-2xl border-l-4 border-unsure bg-sheet p-5 pr-14 shadow-[0_16px_30px_-24px_rgba(26,34,50,0.6)]"
          >
            <Quote className="size-5 text-unsure" aria-hidden />
            <blockquote className="mt-2 text-[1.02rem] leading-relaxed text-ink">“{active.citation.cited_text}”</blockquote>
            <figcaption className="mt-3 text-[0.9rem] font-semibold text-ink-soft">
              {active.citation.title}
              {active.citation.page !== null && `, ${t("explain.page", { page: active.citation.page })}`}
            </figcaption>
            <button
              type="button"
              onClick={() => setOpen(null)}
              className="absolute right-2 top-2 inline-flex size-11 items-center justify-center rounded-full text-ink-soft hover:bg-paper-deep hover:text-ink"
              aria-label={t("explain.close")}
            >
              <X className="size-5" aria-hidden />
            </button>
          </motion.figure>
        )}
      </AnimatePresence>
    </div>
  );
}
