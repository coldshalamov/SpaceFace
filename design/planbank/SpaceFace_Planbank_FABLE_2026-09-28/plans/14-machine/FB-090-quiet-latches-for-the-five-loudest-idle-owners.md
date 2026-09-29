# FB-090 — The five loudest idle systems learn the quiet latch the others already use

**Kind:** build · **Lane:** THE MACHINE · **Routing:** open
**Seam tags:** seam: combat.js, seam: mining.js, seam: wingmen.js, seam: collisionConsequences.js, seam: chronicler.js
**Write-set:** `src/systems/combat.js`, `src/systems/mining.js`, `src/systems/wingmen.js`, `src/systems/collisionConsequences.js`, `src/systems/chronicler.js`, `test/fb-quiet-latch-five.test.mjs`
**Neighbours (extend, never restate):** SFQ-B213, SFQ-I085

## The gap
Thirty-one table-clock owners have no early-out when nothing they own exists (verified: zero `quiet` hits in
each). Among them `combat.js`, `mining.js`, `wingmen.js`, `collisionConsequences.js` and `chronicler.js` walk
entity lists every tick in an empty sector. The pattern that fixes this exists nine times in
`src/systems/tumbleStates.js` (`_quiet`) and as `quietLatch` in `fields.js`, `weapons.js` and
`countermeasures.js`.

## Why this direction
A generic scheduler wrapper was rejected: each owner knows its own "nothing to do" condition and the latch
must release on the exact event that creates work (a spawn, a hit, a beam start). Copying the proven local
pattern is smaller and testable per owner.

## Mechanism
- For each of the five owners, define the quiet condition from its own state (no live hostiles and no pending
  damage; no beam and no pickups; no wingmen; no impact backlog; no unflushed facts) and latch it.
- Release the latch on the owner's own creating events (`entity:spawned`, `combat:damage`, `mining:start`,
  `physics:impact`, the chronicler fact events) so the first tick that has work runs in full.
- Assert in the focused test that a latched owner produces identical state to an unlatched one across a scripted
  spawn→fight→quiet→spawn sequence on seed 4242.

## Done when
Seed 4242 idle Helios for 1200 ticks: the perf counters' `entityVisits` for these five owners fall to near
zero while latched; the scripted sequence in `test/fb-quiet-latch-five.test.mjs` shows zero divergence; every
existing suite for the five owners stays green.

## Do not
Do not latch on player distance (the world must keep working off-glass). Do not latch a single writer while it
still owns a live body. Do not merge the five latches into one shared flag.

## Focus test starting points
- `test/bombs-empty-quiet-latch.test.mjs`
- `test/difficulty-director-quiet-latch.test.mjs`
- `test/ai-encounter-quiet-latch.test.mjs`
