import { fmtMonthName, t } from "@/lib/i18n";
import type { Lang } from "@/lib/schemas";
import type { UploadItem } from "./UploadStack";

// María's real demo set lives in public/demo (filled by the data lane). manifest.json lists the files;
// these labels come from evals/ground_truth/demo-maria.json so the chips say what each photo is.
const SAMPLE_META: Record<string, { app?: string; month?: string; duplicate?: boolean; letter?: boolean }> = {
  "IMG_6844.png": { app: "Uber", month: "2026-09" },
  "IMG_7722.png": { app: "Uber", month: "2026-10" },
  "IMG_7461.png": { app: "Instacart", month: "2026-10" },
  "IMG_2442.png": { app: "Uber", month: "2026-11" },
  "IMG_1944.png": { app: "DoorDash", month: "2026-11" },
  "IMG_7976.png": { app: "Instacart", month: "2026-11" },
  "IMG_5438.png": { app: "Uber", month: "2026-11", duplicate: true },
  "IMG_9736.png": { letter: true },
};

const FALLBACK_FILES = Object.keys(SAMPLE_META);

export async function loadSampleFiles(): Promise<string[]> {
  try {
    const res = await fetch("/demo/manifest.json");
    if (!res.ok) return FALLBACK_FILES;
    const body: unknown = await res.json();
    const files = (body as { files?: unknown }).files;
    return Array.isArray(files) && files.every((f) => typeof f === "string" && /^[\w.-]+$/.test(f))
      ? (files as string[])
      : FALLBACK_FILES;
  } catch {
    return FALLBACK_FILES;
  }
}

function capFirst(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function sampleItems(files: string[], lang: Lang): UploadItem[] {
  return files.map((file) => {
    const meta = SAMPLE_META[file] ?? {};
    const month = meta.month ? capFirst(fmtMonthName(meta.month, lang)) : "";
    const name = meta.letter
      ? t("sample.letter", lang)
      : meta.duplicate
        ? t("sample.duplicate", lang, { app: meta.app ?? "", month })
        : meta.app
          ? `${meta.app}, ${month}`
          : file;
    return {
      id: `s-${file}`,
      name,
      previewUrl: `/demo/${file}`,
      sample: { app: meta.app ?? "", period: month, letter: meta.letter },
    };
  });
}

export function sampleAppCount(files: string[]): number {
  return files.filter((f) => !SAMPLE_META[f]?.letter).length;
}
