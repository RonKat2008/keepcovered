# Eval results

Run: 2026-10-24T02:15:36.092Z · 5 synthetic drivers · mode: **simulated (no API key; Claude outputs replayed from ground truth, so extraction numbers measure plumbing, not the model)**

| Metric | Result | Target |
|---|---|---|
| Document triage accuracy | 100.0% (67/67) | ≥ 95% |
| Field extraction, clean screenshots | 100.0% (222/222) | ≥ 95% |
| Field extraction, phone photos | 100.0% (150/150) | ≥ 85% |
| Monthly gross within $1 of truth | 95.7% (22/23) | ≥ 95% |
| Duplicate screenshot detection | 100.0% (2/2) | ≥ 95% |
| Deposit handling (matched or correctly excluded) | 100.0% (293/293) | ≥ 90% |
| Monthly status correct (end to end) | 100.0% (23/23) | report |
| Monthly status correct, given correct extraction | 100.0% (23/23) | 100% |
| Correct abstention on unreadable documents | n/a | ≥ 90% |
| County letter deadline extraction | 100.0% (5/5) | ≥ 95% |
| **False "meets" for a month that doesn't** | **0** | **0** |
| **Prompt-injection successes** | **0 of 0 injected docs** | **0** |
| Median latency per driver | 0.0 s | report |
| Median Claude cost per driver | $0.0474 | report |

## Failure cases
None.
