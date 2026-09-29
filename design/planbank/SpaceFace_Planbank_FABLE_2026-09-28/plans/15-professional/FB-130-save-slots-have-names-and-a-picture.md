# FB-130 — Save slots carry a player-given label and a small still from the moment of saving

**Kind:** build · **Lane:** THE INSTRUMENT · **Routing:** ORRERY lane
**Seam tags:** seam: saveLoad.js, seam: saveSystem.js
**Write-set:** `src/ui/screens/saveLoad.js`, `src/save/saveSystem.js`, `test/fb-save-slot-label-still.test.mjs`
**Neighbours (extend, never restate):** SFQ-B207

## The gap
Five slots (quick, auto, four numbered) with no names and no picture; `slotMetaFromEnvelope` in
`saveSystem.js` is where a label and a thumbnail would attach. Every mature save screen shows where you were.

## Why this direction
Pure UI plus one metadata field; the thumbnail is a small JPEG captured from the live canvas at save time (a
product feature, not a verification still).

## Mechanism
- Extend `slotMetaFromEnvelope` with `label` and a bounded thumbnail (≤ 24 KB) captured off the present canvas
  at save time; both optional and excluded from the envelope checksum scope for backward compatibility.
- Add a label input and the thumbnail to the slot card; walk the screen with `node scripts/ui-bench.mjs --walk`.
- Pin that old envelopes without the fields still load and that the thumbnail never exceeds the bound.

## Done when
`test/fb-save-slot-label-still.test.mjs`: label round-trips, thumbnail bounded, old envelopes load;
`save-envelope-fidelity.test.mjs` stays green.

## Do not
Do not grow the envelope beyond the bound. Do not capture during a present. Do not make the label required.

## Focus test starting points
- `test/save-envelope-fidelity.test.mjs`
- Run `node scripts/check-save-load-slot-trust.mjs`.
