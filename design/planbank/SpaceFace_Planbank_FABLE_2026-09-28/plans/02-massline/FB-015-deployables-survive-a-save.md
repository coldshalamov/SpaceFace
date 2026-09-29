# FB-015 — A deployed snare, an armed charge network and a live web survive save and load

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: saveSystem.js, seam: masslineSnares.js, seam: impulseCharges.js, seam: tetherWebs.js
**Write-set:** `src/save/saveSystem.js`, `src/systems/masslineSnares.js`, `src/systems/impulseCharges.js`, `src/combat/tetherWebs.js`, `test/fb-deployables-survive-save.test.mjs`
**Neighbours (extend, never restate):** SFQ-B221, NXB-059, NXI-089

## The gap
Snares and their anchors spawn as non-persistent entities and `masslineSnares.js` has no serialize;
`impulseCharges.js` (sole writer of the chain-primed state) has no serialize; `tetherWebs.js` keeps its links
in a closure map with a 9 s lifetime and no clear on load. A save mid-snare deletes the snare; a stuck plate
network vanishes; a web can outlive its limit after a restore.

## Why this direction
Making them persistent entities was rejected (the capture table is deps-first and bounded). The
`_callSerialize` row pattern in `saveSystem.js` (`stunts`, `fields`) is the established answer.

## Mechanism
- Add `snares` and `charges` rows to the capture plan calling `_callSerialize` on the two systems; serialize
  positions, arm timers and the primed chain by stable ids; restore after entities.
- Persist web links through the snares serialize (same owner) or clear them on `save:loaded` like `massSeed.js`
  does; pick persist, since a web is a player investment.
- Pin round-trip equality for a scripted snare + charge network + web on seed 4242, and that lifetimes continue
  from the saved remaining time.

## Done when
`test/fb-deployables-survive-save.test.mjs`: save/load preserves snare, anchors, three charges with a primed
chain and one web with remaining lifetime; `save-envelope-fidelity.test.mjs` and `bounded-autosave.test.mjs`
stay green.

## Do not
Do not mark the entities persistent. Do not reset lifetimes on load. Do not grow the envelope beyond the
bounded capture slice.

## Focus test starting points
- `test/save-envelope-fidelity.test.mjs`
- `test/bounded-autosave.test.mjs`
- `test/save-restore-atomicity.test.mjs`
