"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { CheckCheck } from "lucide-react";
import type { UserQuestion } from "@/lib/schemas";
import { useLang } from "@/components/lang/useLang";
import { useReducedMotion } from "@/components/motion/useReducedMotion";

const noopSubscribe = () => () => {};
const PAYERS = ["DoorDash", "Uber", "Lyft", "Instacart"] as const;
const DRIVING = "driving";

/** Which app a deposit question is about, read from its English prompt. */
function payerOf(q: UserQuestion): string | null {
  if (q.kind !== "label_deposit") return null;
  const text = q.prompt_en.toLowerCase();
  return PAYERS.find((p) => text.includes(p.toLowerCase())) ?? null;
}

type Props = {
  /** Unanswered questions in order; the sheet shows the first */
  queue: UserQuestion[];
  /** Number already answered, for the "Question n of N" counter */
  answeredCount: number;
  isOpen: boolean;
  onAnswer: (questionId: string, value: string) => Promise<void>;
  onDismiss: () => void;
};

/**
 * Bottom sheet that walks through agent questions one after another.
 * Several deposits from the same app can be confirmed in one tap.
 */
export function QuestionSheet({ queue, answeredCount, isOpen, onAnswer, onDismiss }: Props) {
  const { lang, t } = useLang();
  const reduced = useReducedMotion();
  const [sending, setSending] = useState<string | null>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Portals need document.body, which only exists on the client.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const question = isOpen ? (queue[0] ?? null) : null;

  const isShown = question !== null;
  const questionId = question?.id;

  // Remember where focus was so closing the sheet puts the driver back there.
  useEffect(() => {
    if (!isShown) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      const el = returnFocusRef.current;
      returnFocusRef.current = null;
      if (el && document.contains(el)) el.focus();
    };
  }, [isShown]);

  useEffect(() => {
    if (!questionId) return;
    const id = window.setTimeout(() => firstRef.current?.focus(), 120);
    return () => window.clearTimeout(id);
  }, [questionId]);

  // Escape closes; Tab stays inside the sheet (it is aria-modal).
  useEffect(() => {
    if (!isShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onDismiss();
        return;
      }
      if (e.key !== "Tab") return;
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input, [tabindex]:not([tabindex='-1'])");
      if (!nodes || nodes.length === 0) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (!dialogRef.current?.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isShown, onDismiss]);

  if (!mounted) return null;

  const payer = question ? payerOf(question) : null;
  const sameApp = payer
    ? queue.filter((q) => payerOf(q) === payer && q.options.some((o) => o.value === DRIVING))
    : [];
  const total = answeredCount + queue.length;

  const choose = async (value: string) => {
    if (!question) return;
    setSending(value);
    try {
      await onAnswer(question.id, value);
    } finally {
      setSending(null);
    }
  };

  const confirmAll = async () => {
    setSending("__all");
    try {
      for (const q of sameApp) await onAnswer(q.id, DRIVING);
    } finally {
      setSending(null);
    }
  };

  return createPortal(
    <AnimatePresence>
      {question && (
        <div className="fixed inset-0 z-50 flex items-end justify-center" key="question-sheet">
          <motion.div
            className="absolute inset-0 bg-ink/35"
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onDismiss}
            aria-hidden
          />
          <motion.div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="question-title"
            initial={reduced ? false : { y: "100%" }}
            animate={{ y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 32 }}
            className="relative w-full max-w-lg overflow-hidden rounded-t-[1.75rem] bg-sheet px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-20px_50px_-20px_rgba(26,34,50,0.5)] sm:mb-6 sm:rounded-[1.75rem]"
          >
            {/* Polite announcement for each new question; the visible text below is not live itself. */}
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              {total > 1 ? t("question.counter", { n: answeredCount + 1, total }) : t("question.title")}
              {". "}
              {lang === "es" ? question.prompt_es : question.prompt_en}
            </p>
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-rule" aria-hidden />
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.9rem] font-semibold text-unsure">
                {total > 1 ? t("question.counter", { n: answeredCount + 1, total }) : t("question.title")}
              </p>
              {total > 1 && (
                <span className="flex gap-1" aria-hidden>
                  {Array.from({ length: total }, (_, i) => (
                    <span
                      key={i}
                      className={i < answeredCount ? "h-1.5 w-4 rounded-full bg-unsure" : "h-1.5 w-4 rounded-full bg-rule"}
                    />
                  ))}
                </span>
              )}
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={question.id}
                initial={reduced ? false : { opacity: 0, x: 28 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, x: -28 }}
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              >
                <h2 id="question-title" className="mt-1 font-display text-[1.5rem] font-medium leading-snug text-ink">
                  {lang === "es" ? question.prompt_es : question.prompt_en}
                </h2>
                <div className="mt-5 grid gap-2.5">
                  {question.options.map((o, i) => (
                    <button
                      key={o.value}
                      ref={i === 0 ? firstRef : undefined}
                      type="button"
                      disabled={sending !== null}
                      onClick={() => choose(o.value)}
                      data-option={o.value}
                      className="tap w-full rounded-full border-[1.5px] border-ink/30 bg-sheet px-5 text-[1.02rem] font-semibold text-ink transition-colors hover:border-ink hover:bg-ink hover:text-sheet disabled:opacity-50"
                    >
                      {sending === o.value ? t("question.sending") : lang === "es" ? o.label_es : o.label_en}
                    </button>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>
            {sameApp.length > 1 && payer && (
              <button
                type="button"
                disabled={sending !== null}
                onClick={confirmAll}
                data-testid="answer-all"
                className="tap mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-unsure-tint px-5 text-[0.98rem] font-semibold text-unsure hover:bg-unsure hover:text-sheet disabled:opacity-50"
              >
                <CheckCheck className="size-5 shrink-0" aria-hidden />
                {sending === "__all" ? t("question.sending") : t("question.all_yes", { count: sameApp.length, payer })}
              </button>
            )}
            <button
              type="button"
              onClick={onDismiss}
              className="tap mt-2 w-full rounded-full text-[0.95rem] font-semibold text-ink-soft hover:text-ink"
            >
              {t("question.later")}
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
