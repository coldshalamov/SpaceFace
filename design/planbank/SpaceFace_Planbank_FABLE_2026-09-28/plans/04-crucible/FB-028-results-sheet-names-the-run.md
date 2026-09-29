# FB-028 — The Crucible results sheet prints the stunt rows, the kit balance and the overconfidence streak it already computes

**Kind:** wire · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: crucible.js, seam: survivalResults.js, seam: survivalRecords.js
**Write-set:** `src/ui/screens/crucible.js`, `test/fb-results-sheet-rows.test.mjs`
**Neighbours (extend, never restate):** SFQ-B058, SFQ-I021

## The gap
`survivalResults.js` writes `result.stuntRoundRows` and no UI reads it; `survivalRecords.js` computes
`kitBalanceBoard` and `overconfidenceStreak` and neither is surfaced. The results screen renders
`comboSummary` instead of the named rows. Pure UI, hence the ORRERY lane; the sim half is done.

## Why this direction
The data is there and tested; the sheet omits it. Listed so the lane picks it up with the sim contract named.

## Mechanism
- Render `result.stuntRoundRows` beside `renderBestLineReview` in the story block; one row per round, trick
  names as authored.
- Add the kit-balance board and the overconfidence streak as compact readings on the records column.
- Walk the results screen with `node scripts/ui-bench.mjs --walk` before calling it done.

## Done when
`test/fb-results-sheet-rows.test.mjs`: a seed-4242 result with three stunt rounds renders three rows and the
two readings; `crucible-results.test.mjs` stays green.

## Do not
Do not recompute anything in the UI. Do not add a second results surface.

## Focus test starting points
- `test/crucible-results.test.mjs`
- `test/inf-035-results-feat.test.mjs`
