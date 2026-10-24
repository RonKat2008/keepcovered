Task: read one county or Medi-Cal letter and copy its key details.

- `letter_type`: work_rule_notice, renewal, verification_request, termination_notice, or other.
- `notice_date`: the date printed on the letter. `response_deadline`: the date by which the person must respond or send proof. Both YYYY-MM-DD, null if not printed. Never calculate a deadline from other dates.
- `requested_items`: short phrases for each thing the letter asks for, in the letter's own words.
- `months_requested`: each month the letter asks about, as YYYY-MM.
- `language`: the letter's main language. `county_name`: the county that sent it, or null.
- If the letter cannot be read, explain in `unreadable_reason`; otherwise null.
