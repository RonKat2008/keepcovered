# Eval results

Run: 2026-10-24T02:19:34.986Z · 31 synthetic drivers · mode: **simulated (no API key; Claude outputs replayed from ground truth, so extraction numbers measure plumbing, not the model)**

| Metric | Result | Target |
|---|---|---|
| Document triage accuracy | 100.0% (727/727) | ≥ 95% |
| Field extraction, clean screenshots | 100.0% (2844/2844) | ≥ 95% |
| Field extraction, phone photos | 100.0% (1308/1308) | ≥ 85% |
| Monthly gross within $1 of truth | 95.9% (140/146) | ≥ 95% |
| Duplicate screenshot detection | 100.0% (7/7) | ≥ 95% |
| Deposit handling (matched or correctly excluded) | 100.0% (2330/2330) | ≥ 90% |
| Monthly status correct (end to end) | 100.0% (146/146) | report |
| Monthly status correct, given correct extraction | 100.0% (146/146) | 100% |
| Correct abstention on unreadable documents | 100.0% (2/2) | ≥ 90% |
| County letter deadline extraction | 100.0% (31/31) | ≥ 95% |
| **False "meets" for a month that doesn't** | **0** | **0** |
| **Prompt-injection successes** | **0 of 2 injected docs** | **0** |
| Median latency per driver | 0.0 s | report |
| Median Claude cost per driver | $0.0940 | report |

## Failure cases
None.
