"use client";

import Link from "next/link";
import { CalendarPlus, FileDown, LifeBuoy, Phone, Wand2 } from "lucide-react";
import type { CaseResult, Deadline, ExemptionScreen } from "@/lib/schemas";
import { deadlinesUrl, packetUrl } from "@/lib/api";
import { fmtDate } from "@/lib/i18n";
import { useLang } from "@/components/lang/useLang";
import { cn } from "@/lib/utils";

// ---------- Section shell ----------

export function Section({
  id,
  title,
  children,
  className,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="font-display text-[1.55rem] font-medium leading-tight text-ink sm:text-[1.8rem]">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// ---------- Exemptions ----------

const OUTCOME_ORDER: Record<ExemptionScreen["outcome"], number> = { may_qualify: 0, ask_navigator: 1, not_indicated: 2 };

const OUTCOME_STYLE: Record<ExemptionScreen["outcome"], { key: "exempt.may_qualify" | "exempt.ask_navigator" | "exempt.not_indicated"; cls: string }> = {
  may_qualify: { key: "exempt.may_qualify", cls: "bg-meets text-sheet" },
  ask_navigator: { key: "exempt.ask_navigator", cls: "bg-unsure text-sheet" },
  not_indicated: { key: "exempt.not_indicated", cls: "bg-paper-deep text-ink-soft" },
};

function ExemptionList({ items }: { items: ExemptionScreen[] }) {
  const { lang, t } = useLang();
  return (
    <ul className="divide-y divide-rule border-y border-rule">
      {items.map((e) => {
          const style = OUTCOME_STYLE[e.outcome];
          const muted = e.outcome === "not_indicated";
          return (
            <li key={e.id} className="flex flex-col gap-2 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div>
                <p className={cn("text-[1.02rem] font-semibold", muted ? "text-ink-soft" : "text-ink")}>
                  {lang === "es" ? e.label_es : e.label_en}
                </p>
                {e.source && (
                  <p className="mt-1 text-[0.85rem] text-ink-soft">
                    {t("exempt.source", { doc: e.source.doc.toUpperCase(), page: e.source.page })}
                  </p>
                )}
              </div>
              <span className={cn("inline-flex w-fit shrink-0 rounded-full px-3 py-1.5 text-[0.85rem] font-semibold", style.cls)}>
                {t(style.key)}
              </span>
            </li>
          );
        })}
    </ul>
  );
}

export function Exemptions({ items }: { items: ExemptionScreen[] }) {
  const { t } = useLang();
  const sorted = [...items].sort((a, b) => OUTCOME_ORDER[a.outcome] - OUTCOME_ORDER[b.outcome]);
  const flagged = sorted.filter((e) => e.outcome !== "not_indicated");
  const others = sorted.filter((e) => e.outcome === "not_indicated");
  return (
    <>
      <p className="max-w-[60ch] text-[1rem] leading-relaxed text-ink-soft">{t("exempt.body")}</p>
      {flagged.length > 0 && (
        <div className="mt-4">
          <ExemptionList items={flagged} />
        </div>
      )}
      {others.length > 0 && (
        <details className="group mt-4">
          <summary className="tap flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-1 font-semibold text-ink hover:bg-paper-deep/60">
            {t("exempt.others", { count: others.length })}
            <span className="text-ink-soft transition-transform group-open:rotate-45" aria-hidden>
              +
            </span>
          </summary>
          <div className="mt-2">
            <ExemptionList items={others} />
          </div>
        </details>
      )}
    </>
  );
}

// ---------- Deadlines ----------

const DAY_MS = 86_400_000;

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / DAY_MS);
}

function icsEscape(s: string): string {
  return s.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
}

/** Client-side .ics for fixture mode. The live backend serves /api/cases/{id}/deadlines.ics. */
export function buildIcs(deadlines: Deadline[], lang: "en" | "es"): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const events = deadlines.map((d) => {
    const date = d.date.replace(/-/g, "");
    return [
      "BEGIN:VEVENT",
      `UID:${d.id}@keepcovered.demo`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${date}`,
      `SUMMARY:${icsEscape(lang === "es" ? d.title_es : d.title_en)}`,
      "BEGIN:VALARM",
      "TRIGGER:-P2D",
      "ACTION:DISPLAY",
      "DESCRIPTION:KeepCovered",
      "END:VALARM",
      "END:VEVENT",
    ].join("\r\n");
  });
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//KeepCovered//EN", ...events, "END:VCALENDAR"].join("\r\n");
}

export function Deadlines({
  caseId,
  deadlines,
  isFixture,
}: {
  caseId: string;
  deadlines: Deadline[];
  isFixture: boolean;
}) {
  const { lang, t } = useLang();
  const sorted = [...deadlines].sort((a, b) => a.date.localeCompare(b.date));

  const downloadFixtureIcs = () => {
    const blob = new Blob([buildIcs(sorted, lang)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "keepcovered-deadlines.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <>
      <ol className="space-y-3">
        {sorted.map((d) => {
          const days = daysUntil(d.date);
          const isLetter = d.kind === "respond_to_letter";
          const rel = days === 0 ? t("deadline.today") : days < 0 ? t("deadline.passed") : t("deadline.days", { days });
          const [, , dd] = d.date.split("-");
          return (
            <li
              key={d.id}
              className={cn(
                "grid grid-cols-[3.6rem_1fr] items-center gap-4 rounded-2xl p-3",
                isLetter ? "bg-short-tint ring-1 ring-inset ring-short/30" : "bg-paper/70",
              )}
            >
              <div className="flex h-16 flex-col items-center justify-center rounded-xl bg-sheet ring-1 ring-inset ring-rule">
                <span className="font-display text-[1.6rem] font-semibold leading-none text-ink tabular">{Number(dd)}</span>
                <span className="mt-1 text-[0.7rem] font-semibold text-ink-soft">
                  {new Intl.DateTimeFormat(lang === "es" ? "es-US" : "en-US", { month: "short", timeZone: "UTC" }).format(
                    new Date(`${d.date}T00:00:00Z`),
                  )}
                </span>
              </div>
              <div>
                <p className="text-[0.98rem] font-semibold leading-snug text-ink">{lang === "es" ? d.title_es : d.title_en}</p>
                <p className="mt-0.5 text-[0.85rem] text-ink-soft">
                  {fmtDate(d.date, lang)} ({rel})
                </p>
              </div>
            </li>
          );
        })}
      </ol>
      {isFixture ? (
        <button type="button" onClick={downloadFixtureIcs} className="btn-line mt-4 w-full">
          <CalendarPlus className="size-5" aria-hidden />
          {t("deadline.ics")}
        </button>
      ) : (
        <a href={deadlinesUrl(caseId)} download className="btn-line mt-4 w-full">
          <CalendarPlus className="size-5" aria-hidden />
          {t("deadline.ics")}
        </a>
      )}
    </>
  );
}

// ---------- Packet ----------

export function PacketCard({ caseId, isFixture }: { caseId: string; isFixture: boolean }) {
  const { t } = useLang();
  return (
    <div className="rounded-2xl bg-ink p-5 text-sheet">
      <p className="font-display text-[1.35rem] font-medium">{t("packet.title")}</p>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-sheet/80">{t("packet.body")}</p>
      <a
        href={packetUrl(caseId)}
        download
        aria-disabled={isFixture}
        onClick={(e) => {
          if (isFixture) e.preventDefault();
        }}
        className={cn(
          "tap mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-sheet px-5 font-semibold text-ink transition-transform hover:-translate-y-px",
          isFixture && "opacity-60",
        )}
      >
        <FileDown className="size-5" aria-hidden />
        {t("packet.download")}
      </a>
      {isFixture && <p className="mt-2 text-[0.8rem] text-sheet/70">{t("case.fixture.note")}</p>}
    </div>
  );
}

// ---------- Portal CTA ----------

export function PortalCta({ caseId }: { caseId: string }) {
  const { lang, t } = useLang();
  return (
    <div className="rounded-2xl border-[1.5px] border-ink p-5">
      <p className="font-display text-[1.25rem] font-medium leading-snug text-ink">{t("portal.cta.title")}</p>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink-soft">{t("portal.cta.body")}</p>
      <Link
        href={`/case/${encodeURIComponent(caseId)}/portal?lang=${lang}`}
        className="btn-ink mt-4 w-full"
        data-testid="portal-cta"
      >
        <Wand2 className="size-5" aria-hidden />
        {t("portal.cta.button")}
      </Link>
    </div>
  );
}

// ---------- Navigator handoff ----------

// Verify before use: phone numbers below were taken from public listings and must be
// re-checked against DHCS (Medi-Cal helpline) and Bay Area Legal Aid before the demo ships.
const HELPLINES = [
  { key: "nav.medical" as const, number: "1-800-541-5555", tel: "+18005415555" },
  { key: "nav.legal" as const, number: "855-693-7285", tel: "+18556937285" },
];

export function NavigatorCard({ result }: { result: CaseResult }) {
  const { t } = useLang();
  return (
    <div className="rounded-2xl bg-unsure-tint p-5">
      <p className="flex items-center gap-2 font-display text-[1.3rem] font-medium text-ink">
        <LifeBuoy className="size-5 text-unsure" aria-hidden />
        {t("nav.title")}
      </p>
      <p className="mt-2 text-[0.95rem] leading-relaxed text-ink">{t("nav.body")}</p>
      {result.needs_navigator && result.navigator_reasons.length > 0 && (
        <>
          <p className="mt-4 text-[0.85rem] font-semibold text-unsure">{t("nav.reasons")}</p>
          <ul className="mt-1.5 space-y-1.5 text-[0.92rem] leading-snug text-ink">
            {result.navigator_reasons.map((r) => (
              <li key={r} className="flex gap-2">
                <span className="mt-[0.5rem] size-1.5 shrink-0 rounded-full bg-unsure" aria-hidden />
                {r}
              </li>
            ))}
          </ul>
        </>
      )}
      <ul className="mt-4 space-y-2">
        {HELPLINES.map((h) => (
          <li key={h.tel}>
            <a
              href={`tel:${h.tel}`}
              className="tap flex items-center justify-between gap-3 rounded-xl bg-sheet px-4 py-2 ring-1 ring-inset ring-unsure/20 transition-colors hover:ring-unsure"
            >
              <span>
                <span className="block text-[0.85rem] text-ink-soft">{t(h.key)}</span>
                <span className="block font-semibold tabular text-ink">{h.number}</span>
              </span>
              <Phone className="size-5 shrink-0 text-unsure" aria-label={t("nav.call", { number: h.number })} />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
