"use client";

import { useRef } from "react";
import { MotionConfig } from "motion/react";
import { SiteHeader } from "@/components/shell/SiteHeader";
import { useLang } from "@/components/lang/useLang";
import { HeroLedger } from "./HeroLedger";
import { StartFlow, type StartFlowHandle } from "./StartFlow";

export function Home() {
  const { t } = useLang();
  const flowRef = useRef<StartFlowHandle>(null);
  const flowWrapRef = useRef<HTMLDivElement>(null);

  const scrollToFlow = (withSamples: boolean) => {
    if (withSamples) flowRef.current?.loadSamples();
    flowWrapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => flowRef.current?.focus(), 350);
  };

  return (
    <MotionConfig reducedMotion="user">
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 sm:px-8">
        <section className="grid items-center gap-10 pb-14 pt-8 sm:pt-14 lg:grid-cols-[1.3fr_1fr] lg:gap-16 lg:pb-24 lg:pt-20">
          <div>
            <h1 className="font-display text-display font-medium text-ink [text-wrap:balance]">{t("hero.title")}</h1>
            <p className="mt-6 max-w-[58ch] text-[1.1rem] leading-relaxed text-ink-soft sm:text-[1.2rem]">
              {t("hero.body")}
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button type="button" className="btn-ink" onClick={() => scrollToFlow(false)} data-testid="start">
                {t("hero.start")}
              </button>
              <button type="button" className="btn-line" onClick={() => scrollToFlow(true)}>
                {t("hero.demo")}
              </button>
            </div>
            <p className="mt-5 text-[0.92rem] text-ink-soft">{t("hero.note")}</p>
          </div>
          <HeroLedger />
        </section>

        <div ref={flowWrapRef} className="mx-auto max-w-3xl scroll-mt-6">
          <StartFlow ref={flowRef} />
        </div>
      </main>
    </MotionConfig>
  );
}
