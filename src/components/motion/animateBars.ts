"use client";

import { animate, stagger } from "animejs";

/**
 * Grow every [data-bar-fill] inside `root` from 0 to its data-target, staggered.
 * Returns a cleanup that cancels the animation and leaves bars at their final width.
 */
export function animateBars(root: HTMLElement, opts: { delay?: number; step?: number } = {}): () => void {
  const fills = Array.from(root.querySelectorAll<HTMLElement>("[data-bar-fill]"));
  if (fills.length === 0) return () => {};
  const targetOf = (el: HTMLElement) => Number(el.dataset.target ?? 1);
  fills.forEach((el) => {
    el.style.transform = "scaleX(0)";
  });
  const anim = animate(fills, {
    scaleX: (el: unknown) => targetOf(el as HTMLElement),
    duration: 1150,
    delay: stagger(opts.step ?? 140, { start: opts.delay ?? 150 }),
    ease: "outExpo",
  });
  return () => {
    anim.cancel();
    fills.forEach((el) => {
      el.style.transform = `scaleX(${targetOf(el)})`;
    });
  };
}
