# FB-023 — The warden, the cutter and the lawman reach the default Crucible route

**Kind:** build · **Lane:** THE FIGHT · **Routing:** open
**Seam tags:** seam: swarmMode.js, seam: combatDefs.js
**Write-set:** `src/data/swarmMode.js`, `src/data/combatDefs.js`, `test/fb-swarm-roster-geometry.test.mjs`
**Neighbours (extend, never restate):** SFQ-B050, SFQ-B048

## The gap
`SWARM_ROSTER` holds 12 of 19 archetypes. `warden_escort` (the only guardian, `ward_screen` specialist),
`customs_cutter` (prow plate) and `patrol_lawman` (directional armor) never spawn on the default route, and
they carry most of the roster's surface/geometry problems. `warden_escort` also has no
`ENEMY_DOCTRINE_OVERRIDES` row.

## Why this direction
New enemies were rejected; three exist and are tested (`warden-open-route.test.mjs`). Roster rows with
`fromWave` clocks are data; the specialist dispatcher and the surface router already handle them.

## Mechanism
- Append `warden_escort` (fromWave 9), `customs_cutter` (fromWave 12) and `patrol_lawman` (fromWave 15) to
  `SWARM_ROSTER` with pack sizes that keep `SWARM_CONCURRENT_MAX` intact.
- Add a `warden_escort` override row so its guardian doctrine is explicit; pin that a warden wards a marked ally
  in a survival spawn.
- Keep the roster unlock clock monotonic and the seed-4242 wave-10 composition deterministic.

## Done when
`test/fb-swarm-roster-geometry.test.mjs`: seed 4242 waves 9–16 contain each of the three at least once;
`crucible-swarm-arena.test.mjs` and `warden-open-route.test.mjs` stay green.

## Do not
Do not raise concurrency. Do not scale HP. Do not add them before wave 9.

## Focus test starting points
- `test/warden-open-route.test.mjs`
- `test/crucible-swarm-arena.test.mjs`
- `test/crucible-wave-materialization.test.mjs`
