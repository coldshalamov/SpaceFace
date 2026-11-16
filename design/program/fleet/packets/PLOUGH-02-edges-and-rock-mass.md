# PLOUGH-02 — Plough edge cases and Swarm rock masses (node tests; report, small fixes only)

## 1. Plough edge cases
THROW-01's plough (`src/combat/ploughFlight.js`, wired in `collisionConsequences.js` / `masslineImpactDamage.js`) was
validated on one scenario (`test/swing-01-held-vs-thrown.test.mjs`). For 1.5 s after release, speed lost to a collision
is handed back each tick (up to the release speed) and only kills cost speed (×0.7). Add node cases (seeded, using the
same harness as SWING-01) and print what happens:
- a thrown Wasp hits a Foundry room solid (type `station`, huge mass): does it stop, bounce, or keep re-accelerating
  into the wall for 1.5 s (jitter / tunnelling)?
- a thrown Wasp hits a boss-mass body (≥ 50× its mass, not killed by the hit): same question.
- a thrown body bounces back toward the player: does it get its speed restored toward the player and hurt them?
Expected (lead): a non-kill hit on a body much heavier than the thrown one ends the plough (no speed hand-back after it);
the plough never accelerates a body toward the thrower. If the code does otherwise, make that small fix in
`ploughFlight.js`, with these tests asserting it. Keep SWING-01's numbers (thrown ≥ 2.0 kills, held 0).

## 2. Swarm rock masses vs the 20 t class-I limit
THROW-02 made loose Swarm arena rocks throwable under the line-class weight rule (`entityOverLineClass`, class I = 20 t,
`src/data/lineProgression.js`). Read the mass of every debris rock size class / substance `src/systems/swarmArena.js`
`_spawnDebrisRock` can spawn (pebble / boulder / monolith × substances) and print a table: mass, over class I? If none
(or almost none) are ≤ 20 t, say so plainly — do not change masses or the class rule in this packet.
`npm run check:sim` green; exact-path commits for tests and any ploughFlight fix.
