# FB-024 — The Crucible's every-ten-waves champion can be an authored capital with a telegraphed score

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: survivalWave.js, seam: swarmMode.js, seam: capitalBossRuntime.js
**Write-set:** `src/systems/survivalWave.js`, `src/data/swarmMode.js`, `src/systems/capitalBossRuntime.js`, `test/fb-crucible-capital-boss.test.mjs`
**Neighbours (extend, never restate):** SFQ-B052, NXB-016, SF-068

## The gap
Three boss systems coexist and none share: `SWARM_BOSS_ROTATION` (compositions, live), the authored
`mirrorjaw_foreman`/`forge_regent` (arc ruleset only), and `capitalBossEncounters` with executable scores and
`capitalBoss:telegraphEnd`, which starts only from a campaign mission. The best-authored bosses never reach
the default route.

## Why this direction
A fourth boss system was rejected. Letting `swarmBossFor` return an authored enemy id and a capital score id,
and letting `survivalWave.js` dispatch both, unifies the three without deleting any.

## Mechanism
- Extend the rotation rows in `swarmMode.js` with optional `+enemyId` and `+scoreId`; wave 20 →
  `mirrorjaw_foreman`, wave 30 → `forge_regent` with their scores.
- In `survivalWave.js`, when a plan carries a capital elite, emit `capitalBoss:start` and bind the wing through
  the existing `spawnWing` port in `capitalBossRuntime.js`.
- Keep the compositional champions for waves 10 and 40+ so variety survives.

## Done when
Seed 4242 swarm run to wave 20: one `capitalBoss:start`, telegraph beats observed, the foreman present;
`test/fb-crucible-capital-boss.test.mjs` pins it; `pq-152-02-capital-boss.test.mjs` and
`capital-boss-save-roundtrip.test.mjs` stay green.

## Do not
Do not scale boss HP by wave. Do not remove the compositional champions. Do not make the boss
campaign-progress dependent.

## Focus test starting points
- `test/pq-152-02-capital-boss.test.mjs`
- `test/pq-133-04-r4-boss.test.mjs`
- `test/pq-174-05-boss-physics.test.mjs`
