import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { BankTransaction } from "@/lib/schemas";
import type { BankSource } from "./BankSource";

const Ledger = z.array(BankTransaction);

/** Reads fixtures/drivers/<driver_id>/bank.json. customerRef = driver_id. */
export class MockBankSource implements BankSource {
  constructor(private readonly fixturesDir: string = process.env.FIXTURES_DIR ?? join(process.cwd(), "fixtures", "drivers")) {}

  async listTransactions(customerRef: string, from: string, to: string): Promise<BankTransaction[]> {
    if (!/^[A-Za-z0-9_-]+$/.test(customerRef)) throw new Error("invalid customerRef");
    const raw = await readFile(join(this.fixturesDir, customerRef, "bank.json"), "utf8");
    return Ledger.parse(JSON.parse(raw))
      .filter((t) => t.date >= from && t.date <= to)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id.localeCompare(b.id)));
  }
}
