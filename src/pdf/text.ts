import type { PDFFont } from "pdf-lib";

const REPLACEMENTS: Record<string, string> = {
  "‘": "'", "’": "'", "‚": ",", "‛": "'",
  "“": '"', "”": '"', "„": '"',
  "–": "-", "—": "-", "−": "-", "‐": "-", "‑": "-",
  "…": "...", "•": "-", " ": " ", " ": " ", " ": " ",
  "→": "->", "≤": "<=", "≥": ">=", "✓": "v", "✔": "v",
};

/** Helvetica (WinAnsi) can encode Latin-1 accents; everything else is mapped to ASCII or "?". */
export function sanitize(input: string): string {
  let out = "";
  for (const ch of input.normalize("NFC")) {
    if (REPLACEMENTS[ch] !== undefined) out += REPLACEMENTS[ch];
    else if (ch === "\n" || ch === "\t") out += " ";
    else {
      const code = ch.codePointAt(0) ?? 0;
      out += (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) ? ch : "?";
    }
  }
  return out;
}

/** Greedy word wrap using real font metrics. Long tokens are hard-split. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = sanitize(text).split(/ +/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  const fits = (s: string) => font.widthOfTextAtSize(s, size) <= maxWidth;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (fits(next)) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (!fits(rest) && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && !fits(rest.slice(0, cut))) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}
