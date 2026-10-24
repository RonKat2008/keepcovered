"use client";

import { useEffect, useState } from "react";
import { getQuestions, type ScreenerQuestion } from "@/lib/api";
import type { ExemptionAnswers } from "@/lib/schemas";
import { useLang } from "@/components/lang/useLang";
import { cn } from "@/lib/utils";

type Answer = ExemptionAnswers[string];

const CHOICES: { value: Answer; key: "flow.questions.yes" | "flow.questions.no" | "flow.questions.not_sure" }[] = [
  { value: "yes", key: "flow.questions.yes" },
  { value: "no", key: "flow.questions.no" },
  { value: "not_sure", key: "flow.questions.not_sure" },
];

type Props = {
  answers: ExemptionAnswers;
  onChange: (next: ExemptionAnswers) => void;
};

export function Questionnaire({ answers, onChange }: Props) {
  const { lang, t } = useLang();
  const [questions, setQuestions] = useState<ScreenerQuestion[] | null>(null);

  useEffect(() => {
    let alive = true;
    getQuestions(lang).then((qs) => {
      if (alive) setQuestions(qs);
    });
    return () => {
      alive = false;
    };
  }, [lang]);

  if (!questions) {
    return <p className="py-6 text-ink-soft">{t("flow.questions.loading")}</p>;
  }

  return (
    <ol className="divide-y divide-rule border-y border-rule">
      {questions.map((q, i) => {
        const text = lang === "es" ? q.question_es : q.question_en;
        const labelId = `q-${q.id}-label`;
        return (
          <li key={q.id} className="py-4">
            <p id={labelId} className="flex gap-3 text-[1.02rem] leading-snug text-ink">
              <span className="font-display tabular text-ink-soft" aria-hidden>
                {i + 1}.
              </span>
              <span>{text}</span>
            </p>
            <div role="radiogroup" aria-labelledby={labelId} className="mt-3 flex flex-wrap gap-2 pl-7">
              {CHOICES.map((c, ci) => {
                const checked = answers[q.id] === c.value;
                // Radio-group contract: one tab stop per question, arrow keys move and select.
                const hasChoice = answers[q.id] !== undefined;
                const isTabStop = hasChoice ? checked : ci === 0;
                return (
                  <button
                    key={c.value}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    tabIndex={isTabStop ? 0 : -1}
                    onKeyDown={(e) => {
                      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
                      if (step === 0) return;
                      e.preventDefault();
                      const target = CHOICES[(ci + step + CHOICES.length) % CHOICES.length];
                      onChange({ ...answers, [q.id]: target.value });
                      const group = e.currentTarget.parentElement;
                      requestAnimationFrame(() =>
                        group?.querySelector<HTMLElement>(`[data-value="${target.value}"]`)?.focus(),
                      );
                    }}
                    data-question={q.id}
                    data-value={c.value}
                    onClick={() => {
                      const next = { ...answers };
                      if (checked) delete next[q.id];
                      else next[q.id] = c.value;
                      onChange(next);
                    }}
                    className={cn(
                      "tap min-w-[5.5rem] rounded-full border-[1.5px] px-4 text-[0.98rem] font-semibold transition-colors",
                      checked
                        ? c.value === "not_sure"
                          ? "border-unsure bg-unsure text-sheet"
                          : "border-ink bg-ink text-sheet"
                        : "border-ink/25 bg-sheet text-ink hover:border-ink",
                    )}
                  >
                    {t(c.key)}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
