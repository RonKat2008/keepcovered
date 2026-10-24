// Proof packet: cover letter, summary table, evidence index, deadlines, then the member's own documents.
// Status text is generated from enums/reason codes (copy.ts). Nothing here decides compliance.
import { PDFDocument, type PDFImage } from "pdf-lib";
import type { CaseResult, MonthStatus } from "@/lib/schemas";
import { COPY, dateLabel, hours, money, monthLabel, openQuestionText, statusLabel, type PacketLang } from "./copy";
import { sanitize, wrapText } from "./text";
import { BAND, CONTENT_W, INK, MARGIN, MUTED, PAGE_W, RULE, Writer, loadFonts, stampFooters } from "./writer";

export interface PacketDoc {
  id: string;
  name: string;
  mime: string;
  bytes: Uint8Array;
}

export interface PacketInput {
  result: CaseResult;
  docs: PacketDoc[];
  lang: PacketLang;
  generatedAt: string;
}

type Attachment =
  | { kind: "pdf"; doc: PacketDoc; src: PDFDocument; pages: number }
  | { kind: "image"; doc: PacketDoc; pages: 1 }
  | { kind: "placeholder"; doc: PacketDoc; pages: 1 };

const PLATFORM_NAMES: Record<string, string> = { uber: "Uber", lyft: "Lyft", doordash: "DoorDash", instacart: "Instacart", other: "Other" };

async function prepareAttachments(docs: PacketDoc[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const doc of docs) {
    const mime = doc.mime.toLowerCase();
    if (mime === "image/png" || mime === "image/jpeg" || mime === "image/jpg") {
      out.push({ kind: "image", doc, pages: 1 });
    } else if (mime === "application/pdf") {
      try {
        const src = await PDFDocument.load(doc.bytes, { ignoreEncryption: false });
        out.push({ kind: "pdf", doc, src, pages: src.getPageCount() });
      } catch {
        out.push({ kind: "placeholder", doc, pages: 1 });
      }
    } else {
      out.push({ kind: "placeholder", doc, pages: 1 });
    }
  }
  return out;
}

function pageRanges(attachments: Attachment[], firstPage: number): Map<string, { from: number; to: number }> {
  const map = new Map<string, { from: number; to: number }>();
  let next = firstPage;
  for (const a of attachments) {
    map.set(a.doc.id, { from: next, to: next + a.pages - 1 });
    next += a.pages;
  }
  return map;
}

function fmtRange(r: { from: number; to: number } | undefined, lang: PacketLang): string {
  const c = COPY[lang];
  if (!r) return c.none;
  return r.from === r.to ? `${c.page} ${r.from}` : `${c.pages} ${r.from}-${r.to}`;
}

function docPeriod(input: PacketInput, docId: string, lang: PacketLang): string | null {
  const rec = input.result.records.find((r) => r.source_doc_id === docId);
  if (!rec || !rec.period_start || !rec.period_end) return null;
  return `${dateLabel(rec.period_start, lang)} - ${dateLabel(rec.period_end, lang)}`;
}

function monthApps(input: PacketInput, m: MonthStatus): string {
  const ids = new Set(m.evidence_doc_ids);
  const names = new Set<string>();
  for (const r of input.result.records) {
    if (ids.has(r.source_doc_id) && r.platform) names.add(PLATFORM_NAMES[r.platform] ?? r.platform);
  }
  return names.size ? [...names].join(", ") : COPY[input.lang].none;
}

function sortedMonths(result: CaseResult): MonthStatus[] {
  return [...result.months].sort((a, b) => a.month.localeCompare(b.month));
}

// ---------- front matter ----------

function drawCover(w: Writer, input: PacketInput): void {
  const { lang } = input;
  const c = COPY[lang];
  w.text(c.coverTitle, { size: 20, bold: true, gap: 14 });
  w.text(`${c.date}: ${dateLabel(input.generatedAt, lang)}`, { gap: 6 });
  w.text(c.to, { gap: 6 });
  const months = sortedMonths(input.result).map((m) => monthLabel(m.month, lang));
  w.text(`${c.reLead} ${months.length ? months.join(", ") : c.none}`, { bold: true, gap: 16 });
  w.text(c.body, { size: 11, gap: 28 });
  w.text(c.fields, { size: 11, gap: 18 });
  w.rule(12);
  w.text(c.footer, { size: 9, color: MUTED });
}

const COL_WIDTHS = [84, 58, 58, 44, 44, 60, 0];

function drawSummary(w: Writer, input: PacketInput): void {
  const c = COPY[input.lang];
  const { regular, bold } = w.fonts;
  const widths = [...COL_WIDTHS];
  widths[6] = CONTENT_W - widths.slice(0, 6).reduce((a, b) => a + b, 0);
  const xs = widths.reduce<number[]>((acc, cw, i) => [...acc, i === 0 ? MARGIN : acc[i - 1]! + widths[i - 1]!], []);
  const size = 8.5;
  const pad = 4;

  const drawRow = (cells: string[], header: boolean, shade: boolean) => {
    const font = header ? bold : regular;
    const wrapped = cells.map((cell, i) => wrapText(cell, font, size, widths[i]! - pad * 2));
    const lines = Math.max(...wrapped.map((l) => l.length));
    const rowH = lines * size * 1.3 + pad * 2;
    w.ensure(rowH);
    const top = w.y;
    if (header || shade) w.page.drawRectangle({ x: MARGIN, y: top - rowH, width: CONTENT_W, height: rowH, color: BAND });
    wrapped.forEach((ls, i) => {
      ls.forEach((line, li) => {
        const numeric = i >= 1 && i <= 4;
        const tw = font.widthOfTextAtSize(line, size);
        const x = numeric ? xs[i]! + widths[i]! - pad - tw : xs[i]! + pad;
        w.page.drawText(line, { x, y: top - pad - size - li * size * 1.3 + 1, size, font, color: INK });
      });
    });
    w.page.drawLine({ start: { x: MARGIN, y: top - rowH }, end: { x: PAGE_W - MARGIN, y: top - rowH }, thickness: 0.4, color: RULE });
    w.y = top - rowH;
  };

  w.heading(c.summaryTitle);
  drawRow([...c.cols], true, false);

  const notes = new Map<string, number>();
  const noteOrder: string[] = [];
  sortedMonths(input.result).forEach((m, idx) => {
    const marks: number[] = [];
    for (const qid of m.open_question_ids) {
      if (!openQuestionText(qid, input.lang)) continue;
      if (!notes.has(qid)) {
        notes.set(qid, noteOrder.length + 1);
        noteOrder.push(qid);
      }
      marks.push(notes.get(qid)!);
    }
    const label = statusLabel(m, input.lang) + (marks.length ? ` (${marks.map((n) => `*${n}`).join(", ")})` : "");
    drawRow(
      [
        monthLabel(m.month, input.lang),
        money(m.gross_income),
        money(m.net_income),
        hours(m.active_hours),
        hours(m.online_hours),
        monthApps(input, m),
        label,
      ],
      false,
      idx % 2 === 1,
    );
  });
  if (input.result.months.length === 0) w.text(c.none, { color: MUTED });

  if (noteOrder.length) {
    w.space(14);
    w.text(c.notesTitle, { size: 11, bold: true, gap: 3 });
    noteOrder.forEach((qid, i) => {
      w.text(`*${i + 1}  ${openQuestionText(qid, input.lang)}`, { size: 9, color: INK, gap: 3 });
    });
  }
}

function drawEvidence(w: Writer, input: PacketInput, ranges: Map<string, { from: number; to: number }>, nameById: Map<string, string>): void {
  const c = COPY[input.lang];
  w.space(10);
  w.heading(c.evidenceTitle);
  const txnById = new Map(input.result.reconcile.user_labeled_income.map((t) => [t.id, t]));
  for (const m of sortedMonths(input.result)) {
    w.ensure(60);
    w.text(monthLabel(m.month, input.lang), { size: 11, bold: true, gap: 2 });
    const docIds = m.evidence_doc_ids.filter((id) => !id.startsWith("txn:"));
    if (docIds.length === 0) w.text(c.evidenceNone, { size: 9, color: MUTED, x: MARGIN + 12 });
    for (const id of docIds) {
      const name = nameById.get(id) ?? id;
      w.text(`${c.docs}: ${name}  (${fmtRange(ranges.get(id), input.lang)})`, { size: 9, x: MARGIN + 12 });
    }
    const matched = input.result.reconcile.matches.filter((x) => docIds.includes(x.source_doc_id)).flatMap((x) => x.txn_ids);
    if (matched.length) {
      w.text(`${c.deposits} - ${c.depositsMatched}: ${matched.join(", ")}`, { size: 9, x: MARGIN + 12 });
    }
    const labeled = m.evidence_doc_ids.filter((id) => id.startsWith("txn:")).map((id) => txnById.get(id.slice(4)));
    const labeledLines = labeled.filter((t): t is NonNullable<typeof t> => Boolean(t));
    if (labeledLines.length) {
      w.text(`${c.deposits} - ${c.depositsLabeled}:`, { size: 9, x: MARGIN + 12 });
      for (const t of labeledLines) {
        w.text(`${dateLabel(t.date, input.lang)}  ${money(t.amount)}  ${t.description}`, { size: 9, x: MARGIN + 24 });
      }
    }
    w.space(6);
  }
}

function drawDeadlines(w: Writer, input: PacketInput): void {
  const c = COPY[input.lang];
  w.space(8);
  w.heading(c.deadlinesTitle);
  const list = [...input.result.deadlines].sort((a, b) => a.date.localeCompare(b.date));
  if (!list.length) w.text(c.noDeadlines, { color: MUTED });
  for (const d of list) {
    w.text(`${dateLabel(d.date, input.lang)}  -  ${input.lang === "en" ? d.title_en : d.title_es}`, { size: 10, gap: 2 });
  }
}

// ---------- attachments ----------

async function drawImagePage(out: PDFDocument, w: Writer, input: PacketInput, a: Attachment): Promise<void> {
  const c = COPY[input.lang];
  w.newPage();
  const period = docPeriod(input, a.doc.id, input.lang);
  w.text(a.doc.name, { size: 11, bold: true, gap: 1 });
  if (period) w.text(`${c.period}: ${period}`, { size: 9, color: MUTED, gap: 4 });
  const top = w.y - 6;
  const bottom = 48;
  if (a.kind !== "image") {
    w.text(c.unembeddable, { size: 10, color: MUTED });
    return;
  }
  let img: PDFImage;
  try {
    img = a.doc.mime.toLowerCase() === "image/png" ? await out.embedPng(a.doc.bytes) : await out.embedJpg(a.doc.bytes);
  } catch {
    w.text(c.unembeddable, { size: 10, color: MUTED });
    return;
  }
  const maxW = CONTENT_W;
  const maxH = top - bottom;
  const scale = Math.min(maxW / img.width, maxH / img.height, 1.5);
  const dw = img.width * scale;
  const dh = img.height * scale;
  w.page.drawImage(img, { x: (PAGE_W - dw) / 2, y: top - dh, width: dw, height: dh });
  w.page.drawRectangle({ x: (PAGE_W - dw) / 2, y: top - dh, width: dw, height: dh, borderColor: RULE, borderWidth: 0.5 });
}

// ---------- entry point ----------

export async function buildPacket(input: PacketInput): Promise<Uint8Array> {
  const attachments = await prepareAttachments(input.docs);
  const nameById = new Map(input.docs.map((d) => [d.id, sanitize(d.name)]));
  const c = COPY[input.lang];

  const buildFront = async (frontCount: number) => {
    const doc = await PDFDocument.create();
    doc.setTitle(sanitize(c.packetFooter));
    doc.setProducer("KeepCovered");
    doc.setCreator("KeepCovered");
    const fonts = await loadFonts(doc);
    const w = new Writer(doc, fonts, "KeepCovered", c.packetFooter);
    const ranges = pageRanges(attachments, frontCount + 1);
    drawCover(w, input);
    w.newPage();
    drawSummary(w, input);
    drawEvidence(w, input, ranges, nameById);
    drawDeadlines(w, input);
    return { doc, fonts, w, count: doc.getPageCount() };
  };

  // Page numbers in the evidence index depend on how many front pages there are; iterate to a fixed point.
  let guess = 3;
  let front = await buildFront(guess);
  for (let i = 0; i < 4 && front.count !== guess; i++) {
    guess = front.count;
    front = await buildFront(guess);
  }

  const { doc, fonts, w } = front;
  for (const a of attachments) {
    if (a.kind === "pdf") {
      const copied = await doc.copyPages(a.src, a.src.getPageIndices());
      copied.forEach((p) => doc.addPage(p));
    } else {
      await drawImagePage(doc, w, input, a);
    }
  }

  stampFooters(doc, fonts.regular, c.packetFooter, c.of);
  return doc.save();
}

