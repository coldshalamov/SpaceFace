# CV-AMMO-1 — Fields on the keyboard: teaching + opening-spread verification

**Verdict: DONE 2026-09-28** — both clauses verified against the real route; one instrument defect
found and fixed along the way.

## What the row asked

> Fields are on the keyboard and untaught — teaching moment + verify the opening no longer spreads
> bodies to gun range.

## Findings

### Fields are on the keyboard — TRUE

`VERB_BINDINGS` in `src/systems/input.js` binds the field verbs on every scheme (pilot, classic,
helm-assist all spread it): `deployWell` Digit5, `deployRepulsor` Digit6, `deployMassSeed` Digit4,
`toggleClearingCone` Digit7, `toggleSkimCollector` Digit8, `dropBomb` Digit9, `cycleBomb` Comma,
`jettisonLot` Period. All rebindable through the settings bindings table; `resolveActionCodes`
returns `["Digit5"]`/`["Digit6"]` inside a live production-profile run.

### Untaught — FALSE (already taught)

The first-hour onboarding rail's "missing three" sequence (PQ-163.02) stages actors and walks the
player through Well and Repulsor deployment; the authored Crucible onboarding raid adds a physical
verb lesson (crippled raider + throw-target rock + gun-kill retry + explicit copy "Latch him this
time"). Focused suite: `node --test test/` onboarding + missing-three — 9/9 green.

### Opening no longer spreads bodies to gun range — VERIFIED

Fixed-seed measurement (`seed 8008`, `simulateCrucibleSwarm`, wave 1, all three loadouts):

- Wave-1 hostiles materialize at a **median ≈ 141 WU** (min 15) — `SWARM_SPAWN_DISTANCE = 165`
  pulls arrivals inside the camera bubble by construction.
- Kills land at ~20 WU (collision) and ~140 WU (weapon) — nowhere near the ~240 WU starter-gun
  edge. The historical "spread to gun range and deleted off-screen" defect is not present.

## Defect found and fixed while verifying

The crucible bench's verb sampler read `state.input.actions` **after** `runtime.step` — but
consumer systems clear edge flags when they act on them (`fields._handleInput` clears
`actions.deployWell` the moment the Well deploys; bombs, cargo, impulseCharges, massSeed,
planetRuntime, scanner all do the same). Every consumed verb was invisible: the physics-toolkit
pilot's Digit5/6 presses deployed real fields and the trace credited zero verbs, suppressing
`verbsPerMinute` and distorting quiet-window detection on every loadout that uses consumable verbs.

Fix (`e05d2c660`, pushed): `captureProducedActions` wraps `input.update` at bench setup and
snapshots the actions map the instant input produces it; `sampleIssuedVerbs` reads the snapshot on
both the swarm and duel paths. Post-fix trace on the same seed credits `well`/`shove`/`latch`/
`throw`/`reel` on their exact tape ticks. 53/53 bench tests green, determinism untouched.

## Files

- `scripts/lib/bench/crucibleBench.mjs` — instrument fix
- Verified with: `test/crucible-bench-real-path.test.mjs`, `test/fun-bench.test.mjs`,
  `test/fun-measurer.test.mjs` (53/53); onboarding/missing-three suite (9/9)
