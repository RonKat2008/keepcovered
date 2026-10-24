import { deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { CaseResult } from "@/lib/schemas";

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), Buffer.from(data)]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Tiny valid RGB PNG with a gradient and a dark header bar, so scaling is visible. */
export function makePng(w: number, h: number, tint: [number, number, number]): Uint8Array {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const bar = y < h / 6;
      raw[row + 1 + x * 3] = bar ? 30 : Math.round((tint[0] * x) / w);
      raw[row + 2 + x * 3] = bar ? 30 : Math.round((tint[1] * y) / h);
      raw[row + 3 + x * 3] = bar ? 40 : tint[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", new Uint8Array(0)),
    ]),
  );
}

export async function makePdf(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 1; i <= pages; i++) {
    doc.addPage([612, 792]).drawText(`Bank statement page ${i}`, { x: 72, y: 700, size: 18, font });
  }
  return doc.save();
}

const rec = (id: string, platform: "uber" | "lyft", start: string, end: string, gross: number) => ({
  platform,
  period_start: start,
  period_end: end,
  gross_earnings: gross,
  tips: 20,
  platform_fees: 90,
  net_payout: gross - 90,
  online_hours: 70,
  active_hours: 52.5,
  trips_or_deliveries: 80,
  unreadable_reason: null,
  source_doc_id: id,
  field_confidence: { gross_earnings: "high" as const },
  verification_notes: [],
});

const month = (m: string, over: Record<string, unknown>) => ({
  month: m,
  gross_income: 0,
  net_income: 0,
  online_hours: 0,
  active_hours: 0,
  other_activity_hours: 0,
  meets_income_path: false,
  meets_hours_path: false,
  overall: "missing_data",
  evidence_doc_ids: [],
  reasons: [],
  open_question_ids: [],
  ...over,
});

/** Synthetic case: July meets, August unsure (gross vs net), September short, October missing. */
export function fixtureCase(lang: "en" | "es" = "en"): CaseResult {
  return CaseResult.parse({
    session_id: "sess-demo-0001",
    lang,
    months: [
      month("2026-09", {
        gross_income: 410.5, net_income: 330.25, online_hours: 50, active_hours: 38.2,
        overall: "does_not_meet", evidence_doc_ids: ["doc-sep"],
        reasons: [{ code: "income_short", params: { gross: 410.5, short_by: 169.5 } }],
      }),
      month("2026-07", {
        gross_income: 920, net_income: 800, online_hours: 90, active_hours: 84.5,
        meets_income_path: true, meets_hours_path: true, overall: "meets",
        evidence_doc_ids: ["doc-jul", "doc-bank"],
        reasons: [{ code: "income_met", params: { gross: 920 } }],
      }),
      month("2026-08", {
        gross_income: 640, net_income: 520, online_hours: 82, active_hours: 61.3,
        meets_income_path: "depends_on_open_question", meets_hours_path: "depends_on_open_question",
        overall: "unsure", evidence_doc_ids: ["doc-aug", "txn:t-77"],
        reasons: [{ code: "gross_meets_net_short", params: { gross: 640, net: 520, threshold: 580 } }],
        open_question_ids: ["gross_vs_net", "hours_definition"],
      }),
      month("2026-10", { overall: "missing_data", reasons: [{ code: "missing_month", params: {} }] }),
    ],
    letter: null,
    records: [
      rec("doc-jul", "uber", "2026-07-01", "2026-07-31", 920),
      rec("doc-aug", "lyft", "2026-08-01", "2026-08-31", 640),
      rec("doc-sep", "uber", "2026-09-01", "2026-09-30", 410.5),
    ],
    reconcile: {
      records: [],
      duplicates: [],
      matches: [{ source_doc_id: "doc-jul", txn_ids: ["t-12", "t-13"], amount_diff: 0 }],
      unmatched_deposits: [],
      user_labeled_income: [{ id: "t-77", date: "2026-08-14", amount: 143.2, description: "LYFT PAYOUT" }],
    },
    exemptions: [],
    explanation: [],
    deadlines: [
      { id: "d2", date: "2026-12-01", title_en: "Monthly report due", title_es: "Informe mensual", kind: "monthly_report" },
      { id: "d1", date: "2026-11-15", title_en: "Respond to county letter", title_es: "Responder a la carta del condado", kind: "respond_to_letter" },
    ],
    questions: [],
    needs_navigator: false,
    navigator_reasons: [],
    case_summary: "Fixture",
  });
}
