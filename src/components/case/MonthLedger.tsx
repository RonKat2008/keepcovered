"use client";

import { useLayoutEffect, useRef } from "react";
import { MessageCircleQuestion } from "lucide-react";
import type { MonthStatus } from "@/lib/schemas";
import { fmtMoney, fmtMonth, fmtNumber, reasonText } from "@/lib/i18n";
import { useLang } from "@/components/lang/useLang";
import { CountUp } from "@/components/motion/CountUp";
import { ThresholdBar } from "@/components/motion/ThresholdBar";
import { animateBars } from "@/components/motion/animateBars";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { cn } from "@/lib/utils";
import { HOURS_THRESHOLD, INCOME_THRESHOLD, STATUS_META, pathTone } from "./status";

const STAGGER_MS = 160;

/** "septiembre de 2026" → "Septiembre de 2026" (CSS capitalize would also capitalize "de"). */
function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Props = {
  months: MonthStatus[];
  /** Question ids the user already answered */
  answered: Record<string, string>;
  onOpenQuestion: (questionId: string) => void;
};

export function MonthLedger({ months, answered, onOpenQuestion }: Props) {
  const { lang, t } = useLang();
  const reduced = useReducedMotion();
  const ref = useRef<HTMLOListElement>(null);

  const incomeMax = Math.max(INCOME_THRESHOLD * 1.35, ...months.map((m) => m.gross_income * 1.04));
  const hoursMax = Math.max(HOURS_THRESHOLD * 1.35, ...months.map((m) => m.active_hours * 1.04));

  useLayoutEffect(() => {
    if (!ref.current || reduced) return;
    return animateBars(ref.current, { delay: 200, step: STAGGER_MS / 2 });
  }, [reduced, months]);

  return (
    <ol ref={ref} className="divide-y divide-rule border-y-2 border-ink">
      {months.map((m, i) => {
        const meta = STATUS_META[m.overall];
        const Icon = meta.icon;
        const isMissing = m.overall === "missing_data";
        const openQs = m.open_question_ids.filter((q) => !(q in answered));
        const money = (n: number) => fmtMoney(n, lang);
        const hours = (n: number) => `${fmtNumber(n, lang)} h`;
        return (
          <li key={m.month} className="py-6" data-month={m.month} data-status={m.overall}>
            <div className="grid gap-x-8 gap-y-5 md:grid-cols-[11rem_1fr_1fr]">
              {/* Month + status */}
              <div className="flex items-start justify-between gap-3 md:flex-col md:justify-start">
                <h3 className="font-display text-[1.6rem] font-medium leading-none text-ink">
                  {capFirst(fmtMonth(m.month, lang))}
                </h3>
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[0.85rem] font-semibold ring-1 ring-inset",
                    meta.tint,
                    meta.text,
                    meta.ring,
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  {t(meta.short)}
                </span>
              </div>

              {/* Income path */}
              <div>
                <p className="text-[0.85rem] font-semibold text-ink-soft">{t("result.months.gross")}</p>
                <p className="mt-1 font-display text-figure font-medium text-ink">
                  {isMissing ? "—" : <CountUp value={m.gross_income} format={money} delay={i * STAGGER_MS} />}
                </p>
                <ThresholdBar
                  className="mt-3"
                  value={m.gross_income}
                  threshold={INCOME_THRESHOLD}
                  max={incomeMax}
                  tone={pathTone(m, "income")}
                  hatched={isMissing}
                  thresholdLabel={t("result.months.line.income")}
                  label={`${t("result.months.gross")}: ${money(m.gross_income)} / ${money(INCOME_THRESHOLD)}`}
                />
              </div>

              {/* Hours path */}
              <div>
                <p className="text-[0.85rem] font-semibold text-ink-soft">{t("result.months.hours")}</p>
                <p className="mt-1 font-display text-figure font-medium text-ink">
                  {isMissing ? "—" : <CountUp value={m.active_hours} format={hours} delay={i * STAGGER_MS + 80} />}
                </p>
                <ThresholdBar
                  className="mt-3"
                  value={m.active_hours}
                  threshold={HOURS_THRESHOLD}
                  max={hoursMax}
                  tone={pathTone(m, "hours")}
                  hatched={isMissing}
                  thresholdLabel={t("result.months.line.hours")}
                  label={`${t("result.months.hours")}: ${hours(m.active_hours)} / ${HOURS_THRESHOLD} h`}
                />
              </div>
            </div>

            <div className="mt-5 md:ml-[13rem]">
              <p className={cn("text-[1.02rem] font-semibold", meta.text)}>{t(meta.label)}</p>
              <ul className="mt-2 space-y-1.5 text-[0.98rem] leading-snug text-ink">
                {m.reasons.map((r, idx) => (
                  <li key={`${r.code}-${idx}`} className="flex gap-2.5">
                    <span className="mt-[0.55rem] size-1.5 shrink-0 rounded-full bg-ink-soft" aria-hidden />
                    <span>{reasonText(r.code, r.params, lang)}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
                <span className="text-[0.85rem] text-ink-soft">
                  {m.evidence_doc_ids.length === 1
                    ? t("result.months.evidence.one")
                    : t("result.months.evidence", { count: m.evidence_doc_ids.length })}
                </span>
                {openQs.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onOpenQuestion(q)}
                    className="tap inline-flex items-center gap-2 rounded-full bg-unsure px-4 text-[0.92rem] font-semibold text-sheet hover:bg-unsure/90"
                  >
                    <MessageCircleQuestion className="size-4" aria-hidden />
                    {t("result.months.question")}
                  </button>
                ))}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
