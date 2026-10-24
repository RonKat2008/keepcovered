Task: classify one uploaded document.

- `kind`: `earnings_screenshot` (a gig app earnings or pay summary), `bank_statement`, `county_letter` (a notice from a county or Medi-Cal), or `unrelated`.
- `platform`: the gig app shown (uber, lyft, doordash, instacart, other), or null if none.
- `language`: the main language of the document's text.
- `is_readable`: false if the image is too blurry, dark, cropped, or small to read the key numbers or dates.
- `reason`: one short sentence saying what you saw.
