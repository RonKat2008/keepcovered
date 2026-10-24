// Synthetic county notice (DHCS-style work and community engagement verification request). No seal, no real branding.
import type { CountyLetterExtraction } from "../../src/lib/schemas";
import type { Lang } from "./templates";
import { fmtMonthYear } from "./templates";
import type { z } from "zod";

export type LetterVariant = "work_rule_notice" | "verification_request" | "renewal";
export type LetterTruth = z.infer<typeof CountyLetterExtraction>;

export interface LetterView {
  lang: Lang;
  variant: LetterVariant;
  noticeDate: string;
  deadline: string;
  months: string[];
  memberName: string;
  caseRef: string;
}

export const COUNTY_NAME = "County of Alameda Social Services";
export const PAGE_W = 612;
export const PAGE_H = 792;

const MONTHS_LONG = {
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  es: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
};

export function longDate(iso: string, lang: Lang): string {
  const [y, m, d] = iso.split("-").map(Number);
  return lang === "es" ? `${d} de ${MONTHS_LONG.es[m - 1]} de ${y}` : `${MONTHS_LONG.en[m - 1]} ${d}, ${y}`;
}

const ITEMS: Record<LetterVariant, Record<Lang, string[]>> = {
  work_rule_notice: {
    en: ["Report your work, income, or community activity each month starting with your next report"],
    es: ["Informe su trabajo, ingresos o actividad comunitaria cada mes a partir de su próximo informe"],
  },
  verification_request: {
    en: [
      "Proof of income for each month listed (earnings statements, pay stubs, or self-employment records)",
      "Proof of hours worked for each month listed (app activity or hours summaries)",
      "Any documents showing an exemption you believe applies to you",
    ],
    es: [
      "Comprobante de ingresos de cada mes indicado (estados de ganancias, talones de pago o registros de trabajo por cuenta propia)",
      "Comprobante de horas trabajadas de cada mes indicado (actividad de la aplicación o resúmenes de horas)",
      "Cualquier documento que muestre una exención que usted cree que le corresponde",
    ],
  },
  renewal: {
    en: [
      "Proof of income for each month listed",
      "Bank statements showing deposits for the same months",
      "Signed renewal form",
    ],
    es: [
      "Comprobante de ingresos de cada mes indicado",
      "Estados de cuenta bancarios que muestren los depósitos de los mismos meses",
      "Formulario de renovación firmado",
    ],
  },
};

export function letterTruth(v: LetterView): LetterTruth {
  return {
    letter_type: v.variant,
    notice_date: v.noticeDate,
    response_deadline: v.deadline,
    requested_items: ITEMS[v.variant][v.lang],
    months_requested: v.variant === "work_rule_notice" ? [] : v.months,
    language: v.lang,
    county_name: COUNTY_NAME,
    unreadable_reason: null,
  };
}

const COPY = {
  en: {
    dept: "Department of Benefits and Eligibility",
    title: {
      work_rule_notice: "Notice: Medi-Cal Work and Community Engagement Requirements",
      verification_request: "Request for Verification: Work and Community Engagement",
      renewal: "Medi-Cal Renewal: Verification Needed",
    },
    date: "Notice date",
    case: "Case number",
    to: "To",
    dear: (n: string) => `Dear ${n},`,
    body: {
      work_rule_notice:
        "Medi-Cal now includes work and community engagement requirements for some adults. This notice explains that you may be asked to show that you worked, earned income, or took part in approved activities. This is general information only and does not mean your coverage is ending.",
      verification_request:
        "We are reviewing your Medi-Cal coverage. To check the work and community engagement requirement, we need proof of your work activity for the month(s) listed below. If you drive or deliver for a rideshare or delivery app, earnings summaries from the app are accepted.",
      renewal:
        "It is time to renew your Medi-Cal coverage. As part of your renewal, we need proof of your work activity for the month(s) listed below. Please send the items listed in the requested documents section.",
    },
    monthsLbl: "Months we are asking about",
    itemsLbl: "Documents requested",
    deadlineLbl: "Respond by",
    deadlineNote: "If we do not hear from you by this date, the county may take action on your case. You can ask for help or more time.",
    contact: "Questions? Call the DEMO county help line at 000-000-0000 or visit a DEMO service center.",
    synth: "SYNTHETIC DEMO DOCUMENT. Not a real county notice.",
  },
  es: {
    dept: "Departamento de Beneficios y Elegibilidad",
    title: {
      work_rule_notice: "Aviso: Requisitos de trabajo y participación comunitaria de Medi-Cal",
      verification_request: "Solicitud de verificación: trabajo y participación comunitaria",
      renewal: "Renovación de Medi-Cal: se necesita verificación",
    },
    date: "Fecha del aviso",
    case: "Número de caso",
    to: "Para",
    dear: (n: string) => `Estimado/a ${n}:`,
    body: {
      work_rule_notice:
        "Medi-Cal ahora incluye requisitos de trabajo y participación comunitaria para algunos adultos. Este aviso explica que se le puede pedir que demuestre que trabajó, tuvo ingresos o participó en actividades aprobadas. Es información general y no significa que su cobertura vaya a terminar.",
      verification_request:
        "Estamos revisando su cobertura de Medi-Cal. Para verificar el requisito de trabajo y participación comunitaria, necesitamos comprobantes de su actividad laboral de los meses indicados abajo. Si usted maneja o hace entregas con una aplicación, se aceptan los resúmenes de ganancias de la aplicación.",
      renewal:
        "Es hora de renovar su cobertura de Medi-Cal. Como parte de la renovación, necesitamos comprobantes de su actividad laboral de los meses indicados abajo. Envíe los documentos de la lista de documentos solicitados.",
    },
    monthsLbl: "Meses sobre los que preguntamos",
    itemsLbl: "Documentos solicitados",
    deadlineLbl: "Responda antes del",
    deadlineNote: "Si no recibimos su respuesta para esta fecha, el condado podría tomar medidas en su caso. Puede pedir ayuda o más tiempo.",
    contact: "¿Preguntas? Llame a la línea de ayuda del condado DEMO al 000-000-0000 o visite un centro de servicio DEMO.",
    synth: "DOCUMENTO SINTÉTICO DE DEMOSTRACIÓN. No es un aviso real del condado.",
  },
} as const;

export function letterHtml(v: LetterView): string {
  const c = COPY[v.lang];
  const items = ITEMS[v.variant][v.lang];
  const months = v.variant === "work_rule_notice" ? [] : v.months;
  return `<!doctype html><html lang="${v.lang}"><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${PAGE_W}px;height:${PAGE_H}px;overflow:hidden;background:#fdfcf8}
body{font-family:"Times New Roman",Georgia,serif;color:#1d1d1d;font-size:13.5px;line-height:1.38}
#screen{position:relative;width:${PAGE_W}px;height:${PAGE_H}px;background:#fdfcf8;padding:34px 44px}
.hd{border-bottom:3px double #333;padding-bottom:10px;margin-bottom:14px}
.hd h1{font-size:19px;letter-spacing:.3px}.hd div{font-size:12.5px;color:#444;margin-top:2px}
.meta{display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:12px}
.meta b{font-weight:700}
h2{font-size:15.5px;margin:6px 0 10px;font-family:Arial,Helvetica,sans-serif}
p{margin-bottom:10px}
.box{border:1.5px solid #333;padding:9px 12px;margin:10px 0;background:#f6f3ea}
.box h3{font-size:12.5px;font-family:Arial,Helvetica,sans-serif;text-transform:uppercase;letter-spacing:.4px;margin-bottom:5px}
ul{margin-left:18px}li{margin-bottom:3px}
.due{font-size:16px;font-weight:700}
.foot{position:absolute;left:44px;right:44px;bottom:26px;font-size:11px;color:#444;border-top:1px solid #999;padding-top:6px}
.foot b{display:block;color:#a00;margin-top:3px;font-family:Arial,Helvetica,sans-serif;font-size:10.5px}
</style></head><body><div id="screen">
<div class="hd"><h1>${COUNTY_NAME} — DEMO</h1><div>${c.dept}</div></div>
<div class="meta"><div><b>${c.date}:</b> ${longDate(v.noticeDate, v.lang)}<br><b>${c.case}:</b> ${v.caseRef}</div><div><b>${c.to}:</b><br>${v.memberName}<br>123 Demo Street<br>Oakland, CA (DEMO)</div></div>
<h2>${c.title[v.variant]}</h2>
<p>${c.dear(v.memberName)}</p>
<p>${c.body[v.variant]}</p>
${months.length ? `<div class="box"><h3>${c.monthsLbl}</h3><ul>${months.map((m) => `<li>${fmtMonthYear(m, v.lang)}</li>`).join("")}</ul></div>` : ""}
<div class="box"><h3>${c.itemsLbl}</h3><ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul></div>
<p class="due">${c.deadlineLbl}: ${longDate(v.deadline, v.lang)}</p>
<p>${c.deadlineNote}</p>
<p>${c.contact}</p>
<div class="foot">${c.synth}<b>DEMO — NO REAL BENEFITS DATA</b></div>
</div></body></html>`;
}
