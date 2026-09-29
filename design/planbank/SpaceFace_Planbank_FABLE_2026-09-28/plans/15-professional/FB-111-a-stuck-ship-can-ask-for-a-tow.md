# FB-111 — A ship wedged for long enough is offered a tow to the nearest station

**Kind:** build · **Lane:** THE HAND · **Routing:** open
**Seam tags:** seam: world.js, seam: playerDefeat.js
**Write-set:** `src/systems/world.js`, `src/combat/playerDefeat.js`, `test/fb-stuck-tow-offer.test.mjs`
**Neighbours (extend, never restate):** SFQ-B106, SFQ-B228

## The gap
Overlap is handled by depenetration impulses, and there is no stuck-timer watchdog (the terms unstick, isStuck
and stuckS have zero hits under `src/systems` and `src/core`). A player wedged inside station geometry or a
frozen asteroid pocket has no recovery verb.

## Why this direction
A teleport unstick was rejected (physics is the law). A tow offer reusing the recovery plan's lawful-station
chooser is the honest door, with a cost and a debt entry like the death recovery.

## Mechanism
- Accumulate `+stuckS` in `world.js` when the player has thrust input, near-zero displacement and a sustained
  contact for 8 s; offer a tow prompt (event-only, engine re-validates).
- On accept, reuse `chooseLawfulStation` and the recovery cost quote, apply the hardship clamp, and dock the
  ship through the normal arrival path.
- Pin the timer, the offer, and that free flight never triggers it.

## Done when
`test/fb-stuck-tow-offer.test.mjs`: a scripted wedge on seed 4242 offers after 8 s, accept docks with the
cost, open space never offers; `station-docking-corridor.test.mjs` stays green.

## Do not
Do not teleport without the tow. Do not make the tow free. Do not trigger on a deliberate hold against a wall.

## Focus test starting points
- `test/station-docking-corridor.test.mjs`
- Locate defeat suites with `rg buildRecoveryPlan test/`.
