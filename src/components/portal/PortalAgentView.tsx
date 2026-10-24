"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { Check, CircleAlert, Lock, MousePointer2, X } from "lucide-react";
import {
  BackendUnavailableError,
  PortalMessage,
  fixtureForced,
  readSSE,
  startPortal,
  submitPortal,
  type PortalAction,
  type PortalDiffRow,
} from "@/lib/api";
import { useLang } from "@/components/lang/useLang";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { cn } from "@/lib/utils";
import { FIXTURE_DIFF, FIXTURE_STEPS, FIXTURE_SUMMARY, SKETCH_FIELDS } from "./portal-fixture";
import { PortalSketch } from "./PortalSketch";

type Phase = "starting" | "running" | "review" | "submitting" | "submitted" | "error";
type LogItem = { id: number; text: string; simulated?: boolean };
type Point = { x: number; y: number };

/** "income_amount" → "Income amount" */
function fieldLabel(field: string): string {
  const spaced = field.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function actionText(action: PortalAction | string | null | undefined): string | null {
  if (!action) return null;
  if (typeof action === "string") return action;
  if (action.description) return action.description;
  const parts = [action.type, action.field, action.value].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

export function PortalAgentView({ id }: { id: string }) {
  const { lang, t } = useLang();
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<Phase>("starting");
  const [isFixture, setIsFixture] = useState(false);
  const [frame, setFrame] = useState<string | null>(null);
  const [frameSize, setFrameSize] = useState<{ w: number; h: number } | null>(null);
  const [cursor, setCursor] = useState<Point>({ x: 50, y: 40 });
  const [log, setLog] = useState<LogItem[]>([]);
  const [summary, setSummary] = useState("");
  const [diff, setDiff] = useState<PortalDiffRow[]>([]);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSheetCollapsed, setIsSheetCollapsed] = useState(false);
  // Fixture sketch state
  const [sketchPage, setSketchPage] = useState<"signin" | "report" | "upload" | "review">("signin");
  const [filled, setFilled] = useState<Record<string, string>>({});
  const logId = useRef(0);
  const pendingPoint = useRef<Point | null>(null);

  const pushLog = useCallback((text: string, simulated?: boolean) => {
    logId.current += 1;
    const item = { id: logId.current, text, simulated };
    setLog((l) => [...l, item].slice(-40));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];
    let disposed = false;

    const runFixture = () => {
      if (disposed) return;
      setIsFixture(true);
      setPhase("running");
      let at = 0;
      FIXTURE_STEPS.forEach((step, i) => {
        at += reduced ? 60 : step.delay;
        timers.push(
          setTimeout(() => {
            if (disposed) return;
            pushLog(step.text);
            if (step.kind === "page") {
              setSketchPage(step.page);
              setCursor({ x: step.page === "signin" ? 30 : 74, y: step.page === "signin" ? 52 : 88 });
            } else {
              const idx = SKETCH_FIELDS.findIndex((f) => f.key === step.field);
              const value = SKETCH_FIELDS[idx]?.value ?? "";
              setFilled((f) => ({ ...f, [step.field]: value }));
              setCursor({ x: 64, y: step.field === "proof_packet" ? 44 : 24 + idx * 10.5 });
            }
            if (i === FIXTURE_STEPS.length - 1) {
              setSummary(FIXTURE_SUMMARY);
              setDiff(FIXTURE_DIFF);
              setPhase("review");
            }
          }, at),
        );
      });
    };

    const handle = (raw: unknown) => {
      const parsed = PortalMessage.safeParse(raw);
      if (!parsed.success || disposed) return;
      const msg = parsed.data;
      switch (msg.type) {
        case "screenshot": {
          setFrame(`data:image/jpeg;base64,${msg.png_base64}`);
          if (msg.width && msg.height) setFrameSize({ w: msg.width, h: msg.height });
          const text = actionText(msg.action);
          if (text) pushLog(text);
          const a = typeof msg.action === "object" && msg.action ? msg.action : null;
          if (a && typeof a.x === "number" && typeof a.y === "number") pendingPoint.current = { x: a.x, y: a.y };
          setPhase((p) => (p === "starting" ? "running" : p));
          break;
        }
        case "step":
          pushLog(msg.text, msg.simulated);
          setPhase((p) => (p === "starting" ? "running" : p));
          break;
        case "ready_to_submit":
          setSummary(msg.summary);
          setDiff(msg.diff);
          setPhase("review");
          break;
        case "error":
          setError(msg.message);
          setPhase("error");
          break;
        case "submitted":
          setConfirmation(msg.confirmation);
          setPhase("submitted");
          break;
      }
    };

    const run = async () => {
      if (fixtureForced()) return runFixture();
      try {
        const res = await startPortal(id, controller.signal);
        await readSSE(res, handle, controller.signal);
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof BackendUnavailableError) return runFixture();
        setError(t("portal.error"));
        setPhase("error");
      }
    };
    void run();

    return () => {
      disposed = true;
      controller.abort();
      timers.forEach(clearTimeout);
    };
    // t only changes copy; restarting the agent on a language switch would be wrong.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, pushLog, reduced]);

  // Convert the latest live pointer (screenshot pixels) into a percentage once we know the frame size.
  useEffect(() => {
    const p = pendingPoint.current;
    if (!p || !frameSize) return;
    pendingPoint.current = null;
    setCursor({ x: (p.x / frameSize.w) * 100, y: (p.y / frameSize.h) * 100 });
  }, [frame, frameSize]);

  const hasMismatch = diff.some((d) => !d.ok);

  const submit = async () => {
    if (hasMismatch) return;
    setPhase("submitting");
    if (isFixture) {
      setTimeout(() => {
        setConfirmation(`DEMO-CONF-${Math.floor(100000 + Math.random() * 900000)}`);
        setPhase("submitted");
      }, reduced ? 0 : 900);
      return;
    }
    try {
      const conf = await submitPortal(id);
      if (conf) {
        setConfirmation(conf);
        setPhase("submitted");
      }
    } catch {
      setError(t("portal.error"));
      setPhase("error");
    }
  };

  const showSheet = phase === "review" || phase === "submitting";

  return (
    <MotionConfig reducedMotion="user">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[28rem] pt-8 sm:px-8 sm:pt-12 lg:pb-24">
        <Link href={`/case/${encodeURIComponent(id)}?lang=${lang}`} className="link-ink text-[0.95rem] font-semibold text-ink">
          {t("portal.back")}
        </Link>
        <h1 className="mt-4 font-display text-title font-medium text-ink">
          {phase === "submitted" ? t("portal.submitted.title") : t("portal.title")}
        </h1>
        <p className="mt-2 max-w-[60ch] text-[1.05rem] text-ink-soft">
          {phase === "submitted" && confirmation
            ? t("portal.submitted.body", { confirmation })
            : phase === "starting"
              ? t("portal.starting")
              : t("portal.body")}
        </p>
        {isFixture && (
          <p className="mt-3 inline-flex rounded-full bg-paper-deep px-3 py-1 text-[0.8rem] font-semibold text-ink-soft">
            {t("case.fixture.note")}
          </p>
        )}

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          {/* Live frame */}
          <figure className="min-w-0">
            <div className="overflow-hidden rounded-2xl border-2 border-ink bg-sheet shadow-[0_24px_40px_-30px_rgba(26,34,50,0.7)]">
              <div className="flex items-center gap-2 border-b border-rule bg-paper-deep px-3 py-2">
                <span className="flex gap-1.5" aria-hidden>
                  <span className="size-2.5 rounded-full bg-ink/25" />
                  <span className="size-2.5 rounded-full bg-ink/25" />
                  <span className="size-2.5 rounded-full bg-ink/25" />
                </span>
                <span className="ml-2 flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-sheet px-3 py-1 text-[0.78rem] text-ink-soft">
                  <Lock className="size-3 shrink-0" aria-hidden />
                  <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">/portal-demo</span>
                </span>
                {phase !== "submitted" && phase !== "error" && (
                  <span className="inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-unsure">
                    <span className="size-2 rounded-full bg-unsure motion-safe:animate-pulse" aria-hidden />
                    Live
                  </span>
                )}
              </div>
              <div className="relative aspect-[4/3] w-full bg-white" aria-label={t("portal.frame.label")} role="img">
                {frame ? (
                  // eslint-disable-next-line @next/next/no-img-element -- streamed base64 frame
                  <img
                    src={frame}
                    alt=""
                    className="absolute inset-0 size-full object-contain object-top"
                    onLoad={(e) => {
                      const img = e.currentTarget;
                      if (!frameSize) setFrameSize({ w: img.naturalWidth, h: img.naturalHeight });
                    }}
                  />
                ) : isFixture ? (
                  <PortalSketch page={sketchPage} filled={filled} />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-ink-soft">{t("portal.starting")}</div>
                )}
                {phase !== "submitted" && (frame || isFixture) && (
                  <motion.div
                    className="pointer-events-none absolute left-0 top-0 z-10"
                    animate={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
                    transition={reduced ? { duration: 0 } : { type: "spring", stiffness: 120, damping: 18 }}
                    aria-hidden
                  >
                    <span className="absolute -left-4 -top-4 size-8 rounded-full bg-unsure/20 motion-safe:animate-ping" />
                    <MousePointer2 className="size-6 fill-unsure text-sheet drop-shadow" />
                  </motion.div>
                )}
              </div>
            </div>
            <figcaption className="sr-only">{t("portal.frame.label")}</figcaption>
          </figure>

          {/* Action log */}
          <section aria-labelledby="log-title">
            <h2 id="log-title" className="font-display text-[1.3rem] font-medium text-ink">
              {t("portal.log")}
            </h2>
            <ol className="mt-3 space-y-2" aria-live="polite">
              <AnimatePresence initial={false}>
                {log.map((item) => (
                  <motion.li
                    key={item.id}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-2.5 text-[0.95rem] leading-snug text-ink"
                  >
                    <Check className="mt-0.5 size-4 shrink-0 text-meets" aria-hidden />
                    <span>
                      {item.text}
                      {item.simulated && <span className="ml-1 text-ink-soft">(demo)</span>}
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ol>
            {error && (
              <p role="alert" className="mt-4 flex gap-2 rounded-xl bg-short-tint p-3 text-[0.95rem] text-ink">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-short" aria-hidden />
                {error}
              </p>
            )}
            {phase === "submitted" && confirmation && (
              <p className="mt-5 rounded-2xl bg-meets-tint p-4 text-ink" role="status">
                <span className="block text-[0.85rem] font-semibold text-meets">{t("portal.submitted.title")}</span>
                <span className="mt-1 block font-mono text-[1.1rem] font-semibold" data-testid="confirmation">
                  {confirmation}
                </span>
              </p>
            )}
          </section>
        </div>
      </main>

      {/* Review & submit sheet: the Submit button belongs to the user */}
      <AnimatePresence>
        {showSheet && (
          <motion.section
            aria-labelledby="review-title"
            initial={reduced ? false : { y: "100%" }}
            animate={{ y: isSheetCollapsed ? "calc(100% - 5.25rem)" : 0 }}
            exit={reduced ? { opacity: 0 } : { y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 32 }}
            className={cn(
              "fixed inset-x-0 bottom-0 z-40 mx-auto max-h-[78vh] w-full max-w-3xl rounded-t-[1.75rem] border-x border-t border-rule bg-sheet px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-1 shadow-[0_-24px_50px_-24px_rgba(26,34,50,0.55)] sm:px-8 lg:inset-x-auto lg:right-8 lg:w-[34rem] lg:max-w-none",
              isSheetCollapsed ? "overflow-hidden" : "overflow-y-auto",
            )}
          >
            <div className="pt-2">
              <span className="mx-auto mb-3 block h-1.5 w-12 rounded-full bg-rule" aria-hidden />
              <div className="flex items-center justify-between gap-3">
                <h2 id="review-title" className="font-display text-[1.6rem] font-medium text-ink">
                  {t("portal.review.title")}
                </h2>
                <button
                  type="button"
                  onClick={() => setIsSheetCollapsed((c) => !c)}
                  aria-expanded={!isSheetCollapsed}
                  aria-controls="review-body"
                  className="tap rounded-full px-4 text-[0.9rem] font-semibold text-ink-soft hover:bg-paper-deep hover:text-ink"
                >
                  {isSheetCollapsed ? t("portal.review.show") : t("portal.review.hide")}
                </button>
              </div>
            </div>
            <div id="review-body">
            <p className="mt-1 text-[0.98rem] text-ink-soft">{t("portal.review.body")}</p>
            {summary && <p className="mt-3 text-[0.98rem] leading-relaxed text-ink">{summary}</p>}
            <table className="mt-4 w-full border-collapse text-left text-[0.9rem]">
              <thead>
                <tr className="border-b-2 border-ink text-[0.78rem] text-ink-soft">
                  <th scope="col" className="py-2 pr-2 font-semibold">{t("portal.review.field")}</th>
                  <th scope="col" className="py-2 pr-2 font-semibold">{t("portal.review.packet")}</th>
                  <th scope="col" className="py-2 pr-2 font-semibold">{t("portal.review.form")}</th>
                  <th scope="col" className="w-8 py-2"><span className="sr-only">OK</span></th>
                </tr>
              </thead>
              <tbody>
                {diff.map((row) => (
                  <tr key={row.field} className={cn("border-b border-rule align-top", !row.ok && "bg-short-tint")}>
                    <th scope="row" className="py-2 pr-2 font-semibold text-ink">{fieldLabel(row.field)}</th>
                    <td className="break-all py-2 pr-2 text-ink">{row.packet}</td>
                    <td className="break-all py-2 pr-2 text-ink">{row.form}</td>
                    <td className="py-2">
                      {row.ok ? (
                        <Check className="size-5 text-meets" aria-label="OK" />
                      ) : (
                        <X className="size-5 text-short" aria-label="Mismatch" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {hasMismatch && (
              <p role="alert" className="mt-3 rounded-xl bg-short-tint p-3 text-[0.95rem] font-medium text-ink">
                {t("portal.review.mismatch")}
              </p>
            )}
            <button
              type="button"
              className="btn-ink mt-5 w-full"
              disabled={hasMismatch || phase === "submitting"}
              onClick={submit}
              data-testid="user-submit"
            >
              {phase === "submitting" ? t("portal.submitting") : t("portal.submit")}
            </button>
            </div>
          </motion.section>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
