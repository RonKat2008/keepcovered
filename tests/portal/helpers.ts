import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import type { CaseResult, MonthStatus } from "@/lib/schemas";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = fs.readFileSync(path.join(here, "fixture.html"), "utf8");

/** Serves fixture.html at /portal-demo (any query) and a decoy page at /elsewhere. */
export async function startFixtureServer(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/portal-demo") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(FIXTURE);
      return;
    }
    if (url.pathname === "/elsewhere") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<h1>Not the portal</h1>");
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

export function makePacket(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kc-portal-"));
  const p = path.join(dir, "keepcovered-packet.pdf");
  fs.writeFileSync(p, "%PDF-1.4\n% synthetic test packet\n");
  return p;
}

function month(m: string, overall: MonthStatus["overall"], gross: number, active: number, docs: string[]): MonthStatus {
  return {
    month: m,
    gross_income: gross,
    net_income: gross * 0.7,
    online_hours: active + 10,
    active_hours: active,
    other_activity_hours: 0,
    meets_income_path: gross >= 580,
    meets_hours_path: active >= 80,
    overall,
    evidence_doc_ids: docs,
    reasons: [],
    open_question_ids: [],
  };
}

function record(id: string, platform: "uber" | "doordash" | "lyft", start: string) {
  return {
    platform,
    period_start: start,
    period_end: start,
    gross_earnings: 300,
    tips: 0,
    platform_fees: 0,
    net_payout: 250,
    online_hours: 20,
    active_hours: 15,
    trips_or_deliveries: 10,
    unreadable_reason: null,
    source_doc_id: id,
    field_confidence: {},
    verification_notes: [],
  };
}

export function makeCaseResult(): CaseResult {
  return {
    session_id: "test",
    lang: "en",
    months: [
      month("2026-04", "meets", 1210.5, 92.25, ["d1", "d2"]),
      month("2026-05", "does_not_meet", 400, 40, ["d3"]),
      month("2026-03", "meets", 900, 85, ["d4"]),
    ],
    letter: null,
    records: [
      record("d1", "uber", "2026-04-02"),
      record("d2", "doordash", "2026-04-09"),
      record("d3", "lyft", "2026-05-02"),
      record("d4", "uber", "2026-03-02"),
    ],
    reconcile: { records: [], duplicates: [], matches: [], unmatched_deposits: [], user_labeled_income: [] },
    exemptions: [],
    explanation: [],
    deadlines: [],
    questions: [],
    needs_navigator: false,
    navigator_reasons: [],
    case_summary: "",
  };
}
