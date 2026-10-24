"use client";

import { useEffect } from "react";
import { useLang } from "./useLang";

/** Keeps <html lang> in step with the active language (the server renders "en"). */
export function LangSync() {
  const { lang } = useLang();
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return null;
}
