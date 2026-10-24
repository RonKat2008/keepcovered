// All packet wording. Status labels come from enums and reason codes only, never free text.
import type { MonthStatus } from "@/lib/schemas";

export type PacketLang = "en" | "es";

const MONTHS = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
} as const;

export function monthLabel(key: string, lang: PacketLang): string {
  const [y, m] = key.split("-");
  const name = MONTHS[lang][Number(m) - 1] ?? key;
  return lang === "en" ? `${name} ${y}` : `${name} de ${y}`;
}

export function dateLabel(iso: string, lang: PacketLang): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  const name = MONTHS[lang][Number(m) - 1];
  if (!name || !d) return iso;
  return lang === "en" ? `${name} ${Number(d)}, ${y}` : `${Number(d)} de ${name} de ${y}`;
}

export function money(n: number): string {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function hours(n: number): string {
  return n.toFixed(1);
}

const OPEN_QUESTIONS = {
  en: {
    gross_vs_net: "The county has not said whether self-employment income is counted before or after expenses (gross or net). Gross meets the amount; net does not.",
    hours_definition: "The county has not said whether hours online (logged in) or only active hours (on a trip or delivery) count.",
    income_to_hours_conversion: "The county has not said whether income below the amount can be converted into hours.",
    education_hours_in_combination: "The county has not said whether school hours can be combined with work hours.",
  },
  es: {
    gross_vs_net: "El condado no ha dicho si el ingreso de trabajo por cuenta propia se cuenta antes o después de gastos (bruto o neto). El bruto alcanza la cantidad; el neto no.",
    hours_definition: "El condado no ha dicho si cuentan las horas en línea (con la app abierta) o solo las horas activas (en un viaje o entrega).",
    income_to_hours_conversion: "El condado no ha dicho si el ingreso por debajo de la cantidad se puede convertir en horas.",
    education_hours_in_combination: "El condado no ha dicho si las horas de estudio se pueden combinar con las horas de trabajo.",
  },
} as const;

export function openQuestionText(id: string, lang: PacketLang): string | null {
  const table = OPEN_QUESTIONS[lang] as Record<string, string>;
  return table[id] ?? null;
}

export function statusLabel(m: MonthStatus, lang: PacketLang): string {
  const en = lang === "en";
  switch (m.overall) {
    case "meets":
      if (m.meets_income_path !== true && m.meets_hours_path === true)
        return en ? "Looks like it meets the hours rule" : "Parece cumplir la regla de horas";
      return en ? "Looks like it meets the income rule" : "Parece cumplir la regla de ingresos";
    case "does_not_meet": {
      const short = m.reasons.find((r) => r.code === "income_short")?.params.short_by;
      if (typeof short === "number") return en ? `Short by ${money(short)}` : `Faltan ${money(short)}`;
      return en ? "Does not appear to meet the rule" : "No parece cumplir la regla";
    }
    case "unsure":
      return en ? "Unsure - ask county" : "No está claro - consulte al condado";
    case "missing_data":
      return en ? "Missing records" : "Faltan documentos";
  }
}

export const COPY = {
  en: {
    to: "To: County Social Services - Medi-Cal",
    date: "Date",
    reLead: "Re: Work and community engagement - proof of income/activity for",
    body: "I am submitting records of my self-employment as a rideshare/delivery driver for the months below. A summary table and copies of my earnings statements are attached. Please contact me if you need anything else.",
    fields: "Name: ________    Case number: ________    Signature: ________",
    footer: "Prepared with KeepCovered. This packet organizes the member's own records; it is not a determination. The county decides.",
    coverTitle: "Cover letter",
    summaryTitle: "Summary by month",
    cols: ["Month", "Gross income", "Net income", "Active hrs", "Online hrs", "Apps", "Status"],
    notesTitle: "Open questions",
    evidenceTitle: "Evidence index",
    evidenceNone: "No documents attached for this month.",
    docs: "Document",
    deposits: "Bank deposits",
    depositsMatched: "matched to earnings statements (transaction IDs)",
    depositsLabeled: "labeled by the member as driving income",
    page: "p.",
    pages: "pp.",
    deadlinesTitle: "Deadlines",
    noDeadlines: "No deadlines listed.",
    attachments: "Attached records",
    period: "Period",
    unembeddable: "This file could not be included in the packet. Please attach the original.",
    packetFooter: "KeepCovered proof packet",
    of: "of",
    none: "-",
  },
  es: {
    to: "Para: Servicios Sociales del Condado - Medi-Cal",
    date: "Fecha",
    reLead: "Asunto: Requisito de trabajo y participación comunitaria - comprobante de ingresos/actividad de",
    body: "Presento registros de mi trabajo por cuenta propia como conductor de transporte compartido/entregas durante los meses indicados. Adjunto una tabla resumen y copias de mis estados de ganancias. Por favor comuníquese conmigo si necesita algo más.",
    fields: "Nombre: ________    Número de caso: ________    Firma: ________",
    footer: "Preparado con KeepCovered. Este paquete organiza los registros del propio miembro; no es una determinación. El condado decide.",
    coverTitle: "Carta de presentación",
    summaryTitle: "Resumen por mes",
    cols: ["Mes", "Ingreso bruto", "Ingreso neto", "Horas activas", "Horas en línea", "Apps", "Estado"],
    notesTitle: "Preguntas abiertas",
    evidenceTitle: "Índice de evidencia",
    evidenceNone: "No hay documentos adjuntos para este mes.",
    docs: "Documento",
    deposits: "Depósitos bancarios",
    depositsMatched: "coinciden con estados de ganancias (IDs de transacción)",
    depositsLabeled: "marcados por el miembro como ingresos de manejo",
    page: "p.",
    pages: "pp.",
    deadlinesTitle: "Fechas límite",
    noDeadlines: "No hay fechas límite.",
    attachments: "Registros adjuntos",
    period: "Período",
    unembeddable: "No se pudo incluir este archivo en el paquete. Adjunte el original.",
    packetFooter: "Paquete de comprobantes KeepCovered",
    of: "de",
    none: "-",
  },
} as const;
