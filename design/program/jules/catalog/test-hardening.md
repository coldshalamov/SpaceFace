<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# Deterministic test hardening

Add focused, behavior-level regression coverage around live ownership seams without manufacturing implementation changes.

**Tasks:** 40 · **Range:** `JULES-0001`–`JULES-0040`

## JULES-0001 — Event bus subscription and emission — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** xs · **Collision:** `core-event-bus`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of event bus subscription and emission. Exercise the public behavior or ownership seam, not source formatting.

**Context:** event bus subscription and emission: listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for event bus subscription and emission and its nearest existing tests/checks.
2. Characterize the current contract around listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for event bus subscription and emission and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0001 --format prompt`

## JULES-0002 — Event bus subscription and emission — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-event-bus`

**Objective:** Add a table-driven boundary test for event bus subscription and emission. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation; do not generate decorative permutations.

**Context:** event bus subscription and emission: listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for event bus subscription and emission and its nearest existing tests/checks.
2. Characterize the current contract around listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0002 --format prompt`

## JULES-0003 — System registry and update ordering — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-registry`

**Objective:** Add a table-driven boundary test for system registry and update ordering. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to selected backend registration, update-order stability, init ordering, and duplicate system names; do not generate decorative permutations.

**Context:** system registry and update ordering: selected backend registration, update-order stability, init ordering, and duplicate system names.

**Inspect:** `src/core/registry.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for system registry and update ordering and its nearest existing tests/checks.
2. Characterize the current contract around selected backend registration, update-order stability, init ordering, and duplicate system names before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0003 --format prompt`

## JULES-0004 — Fixed-timestep loop — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-loop`

**Objective:** Add a table-driven boundary test for fixed-timestep loop. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop; do not generate decorative permutations.

**Context:** fixed-timestep loop: accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop.

**Inspect:** `src/core/loop.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for fixed-timestep loop and its nearest existing tests/checks.
2. Characterize the current contract around accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0004 --format prompt`

## JULES-0005 — Time-effect arbitration — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-time-effects`

**Objective:** Add a table-driven boundary test for time-effect arbitration. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization; do not generate decorative permutations.

**Context:** time-effect arbitration: minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization.

**Inspect:** `src/core/timeEffects.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for time-effect arbitration and its nearest existing tests/checks.
2. Characterize the current contract around minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:time-effects`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0005 --format prompt`

## JULES-0006 — New-game/load transition guard — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-transition-guard`

**Objective:** Add a table-driven boundary test for new-game/load transition guard. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance; do not generate decorative permutations.

**Context:** new-game/load transition guard: monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance.

**Inspect:** `src/core/runTransitionGuard.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for new-game/load transition guard and its nearest existing tests/checks.
2. Characterize the current contract around monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0006 --format prompt`

## JULES-0007 — Entity store lifecycle — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-entity-store`

**Objective:** Add a table-driven boundary test for entity store lifecycle. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references; do not generate decorative permutations.

**Context:** entity store lifecycle: Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references.

**Inspect:** `src/core/entity.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for entity store lifecycle and its nearest existing tests/checks.
2. Characterize the current contract around Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0007 --format prompt`

## JULES-0008 — Physics authority membrane — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-physics-authority`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of physics authority membrane. Exercise the public behavior or ownership seam, not source formatting.

**Context:** physics authority membrane: single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering.

**Inspect:** `src/core/physicsAuthority.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for physics authority membrane and its nearest existing tests/checks.
2. Characterize the current contract around single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for physics authority membrane and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:physics-authority`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0008 --format prompt`

## JULES-0009 — Physics authority membrane — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-physics-authority`

**Objective:** Add a table-driven boundary test for physics authority membrane. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering; do not generate decorative permutations.

**Context:** physics authority membrane: single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering.

**Inspect:** `src/core/physicsAuthority.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for physics authority membrane and its nearest existing tests/checks.
2. Characterize the current contract around single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:physics-authority`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0009 --format prompt`

## JULES-0010 — Rapier collision-world bridge — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-rapier-collision`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of Rapier collision-world bridge. Exercise the public behavior or ownership seam, not source formatting.

**Context:** Rapier collision-world bridge: body registration, collision filtering, teardown, stale handles, and repeatable contact ordering.

**Inspect:** `src/core/rapierCollisionWorld.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Rapier collision-world bridge and its nearest existing tests/checks.
2. Characterize the current contract around body registration, collision filtering, teardown, stale handles, and repeatable contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for Rapier collision-world bridge and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0010 --format prompt`

## JULES-0011 — Rapier collision-world bridge — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-rapier-collision`

**Objective:** Add a table-driven boundary test for Rapier collision-world bridge. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to body registration, collision filtering, teardown, stale handles, and repeatable contact ordering; do not generate decorative permutations.

**Context:** Rapier collision-world bridge: body registration, collision filtering, teardown, stale handles, and repeatable contact ordering.

**Inspect:** `src/core/rapierCollisionWorld.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Rapier collision-world bridge and its nearest existing tests/checks.
2. Characterize the current contract around body registration, collision filtering, teardown, stale handles, and repeatable contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0011 --format prompt`

## JULES-0012 — Spatial hash queries — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-spatial-hash`

**Objective:** Add a table-driven boundary test for spatial hash queries. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order; do not generate decorative permutations.

**Context:** spatial hash queries: cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order.

**Inspect:** `src/core/spatialHash.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for spatial hash queries and its nearest existing tests/checks.
2. Characterize the current contract around cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0012 --format prompt`

## JULES-0013 — Canonical simulation snapshots — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-sim-snapshot`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of canonical simulation snapshots. Exercise the public behavior or ownership seam, not source formatting.

**Context:** canonical simulation snapshots: canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability.

**Inspect:** `src/core/simSnapshot.js` `src/core/sim.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for canonical simulation snapshots and its nearest existing tests/checks.
2. Characterize the current contract around canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for canonical simulation snapshots and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0013 --format prompt`

## JULES-0014 — Canonical simulation snapshots — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-sim-snapshot`

**Objective:** Add a table-driven boundary test for canonical simulation snapshots. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability; do not generate decorative permutations.

**Context:** canonical simulation snapshots: canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability.

**Inspect:** `src/core/simSnapshot.js` `src/core/sim.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for canonical simulation snapshots and its nearest existing tests/checks.
2. Characterize the current contract around canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0014 --format prompt`

## JULES-0015 — Live v3 flight adapter — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-v3`

**Objective:** Add a table-driven boundary test for live V3 flight adapter. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency; do not generate decorative permutations.

**Context:** live V3 flight adapter: input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency.

**Inspect:** `src/systems/flightV3.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live V3 flight adapter and its nearest existing tests/checks.
2. Characterize the current contract around input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0015 --format prompt`

## JULES-0016 — Propulsion kernel — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-propulsion-kernel`

**Objective:** Add a table-driven boundary test for propulsion kernel. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries; do not generate decorative permutations.

**Context:** propulsion kernel: thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries.

**Inspect:** `src/core/flight/propulsionKernel.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for propulsion kernel and its nearest existing tests/checks.
2. Characterize the current contract around thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0016 --format prompt`

## JULES-0017 — Flight telemetry export — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `flight-telemetry`

**Objective:** Add a table-driven boundary test for flight telemetry export. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity; do not generate decorative permutations.

**Context:** flight telemetry export: HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity.

**Inspect:** `src/core/flight/flightTelemetry.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for flight telemetry export and its nearest existing tests/checks.
2. Characterize the current contract around HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0017 --format prompt`

## JULES-0018 — Massline constraint controller — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `massline-controller`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of Massline constraint controller. Exercise the public behavior or ownership seam, not source formatting.

**Context:** Massline constraint controller: near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss.

**Inspect:** `src/core/constraints/masslineController.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Massline constraint controller and its nearest existing tests/checks.
2. Characterize the current contract around near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for Massline constraint controller and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0018 --format prompt`

## JULES-0019 — Massline constraint controller — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `massline-controller`

**Objective:** Add a table-driven boundary test for Massline constraint controller. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss; do not generate decorative permutations.

**Context:** Massline constraint controller: near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss.

**Inspect:** `src/core/constraints/masslineController.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Massline constraint controller and its nearest existing tests/checks.
2. Characterize the current contract around near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0019 --format prompt`

## JULES-0020 — Live input contract — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-input`

**Objective:** Add a table-driven boundary test for live input contract. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset; do not generate decorative permutations.

**Context:** live input contract: raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset.

**Inspect:** `src/systems/input.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live input contract and its nearest existing tests/checks.
2. Characterize the current contract around raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:core:first-ten-minute`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0020 --format prompt`

## JULES-0021 — Tactical ai stack driver — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-stack`

**Objective:** Add a table-driven boundary test for tactical AI stack driver. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence; do not generate decorative permutations.

**Context:** tactical AI stack driver: per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence.

**Inspect:** `src/ai/stack.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for tactical AI stack driver and its nearest existing tests/checks.
2. Characterize the current contract around per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0021 --format prompt`

## JULES-0022 — Ai perception frames — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-perception`

**Objective:** Add a table-driven boundary test for AI perception frames. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering; do not generate decorative permutations.

**Context:** AI perception frames: hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering.

**Inspect:** `src/ai/perception.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI perception frames and its nearest existing tests/checks.
2. Characterize the current contract around hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0022 --format prompt`

## JULES-0023 — Ai engagement authority — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-engagement-authority`

**Objective:** Add a table-driven boundary test for AI engagement authority. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows; do not generate decorative permutations.

**Context:** AI engagement authority: fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI engagement authority and its nearest existing tests/checks.
2. Characterize the current contract around fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0023 --format prompt`

## JULES-0024 — Ai squad target voting — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-squad`

**Objective:** Add a table-driven boundary test for AI squad target voting. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing; do not generate decorative permutations.

**Context:** AI squad target voting: explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing.

**Inspect:** `src/ai/squad.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI squad target voting and its nearest existing tests/checks.
2. Characterize the current contract around explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0024 --format prompt`

## JULES-0025 — Ai action/physics ports — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-ports`

**Objective:** Add a table-driven boundary test for AI action/physics ports. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation; do not generate decorative permutations.

**Context:** AI action/physics ports: decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation.

**Inspect:** `src/systems/aiPorts.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI action/physics ports and its nearest existing tests/checks.
2. Characterize the current contract around decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0025 --format prompt`

## JULES-0026 — Combat kernel — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-kernel`

**Objective:** Add a table-driven boundary test for combat kernel. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution; do not generate decorative permutations.

**Context:** combat kernel: action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution.

**Inspect:** `src/combat/kernel.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat kernel and its nearest existing tests/checks.
2. Characterize the current contract around action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0026 --format prompt`

## JULES-0027 — Damage, status, and subsystem resolution — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-damage-status`

**Objective:** Add a table-driven boundary test for damage, status, and subsystem resolution. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs; do not generate decorative permutations.

**Context:** damage, status, and subsystem resolution: shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs.

**Inspect:** `src/combat/damage.js` `src/combat/statuses.js` `src/combat/subsystems.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for damage, status, and subsystem resolution and its nearest existing tests/checks.
2. Characterize the current contract around shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0027 --format prompt`

## JULES-0028 — Combat attachments and tethers — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-attachments`

**Objective:** Add a table-driven boundary test for combat attachments and tethers. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies; do not generate decorative permutations.

**Context:** combat attachments and tethers: attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies.

**Inspect:** `src/combat/attachments.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat attachments and tethers and its nearest existing tests/checks.
2. Characterize the current contract around attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0028 --format prompt`

## JULES-0029 — Weapon firing system — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-weapons`

**Objective:** Add a table-driven boundary test for weapon firing system. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges; do not generate decorative permutations.

**Context:** weapon firing system: cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges.

**Inspect:** `src/systems/weapons.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for weapon firing system and its nearest existing tests/checks.
2. Characterize the current contract around cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0029 --format prompt`

## JULES-0030 — Beam mining system — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-mining`

**Objective:** Add a table-driven boundary test for beam mining system. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup; do not generate decorative permutations.

**Context:** beam mining system: seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup.

**Inspect:** `src/systems/mining.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for beam mining system and its nearest existing tests/checks.
2. Characterize the current contract around seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0030 --format prompt`

## JULES-0031 — Cargo single-writer api — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-cargo`

**Objective:** Add a table-driven boundary test for cargo single-writer API. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission; do not generate decorative permutations.

**Context:** cargo single-writer API: volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission.

**Inspect:** `src/systems/cargo.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for cargo single-writer API and its nearest existing tests/checks.
2. Characterize the current contract around volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0031 --format prompt`

## JULES-0032 — Market and credit economy — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-economy`

**Objective:** Add a table-driven boundary test for market and credit economy. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers; do not generate decorative permutations.

**Context:** market and credit economy: single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers.

**Inspect:** `src/systems/economy.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for market and credit economy and its nearest existing tests/checks.
2. Characterize the current contract around single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0032 --format prompt`

## JULES-0033 — World and sector runtime — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-world`

**Objective:** Add a table-driven boundary test for world and sector runtime. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave; do not generate decorative permutations.

**Context:** world and sector runtime: sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave.

**Inspect:** `src/systems/world.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for world and sector runtime and its nearest existing tests/checks.
2. Characterize the current contract around sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0033 --format prompt`

## JULES-0034 — Faction reputation writer — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-factions`

**Objective:** Add a table-driven boundary test for faction reputation writer. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff; do not generate decorative permutations.

**Context:** faction reputation writer: rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff.

**Inspect:** `src/systems/factions.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for faction reputation writer and its nearest existing tests/checks.
2. Characterize the current contract around rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0034 --format prompt`

## JULES-0035 — Mission board and objective engine — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-missions`

**Objective:** Add a table-driven boundary test for mission board and objective engine. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload; do not generate decorative permutations.

**Context:** mission board and objective engine: deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload.

**Inspect:** `src/systems/missions.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for mission board and objective engine and its nearest existing tests/checks.
2. Characterize the current contract around deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0035 --format prompt`

## JULES-0036 — First-hour onboarding arbiter — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `systems-onboarding`

**Objective:** Add a table-driven boundary test for first-hour onboarding arbiter. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes; do not generate decorative permutations.

**Context:** first-hour onboarding arbiter: one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes.

**Inspect:** `src/systems/onboarding.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for first-hour onboarding arbiter and its nearest existing tests/checks.
2. Characterize the current contract around one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0036 --format prompt`

## JULES-0037 — Versioned save system — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `save-system`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of versioned save system. Exercise the public behavior or ownership seam, not source formatting.

**Context:** versioned save system: migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for versioned save system and its nearest existing tests/checks.
2. Characterize the current contract around migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for versioned save system and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0037 --format prompt`

## JULES-0038 — Versioned save system — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `save-system`

**Objective:** Add a table-driven boundary test for versioned save system. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup; do not generate decorative permutations.

**Context:** versioned save system: migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for versioned save system and its nearest existing tests/checks.
2. Characterize the current contract around migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0038 --format prompt`

## JULES-0039 — Screen manager pause ownership — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-screen-manager`

**Objective:** Add a table-driven boundary test for screen manager pause ownership. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup; do not generate decorative permutations.

**Context:** screen manager pause ownership: nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup.

**Inspect:** `src/ui/screenManager.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for screen manager pause ownership and its nearest existing tests/checks.
2. Characterize the current contract around nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0039 --format prompt`

## JULES-0040 — Authored asset loader — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `render-asset-loader`

**Objective:** Add a table-driven boundary test for authored asset loader. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads; do not generate decorative permutations.

**Context:** authored asset loader: contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `build_map.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for authored asset loader and its nearest existing tests/checks.
2. Characterize the current contract around contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The cases name the semantic boundary being protected and include at least one value immediately on each side of it.
- Assertions target public state, emitted intent, or owned output rather than implementation line structure.
- Invalid input either fails closed or normalizes exactly as the live contract requires.
- The test is deterministic and does not use wall-clock sleeps.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0040 --format prompt`
