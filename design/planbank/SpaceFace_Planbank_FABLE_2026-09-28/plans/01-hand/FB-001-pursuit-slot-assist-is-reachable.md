# FB-001 — The pursuit-slot assist that exists becomes a reachable assisted-flight option

**Kind:** wire · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: flightV3.js, seam: pursuitSlotAssist.js
**Write-set:** `src/systems/flightV3.js`, `src/core/flight/pursuitSlotAssist.js`, `src/core/gameState.js`, `test/fb-pursuit-slot-reachable.test.mjs`

## The gap
`src/core/flight/pursuitSlotAssist.js` ships `createPursuitSlot`, `adjustPursuitSlot` and
`stepPursuitSlotAssist` with a full tuning table, and no `src/` file calls them (`main.js` only sanitizes
`state.input.pursuitSlot` on reset). Its sibling `stepAnchorRelativeOrbitAssist` is live from `flightV3.js`. A
whole assist is authored and unreachable.

## Why this direction
A new chase autopilot was rejected. The assist exists and is deterministic; calling it from the site that
already steps orbit assist, under a setting the player can turn off, is surfacing, not inventing.

## Mechanism
- Call `stepPursuitSlotAssist` from the `flightV3.js` site that steps orbit assist, active only when the player
  holds a lock on a moving target and the new gameplay setting `+gameplay.pursuitSlotAssist` is on (default off,
  so goldens are untouched).
- The assist steers toward the slot with thrust the hull has; it never writes velocity or clamps earned speed
  (invariant pinned in the test).
- Surface the option beside the existing orbit-assist row (task-needed functional settings edit).

## Done when
Seed 4242 fixed scenario, NPC fleeing on a curve for 20 s: time-in-slot with the assist on is at least double
time-in-slot with it off, player speed never exceeds what thrust can produce, and
`test/fb-pursuit-slot-reachable.test.mjs` pins both numbers; goldens unchanged with the default off.

## Do not
Do not clamp momentum or add drag. Do not make it default on. Do not give the target any counter-steer.

## Focus test starting points
- `test/propulsion-spawned-ship-authority.test.mjs`
- Locate orbit-assist suites with `rg orbitAssist test/` and name what you verified.
