// HTML templates for synthetic driver-app earnings screens. Generic layouts: no logos, no brand fonts,
// no brand colors. Platform name appears only as plain text.
export type AppKey = "uber" | "lyft" | "doordash" | "instacart";
export type Lang = "en" | "es";

export interface StatementView {
  platform: AppKey;
  lang: Lang;
  comma: boolean;
  mode: "weekly" | "monthly";
  start: string;
  end: string;
  gross: number;
  tips: number;
  promos: number;
  fees: number;
  net: number;
  online: number;
  active: number;
  trips: number;
  /** Weekly gross for the bar chart on monthly summaries. */
  bars: number[];
  clock: string;
  battery: number;
  statsBelow: boolean;
  timeStyle: "hm" | "colon";
  layout: "centered" | "left";
  /** Extra text card (used for the prompt-injection fixture). */
  banner?: string;
}

export interface CashoutView {
  platform: AppKey;
  lang: Lang;
  comma: boolean;
  start: string;
  end: string;
  rows: { date: string; amount: number; fee: number }[];
  clock: string;
  battery: number;
}

const THEME: Record<AppKey, { name: string; accent: string; soft: string }> = {
  uber: { name: "Uber", accent: "#34406b", soft: "#e8ebf5" },
  lyft: { name: "Lyft", accent: "#6b3fa0", soft: "#f0e9f8" },
  doordash: { name: "DoorDash", accent: "#b0531c", soft: "#fbece3" },
  instacart: { name: "Instacart", accent: "#2a7a63", soft: "#e4f3ee" },
};

const L = {
  en: {
    earnings: "Earnings",
    tabs: ["Today", "Week", "Month"],
    total: "Total earnings",
    breakdown: "Breakdown",
    base: { uber: "Trip earnings", lyft: "Ride earnings", doordash: "Delivery pay", instacart: "Batch earnings" },
    promos: "Promotions",
    tips: "Customer tips",
    fee: "Service fee",
    net: "Net payout",
    unit: { uber: "Trips", lyft: "Rides", doordash: "Deliveries", instacart: "Orders" },
    online: "Online time",
    active: "Active time",
    payout: "Paid to your bank account ending in ••00",
    weekBar: "Weekly earnings",
    wk: "W",
    months: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
    mon: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    nav: ["Home", "Earnings", "Inbox", "Account"],
    cashTitle: "Instant cash out",
    cashSub: "Transfers this period",
    cashFee: "Fee",
    cashTotal: "Total cashed out",
  },
  es: {
    earnings: "Ganancias",
    tabs: ["Hoy", "Semana", "Mes"],
    total: "Ganancias totales",
    breakdown: "Desglose",
    base: { uber: "Ganancias por viajes", lyft: "Ganancias por viajes", doordash: "Pago por entregas", instacart: "Ganancias por lotes" },
    promos: "Promociones",
    tips: "Propinas de clientes",
    fee: "Cargo por servicio",
    net: "Pago neto",
    unit: { uber: "Viajes", lyft: "Viajes", doordash: "Entregas", instacart: "Pedidos" },
    online: "Tiempo en línea",
    active: "Tiempo activo",
    payout: "Pagado a tu cuenta bancaria que termina en ••00",
    weekBar: "Ganancias semanales",
    wk: "S",
    months: ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"],
    mon: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
    nav: ["Inicio", "Ganancias", "Bandeja", "Cuenta"],
    cashTitle: "Cobro instantáneo",
    cashSub: "Transferencias de este periodo",
    cashFee: "Cargo",
    cashTotal: "Total cobrado",
  },
} as const;

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function fmtMoney(n: number, lang: Lang, comma: boolean): string {
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split(".");
  const useComma = lang === "es" && comma;
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, useComma ? "." : ",");
  return `${neg ? "−" : ""}$${grouped}${useComma ? "," : "."}${dec}`;
}

export function fmtHours(h: number, lang: Lang, style: "hm" | "colon"): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  if (style === "colon") return `${hh}:${String(mm).padStart(2, "0")}`;
  return lang === "es" ? `${hh} h ${mm} min` : `${hh}h ${mm}m`;
}

function parts(iso: string): [number, number, number] {
  const [y, m, d] = iso.split("-").map(Number);
  return [y, m, d];
}

export function fmtRange(start: string, end: string, lang: Lang): string {
  const [y1, m1, d1] = parts(start);
  const [y2, m2, d2] = parts(end);
  const mon = L[lang].mon;
  const yr = y1 === y2 ? ` ${y2}` : "";
  if (lang === "es") {
    return m1 === m2 && y1 === y2 ? `${d1}–${d2} ${mon[m2 - 1]}${yr}` : `${d1} ${mon[m1 - 1]} – ${d2} ${mon[m2 - 1]}${yr}`;
  }
  return m1 === m2 && y1 === y2 ? `${mon[m1 - 1]} ${d1} – ${d2}${yr ? "," + yr : ""}` : `${mon[m1 - 1]} ${d1} – ${mon[m2 - 1]} ${d2}${yr ? "," + yr : ""}`;
}

export function fmtDay(iso: string, lang: Lang): string {
  const [, m, d] = parts(iso);
  return lang === "es" ? `${d} ${L.es.mon[m - 1]}` : `${L.en.mon[m - 1]} ${d}`;
}

export function fmtMonthYear(month: string, lang: Lang): string {
  const [y, m] = month.split("-").map(Number);
  return `${L[lang].months[m - 1]} ${y}`;
}

const BASE_CSS = `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:390px;height:844px;overflow:hidden;background:#fff}
body{font-family:-apple-system,"SF Pro Text","Helvetica Neue",Arial,sans-serif;color:#1c1f26}
.screen{position:relative;width:390px;height:844px;background:#f4f5f7;overflow:hidden}
.top{color:#fff;padding:0 18px 14px}
.status{height:46px;display:flex;align-items:flex-end;justify-content:space-between;font-size:15px;font-weight:600;padding:0 6px 6px}
.status .ic{display:flex;gap:5px;align-items:center}
.sig{display:flex;gap:2px;align-items:flex-end}.sig i{display:block;width:3px;background:#fff;border-radius:1px}
.bat{width:24px;height:11px;border:1.5px solid #fff;border-radius:3px;position:relative;padding:1px}
.bat b{display:block;height:100%;background:#fff;border-radius:1px}
.pname{font-size:22px;font-weight:700;letter-spacing:.2px;margin-top:6px}
.psub{font-size:13px;opacity:.85;margin-top:2px}
.tabs{display:flex;background:#fff;border-bottom:1px solid #e3e5ea}
.tabs div{flex:1;text-align:center;padding:12px 0;font-size:14px;color:#6b7280;border-bottom:3px solid transparent}
.tabs div.on{font-weight:700;border-bottom-color:var(--accent);color:#1c1f26}
.period{display:flex;align-items:center;justify-content:space-between;padding:14px 20px 4px;font-size:15px;font-weight:600}
.period span{color:var(--accent);font-size:20px}
.hero{padding:6px 20px 14px}
.hero.centered{text-align:center}
.hero .lbl{font-size:13px;color:#6b7280;letter-spacing:.3px;text-transform:uppercase}
.hero .big{font-size:48px;font-weight:800;letter-spacing:-1px;margin-top:2px}
.stats{display:flex;margin:0 16px 12px;background:#fff;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.stats div{flex:1;padding:12px 6px;text-align:center;border-right:1px solid #eceef2}
.stats div:last-child{border-right:0}
.stats b{display:block;font-size:17px;font-weight:700}.stats small{font-size:11px;color:#6b7280}
.card{margin:0 16px 12px;background:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.card h3{font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:8px}
.row{display:flex;justify-content:space-between;padding:7px 0;font-size:15px;border-bottom:1px solid #f0f1f4}
.row:last-child{border-bottom:0}
.row.net{font-weight:800;font-size:17px;background:var(--soft);margin:6px -16px -14px;padding:12px 16px;border-radius:0 0 14px 14px;border-bottom:0}
.row .neg{color:#b42318}
.bars{display:flex;align-items:flex-end;gap:10px;height:96px;padding-top:6px}
.bars div{flex:1;text-align:center;font-size:11px;color:#6b7280}
.bars i{display:block;background:var(--accent);opacity:.85;border-radius:4px 4px 0 0;margin-bottom:4px}
.note{font-size:12px;color:#6b7280;padding:2px 20px 10px}
.banner{margin:0 16px 12px;background:#fff7e0;border:1px solid #f2cf66;border-radius:12px;padding:12px 14px;font-size:13px;line-height:1.35;color:#5a4300;font-weight:600}
.nav{position:absolute;left:0;right:0;bottom:0;height:78px;background:#fff;border-top:1px solid #e3e5ea;display:flex;padding-top:10px}
.nav div{flex:1;text-align:center;font-size:11px;color:#6b7280}
.nav div.on{color:var(--accent);font-weight:700}
.nav i{display:block;width:22px;height:22px;border-radius:6px;background:#d5d8df;margin:0 auto 4px}
.nav .on i{background:var(--accent)}
`;

function shell(accentKey: AppKey, lang: Lang, clock: string, battery: number, subtitle: string, inner: string): string {
  const t = THEME[accentKey];
  const l = L[lang];
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>${BASE_CSS}
:root{--accent:${t.accent};--soft:${t.soft}}</style></head><body>
<div class="screen" id="screen">
<div class="top" style="background:${t.accent}">
 <div class="status"><span>${esc(clock)}</span><span class="ic"><span class="sig"><i style="height:4px"></i><i style="height:6px"></i><i style="height:8px"></i><i style="height:10px"></i></span><span>5G</span><span class="bat"><b style="width:${battery}%"></b></span></span></div>
 <div class="pname">${t.name}</div><div class="psub">${esc(subtitle)}</div>
</div>
${inner}
<div class="nav">${l.nav.map((n, i) => `<div class="${i === 1 ? "on" : ""}"><i></i>${n}</div>`).join("")}</div>
</div></body></html>`;
}

export function statementHtml(v: StatementView): string {
  const l = L[v.lang];
  const m = (n: number) => fmtMoney(n, v.lang, v.comma);
  const period =
    v.mode === "monthly" ? fmtMonthYear(v.start.slice(0, 7), v.lang) : fmtRange(v.start, v.end, v.lang);
  const tabIdx = v.mode === "monthly" ? 2 : 1;
  const stats = `<div class="stats">
  <div><b>${v.trips}</b><small>${l.unit[v.platform]}</small></div>
  <div><b>${fmtHours(v.online, v.lang, v.timeStyle)}</b><small>${l.online}</small></div>
  <div><b>${fmtHours(v.active, v.lang, v.timeStyle)}</b><small>${l.active}</small></div></div>`;
  const base = v.gross - v.tips - v.promos;
  const breakdown = `<div class="card"><h3>${l.breakdown}</h3>
  <div class="row"><span>${l.base[v.platform]}</span><span>${m(base)}</span></div>
  ${v.promos > 0 ? `<div class="row"><span>${l.promos}</span><span>${m(v.promos)}</span></div>` : ""}
  <div class="row"><span>${l.tips}</span><span>${m(v.tips)}</span></div>
  <div class="row"><span>${l.fee}</span><span class="neg">${m(-v.fees)}</span></div>
  <div class="row net" id="net"><span>${l.net}</span><span>${m(v.net)}</span></div></div>`;
  const bars = v.bars.length
    ? (() => {
        const max = Math.max(...v.bars, 1);
        return `<div class="card"><h3>${l.weekBar}</h3><div class="bars">${v.bars
          .map((b, i) => `<div><i style="height:${Math.max(6, Math.round((b / max) * 70))}px"></i>${l.wk}${i + 1}</div>`)
          .join("")}</div></div>`;
      })()
    : "";
  const inner = `
<div class="tabs">${l.tabs.map((t, i) => `<div class="${i === tabIdx ? "on" : ""}">${t}</div>`).join("")}</div>
<div class="period"><span>‹</span>${esc(period)}<span>›</span></div>
<div class="hero ${v.layout}"><div class="lbl">${l.total}</div><div class="big" id="total">${m(v.gross)}</div></div>
${v.banner ? `<div class="banner">${esc(v.banner)}</div>` : ""}
${v.statsBelow ? breakdown + stats : stats + breakdown}
${v.mode === "monthly" ? bars : `<div class="note">${l.payout}</div>`}`;
  return shell(v.platform, v.lang, v.clock, v.battery, l.earnings, inner);
}

export function cashoutHtml(v: CashoutView): string {
  const l = L[v.lang];
  const m = (n: number) => fmtMoney(n, v.lang, v.comma);
  const total = v.rows.reduce((a, r) => a + r.amount, 0);
  const inner = `
<div class="period" style="padding-top:18px"><span></span>${esc(fmtRange(v.start, v.end, v.lang))}<span></span></div>
<div class="hero"><div class="lbl">${l.cashTotal}</div><div class="big" id="total">${m(total)}</div></div>
<div class="card"><h3>${l.cashSub}</h3>
${v.rows
  .map((r) => `<div class="row"><span>${l.cashTitle}<br><small style="color:#6b7280">${fmtDay(r.date, v.lang)}</small></span><span style="text-align:right">${m(r.amount)}<br><small class="neg" style="color:#b42318">${l.cashFee} ${m(-r.fee)}</small></span></div>`)
  .join("")}
</div>`;
  return shell(v.platform, v.lang, v.clock, v.battery, l.cashTitle, inner);
}
