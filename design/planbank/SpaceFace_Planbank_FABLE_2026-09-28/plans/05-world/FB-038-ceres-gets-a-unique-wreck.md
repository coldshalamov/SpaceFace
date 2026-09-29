# FB-038 — The one sector with a full working rhythm gets its own unique wreck

**Kind:** build · **Lane:** THE WORLD · **Routing:** open
**Seam tags:** seam: uniqueWrecks.js, seam: uniqueWreckEncounterScripts.js
**Write-set:** `src/data/uniqueWrecks.js`, `src/systems/uniqueWreckEncounterScripts.js`, `test/fb-ceres-unique-wreck.test.mjs`
**Neighbours (extend, never restate):** SFQ-B110, SF-167

## The gap
Sixteen unique wrecks cover thirteen sectors; Ceres, the sector with four activity pockets and the Wreck
Cathedral, has none. The rumour→fix→decision→salvage loop is the best-wired discovery loop in the tree and
skips the busiest place.

## Why this direction
New wreck hulls were rejected (graphics lane). A D17 composed from the existing wreck families and the
Cathedral's evidence catalogue reuses every phase the loop already has; the decision is what makes it a wreck,
not the model.

## Mechanism
- Author `D17` in `UNIQUE_WRECKS`: a refinery tender lost in the working seam, rumour keyed to Ceres dock
  contacts, fix by two bearings inside the seam, decision between returning the tender's manifest to the
  refinery (rep, a tender job resumes) and stripping it (credits, a salvor pocket goes quiet for a day).
- Add its encounter script to `uniqueWreckEncounterScripts.js` reusing the salvage-signal shape.
- Pin the four phases and both consequences on seed 4242.

## Done when
`test/fb-ceres-unique-wreck.test.mjs`: rumour→fixed→decision→resolved in order; each branch changes the pocket
cast as authored; `depth-program-unique-wrecks.test.mjs` stays green.

## Do not
Do not add a hull asset. Do not add a mission marker that demands attention. Do not pay both branches.

## Focus test starting points
- `test/depth-program-unique-wrecks.test.mjs`
- `test/depth-program-unique-wreck-choice.test.mjs`
