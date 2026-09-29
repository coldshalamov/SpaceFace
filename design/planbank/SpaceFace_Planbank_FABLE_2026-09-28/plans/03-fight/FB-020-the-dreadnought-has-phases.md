# FB-020 — The only capital hull changes its problem when its turrets die, not when a health bar crosses a mark

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: tacticalAI.js, seam: subsystems.js, seam: enemies.js
**Write-set:** `src/systems/tacticalAI.js`, `src/combat/subsystems.js`, `src/data/enemies.js`, `test/fb-dreadnought-phases.test.mjs`
**Neighbours (extend, never restate):** NXB-016, NXI-061, NXI-063, SF-068

## The gap
`dreadnought_boss` authors `subsystems { turretHp 300, spawnsSwarmers, phases: [0.66, 0.33] }`; nothing
consumes the block, and the `phases` numbers are hull fractions, which NXB-016 rules out (openings follow a
damaged physical subsystem, never a health-bar phase). `src/combat/subsystems.js` already tracks per-subsystem
`destroyed` and `effectiveDisabled` state. The boss is 2000 t of hull that fights the same way with twelve
turrets and with none.

## Why this direction
NXB-016 selects one capital attack whose vulnerability changes when one subsystem is disabled; this packet is
the dreadnought's whole phase machine on the same law. The authored `turretHp` becomes the real per-turret
subsystem value and the phase edges are turret-count events the player causes.

## Mechanism
- Register the dreadnought's turret mounts as subsystems with `turretHp`; delete the `phases` fractions from
  `src/data/enemies.js` and replace them with `+phaseAtTurretsLost: [4, 10]`.
- In the capital shaping of `tacticalAI.js`, on each turret-count edge emit a distinct `ai:doctrinePhase` and
  change posture: the first edge vents the authored swarmers through `spawnBudget` and shortens the broadside;
  the second edge exposes a `prowSurface` window and drops turn authority (mass, not a gyro).
- Telegraph each edge once through the existing `telegraph` block and the capital presentation (NXI-063:
  announce the real opening once per transition).

## Done when
`test/fb-dreadnought-phases.test.mjs`: on seed 4242 a scripted turret-by-turret kill produces two phase edges
at 4 and 10 turrets lost with hull untouched, swarmers spawned once, turn authority reduced after the second;
a hull-only damage ramp with turrets intact produces no edge; `pq206-00-dreadnought-wing-cell.test.mjs` stays
green.

## Do not
Do not key any edge on hull fraction. Do not add invulnerability windows. Do not scale HP. Do not add a UI
boss bar (ORRERY).

## Focus test starting points
- `test/pq206-00-dreadnought-wing-cell.test.mjs`
- `test/pq-152-02-capital-boss.test.mjs`
