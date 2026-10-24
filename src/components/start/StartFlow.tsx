"use client";

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Camera, ShieldCheck, Upload } from "lucide-react";
import { createCase } from "@/lib/api";
import type { ExemptionAnswers } from "@/lib/schemas";
import { useLang } from "@/components/lang/useLang";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { cn } from "@/lib/utils";
import { Questionnaire } from "./Questionnaire";
import { UploadStack, type UploadItem } from "./UploadStack";
import { loadSampleFiles, sampleAppCount, sampleItems } from "./sampleDocs";

const MIN_SCAN_MS = 1800;

export type StartFlowHandle = { loadSamples: () => void; focus: () => void };

type Step = 0 | 1 | 2;

export const StartFlow = forwardRef<StartFlowHandle>(function StartFlow(_props, ref) {
  const { lang, t } = useLang();
  const router = useRouter();
  const reduced = useReducedMotion();
  const [step, setStep] = useState<Step>(0);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [files, setFiles] = useState<Record<string, File>>({});
  const [sampleFiles, setSampleFiles] = useState<string[] | null>(null);
  const isDemo = sampleFiles !== null;
  const [answers, setAnswers] = useState<ExemptionAnswers>({});
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const addFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    const newItems = incoming.map((file, i) => {
      const id = `f-${Date.now()}-${i}-${file.name}`;
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      if (previewUrl) urlsRef.current.push(previewUrl);
      return { id, name: file.name, previewUrl, file };
    });
    setSampleFiles(null);
    setItems((prev) => [...prev, ...newItems.map(({ id, name, previewUrl }) => ({ id, name, previewUrl }))]);
    setFiles((prev) => ({ ...prev, ...Object.fromEntries(newItems.map((n) => [n.id, n.file])) }));
    setError(null);
  }, []);

  const loadSamples = useCallback(() => {
    setItems([]);
    setFiles({});
    setStep(0);
    setError(null);
    loadSampleFiles().then(setSampleFiles);
  }, []);

  useImperativeHandle(ref, () => ({
    loadSamples,
    focus: () => headingRef.current?.focus(),
  }));

  const remove = (id: string) => {
    if (isDemo) {
      // The sample set goes to the backend as a whole (demo=maria), so removing one clears it.
      setSampleFiles(null);
      return;
    }
    setItems((prev) => prev.filter((p) => p.id !== id));
    setFiles((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
  };

  const docs = sampleFiles ? sampleItems(sampleFiles, lang) : items;

  const send = async () => {
    setIsSending(true);
    setError(null);
    const started = Date.now();
    try {
      const { id } = await createCase({
        files: isDemo ? [] : items.map((i) => files[i.id]).filter(Boolean),
        answers,
        lang,
        demo: isDemo ? "maria" : undefined,
      });
      const wait = MIN_SCAN_MS - (Date.now() - started);
      if (wait > 0 && !reduced) await new Promise((r) => setTimeout(r, wait));
      router.push(`/case/${encodeURIComponent(id)}?lang=${lang}`);
    } catch {
      setError(t("flow.send.error"));
      setIsSending(false);
    }
  };

  const goTo = (s: Step) => {
    setStep(s);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const titles = [t("flow.upload.title"), t("flow.questions.title"), t("flow.send.title")];
  const answeredCount = Object.keys(answers).length;
  const docCount =
    docs.length === 1 ? t("flow.upload.count.one") : t("flow.upload.count", { count: docs.length });
  const slide = reduced
    ? { initial: false as const, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: 24 },
        animate: { opacity: 1, x: 0 },
        exit: { opacity: 0, x: -24 },
      };

  return (
    <section aria-labelledby="flow-heading" className="sheet rounded-[1.5rem] p-5 sm:p-8">
      {/* Progress: this is a real sequence, so it is numbered */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[0.9rem] font-semibold text-ink-soft">{t("flow.step", { n: step + 1 })}</p>
        <ol className="flex flex-1 justify-end gap-1.5" aria-hidden>
          {[0, 1, 2].map((s) => (
            <li
              key={s}
              className={cn("h-1.5 w-10 rounded-full transition-colors", s <= step ? "bg-ink" : "bg-rule")}
            />
          ))}
        </ol>
      </div>

      <h2
        id="flow-heading"
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 font-display text-title font-medium text-ink outline-none"
      >
        {titles[step]}
      </h2>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={step} {...slide} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
          {step === 0 && (
            <div className="mt-3">
              <p className="max-w-[60ch] text-[1.02rem] leading-relaxed text-ink-soft">{t("flow.upload.body")}</p>

              {docs.length > 0 && (
                <div className="mt-6">
                  <UploadStack items={docs} isScanning={false} onRemove={remove} />
                  <p className="mt-3 text-[0.95rem] font-semibold text-ink">
                    {isDemo && sampleFiles ? t("flow.upload.demo.active", { apps: sampleAppCount(sampleFiles) }) : docCount}
                  </p>
                </div>
              )}

              <label
                htmlFor="file-input"
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  addFiles(e.dataTransfer.files);
                }}
                className={cn(
                  "mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-colors",
                  isDragging ? "border-unsure bg-unsure-tint" : "border-ink/30 bg-paper/60 hover:border-ink",
                )}
              >
                <Upload className="size-7 text-ink" aria-hidden />
                <span className="text-[1.05rem] font-semibold text-ink">{t("flow.upload.drop")}</span>
                <span className="text-[0.9rem] text-ink-soft">{t("flow.upload.drop.hint")}</span>
                <input
                  id="file-input"
                  name="files"
                  type="file"
                  multiple
                  accept="image/*,application/pdf"
                  className="sr-only"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>

              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <label htmlFor="camera-input" className="btn-line tap cursor-pointer">
                  <Camera className="size-5" aria-hidden />
                  {t("flow.upload.camera")}
                  <input
                    id="camera-input"
                    name="camera"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
                <button type="button" className="btn-line tap" onClick={loadSamples} data-testid="use-demo">
                  {t("flow.upload.demo")}
                </button>
              </div>

              {docs.length === 0 && <p className="mt-4 text-[0.92rem] text-ink-soft">{t("flow.upload.empty")}</p>}

              <div className="mt-7 flex justify-end">
                <button
                  type="button"
                  className="btn-ink w-full sm:w-auto"
                  disabled={docs.length === 0}
                  onClick={() => goTo(1)}
                >
                  {t("flow.next")}
                </button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="mt-3">
              <p className="max-w-[60ch] text-[1.02rem] leading-relaxed text-ink-soft">{t("flow.questions.body")}</p>
              <div className="mt-5">
                <Questionnaire answers={answers} onChange={setAnswers} />
              </div>
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" className="btn-line" onClick={() => goTo(0)}>
                  {t("flow.back")}
                </button>
                <button type="button" className="btn-ink" onClick={() => goTo(2)}>
                  {t("flow.next")}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="mt-3">
              <p className="max-w-[60ch] text-[1.02rem] leading-relaxed text-ink-soft">{t("flow.send.body")}</p>
              <div className="mt-6 grid items-center gap-6 sm:grid-cols-[1fr_1fr]">
                <UploadStack items={docs} isScanning={isSending} onRemove={remove} showList={false} />
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[0.98rem]">
                  <dt className="text-ink-soft">{t("flow.summary.docs")}</dt>
                  <dd className="font-semibold text-ink">{docCount}</dd>
                  <dt className="text-ink-soft">{t("flow.summary.answers")}</dt>
                  <dd className="font-semibold text-ink">{t("flow.summary.answers.count", { count: answeredCount })}</dd>
                </dl>
              </div>
              <p className="mt-6 flex items-start gap-3 rounded-xl bg-meets-tint/70 p-4 text-[0.98rem] leading-snug text-ink">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-meets" aria-hidden />
                {t("flow.send.consent")}
              </p>
              {error && (
                <p role="alert" className="mt-4 rounded-xl bg-short-tint p-4 text-[0.98rem] font-medium text-ink">
                  {error}
                </p>
              )}
              <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
                <button type="button" className="btn-line" onClick={() => goTo(1)} disabled={isSending}>
                  {t("flow.back")}
                </button>
                <button
                  type="button"
                  className="btn-ink"
                  onClick={send}
                  disabled={isSending || docs.length === 0}
                  data-testid="build-proof"
                  aria-busy={isSending}
                >
                  {isSending ? t("flow.send.sending") : t("flow.send.button")}
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
});
