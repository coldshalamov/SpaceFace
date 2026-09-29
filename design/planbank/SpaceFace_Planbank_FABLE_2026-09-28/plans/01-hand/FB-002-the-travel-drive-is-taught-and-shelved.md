# FB-002 — The second speed is taught once and has a place on the verb shelf

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: missingThree.js, seam: powerRail.js, seam: input.js
**Write-set:** `src/onboarding/missingThree.js`, `src/ui/hudAttention.js`, `src/ui/powerRail.js`, `test/fb-travel-drive-taught.test.mjs`
**Neighbours (extend, never restate):** SFQ-B020, SFQ-B063

## The gap
`travelBurn` (NumLock/KeyH, pad L3) drives a full state machine (`TRAVEL_DRIVE_STATES`
spooling/engaged/cooldown) and is rebindable, but `onboarding.js` never names it, `TAUGHT_FLIGHT_ACTIONS`
omits it, and the power rail has no slot for it. The vision's "two speeds coexist" has one speed taught.

## Why this direction
A tutorial screen was rejected (teaching is spoken once, in play). `MISSING_THREE_BEATS` already teaches
boost, stroke and the three fields with one line each; a row for the drive uses the same rail. The shelf slot
is a readout of a state that already exists.

## Mechanism
- Add a `travelBurn` beat to `MISSING_THREE_BEATS` gated on the first long straight (speed above the governed
  combat speed for 3 s with no hostile), with a `MISSING_THREE_BEAT_LINES` line in `hudAttention.js` that names
  the key from the live binding.
- Add a rail slot fed from `inp.travelDrive` state (spooling/engaged/cooldown) in `powerRail.js`, minimal and
  ORRERY-consistent.
- Pin that the beat fires once per profile and never during combat.

## Done when
`test/fb-travel-drive-taught.test.mjs`: on seed 4242 the beat fires once on the first eligible straight and
not again after save/load; the rail slot reflects the three states; existing onboarding suites stay green.

## Do not
Do not add a modal. Do not fire the hint on `flight:modeChanged` after the player already found it. Do not
redesign the rail (ORRERY).

## Focus test starting points
- Locate the onboarding suites with `rg missingThree test/` and `rg onboarding test/ -l`.
