# FB-017 — The zealot and the ghost stop being stat variants of the wasp and the lancer

**Kind:** deepening · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: combatDefs.js, seam: enemies.js
**Write-set:** `src/data/combatDefs.js`, `src/data/enemies.js`, `test/fb-variant-pairs.test.mjs`
**Neighbours (extend, never restate):** SFQ-B050, SF-049

## The gap
`choir_zealot` shares the wasp's silhouette, archetype and `swarm_pack` doctrine remap; it differs by hull
55→70 and an occasional missile. `quiet_ghost` shares the lancer's `sniper_lance` doctrine and differs by
preferred range and an EMP sidearm. Two roster slots, one problem each. `ENEMY_DOCTRINE_OVERRIDES` in
`src/data/combatDefs.js` is the seam that already re-filed the jackal and the corsair.

## Why this direction
Two new hulls were rejected (feel is not content). Two override rows plus a surface rule make each pair two
problems: the zealot fixates on a marked target and shields it; the ghost fires only from beyond the player's
lock and relocates after every shot.

## Mechanism
- Add `choir_zealot` and `quiet_ghost` rows to `ENEMY_DOCTRINE_OVERRIDES`: zealot → a guardian-style fixation on
  the nearest marked ally with a `prowSurface` plate; ghost → `ranged_disengager` with a relocate-after-shot
  phase and the existing `sensor_ghost` telegraph.
- Remove the accidental HP delta as the distinguishing feature (keep hull equal to the base variant) so the
  difference is behaviour, not numbers.
- Pin in a fixed-seed scenario that the two pairs produce different doctrine phase sequences over 600 ticks.

## Done when
`test/fb-variant-pairs.test.mjs`: phase sequences differ per pair on seed 4242; hull values equal within each
pair; `mine-layer.test.mjs` (the override precedent) stays green.

## Do not
Do not scale HP or damage. Do not add gyros or instant turns. Do not add a third variant.

## Focus test starting points
- `test/mine-layer.test.mjs`
- `test/wave-b4-specialist-plans.test.mjs`
