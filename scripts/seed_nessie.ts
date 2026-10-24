// Seeds Capital One Nessie with one customer + checking account per synthetic driver, then posts each ledger entry.
// Only runs when NESSIE_API_KEY is set. Writes fixtures/drivers/<id>/nessie.json. Idempotent: skips drivers that
// already have nessie.json. Run: NESSIE_API_KEY=... npx tsx scripts/seed_nessie.ts [driver-id ...]
// TODO-verify: request bodies below follow Nessie's public docs from memory; the GET side was verified live.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NESSIE_BASE, type NessieSeedInfo } from "../src/bank/nessie";

const KEY = process.env.NESSIE_API_KEY;
const FIXTURES = join(process.cwd(), "fixtures", "drivers");

interface Txn {
  id: string;
  date: string;
  amount: number;
  description: string;
}

async function post(path: string, body: unknown): Promise<{ _id: string }> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(`${NESSIE_BASE}${path}?key=${encodeURIComponent(KEY as string)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const json = (await res.json()) as { objectCreated?: { _id: string } };
      if (!json.objectCreated?._id) throw new Error(`Nessie ${path}: no objectCreated in response`);
      return json.objectCreated;
    }
    if (attempt === 3) throw new Error(`Nessie POST ${path} failed: ${res.status} ${await res.text()}`);
    await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  throw new Error("unreachable");
}

async function seedDriver(id: string): Promise<void> {
  const dir = join(FIXTURES, id);
  if (existsSync(join(dir, "nessie.json"))) {
    console.log(`${id}: already seeded, skipping`);
    return;
  }
  const profile = JSON.parse(readFileSync(join(dir, "profile.json"), "utf8")) as { display_name: string };
  const txns = JSON.parse(readFileSync(join(dir, "bank.json"), "utf8")) as Txn[];
  const [first, ...rest] = profile.display_name.split(" ");
  const customer = await post("/customers", {
    first_name: first,
    last_name: rest.join(" ") || "Demo",
    address: { street_number: "123", street_name: "Demo Street", city: "Oakland", state: "CA", zip: "00000" },
  });
  const account = await post(`/customers/${customer._id}/accounts`, { type: "Checking", nickname: `DEMO ${id}`, rewards: 0, balance: 0 });
  const ids: Record<string, string> = {};
  for (const t of txns) {
    const body = { medium: "balance", transaction_date: t.date, amount: Math.abs(t.amount), description: t.description };
    const created = await post(`/accounts/${account._id}/${t.amount >= 0 ? "deposits" : "withdrawals"}`, body);
    ids[t.id] = created._id;
  }
  const info: NessieSeedInfo = { customer_id: customer._id, account_id: account._id, txn_ids: ids };
  writeFileSync(join(dir, "nessie.json"), JSON.stringify(info, null, 2));
  console.log(`${id}: seeded ${txns.length} transactions`);
}

async function main(): Promise<void> {
  if (!KEY) {
    console.log("NESSIE_API_KEY not set; nothing to do (the app uses the mock bank source).");
    return;
  }
  const requested = process.argv.slice(2);
  const ids = requested.length ? requested : readdirSync(FIXTURES).filter((d) => existsSync(join(FIXTURES, d, "bank.json"))).sort();
  for (const id of ids) await seedDriver(id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
