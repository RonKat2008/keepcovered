"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MotionConfig, motion } from "motion/react";
import { CalendarClock, MessageCircleQuestion } from "lucide-react";
import { useCase } from "@/lib/useCase";
import type { CaseResult } from "@/lib/schemas";
import { fmtDate } from "@/lib/i18n";
import { useLang } from "@/components/lang/useLang";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { AgentTimeline } from "./AgentTimeline";
import { Explanation } from "./Explanation";
import { MonthLedger } from "./MonthLedger";
import { QuestionSheet } from "./QuestionSheet";
import { Deadlines, Exemptions, NavigatorCard, PacketCard, PortalCta, Section } from "./ResultSections";
import { fixtureResultFor } from "./fixture-replay";

function headline(result: CaseResult, t: ReturnType<typeof useLang>["t"]): string {
  const total = result.months.length;
  const meets = result.months.filter((m) => m.overall === "meets").length;
  if (meets === 0) return t("result.heading.none");
  if (meets === total) return t("result.heading.all", { total });
  return t("result.heading.some", { meets, total });
}

export function CaseView({ id }: { id: string }) {
  const { lang, t } = useLang();
  const reduced = useReducedMotion();
  const state = useCase(id);
  // Ids the user put off with "Answer later". New questions that arrive later reopen the sheet.
  const [deferred, setDeferred] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  // After the result is in, the sheet only opens when the user asks (a reloaded case should not pop it up).
  const [isUserOpened, setIsUserOpened] = useState(false);

  const isFixture = state.source === "fixture";
  const result = state.result && isFixture ? fixtureResultFor(lang) : state.result;
  const isDone = state.phase === "done" && result !== null;
  const answeredCount = Object.keys(state.answered).length;
  const pending = isDone
    ? (result?.questions ?? []).filter((q) => !(q.id in state.answered))
    : state.questions;
  // A tapped "answer this month's question" moves that question to the front.
  const queue = focusId
    ? [...pending.filter((q) => q.id === focusId), ...pending.filter((q) => q.id !== focusId)]
    : pending;
  const isSheetOpen = (!isDone || isUserOpened) && queue.some((q) => !deferred.includes(q.id));

  // When the result lands, move focus from the (now closed) question sheet to the headline.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!isDone) return;
    const id = window.setTimeout(() => headingRef.current?.focus({ preventScroll: true }), 450);
    return () => window.clearTimeout(id);
  }, [isDone]);

  const { answer: answerCase } = state;
  const answer = useCallback(
    async (questionId: string, value: string) => {
      await answerCase(questionId, value);
    },
    [answerCase],
  );
  const queueIds = queue.map((q) => q.id).join("|");
  const dismiss = useCallback(() => {
    setFocusId(null);
    setIsUserOpened(false);
    setDeferred(queueIds.split("|"));
  }, [queueIds]);
  const reopen = (qid?: string) => {
    setFocusId(qid ?? null);
    setIsUserOpened(true);
    setDeferred([]);
  };
  const letterDeadline = result?.deadlines.find((d) => d.kind === "respond_to_letter");

  return (
    <MotionConfig reducedMotion="user">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-8">
        {isFixture && (
          <p className="mt-2 inline-flex rounded-full bg-paper-deep px-3 py-1 text-[0.8rem] font-semibold text-ink-soft">
            {t("case.fixture.note")}
          </p>
        )}

        {!isDone && (
          <section className="mx-auto max-w-2xl pt-8 sm:pt-14" aria-labelledby="progress-heading">
            <h1 id="progress-heading" className="font-display text-title font-medium text-ink">
              {state.phase === "error" ? t("case.progress.error") : t("case.progress.title")}
            </h1>
            <p className="mt-3 text-[1.05rem] text-ink-soft">
              {state.phase === "connecting" ? t("case.progress.connecting") : t("case.progress.body")}
            </p>
            {queue.length > 0 && !isSheetOpen && (
              <button
                type="button"
                className="tap mt-5 inline-flex items-center gap-2 rounded-full bg-unsure px-5 font-semibold text-sheet"
                onClick={() => reopen()}
              >
                <MessageCircleQuestion className="size-5" aria-hidden />
                {t("question.open")}
              </button>
            )}
            <div className="sheet mt-8 rounded-[1.5rem] p-5 sm:p-7">
              <AgentTimeline
                events={state.events}
                isRunning={state.phase !== "error"}
                isWaiting={state.phase === "waiting"}
              />
            </div>
          </section>
        )}

        {isDone && result && (
          <motion.div
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="pt-8 sm:pt-12"
          >
            <header className="max-w-4xl">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="font-display text-display font-medium text-ink outline-none [text-wrap:balance]"
                data-testid="result-heading"
              >
                {headline(result, t)}
              </h1>
              <p className="mt-4 max-w-[56ch] text-[1.1rem] leading-relaxed text-ink-soft">{t("result.county")}</p>
            </header>

            {letterDeadline && (
              <p className="mt-6 flex items-center gap-3 rounded-2xl bg-short-tint p-4 text-ink ring-1 ring-inset ring-short/30 lg:hidden">
                <CalendarClock className="size-5 shrink-0 text-short" aria-hidden />
                <span className="font-semibold">
                  {lang === "es" ? letterDeadline.title_es : letterDeadline.title_en}: {fmtDate(letterDeadline.date, lang)}
                </span>
              </p>
            )}

            {pending.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl bg-unsure-tint p-4">
                <MessageCircleQuestion className="size-5 text-unsure" aria-hidden />
                <p className="flex-1 font-semibold text-ink">
                  {pending.length === 1
                    ? t("question.pending", { count: 1 })
                    : t("question.pending.many", { count: pending.length })}
                </p>
                <button
                  type="button"
                  onClick={() => reopen()}
                  className="tap rounded-full bg-unsure px-5 font-semibold text-sheet"
                >
                  {t("question.open")}
                </button>
              </div>
            )}

            <div className="mt-10 grid gap-x-14 gap-y-14 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0 space-y-14">
                <Section id="months-title" title={t("result.months.title")}>
                  <p className="-mt-1 mb-4 text-[0.98rem] text-ink-soft">{t("result.months.needs")}</p>
                  <MonthLedger
                    months={result.months}
                    answered={state.answered}
                    askableIds={result.questions.map((q) => q.id)} onOpenQuestion={(qid) => reopen(qid)} />
                </Section>

                <Section id="explain-title" title={t("explain.title")}>
                  <Explanation spans={result.explanation} />
                </Section>

                <Section id="exempt-title" title={t("exempt.title")}>
                  <Exemptions items={result.exemptions} />
                </Section>

                <details className="group rounded-2xl border border-rule bg-sheet/60 p-5">
                  <summary className="tap flex cursor-pointer list-none items-center justify-between font-display text-[1.2rem] font-medium text-ink">
                    {t("case.timeline.show")}
                    <span className="text-ink-soft transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <div className="mt-5">
                    <AgentTimeline events={state.events} isRunning={false} />
                    <Link href={`/trace/${encodeURIComponent(id)}?lang=${lang}`} className="link-ink inline-flex min-h-11 items-center font-semibold text-ink">
                      {t("case.trace.link")}
                    </Link>
                  </div>
                </details>
              </div>

              <aside className="space-y-6 lg:sticky lg:top-6 lg:self-start">
                <Section id="deadline-title" title={t("deadline.title")}>
                  <Deadlines caseId={id} deadlines={result.deadlines} isFixture={isFixture} />
                </Section>
                <PacketCard caseId={id} isFixture={isFixture} />
                <PortalCta caseId={id} />
                <NavigatorCard result={result} />
              </aside>
            </div>
          </motion.div>
        )}
      </main>
      <QuestionSheet
        queue={queue}
        answeredCount={answeredCount}
        isOpen={isSheetOpen}
        onAnswer={answer}
        onDismiss={dismiss}
      />
    </MotionConfig>
  );
}
