// EN/ES copy for the driver-facing UI. Plain language (~6th grade).
// The app never says "you comply" or "you are exempt". It says "the county decides".
import type { Lang } from "@/lib/schemas";

export type { Lang };
export const LANGS: readonly Lang[] = ["en", "es"] as const;
export const LANG_STORAGE_KEY = "kc.lang";

const en = {
  // Shell
  "app.name": "KeepCovered",
  "app.tagline": "Proof of work for Medi-Cal, built from your driver apps",
  "lang.toggle": "Español",
  "lang.toggle.aria": "Cambiar a español",
  "nav.skip": "Skip to main content",

  // Home / hero
  "hero.title": "Starting January, Medi-Cal will ask you to show $580 or 80 hours of work each month.",
  "hero.body":
    "Send us your Uber, Lyft, DoorDash or Instacart screenshots and the letter from your county. We sort them by month, show what the county will likely see, and build a proof packet you can turn in.",
  "hero.start": "Start with my screenshots",
  "hero.demo": "Try it with sample documents",
  "hero.legend.meets": "Looks like it meets the rule",
  "hero.legend.short": "Short this month",
  "hero.threshold": "$580 line",
  "hero.note": "Free. No account. We delete everything after 1 hour.",

  // Flow
  "flow.step": "Step {n} of 3",
  "flow.upload.title": "Add your documents",
  "flow.upload.body":
    "Screenshots of your weekly or monthly earnings from each app, plus a photo of your county letter if you got one.",
  "flow.upload.drop": "Drop screenshots here or tap to choose",
  "flow.upload.drop.hint": "Photos, screenshots or PDFs",
  "flow.upload.camera": "Take a photo of a letter",
  "flow.upload.demo": "Use sample documents (María)",
  "flow.upload.count": "{count} documents ready",
  "flow.upload.count.one": "1 document ready",
  "flow.upload.remove": "Remove {name}",
  "flow.upload.empty": "Nothing added yet. Add at least one screenshot to continue.",
  "flow.upload.demo.active": "Using María's sample documents: 6 app screenshots and 1 county letter.",
  "flow.next": "Continue",
  "flow.back": "Back",
  "flow.questions.title": "A few questions about you",
  "flow.questions.body":
    "Some people do not have to meet the work rule. Your answers help us tell you what to ask the county. Skip any you are not sure about.",
  "flow.questions.yes": "Yes",
  "flow.questions.no": "No",
  "flow.questions.not_sure": "Not sure",
  "flow.questions.loading": "Loading questions…",
  "flow.send.title": "Build your proof",
  "flow.send.body":
    "We read your documents, add up each month, and explain what we found. It takes about a minute.",
  "flow.send.consent": "We delete your documents and results after 1 hour. We never send anything to the county for you.",
  "flow.send.button": "Build my proof",
  "flow.send.sending": "Sending your documents…",
  "flow.send.error": "We could not send your documents. Check your connection and try again.",
  "flow.summary.docs": "Documents",
  "flow.summary.answers": "Answers",
  "flow.summary.answers.count": "{count} answered",

  // Case: progress
  "case.progress.title": "Reading your documents",
  "case.progress.body": "This usually takes about a minute. You can watch each step below.",
  "case.progress.connecting": "Connecting…",
  "case.progress.waiting": "Waiting for your answer",
  "case.progress.done": "Done",
  "case.progress.error": "Something stopped the check. Your documents are safe. Reload the page to try again.",
  "case.fixture.note": "Showing sample results. The live checker is not connected.",
  "badge.claude": "Read by Claude",
  "badge.code": "Decided by code",
  "badge.user": "Your answer",
  "case.trace.link": "See every step, with cost and timing",
  "case.timeline.show": "How we built this",

  // Case: result
  "result.heading.some": "{meets} of {total} months look like they meet the rule.",
  "result.heading.none": "None of your months clearly meet the rule yet.",
  "result.heading.all": "All {total} months look like they meet the rule.",
  "result.county": "The county makes the final decision. Here is what we found and why.",
  "result.months.title": "Month by month",
  "result.months.gross": "Gross earnings",
  "result.months.hours": "Hours (active)",
  "result.months.line.income": "$580",
  "result.months.line.hours": "80 h",
  "result.months.evidence": "From {count} documents",
  "result.months.evidence.one": "From 1 document",
  "result.months.question": "Answer a question about this month",
  "result.months.needs": "Only one path is needed: $580 or 80 hours.",

  "status.meets": "Looks like this month meets the rule",
  "status.does_not_meet": "Short this month",
  "status.unsure": "Not sure yet",
  "status.missing_data": "Missing documents",
  "status.meets.short": "Meets",
  "status.does_not_meet.short": "Short",
  "status.unsure.short": "Open question",
  "status.missing_data.short": "Missing",

  "explain.title": "Why we think this",
  "explain.source": "Source",
  "explain.page": "p. {page}",
  "explain.close": "Close quote",
  "explain.open": "Show source {n}",

  "exempt.title": "Rules that might not apply to you",
  "exempt.body": "Some people do not have to meet the work rule. Only the county can decide this.",
  "exempt.may_qualify": "You may qualify. Tell your county.",
  "exempt.ask_navigator": "Ask a navigator about this",
  "exempt.not_indicated": "Your answers don't point to this",
  "exempt.source": "From {doc}, p. {page}",
  "exempt.others": "{count} other rules your answers don't point to",

  "deadline.title": "Dates to remember",
  "deadline.ics": "Add dates to my calendar",
  "deadline.days": "in {days} days",
  "deadline.today": "today",
  "deadline.passed": "passed",

  "packet.title": "Your proof packet",
  "packet.body": "A PDF with your month table, the documents behind each number, and a short cover letter. Bring it to your county or upload it to the county portal.",
  "packet.download": "Download proof packet (PDF)",

  "nav.title": "Talk to a navigator",
  "nav.body": "A navigator is a free helper who knows Medi-Cal. They can look at your packet with you before you send it.",
  "nav.reasons": "Why we suggest it",
  "nav.medical": "Medi-Cal helpline",
  "nav.legal": "Bay Area Legal Aid, Health Consumer Center",
  "nav.call": "Call {number}",

  "portal.cta.title": "Let KeepCovered fill the county form",
  "portal.cta.body": "We fill in the county's online form from your packet. You check every field and press Submit yourself.",
  "portal.cta.button": "Fill the county form",

  // Questions sheet
  "question.title": "One quick question",
  "question.later": "Answer later",
  "question.sending": "Saving…",
  "question.thanks": "Thanks. We updated your months.",
  "question.pending": "{count} question needs your answer",
  "question.open": "Answer now",
  "question.pending.many": "{count} questions need your answers",
  "question.counter": "Question {n} of {total}",
  "question.all_yes": "Yes, all {count} {payer} deposits are from driving",

  // Portal agent
  "portal.title": "Filling the county form",
  "portal.body": "KeepCovered is typing your packet into the demo county portal. It will stop before submitting.",
  "portal.frame.label": "Live view of the county portal",
  "portal.log": "What it did",
  "portal.review.title": "Review and submit",
  "portal.review.body": "Check each field. The form only goes to the county when you press Submit.",
  "portal.review.field": "Field",
  "portal.review.packet": "Your packet",
  "portal.review.form": "County form",
  "portal.review.mismatch": "A field does not match your packet. Fix it before submitting.",
  "portal.submit": "Submit to the county",
  "portal.submitting": "Submitting…",
  "portal.submitted.title": "Sent to the county",
  "portal.submitted.body": "Save this confirmation number: {confirmation}",
  "portal.back": "Back to my results",
  "portal.starting": "Opening the county portal…",
  "portal.error": "The portal stopped responding. Nothing was submitted.",

  // MonthStatus reason codes (generated by the rules engine)
  "reason.income_met": "Gross earnings of {gross} reach the $580 line.",
  "reason.income_short": "Gross earnings of {gross} are {short_by} under the $580 line.",
  "reason.gross_meets_net_short":
    "Before app fees you earned {gross}. After fees it is {net}. The rule says gross income must reach {threshold}, so gross is what we used.",
  "reason.hours_met": "{active} active hours reach the 80-hour line.",
  "reason.online_only_hours":
    "You were online {online} hours but active {active} hours. We only count active hours, because the county may not count waiting time.",
  "reason.hours_short": "{hours} hours are {short_by} under the 80-hour line.",
  "reason.combined_activities": "We added {other_hours} hours of other activities (school, volunteering or a work program).",
  "reason.bank_only_income":
    "{count} bank deposits ({amount}) look like driving pay, but there are no screenshots for them.",
  "reason.split_across_months":
    "One screenshot ({doc_id}) covers two months. We split it by day.",
  "reason.low_confidence_excluded":
    "We could not read the {field} on {doc_id} clearly, so we left it out.",
  "reason.missing_month": "We have no documents for this month.",
  "reason.education_unconfirmed": "School hours need proof from your school before they count.",
  "reason.relies_on_bank_only_income":
    "This month only reaches the rule with {amount} in deposits you said were from driving. Add those app screenshots to be sure.",
  "reason.unreadable_document": "We couldn't read {count} photo(s). One may belong to this month.",

  // Trace
  "trace.title": "Agent trace",
  "trace.body": "Every step the agent took for this case. Claude reads and explains. Code decides.",
  "trace.col.time": "Time",
  "trace.col.step": "Step",
  "trace.col.what": "What happened",
  "trace.col.by": "Decided by",
  "trace.col.model": "Model / effort",
  "trace.col.tokens": "Tokens in / out / cache",
  "trace.col.cost": "Cost",
  "trace.col.latency": "Latency",
  "trace.total.cost": "Total cost",
  "trace.total.tokens": "Total tokens",
  "trace.total.time": "Model time",
  "trace.split": "Steps by who decided",
  "trace.back": "Back to results",

  "common.loading": "Loading…",
  "common.close": "Close",
} as const;

export type CopyKey = keyof typeof en;

const es: Record<CopyKey, string> = {
  "app.name": "KeepCovered",
  "app.tagline": "Prueba de trabajo para Medi-Cal, hecha con sus apps de manejo",
  "lang.toggle": "English",
  "lang.toggle.aria": "Switch to English",
  "nav.skip": "Ir al contenido principal",

  "hero.title": "Desde enero, Medi-Cal le pedirá mostrar $580 o 80 horas de trabajo cada mes.",
  "hero.body":
    "Envíenos sus capturas de Uber, Lyft, DoorDash o Instacart y la carta de su condado. Las ordenamos por mes, le mostramos lo que el condado probablemente verá y armamos un paquete de prueba que usted puede entregar.",
  "hero.start": "Empezar con mis capturas",
  "hero.demo": "Probar con documentos de ejemplo",
  "hero.legend.meets": "Parece que cumple la regla",
  "hero.legend.short": "Le falta este mes",
  "hero.threshold": "Línea de $580",
  "hero.note": "Gratis. Sin cuenta. Borramos todo después de 1 hora.",

  "flow.step": "Paso {n} de 3",
  "flow.upload.title": "Agregue sus documentos",
  "flow.upload.body":
    "Capturas de sus ganancias semanales o mensuales de cada app, y una foto de la carta del condado si recibió una.",
  "flow.upload.drop": "Suelte las capturas aquí o toque para elegir",
  "flow.upload.drop.hint": "Fotos, capturas o PDF",
  "flow.upload.camera": "Tomar foto de una carta",
  "flow.upload.demo": "Usar documentos de ejemplo (María)",
  "flow.upload.count": "{count} documentos listos",
  "flow.upload.count.one": "1 documento listo",
  "flow.upload.remove": "Quitar {name}",
  "flow.upload.empty": "Todavía no agregó nada. Agregue al menos una captura para seguir.",
  "flow.upload.demo.active": "Usando los documentos de ejemplo de María: 6 capturas de apps y 1 carta del condado.",
  "flow.next": "Seguir",
  "flow.back": "Atrás",
  "flow.questions.title": "Unas preguntas sobre usted",
  "flow.questions.body":
    "Algunas personas no tienen que cumplir la regla de trabajo. Sus respuestas nos ayudan a decirle qué preguntarle al condado. Puede saltar las que no sepa.",
  "flow.questions.yes": "Sí",
  "flow.questions.no": "No",
  "flow.questions.not_sure": "No sé",
  "flow.questions.loading": "Cargando preguntas…",
  "flow.send.title": "Arme su prueba",
  "flow.send.body":
    "Leemos sus documentos, sumamos cada mes y le explicamos lo que encontramos. Tarda más o menos un minuto.",
  "flow.send.consent": "Borramos sus documentos y resultados después de 1 hora. Nunca enviamos nada al condado por usted.",
  "flow.send.button": "Armar mi prueba",
  "flow.send.sending": "Enviando sus documentos…",
  "flow.send.error": "No pudimos enviar sus documentos. Revise su conexión e intente otra vez.",
  "flow.summary.docs": "Documentos",
  "flow.summary.answers": "Respuestas",
  "flow.summary.answers.count": "{count} respondidas",

  "case.progress.title": "Leyendo sus documentos",
  "case.progress.body": "Normalmente tarda un minuto. Puede ver cada paso aquí abajo.",
  "case.progress.connecting": "Conectando…",
  "case.progress.waiting": "Esperando su respuesta",
  "case.progress.done": "Listo",
  "case.progress.error": "Algo detuvo la revisión. Sus documentos están seguros. Recargue la página para intentar otra vez.",
  "case.fixture.note": "Mostrando resultados de ejemplo. El revisor en vivo no está conectado.",
  "badge.claude": "Leído por Claude",
  "badge.code": "Decidido por código",
  "badge.user": "Su respuesta",
  "case.trace.link": "Ver cada paso, con costo y tiempo",
  "case.timeline.show": "Cómo lo armamos",

  "result.heading.some": "{meets} de {total} meses parecen cumplir la regla.",
  "result.heading.none": "Ninguno de sus meses cumple la regla con claridad todavía.",
  "result.heading.all": "Los {total} meses parecen cumplir la regla.",
  "result.county": "El condado toma la decisión final. Esto es lo que encontramos y por qué.",
  "result.months.title": "Mes por mes",
  "result.months.gross": "Ganancias brutas",
  "result.months.hours": "Horas (activas)",
  "result.months.line.income": "$580",
  "result.months.line.hours": "80 h",
  "result.months.evidence": "De {count} documentos",
  "result.months.evidence.one": "De 1 documento",
  "result.months.question": "Responder una pregunta sobre este mes",
  "result.months.needs": "Solo necesita un camino: $580 u 80 horas.",

  "status.meets": "Parece que este mes cumple la regla",
  "status.does_not_meet": "Le falta este mes",
  "status.unsure": "Todavía no estamos seguros",
  "status.missing_data": "Faltan documentos",
  "status.meets.short": "Cumple",
  "status.does_not_meet.short": "Le falta",
  "status.unsure.short": "Pregunta abierta",
  "status.missing_data.short": "Falta",

  "explain.title": "Por qué pensamos esto",
  "explain.source": "Fuente",
  "explain.page": "pág. {page}",
  "explain.close": "Cerrar cita",
  "explain.open": "Ver fuente {n}",

  "exempt.title": "Reglas que quizás no le aplican",
  "exempt.body": "Algunas personas no tienen que cumplir la regla de trabajo. Solo el condado puede decidirlo.",
  "exempt.may_qualify": "Usted podría calificar. Dígale a su condado.",
  "exempt.ask_navigator": "Pregúntele a un navegador sobre esto",
  "exempt.not_indicated": "Sus respuestas no indican esto",
  "exempt.source": "De {doc}, pág. {page}",
  "exempt.others": "{count} reglas más que sus respuestas no indican",

  "deadline.title": "Fechas importantes",
  "deadline.ics": "Agregar fechas a mi calendario",
  "deadline.days": "en {days} días",
  "deadline.today": "hoy",
  "deadline.passed": "ya pasó",

  "packet.title": "Su paquete de prueba",
  "packet.body": "Un PDF con su tabla de meses, los documentos detrás de cada número y una carta corta. Llévelo a su condado o súbalo al portal del condado.",
  "packet.download": "Descargar paquete de prueba (PDF)",

  "nav.title": "Hable con un navegador",
  "nav.body": "Un navegador es una persona que ayuda gratis y conoce Medi-Cal. Puede revisar su paquete con usted antes de enviarlo.",
  "nav.reasons": "Por qué se lo sugerimos",
  "nav.medical": "Línea de ayuda de Medi-Cal",
  "nav.legal": "Bay Area Legal Aid, Centro del Consumidor de Salud",
  "nav.call": "Llamar al {number}",

  "portal.cta.title": "Deje que KeepCovered llene el formulario del condado",
  "portal.cta.body": "Llenamos el formulario en línea del condado con su paquete. Usted revisa cada campo y presiona Enviar.",
  "portal.cta.button": "Llenar el formulario del condado",

  "question.title": "Una pregunta rápida",
  "question.later": "Responder después",
  "question.sending": "Guardando…",
  "question.thanks": "Gracias. Actualizamos sus meses.",
  "question.pending": "{count} pregunta necesita su respuesta",
  "question.open": "Responder ahora",
  "question.pending.many": "{count} preguntas necesitan su respuesta",
  "question.counter": "Pregunta {n} de {total}",
  "question.all_yes": "Sí, los {count} depósitos de {payer} son de manejar",

  "portal.title": "Llenando el formulario del condado",
  "portal.body": "KeepCovered está escribiendo su paquete en el portal de ejemplo del condado. Se detendrá antes de enviar.",
  "portal.frame.label": "Vista en vivo del portal del condado",
  "portal.log": "Lo que hizo",
  "portal.review.title": "Revisar y enviar",
  "portal.review.body": "Revise cada campo. El formulario solo llega al condado cuando usted presiona Enviar.",
  "portal.review.field": "Campo",
  "portal.review.packet": "Su paquete",
  "portal.review.form": "Formulario",
  "portal.review.mismatch": "Un campo no coincide con su paquete. Corríjalo antes de enviar.",
  "portal.submit": "Enviar al condado",
  "portal.submitting": "Enviando…",
  "portal.submitted.title": "Enviado al condado",
  "portal.submitted.body": "Guarde este número de confirmación: {confirmation}",
  "portal.back": "Volver a mis resultados",
  "portal.starting": "Abriendo el portal del condado…",
  "portal.error": "El portal dejó de responder. No se envió nada.",

  "reason.income_met": "Sus ganancias brutas de {gross} llegan a la línea de $580.",
  "reason.income_short": "Sus ganancias brutas de {gross} quedan {short_by} debajo de la línea de $580.",
  "reason.gross_meets_net_short":
    "Antes de las comisiones de la app ganó {gross}. Después de comisiones son {net}. La regla dice que el ingreso bruto debe llegar a {threshold}, así que usamos el bruto.",
  "reason.hours_met": "{active} horas activas llegan a la línea de 80 horas.",
  "reason.online_only_hours":
    "Estuvo conectado {online} horas pero activo {active} horas. Solo contamos horas activas, porque el condado quizás no cuente el tiempo de espera.",
  "reason.hours_short": "{hours} horas quedan {short_by} debajo de la línea de 80 horas.",
  "reason.combined_activities": "Sumamos {other_hours} horas de otras actividades (escuela, voluntariado o un programa de trabajo).",
  "reason.bank_only_income":
    "{count} depósitos en el banco ({amount}) parecen pago de manejo, pero no hay capturas para ellos.",
  "reason.split_across_months": "Una captura ({doc_id}) cubre dos meses. La dividimos por día.",
  "reason.low_confidence_excluded":
    "No pudimos leer bien el campo {field} en {doc_id}, así que no lo contamos.",
  "reason.missing_month": "No tenemos documentos de este mes.",
  "reason.education_unconfirmed": "Las horas de escuela necesitan prueba de su escuela antes de contar.",
  "reason.relies_on_bank_only_income":
    "Este mes solo llega a la regla con {amount} en depósitos que usted dijo que eran de manejar. Agregue esas capturas de la app para estar seguros.",
  "reason.unreadable_document": "No pudimos leer {count} foto(s). Una podría ser de este mes.",

  "trace.title": "Registro del agente",
  "trace.body": "Cada paso que tomó el agente en este caso. Claude lee y explica. El código decide.",
  "trace.col.time": "Hora",
  "trace.col.step": "Paso",
  "trace.col.what": "Qué pasó",
  "trace.col.by": "Decidido por",
  "trace.col.model": "Modelo / esfuerzo",
  "trace.col.tokens": "Tokens entrada / salida / caché",
  "trace.col.cost": "Costo",
  "trace.col.latency": "Latencia",
  "trace.total.cost": "Costo total",
  "trace.total.tokens": "Tokens totales",
  "trace.total.time": "Tiempo de modelo",
  "trace.split": "Pasos según quién decidió",
  "trace.back": "Volver a resultados",

  "common.loading": "Cargando…",
  "common.close": "Cerrar",
};

const DICTS: Record<Lang, Record<CopyKey, string>> = { en, es };

export type CopyParams = Record<string, string | number>;

/** Look up copy and fill `{name}` placeholders. Unknown placeholders are left visible so gaps are easy to spot. */
export function t(key: CopyKey, lang: Lang, params?: CopyParams): string {
  const template = DICTS[lang]?.[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function hasCopy(key: string): key is CopyKey {
  return key in en;
}

export function isLang(value: unknown): value is Lang {
  return value === "en" || value === "es";
}

const LOCALES: Record<Lang, string> = { en: "en-US", es: "es-US" };

export function fmtMoney(amount: number, lang: Lang, cents = true): string {
  return new Intl.NumberFormat(LOCALES[lang], {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  }).format(amount);
}

export function fmtNumber(n: number, lang: Lang, digits = 1): string {
  return new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: digits }).format(n);
}

/** "2026-09" → "September 2026" / "septiembre de 2026" */
export function fmtMonth(monthKey: string, lang: Lang, style: "long" | "short" = "long"): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat(LOCALES[lang], { month: style, year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

export function fmtMonthName(monthKey: string, lang: Lang): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Intl.DateTimeFormat(LOCALES[lang], { month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, 1)),
  );
}

/** "2026-12-08" → "December 8, 2026" */
export function fmtDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat(LOCALES[lang], {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

const MONEY_PARAMS = new Set(["gross", "net", "threshold", "amount"]);
const HOUR_PARAMS = new Set(["online", "active", "hours", "other_hours"]);

/**
 * Render a rules-engine reason code. Money params are formatted as currency; `short_by`
 * is money for income codes and hours for hour codes.
 */
export function reasonText(
  code: string,
  params: Record<string, string | number>,
  lang: Lang,
): string {
  const key = `reason.${code}`;
  if (!hasCopy(key)) return code;
  const isHourCode = code.startsWith("hours") || code === "online_only_hours";
  const formatted: CopyParams = {};
  for (const [name, raw] of Object.entries(params)) {
    if (typeof raw !== "number") {
      formatted[name] = raw;
    } else if (MONEY_PARAMS.has(name) || (name === "short_by" && !isHourCode)) {
      formatted[name] = fmtMoney(raw, lang);
    } else if (HOUR_PARAMS.has(name) || name === "short_by") {
      formatted[name] = fmtNumber(raw, lang);
    } else {
      formatted[name] = fmtNumber(raw, lang, 2);
    }
  }
  return t(key, lang, formatted);
}
