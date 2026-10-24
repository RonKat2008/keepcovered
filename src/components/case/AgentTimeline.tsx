"use client";

import { AnimatePresence, motion } from "motion/react";
import { Cpu, Sparkles, UserRound } from "lucide-react";
import type { AgentEvent } from "@/lib/schemas";
import { useLang } from "@/components/lang/useLang";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { decidedBy, fmtCost, fmtLatency, modelName } from "@/components/trace/format";
import { cn } from "@/lib/utils";

const WHO = {
  claude: { dot: "bg-unsure", icon: Sparkles, chip: "bg-unsure-tint text-unsure" },
  code: { dot: "bg-ink", icon: Cpu, chip: "bg-paper-deep text-ink" },
  user: { dot: "bg-short-bar", icon: UserRound, chip: "bg-short-tint text-short" },
} as const;

export function EventBadge({ event }: { event: AgentEvent }) {
  const { t } = useLang();
  const who = decidedBy(event);
  const meta = WHO[who];
  const Icon = meta.icon;
  const parts =
    who === "claude"
      ? [t("badge.claude"), modelName(event.model), fmtLatency(event.latency_ms), fmtCost(event.cost_usd)]
      : who === "code"
        ? [t("badge.code"), fmtLatency(event.latency_ms)]
        : [t("badge.user")];
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.78rem] font-semibold tabular",
        meta.chip,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
        {parts.filter(Boolean).join(" · ")}
      </span>
    </span>
  );
}

type Props = { events: AgentEvent[]; isRunning: boolean; isWaiting?: boolean };

/** Live vertical timeline. Nodes pop in as SSE events arrive. */
export function AgentTimeline({ events, isRunning, isWaiting }: Props) {
  const { t } = useLang();
  const reduced = useReducedMotion();
  const pop = reduced
    ? { initial: false as const }
    : {
        initial: { opacity: 0, scale: 0.92, y: 10 },
        animate: { opacity: 1, scale: 1, y: 0 },
      };

  return (
    <ol className="relative" aria-live="polite" aria-relevant="additions">
      <span className="absolute bottom-3 left-[0.6rem] top-3 w-px bg-rule" aria-hidden />
      <AnimatePresence initial={false}>
        {events.map((e) => (
          <motion.li
            key={e.id}
            layout={!reduced}
            {...pop}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="relative pb-5 pl-9"
          >
            <span
              className={cn(
                "absolute left-[0.2rem] top-1.5 size-[0.85rem] rounded-full ring-4 ring-sheet",
                WHO[decidedBy(e)].dot,
              )}
              aria-hidden
            />
            <p className="text-[1rem] font-semibold leading-snug text-ink">{e.title}</p>
            {e.detail && <p className="mt-0.5 text-[0.92rem] leading-snug text-ink-soft">{e.detail}</p>}
            <div className="mt-2">
              <EventBadge event={e} />
            </div>
          </motion.li>
        ))}
        {isRunning && (
          <motion.li
            key="pending"
            layout={!reduced}
            initial={reduced ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="relative pl-9"
          >
            <span
              className="absolute left-[0.2rem] top-1 size-[0.85rem] rounded-full border-2 border-ink/40 bg-sheet ring-4 ring-sheet motion-safe:animate-pulse"
              aria-hidden
            />
            <p className="text-[0.95rem] text-ink-soft">
              {isWaiting ? t("case.progress.waiting") : t("common.loading")}
            </p>
          </motion.li>
        )}
      </AnimatePresence>
    </ol>
  );
}
