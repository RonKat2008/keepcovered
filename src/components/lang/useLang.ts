"use client";

import { useCallback, useSyncExternalStore } from "react";
import { LANG_STORAGE_KEY, isLang, t as translate, type CopyKey, type CopyParams } from "@/lib/i18n";
import type { Lang } from "@/lib/schemas";

// Language lives in a tiny external store: ?lang= wins, then localStorage, then the browser language.
let current: Lang | null = null;
const listeners = new Set<() => void>();

function readInitial(): Lang {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get("lang");
    if (isLang(fromUrl)) return fromUrl;
  } catch {
    // ignore malformed URLs
  }
  try {
    const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // storage blocked (private mode); fall through
  }
  return navigator.language?.toLowerCase().startsWith("es") ? "es" : "en";
}

function getSnapshot(): Lang {
  if (current === null) current = readInitial();
  return current;
}

function getServerSnapshot(): Lang {
  return "en";
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setLang(next: Lang): void {
  current = next;
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, next);
  } catch {
    // storage blocked; the choice still applies for this page view
  }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.has("lang")) {
      url.searchParams.set("lang", next);
      window.history.replaceState(window.history.state, "", url);
    }
  } catch {
    // ignore
  }
  document.documentElement.lang = next;
  listeners.forEach((l) => l());
}

export function useLang(): {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: CopyKey, params?: CopyParams) => string;
} {
  const lang = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const t = useCallback((key: CopyKey, params?: CopyParams) => translate(key, lang, params), [lang]);
  return { lang, setLang, t };
}
