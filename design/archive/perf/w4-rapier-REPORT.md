# Wave-4 Lane Report — Rapier tuning (sleep / islands / CCD / broadphase)

Lane question: *sleeping thresholds, island management, CCD selectivity, broadphase (SAP)
tuning for this entity mix.* Broadphase/SAP lane folded in.

Branch: `devin/1790655826-w4-rapier` off `origin/master` (070f8215).

## Verdict

Every real Rapier tuning knob reachable from `@dimforge/rapier3d-compat@0.19.3` is
hash-moving — solver iteration counts, `minIslandSize`, `maxCcdSubsteps`, `lengthUnit`,
`contact_erp`, `normalizedAllowedLinearError`/`PredictionDistance`,
`contact_natural_frequency`, sleep expansion, and any CCD-policy change all alter solver
output, which the golden hashes directly (`snapshot.physics.bodies` = quantized
x,z,yaw,vx,vz,wy per body). The JS compat surface exposes **zero** SAP/broadphase knobs
(no `sap*`/`broadPhase*` parameters exist; `world.broadPhase`/`narrowPhase` are read/query
only). So the provably-behavior-identical work in this lane is **WASM-boundary call
elision**: the island/sleep bookkeeping ran ~102 FFI calls per physics tick that were
provably no-ops for sleep-ineligible bodies — and in run 47a *every* dynamic body is
ineligible (`mayRapierIslandSleep` requires SIM_TIER S2+, none qualify).

Applied (all guard-gated, semantics argued identical per callsite):

- `world.timestep = fixedDt` hoisted from per-`_stepFixed` write to constructor
  (`fixedDt` is set once, never mutated) — 720 `set timestep` FFI calls/run → 1.
- `_sleepingRecordSkipsCpu` short-circuits on `rec._sleepAllowed === false` before the
  `isSleeping()` WASM read. Ineligible bodies are provably awake at all its callsites:
  either created `canSleep=false` (cannot sleep) or woken by the keep-awake hammer in
  `_refreshSleepPolicy` that same tick. — `isSleeping` 44,820 → 0 calls/run.
- `_persistIslandSleep` stamps `physicsSleeping=false` directly for
  `rec._sleepAllowed === false` records instead of querying `isSleeping()` (provably
  false by the same argument).
- `_refreshSleepPolicy` keep-awake hammer: the old code called `body.wakeUp()` every
  tick for every ineligible record. Compat `RigidBody` has **no `setCanSleep`**, so
  WASM canSleep is fixed at creation by `desc.setCanSleep(mayRapierIslandSleep(...))`.
  A body created while eligible keeps `canSleep=true` for life and can genuinely
  activation-sleep while ineligible — the per-tick `wakeUp()` is load-bearing for that
  subset (verified: `body.sleep()` works even on `canSleep=false` bodies, and `wakeUp()`
  flips `isSleeping()` synchronously). The hammer is now keyed on the new
  `rec._createdCanSleep` flag: bodies created `canSleep=false` can never sleep, so
  their hammer calls were always no-ops. — `wakeUp` 12,288 → 3 calls/run.
- `resetBodyForces` (`resetForces(true)` + `resetTorques(true)`) skipped for ineligible
  records whose force accumulator is provably zero — new `rec._forcesDirty` flag set at
  the only `addForce`/`addTorque` site (`_applyCommand`). The `wakeUp=true` arg makes
  skipping unsafe for eligible (possibly-sleeping) records, so those keep unconditional
  resets. — `resetForces`/`resetTorques` 12,285 → 4,314 calls/run each (= commanded
  records/tick).

Not applied (documented, all hash-moving): solver iteration counts (`numSolverIterations`
=4, `numInternalPgsIterations`=1), `minIslandSize`=128, `maxCcdSubsteps`=1, `lengthUnit`,
contact ERP/CNF, `normalizedAllowedLinearError`/`normalizedPredictionDistance`, any
widening of `mayRapierIslandSleep` eligibility (its `physicsSleeping` flag is consumed by
weapons.js/fields.js/coreSystem.js/spatialHash.js — expansion is hash-moving), and CCD
policy (already selective: speed-gated `CCD_GATE_ENABLE_SPEED=150`/`DISABLE=120` wu/s
hysteresis + always-on projectiles + ghost body pooling; any retune changes tunneling
behavior on fast movers).

## Research citations

- **Rapier JS rigid-body docs** (rapier.rs `javascript3d/classes/RigidBodyDesc.html` /
  user guide "Rigid-bodies"): `.setCanSleep(true)` default, `.setCcdEnabled(false)`
  default, `.setSleeping()` exists on the desc. Bodies sleep when kinetic energy stays
  below an internal threshold for ~2 s; the threshold is *not* exposed on the JS compat
  surface — verified by live enumeration: `IntegrationParameters` exposes only `dt,
  numSolverIterations, numInternalPgsIterations, minIslandSize, maxCcdSubsteps` (plus
  `contact_erp, contact_natural_frequency, lengthUnit, normalizedAllowedLinearError,
  normalizedPredictionDistance`); `RigidBody.prototype` exposes `sleep/wakeUp/isSleeping`
  but **no `setCanSleep`** — confirmed on `rapier3d-compat@0.19.3`.
- **rapier3d-compat 0.19.x changelog**: legacy PGS knobs (`erp`,
  `maxVelocityIterations`…) were removed upstream in favor of `numSolverIterations`
  (TGS Soft); `RigidBody.additionalSolverIterations()` exists as a per-body getter.
- **Determinism** (rapier.rs docs / `enhanced-determinism` feature; npm
  `rapier3d-compat-deterministic` builds): the base compat build is only *locally*
  deterministic — same machine, same binary. Cross-platform determinism requires the
  enhanced-determinism package, which the repo does not use; the golden hash is a
  same-machine contract. Every solver constant therefore sits on the hash-critical path.
- **Island manager**: `IntegrationParameters.minIslandSize` (default 128) is the only
  exposed island knob; islands are otherwise internal. `body.islandId` is not on the
  compat surface — `_stampIslandSleep` falls back to `body.handle` for
  `physicsIslandId`.
- **CCD**: `RigidBodyDesc.setCcdEnabled` / `setSoftCcdPrediction`, runtime
  `body.enableCcd`, `IntegrationParameters.maxCcdSubsteps` (default 1). Repo already
  gates CCD by speed with hysteresis (PQ report in `physics-spike-FIX-REPORT.md`).

## Step-cost profile (run 47a, `node --cpu-prof`)

5×720-tick runs, ~3.3 s wall each way. `world.step` inclusive ≈ 105–110 ms of ~3.4 s
(~3 %; the WASM exec itself dominates inside). The rest of `_stepFixed` (~57 ms self)
is body-kinematics marshaling (`linvel`/`rotation`/`angvel`/`translation` reads ≈
4×~28 k calls/run) plus the sleep bookkeeping this patch removes. Bigger fish sit
outside physics entirely: `sanitize`/`clonePlain`/`canonicalStringify` snapshot path
~380 ms, GC ~175 ms, flight dynamics ~250 ms — none in-lane.

## Knob audit (`src/core/physics.js` + `sg02DynamicBodyOwner.js`)

- Sleeping: used, selectively — `mayRapierIslandSleep` (non-player, non-projectile,
  non-noInterp, non-job, SIM_TIER S2/S3/S4), plus `shouldSkipSleepingKinematics`
  (held/hadCommand guards) and save/load round-trip via `entity.physicsSleeping`.
  On 47a: **0 eligible records** — all bookkeeping was dead weight.
- CCD: selective already — speed-gated hysteresis, projectiles always-on, ghost pool.
- Census (inspect at t=720): 23 physics bodies — 6 ships, 2 payloads, 1 wreck,
  1 beacon, 13 projectiles; ~15 moving. Well under `minIslandSize` (128) — the island
  manager effectively runs one active island; nothing to tune there.
- Broadphase: no SAP knobs exist in the compat surface (see citations). `world.step`
  internals are untouchable without a different rapier build.

## Patch

`src/core/sg02DynamicBodyOwner.js` — 6 guarded elisions + 2 record flags
(`_createdCanSleep`, `_forcesDirty`), all semantics-preserving by construction
(arguments inline at each site). New `scripts/ffi-rapier-count.mjs` — zero-edit FFI
call-count probe used for the A/B (`node --import ./scripts/ffi-rapier-count.mjs
scripts/sf-sim.mjs run ...`; writes `FFI_COUNT_OUT` JSON at exit).

## Metrics

- **Golden 47a** (`run --seed 47 --ticks 720 --hash --repeat 20 --reload-at 600`,
  `--expect test/47a.telemetry.expected.json`):
  `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`, exit 0.
- **FFI call counts** (probe, 720 ticks): `isSleeping` 44,820 → 0; `wakeUp` 12,288 → 3;
  `resetForces` 12,285 → 4,314; `resetTorques` 12,285 → 4,314; `set timestep` 720 → 1.
  ~73.8 k boundary calls/run elided (~102/tick). All other counts identical
  (`linvel` 28,159, `angvel` 25,291, `rotation` 28,158, `translation` 15,155,
  `addForce`/`addTorque` 4,320, `step` 720, `setLinvel`/`setAngvel` 725,
  `setRotation` 724) — same work, minus provably-dead calls.
- **Wall clock** (3 runs each way, repeat 5): baseline median 3288 ms → patched 3212 ms
  (~2.3 %; inside run-to-run spread — directionally consistent with the removed glue,
  not a headline win).
- **Focused tests**: `node --test` over the 10 sleep/physics files touching the owner
  (`pq-204-advanced-perf`, quiet-skip/latch pair, render-interpolation,
  floating-origin-rapier, physics-authority-cache, sector-fence-rapier,
  sg02-init-lifecycle, vfx-field-geometry-sleep, npc-job-signatures-quiet-sleep-latch):
  58/58 pass.

## Follow-ups (not this lane)

- The 4×~28 k/run kinematics getters (`linvel`/`angvel`/`rotation`/`translation` allocs)
  are the remaining FFI mass inside `_stepFixed`; batch-read APIs (`forEachActiveRigidBody`,
  raw `RigidBodySet`) would cut them but change iteration order semantics — needs the
  adjudication recipe, not this lane.
- If `physicsSleeping` consumption is ever decoupled from gameplay consumers, widening
  `mayRapierIslandSleep` to resting S0/S1 bodies is the next real sleep win — hash-moving,
  adjudicate via `scripts/sim-golden-diff.mjs`.
