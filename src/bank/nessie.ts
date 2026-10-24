// Capital One "Nessie" sandbox bank API. https://nessieisreal.com (docs site is a JS app; endpoints below were
// verified live by GET with a dummy key on 2026-10-23: /customers, /accounts/{id}/deposits|purchases|withdrawals
// return JSON arrays; invalid key returns "Invalid API key.").
// TODO-verify (not exercisable without a real key): POST bodies used by scripts/seed_nessie.ts and the exact
// field names on returned records (transaction_date / purchase_date, amount, description).
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { BankTransaction } from "@/lib/schemas";
import type { BankSource } from "./BankSource";

export const NESSIE_BASE = process.env.NESSIE_BASE_URL ?? "https://api.nessieisreal.com";

const Dated = z.object({
  _id: z.string(),
  amount: z.number(),
  description: z.string().nullish(),
  transaction_date: z.string().nullish(),
  purchase_date: z.string().nullish(),
});
type Dated = z.infer<typeof Dated>;

/** fixtures/drivers/<id>/nessie.json written by scripts/seed_nessie.ts. */
export interface NessieSeedInfo {
  customer_id: string;
  account_id: string;
  /** Local ledger txn id -> Nessie object id, so ground truth keyed by local ids still applies. */
  txn_ids: Record<string, string>;
}

export function loadSeedInfo(customerRef: string, fixturesDir = join(process.cwd(), "fixtures", "drivers")): NessieSeedInfo | null {
  const p = join(fixturesDir, customerRef, "nessie.json");
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as NessieSeedInfo) : null;
}

export class NessieBankSource implements BankSource {
  constructor(
    private readonly apiKey: string,
    private readonly base: string = NESSIE_BASE,
    private readonly fixturesDir?: string,
  ) {}

  private async get(path: string): Promise<unknown> {
    const res = await fetch(`${this.base}${path}?key=${encodeURIComponent(this.apiKey)}`, { headers: { Accept: "application/json" } });
    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`Nessie ${path} failed: ${res.status}`);
    const body: unknown = await res.json().catch(() => []);
    return Array.isArray(body) ? body : [];
  }

  /** customerRef = driver_id (resolved through fixtures/.../nessie.json) or a raw Nessie account id. */
  async listTransactions(customerRef: string, from: string, to: string): Promise<BankTransaction[]> {
    const seed = /^[A-Za-z0-9_-]+$/.test(customerRef) ? loadSeedInfo(customerRef, this.fixturesDir) : null;
    const accountId = seed?.account_id ?? customerRef;
    const reverse = new Map(Object.entries(seed?.txn_ids ?? {}).map(([local, nessie]) => [nessie, local]));
    const [deposits, withdrawals, purchases] = await Promise.all([
      this.get(`/accounts/${accountId}/deposits`),
      this.get(`/accounts/${accountId}/withdrawals`),
      this.get(`/accounts/${accountId}/purchases`),
    ]);
    const map = (rows: unknown, sign: 1 | -1): BankTransaction[] =>
      z
        .array(Dated)
        .parse(rows)
        .flatMap((r: Dated) => {
          const date = (r.transaction_date ?? r.purchase_date ?? "").slice(0, 10);
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return [];
          return [{ id: reverse.get(r._id) ?? `nessie-${r._id}`, date, amount: sign * Math.abs(r.amount), description: r.description ?? "" }];
        });
    return [...map(deposits, 1), ...map(withdrawals, -1), ...map(purchases, -1)]
      .filter((t) => t.date >= from && t.date <= to)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
  }
}
