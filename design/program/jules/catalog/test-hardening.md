<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# Deterministic test hardening

Add focused, behavior-level regression coverage around live ownership seams without manufacturing implementation changes.

**Tasks:** 170 · **Range:** `JULES-0001`–`JULES-0170`

## JULES-0001 — Event bus subscription and emission — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** xs · **Collision:** `core-event-bus`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of event bus subscription and emission. Exercise the public behavior or ownership seam, not source formatting.

**Context:** event bus subscription and emission: listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

## JULES-0003 — Event bus subscription and emission — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-event-bus`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes event bus subscription and emission. Target duplicate subscriptions, retained state, stale resources, or double publication in listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation.

**Context:** event bus subscription and emission: listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for event bus subscription and emission and its nearest existing tests/checks.
2. Characterize the current contract around listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0003 --format prompt`

## JULES-0004 — Event bus subscription and emission — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-event-bus`

**Objective:** Add adversarial regression coverage for event bus subscription and emission using the most plausible stale, missing, duplicated, or out-of-order state implied by listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** event bus subscription and emission: listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for event bus subscription and emission and its nearest existing tests/checks.
2. Characterize the current contract around listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0004 --format prompt`

## JULES-0005 — Event bus subscription and emission — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-event-bus`

**Objective:** Add a small deterministic seed/order sweep for event bus subscription and emission. Define one invariant from listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** event bus subscription and emission: listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for event bus subscription and emission and its nearest existing tests/checks.
2. Characterize the current contract around listener ownership, duplicate subscription, unsubscribe behavior, and event payload isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0005 --format prompt`

## JULES-0006 — System registry and update ordering — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-registry`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of system registry and update ordering. Exercise the public behavior or ownership seam, not source formatting.

**Context:** system registry and update ordering: selected backend registration, update-order stability, init ordering, and duplicate system names.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for system registry and update ordering and its nearest existing tests/checks.
2. Characterize the current contract around selected backend registration, update-order stability, init ordering, and duplicate system names before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for system registry and update ordering and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0006 --format prompt`

## JULES-0007 — System registry and update ordering — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-registry`

**Objective:** Add a table-driven boundary test for system registry and update ordering. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to selected backend registration, update-order stability, init ordering, and duplicate system names; do not generate decorative permutations.

**Context:** system registry and update ordering: selected backend registration, update-order stability, init ordering, and duplicate system names.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0007 --format prompt`

## JULES-0008 — System registry and update ordering — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-registry`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes system registry and update ordering. Target duplicate subscriptions, retained state, stale resources, or double publication in selected backend registration, update-order stability, init ordering, and duplicate system names.

**Context:** system registry and update ordering: selected backend registration, update-order stability, init ordering, and duplicate system names.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for system registry and update ordering and its nearest existing tests/checks.
2. Characterize the current contract around selected backend registration, update-order stability, init ordering, and duplicate system names before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0008 --format prompt`

## JULES-0009 — System registry and update ordering — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-registry`

**Objective:** Add adversarial regression coverage for system registry and update ordering using the most plausible stale, missing, duplicated, or out-of-order state implied by selected backend registration, update-order stability, init ordering, and duplicate system names. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** system registry and update ordering: selected backend registration, update-order stability, init ordering, and duplicate system names.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for system registry and update ordering and its nearest existing tests/checks.
2. Characterize the current contract around selected backend registration, update-order stability, init ordering, and duplicate system names before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0009 --format prompt`

## JULES-0010 — System registry and update ordering — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-registry`

**Objective:** Add a small deterministic seed/order sweep for system registry and update ordering. Define one invariant from selected backend registration, update-order stability, init ordering, and duplicate system names, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** system registry and update ordering: selected backend registration, update-order stability, init ordering, and duplicate system names.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for system registry and update ordering and its nearest existing tests/checks.
2. Characterize the current contract around selected backend registration, update-order stability, init ordering, and duplicate system names before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0010 --format prompt`

## JULES-0011 — Fixed-timestep loop — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-loop`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of fixed-timestep loop. Exercise the public behavior or ownership seam, not source formatting.

**Context:** fixed-timestep loop: accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop.

**Inspect:** `src/core/loop.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for fixed-timestep loop and its nearest existing tests/checks.
2. Characterize the current contract around accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for fixed-timestep loop and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0011 --format prompt`

## JULES-0012 — Fixed-timestep loop — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-loop`

**Objective:** Add a table-driven boundary test for fixed-timestep loop. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop; do not generate decorative permutations.

**Context:** fixed-timestep loop: accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop.

**Inspect:** `src/core/loop.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0012 --format prompt`

## JULES-0013 — Fixed-timestep loop — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-loop`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes fixed-timestep loop. Target duplicate subscriptions, retained state, stale resources, or double publication in accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop.

**Context:** fixed-timestep loop: accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop.

**Inspect:** `src/core/loop.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for fixed-timestep loop and its nearest existing tests/checks.
2. Characterize the current contract around accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0013 --format prompt`

## JULES-0014 — Fixed-timestep loop — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-loop`

**Objective:** Add adversarial regression coverage for fixed-timestep loop using the most plausible stale, missing, duplicated, or out-of-order state implied by accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** fixed-timestep loop: accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop.

**Inspect:** `src/core/loop.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for fixed-timestep loop and its nearest existing tests/checks.
2. Characterize the current contract around accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0014 --format prompt`

## JULES-0015 — Fixed-timestep loop — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-loop`

**Objective:** Add a small deterministic seed/order sweep for fixed-timestep loop. Define one invariant from accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** fixed-timestep loop: accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop.

**Inspect:** `src/core/loop.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for fixed-timestep loop and its nearest existing tests/checks.
2. Characterize the current contract around accumulator bounds, pause/resume, long-frame recovery, render/sim separation, and repeated start/stop before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0015 --format prompt`

## JULES-0016 — Time-effect arbitration — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** xs · **Collision:** `core-time-effects`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of time-effect arbitration. Exercise the public behavior or ownership seam, not source formatting.

**Context:** time-effect arbitration: minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization.

**Inspect:** `src/core/timeEffects.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for time-effect arbitration and its nearest existing tests/checks.
2. Characterize the current contract around minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for time-effect arbitration and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:time-effects`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0016 --format prompt`

## JULES-0017 — Time-effect arbitration — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-time-effects`

**Objective:** Add a table-driven boundary test for time-effect arbitration. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization; do not generate decorative permutations.

**Context:** time-effect arbitration: minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization.

**Inspect:** `src/core/timeEffects.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0017 --format prompt`

## JULES-0018 — Time-effect arbitration — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-time-effects`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes time-effect arbitration. Target duplicate subscriptions, retained state, stale resources, or double publication in minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization.

**Context:** time-effect arbitration: minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization.

**Inspect:** `src/core/timeEffects.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for time-effect arbitration and its nearest existing tests/checks.
2. Characterize the current contract around minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:time-effects`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0018 --format prompt`

## JULES-0019 — Time-effect arbitration — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-time-effects`

**Objective:** Add adversarial regression coverage for time-effect arbitration using the most plausible stale, missing, duplicated, or out-of-order state implied by minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** time-effect arbitration: minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization.

**Inspect:** `src/core/timeEffects.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for time-effect arbitration and its nearest existing tests/checks.
2. Characterize the current contract around minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:time-effects`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0019 --format prompt`

## JULES-0020 — Time-effect arbitration — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-time-effects`

**Objective:** Add a small deterministic seed/order sweep for time-effect arbitration. Define one invariant from minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** time-effect arbitration: minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization.

**Inspect:** `src/core/timeEffects.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for time-effect arbitration and its nearest existing tests/checks.
2. Characterize the current contract around minimum-request wins semantics, owner-scoped clear, pause nesting, stale requests, and restore normalization before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:time-effects`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0020 --format prompt`

## JULES-0021 — New-game/load transition guard — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-transition-guard`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of new-game/load transition guard. Exercise the public behavior or ownership seam, not source formatting.

**Context:** new-game/load transition guard: monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance.

**Inspect:** `src/core/runTransitionGuard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for new-game/load transition guard and its nearest existing tests/checks.
2. Characterize the current contract around monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for new-game/load transition guard and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0021 --format prompt`

## JULES-0022 — New-game/load transition guard — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-transition-guard`

**Objective:** Add a table-driven boundary test for new-game/load transition guard. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance; do not generate decorative permutations.

**Context:** new-game/load transition guard: monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance.

**Inspect:** `src/core/runTransitionGuard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0022 --format prompt`

## JULES-0023 — New-game/load transition guard — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-transition-guard`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes new-game/load transition guard. Target duplicate subscriptions, retained state, stale resources, or double publication in monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance.

**Context:** new-game/load transition guard: monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance.

**Inspect:** `src/core/runTransitionGuard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for new-game/load transition guard and its nearest existing tests/checks.
2. Characterize the current contract around monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0023 --format prompt`

## JULES-0024 — New-game/load transition guard — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-transition-guard`

**Objective:** Add adversarial regression coverage for new-game/load transition guard using the most plausible stale, missing, duplicated, or out-of-order state implied by monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** new-game/load transition guard: monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance.

**Inspect:** `src/core/runTransitionGuard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for new-game/load transition guard and its nearest existing tests/checks.
2. Characterize the current contract around monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0024 --format prompt`

## JULES-0025 — New-game/load transition guard — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-transition-guard`

**Objective:** Add a small deterministic seed/order sweep for new-game/load transition guard. Define one invariant from monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** new-game/load transition guard: monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance.

**Inspect:** `src/core/runTransitionGuard.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for new-game/load transition guard and its nearest existing tests/checks.
2. Characterize the current contract around monotonic token ownership, stale async completion rejection, one-shot commit, and forged token resistance before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0025 --format prompt`

## JULES-0026 — Entity store lifecycle — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** xs · **Collision:** `core-entity-store`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of entity store lifecycle. Exercise the public behavior or ownership seam, not source formatting.

**Context:** entity store lifecycle: Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references.

**Inspect:** `src/core/entity.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for entity store lifecycle and its nearest existing tests/checks.
2. Characterize the current contract around Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for entity store lifecycle and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0026 --format prompt`

## JULES-0027 — Entity store lifecycle — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-entity-store`

**Objective:** Add a table-driven boundary test for entity store lifecycle. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references; do not generate decorative permutations.

**Context:** entity store lifecycle: Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references.

**Inspect:** `src/core/entity.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0027 --format prompt`

## JULES-0028 — Entity store lifecycle — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-entity-store`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes entity store lifecycle. Target duplicate subscriptions, retained state, stale resources, or double publication in Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references.

**Context:** entity store lifecycle: Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references.

**Inspect:** `src/core/entity.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for entity store lifecycle and its nearest existing tests/checks.
2. Characterize the current contract around Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0028 --format prompt`

## JULES-0029 — Entity store lifecycle — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-entity-store`

**Objective:** Add adversarial regression coverage for entity store lifecycle using the most plausible stale, missing, duplicated, or out-of-order state implied by Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** entity store lifecycle: Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references.

**Inspect:** `src/core/entity.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for entity store lifecycle and its nearest existing tests/checks.
2. Characterize the current contract around Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0029 --format prompt`

## JULES-0030 — Entity store lifecycle — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-entity-store`

**Objective:** Add a small deterministic seed/order sweep for entity store lifecycle. Define one invariant from Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** entity store lifecycle: Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references.

**Inspect:** `src/core/entity.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for entity store lifecycle and its nearest existing tests/checks.
2. Characterize the current contract around Map/list coherence, duplicate IDs, removal during iteration, derived indexes, and stale references before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0030 --format prompt`

## JULES-0031 — Physics authority membrane — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-physics-authority`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of physics authority membrane. Exercise the public behavior or ownership seam, not source formatting.

**Context:** physics authority membrane: single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering.

**Inspect:** `src/core/physicsAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0031 --format prompt`

## JULES-0032 — Physics authority membrane — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-physics-authority`

**Objective:** Add a table-driven boundary test for physics authority membrane. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering; do not generate decorative permutations.

**Context:** physics authority membrane: single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering.

**Inspect:** `src/core/physicsAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0032 --format prompt`

## JULES-0033 — Physics authority membrane — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-physics-authority`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes physics authority membrane. Target duplicate subscriptions, retained state, stale resources, or double publication in single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering.

**Context:** physics authority membrane: single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering.

**Inspect:** `src/core/physicsAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for physics authority membrane and its nearest existing tests/checks.
2. Characterize the current contract around single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:physics-authority`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0033 --format prompt`

## JULES-0034 — Physics authority membrane — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-physics-authority`

**Objective:** Add adversarial regression coverage for physics authority membrane using the most plausible stale, missing, duplicated, or out-of-order state implied by single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** physics authority membrane: single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering.

**Inspect:** `src/core/physicsAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for physics authority membrane and its nearest existing tests/checks.
2. Characterize the current contract around single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:physics-authority`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0034 --format prompt`

## JULES-0035 — Physics authority membrane — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-physics-authority`

**Objective:** Add a small deterministic seed/order sweep for physics authority membrane. Define one invariant from single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** physics authority membrane: single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering.

**Inspect:** `src/core/physicsAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for physics authority membrane and its nearest existing tests/checks.
2. Characterize the current contract around single-writer force/torque/impulse ownership, invalid body commands, remove/recreate behavior, and command ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:physics-authority`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0035 --format prompt`

## JULES-0036 — Rapier collision-world bridge — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-rapier-collision`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of Rapier collision-world bridge. Exercise the public behavior or ownership seam, not source formatting.

**Context:** Rapier collision-world bridge: body registration, collision filtering, teardown, stale handles, and repeatable contact ordering.

**Inspect:** `src/core/rapierCollisionWorld.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0036 --format prompt`

## JULES-0037 — Rapier collision-world bridge — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-rapier-collision`

**Objective:** Add a table-driven boundary test for Rapier collision-world bridge. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to body registration, collision filtering, teardown, stale handles, and repeatable contact ordering; do not generate decorative permutations.

**Context:** Rapier collision-world bridge: body registration, collision filtering, teardown, stale handles, and repeatable contact ordering.

**Inspect:** `src/core/rapierCollisionWorld.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0037 --format prompt`

## JULES-0038 — Rapier collision-world bridge — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-rapier-collision`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes Rapier collision-world bridge. Target duplicate subscriptions, retained state, stale resources, or double publication in body registration, collision filtering, teardown, stale handles, and repeatable contact ordering.

**Context:** Rapier collision-world bridge: body registration, collision filtering, teardown, stale handles, and repeatable contact ordering.

**Inspect:** `src/core/rapierCollisionWorld.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Rapier collision-world bridge and its nearest existing tests/checks.
2. Characterize the current contract around body registration, collision filtering, teardown, stale handles, and repeatable contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0038 --format prompt`

## JULES-0039 — Rapier collision-world bridge — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-rapier-collision`

**Objective:** Add adversarial regression coverage for Rapier collision-world bridge using the most plausible stale, missing, duplicated, or out-of-order state implied by body registration, collision filtering, teardown, stale handles, and repeatable contact ordering. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** Rapier collision-world bridge: body registration, collision filtering, teardown, stale handles, and repeatable contact ordering.

**Inspect:** `src/core/rapierCollisionWorld.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Rapier collision-world bridge and its nearest existing tests/checks.
2. Characterize the current contract around body registration, collision filtering, teardown, stale handles, and repeatable contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0039 --format prompt`

## JULES-0040 — Rapier collision-world bridge — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-rapier-collision`

**Objective:** Add a small deterministic seed/order sweep for Rapier collision-world bridge. Define one invariant from body registration, collision filtering, teardown, stale handles, and repeatable contact ordering, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** Rapier collision-world bridge: body registration, collision filtering, teardown, stale handles, and repeatable contact ordering.

**Inspect:** `src/core/rapierCollisionWorld.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Rapier collision-world bridge and its nearest existing tests/checks.
2. Characterize the current contract around body registration, collision filtering, teardown, stale handles, and repeatable contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0040 --format prompt`

## JULES-0041 — Spatial hash queries — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** xs · **Collision:** `core-spatial-hash`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of spatial hash queries. Exercise the public behavior or ownership seam, not source formatting.

**Context:** spatial hash queries: cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order.

**Inspect:** `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for spatial hash queries and its nearest existing tests/checks.
2. Characterize the current contract around cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for spatial hash queries and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0041 --format prompt`

## JULES-0042 — Spatial hash queries — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-spatial-hash`

**Objective:** Add a table-driven boundary test for spatial hash queries. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order; do not generate decorative permutations.

**Context:** spatial hash queries: cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order.

**Inspect:** `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0042 --format prompt`

## JULES-0043 — Spatial hash queries — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-spatial-hash`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes spatial hash queries. Target duplicate subscriptions, retained state, stale resources, or double publication in cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order.

**Context:** spatial hash queries: cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order.

**Inspect:** `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for spatial hash queries and its nearest existing tests/checks.
2. Characterize the current contract around cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0043 --format prompt`

## JULES-0044 — Spatial hash queries — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-spatial-hash`

**Objective:** Add adversarial regression coverage for spatial hash queries using the most plausible stale, missing, duplicated, or out-of-order state implied by cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** spatial hash queries: cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order.

**Inspect:** `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for spatial hash queries and its nearest existing tests/checks.
2. Characterize the current contract around cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0044 --format prompt`

## JULES-0045 — Spatial hash queries — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `core-spatial-hash`

**Objective:** Add a small deterministic seed/order sweep for spatial hash queries. Define one invariant from cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** spatial hash queries: cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order.

**Inspect:** `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for spatial hash queries and its nearest existing tests/checks.
2. Characterize the current contract around cell boundaries, negative coordinates, insert/update/remove, duplicate results, and deterministic query order before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0045 --format prompt`

## JULES-0046 — Canonical simulation snapshots — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `core-sim-snapshot`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of canonical simulation snapshots. Exercise the public behavior or ownership seam, not source formatting.

**Context:** canonical simulation snapshots: canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability.

**Inspect:** `src/core/simSnapshot.js`, `src/core/sim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0046 --format prompt`

## JULES-0047 — Canonical simulation snapshots — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-sim-snapshot`

**Objective:** Add a table-driven boundary test for canonical simulation snapshots. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability; do not generate decorative permutations.

**Context:** canonical simulation snapshots: canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability.

**Inspect:** `src/core/simSnapshot.js`, `src/core/sim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0047 --format prompt`

## JULES-0048 — Canonical simulation snapshots — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-sim-snapshot`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes canonical simulation snapshots. Target duplicate subscriptions, retained state, stale resources, or double publication in canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability.

**Context:** canonical simulation snapshots: canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability.

**Inspect:** `src/core/simSnapshot.js`, `src/core/sim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for canonical simulation snapshots and its nearest existing tests/checks.
2. Characterize the current contract around canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0048 --format prompt`

## JULES-0049 — Canonical simulation snapshots — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-sim-snapshot`

**Objective:** Add adversarial regression coverage for canonical simulation snapshots using the most plausible stale, missing, duplicated, or out-of-order state implied by canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** canonical simulation snapshots: canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability.

**Inspect:** `src/core/simSnapshot.js`, `src/core/sim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for canonical simulation snapshots and its nearest existing tests/checks.
2. Characterize the current contract around canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0049 --format prompt`

## JULES-0050 — Canonical simulation snapshots — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `core-sim-snapshot`

**Objective:** Add a small deterministic seed/order sweep for canonical simulation snapshots. Define one invariant from canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** canonical simulation snapshots: canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability.

**Inspect:** `src/core/simSnapshot.js`, `src/core/sim.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for canonical simulation snapshots and its nearest existing tests/checks.
2. Characterize the current contract around canonical ordering, ephemeral-field exclusion, Map/Set normalization, reload equivalence, and hash stability before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0050 --format prompt`

## JULES-0051 — Live v3 flight adapter — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `flight-v3`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of live V3 flight adapter. Exercise the public behavior or ownership seam, not source formatting.

**Context:** live V3 flight adapter: input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency.

**Inspect:** `src/systems/flightV3.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live V3 flight adapter and its nearest existing tests/checks.
2. Characterize the current contract around input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for live V3 flight adapter and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0051 --format prompt`

## JULES-0052 — Live v3 flight adapter — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-v3`

**Objective:** Add a table-driven boundary test for live V3 flight adapter. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency; do not generate decorative permutations.

**Context:** live V3 flight adapter: input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency.

**Inspect:** `src/systems/flightV3.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0052 --format prompt`

## JULES-0053 — Live v3 flight adapter — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-v3`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes live V3 flight adapter. Target duplicate subscriptions, retained state, stale resources, or double publication in input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency.

**Context:** live V3 flight adapter: input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency.

**Inspect:** `src/systems/flightV3.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live V3 flight adapter and its nearest existing tests/checks.
2. Characterize the current contract around input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0053 --format prompt`

## JULES-0054 — Live v3 flight adapter — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-v3`

**Objective:** Add adversarial regression coverage for live V3 flight adapter using the most plausible stale, missing, duplicated, or out-of-order state implied by input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** live V3 flight adapter: input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency.

**Inspect:** `src/systems/flightV3.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live V3 flight adapter and its nearest existing tests/checks.
2. Characterize the current contract around input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0054 --format prompt`

## JULES-0055 — Live v3 flight adapter — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-v3`

**Objective:** Add a small deterministic seed/order sweep for live V3 flight adapter. Define one invariant from input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** live V3 flight adapter: input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency.

**Inspect:** `src/systems/flightV3.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live V3 flight adapter and its nearest existing tests/checks.
2. Characterize the current contract around input-to-force translation, backend selection, disabled/destroyed states, zero-thrust behavior, and telemetry consistency before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0055 --format prompt`

## JULES-0056 — Propulsion kernel — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `flight-propulsion-kernel`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of propulsion kernel. Exercise the public behavior or ownership seam, not source formatting.

**Context:** propulsion kernel: thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries.

**Inspect:** `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for propulsion kernel and its nearest existing tests/checks.
2. Characterize the current contract around thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for propulsion kernel and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0056 --format prompt`

## JULES-0057 — Propulsion kernel — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-propulsion-kernel`

**Objective:** Add a table-driven boundary test for propulsion kernel. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries; do not generate decorative permutations.

**Context:** propulsion kernel: thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries.

**Inspect:** `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0057 --format prompt`

## JULES-0058 — Propulsion kernel — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-propulsion-kernel`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes propulsion kernel. Target duplicate subscriptions, retained state, stale resources, or double publication in thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries.

**Context:** propulsion kernel: thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries.

**Inspect:** `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for propulsion kernel and its nearest existing tests/checks.
2. Characterize the current contract around thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0058 --format prompt`

## JULES-0059 — Propulsion kernel — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-propulsion-kernel`

**Objective:** Add adversarial regression coverage for propulsion kernel using the most plausible stale, missing, duplicated, or out-of-order state implied by thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** propulsion kernel: thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries.

**Inspect:** `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for propulsion kernel and its nearest existing tests/checks.
2. Characterize the current contract around thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0059 --format prompt`

## JULES-0060 — Propulsion kernel — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `flight-propulsion-kernel`

**Objective:** Add a small deterministic seed/order sweep for propulsion kernel. Define one invariant from thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** propulsion kernel: thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries.

**Inspect:** `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for propulsion kernel and its nearest existing tests/checks.
2. Characterize the current contract around thrust/drag integration, coasting yaw multiplier, mass scaling, reverse braking, and timestep boundaries before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:handling-profile`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0060 --format prompt`

## JULES-0061 — Flight telemetry export — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** xs · **Collision:** `flight-telemetry`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of flight telemetry export. Exercise the public behavior or ownership seam, not source formatting.

**Context:** flight telemetry export: HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity.

**Inspect:** `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for flight telemetry export and its nearest existing tests/checks.
2. Characterize the current contract around HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for flight telemetry export and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0061 --format prompt`

## JULES-0062 — Flight telemetry export — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `flight-telemetry`

**Objective:** Add a table-driven boundary test for flight telemetry export. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity; do not generate decorative permutations.

**Context:** flight telemetry export: HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity.

**Inspect:** `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0062 --format prompt`

## JULES-0063 — Flight telemetry export — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `flight-telemetry`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes flight telemetry export. Target duplicate subscriptions, retained state, stale resources, or double publication in HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity.

**Context:** flight telemetry export: HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity.

**Inspect:** `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for flight telemetry export and its nearest existing tests/checks.
2. Characterize the current contract around HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0063 --format prompt`

## JULES-0064 — Flight telemetry export — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `flight-telemetry`

**Objective:** Add adversarial regression coverage for flight telemetry export using the most plausible stale, missing, duplicated, or out-of-order state implied by HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** flight telemetry export: HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity.

**Inspect:** `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for flight telemetry export and its nearest existing tests/checks.
2. Characterize the current contract around HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0064 --format prompt`

## JULES-0065 — Flight telemetry export — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `flight-telemetry`

**Objective:** Add a small deterministic seed/order sweep for flight telemetry export. Define one invariant from HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** flight telemetry export: HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity.

**Inspect:** `src/core/flight/flightTelemetry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for flight telemetry export and its nearest existing tests/checks.
2. Characterize the current contract around HUD-facing speed/heading/acceleration values, missing entity handling, stale samples, and backend parity before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0065 --format prompt`

## JULES-0066 — Massline constraint controller — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `massline-controller`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of Massline constraint controller. Exercise the public behavior or ownership seam, not source formatting.

**Context:** Massline constraint controller: near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss.

**Inspect:** `src/core/constraints/masslineController.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0066 --format prompt`

## JULES-0067 — Massline constraint controller — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `massline-controller`

**Objective:** Add a table-driven boundary test for Massline constraint controller. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss; do not generate decorative permutations.

**Context:** Massline constraint controller: near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss.

**Inspect:** `src/core/constraints/masslineController.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0067 --format prompt`

## JULES-0068 — Massline constraint controller — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `massline-controller`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes Massline constraint controller. Target duplicate subscriptions, retained state, stale resources, or double publication in near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss.

**Context:** Massline constraint controller: near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss.

**Inspect:** `src/core/constraints/masslineController.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Massline constraint controller and its nearest existing tests/checks.
2. Characterize the current contract around near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0068 --format prompt`

## JULES-0069 — Massline constraint controller — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `massline-controller`

**Objective:** Add adversarial regression coverage for Massline constraint controller using the most plausible stale, missing, duplicated, or out-of-order state implied by near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** Massline constraint controller: near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss.

**Inspect:** `src/core/constraints/masslineController.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Massline constraint controller and its nearest existing tests/checks.
2. Characterize the current contract around near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0069 --format prompt`

## JULES-0070 — Massline constraint controller — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `massline-controller`

**Objective:** Add a small deterministic seed/order sweep for Massline constraint controller. Define one invariant from near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** Massline constraint controller: near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss.

**Inspect:** `src/core/constraints/masslineController.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for Massline constraint controller and its nearest existing tests/checks.
2. Characterize the current contract around near-unbreakable standard line, explicit overload opt-in, reel/pay-out bounds, slack catch, and endpoint loss before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0070 --format prompt`

## JULES-0071 — Live input contract — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `systems-input`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of live input contract. Exercise the public behavior or ownership seam, not source formatting.

**Context:** live input contract: raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset.

**Inspect:** `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live input contract and its nearest existing tests/checks.
2. Characterize the current contract around raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for live input contract and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:core:first-ten-minute`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0071 --format prompt`

## JULES-0072 — Live input contract — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-input`

**Objective:** Add a table-driven boundary test for live input contract. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset; do not generate decorative permutations.

**Context:** live input contract: raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset.

**Inspect:** `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0072 --format prompt`

## JULES-0073 — Live input contract — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-input`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes live input contract. Target duplicate subscriptions, retained state, stale resources, or double publication in raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset.

**Context:** live input contract: raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset.

**Inspect:** `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live input contract and its nearest existing tests/checks.
2. Characterize the current contract around raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:core:first-ten-minute`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0073 --format prompt`

## JULES-0074 — Live input contract — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-input`

**Objective:** Add adversarial regression coverage for live input contract using the most plausible stale, missing, duplicated, or out-of-order state implied by raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** live input contract: raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset.

**Inspect:** `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live input contract and its nearest existing tests/checks.
2. Characterize the current contract around raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:core:first-ten-minute`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0074 --format prompt`

## JULES-0075 — Live input contract — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-input`

**Objective:** Add a small deterministic seed/order sweep for live input contract. Define one invariant from raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** live input contract: raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset.

**Inspect:** `src/systems/input.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for live input contract and its nearest existing tests/checks.
2. Characterize the current contract around raw axes, action edges, tap/hold timing, scheme-specific bindings, remap persistence, and focus-loss reset before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:core:first-ten-minute`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0075 --format prompt`

## JULES-0076 — Tactical ai stack driver — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `ai-stack`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of tactical AI stack driver. Exercise the public behavior or ownership seam, not source formatting.

**Context:** tactical AI stack driver: per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence.

**Inspect:** `src/ai/stack.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for tactical AI stack driver and its nearest existing tests/checks.
2. Characterize the current contract around per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for tactical AI stack driver and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0076 --format prompt`

## JULES-0077 — Tactical ai stack driver — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-stack`

**Objective:** Add a table-driven boundary test for tactical AI stack driver. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence; do not generate decorative permutations.

**Context:** tactical AI stack driver: per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence.

**Inspect:** `src/ai/stack.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0077 --format prompt`

## JULES-0078 — Tactical ai stack driver — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-stack`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes tactical AI stack driver. Target duplicate subscriptions, retained state, stale resources, or double publication in per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence.

**Context:** tactical AI stack driver: per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence.

**Inspect:** `src/ai/stack.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for tactical AI stack driver and its nearest existing tests/checks.
2. Characterize the current contract around per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0078 --format prompt`

## JULES-0079 — Tactical ai stack driver — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-stack`

**Objective:** Add adversarial regression coverage for tactical AI stack driver using the most plausible stale, missing, duplicated, or out-of-order state implied by per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** tactical AI stack driver: per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence.

**Inspect:** `src/ai/stack.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for tactical AI stack driver and its nearest existing tests/checks.
2. Characterize the current contract around per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0079 --format prompt`

## JULES-0080 — Tactical ai stack driver — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-stack`

**Objective:** Add a small deterministic seed/order sweep for tactical AI stack driver. Define one invariant from per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** tactical AI stack driver: per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence.

**Inspect:** `src/ai/stack.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for tactical AI stack driver and its nearest existing tests/checks.
2. Characterize the current contract around per-tick orchestration, missing actor state, disabled actors, repeated init, and deterministic decision cadence before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0080 --format prompt`

## JULES-0081 — Ai perception frames — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `ai-perception`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of AI perception frames. Exercise the public behavior or ownership seam, not source formatting.

**Context:** AI perception frames: hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering.

**Inspect:** `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI perception frames and its nearest existing tests/checks.
2. Characterize the current contract around hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for AI perception frames and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0081 --format prompt`

## JULES-0082 — Ai perception frames — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-perception`

**Objective:** Add a table-driven boundary test for AI perception frames. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering; do not generate decorative permutations.

**Context:** AI perception frames: hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering.

**Inspect:** `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0082 --format prompt`

## JULES-0083 — Ai perception frames — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-perception`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes AI perception frames. Target duplicate subscriptions, retained state, stale resources, or double publication in hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering.

**Context:** AI perception frames: hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering.

**Inspect:** `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI perception frames and its nearest existing tests/checks.
2. Characterize the current contract around hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0083 --format prompt`

## JULES-0084 — Ai perception frames — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-perception`

**Objective:** Add adversarial regression coverage for AI perception frames using the most plausible stale, missing, duplicated, or out-of-order state implied by hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** AI perception frames: hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering.

**Inspect:** `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI perception frames and its nearest existing tests/checks.
2. Characterize the current contract around hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0084 --format prompt`

## JULES-0085 — Ai perception frames — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-perception`

**Objective:** Add a small deterministic seed/order sweep for AI perception frames. Define one invariant from hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** AI perception frames: hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering.

**Inspect:** `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI perception frames and its nearest existing tests/checks.
2. Characterize the current contract around hostility classification inputs, visibility, stale contacts, self-exclusion, and deterministic contact ordering before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0085 --format prompt`

## JULES-0086 — Ai engagement authority — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `ai-engagement-authority`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of AI engagement authority. Exercise the public behavior or ownership seam, not source formatting.

**Context:** AI engagement authority: fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI engagement authority and its nearest existing tests/checks.
2. Characterize the current contract around fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for AI engagement authority and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0086 --format prompt`

## JULES-0087 — Ai engagement authority — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-engagement-authority`

**Objective:** Add a table-driven boundary test for AI engagement authority. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows; do not generate decorative permutations.

**Context:** AI engagement authority: fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0087 --format prompt`

## JULES-0088 — Ai engagement authority — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-engagement-authority`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes AI engagement authority. Target duplicate subscriptions, retained state, stale resources, or double publication in fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows.

**Context:** AI engagement authority: fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI engagement authority and its nearest existing tests/checks.
2. Characterize the current contract around fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0088 --format prompt`

## JULES-0089 — Ai engagement authority — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-engagement-authority`

**Objective:** Add adversarial regression coverage for AI engagement authority using the most plausible stale, missing, duplicated, or out-of-order state implied by fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** AI engagement authority: fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI engagement authority and its nearest existing tests/checks.
2. Characterize the current contract around fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0089 --format prompt`

## JULES-0090 — Ai engagement authority — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-engagement-authority`

**Objective:** Add a small deterministic seed/order sweep for AI engagement authority. Define one invariant from fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** AI engagement authority: fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows.

**Inspect:** `src/ai/engagementAuthority.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI engagement authority and its nearest existing tests/checks.
2. Characterize the current contract around fail-closed fire authorization, lawful/WANTED behavior, first-fire ownership, jurisdiction, and response windows before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:47a:tactics`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0090 --format prompt`

## JULES-0091 — Ai squad target voting — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `ai-squad`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of AI squad target voting. Exercise the public behavior or ownership seam, not source formatting.

**Context:** AI squad target voting: explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing.

**Inspect:** `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI squad target voting and its nearest existing tests/checks.
2. Characterize the current contract around explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for AI squad target voting and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0091 --format prompt`

## JULES-0092 — Ai squad target voting — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-squad`

**Objective:** Add a table-driven boundary test for AI squad target voting. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing; do not generate decorative permutations.

**Context:** AI squad target voting: explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing.

**Inspect:** `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0092 --format prompt`

## JULES-0093 — Ai squad target voting — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-squad`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes AI squad target voting. Target duplicate subscriptions, retained state, stale resources, or double publication in explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing.

**Context:** AI squad target voting: explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing.

**Inspect:** `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI squad target voting and its nearest existing tests/checks.
2. Characterize the current contract around explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0093 --format prompt`

## JULES-0094 — Ai squad target voting — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-squad`

**Objective:** Add adversarial regression coverage for AI squad target voting using the most plausible stale, missing, duplicated, or out-of-order state implied by explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** AI squad target voting: explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing.

**Inspect:** `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI squad target voting and its nearest existing tests/checks.
2. Characterize the current contract around explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0094 --format prompt`

## JULES-0095 — Ai squad target voting — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-squad`

**Objective:** Add a small deterministic seed/order sweep for AI squad target voting. Define one invariant from explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** AI squad target voting: explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing.

**Inspect:** `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI squad target voting and its nearest existing tests/checks.
2. Characterize the current contract around explicit hostile booleans, incomplete contacts, target vote ties, leader loss, and stale target clearing before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0095 --format prompt`

## JULES-0096 — Ai action/physics ports — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `ai-ports`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of AI action/physics ports. Exercise the public behavior or ownership seam, not source formatting.

**Context:** AI action/physics ports: decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation.

**Inspect:** `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI action/physics ports and its nearest existing tests/checks.
2. Characterize the current contract around decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for AI action/physics ports and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0096 --format prompt`

## JULES-0097 — Ai action/physics ports — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-ports`

**Objective:** Add a table-driven boundary test for AI action/physics ports. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation; do not generate decorative permutations.

**Context:** AI action/physics ports: decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation.

**Inspect:** `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0097 --format prompt`

## JULES-0098 — Ai action/physics ports — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-ports`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes AI action/physics ports. Target duplicate subscriptions, retained state, stale resources, or double publication in decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation.

**Context:** AI action/physics ports: decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation.

**Inspect:** `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI action/physics ports and its nearest existing tests/checks.
2. Characterize the current contract around decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0098 --format prompt`

## JULES-0099 — Ai action/physics ports — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-ports`

**Objective:** Add adversarial regression coverage for AI action/physics ports using the most plausible stale, missing, duplicated, or out-of-order state implied by decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** AI action/physics ports: decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation.

**Inspect:** `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI action/physics ports and its nearest existing tests/checks.
2. Characterize the current contract around decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0099 --format prompt`

## JULES-0100 — Ai action/physics ports — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ai-ports`

**Objective:** Add a small deterministic seed/order sweep for AI action/physics ports. Define one invariant from decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** AI action/physics ports: decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation.

**Inspect:** `src/systems/aiPorts.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for AI action/physics ports and its nearest existing tests/checks.
2. Characterize the current contract around decision-to-intent translation, hostility oracle use, physics commands, missing targets, and compatibility isolation before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0100 --format prompt`

## JULES-0101 — Combat kernel — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `combat-kernel`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of combat kernel. Exercise the public behavior or ownership seam, not source formatting.

**Context:** combat kernel: action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution.

**Inspect:** `src/combat/kernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat kernel and its nearest existing tests/checks.
2. Characterize the current contract around action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for combat kernel and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0101 --format prompt`

## JULES-0102 — Combat kernel — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-kernel`

**Objective:** Add a table-driven boundary test for combat kernel. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution; do not generate decorative permutations.

**Context:** combat kernel: action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution.

**Inspect:** `src/combat/kernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0102 --format prompt`

## JULES-0103 — Combat kernel — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-kernel`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes combat kernel. Target duplicate subscriptions, retained state, stale resources, or double publication in action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution.

**Context:** combat kernel: action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution.

**Inspect:** `src/combat/kernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat kernel and its nearest existing tests/checks.
2. Characterize the current contract around action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0103 --format prompt`

## JULES-0104 — Combat kernel — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-kernel`

**Objective:** Add adversarial regression coverage for combat kernel using the most plausible stale, missing, duplicated, or out-of-order state implied by action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** combat kernel: action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution.

**Inspect:** `src/combat/kernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat kernel and its nearest existing tests/checks.
2. Characterize the current contract around action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0104 --format prompt`

## JULES-0105 — Combat kernel — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-kernel`

**Objective:** Add a small deterministic seed/order sweep for combat kernel. Define one invariant from action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** combat kernel: action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution.

**Inspect:** `src/combat/kernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat kernel and its nearest existing tests/checks.
2. Characterize the current contract around action sequencing, entity validity, duplicate damage, friendly-fire policy, and deterministic resolution before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0105 --format prompt`

## JULES-0106 — Damage, status, and subsystem resolution — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `combat-damage-status`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of damage, status, and subsystem resolution. Exercise the public behavior or ownership seam, not source formatting.

**Context:** damage, status, and subsystem resolution: shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs.

**Inspect:** `src/combat/damage.js`, `src/combat/statuses.js`, `src/combat/subsystems.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for damage, status, and subsystem resolution and its nearest existing tests/checks.
2. Characterize the current contract around shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for damage, status, and subsystem resolution and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0106 --format prompt`

## JULES-0107 — Damage, status, and subsystem resolution — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-damage-status`

**Objective:** Add a table-driven boundary test for damage, status, and subsystem resolution. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs; do not generate decorative permutations.

**Context:** damage, status, and subsystem resolution: shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs.

**Inspect:** `src/combat/damage.js`, `src/combat/statuses.js`, `src/combat/subsystems.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0107 --format prompt`

## JULES-0108 — Damage, status, and subsystem resolution — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-damage-status`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes damage, status, and subsystem resolution. Target duplicate subscriptions, retained state, stale resources, or double publication in shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs.

**Context:** damage, status, and subsystem resolution: shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs.

**Inspect:** `src/combat/damage.js`, `src/combat/statuses.js`, `src/combat/subsystems.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for damage, status, and subsystem resolution and its nearest existing tests/checks.
2. Characterize the current contract around shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0108 --format prompt`

## JULES-0109 — Damage, status, and subsystem resolution — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-damage-status`

**Objective:** Add adversarial regression coverage for damage, status, and subsystem resolution using the most plausible stale, missing, duplicated, or out-of-order state implied by shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** damage, status, and subsystem resolution: shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs.

**Inspect:** `src/combat/damage.js`, `src/combat/statuses.js`, `src/combat/subsystems.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for damage, status, and subsystem resolution and its nearest existing tests/checks.
2. Characterize the current contract around shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0109 --format prompt`

## JULES-0110 — Damage, status, and subsystem resolution — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-damage-status`

**Objective:** Add a small deterministic seed/order sweep for damage, status, and subsystem resolution. Define one invariant from shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** damage, status, and subsystem resolution: shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs.

**Inspect:** `src/combat/damage.js`, `src/combat/statuses.js`, `src/combat/subsystems.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for damage, status, and subsystem resolution and its nearest existing tests/checks.
2. Characterize the current contract around shield/armor/hull ordering, resistance bounds, status refresh/expiry, destroyed subsystems, and duplicate hit IDs before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:combat-outcome`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0110 --format prompt`

## JULES-0111 — Combat attachments and tethers — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `combat-attachments`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of combat attachments and tethers. Exercise the public behavior or ownership seam, not source formatting.

**Context:** combat attachments and tethers: attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies.

**Inspect:** `src/combat/attachments.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat attachments and tethers and its nearest existing tests/checks.
2. Characterize the current contract around attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for combat attachments and tethers and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0111 --format prompt`

## JULES-0112 — Combat attachments and tethers — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-attachments`

**Objective:** Add a table-driven boundary test for combat attachments and tethers. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies; do not generate decorative permutations.

**Context:** combat attachments and tethers: attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies.

**Inspect:** `src/combat/attachments.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0112 --format prompt`

## JULES-0113 — Combat attachments and tethers — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-attachments`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes combat attachments and tethers. Target duplicate subscriptions, retained state, stale resources, or double publication in attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies.

**Context:** combat attachments and tethers: attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies.

**Inspect:** `src/combat/attachments.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat attachments and tethers and its nearest existing tests/checks.
2. Characterize the current contract around attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0113 --format prompt`

## JULES-0114 — Combat attachments and tethers — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-attachments`

**Objective:** Add adversarial regression coverage for combat attachments and tethers using the most plausible stale, missing, duplicated, or out-of-order state implied by attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** combat attachments and tethers: attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies.

**Inspect:** `src/combat/attachments.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat attachments and tethers and its nearest existing tests/checks.
2. Characterize the current contract around attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0114 --format prompt`

## JULES-0115 — Combat attachments and tethers — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `combat-attachments`

**Objective:** Add a small deterministic seed/order sweep for combat attachments and tethers. Define one invariant from attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** combat attachments and tethers: attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies.

**Inspect:** `src/combat/attachments.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for combat attachments and tethers and its nearest existing tests/checks.
2. Characterize the current contract around attach/cut ownership, target destruction, save normalization, duplicate attach events, and endpoint policies before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:massline`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0115 --format prompt`

## JULES-0116 — Weapon firing system — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `systems-weapons`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of weapon firing system. Exercise the public behavior or ownership seam, not source formatting.

**Context:** weapon firing system: cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges.

**Inspect:** `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for weapon firing system and its nearest existing tests/checks.
2. Characterize the current contract around cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for weapon firing system and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0116 --format prompt`

## JULES-0117 — Weapon firing system — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-weapons`

**Objective:** Add a table-driven boundary test for weapon firing system. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges; do not generate decorative permutations.

**Context:** weapon firing system: cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges.

**Inspect:** `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0117 --format prompt`

## JULES-0118 — Weapon firing system — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-weapons`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes weapon firing system. Target duplicate subscriptions, retained state, stale resources, or double publication in cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges.

**Context:** weapon firing system: cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges.

**Inspect:** `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for weapon firing system and its nearest existing tests/checks.
2. Characterize the current contract around cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0118 --format prompt`

## JULES-0119 — Weapon firing system — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-weapons`

**Objective:** Add adversarial regression coverage for weapon firing system using the most plausible stale, missing, duplicated, or out-of-order state implied by cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** weapon firing system: cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges.

**Inspect:** `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for weapon firing system and its nearest existing tests/checks.
2. Characterize the current contract around cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0119 --format prompt`

## JULES-0120 — Weapon firing system — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-weapons`

**Objective:** Add a small deterministic seed/order sweep for weapon firing system. Define one invariant from cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** weapon firing system: cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges.

**Inspect:** `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for weapon firing system and its nearest existing tests/checks.
2. Characterize the current contract around cooldowns, heat-free current contract, projectile creation, authorized NPC fire, browser/headless parity, and autofire edges before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:attack-spec`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0120 --format prompt`

## JULES-0121 — Beam mining system — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `systems-mining`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of beam mining system. Exercise the public behavior or ownership seam, not source formatting.

**Context:** beam mining system: seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup.

**Inspect:** `src/systems/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for beam mining system and its nearest existing tests/checks.
2. Characterize the current contract around seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for beam mining system and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0121 --format prompt`

## JULES-0122 — Beam mining system — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-mining`

**Objective:** Add a table-driven boundary test for beam mining system. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup; do not generate decorative permutations.

**Context:** beam mining system: seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup.

**Inspect:** `src/systems/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0122 --format prompt`

## JULES-0123 — Beam mining system — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-mining`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes beam mining system. Target duplicate subscriptions, retained state, stale resources, or double publication in seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup.

**Context:** beam mining system: seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup.

**Inspect:** `src/systems/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for beam mining system and its nearest existing tests/checks.
2. Characterize the current contract around seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0123 --format prompt`

## JULES-0124 — Beam mining system — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-mining`

**Objective:** Add adversarial regression coverage for beam mining system using the most plausible stale, missing, duplicated, or out-of-order state implied by seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** beam mining system: seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup.

**Inspect:** `src/systems/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for beam mining system and its nearest existing tests/checks.
2. Characterize the current contract around seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0124 --format prompt`

## JULES-0125 — Beam mining system — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-mining`

**Objective:** Add a small deterministic seed/order sweep for beam mining system. Define one invariant from seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** beam mining system: seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup.

**Inspect:** `src/systems/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for beam mining system and its nearest existing tests/checks.
2. Characterize the current contract around seam hit classification, fracture lifecycle, pickup vacuum, direct-to-cargo, deterministic yields, and entity cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0125 --format prompt`

## JULES-0126 — Cargo single-writer api — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** xs · **Collision:** `systems-cargo`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of cargo single-writer API. Exercise the public behavior or ownership seam, not source formatting.

**Context:** cargo single-writer API: volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission.

**Inspect:** `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for cargo single-writer API and its nearest existing tests/checks.
2. Characterize the current contract around volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for cargo single-writer API and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0126 --format prompt`

## JULES-0127 — Cargo single-writer api — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-cargo`

**Objective:** Add a table-driven boundary test for cargo single-writer API. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission; do not generate decorative permutations.

**Context:** cargo single-writer API: volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission.

**Inspect:** `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0127 --format prompt`

## JULES-0128 — Cargo single-writer api — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-cargo`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes cargo single-writer API. Target duplicate subscriptions, retained state, stale resources, or double publication in volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission.

**Context:** cargo single-writer API: volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission.

**Inspect:** `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for cargo single-writer API and its nearest existing tests/checks.
2. Characterize the current contract around volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0128 --format prompt`

## JULES-0129 — Cargo single-writer api — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-cargo`

**Objective:** Add adversarial regression coverage for cargo single-writer API using the most plausible stale, missing, duplicated, or out-of-order state implied by volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** cargo single-writer API: volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission.

**Inspect:** `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for cargo single-writer API and its nearest existing tests/checks.
2. Characterize the current contract around volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0129 --format prompt`

## JULES-0130 — Cargo single-writer api — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-cargo`

**Objective:** Add a small deterministic seed/order sweep for cargo single-writer API. Define one invariant from volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** cargo single-writer API: volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission.

**Inspect:** `src/systems/cargo.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for cargo single-writer API and its nearest existing tests/checks.
2. Characterize the current contract around volume capacity, mass bookkeeping, add/remove atomicity, invalid quantities, duplicate IDs, and event emission before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0130 --format prompt`

## JULES-0131 — Market and credit economy — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `systems-economy`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of market and credit economy. Exercise the public behavior or ownership seam, not source formatting.

**Context:** market and credit economy: single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers.

**Inspect:** `src/systems/economy.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for market and credit economy and its nearest existing tests/checks.
2. Characterize the current contract around single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for market and credit economy and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0131 --format prompt`

## JULES-0132 — Market and credit economy — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-economy`

**Objective:** Add a table-driven boundary test for market and credit economy. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers; do not generate decorative permutations.

**Context:** market and credit economy: single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers.

**Inspect:** `src/systems/economy.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0132 --format prompt`

## JULES-0133 — Market and credit economy — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-economy`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes market and credit economy. Target duplicate subscriptions, retained state, stale resources, or double publication in single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers.

**Context:** market and credit economy: single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers.

**Inspect:** `src/systems/economy.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for market and credit economy and its nearest existing tests/checks.
2. Characterize the current contract around single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0133 --format prompt`

## JULES-0134 — Market and credit economy — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-economy`

**Objective:** Add adversarial regression coverage for market and credit economy using the most plausible stale, missing, duplicated, or out-of-order state implied by single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** market and credit economy: single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers.

**Inspect:** `src/systems/economy.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for market and credit economy and its nearest existing tests/checks.
2. Characterize the current contract around single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0134 --format prompt`

## JULES-0135 — Market and credit economy — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-economy`

**Objective:** Add a small deterministic seed/order sweep for market and credit economy. Define one invariant from single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** market and credit economy: single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers.

**Inspect:** `src/systems/economy.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for market and credit economy and its nearest existing tests/checks.
2. Characterize the current contract around single-writer credits, buy/sell atomicity, stock/price updates, contraband, duplicate ticks, and invalid offers before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:balance`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0135 --format prompt`

## JULES-0136 — World and sector runtime — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `systems-world`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of world and sector runtime. Exercise the public behavior or ownership seam, not source formatting.

**Context:** world and sector runtime: sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave.

**Inspect:** `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for world and sector runtime and its nearest existing tests/checks.
2. Characterize the current contract around sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for world and sector runtime and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0136 --format prompt`

## JULES-0137 — World and sector runtime — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-world`

**Objective:** Add a table-driven boundary test for world and sector runtime. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave; do not generate decorative permutations.

**Context:** world and sector runtime: sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave.

**Inspect:** `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0137 --format prompt`

## JULES-0138 — World and sector runtime — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-world`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes world and sector runtime. Target duplicate subscriptions, retained state, stale resources, or double publication in sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave.

**Context:** world and sector runtime: sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave.

**Inspect:** `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for world and sector runtime and its nearest existing tests/checks.
2. Characterize the current contract around sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0138 --format prompt`

## JULES-0139 — World and sector runtime — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-world`

**Objective:** Add adversarial regression coverage for world and sector runtime using the most plausible stale, missing, duplicated, or out-of-order state implied by sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** world and sector runtime: sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave.

**Inspect:** `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for world and sector runtime and its nearest existing tests/checks.
2. Characterize the current contract around sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0139 --format prompt`

## JULES-0140 — World and sector runtime — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-world`

**Objective:** Add a small deterministic seed/order sweep for world and sector runtime. Define one invariant from sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** world and sector runtime: sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave.

**Inspect:** `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for world and sector runtime and its nearest existing tests/checks.
2. Characterize the current contract around sector transitions, spawn tables, docking/jump state, far-entity cleanup, hazards, and repeated enter/leave before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0140 --format prompt`

## JULES-0141 — Faction reputation writer — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** xs · **Collision:** `systems-factions`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of faction reputation writer. Exercise the public behavior or ownership seam, not source formatting.

**Context:** faction reputation writer: rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff.

**Inspect:** `src/systems/factions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for faction reputation writer and its nearest existing tests/checks.
2. Characterize the current contract around rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for faction reputation writer and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0141 --format prompt`

## JULES-0142 — Faction reputation writer — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-factions`

**Objective:** Add a table-driven boundary test for faction reputation writer. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff; do not generate decorative permutations.

**Context:** faction reputation writer: rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff.

**Inspect:** `src/systems/factions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0142 --format prompt`

## JULES-0143 — Faction reputation writer — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-factions`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes faction reputation writer. Target duplicate subscriptions, retained state, stale resources, or double publication in rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff.

**Context:** faction reputation writer: rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff.

**Inspect:** `src/systems/factions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for faction reputation writer and its nearest existing tests/checks.
2. Characterize the current contract around rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0143 --format prompt`

## JULES-0144 — Faction reputation writer — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-factions`

**Objective:** Add adversarial regression coverage for faction reputation writer using the most plausible stale, missing, duplicated, or out-of-order state implied by rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** faction reputation writer: rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff.

**Inspect:** `src/systems/factions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for faction reputation writer and its nearest existing tests/checks.
2. Characterize the current contract around rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0144 --format prompt`

## JULES-0145 — Faction reputation writer — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `systems-factions`

**Objective:** Add a small deterministic seed/order sweep for faction reputation writer. Define one invariant from rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** faction reputation writer: rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff.

**Inspect:** `src/systems/factions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for faction reputation writer and its nearest existing tests/checks.
2. Characterize the current contract around rep clamping, tier transitions, aggro events, duplicate actions, save normalization, and WANTED handoff before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0145 --format prompt`

## JULES-0146 — Mission board and objective engine — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `systems-missions`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of mission board and objective engine. Exercise the public behavior or ownership seam, not source formatting.

**Context:** mission board and objective engine: deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload.

**Inspect:** `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for mission board and objective engine and its nearest existing tests/checks.
2. Characterize the current contract around deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for mission board and objective engine and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0146 --format prompt`

## JULES-0147 — Mission board and objective engine — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-missions`

**Objective:** Add a table-driven boundary test for mission board and objective engine. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload; do not generate decorative permutations.

**Context:** mission board and objective engine: deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload.

**Inspect:** `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0147 --format prompt`

## JULES-0148 — Mission board and objective engine — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-missions`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes mission board and objective engine. Target duplicate subscriptions, retained state, stale resources, or double publication in deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload.

**Context:** mission board and objective engine: deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload.

**Inspect:** `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for mission board and objective engine and its nearest existing tests/checks.
2. Characterize the current contract around deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0148 --format prompt`

## JULES-0149 — Mission board and objective engine — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-missions`

**Objective:** Add adversarial regression coverage for mission board and objective engine using the most plausible stale, missing, duplicated, or out-of-order state implied by deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** mission board and objective engine: deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload.

**Inspect:** `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for mission board and objective engine and its nearest existing tests/checks.
2. Characterize the current contract around deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0149 --format prompt`

## JULES-0150 — Mission board and objective engine — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `systems-missions`

**Objective:** Add a small deterministic seed/order sweep for mission board and objective engine. Define one invariant from deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** mission board and objective engine: deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload.

**Inspect:** `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for mission board and objective engine and its nearest existing tests/checks.
2. Characterize the current contract around deterministic board generation, objective transitions, reward atomicity, cancellation, stale targets, and reload before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0150 --format prompt`

## JULES-0151 — First-hour onboarding arbiter — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `systems-onboarding`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of first-hour onboarding arbiter. Exercise the public behavior or ownership seam, not source formatting.

**Context:** first-hour onboarding arbiter: one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes.

**Inspect:** `src/systems/onboarding.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for first-hour onboarding arbiter and its nearest existing tests/checks.
2. Characterize the current contract around one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for first-hour onboarding arbiter and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0151 --format prompt`

## JULES-0152 — First-hour onboarding arbiter — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `systems-onboarding`

**Objective:** Add a table-driven boundary test for first-hour onboarding arbiter. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes; do not generate decorative permutations.

**Context:** first-hour onboarding arbiter: one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes.

**Inspect:** `src/systems/onboarding.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0152 --format prompt`

## JULES-0153 — First-hour onboarding arbiter — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `systems-onboarding`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes first-hour onboarding arbiter. Target duplicate subscriptions, retained state, stale resources, or double publication in one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes.

**Context:** first-hour onboarding arbiter: one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes.

**Inspect:** `src/systems/onboarding.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for first-hour onboarding arbiter and its nearest existing tests/checks.
2. Characterize the current contract around one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0153 --format prompt`

## JULES-0154 — First-hour onboarding arbiter — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `systems-onboarding`

**Objective:** Add adversarial regression coverage for first-hour onboarding arbiter using the most plausible stale, missing, duplicated, or out-of-order state implied by one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** first-hour onboarding arbiter: one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes.

**Inspect:** `src/systems/onboarding.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for first-hour onboarding arbiter and its nearest existing tests/checks.
2. Characterize the current contract around one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0154 --format prompt`

## JULES-0155 — First-hour onboarding arbiter — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `systems-onboarding`

**Objective:** Add a small deterministic seed/order sweep for first-hour onboarding arbiter. Define one invariant from one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** first-hour onboarding arbiter: one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes.

**Inspect:** `src/systems/onboarding.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for first-hour onboarding arbiter and its nearest existing tests/checks.
2. Characterize the current contract around one-voice priority, stale tutorial drops, skip/restart, action recognition, save continuation, and mode changes before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0155 --format prompt`

## JULES-0156 — Versioned save system — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `save-system`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of versioned save system. Exercise the public behavior or ownership seam, not source formatting.

**Context:** versioned save system: migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0156 --format prompt`

## JULES-0157 — Versioned save system — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `save-system`

**Objective:** Add a table-driven boundary test for versioned save system. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup; do not generate decorative permutations.

**Context:** versioned save system: migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0157 --format prompt`

## JULES-0158 — Versioned save system — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `save-system`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes versioned save system. Target duplicate subscriptions, retained state, stale resources, or double publication in migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup.

**Context:** versioned save system: migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for versioned save system and its nearest existing tests/checks.
2. Characterize the current contract around migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0158 --format prompt`

## JULES-0159 — Versioned save system — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `save-system`

**Objective:** Add adversarial regression coverage for versioned save system using the most plausible stale, missing, duplicated, or out-of-order state implied by migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** versioned save system: migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for versioned save system and its nearest existing tests/checks.
2. Characterize the current contract around migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0159 --format prompt`

## JULES-0160 — Versioned save system — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `save-system`

**Objective:** Add a small deterministic seed/order sweep for versioned save system. Define one invariant from migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** versioned save system: migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for versioned save system and its nearest existing tests/checks.
2. Characterize the current contract around migration, synchronous restore arbitration, autosave, malformed slots, cross-shell mirroring, and transient-field cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0160 --format prompt`

## JULES-0161 — Screen manager pause ownership — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `ui-screen-manager`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of screen manager pause ownership. Exercise the public behavior or ownership seam, not source formatting.

**Context:** screen manager pause ownership: nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup.

**Inspect:** `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for screen manager pause ownership and its nearest existing tests/checks.
2. Characterize the current contract around nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for screen manager pause ownership and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0161 --format prompt`

## JULES-0162 — Screen manager pause ownership — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-screen-manager`

**Objective:** Add a table-driven boundary test for screen manager pause ownership. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup; do not generate decorative permutations.

**Context:** screen manager pause ownership: nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup.

**Inspect:** `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0162 --format prompt`

## JULES-0163 — Screen manager pause ownership — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-screen-manager`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes screen manager pause ownership. Target duplicate subscriptions, retained state, stale resources, or double publication in nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup.

**Context:** screen manager pause ownership: nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup.

**Inspect:** `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for screen manager pause ownership and its nearest existing tests/checks.
2. Characterize the current contract around nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0163 --format prompt`

## JULES-0164 — Screen manager pause ownership — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-screen-manager`

**Objective:** Add adversarial regression coverage for screen manager pause ownership using the most plausible stale, missing, duplicated, or out-of-order state implied by nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** screen manager pause ownership: nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup.

**Inspect:** `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for screen manager pause ownership and its nearest existing tests/checks.
2. Characterize the current contract around nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0164 --format prompt`

## JULES-0165 — Screen manager pause ownership — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `ui-screen-manager`

**Objective:** Add a small deterministic seed/order sweep for screen manager pause ownership. Define one invariant from nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** screen manager pause ownership: nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup.

**Inspect:** `src/ui/screenManager.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for screen manager pause ownership and its nearest existing tests/checks.
2. Characterize the current contract around nested modal pause requests, repeated open/close, cache invalidation, focus restoration, and exception cleanup before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0165 --format prompt`

## JULES-0166 — Authored asset loader — lock the ordinary contract

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** xs · **Collision:** `render-asset-loader`

**Objective:** Add one focused deterministic regression test for the ordinary live-path contract of authored asset loader. Exercise the public behavior or ownership seam, not source formatting.

**Context:** authored asset loader: contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for authored asset loader and its nearest existing tests/checks.
2. Characterize the current contract around contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The new test proves a player- or architecture-relevant invariant for authored asset loader and would fail if the live owner became a no-op.
- The test reaches the selected live path and does not accidentally cover only a legacy or compatibility implementation.
- The fixture is minimal, seeded where simulation is involved, and leaves global state/listeners clean.
- Run the narrow new test first, then the smallest existing focused check for this owner.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0166 --format prompt`

## JULES-0167 — Authored asset loader — cover its boundary matrix

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `render-asset-loader`

**Objective:** Add a table-driven boundary test for authored asset loader. Select the load-bearing zero/minimum/maximum/missing/disabled transitions relevant to contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads; do not generate decorative permutations.

**Context:** authored asset loader: contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0167 --format prompt`

## JULES-0168 — Authored asset loader — prove repeated lifecycle safety

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `render-asset-loader`

**Objective:** Add a focused test that initializes, uses, tears down, and reinitializes authored asset loader. Target duplicate subscriptions, retained state, stale resources, or double publication in contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads.

**Context:** authored asset loader: contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for authored asset loader and its nearest existing tests/checks.
2. Characterize the current contract around contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- Two complete lifecycle passes produce the same observable result as one fresh pass.
- Dispose/stop/unsubscribe is safe when called once and when the surrounding route calls it again.
- No duplicate event, timer, listener, entity, render root, or owned state survives the first teardown.
- The test cleans up after itself and passes when run repeatedly in the same Node process.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0168 --format prompt`

## JULES-0169 — Authored asset loader — exercise malformed and stale state

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `render-asset-loader`

**Objective:** Add adversarial regression coverage for authored asset loader using the most plausible stale, missing, duplicated, or out-of-order state implied by contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads. Keep the fixture physically possible for an old save, interrupted route, or concurrent event sequence.

**Context:** authored asset loader: contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for authored asset loader and its nearest existing tests/checks.
2. Characterize the current contract around contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The test covers one concrete corruption or ordering class, not a grab-bag of arbitrary invalid objects.
- The owner fails closed or repairs the state without violating another system’s single-writer boundary.
- No exception is swallowed silently when an actionable diagnostic is part of the contract.
- The ordinary valid path remains covered and unchanged.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0169 --format prompt`

## JULES-0170 — Authored asset loader — sweep a seeded invariant

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `render-asset-loader`

**Objective:** Add a small deterministic seed/order sweep for authored asset loader. Define one invariant from contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads, run it over a bounded matrix, and report the first counterexample with enough state to reproduce it.

**Context:** authored asset loader: contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `test/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`, `docs/MODULE_MAP.md`

**Work:**
1. Locate the selected live owner for authored asset loader and its nearest existing tests/checks.
2. Characterize the current contract around contract validation, diagnostic retention, cancellation, lease/dispose ownership, fallback signaling, and repeated loads before writing assertions.
3. Add the smallest behavior-level deterministic test that satisfies the objective; production code is out of scope unless the test exposes an undeniable defect and the smallest repair is inseparable.
4. Run the new test directly, then the narrowest relevant existing check once.

**Acceptance:**
- The sweep uses repository RNG/sim-time facilities rather than ambient randomness or wall time.
- The bound is small enough for the everyday focused check but broad enough to catch more than one hand-picked example.
- Failure output includes the seed/order and the violated invariant.
- The test checks semantic behavior and does not bless changed golden output.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** If equivalent focused coverage already exists and no meaningful gap remains, return NO_CHANGE with the exact existing tests and uncovered-risk analysis; do not add a duplicate test.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0170 --format prompt`
