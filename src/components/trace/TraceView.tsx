"use client";

import Link from "next/link";
import { useCase } from "@/lib/useCase";
import { useLang } from "@/components/lang/useLang";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { EventBadge } from "@/components/case/AgentTimeline";
import { cn } from "@/lib/utils";
import { decidedBy, fmtCost, fmtLatency, modelName, traceTotals, type Decider } from "./format";

const SPLIT: { who: Decider; cls: string; label: "badge.claude" | "badge.code" | "badge.user" }[] = [
  { who: "claude", cls: "bg-unsure", label: "badge.claude" },
  { who: "code", cls: "bg-ink", label: "badge.code" },
  { who: "user", cls: "bg-short-bar", label: "badge.user" },
];

/** Judge-facing trace: every event with model, effort, tokens, cost and latency. */
export function TraceView({ id }: { id: string }) {
  const { lang, t } = useLang();
  const state = useCase(id, { instant: true });
  const events = state.events;
  const totals = traceTotals(events);
  const count = Math.max(events.length, 1);
  const num = (n: number) => new Intl.NumberFormat(lang === "es" ? "es-US" : "en-US").format(n);

  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-8 sm:px-8 sm:pt-12">
        <Link href={`/case/${encodeURIComponent(id)}?lang=${lang}`} className="link-ink text-[0.95rem] font-semibold text-ink">
          {t("trace.back")}
        </Link>
        <h1 className="mt-4 font-display text-title font-medium text-ink">{t("trace.title")}</h1>
        <p className="mt-2 max-w-[60ch] text-[1.05rem] text-ink-soft">{t("trace.body")}</p>
        <p className="mt-1 font-mono text-[0.8rem] text-ink-soft">{id}</p>

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 border-y-2 border-ink py-6 sm:grid-cols-4">
          <div>
            <dt className="text-[0.85rem] font-semibold text-ink-soft">{t("trace.total.cost")}</dt>
            <dd className="mt-1 font-display text-figure font-medium text-ink">{fmtCost(totals.cost) || "$0"}</dd>
          </div>
          <div>
            <dt className="text-[0.85rem] font-semibold text-ink-soft">{t("trace.total.tokens")}</dt>
            <dd className="mt-1 font-display text-figure font-medium text-ink">
              {num(totals.inputTokens + totals.outputTokens)}
            </dd>
          </div>
          <div>
            <dt className="text-[0.85rem] font-semibold text-ink-soft">{t("trace.total.time")}</dt>
            <dd className="mt-1 font-display text-figure font-medium text-ink">{fmtLatency(totals.modelMs) || "0s"}</dd>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <dt className="text-[0.85rem] font-semibold text-ink-soft">{t("trace.split")}</dt>
            <dd className="mt-3">
              <div className="flex h-3 overflow-hidden rounded-full bg-paper-deep" aria-hidden>
                {SPLIT.map((s) => (
                  <span key={s.who} className={s.cls} style={{ width: `${(totals.byWho[s.who] / count) * 100}%` }} />
                ))}
              </div>
              <ul className="mt-2 space-y-0.5 text-[0.82rem] text-ink">
                {SPLIT.map((s) => (
                  <li key={s.who} className="flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-sm", s.cls)} aria-hidden />
                    {t(s.label)}: <span className="font-semibold tabular">{totals.byWho[s.who]}</span>
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        </dl>

        <div className="mt-8 overflow-x-auto rounded-2xl border border-rule bg-sheet">
          <table className="w-full min-w-[56rem] border-collapse text-left text-[0.88rem]">
            <thead>
              <tr className="border-b-2 border-ink text-[0.8rem] text-ink-soft">
                <th scope="col" className="px-4 py-3 font-semibold">{t("trace.col.time")}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t("trace.col.step")}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t("trace.col.what")}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t("trace.col.by")}</th>
                <th scope="col" className="px-4 py-3 font-semibold">{t("trace.col.model")}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t("trace.col.tokens")}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t("trace.col.cost")}</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">{t("trace.col.latency")}</th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b border-rule align-top last:border-0" data-decided-by={decidedBy(e)}>
                  <td className="px-4 py-3 tabular text-ink-soft">{(e.at / 1000).toFixed(1)}s</td>
                  <td className="px-4 py-3 font-mono text-[0.8rem] text-ink">{e.step}</td>
                  <td className="px-4 py-3 text-ink">
                    <span className="font-semibold">{e.title}</span>
                    {e.detail && <span className="mt-0.5 block text-ink-soft">{e.detail}</span>}
                  </td>
                  <td className="px-4 py-3">
                    <EventBadge event={{ ...e, decided_by: decidedBy(e), latency_ms: undefined, cost_usd: undefined, model: undefined }} />
                  </td>
                  <td className="px-4 py-3 text-ink">
                    {e.model ? `${modelName(e.model)}${e.effort ? ` / ${e.effort}` : ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink">
                    {e.input_tokens !== undefined
                      ? `${num(e.input_tokens)} / ${num(e.output_tokens ?? 0)} / ${num(e.cache_read_tokens ?? 0)}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular text-ink">{fmtCost(e.cost_usd) || "—"}</td>
                  <td className="px-4 py-3 text-right tabular text-ink">{fmtLatency(e.latency_ms) || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
