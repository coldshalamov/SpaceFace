<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# Determinism, replay, save, and lifecycle

Protect same-seed behavior, save/reload continuity, shell parity, and repeated lifecycle transitions.

**Tasks:** 5 · **Range:** `JULES-0091`–`JULES-0095`

## JULES-0091 — Core rng streams — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-rng`

**Objective:** Exercise core RNG streams with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** core RNG streams: seed normalization, repeated sequences, hash32 stability, stream separation, and extreme integer inputs.

**Inspect:** `src/core/rng.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0091 --format prompt`

## JULES-0092 — Event delivery order — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** s · **Collision:** `det-event-order`

**Objective:** Run event delivery order twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation, then fix only a demonstrated ambient-state or ordering leak.

**Context:** event delivery order: subscription order, unsubscribe during emit, nested emit, duplicate handlers, and payload mutation.

**Inspect:** `src/core/eventBus.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0092 --format prompt`

## JULES-0093 — Save migrations — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-save-migrations`

**Objective:** Run save migrations twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save, then fix only a demonstrated ambient-state or ordering leak.

**Context:** save migrations: idempotent multi-version migration, missing fields, invalid enums, old backend flags, and repeated load/save.

**Inspect:** `src/save/saveSystem.js` `src/systems/adventureMigration.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0093 --format prompt`

## JULES-0094 — Restore and autosave arbitration — remove accidental insertion-order dependence

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-save-arbitration`

**Objective:** Exercise restore and autosave arbitration with equivalent maps, entity lists, event arrivals, or catalog rows inserted in different valid orders. Protect the intended order contract from accidental JavaScript iteration dependence.

**Context:** restore and autosave arbitration: nested restores, stale outer failure, latest-route callback, autosave during restore, and error publication ownership.

**Inspect:** `src/save/saveSystem.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0094 --format prompt`

## JULES-0095 — Input tape and action edges — prove same-seed repeatability

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `det-input-replay`

**Objective:** Run input tape and action edges twice from independently constructed state with the same seed and inputs. Add a focused semantic comparison around tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay, then fix only a demonstrated ambient-state or ordering leak.

**Context:** input tape and action edges: tap/hold thresholds in sim ticks, focus reset, scheme changes, action edge serialization, and repeated replay.

**Inspect:** `src/systems/input.js` `src/systems/masslineInputGrammar.js`

**Read first:** `build_map.md`, `AGENTS.md`, `ARCHITECTURE.md`, `test/AGENTS.md`, `docs/COMMON_BUGS.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0095 --format prompt`
