"use client";

import Link from "next/link";
import { LangToggle } from "@/components/lang/LangToggle";
import { useLang } from "@/components/lang/useLang";
import { cn } from "@/lib/utils";

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
        <rect x="3.5" y="2.5" width="21" height="23" rx="3" fill="var(--sheet)" stroke="var(--ink)" strokeWidth="1.6" />
        <path d="M8 9h12M8 13.5h7" stroke="var(--ink)" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M8 19.5l2.6 2.4L16.5 16" stroke="var(--meets)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="font-display text-[1.35rem] font-semibold tracking-tight text-ink">KeepCovered</span>
    </span>
  );
}

export function SiteHeader({ children }: { children?: React.ReactNode }) {
  const { t, lang } = useLang();
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sheet"
      >
        {t("nav.skip")}
      </a>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pb-2 pt-4 sm:px-8 sm:pt-6">
        <Link href={`/?lang=${lang}`} className="rounded-md" aria-label="KeepCovered">
          <Wordmark />
        </Link>
        <div className="flex items-center gap-2">
          {children}
          <LangToggle />
        </div>
      </header>
    </>
  );
}
