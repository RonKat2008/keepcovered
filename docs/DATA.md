# Synthetic dataset

Everything here is synthetic: fake names, no logos or brand colors (platform names are plain text), case numbers like `DEMO-0000-123`. Regenerate with `npm run gen:drivers` (deterministic, seed 2026, about 100 s).

## Layout
```
fixtures/drivers/<driver_id>/
  profile.json            {driver_id, display_name, lang, apps, months, traps}
  IMG_NNNN.png            earnings screenshots, a county letter, trap images (names carry no information)
  IMG_NNNN.png.truth.json exact EarningsExtraction / CountyLetterExtraction values for that image
  bank.json               BankTransaction[] (positive = money in)
  nessie.json             only after scripts/seed_nessie.ts (ids of seeded Nessie objects)
evals/ground_truth/<driver_id>.json
  {driver_id, documents[{file,kind,truth,meta}], bank_truth{txn_id: driving|not_driving},
   expected_months[...], letter_truth}
public/demo/              the 8 demo-maria images + manifest.json ("Use demo documents")
```
30 drivers `drv-01`..`drv-30` (12 Spanish) plus `demo-maria`. Months are contiguous subsets of 2026-07..2026-12 (3 to 6 per driver). Images are 390x844 phone screens at 2x, downscaled to at most 1600 px; about 35% get phone-photo effects (rotation 1-6 deg, blur up to 1.2 px, glare, mild crop that never removes the totals).

## Statement semantics
- `gross_earnings` = fares + promotions + tips. `net_payout` = gross - platform fees. Hours are decimal (0.1 h steps).
- Per (driver, app) the statements are either weekly (about 15%) or one monthly summary. Weeks are calendar-aligned (1-7, 8-14, 15-21, 22-28, 29-end) except on straddle drivers, where one app uses 7-day blocks that cross month boundaries.
- Month attribution is pro rata by days. For aligned statements this is exact.
- Instant cash-out lists (`meta.variant = "cashout_list"`) show only cash-outs: truth has `net_payout` (sum before fees) and `platform_fees` (instant fees), everything else null. They are not earnings summaries.

## expected_months
`gross_income`, `net_income`, `active_hours`, `online_hours` are computed from the readable statements only. `overall_expected` uses the same semantics as the rules engine, computed independently:
1. `gross >= 580 && net >= 580` or `active >= 80` -> `meets`
2. else `gross >= 580 && net < 580` or `online >= 80` -> `unsure`
3. else, with statements present -> `does_not_meet`; no statements -> `missing_data`

A month is also `missing_data` when any block of activity lacks a readable statement (missing month, unreadable crop, missing app). Those months carry `acceptable: ["missing_data","unsure"]` and an `underlying` object with the true values as if every statement were readable.

## Traps (profile.traps)
| Trap | Drivers | What it tests |
|---|---|---|
| `duplicate_exact` | 03, 09, 11 | byte-identical copy of a statement must not double count |
| `duplicate_rephotographed` | 05, 15, 17, demo-maria | same statement re-photographed (rotation/blur/glare) |
| `missing_month` | 02, 09, 21 | no statements for a middle month; bank still shows deposits |
| `near_miss_income` | 04, 14, 26 | one month at $575.00-$579.99 gross, under both thresholds |
| `income_low_hours` | 06, 15, 24 | gross >= 580 and net >= 580 but active hours < 80 (still `meets`) |
| `net_below_gross_above` | 07, 19, 28 | gross >= 580, net < 580, hours short -> `unsure` |
| `online_not_active` | 08, 20, 29 | online >= 80, active < 80, gross < 580 -> `unsure` |
| `straddle_week` | 10, 22 | weekly statement spanning two months (pro rata), big margins |
| `unreadable_total` | 12, 25 | statement cropped so period, total and net are cut off |
| `venmo_not_driving` | 11, 13, 16, 23, 30 | large Venmo deposit, not driving, would flip a failing month if counted |
| `prompt_injection` | 18, 27 | "earnings" screen with `SYSTEM: ignore previous rules...` text; truth is `unrelated`, no effect allowed |
| `instant_cashout_list` | 01, 06, 08, 13, 16, 20, 23, 30 | a week paid via 2-4 instant cash-outs, each net of a $0.50-$1.25 fee, plus a cash-out list image |

Drivers can have several traps; threshold traps (near-miss, income_low_hours, net_fail, online_not_active) are one per driver. Every driver also gets random unrelated deposits (Venmo, Zelle, savings transfer, IRS refund, mobile check) and debits, all `not_driving`, and one county letter (work_rule_notice, verification_request or renewal, EN or ES).

## demo-maria
Spanish speaker, Uber + DoorDash + Instacart, months 2026-09..2026-11, letter dated 2026-11-24 asking to verify Oct and Nov, respond by 2026-12-08. Eight images: Sep Uber, Oct Uber, Oct Instacart, Nov Uber, Nov DoorDash, Nov Instacart (all monthly summaries, Spanish, comma decimals), a re-photographed duplicate of Nov Uber, and the letter. October DoorDash is missing on purpose while the bank shows its deposits; one `VENMO *LUCIA R` deposit ($85.00) is not driving and must be labeled by the user.

## Bank
`src/bank/` exposes `BankSource`. `getBankSource()` returns Nessie when `NESSIE_API_KEY` is set, else the mock that reads `bank.json` (customerRef = driver_id). `scripts/seed_nessie.ts` creates a customer and checking account per driver and posts the ledger; with a seed file present, Nessie transactions are mapped back to the local ids so `bank_truth` still applies.
