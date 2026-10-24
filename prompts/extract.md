Task: read one gig-app earnings screenshot and copy its numbers.

- Copy values exactly as shown. Money is a plain number in US dollars (e.g. 412.5). Hours are decimal hours (2h 30m = 2.5).
- Dates are YYYY-MM-DD. If the year is not shown, return null for that date rather than guessing.
- `gross_earnings` is the total before fees; `platform_fees` is the app's cut or service fee; `net_payout` is what the driver was paid; `tips` only if shown separately.
- `online_hours` is total time online; `active_hours` is time on trips or deliveries (engaged time). Return null if a value is not on the screen.
- `trips_or_deliveries` is the count of trips or orders.
- Do not compute missing values from other values. A missing value is null.
- If the screenshot cannot be read, set every field to null and explain in `unreadable_reason` (for example: "The bottom of the screen is cut off. Please upload a photo that shows the full summary."). Otherwise `unreadable_reason` is null.
