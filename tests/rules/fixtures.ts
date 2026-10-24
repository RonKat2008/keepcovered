import type { BankTransaction, EarningsRecord, OtherActivity } from "@/lib/schemas";

export function rec(over: Partial<EarningsRecord> & { source_doc_id: string }): EarningsRecord {
  return {
    platform: "uber",
    period_start: "2027-03-01",
    period_end: "2027-03-31",
    gross_earnings: 0,
    tips: null,
    platform_fees: null,
    net_payout: 0,
    online_hours: null,
    active_hours: null,
    trips_or_deliveries: null,
    unreadable_reason: null,
    field_confidence: {},
    verification_notes: [],
    ...over,
  };
}

export const txn = (id: string, date: string, amount: number, description: string): BankTransaction => ({ id, date, amount, description });
export const act = (month: string, kind: OtherActivity["kind"], hours: number): OtherActivity => ({ month, kind, hours });
export const empty = { records: [], labeledIncome: [], activities: [] };
