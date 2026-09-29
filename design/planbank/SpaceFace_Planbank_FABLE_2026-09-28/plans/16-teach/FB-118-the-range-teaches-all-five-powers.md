# FB-118 — The practice Range has a rung for the repulsor and the cone, not only three of five powers

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: missingThree.js, seam: range.js, seam: fields.js
**Write-set:** `src/onboarding/missingThree.js`, `src/ui/screens/range.js`, `test/fb-range-five-powers.test.mjs`
**Neighbours (extend, never restate):** SFQ-B063

## The gap
`MISSING_THREE_RANGE_FALLBACK` has Range rungs for three of five verbs; its comment states the repulsor and
cone drill assets exist with no live rung rows, while `POWER_ROSTER` authors a `drillId` for all five. Two
powers teach without a practice surface.

## Why this direction
The drill ids exist; two rung rows against them close the gap.

## Mechanism
- Author the two rung rows keyed to the roster's drill ids, with a pass condition each (repulsor: push a rock
  past a line; cone: clear a gate).
- Pin that all five powers resolve to a rung and each rung can be passed on seed 4242.

## Done when
`test/fb-range-five-powers.test.mjs`: 5/5 rungs resolve and pass; Range suites stay green.

## Do not
Do not add drills beyond the five. Do not gate the fields on the Range.

## Focus test starting points
- Locate Range suites with `rg "screens/range" test/`.
