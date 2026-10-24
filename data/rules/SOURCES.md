# Rules sources for `work_rules.json`

Last reviewed: 2026-10-23. Every `{doc, page, quote}` in `work_rules.json` was machine-checked as verbatim (whitespace-normalized) against `text/<doc>.json` page text, with 25 words or fewer per quote (100 quotes, 0 failures). Page numbers are PDF pages, which match the letters' own "Page N" numbering.

## Primary sources

| id | Title | Date | URL |
|---|---|---|---|
| `acwdl-25-30` | ACWDL 25-30, Work and Community Engagement Requirements for New Adult Group | 2025-12-30 | https://www.dhcs.ca.gov/wp-content/uploads/2026/04/25-30.pdf |
| `acwdl-25-31` | ACWDL 25-31, Six-Month Renewals for New Adult Group Requirements | 2025-12-30 | https://www.dhcs.ca.gov/wp-content/uploads/2026/04/25-31.pdf |
| `dhcs-hr1-implementation-plan` | DHCS Implementation Plan for New Federal Eligibility and Enrollment Changes under H.R.1 | 2026-01-29 (cover date; uploaded 2026/05) | https://www.dhcs.ca.gov/wp-content/uploads/2026/05/DHCS-HR1-Implementation-Plan.pdf |

**ACWDL 25-30** (26 pp.) is marked "preliminary guidance and is subject to change." It covers:
- who is subject: aid code M1, ages 19 to 64, regardless of immigration status
- exclusions
- the 15 exemptions plus the short-term hardships, and the order counties check them in (p17)
- qualifying activities: $580 gross income, the 6-month average for fluctuating income, 80 hours of work (including self-employment), work program, community service, half-time school, or a combination
- the application look-back month (p9 and p11 disagree)
- beginning-date-of-aid rules
- 1-month retroactive coverage
- the renewal look-back (any one month since the last determination)
- the 30-day NNC, 2 contact attempts, 10-day notice of action, and 90-day cure period
- moving into and out of the New Adult Group, pregnancy, and intercounty transfers
- the list of topics still waiting on federal guidance (p26)

**ACWDL 25-31** (21 pp.) is also preliminary. It covers:
- the six-month renewal cycle starting 2027-01-01 (p2)
- who is exempt from six-month renewals
- the renewal-date schedule for new applicants (p5)
- the transition schedule for existing members, who switch at their first 2027 renewal (p19)
- changes in circumstance (CIC), which do not trigger a work-requirement assessment
- confirmation that the work requirement is assessed at every six-month renewal (p20)

**Implementation Plan** (38 pp.) gives a summary of qualifying activities (p11), the exemption lists (p11–12), and states that DHCS will adopt the optional short-term hardships and apply them automatically where possible (p12). It also covers:
- UIS members in M1, who are included (p13)
- the data sources DHCS uses or is exploring (p30–32): EDD/IRS wage data and CalSAWS (in use), Equifax Work Number (contracted), and gig economy data such as TRUV (being assessed)
- provider documentation for medical exemptions (p33)
- 1-month retro coverage, and cost sharing starting 2028-10-01

## Secondary sources (context only, never drive compliance logic)

| id | Title | Date | URL | Status |
|---|---|---|---|---|
| `federal-ifr-2026` | CMS Interim Final Rule (CMS-2454-IFC), 91 FR 33348 | 2026-06-03 | https://www.federalregister.gov/documents/2026/06/03/2026-11094/ | Not read directly. Claims come through the CCF explainer. |
| `georgetown-ccf-2026-07-16` | Georgetown CCF, explainer of the IFR | 2026-07-16 | https://ccf.georgetown.edu/2026/07/16/new-federal-medicaid-work-reporting-requirements-rule-threatens-coverage-for-vulnerable-americans-an-explainer-of-the-interim-final-rule/ | Fetched 2026-10-23. Only the first ~100k of 128k characters were read. |

What the CCF explainer adds. These are recorded in `secondary_context` and `open_questions`:
- The application look-back can be 1 to 3 consecutive months, at state option.
- Income is counted under MAGI rules.
- The 6-month average applies to seasonal workers, or the state can use "reasonably predictable changes."
- A state that adopts the short-term hardship option must adopt all 4 hardship events.
- Self-attestation of medical frailty is allowed in 2027 only. Documentation is required starting 2028-01-01.
- A state can get a good-faith delay of up to 6 months at first.
- Hours can be converted from income at the federal minimum wage.
- The CCF page says the IFR was published "June 1, 2026," but the Federal Register document is dated June 3, 2026.

## Not confirmed

- **MEDIL I 26-25** (https://www.dhcs.ca.gov/lo/file/medil-i26-25-pdf/, dated 2026-09-11) exists but could not be downloaded. It may update or replace parts of ACWDL 25-30 and 25-31 to match the IFR. Nothing in `work_rules.json` depends on it.
- **Six-month renewals starting 2027-03-01.** A DHCS changes page reportedly says this. It conflicts with ACWDL 25-31 p2 ("Effective January 1, 2027"), ACWDL 25-31 p19 (existing members switch after their first 2027 renewal), and Implementation Plan p13. None of the three primary sources mention March 1, 2027. The config uses 2027-01-01 and records this as `open_questions.six_month_start_date`. Possible explanation (unverified): a March date could mean the first new-applicant six-month renewal that is actually due, or a later DHCS change. Confirm against MEDIL I 26-25 or the live DHCS page.
- **Whether California chose a 1-month or a 1–3 month look-back** after the IFR. The ACWDLs say 1 month, but they predate the IFR.
- **Gross vs. net for self-employment.** ACWDL 25-30 says "total gross income." The IFR, as summarized by CCF, uses MAGI, which normally counts self-employment income net of expenses. No primary source settles this.
- **How gig hours are counted** (logged-in time vs. active time). No source addresses it.
- **Definitions still pending**: medically frail, work program, community service, standards for self-attestation, and acceptable forms of verification (ACWDL 25-30 p7, p20, p26).
- **Whether Alameda County meets the high-unemployment test.** No unemployment data is in the sources, and the geography is "not yet defined by CMS" (Implementation Plan p12).

## Internal conflicts in the primary sources

1. **Application look-back month.** ACWDL 25-30 p9 says it is the month before the *application* month. p11 says it is the month before the *determination* month.
2. **Using the NNC period to newly comply.** p10 says the NNC is "not intended as additional time." But p11–12 and Step 3 on p19 allow coverage to start the month after someone newly complies while the application is pending.
3. **Exemption vs. hardship.** ACWDL 25-30 lists high unemployment and federal disaster as exemptions. The Implementation Plan p12 calls them short-term hardships that DHCS applies automatically.
4. **School.** ACWDL 25-30 p7 says "part-time or full-time." p10 and Implementation Plan p11 say "at least half-time."
5. **Who can use income averaging.** ACWDL 25-30 p7 says "fluctuating income." Implementation Plan p11 says "Seasonal employment."
6. **Six-month renewal offset.** ACWDL 25-31 p4 says "six months from the first month of eligibility," but the p5 table puts the first renewal 5 months after the application month (January → June). The transition table on p19 uses +6 (January → July).
7. **Timing of exemptions at application.** ACWDL 25-30 p11 says an exemption applies back to the application date. Implementation Plan p10, footnote 10, says DHCS is still seeking CMS guidance on this.
