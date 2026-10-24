import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildPacket } from "@/pdf/packet";
import { sanitize } from "@/pdf/text";
import { CaseResult } from "@/lib/schemas";
import { fixtureCase, makePdf, makePng } from "./fixtures";

const OUT = join(__dirname, "__out__");
const GENERATED_AT = "2026-10-23T12:00:00Z";

async function docs() {
  return [
    { id: "doc-jul", name: "uber-july-“earnings”.png", mime: "image/png", bytes: makePng(300, 520, [200, 120, 60]) },
    { id: "doc-aug", name: "lyft-august.png", mime: "image/png", bytes: makePng(640, 300, [60, 160, 200]) },
    { id: "doc-bank", name: "bank-statement.pdf", mime: "application/pdf", bytes: await makePdf(2) },
    { id: "doc-sep", name: "weird.heic", mime: "image/heic", bytes: new Uint8Array([1, 2, 3]) },
  ];
}

describe("fixture", () => {
  it("parses with the CaseResult schema", () => {
    expect(() => CaseResult.parse(fixtureCase())).not.toThrow();
  });
});

describe("buildPacket", () => {
  it.each(["en", "es"] as const)("builds a valid %s packet", async (lang) => {
    const bytes = await buildPacket({ result: fixtureCase(lang), docs: await docs(), lang, generatedAt: GENERATED_AT });
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `packet-${lang}.pdf`), bytes);

    const parsed = await PDFDocument.load(bytes);
    // front matter (>=2 pages) + 2 images + 2 pdf pages + 1 placeholder
    const total = parsed.getPageCount();
    expect(total).toBeGreaterThanOrEqual(2 + 5);
    expect(total).toBeLessThanOrEqual(12);
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe("%PDF-");
  });

  it("works with no documents and no months", async () => {
    const empty = { ...fixtureCase(), months: [], deadlines: [], records: [] };
    const bytes = await buildPacket({ result: empty, docs: [], lang: "en", generatedAt: GENERATED_AT });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(2);
  });

  it("survives a corrupt PDF and a corrupt PNG with placeholders", async () => {
    const bytes = await buildPacket({
      result: fixtureCase(),
      docs: [
        { id: "doc-jul", name: "bad.pdf", mime: "application/pdf", bytes: new Uint8Array([1, 2, 3]) },
        { id: "doc-aug", name: "bad.png", mime: "image/png", bytes: new Uint8Array([1, 2, 3]) },
      ],
      lang: "es",
      generatedAt: GENERATED_AT,
    });
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThanOrEqual(4);
  });

  it("handles text outside WinAnsi without throwing", async () => {
    const r = fixtureCase();
    r.deadlines[0]!.title_en = "Report — due “soon” ☃ 中";
    await expect(buildPacket({ result: r, docs: [], lang: "en", generatedAt: GENERATED_AT })).resolves.toBeInstanceOf(Uint8Array);
  });
});

describe("sanitize", () => {
  it("maps typographic characters to ASCII and keeps Spanish accents", () => {
    expect(sanitize("“hi” — it’s…")).toBe('"hi" - it\'s...');
    expect(sanitize("áéíóúñ¿¡ÁÑ")).toBe("áéíóúñ¿¡ÁÑ");
    expect(sanitize("中☃")).toBe("??");
  });
});
