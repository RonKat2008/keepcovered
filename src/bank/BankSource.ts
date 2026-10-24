import type { BankTransaction } from "@/lib/schemas";

export interface BankSource {
  /** Transactions for a customer between two ISO dates (inclusive). Positive amount = money in. */
  listTransactions(customerRef: string, from: string, to: string): Promise<BankTransaction[]>;
}
