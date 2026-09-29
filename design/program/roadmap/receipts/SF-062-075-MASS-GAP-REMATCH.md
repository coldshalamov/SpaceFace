# Receipt — SF-062 mass-and-gap round + SF-075 mastery rematch (+ SF-064/072/067 review round)

2026-09-30 · lane: swarm demo-readiness (top-five pick) · scope: planner, runtime, arena, results, announce

## SF-062 — a mass-and-gap round

Every sixth non-boss wave (`isSwarmMassGapWave`) the round becomes a geometry problem:

- The opening burst is fodder-only (`swarmFodderRoster`) — ammunition, not threat.
- At `SWARM_MASS_GAP_CLOSE_TICKS` (270) a `wall: true` package lands on a gate no arrival
  already uses (`swarmFreeGateFor` over the wave's own packages), and `swarmArena` installs a
  perpendicular chord of `SWARM_MASS_GAP_WALL_ROCKS` ordinary debris monoliths at
  `SWARM_MASS_GAP_WALL_DISTANCE`, leaving exactly the plan's two `gapSlots` open.
- Wall muscle materializes **beyond** the chord (`distance > WALL_DISTANCE`) and pours through
  the gaps toward the player.
- Wall rocks are plain debris: `SWARM_DEBRIS_TAG` + `terrainAnchor` + `collides` — SF-067 wear
  fractures them, so a spent hull opens a third path.
- `heavies_only` suppresses the shape outright; boss waves never carry it.
- Wave 6 is the documented exception: its only wall-role body is the debuting jackal, so the
  first wall is geometry alone (`heavyEnemyId: null`, no wall package).

Review-round fixes folded in: gap slots shift to the nearest open same-side slot when ambient
geometry already fills the planned one; `_wallWave` latches only after a successful install and
is reset in `init()`; the heavies-only debut names the silhouette that actually arrives.

## SF-075 — the rematch reveals mastery, not a bigger score

`survivalResults` keeps session-scoped memory keyed by `ruleset|arenaId|seed`. A rerun on the
same sea gets a `rematch` block on the result (`attempt`, `prior`, `line`) and the results
moments prepend the line only when a real physical metric moved: collisions taken
(`physics:impact` + `playerInvolved` + `preSolveClosingSpeed ≥ damageDeltaV` scar floor,
deduped per tick-and-body), improvised/environmental kills, and pressure-breath spends.
Score and wave-depth are tracked in the record but never named — a rematch line is earned
physically or not written. Runs aborted before entering a wave publish no rematch block and
never overwrite the sea's baseline.

Review-round fix: the collision counter rides `physics:impact` (the channel that actually
carries player contact, terrain included) — `combat:collisionConsequence` never routes the
player as target.

## Announce

Swarm closers read `Break the pack.` — the live contract is quota-clearing, so the old
"Survive the minute" wording was retired. Mass-gap rounds append the wall line.

## Validation

- `test/swarm-mass-gap.test.mjs` — 11 tests (cadence, fodder opening on a legally-rich wave,
  late far-side muscle, wave-6 geometry-only pin, two-gap shape, suppression, stream bend,
  determinism, real chord geometry + idempotency + breakability).
- `test/swarm-rematch.test.mjs` — 8 tests (first-sea silence, physical-diff naming, no-filler
  silence, sea isolation, attempt counting, tick+pair dedup + graze floor, abort safety,
  comparator purity).
- Focused swarm battery: 47/47 green. Adjacent crucible/swarm battery: green except the
  foreign `hullBurst` mid-wiring manifest failure and starter-stat pins from the foreign
  PQ-176 thruster swap — both reproduced at clean HEAD `e2a850c39`, not this lane.

## Known pre-existing failures (not this lane)

- `test/pq-174-01-harvest-waves` / `pq-174-01-hud-countdown` pin the superseded 60-second
  clock contract (`7800228c6`), restored to quota-clearing by `6d7677277` — red at clean HEAD.
- `resolveRuntimeManifest: missing system "hullBurst"` — a foreign lane mid-wiring.
- `crucible-swarm-bars`/`handling` stat pins — foreign `mod_thruster_stock_*` swap at HEAD.
