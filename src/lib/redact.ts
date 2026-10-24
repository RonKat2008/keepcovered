// Masks personal identifiers in free text. Runs on every log line and trace attribute.
// Synthetic data only in this repo, but the production path must never leak real PII.

const MASK = "[REDACTED]";

type Rule = { re: RegExp; replace: string | ((substring: string, ...args: string[]) => string) };

const RULES: readonly Rule[] = [
  // Labeled fields first so the label survives and the value goes.
  {
    re: /\b(DOB|D\.O\.B\.?|date of birth|birth ?date|fecha de nacimiento|fecha nac\.?)(\s*[:#-]?\s*)(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}|[\p{L}]{3,9}\.?\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+(?:de\s+)?[\p{L}]{3,9}\.?\s+(?:de\s+)?\d{4})/giu,
    replace: (_m, label, sep) => `${label}${sep}${MASK}`,
  },
  {
    re: /\b(case|caso|expediente)((?:\s*(?:number|no\.?|num\.?|n[uú]mero|#))?\s*[:#]?\s*)(?=[A-Z0-9-]*\d)[A-Z0-9][A-Z0-9-]{3,}/giu,
    replace: (_m, label, sep) => `${label}${sep}${MASK}`,
  },
  { re: /\bDEMO-[A-Z0-9-]+/gi, replace: MASK },
  {
    // up to 4 name words; stop before a word that is itself a "Label:"
    re: /\b(full name|nombre completo|name|nombre)(\s*:\s*)((?:(?![\p{L}'.-]+[ \t]*:)[\p{L}'.-]+)(?:[ \t]+(?![\p{L}'.-]+[ \t]*:)[\p{L}'.-]+){0,3})/giu,
    replace: (_m, label, sep) => `${label}${sep}${MASK}`,
  },
  { re: /[A-Z0-9._%+-]+@[A-Z0-9-]+(?:\.[A-Z0-9-]+)+/gi, replace: MASK },
  // SSN: 123-45-6789 or 123 45 6789
  { re: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g, replace: MASK },
  // Cards: 13-19 digits with optional space/dash separators
  { re: /\b\d(?:[ -]?\d){12,18}\b/g, replace: MASK },
  // Medi-Cal CIN-like: 8 digits + letter
  { re: /\b\d{8}[A-Z]\b/gi, replace: MASK },
  // Phones (US formats, optional +1)
  { re: /(?<![\w])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-])\d{3}[\s.-]\d{4}\b/g, replace: MASK },
  // Street addresses: number + up to 4 words + street suffix
  {
    re: /\b\d{1,6}\s+(?:[\p{L}0-9.'-]+\s+){1,4}?(?:street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|way|court|ct|place|pl|calle|avenida|av|camino|carretera)\b\.?/giu,
    replace: MASK,
  },
  // Spanish order: number + calle/avenida + name ("55 Calle Mayor")
  {
    re: /\b\d{1,6}\s+(?:calle|avenida|av\.?|camino|carretera|paseo|callej[oó]n)\s+(?:de\s+(?:la\s+|los\s+|las\s+)?)?[\p{L}0-9.'-]+(?:\s+[\p{L}0-9.'-]+)?/giu,
    replace: MASK,
  },
  // Bare 8-17 digit runs (SSN without dashes, account and routing numbers)
  { re: /\b\d{8,17}\b/g, replace: MASK },
];

export function redact(text: string): string {
  if (typeof text !== "string" || text.length === 0) return text;
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.re, rule.replace as string);
  }
  return out;
}

/** Returns a deep copy with every string value redacted. Never mutates the input. */
export function redactDeep<T>(value: T): T {
  return walk(value, new WeakMap()) as T;
}

function walk(value: unknown, seen: WeakMap<object, unknown>): unknown {
  if (typeof value === "string") return redact(value);
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    seen.set(value, arr);
    for (const item of value) arr.push(walk(item, seen));
    return arr;
  }
  const copy: Record<string, unknown> = {};
  seen.set(value, copy);
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) copy[k] = walk(v, seen);
  return copy;
}
