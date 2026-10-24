"use client";

import { useEffect, useRef } from "react";
import { createTimeline, stagger } from "animejs";
import { useReducedMotion } from "./useReducedMotion";

type Props = {
  /** Selector for the beams inside the container to sweep, in order */
  active: boolean;
  children: React.ReactNode;
  className?: string;
};

/**
 * Sweeps a scanning beam across every [data-scan-beam] element inside, one card after another,
 * looping while `active`. With reduced motion the beams stay hidden and a static label is enough.
 */
export function ScanBeamGroup({ active, children, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    const root = ref.current;
    if (!root || !active || reduced) return;
    const beams = Array.from(root.querySelectorAll<HTMLElement>("[data-scan-beam]"));
    if (beams.length === 0) return;
    const tl = createTimeline({ loop: true });
    tl.add(beams, {
      opacity: [{ to: 1, duration: 120 }, { to: 1, duration: 760 }, { to: 0, duration: 160 }],
      translateY: { from: "-10%", to: "1100%", duration: 1040, ease: "inOutSine" },
      delay: stagger(260),
    });
    return () => {
      tl.cancel();
      beams.forEach((b) => {
        b.style.opacity = "0";
      });
    };
  }, [active, reduced]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Place inside a relatively positioned, overflow-hidden card. */
export function ScanBeam() {
  return (
    <span
      data-scan-beam
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 h-[9%] opacity-0"
      style={{
        background:
          "linear-gradient(180deg, transparent, color-mix(in oklab, var(--unsure) 45%, transparent) 70%, var(--unsure) 96%, transparent)",
        boxShadow: "0 6px 18px -4px color-mix(in oklab, var(--unsure) 60%, transparent)",
      }}
    />
  );
}
