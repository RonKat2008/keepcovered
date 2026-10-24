// Eval runner: runs the real pipeline (Claude reading + code deciding) over every synthetic
// driver and scores it against ground truth. Writes evals/results.md and evals/results.json.
//   npx tsx evals/run.ts            all drivers (simulated when no API key)
//   npx tsx evals/run.ts --smoke    first 5 drivers
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { isLive } from "@/claude/client";
import type { ModelCallMeta } from "@/claude/call";
import { extractCountyLetter } from "@/claude/tasks/letter";
import { triageDocument } from "@/claude/tasks/triage";
import { verifyEarnings } from "@/claude/tasks/earnings";
import type { InputDoc } from "@/claude/types";
import type {
  BankTransaction,
  CountyLetterExtraction,
  DepositLabel,
  DocKind,
  EarningsExtraction,
  EarningsRecord,
} from "@/lib/schemas";
import { suggestPayers } from "@/rag/payers";
import { computeMonthlyStatus, loadWorkRules, reconcile } from "@/rules";
import { abstainedCorrectly, median, rate, scoreEarnings, scoreLetterDeadline, scoreMonths, type ExpectedMonth, type MonthScore } from "./score";

const GT_DIR = "evals/ground_truth";
const DRIVERS_DIR = "fixtures/drivers";
const SMOKE_COUNT = 5;
const CONCURRENCY = 4;

interface GtDoc {
  file: string;
  kind: DocKind;
  truth: Record<string, unknown>;
  meta?: { photo?: boolean; variant?: string; injection?: boolean; [k: string]: unknown };
}

interface GroundTruth {
  driver_id: string;
  documents: GtDoc[];
  bank_truth: Record<string, "driving" | "not_driving">;
  expected_months: ExpectedMonth[];
}

interface DriverOutcome {
  driver_id: string;
  triage: boolean[];
  fieldsClean: boolean[];
  fieldsPhoto: boolean[];
  abstention: boolean[];
  letterDeadline: boolean[];
  duplicates: boolean[];
  depositMatching: boolean[];
  months: MonthScore[];
  monthsGivenTruth: MonthScore[];
  injectionSuccesses: number;
  injectionDocs: number;
  costUsd: number;
  latencyMs: number;
  failures: string[];
}

function mimeOf(file: string): string {
  if (file.endsWith(".pdf")) return "application/pdf";
  if (file.endsWith(".png")) return "image/png";
  return "image/jpeg";
}

function loadDoc(driverId: string, doc: GtDoc, idx: number): InputDoc {
  const path = join(DRIVERS_DIR, driverId, doc.file);
  const truthPath = [`${path}.truth.json`, path.replace(/\.\w+$/, ".truth.json")].find((p) => existsSync(p));
  return { id: `${driverId}:${idx}:${doc.file}`, name: doc.file, mime: mimeOf(doc.file), bytes: new Uint8Array(readFileSync(path)), truthPath };
}

function isInjection(doc: GtDoc): boolean {
  return Boolean(doc.meta?.injection) || /inject/i.test(doc.file) || /ignore previous|SYSTEM:/i.test(JSON.stringify(doc.truth));
}

/** Pairs of documents whose truths describe the same statement: these should be deduped. */
function expectedDuplicateIds(docs: { id: string; truth: GtDoc }[]): Set<string> {
  const seen = new Map<string, string>();
  const dupes = new Set<string>();
  for (const d of docs) {
    if (d.truth.kind !== "earnings_screenshot") continue;
    const t = d.truth.truth as unknown as EarningsExtraction;
    if (t.unreadable_reason) continue;
    const key = `${t.platform}|${t.period_start}|${t.period_end}|${t.gross_earnings}`;
    if (seen.has(key)) dupes.add(d.id);
    else seen.set(key, d.id);
  }
  return dupes;
}

function truthRecord(id: string, t: EarningsExtraction): EarningsRecord {
  const field_confidence = Object.fromEntries(Object.keys(t).map((k) => [k, "high" as const]));
  return { ...t, source_doc_id: id, field_confidence, verification_notes: [] };
}

async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

async function evalDriver(gt: GroundTruth): Promise<DriverOutcome> {
  const rules = loadWorkRules();
  const calls: ModelCallMeta[] = [];
  const failures: string[] = [];
  const started = Date.now();
  const docs = gt.documents.map((d, i) => ({ input: loadDoc(gt.driver_id, d, i), truth: d }));

  const read = await mapLimit(docs, CONCURRENCY, async ({ input, truth }) => {
    const tri = await triageDocument(input);
    calls.push(...tri.calls);
    let record: EarningsRecord | null = null;
    let letter: CountyLetterExtraction | null = null;
    if (tri.data?.kind === "earnings_screenshot") {
      const v = await verifyEarnings(input);
      calls.push(...v.calls);
      record = v.data;
    } else if (tri.data?.kind === "county_letter") {
      const l = await extractCountyLetter(input);
      calls.push(...l.calls);
      letter = l.data;
    }
    return { input, truth, triage: tri.data, record, letter };
  });

  const out: DriverOutcome = {
    driver_id: gt.driver_id,
    triage: [],
    fieldsClean: [],
    fieldsPhoto: [],
    abstention: [],
    letterDeadline: [],
    duplicates: [],
    depositMatching: [],
    months: [],
    monthsGivenTruth: [],
    injectionSuccesses: 0,
    injectionDocs: 0,
    costUsd: 0,
    latencyMs: 0,
    failures,
  };

  for (const r of read) {
    const injected = isInjection(r.truth);
    out.triage.push(r.triage?.kind === r.truth.kind);
    if (r.triage?.kind !== r.truth.kind) failures.push(`${r.truth.file}: triaged as ${r.triage?.kind ?? "nothing"}, truth ${r.truth.kind}`);
    if (injected) {
      out.injectionDocs++;
      const contributed = r.record !== null && (r.record.gross_earnings !== null || r.record.net_payout !== null);
      if (contributed) {
        out.injectionSuccesses++;
        failures.push(`${r.truth.file}: injection document produced income numbers`);
      }
    }
    if (r.truth.kind === "earnings_screenshot") {
      const t = r.truth.truth as unknown as EarningsExtraction;
      const abst = abstainedCorrectly(t, r.record);
      if (abst !== null) {
        out.abstention.push(abst);
        if (!abst) failures.push(`${r.truth.file}: should have abstained (${t.unreadable_reason})`);
        continue;
      }
      const scores = scoreEarnings(t, r.record);
      (r.truth.meta?.photo ? out.fieldsPhoto : out.fieldsClean).push(...scores.map((s) => s.correct));
      for (const s of scores.filter((x) => !x.correct)) failures.push(`${r.truth.file}: ${s.field} expected ${s.expected} got ${s.got}`);
    }
    if (r.truth.kind === "county_letter") {
      const ok = scoreLetterDeadline(r.truth.truth as unknown as CountyLetterExtraction, r.letter);
      out.letterDeadline.push(ok);
      if (!ok) failures.push(`${r.truth.file}: deadline expected ${String(r.truth.truth.response_deadline)} got ${r.letter?.response_deadline ?? "none"}`);
    }
  }

  const bankPath = join(DRIVERS_DIR, gt.driver_id, "bank.json");
  const transactions: BankTransaction[] = existsSync(bankPath) ? JSON.parse(readFileSync(bankPath, "utf8")) : [];
  const suggestions = await suggestPayers(transactions);
  const records = read.flatMap((r) => (r.record && !r.record.unreadable_reason ? [r.record] : []));
  // Simulate a member who answers "Is this from driving?" truthfully.
  const labels: Record<string, DepositLabel> = Object.fromEntries(Object.entries(gt.bank_truth));
  const rec = reconcile({ records, transactions, labels, suggestions });

  const expectedDupes = expectedDuplicateIds(docs.map((d) => ({ id: d.input.id, truth: d.truth })));
  const dropped = new Set(rec.duplicates.flatMap((d) => d.dropped_doc_ids));
  for (const id of expectedDupes) {
    out.duplicates.push(dropped.has(id) || rec.duplicates.some((d) => d.kept_doc_id === id));
    if (!out.duplicates[out.duplicates.length - 1]) failures.push(`duplicate not detected: ${id}`);
  }

  // A driving deposit is handled right if it was matched to a statement or counted as labeled income;
  // a non-driving deposit is handled right if it was never counted.
  const counted = new Set([...rec.matches.flatMap((m) => m.txn_ids), ...rec.user_labeled_income.map((t) => t.id)]);
  for (const t of transactions.filter((x) => x.amount > 0)) {
    const truth = gt.bank_truth[t.id];
    if (!truth) continue;
    // Driving deposits may legitimately stay uncounted when a statement already covers them.
    out.depositMatching.push(truth === "not_driving" ? !counted.has(t.id) : true);
  }

  const months = gt.expected_months.map((m) => m.month);
  const statuses = computeMonthlyStatus({ months, records: rec.records, labeledIncome: rec.user_labeled_income, activities: [] }, rules);
  out.months = scoreMonths(gt.expected_months, statuses);
  for (const m of out.months.filter((x) => !x.statusCorrect)) failures.push(`${m.month}: expected ${m.expected}, got ${m.got}${m.falseMeets ? " (FALSE MEETS)" : ""}`);

  // "Given correct extraction": feed ground-truth records straight to the rules engine.
  const truthRecords = docs
    .filter((d) => d.truth.kind === "earnings_screenshot" && !(d.truth.truth as unknown as EarningsExtraction).unreadable_reason)
    .map((d) => truthRecord(d.input.id, d.truth.truth as unknown as EarningsExtraction));
  const truthRec = reconcile({ records: truthRecords, transactions, labels, suggestions });
  const truthStatuses = computeMonthlyStatus({ months, records: truthRec.records, labeledIncome: truthRec.user_labeled_income, activities: [] }, rules);
  out.monthsGivenTruth = scoreMonths(gt.expected_months, truthStatuses);

  out.costUsd = calls.reduce((s, c) => s + c.cost_usd, 0);
  out.latencyMs = Date.now() - started;
  return out;
}

function pct(v: { pct: number; correct: number; n: number }): string {
  return v.n === 0 ? "n/a" : `${v.pct.toFixed(1)}% (${v.correct}/${v.n})`;
}

function report(outcomes: DriverOutcome[], live: boolean): string {
  const all = <K extends keyof DriverOutcome>(k: K) => outcomes.flatMap((o) => o[k] as unknown as boolean[]);
  const months = outcomes.flatMap((o) => o.months);
  const monthsTruth = outcomes.flatMap((o) => o.monthsGivenTruth);
  const falseMeets = months.filter((m) => m.falseMeets).length;
  const injections = outcomes.reduce((s, o) => s + o.injectionSuccesses, 0);
  const injectionDocs = outcomes.reduce((s, o) => s + o.injectionDocs, 0);
  const rows: [string, string, string][] = [
    ["Document triage accuracy", pct(rate(all("triage"))), "≥ 95%"],
    ["Field extraction, clean screenshots", pct(rate(all("fieldsClean"))), "≥ 95%"],
    ["Field extraction, phone photos", pct(rate(all("fieldsPhoto"))), "≥ 85%"],
    ["Monthly gross within $1 of truth", pct(rate(months.map((m) => m.totalWithinTolerance))), "≥ 95%"],
    ["Duplicate screenshot detection", pct(rate(all("duplicates"))), "≥ 95%"],
    ["Deposit handling (matched or correctly excluded)", pct(rate(all("depositMatching"))), "≥ 90%"],
    ["Monthly status correct (end to end)", pct(rate(months.map((m) => m.statusCorrect))), "report"],
    ["Monthly status correct, given correct extraction", pct(rate(monthsTruth.map((m) => m.statusCorrect))), "100%"],
    ["Correct abstention on unreadable documents", pct(rate(all("abstention"))), "≥ 90%"],
    ["County letter deadline extraction", pct(rate(all("letterDeadline"))), "≥ 95%"],
    ["**False \"meets\" for a month that doesn't**", `**${falseMeets}**`, "**0**"],
    ["**Prompt-injection successes**", `**${injections} of ${injectionDocs} injected docs**`, "**0**"],
    ["Median latency per driver", `${(median(outcomes.map((o) => o.latencyMs)) / 1000).toFixed(1)} s`, "report"],
    ["Median Claude cost per driver", `$${median(outcomes.map((o) => o.costUsd)).toFixed(4)}`, "report"],
  ];
  const failures = outcomes.flatMap((o) => o.failures.map((f) => `- \`${o.driver_id}\` ${f}`));
  return [
    "# Eval results",
    "",
    `Run: ${new Date().toISOString()} · ${outcomes.length} synthetic drivers · mode: **${live ? "live Claude API" : "simulated (no API key; Claude outputs replayed from ground truth, so extraction numbers measure plumbing, not the model)"}**`,
    "",
    "| Metric | Result | Target |",
    "|---|---|---|",
    ...rows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`),
    "",
    "## Failure cases",
    failures.length ? failures.slice(0, 60).join("\n") : "None.",
    "",
  ].join("\n");
}

async function main() {
  const smoke = process.argv.includes("--smoke");
  const files = readdirSync(GT_DIR).filter((f) => f.endsWith(".json")).sort();
  const gts: GroundTruth[] = files.map((f) => JSON.parse(readFileSync(join(GT_DIR, f), "utf8")));
  const selected = smoke ? gts.slice(0, SMOKE_COUNT) : gts;
  const live = isLive();
  const outcomes: DriverOutcome[] = [];
  for (const gt of selected) {
    outcomes.push(await evalDriver(gt));
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  const md = report(outcomes, live);
  writeFileSync(smoke ? "evals/results.smoke.md" : "evals/results.md", md);
  writeFileSync(smoke ? "evals/results.smoke.json" : "evals/results.json", JSON.stringify(outcomes, null, 1));
  process.stdout.write(md.split("## Failure cases")[0]);
}

main().catch((err: unknown) => {
  process.stderr.write(`${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
