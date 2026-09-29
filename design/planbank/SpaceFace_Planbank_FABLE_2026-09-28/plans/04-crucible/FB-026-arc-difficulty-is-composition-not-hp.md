# FB-026 — The scored arc stops inflating hull and damage; its curve moves into composition

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: waveMaterialization.js, seam: survivalActs.js, seam: difficulty.js
**Write-set:** `src/systems/waveMaterialization.js`, `src/data/survivalActs.js`, `src/data/difficulty.js`, `test/fb-arc-difficulty-composition.test.mjs`
**Neighbours (extend, never restate):** SFQ-B048, NXB-017

## The gap
`scaleCombatant` multiplies hull, armor, shield and `dmgMult` by 1 + 0.12·(level−1); `levelForWave` in
`waveMaterialization.js` climbs to level 10 by wave 30, so the scored arc reaches 2.08× HP and damage while
its own comment claims no HP inflation knob. The default swarm route pins level 1 and is clean. Separately,
`difficultyDamageScale` applies the standard profile's 0.50 incoming / 1.15 outgoing to Crucible runs, though
`defeatMercyScale` already exempts survival.

## Why this direction
Physical difficulty is the law and the swarm route proves it works. Moving the arc's curve into
`composeArcWave` package counts and bearings, and exempting survival from the damage profile exactly as mercy
is exempted, brings both rulesets under one law.

## Mechanism
- Make `levelForWave` return 1; express the former curve as package counts, bearings and batch gaps in
  `composeArcWave` (`difficultyForWave` already tightens gaps only).
- Add the survival early-return to `difficultyDamageScale` mirroring `defeatMercyScale`.
- Pin wave-30 enemy hull equal to wave-1 hull for the same archetype, and pin that pressure (concurrent count)
  still rises.

## Done when
`test/fb-arc-difficulty-composition.test.mjs`: hull equality across waves, rising concurrency, no profile
scaling inside a run on seed 4242; `crucible-wave-materialization.test.mjs` and `difficulty-director.test.mjs`
stay green.

## Do not
Do not re-add any multiplier under another name. Do not change the adventure profile numbers. Do not touch the
defeat-streak mercy.

## Focus test starting points
- `test/crucible-wave-materialization.test.mjs`
- `test/difficulty-director.test.mjs`
