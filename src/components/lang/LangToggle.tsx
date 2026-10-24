"use client";

import { Languages } from "lucide-react";
import { useLang } from "./useLang";
import { cn } from "@/lib/utils";

/** Two-state toggle. The label is always written in the language you would switch to. */
export function LangToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useLang();
  const next = lang === "en" ? "es" : "en";
  return (
    <button
      type="button"
      onClick={() => setLang(next)}
      aria-label={t("lang.toggle.aria")}
      lang={next}
      data-testid="lang-toggle"
      className={cn(
        "tap inline-flex items-center gap-2 rounded-full border border-ink/25 bg-sheet/70 px-4 text-[0.95rem] font-semibold text-ink backdrop-blur transition-colors hover:border-ink hover:bg-sheet",
        className,
      )}
    >
      <Languages className="size-4" aria-hidden />
      {t("lang.toggle")}
    </button>
  );
}
