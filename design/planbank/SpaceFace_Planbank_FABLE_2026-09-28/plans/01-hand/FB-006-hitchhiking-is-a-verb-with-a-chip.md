# FB-006 — Riding a faster anchor is a named state with a chip, a grade and a hint keyed on the ride

**Kind:** deepening · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: masslineHud.js, seam: tetherGameplay.js, seam: onboarding.js
**Write-set:** `src/ui/masslineHud.js`, `src/systems/tetherGameplay.js`, `src/systems/onboarding.js`, `test/fb-hitchhike-ride-chip.test.mjs`

## The gap
Hitchhiking is a traffic flag that adds express liners plus one post-hoc hint on `tether:latched`. There is no
ride state, no tow readout and no exit grade. `resolveMassInterpretation` in `masslineHud.js` already returns
`likely-anchor`, and `masslineTelemetry` already tracks tangential speed since latch.

## Why this direction
A hitchhike mission was rejected (content is not a verb). The state is derivable: taut line, anchor faster
than the player. Naming it and grading the exit makes the existing liners a toy.

## Mechanism
- Derive a `ride` state in `tetherGameplay.js` when the line is taut and the anchor's speed exceeds the player's
  by a margin for 0.5 s; publish it on the player's tether status.
- Show a RIDE chip in `masslineHud.js` with the speed gained, and grade the release (kept speed / anchor speed)
  through the existing release rating path.
- Key the onboarding hint on the first ride, not on any latch.

## Done when
`test/fb-hitchhike-ride-chip.test.mjs`: on seed 4242 a latch to a liner enters `ride` within 0.5 s of taut, a
release at speed grades, and the hint fires once; `massline-express-liner-runtime.test.mjs` stays green.

## Do not
Do not add drag or a speed cap on release. Do not spawn extra liners. Do not fire the hint on a stationary
latch.

## Focus test starting points
- `test/massline-express-liner-runtime.test.mjs`
- `test/pq048-passenger-liner-service.test.mjs`
