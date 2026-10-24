"use client";

import { AnimatePresence, motion } from "motion/react";
import { FileText, X } from "lucide-react";
import { ScanBeam, ScanBeamGroup } from "@/components/motion/ScanBeam";
import { useReducedMotion } from "@/components/motion/useReducedMotion";
import { useLang } from "@/components/lang/useLang";

export type UploadItem = {
  id: string;
  name: string;
  /** Object URL for image previews */
  previewUrl?: string;
  /** For sample documents: which app or "letter" */
  sample?: { app: string; period: string; letter?: boolean };
};

const MAX_FANNED = 7;
const SPRING = { type: "spring", stiffness: 320, damping: 28, mass: 0.8 } as const;

function DocFace({ item }: { item: UploadItem }) {
  if (item.previewUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
      <img src={item.previewUrl} alt="" className="absolute inset-0 size-full object-cover" />
    );
  }
  if (item.sample?.letter) {
    return (
      <div className="absolute inset-0 flex flex-col gap-1.5 bg-sheet p-3">
        <span className="font-display text-[0.8rem] font-semibold leading-tight text-ink">Aviso del condado</span>
        <span className="h-1 w-3/4 rounded bg-ink/15" />
        <span className="h-1 w-full rounded bg-ink/15" />
        <span className="h-1 w-5/6 rounded bg-ink/15" />
        <span className="mt-auto rounded-sm bg-short-tint px-1 text-[0.6rem] font-semibold text-short">8 dic</span>
      </div>
    );
  }
  if (item.sample) {
    return (
      <div className="absolute inset-0 flex flex-col bg-ink p-3 text-sheet">
        <span className="text-[0.72rem] font-semibold opacity-80">{item.sample.app}</span>
        <span className="text-[0.62rem] opacity-60">{item.sample.period}</span>
        <span className="mt-auto font-display text-lg leading-none">$</span>
        <span className="mt-1 h-1 w-2/3 rounded bg-sheet/30" />
        <span className="mt-1 h-1 w-1/2 rounded bg-sheet/20" />
      </div>
    );
  }
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-sheet p-2 text-center">
      <FileText className="size-6 text-ink-soft" aria-hidden />
      <span className="line-clamp-2 break-all text-[0.62rem] text-ink-soft">{item.name}</span>
    </div>
  );
}

type Props = {
  items: UploadItem[];
  isScanning: boolean;
  onRemove: (id: string) => void;
  /** Show the removable file-name chips under the stack */
  showList?: boolean;
};

/** Documents fan out into a hand-held stack. While sending, a scan beam sweeps each card. */
export function UploadStack({ items, isScanning, onRemove, showList = true }: Props) {
  const { t } = useLang();
  const reduced = useReducedMotion();
  const fanned = items.slice(-MAX_FANNED);
  const mid = (fanned.length - 1) / 2;
  // Keep the fan inside a 320px-wide column: tighter spread as the stack grows.
  const spread = fanned.length > 5 ? 19 : fanned.length > 3 ? 28 : 38;
  const transition = reduced ? { duration: 0 } : SPRING;

  return (
    <div>
      <ScanBeamGroup active={isScanning} className="relative mx-auto h-48 w-full max-w-[22rem] sm:h-52">
        <AnimatePresence initial={false}>
          {fanned.map((item, i) => {
            const offset = i - mid;
            return (
              <motion.div
                key={item.id}
                layout
                initial={reduced ? false : { opacity: 0, y: 60, rotate: 0, scale: 0.8 }}
                animate={{
                  opacity: 1,
                  x: offset * spread,
                  y: Math.abs(offset) * 6,
                  rotate: offset * (fanned.length > 5 ? 4 : 5.5),
                  scale: 1,
                }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.85 }}
                transition={transition}
                className="absolute left-1/2 top-2 -ml-[3.4rem] h-40 w-[6.8rem] overflow-hidden rounded-lg border border-rule shadow-[0_10px_24px_-14px_rgba(26,34,50,0.55)] sm:h-44 sm:w-[7.4rem]"
                style={{ zIndex: i, transformOrigin: "50% 120%" }}
              >
                <DocFace item={item} />
                <ScanBeam />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </ScanBeamGroup>

      {showList && (
      <ul className="mt-3 flex flex-wrap gap-2" aria-live="polite">
        {items.map((item) => (
          <li key={item.id}>
            <span className="inline-flex max-w-[15rem] items-center gap-1 rounded-full border border-rule bg-sheet py-1 pl-3 pr-1 text-[0.85rem] text-ink">
              <span className="truncate">{item.name}</span>
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-paper-deep hover:text-ink"
                aria-label={t("flow.upload.remove", { name: item.name })}
                disabled={isScanning}
              >
                <X className="size-4" aria-hidden />
              </button>
            </span>
          </li>
        ))}
      </ul>
      )}
    </div>
  );
}
