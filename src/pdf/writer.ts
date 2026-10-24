import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { sanitize, wrapText } from "./text";

export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN = 54;
export const CONTENT_W = PAGE_W - MARGIN * 2;
const BAND_H = 34;
const FOOTER_Y = 30;

export const INK = rgb(0.1, 0.1, 0.12);
export const MUTED = rgb(0.38, 0.4, 0.44);
export const RULE = rgb(0.78, 0.8, 0.83);
export const BAND = rgb(0.9, 0.91, 0.93);
export const ACCENT = rgb(0.08, 0.32, 0.45);

export interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

export async function loadFonts(doc: PDFDocument): Promise<Fonts> {
  return {
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
}

export interface TextOpts {
  size?: number;
  bold?: boolean;
  color?: ReturnType<typeof rgb>;
  x?: number;
  width?: number;
  gap?: number;
}

/** Flowing single-column layout over a PDFDocument; adds pages (with header band) as needed. */
export class Writer {
  page!: PDFPage;
  y = 0;

  constructor(
    readonly doc: PDFDocument,
    readonly fonts: Fonts,
    private readonly bandLeft: string,
    private readonly bandRight: string,
  ) {
    this.newPage();
  }

  newPage(): PDFPage {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.page.drawRectangle({ x: 0, y: PAGE_H - BAND_H, width: PAGE_W, height: BAND_H, color: BAND });
    this.page.drawText(sanitize(this.bandLeft), { x: MARGIN, y: PAGE_H - 22, size: 10, font: this.fonts.bold, color: ACCENT });
    const right = sanitize(this.bandRight);
    const w = this.fonts.regular.widthOfTextAtSize(right, 9);
    this.page.drawText(right, { x: PAGE_W - MARGIN - w, y: PAGE_H - 22, size: 9, font: this.fonts.regular, color: MUTED });
    this.y = PAGE_H - BAND_H - 30;
    return this.page;
  }

  ensure(height: number): void {
    if (this.y - height < FOOTER_Y + 24) this.newPage();
  }

  space(h: number): void {
    this.y -= h;
  }

  rule(gap = 8): void {
    this.y -= gap;
    this.page.drawLine({ start: { x: MARGIN, y: this.y }, end: { x: PAGE_W - MARGIN, y: this.y }, thickness: 0.5, color: RULE });
    this.y -= gap;
  }

  text(str: string, o: TextOpts = {}): void {
    const size = o.size ?? 10;
    const font = o.bold ? this.fonts.bold : this.fonts.regular;
    const x = o.x ?? MARGIN;
    const width = o.width ?? PAGE_W - MARGIN - x;
    const lineH = size * 1.4;
    for (const line of wrapText(str, font, size, width)) {
      this.ensure(lineH);
      this.y -= lineH;
      this.page.drawText(line, { x, y: this.y, size, font, color: o.color ?? INK });
    }
    this.y -= o.gap ?? 0;
  }

  heading(str: string): void {
    this.ensure(40);
    this.text(str, { size: 15, bold: true, color: ACCENT, gap: 4 });
    this.rule(2);
  }
}

/** Page-number footer on every page of the finished document. */
export function stampFooters(doc: PDFDocument, font: PDFFont, label: string, of: string): void {
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const t = sanitize(`${label}  |  ${i + 1} ${of} ${pages.length}`);
    const w = font.widthOfTextAtSize(t, 8);
    const { width } = p.getSize();
    p.drawText(t, { x: width - 36 - w, y: 16, size: 8, font, color: MUTED });
  });
}
