"use client";

import { useEffect, useRef } from "react";
import { animate } from "animejs";
import { useReducedMotion } from "./useReducedMotion";

type Props = {
  value: number;
  format: (n: number) => string;
  /** ms before counting starts, so a list can stagger */
  delay?: number;
  duration?: number;
  className?: string;
};

/** Counts a number up from zero with anime.js. Reduced motion shows the final value at once. */
export function CountUp({ value, format, delay = 0, duration = 1100, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const formatRef = useRef(format);

  useEffect(() => {
    formatRef.current = format;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = formatRef.current(value);
      return;
    }
    const counter = { v: 0 };
    el.textContent = formatRef.current(0);
    const anim = animate(counter, {
      v: value,
      delay,
      duration,
      ease: "outExpo",
      onUpdate: () => {
        el.textContent = formatRef.current(counter.v);
      },
      onComplete: () => {
        el.textContent = formatRef.current(value);
      },
    });
    return () => {
      anim.cancel();
    };
  }, [value, delay, duration, reduced]);

  return (
    <span ref={ref} className={className} aria-label={format(value)}>
      {format(value)}
    </span>
  );
}
