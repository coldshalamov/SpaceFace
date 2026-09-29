# FB-009 — Thirteen receipts from the signature verb reach the picture and the pad

**Kind:** wire · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: actionEventRecipes.js, seam: tetherGameplay.js, seam: gamepad.js
**Write-set:** `src/render/vfx/actionEventRecipes.js`, `src/systems/tetherGameplay.js`, `src/systems/gamepad.js`, `test/fb-massline-receipts-vfx.test.mjs`
**Neighbours (extend, never restate):** SFQ-B192, NXB-007

## The gap
Emit-only from `tetherGameplay.js` and its neighbours: `massline:bridleLinked`, `massline:bridleCut`,
`massline:bridleEnded`, `massline:bridleEndpointSelected`, `massline:bridleSetupEnded`,
`massline:cadenceChanged`, `massline:npcCounterplay`, `massline:npcLineCut`, `massline:playerLineCut`,
`chain:tetherShare`, `tether:whipSnap`, `tether:rebound`, `web:linked`. The strict pass confirms no other src
file mentions them. The signature verb's own consequences are invisible.

## Why this direction
New VFX systems were rejected; `ADDITIONAL_ACTION_VFX_RECIPES` is auto-subscribed by `vfx.js` and each row is
one line naming a verb and a primitive. Denials are handled by FB-070; this packet covers the affirmative
receipts.

## Mechanism
- Add one recipe row per event with the verb it already is (link, cut, end, share, snap, rebound): bridle link
  draws the shared filament, a line cut by an NPC flashes the cut point with the cutter's colour, the web link
  runs a bead along the new strand.
- Add haptic pulses for the cut-by-NPC and whip-snap edges through the table from FB-005.
- Pin that a scripted bridle setup→link→cut sequence produces exactly one record per edge.

## Done when
`test/fb-massline-receipts-vfx.test.mjs`: 13 events, 13 recipe rows, one record each on a seed-4242 script; no
recipe fires for an event that did not occur; `wave-c5-verb-cues.test.mjs` stays green.

## Do not
Do not add particles to a clean release (the release grammar is particle-silent by acceptance). Do not change
the bridle or web physics.

## Focus test starting points
- `test/wave-c5-verb-cues.test.mjs`
- Locate `twin_bridle` suites with `rg bridle test/`.
