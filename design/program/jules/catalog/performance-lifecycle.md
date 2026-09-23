<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->

# Performance, allocation, residency, and disposal

Find measurable structural waste and lifetime leaks without reducing default visual or gameplay quality.

**Tasks:** 1 · **Range:** `JULES-0096`–`JULES-0096`

## JULES-0096 — Tactical ai cadence — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-ai`

**Objective:** Measure tactical AI cadence for recurring allocation in its normal update/render path, concentrating on off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** tactical AI cadence: off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation.

**Inspect:** `src/ai/stack.js` `src/systems/aiPorts.js` `src/ai/perception.js`

**Read first:** `build_map.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of tactical AI cadence in the smallest representative route.
2. Attribute the result to a concrete owner in off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0096 --format prompt`
