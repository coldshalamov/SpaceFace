<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# Determinism, replay, save, and lifecycle

Protect same-seed behavior, save/reload continuity, shell parity, and repeated lifecycle transitions.

**Tasks:** 90 · **Range:** `JULES-0321`–`JULES-0410`

## JULES-0321 — New-game state defaults — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-game-state-defaults`

**Objective:** Run new-game state defaults twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity, then fix only a demonstrated ambient-state or ordering leak.

**Context:** new-game state defaults: same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity.

**Inspect:** `src/core/gameState.js`, `src/data/newGameDefaults.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game state defaults through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0321 --format prompt`

## JULES-0322 — New-game state defaults — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-game-state-defaults`

**Objective:** Exercise new-game state defaults with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** new-game state defaults: same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity.

**Inspect:** `src/core/gameState.js`, `src/data/newGameDefaults.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game state defaults through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0322 --format prompt`

## JULES-0323 — New-game state defaults — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** m · **Collision:** `det-game-state-defaults`

**Objective:** Capture new-game state defaults immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity.

**Context:** new-game state defaults: same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity.

**Inspect:** `src/core/gameState.js`, `src/data/newGameDefaults.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game state defaults through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0323 --format prompt`

## JULES-0324 — New-game state defaults — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-game-state-defaults`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to new-game state defaults; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity.

**Context:** new-game state defaults: same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity.

**Inspect:** `src/core/gameState.js`, `src/data/newGameDefaults.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game state defaults through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0324 --format prompt`

## JULES-0325 — New-game state defaults — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-game-state-defaults`

**Objective:** Audit what new-game state defaults contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** new-game state defaults: same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity.

**Inspect:** `src/core/gameState.js`, `src/data/newGameDefaults.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game state defaults through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same-seed construction, default backend flags, mutable object isolation, absent optional fields, and normalization parity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0325 --format prompt`

## JULES-0326 — Core rng streams — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-rng`

**Objective:** Run core RNG streams twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs, then fix only a demonstrated ambient-state or ordering leak.

**Context:** core RNG streams: seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs.

**Inspect:** `src/core/rng.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace core RNG streams through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0326 --format prompt`

## JULES-0327 — Core rng streams — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-rng`

**Objective:** Exercise core RNG streams with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** core RNG streams: seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs.

**Inspect:** `src/core/rng.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace core RNG streams through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0327 --format prompt`

## JULES-0328 — Core rng streams — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** m · **Collision:** `det-rng`

**Objective:** Capture core RNG streams immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs.

**Context:** core RNG streams: seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs.

**Inspect:** `src/core/rng.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace core RNG streams through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0328 --format prompt`

## JULES-0329 — Core rng streams — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-rng`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to core RNG streams; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs.

**Context:** core RNG streams: seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs.

**Inspect:** `src/core/rng.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace core RNG streams through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0329 --format prompt`

## JULES-0330 — Core rng streams — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-rng`

**Objective:** Audit what core RNG streams contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** core RNG streams: seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs.

**Inspect:** `src/core/rng.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace core RNG streams through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0330 --format prompt`

## JULES-0331 — Event delivery order — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-event-order`

**Objective:** Run event delivery order twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation, then fix only a demonstrated ambient-state or ordering leak.

**Context:** event delivery order: subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace event delivery order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0331 --format prompt`

## JULES-0332 — Event delivery order — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-event-order`

**Objective:** Exercise event delivery order with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** event delivery order: subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace event delivery order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0332 --format prompt`

## JULES-0333 — Event delivery order — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** m · **Collision:** `det-event-order`

**Objective:** Capture event delivery order immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation.

**Context:** event delivery order: subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace event delivery order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0333 --format prompt`

## JULES-0334 — Event delivery order — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-event-order`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to event delivery order; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation.

**Context:** event delivery order: subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace event delivery order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0334 --format prompt`

## JULES-0335 — Event delivery order — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-event-order`

**Objective:** Audit what event delivery order contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** event delivery order: subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace event delivery order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0335 --format prompt`

## JULES-0336 — Registry update order — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-registry-order`

**Objective:** Run registry update order twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization, then fix only a demonstrated ambient-state or ordering leak.

**Context:** registry update order: selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace registry update order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0336 --format prompt`

## JULES-0337 — Registry update order — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-registry-order`

**Objective:** Exercise registry update order with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** registry update order: selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace registry update order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0337 --format prompt`

## JULES-0338 — Registry update order — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-registry-order`

**Objective:** Capture registry update order immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization.

**Context:** registry update order: selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace registry update order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0338 --format prompt`

## JULES-0339 — Registry update order — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-registry-order`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to registry update order; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization.

**Context:** registry update order: selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace registry update order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0339 --format prompt`

## JULES-0340 — Registry update order — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-registry-order`

**Objective:** Audit what registry update order contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** registry update order: selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization.

**Inspect:** `src/core/registry.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace registry update order through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for selected backend slots, stable system order, missing optional systems, duplicate names, and reinitialization and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0340 --format prompt`

## JULES-0341 — Physics snapshot and body rebuild — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-physics-snapshot`

**Objective:** Run physics snapshot and body rebuild twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering, then fix only a demonstrated ambient-state or ordering leak.

**Context:** physics snapshot and body rebuild: body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace physics snapshot and body rebuild through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0341 --format prompt`

## JULES-0342 — Physics snapshot and body rebuild — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-physics-snapshot`

**Objective:** Exercise physics snapshot and body rebuild with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** physics snapshot and body rebuild: body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace physics snapshot and body rebuild through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0342 --format prompt`

## JULES-0343 — Physics snapshot and body rebuild — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-physics-snapshot`

**Objective:** Capture physics snapshot and body rebuild immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering.

**Context:** physics snapshot and body rebuild: body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace physics snapshot and body rebuild through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0343 --format prompt`

## JULES-0344 — Physics snapshot and body rebuild — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-physics-snapshot`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to physics snapshot and body rebuild; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering.

**Context:** physics snapshot and body rebuild: body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace physics snapshot and body rebuild through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0344 --format prompt`

## JULES-0345 — Physics snapshot and body rebuild — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-physics-snapshot`

**Objective:** Audit what physics snapshot and body rebuild contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** physics snapshot and body rebuild: body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/simSnapshot.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace physics snapshot and body rebuild through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for body insertion order, handle regeneration, save/load position parity, sleeping bodies, and contact ordering and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0345 --format prompt`

## JULES-0346 — V3 flight simulation — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-flight-v3`

**Objective:** Run V3 flight simulation twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior, then fix only a demonstrated ambient-state or ordering leak.

**Context:** V3 flight simulation: same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace V3 flight simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0346 --format prompt`

## JULES-0347 — V3 flight simulation — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-flight-v3`

**Objective:** Exercise V3 flight simulation with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** V3 flight simulation: same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace V3 flight simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0347 --format prompt`

## JULES-0348 — V3 flight simulation — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-flight-v3`

**Objective:** Capture V3 flight simulation immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior.

**Context:** V3 flight simulation: same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace V3 flight simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0348 --format prompt`

## JULES-0349 — V3 flight simulation — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-flight-v3`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to V3 flight simulation; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior.

**Context:** V3 flight simulation: same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace V3 flight simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0349 --format prompt`

## JULES-0350 — V3 flight simulation — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-flight-v3`

**Objective:** Audit what V3 flight simulation contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** V3 flight simulation: same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior.

**Inspect:** `src/systems/flightV3.js`, `src/core/flight/propulsionKernel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace V3 flight simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same input tape/seed, timestep accumulation, backend selection, disabled thrusters, and reload-at-tick behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:sim:v3`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0350 --format prompt`

## JULES-0351 — Tactical ai decisions — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-ai-decisions`

**Objective:** Run tactical AI decisions twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence, then fix only a demonstrated ambient-state or ordering leak.

**Context:** tactical AI decisions: contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence.

**Inspect:** `src/ai/stack.js`, `src/ai/shipDecision.js`, `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace tactical AI decisions through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0351 --format prompt`

## JULES-0352 — Tactical ai decisions — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-ai-decisions`

**Objective:** Exercise tactical AI decisions with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** tactical AI decisions: contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence.

**Inspect:** `src/ai/stack.js`, `src/ai/shipDecision.js`, `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace tactical AI decisions through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0352 --format prompt`

## JULES-0353 — Tactical ai decisions — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-ai-decisions`

**Objective:** Capture tactical AI decisions immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence.

**Context:** tactical AI decisions: contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence.

**Inspect:** `src/ai/stack.js`, `src/ai/shipDecision.js`, `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace tactical AI decisions through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0353 --format prompt`

## JULES-0354 — Tactical ai decisions — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-ai-decisions`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to tactical AI decisions; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence.

**Context:** tactical AI decisions: contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence.

**Inspect:** `src/ai/stack.js`, `src/ai/shipDecision.js`, `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace tactical AI decisions through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0354 --format prompt`

## JULES-0355 — Tactical ai decisions — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-ai-decisions`

**Objective:** Audit what tactical AI decisions contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** tactical AI decisions: contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence.

**Inspect:** `src/ai/stack.js`, `src/ai/shipDecision.js`, `src/ai/squad.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace tactical AI decisions through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for contact insertion order, tie-breaking, cadence, missing targets, and reload equivalence and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0355 --format prompt`

## JULES-0356 — Combat resolution — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-combat`

**Objective:** Run combat resolution twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals, then fix only a demonstrated ambient-state or ordering leak.

**Context:** combat resolution: simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals.

**Inspect:** `src/combat/kernel.js`, `src/combat/damage.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace combat resolution through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0356 --format prompt`

## JULES-0357 — Combat resolution — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-combat`

**Objective:** Exercise combat resolution with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** combat resolution: simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals.

**Inspect:** `src/combat/kernel.js`, `src/combat/damage.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace combat resolution through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0357 --format prompt`

## JULES-0358 — Combat resolution — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-combat`

**Objective:** Capture combat resolution immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals.

**Context:** combat resolution: simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals.

**Inspect:** `src/combat/kernel.js`, `src/combat/damage.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace combat resolution through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0358 --format prompt`

## JULES-0359 — Combat resolution — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-combat`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to combat resolution; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals.

**Context:** combat resolution: simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals.

**Inspect:** `src/combat/kernel.js`, `src/combat/damage.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace combat resolution through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0359 --format prompt`

## JULES-0360 — Combat resolution — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-combat`

**Objective:** Audit what combat resolution contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** combat resolution: simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals.

**Inspect:** `src/combat/kernel.js`, `src/combat/damage.js`, `src/systems/weapons.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace combat resolution through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for simultaneous hits, projectile ordering, status expiry, entity removal, and repeatable damage totals and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:sim:compare`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0360 --format prompt`

## JULES-0361 — Mining yields and fracture — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-mining`

**Objective:** Run mining yields and fracture twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture, then fix only a demonstrated ambient-state or ordering leak.

**Context:** mining yields and fracture: asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mining yields and fracture through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0361 --format prompt`

## JULES-0362 — Mining yields and fracture — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-mining`

**Objective:** Exercise mining yields and fracture with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** mining yields and fracture: asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mining yields and fracture through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0362 --format prompt`

## JULES-0363 — Mining yields and fracture — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-mining`

**Objective:** Capture mining yields and fracture immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture.

**Context:** mining yields and fracture: asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mining yields and fracture through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0363 --format prompt`

## JULES-0364 — Mining yields and fracture — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-mining`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to mining yields and fracture; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture.

**Context:** mining yields and fracture: asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mining yields and fracture through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0364 --format prompt`

## JULES-0365 — Mining yields and fracture — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-mining`

**Objective:** Audit what mining yields and fracture contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** mining yields and fracture: asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture.

**Inspect:** `src/systems/mining.js`, `src/data/mining.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mining yields and fracture through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for asteroid seed, seam count, yield rolls, chunk IDs, pickup order, and reload during fracture and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:mining:2`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0365 --format prompt`

## JULES-0366 — Economy price cycles — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-economy`

**Objective:** Run economy price cycles twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around station iteration order, day ticks, stock drift, transaction order, and save/load price history, then fix only a demonstrated ambient-state or ordering leak.

**Context:** economy price cycles: station iteration order, day ticks, stock drift, transaction order, and save/load price history.

**Inspect:** `src/systems/economy.js`, `src/systems/economyCycles.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace economy price cycles through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station iteration order, day ticks, stock drift, transaction order, and save/load price history and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0366 --format prompt`

## JULES-0367 — Economy price cycles — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-economy`

**Objective:** Exercise economy price cycles with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** economy price cycles: station iteration order, day ticks, stock drift, transaction order, and save/load price history.

**Inspect:** `src/systems/economy.js`, `src/systems/economyCycles.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace economy price cycles through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station iteration order, day ticks, stock drift, transaction order, and save/load price history and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0367 --format prompt`

## JULES-0368 — Economy price cycles — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-economy`

**Objective:** Capture economy price cycles immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of station iteration order, day ticks, stock drift, transaction order, and save/load price history.

**Context:** economy price cycles: station iteration order, day ticks, stock drift, transaction order, and save/load price history.

**Inspect:** `src/systems/economy.js`, `src/systems/economyCycles.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace economy price cycles through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station iteration order, day ticks, stock drift, transaction order, and save/load price history and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0368 --format prompt`

## JULES-0369 — Economy price cycles — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-economy`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to economy price cycles; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around station iteration order, day ticks, stock drift, transaction order, and save/load price history.

**Context:** economy price cycles: station iteration order, day ticks, stock drift, transaction order, and save/load price history.

**Inspect:** `src/systems/economy.js`, `src/systems/economyCycles.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace economy price cycles through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station iteration order, day ticks, stock drift, transaction order, and save/load price history and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0369 --format prompt`

## JULES-0370 — Economy price cycles — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-economy`

**Objective:** Audit what economy price cycles contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** economy price cycles: station iteration order, day ticks, stock drift, transaction order, and save/load price history.

**Inspect:** `src/systems/economy.js`, `src/systems/economyCycles.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace economy price cycles through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station iteration order, day ticks, stock drift, transaction order, and save/load price history and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0370 --format prompt`

## JULES-0371 — World generation and spawn ids — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-world`

**Objective:** Run world generation and spawn IDs twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup, then fix only a demonstrated ambient-state or ordering leak.

**Context:** world generation and spawn IDs: sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup.

**Inspect:** `src/systems/world.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace world generation and spawn IDs through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0371 --format prompt`

## JULES-0372 — World generation and spawn ids — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-world`

**Objective:** Exercise world generation and spawn IDs with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** world generation and spawn IDs: sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup.

**Inspect:** `src/systems/world.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace world generation and spawn IDs through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0372 --format prompt`

## JULES-0373 — World generation and spawn ids — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-world`

**Objective:** Capture world generation and spawn IDs immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup.

**Context:** world generation and spawn IDs: sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup.

**Inspect:** `src/systems/world.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace world generation and spawn IDs through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0373 --format prompt`

## JULES-0374 — World generation and spawn ids — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-world`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to world generation and spawn IDs; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup.

**Context:** world generation and spawn IDs: sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup.

**Inspect:** `src/systems/world.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace world generation and spawn IDs through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0374 --format prompt`

## JULES-0375 — World generation and spawn ids — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-world`

**Objective:** Audit what world generation and spawn IDs contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** world generation and spawn IDs: sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup.

**Inspect:** `src/systems/world.js`, `src/data/sectors.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace world generation and spawn IDs through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for sector seed, spawn ordering, POI IDs, enter/leave repeatability, and far-entity cleanup and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0375 --format prompt`

## JULES-0376 — Mission board generation — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-mission-board`

**Objective:** Run mission board generation twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity, then fix only a demonstrated ambient-state or ordering leak.

**Context:** mission board generation: station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mission board generation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0376 --format prompt`

## JULES-0377 — Mission board generation — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-mission-board`

**Objective:** Exercise mission board generation with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** mission board generation: station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mission board generation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0377 --format prompt`

## JULES-0378 — Mission board generation — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-mission-board`

**Objective:** Capture mission board generation immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity.

**Context:** mission board generation: station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mission board generation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0378 --format prompt`

## JULES-0379 — Mission board generation — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-mission-board`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to mission board generation; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity.

**Context:** mission board generation: station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mission board generation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0379 --format prompt`

## JULES-0380 — Mission board generation — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-mission-board`

**Objective:** Audit what mission board generation contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** mission board generation: station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity.

**Inspect:** `src/systems/missions.js`, `src/data/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace mission board generation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for station/day seed, offer ordering, unique IDs, acceptance timing, and reload continuity and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0380 --format prompt`

## JULES-0381 — Offscreen sector simulation — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-sector-sim`

**Objective:** Run offscreen sector simulation twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift, then fix only a demonstrated ambient-state or ordering leak.

**Context:** offscreen sector simulation: day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift.

**Inspect:** `src/systems/sectorSim.js`, `src/systems/dangerModel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace offscreen sector simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0381 --format prompt`

## JULES-0382 — Offscreen sector simulation — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `det-sector-sim`

**Objective:** Exercise offscreen sector simulation with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** offscreen sector simulation: day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift.

**Inspect:** `src/systems/sectorSim.js`, `src/systems/dangerModel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace offscreen sector simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0382 --format prompt`

## JULES-0383 — Offscreen sector simulation — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `det-sector-sim`

**Objective:** Capture offscreen sector simulation immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift.

**Context:** offscreen sector simulation: day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift.

**Inspect:** `src/systems/sectorSim.js`, `src/systems/dangerModel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace offscreen sector simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0383 --format prompt`

## JULES-0384 — Offscreen sector simulation — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `det-sector-sim`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to offscreen sector simulation; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift.

**Context:** offscreen sector simulation: day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift.

**Inspect:** `src/systems/sectorSim.js`, `src/systems/dangerModel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace offscreen sector simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0384 --format prompt`

## JULES-0385 — Offscreen sector simulation — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `det-sector-sim`

**Objective:** Audit what offscreen sector simulation contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** offscreen sector simulation: day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift.

**Inspect:** `src/systems/sectorSim.js`, `src/systems/dangerModel.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace offscreen sector simulation through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for day-boundary updates, sector iteration order, event emission, save/load, and no per-frame drift and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0385 --format prompt`

## JULES-0386 — Save migrations — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-save-migrations`

**Objective:** Run save migrations twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save, then fix only a demonstrated ambient-state or ordering leak.

**Context:** save migrations: idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save.

**Inspect:** `src/save/saveSystem.js`, `src/systems/adventureMigration.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace save migrations through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0386 --format prompt`

## JULES-0387 — Save migrations — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-save-migrations`

**Objective:** Exercise save migrations with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** save migrations: idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save.

**Inspect:** `src/save/saveSystem.js`, `src/systems/adventureMigration.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace save migrations through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0387 --format prompt`

## JULES-0388 — Save migrations — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-save-migrations`

**Objective:** Capture save migrations immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save.

**Context:** save migrations: idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save.

**Inspect:** `src/save/saveSystem.js`, `src/systems/adventureMigration.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace save migrations through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0388 --format prompt`

## JULES-0389 — Save migrations — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-save-migrations`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to save migrations; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save.

**Context:** save migrations: idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save.

**Inspect:** `src/save/saveSystem.js`, `src/systems/adventureMigration.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace save migrations through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0389 --format prompt`

## JULES-0390 — Save migrations — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-save-migrations`

**Objective:** Audit what save migrations contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** save migrations: idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save.

**Inspect:** `src/save/saveSystem.js`, `src/systems/adventureMigration.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace save migrations through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0390 --format prompt`

## JULES-0391 — Restore and autosave arbitration — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-save-arbitration`

**Objective:** Run restore and autosave arbitration twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership, then fix only a demonstrated ambient-state or ordering leak.

**Context:** restore and autosave arbitration: nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace restore and autosave arbitration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0391 --format prompt`

## JULES-0392 — Restore and autosave arbitration — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-save-arbitration`

**Objective:** Exercise restore and autosave arbitration with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** restore and autosave arbitration: nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace restore and autosave arbitration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0392 --format prompt`

## JULES-0393 — Restore and autosave arbitration — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-save-arbitration`

**Objective:** Capture restore and autosave arbitration immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership.

**Context:** restore and autosave arbitration: nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace restore and autosave arbitration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0393 --format prompt`

## JULES-0394 — Restore and autosave arbitration — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-save-arbitration`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to restore and autosave arbitration; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership.

**Context:** restore and autosave arbitration: nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace restore and autosave arbitration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0394 --format prompt`

## JULES-0395 — Restore and autosave arbitration — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-save-arbitration`

**Objective:** Audit what restore and autosave arbitration contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** restore and autosave arbitration: nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace restore and autosave arbitration through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0395 --format prompt`

## JULES-0396 — New-game/load async tokens — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-transition-tokens`

**Objective:** Run new-game/load async tokens twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit, then fix only a demonstrated ambient-state or ordering leak.

**Context:** new-game/load async tokens: completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit.

**Inspect:** `src/core/runTransitionGuard.js`, `src/main.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game/load async tokens through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0396 --format prompt`

## JULES-0397 — New-game/load async tokens — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-transition-tokens`

**Objective:** Exercise new-game/load async tokens with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** new-game/load async tokens: completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit.

**Inspect:** `src/core/runTransitionGuard.js`, `src/main.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game/load async tokens through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0397 --format prompt`

## JULES-0398 — New-game/load async tokens — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-transition-tokens`

**Objective:** Capture new-game/load async tokens immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit.

**Context:** new-game/load async tokens: completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit.

**Inspect:** `src/core/runTransitionGuard.js`, `src/main.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game/load async tokens through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0398 --format prompt`

## JULES-0399 — New-game/load async tokens — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-transition-tokens`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to new-game/load async tokens; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit.

**Context:** new-game/load async tokens: completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit.

**Inspect:** `src/core/runTransitionGuard.js`, `src/main.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game/load async tokens through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0399 --format prompt`

## JULES-0400 — New-game/load async tokens — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-transition-tokens`

**Objective:** Audit what new-game/load async tokens contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** new-game/load async tokens: completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit.

**Inspect:** `src/core/runTransitionGuard.js`, `src/main.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace new-game/load async tokens through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for completion races, forged/cloned tokens, canceled asset readiness, repeated clicks, and one-shot transition commit and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0400 --format prompt`

## JULES-0401 — Input tape and action edges — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-input-replay`

**Objective:** Run input tape and action edges twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay, then fix only a demonstrated ambient-state or ordering leak.

**Context:** input tape and action edges: tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay.

**Inspect:** `src/systems/input.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace input tape and action edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:replay`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0401 --format prompt`

## JULES-0402 — Input tape and action edges — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-input-replay`

**Objective:** Exercise input tape and action edges with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** input tape and action edges: tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay.

**Inspect:** `src/systems/input.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace input tape and action edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:replay`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0402 --format prompt`

## JULES-0403 — Input tape and action edges — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-input-replay`

**Objective:** Capture input tape and action edges immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay.

**Context:** input tape and action edges: tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay.

**Inspect:** `src/systems/input.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace input tape and action edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:replay`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0403 --format prompt`

## JULES-0404 — Input tape and action edges — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-input-replay`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to input tape and action edges; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay.

**Context:** input tape and action edges: tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay.

**Inspect:** `src/systems/input.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace input tape and action edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:replay`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0404 --format prompt`

## JULES-0405 — Input tape and action edges — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-input-replay`

**Objective:** Audit what input tape and action edges contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** input tape and action edges: tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay.

**Inspect:** `src/systems/input.js`, `src/systems/masslineInputGrammar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace input tape and action edges through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:replay`
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0405 --format prompt`

## JULES-0406 — Browser/electron gameplay parity — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-shell-parity`

**Objective:** Run browser/Electron gameplay parity twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior, then fix only a demonstrated ambient-state or ordering leak.

**Context:** browser/Electron gameplay parity: same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior.

**Inspect:** `server.js`, `electron/main.cjs`, `src/main.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace browser/Electron gameplay parity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Independent runs match in owned semantic state, emitted events/intents, and canonical output relevant to the task.
- The test does not reuse mutable fixture objects between runs.
- Any discovered nondeterminism is removed through state.rng/state.simTime or explicit ordering, never by sorting away meaningful behavior.
- Expected telemetry files are not edited to force green.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0406 --format prompt`

## JULES-0407 — Browser/electron gameplay parity — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-shell-parity`

**Objective:** Exercise browser/Electron gameplay parity with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** browser/Electron gameplay parity: same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior.

**Inspect:** `server.js`, `electron/main.cjs`, `src/main.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace browser/Electron gameplay parity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- At least three valid permutations produce equivalent semantic output unless authored order is explicitly part of the contract.
- When order matters, the source of authority is explicit and tested rather than inherited accidentally.
- The fix does not globally sort hot collections without measuring or justifying it.
- Failure output identifies the first divergent key/entity/event.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0407 --format prompt`

## JULES-0408 — Browser/electron gameplay parity — test save/reload continuity

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-shell-parity`

**Objective:** Capture browser/Electron gameplay parity immediately before and after its most fragile save/reload boundary. Verify normalization, transient-state reset, ownership restoration, and continuation of same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior.

**Context:** browser/Electron gameplay parity: same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior.

**Inspect:** `server.js`, `electron/main.cjs`, `src/main.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace browser/Electron gameplay parity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- The fixture exercises the current save version and at least one representative older or partial shape when applicable.
- Persistent state survives exactly; transient listeners, timers, caches, and in-flight tokens do not serialize accidentally.
- Reload cannot duplicate rewards, entities, events, or route commits.
- The post-load path advances normally under the selected live backends.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0408 --format prompt`

## JULES-0409 — Browser/electron gameplay parity — test duplicate events and restart races

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-shell-parity`

**Objective:** Deliver duplicate, stale, superseded, or same-tick lifecycle signals to browser/Electron gameplay parity; also repeat its start/stop or load/new-game transition. Protect monotonic ownership and idempotence around same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior.

**Context:** browser/Electron gameplay parity: same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior.

**Inspect:** `server.js`, `electron/main.cjs`, `src/main.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace browser/Electron gameplay parity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Only the current valid token/event/owner can commit the transition.
- Duplicate delivery is harmless and does not double-pay, double-spawn, double-subscribe, or double-dispose.
- A stale outer failure cannot overwrite the newer successful route.
- The test is deterministic and contains no timing sleeps.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0409 --format prompt`

## JULES-0410 — Browser/electron gameplay parity — audit canonical and ephemeral state shape

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `det-shell-parity`

**Objective:** Audit what browser/Electron gameplay parity contributes to snapshots, saves, replay hashes, and ephemeral runtime state. Add a focused contract that catches nondeterministic or accidentally serialized fields without normalizing away real gameplay deltas.

**Context:** browser/Electron gameplay parity: same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior.

**Inspect:** `server.js`, `electron/main.cjs`, `src/main.js`, `src/save/saveSystem.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

**Work:**
1. Trace browser/Electron gameplay parity through the current live owners and selection seams.
2. Build the narrowest deterministic reproduction for same entrypoint/defaults/assets/settings, shell-only differences, shared saves, and isolated evidence behavior and the facet named by this task.
3. Change production only after the reproduction is red or the live trace proves a concrete defect; fix at the canonical owner and add regression coverage.
4. Run focused proof before and after; do not broaden into adjacent cleanup.

**Acceptance:**
- Canonical output contains all persistent gameplay state required to continue and excludes runtime-only handles/resources.
- Map/set/object ordering is explicit where it affects hashing.
- The task distinguishes CONTENT_ONLY from MOTION_CHANGED semantics when simulation snapshots move.
- No expected JSON or hash is re-recorded without an intentional gameplay delta and exact review.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** NO_CHANGE is a successful terminal result when the scoped defect cannot be reproduced and the live contract is already protected. Return exact evidence; never fabricate a bug to force a PR.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0410 --format prompt`
