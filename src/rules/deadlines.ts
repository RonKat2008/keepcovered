import type { CountyLetter, Deadline, MonthStatus } from "@/lib/schemas";
import type { WorkRules } from "./workRules";
import { addDays, isValidIso, monthOf, monthStart, nextMonth } from "./util";

const REMINDER_LEAD_DAYS = 7;

export function buildDeadlines(
  input: { letter: CountyLetter | null; today: string; months: MonthStatus[] },
  rules: WorkRules,
): Deadline[] {
  const { letter, today } = input;
  const out: Deadline[] = [];

  const due = letter?.response_deadline;
  if (due && isValidIso(due)) {
    out.push({
      id: `respond_to_letter-${due}`,
      date: due,
      title_en: "Send your proof to the county",
      title_es: "Envíe sus comprobantes al condado",
      kind: "respond_to_letter",
    });
    const remind = addDays(due, -REMINDER_LEAD_DAYS);
    if (remind > today) {
      out.push({
        id: `reminder-${remind}`,
        date: remind,
        title_en: "One week left to answer the county letter",
        title_es: "Falta una semana para responder la carta del condado",
        kind: "reminder",
      });
    }
  }

  const start = rules.key_dates.find((k) => k.id === "work_requirement_start");
  if (start && start.date >= today) {
    out.push({
      id: `rule_start-${start.date}`,
      date: start.date,
      title_en: start.label_en,
      title_es: start.label_es,
      kind: "rule_start",
    });
  }

  const next = monthStart(nextMonth(monthOf(today)));
  out.push({
    id: `monthly_report-${monthOf(next)}`,
    date: next,
    title_en: "Save last month's earnings screenshots and bank statement",
    title_es: "Guarde las capturas de ganancias y el estado de cuenta del mes pasado",
    kind: "monthly_report",
  });

  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

const CRLF = "\r\n";
const FOLD_LIMIT = 75;

const escapeText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const compact = (iso: string) => iso.replace(/-/g, "");

/** RFC 5545 content-line folding, counted in UTF-8 octets, never splitting a character. */
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch);
    const limit = parts.length === 0 ? FOLD_LIMIT : FOLD_LIMIT - 1;
    if (bytes + size > limit) {
      parts.push(current);
      current = "";
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** `now` is an ISO timestamp used for DTSTAMP; defaults to the earliest deadline so output is deterministic. */
export function toIcs(deadlines: Deadline[], lang: "en" | "es", now?: string): string {
  const stampSource = now ?? `${deadlines.map((d) => d.date).sort()[0] ?? "1970-01-01"}T00:00:00Z`;
  const stamp = new Date(stampSource).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//KeepCovered//Deadlines//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...deadlines.flatMap((d) => [
      "BEGIN:VEVENT",
      `UID:${d.id}@keepcovered.app`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${compact(d.date)}`,
      `DTEND;VALUE=DATE:${compact(addDays(d.date, 1))}`,
      `SUMMARY:${escapeText(lang === "es" ? d.title_es : d.title_en)}`,
      "END:VEVENT",
    ]),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join(CRLF) + CRLF;
}
