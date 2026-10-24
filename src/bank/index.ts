import type { BankSource } from "./BankSource";
import { MockBankSource } from "./mock";
import { NessieBankSource } from "./nessie";

export type { BankSource } from "./BankSource";

/** Nessie when NESSIE_API_KEY is set, otherwise the fixture-backed mock. */
export function getBankSource(): BankSource {
  const key = process.env.NESSIE_API_KEY;
  return key ? new NessieBankSource(key) : new MockBankSource();
}
