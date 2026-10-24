// Generates 30 synthetic drivers + the hand-crafted demo driver: fixtures, screenshots, bank ledgers, ground truth.
// Deterministic: same seed -> same output. Run: npx tsx scripts/generate_drivers.ts
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { BankTransaction, CountyLetterExtraction, EarningsExtraction, Lang, MonthKey, Platform } from "../src/lib/schemas";
import { Rng, hashSeed } from "./lib/util";
import { Renderer } from "./render/render";
import { buildDriver, type DriverBuild } from "./gen/driver";
import { planDriver, planMaria, driverId, SEED } from "./gen/plan";

const ROOT = process.cwd();
const FIXTURES = join(ROOT, "fixtures", "drivers");
const GROUND_TRUTH = join(ROOT, "evals", "ground_truth");
const DEMO_PUBLIC = join(ROOT, "public", "demo");
const N_DRIVERS = 30;

const ProfileSchema = z.object({
  driver_id: z.string(),
  display_name: z.string(),
  lang: Lang,
  apps: z.array(Platform),
  months: z.array(MonthKey).min(3).max(6),
  traps: z.array(z.string()),
});

const GroundTruthSchema = z.object({
  driver_id: z.string(),
  documents: z.array(
    z.object({
      file: z.string(),
      kind: z.enum(["earnings_screenshot", "bank_statement", "county_letter", "unrelated"]),
      truth: z.record(z.string(), z.unknown()),
      meta: z.record(z.string(), z.unknown()),
    }),
  ),
  bank_truth: z.record(z.string(), z.enum(["driving", "not_driving"])),
  expected_months: z.array(
    z.object({
      month: MonthKey,
      gross_income: z.number(),
      net_income: z.number(),
      active_hours: z.number(),
      online_hours: z.number(),
      overall_expected: z.enum(["meets", "does_not_meet", "unsure", "missing_data"]),
    }).passthrough(),
  ),
  letter_truth: CountyLetterExtraction,
});

function cleanDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
  for (const f of readdirSync(dir)) if (f !== "nessie.json") rmSync(join(dir, f), { recursive: true, force: true });
}

function profileOf(b: DriverBuild) {
  const s = b.spec;
  return { driver_id: s.id, display_name: s.name, lang: s.lang, apps: s.apps, months: s.months, traps: s.traps };
}

function groundTruthOf(b: DriverBuild) {
  return {
    driver_id: b.spec.id,
    documents: b.docs.map((d) => ({ file: d.file, kind: d.kind, truth: d.truth, meta: d.meta })),
    bank_truth: b.bankTruth,
    expected_months: b.expected,
    letter_truth: b.letterTruth,
    ...(b.spec.notes ? { notes: b.spec.notes } : {}),
  };
}

function validate(b: DriverBuild): void {
  const id = b.spec.id;
  ProfileSchema.parse(profileOf(b));
  z.array(BankTransaction).parse(b.txns);
  GroundTruthSchema.parse(groundTruthOf(b));
  for (const d of b.docs) {
    if (d.kind === "earnings_screenshot") EarningsExtraction.parse(d.truth);
    else if (d.kind === "county_letter") CountyLetterExtraction.parse(d.truth);
  }
  for (const t of b.txns) if (!(t.id in b.bankTruth)) throw new Error(`${id}: txn ${t.id} missing bank truth`);
}

/** Re-reads everything written to disk and validates it again. */
function validateDisk(ids: string[]): number {
  let n = 0;
  for (const id of ids) {
    const dir = join(FIXTURES, id);
    const gt = GroundTruthSchema.parse(JSON.parse(readFileSync(join(GROUND_TRUTH, `${id}.json`), "utf8")));
    ProfileSchema.parse(JSON.parse(readFileSync(join(dir, "profile.json"), "utf8")));
    z.array(BankTransaction).parse(JSON.parse(readFileSync(join(dir, "bank.json"), "utf8")));
    for (const d of gt.documents) {
      if (!existsSync(join(dir, d.file))) throw new Error(`${id}: missing image ${d.file}`);
      const side = JSON.parse(readFileSync(join(dir, `${d.file}.truth.json`), "utf8"));
      if (d.kind === "earnings_screenshot") EarningsExtraction.parse(side);
      if (d.kind === "county_letter") CountyLetterExtraction.parse(side);
      n++;
    }
  }
  return n;
}

async function main(): Promise<void> {
  const builds: DriverBuild[] = [];
  const specs = [...Array.from({ length: N_DRIVERS }, (_, i) => planDriver(i + 1)), planMaria()];
  for (const spec of specs) {
    const rng = new Rng(hashSeed(`kc-build-${SEED}-${spec.id}`));
    const b = buildDriver(spec, rng, join(FIXTURES, spec.id));
    validate(b);
    builds.push(b);
  }

  mkdirSync(GROUND_TRUTH, { recursive: true });
  for (const f of readdirSync(GROUND_TRUTH)) if (f.endsWith(".json")) rmSync(join(GROUND_TRUTH, f));
  for (const b of builds) cleanDir(join(FIXTURES, b.spec.id));

  const renderer = new Renderer();
  await renderer.open(390, 844);
  let images = 0;
  for (const b of builds) {
    const dir = join(FIXTURES, b.spec.id);
    for (const d of b.docs) {
      if (d.job) await renderer.render(d.job);
      else copyFileSync(join(dir, d.copyOf as string), join(dir, d.file));
      writeFileSync(join(dir, `${d.file}.truth.json`), JSON.stringify(d.truth, null, 2));
      images++;
    }
    writeFileSync(join(dir, "profile.json"), JSON.stringify(profileOf(b), null, 2));
    writeFileSync(join(dir, "bank.json"), JSON.stringify(b.txns, null, 2));
    writeFileSync(join(GROUND_TRUTH, `${b.spec.id}.json`), JSON.stringify(groundTruthOf(b), null, 2));
  }
  await renderer.close();

  // Demo documents for the UI's "Use demo documents".
  const maria = builds.find((b) => b.spec.id === "demo-maria") as DriverBuild;
  rmSync(DEMO_PUBLIC, { recursive: true, force: true });
  mkdirSync(DEMO_PUBLIC, { recursive: true });
  for (const d of maria.docs) copyFileSync(join(FIXTURES, "demo-maria", d.file), join(DEMO_PUBLIC, d.file));
  writeFileSync(
    join(DEMO_PUBLIC, "manifest.json"),
    JSON.stringify({ driver_id: "demo-maria", lang: "es", files: maria.docs.map((d) => d.file) }, null, 2),
  );

  const checked = validateDisk(builds.map((b) => b.spec.id));

  const trapCount: Record<string, number> = {};
  for (const b of builds) for (const t of b.spec.traps) trapCount[t] = (trapCount[t] ?? 0) + 1;
  const overall: Record<string, number> = {};
  for (const b of builds) for (const m of b.expected) overall[m.overall_expected] = (overall[m.overall_expected] ?? 0) + 1;
  console.log(`drivers: ${builds.length}, images: ${images}, truth files validated: ${checked}`);
  console.log("traps:", trapCount);
  console.log("expected overall (driver-months):", overall);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
