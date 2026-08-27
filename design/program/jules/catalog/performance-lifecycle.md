<!-- GENERATED FROM ../task-bank.json; DO NOT EDIT BY HAND -->
# Performance, allocation, residency, and disposal

Find measurable structural waste and lifetime leaks without reducing default visual or gameplay quality.

**Tasks:** 90 · **Range:** `JULES-0411`–`JULES-0500`

## JULES-0411 — Renderer frame preparation and draw — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-renderer`

**Objective:** Measure renderer frame preparation and draw for recurring allocation in its normal update/render path, concentrating on per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** renderer frame preparation and draw: per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement.

**Inspect:** `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of renderer frame preparation and draw in the smallest representative route.
2. Attribute the result to a concrete owner in per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0411 --format prompt`

## JULES-0412 — Renderer frame preparation and draw — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-renderer`

**Objective:** Profile renderer frame preparation and draw for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** renderer frame preparation and draw: per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement.

**Inspect:** `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of renderer frame preparation and draw in the smallest representative route.
2. Attribute the result to a concrete owner in per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0412 --format prompt`

## JULES-0413 — Renderer frame preparation and draw — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-renderer`

**Objective:** Audit renderer frame preparation and draw caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement.

**Context:** renderer frame preparation and draw: per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement.

**Inspect:** `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of renderer frame preparation and draw in the smallest representative route.
2. Attribute the result to a concrete owner in per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0413 --format prompt`

## JULES-0414 — Renderer frame preparation and draw — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-renderer`

**Objective:** Run repeated create/use/remove cycles for renderer frame preparation and draw, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement. Repair one proven leak.

**Context:** renderer frame preparation and draw: per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement.

**Inspect:** `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of renderer frame preparation and draw in the smallest representative route.
2. Attribute the result to a concrete owner in per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0414 --format prompt`

## JULES-0415 — Renderer frame preparation and draw — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-renderer`

**Objective:** Use the repository performance witness/probe appropriate to renderer frame preparation and draw, identify its highest current structural cost in per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** renderer frame preparation and draw: per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement.

**Inspect:** `src/render/renderer.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of renderer frame preparation and draw in the smallest representative route.
2. Attribute the result to a concrete owner in per-frame allocation, duplicate traversal, prepare/draw ownership, resource lookups, and frame-tail measurement; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0415 --format prompt`

## JULES-0416 — World visual factory — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-visual-factory`

**Objective:** Measure world visual factory for recurring allocation in its normal update/render path, concentrating on geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** world visual factory: geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence.

**Inspect:** `src/render/visualFactory.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of world visual factory in the smallest representative route.
2. Attribute the result to a concrete owner in geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0416 --format prompt`

## JULES-0417 — World visual factory — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-visual-factory`

**Objective:** Profile world visual factory for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** world visual factory: geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence.

**Inspect:** `src/render/visualFactory.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of world visual factory in the smallest representative route.
2. Attribute the result to a concrete owner in geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0417 --format prompt`

## JULES-0418 — World visual factory — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-visual-factory`

**Objective:** Audit world visual factory caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence.

**Context:** world visual factory: geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence.

**Inspect:** `src/render/visualFactory.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of world visual factory in the smallest representative route.
2. Attribute the result to a concrete owner in geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0418 --format prompt`

## JULES-0419 — World visual factory — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-visual-factory`

**Objective:** Run repeated create/use/remove cycles for world visual factory, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence. Repair one proven leak.

**Context:** world visual factory: geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence.

**Inspect:** `src/render/visualFactory.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of world visual factory in the smallest representative route.
2. Attribute the result to a concrete owner in geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0419 --format prompt`

## JULES-0420 — World visual factory — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-visual-factory`

**Objective:** Use the repository performance witness/probe appropriate to world visual factory, identify its highest current structural cost in geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** world visual factory: geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence.

**Inspect:** `src/render/visualFactory.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of world visual factory in the smallest representative route.
2. Attribute the result to a concrete owner in geometry/material reuse, repeated profile application, hidden object updates, disposal, and prop construction cadence; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0420 --format prompt`

## JULES-0421 — Pooled vfx runtime — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-vfx`

**Objective:** Measure pooled VFX runtime for recurring allocation in its normal update/render path, concentrating on pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** pooled VFX runtime: pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of pooled VFX runtime in the smallest representative route.
2. Attribute the result to a concrete owner in pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0421 --format prompt`

## JULES-0422 — Pooled vfx runtime — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-vfx`

**Objective:** Profile pooled VFX runtime for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** pooled VFX runtime: pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of pooled VFX runtime in the smallest representative route.
2. Attribute the result to a concrete owner in pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0422 --format prompt`

## JULES-0423 — Pooled vfx runtime — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-vfx`

**Objective:** Audit pooled VFX runtime caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse.

**Context:** pooled VFX runtime: pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of pooled VFX runtime in the smallest representative route.
2. Attribute the result to a concrete owner in pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0423 --format prompt`

## JULES-0424 — Pooled vfx runtime — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-vfx`

**Objective:** Run repeated create/use/remove cycles for pooled VFX runtime, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse. Repair one proven leak.

**Context:** pooled VFX runtime: pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of pooled VFX runtime in the smallest representative route.
2. Attribute the result to a concrete owner in pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0424 --format prompt`

## JULES-0425 — Pooled vfx runtime — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-vfx`

**Objective:** Use the repository performance witness/probe appropriate to pooled VFX runtime, identify its highest current structural cost in pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** pooled VFX runtime: pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse.

**Inspect:** `src/render/vfx.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of pooled VFX runtime in the smallest representative route.
2. Attribute the result to a concrete owner in pool scanning, buffer updates, per-event allocation, dead-particle compaction, and shader/material reuse; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:presentation`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0425 --format prompt`

## JULES-0426 — Space background compositor — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-space-background`

**Objective:** Measure space background compositor for recurring allocation in its normal update/render path, concentrating on layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** space background compositor: layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching.

**Inspect:** `src/render/spaceBackground.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of space background compositor in the smallest representative route.
2. Attribute the result to a concrete owner in layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0426 --format prompt`

## JULES-0427 — Space background compositor — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-space-background`

**Objective:** Profile space background compositor for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** space background compositor: layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching.

**Inspect:** `src/render/spaceBackground.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of space background compositor in the smallest representative route.
2. Attribute the result to a concrete owner in layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0427 --format prompt`

## JULES-0428 — Space background compositor — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `perf-space-background`

**Objective:** Audit space background compositor caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching.

**Context:** space background compositor: layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching.

**Inspect:** `src/render/spaceBackground.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of space background compositor in the smallest representative route.
2. Attribute the result to a concrete owner in layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0428 --format prompt`

## JULES-0429 — Space background compositor — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `perf-space-background`

**Objective:** Run repeated create/use/remove cycles for space background compositor, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching. Repair one proven leak.

**Context:** space background compositor: layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching.

**Inspect:** `src/render/spaceBackground.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of space background compositor in the smallest representative route.
2. Attribute the result to a concrete owner in layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0429 --format prompt`

## JULES-0430 — Space background compositor — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-space-background`

**Objective:** Use the repository performance witness/probe appropriate to space background compositor, identify its highest current structural cost in layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** space background compositor: layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching.

**Inspect:** `src/render/spaceBackground.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of space background compositor in the smallest representative route.
2. Attribute the result to a concrete owner in layer updates, camera-relative transforms, object churn, draw calls, and no-quality-loss caching; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0430 --format prompt`

## JULES-0431 — Starfield — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** m · **Collision:** `perf-starfield`

**Objective:** Measure starfield for recurring allocation in its normal update/render path, concentrating on buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** starfield: buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering.

**Inspect:** `src/render/starfield.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of starfield in the smallest representative route.
2. Attribute the result to a concrete owner in buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0431 --format prompt`

## JULES-0432 — Starfield — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** m · **Collision:** `perf-starfield`

**Objective:** Profile starfield for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** starfield: buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering.

**Inspect:** `src/render/starfield.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of starfield in the smallest representative route.
2. Attribute the result to a concrete owner in buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0432 --format prompt`

## JULES-0433 — Starfield — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `perf-starfield`

**Objective:** Audit starfield caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering.

**Context:** starfield: buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering.

**Inspect:** `src/render/starfield.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of starfield in the smallest representative route.
2. Attribute the result to a concrete owner in buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0433 --format prompt`

## JULES-0434 — Starfield — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `perf-starfield`

**Objective:** Run repeated create/use/remove cycles for starfield, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering. Repair one proven leak.

**Context:** starfield: buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering.

**Inspect:** `src/render/starfield.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of starfield in the smallest representative route.
2. Attribute the result to a concrete owner in buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0434 --format prompt`

## JULES-0435 — Starfield — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-starfield`

**Objective:** Use the repository performance witness/probe appropriate to starfield, identify its highest current structural cost in buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** starfield: buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering.

**Inspect:** `src/render/starfield.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of starfield in the smallest representative route.
2. Attribute the result to a concrete owner in buffer rebuilds, twinkle updates, culling, material reuse, and stable sky-depth rendering; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0435 --format prompt`

## JULES-0436 — Parallax layers — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-parallax`

**Objective:** Measure parallax layers for recurring allocation in its normal update/render path, concentrating on camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** parallax layers: camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling.

**Inspect:** `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of parallax layers in the smallest representative route.
2. Attribute the result to a concrete owner in camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0436 --format prompt`

## JULES-0437 — Parallax layers — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-parallax`

**Objective:** Profile parallax layers for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** parallax layers: camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling.

**Inspect:** `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of parallax layers in the smallest representative route.
2. Attribute the result to a concrete owner in camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0437 --format prompt`

## JULES-0438 — Parallax layers — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `perf-parallax`

**Objective:** Audit parallax layers caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling.

**Context:** parallax layers: camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling.

**Inspect:** `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of parallax layers in the smallest representative route.
2. Attribute the result to a concrete owner in camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0438 --format prompt`

## JULES-0439 — Parallax layers — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `perf-parallax`

**Objective:** Run repeated create/use/remove cycles for parallax layers, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling. Repair one proven leak.

**Context:** parallax layers: camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling.

**Inspect:** `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of parallax layers in the smallest representative route.
2. Attribute the result to a concrete owner in camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0439 --format prompt`

## JULES-0440 — Parallax layers — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-parallax`

**Objective:** Use the repository performance witness/probe appropriate to parallax layers, identify its highest current structural cost in camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** parallax layers: camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling.

**Inspect:** `src/render/parallaxLayers.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of parallax layers in the smallest representative route.
2. Attribute the result to a concrete owner in camera-motion updates, allocation, instance reuse, layer cadence, and pop-free culling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0440 --format prompt`

## JULES-0441 — Bloom and post-processing — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-post`

**Objective:** Measure bloom and post-processing for recurring allocation in its normal update/render path, concentrating on render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** bloom and post-processing: render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity.

**Inspect:** `src/render/bloom.js`, `src/render/post/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of bloom and post-processing in the smallest representative route.
2. Attribute the result to a concrete owner in render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0441 --format prompt`

## JULES-0442 — Bloom and post-processing — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-post`

**Objective:** Profile bloom and post-processing for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** bloom and post-processing: render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity.

**Inspect:** `src/render/bloom.js`, `src/render/post/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of bloom and post-processing in the smallest representative route.
2. Attribute the result to a concrete owner in render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0442 --format prompt`

## JULES-0443 — Bloom and post-processing — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-post`

**Objective:** Audit bloom and post-processing caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity.

**Context:** bloom and post-processing: render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity.

**Inspect:** `src/render/bloom.js`, `src/render/post/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of bloom and post-processing in the smallest representative route.
2. Attribute the result to a concrete owner in render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0443 --format prompt`

## JULES-0444 — Bloom and post-processing — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-post`

**Objective:** Run repeated create/use/remove cycles for bloom and post-processing, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity. Repair one proven leak.

**Context:** bloom and post-processing: render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity.

**Inspect:** `src/render/bloom.js`, `src/render/post/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of bloom and post-processing in the smallest representative route.
2. Attribute the result to a concrete owner in render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0444 --format prompt`

## JULES-0445 — Bloom and post-processing — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-post`

**Objective:** Use the repository performance witness/probe appropriate to bloom and post-processing, identify its highest current structural cost in render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** bloom and post-processing: render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity.

**Inspect:** `src/render/bloom.js`, `src/render/post/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of bloom and post-processing in the smallest representative route.
2. Attribute the result to a concrete owner in render-target lifetime, pass duplication, resize churn, material/program reuse, and unchanged visual parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0445 --format prompt`

## JULES-0446 — Authored asset loading — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-asset-loader`

**Objective:** Measure authored asset loading for recurring allocation in its normal update/render path, concentrating on duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** authored asset loading: duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of authored asset loading in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0446 --format prompt`

## JULES-0447 — Authored asset loading — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-asset-loader`

**Objective:** Profile authored asset loading for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** authored asset loading: duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of authored asset loading in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0447 --format prompt`

## JULES-0448 — Authored asset loading — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-asset-loader`

**Objective:** Audit authored asset loading caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention.

**Context:** authored asset loading: duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of authored asset loading in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0448 --format prompt`

## JULES-0449 — Authored asset loading — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-asset-loader`

**Objective:** Run repeated create/use/remove cycles for authored asset loading, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention. Repair one proven leak.

**Context:** authored asset loading: duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of authored asset loading in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0449 --format prompt`

## JULES-0450 — Authored asset loading — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-asset-loader`

**Objective:** Use the repository performance witness/probe appropriate to authored asset loading, identify its highest current structural cost in duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** authored asset loading: duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention.

**Inspect:** `src/render/assetLoader.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of authored asset loading in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate fetch/decode, cancellation, promise caches, lease accounting, transient buffers, and diagnostic retention; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:asset-startup-readiness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0450 --format prompt`

## JULES-0451 — Ship parts composition — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-parts-library`

**Objective:** Measure ship parts composition for recurring allocation in its normal update/render path, concentrating on duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** ship parts composition: duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency.

**Inspect:** `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of ship parts composition in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0451 --format prompt`

## JULES-0452 — Ship parts composition — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-parts-library`

**Objective:** Profile ship parts composition for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** ship parts composition: duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency.

**Inspect:** `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of ship parts composition in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0452 --format prompt`

## JULES-0453 — Ship parts composition — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-parts-library`

**Objective:** Audit ship parts composition caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency.

**Context:** ship parts composition: duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency.

**Inspect:** `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of ship parts composition in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0453 --format prompt`

## JULES-0454 — Ship parts composition — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-parts-library`

**Objective:** Run repeated create/use/remove cycles for ship parts composition, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency. Repair one proven leak.

**Context:** ship parts composition: duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency.

**Inspect:** `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of ship parts composition in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0454 --format prompt`

## JULES-0455 — Ship parts composition — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-parts-library`

**Objective:** Use the repository performance witness/probe appropriate to ship parts composition, identify its highest current structural cost in duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** ship parts composition: duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency.

**Inspect:** `src/render/partsLibrary.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of ship parts composition in the smallest representative route.
2. Attribute the result to a concrete owner in duplicate geometry/material instances, whole-ship composition caches, missing-route retries, disposal, and residency; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:assets:live`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0455 --format prompt`

## JULES-0456 — Shader and asset precompile — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-precompile`

**Objective:** Measure shader and asset precompile for recurring allocation in its normal update/render path, concentrating on live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** shader and asset precompile: live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity.

**Inspect:** `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of shader and asset precompile in the smallest representative route.
2. Attribute the result to a concrete owner in live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0456 --format prompt`

## JULES-0457 — Shader and asset precompile — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-precompile`

**Objective:** Profile shader and asset precompile for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** shader and asset precompile: live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity.

**Inspect:** `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of shader and asset precompile in the smallest representative route.
2. Attribute the result to a concrete owner in live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0457 --format prompt`

## JULES-0458 — Shader and asset precompile — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-precompile`

**Objective:** Audit shader and asset precompile caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity.

**Context:** shader and asset precompile: live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity.

**Inspect:** `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of shader and asset precompile in the smallest representative route.
2. Attribute the result to a concrete owner in live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0458 --format prompt`

## JULES-0459 — Shader and asset precompile — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-precompile`

**Objective:** Run repeated create/use/remove cycles for shader and asset precompile, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity. Repair one proven leak.

**Context:** shader and asset precompile: live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity.

**Inspect:** `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of shader and asset precompile in the smallest representative route.
2. Attribute the result to a concrete owner in live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0459 --format prompt`

## JULES-0460 — Shader and asset precompile — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-precompile`

**Objective:** Use the repository performance witness/probe appropriate to shader and asset precompile, identify its highest current structural cost in live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** shader and asset precompile: live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity.

**Inspect:** `src/render/precompile.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of shader and asset precompile in the smallest representative route.
2. Attribute the result to a concrete owner in live variant coverage, redundant compilation, invalid cache keys, admission timing, and browser/Electron parity; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:shader-compile`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0460 --format prompt`

## JULES-0461 — Adaptive quality and lod — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-adaptive-lod`

**Objective:** Measure adaptive quality and LOD for recurring allocation in its normal update/render path, concentrating on hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** adaptive quality and LOD: hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds.

**Inspect:** `src/render/adaptiveQuality.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of adaptive quality and LOD in the smallest representative route.
2. Attribute the result to a concrete owner in hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0461 --format prompt`

## JULES-0462 — Adaptive quality and lod — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-adaptive-lod`

**Objective:** Profile adaptive quality and LOD for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** adaptive quality and LOD: hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds.

**Inspect:** `src/render/adaptiveQuality.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of adaptive quality and LOD in the smallest representative route.
2. Attribute the result to a concrete owner in hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0462 --format prompt`

## JULES-0463 — Adaptive quality and lod — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `perf-adaptive-lod`

**Objective:** Audit adaptive quality and LOD caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds.

**Context:** adaptive quality and LOD: hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds.

**Inspect:** `src/render/adaptiveQuality.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of adaptive quality and LOD in the smallest representative route.
2. Attribute the result to a concrete owner in hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0463 --format prompt`

## JULES-0464 — Adaptive quality and lod — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `perf-adaptive-lod`

**Objective:** Run repeated create/use/remove cycles for adaptive quality and LOD, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds. Repair one proven leak.

**Context:** adaptive quality and LOD: hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds.

**Inspect:** `src/render/adaptiveQuality.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of adaptive quality and LOD in the smallest representative route.
2. Attribute the result to a concrete owner in hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0464 --format prompt`

## JULES-0465 — Adaptive quality and lod — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-adaptive-lod`

**Objective:** Use the repository performance witness/probe appropriate to adaptive quality and LOD, identify its highest current structural cost in hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** adaptive quality and LOD: hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds.

**Inspect:** `src/render/adaptiveQuality.js`, `src/render/lod.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of adaptive quality and LOD in the smallest representative route.
2. Attribute the result to a concrete owner in hysteresis, resize/DPR churn, LOD oscillation, default-quality preservation, and deterministic thresholds; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0465 --format prompt`

## JULES-0466 — Flight hud update path — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** low · **Size:** m · **Collision:** `perf-hud`

**Objective:** Measure flight HUD update path for recurring allocation in its normal update/render path, concentrating on DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** flight HUD update path: DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of flight HUD update path in the smallest representative route.
2. Attribute the result to a concrete owner in DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0466 --format prompt`

## JULES-0467 — Flight hud update path — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** m · **Collision:** `perf-hud`

**Objective:** Profile flight HUD update path for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** flight HUD update path: DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of flight HUD update path in the smallest representative route.
2. Attribute the result to a concrete owner in DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0467 --format prompt`

## JULES-0468 — Flight hud update path — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `perf-hud`

**Objective:** Audit flight HUD update path caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash.

**Context:** flight HUD update path: DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of flight HUD update path in the smallest representative route.
2. Attribute the result to a concrete owner in DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0468 --format prompt`

## JULES-0469 — Flight hud update path — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** low · **Size:** s · **Collision:** `perf-hud`

**Objective:** Run repeated create/use/remove cycles for flight HUD update path, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash. Repair one proven leak.

**Context:** flight HUD update path: DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of flight HUD update path in the smallest representative route.
2. Attribute the result to a concrete owner in DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0469 --format prompt`

## JULES-0470 — Flight hud update path — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-hud`

**Objective:** Use the repository performance witness/probe appropriate to flight HUD update path, identify its highest current structural cost in DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** flight HUD update path: DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash.

**Inspect:** `src/ui/hud.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of flight HUD update path in the smallest representative route.
2. Attribute the result to a concrete owner in DOM writes, string churn, unchanged-value updates, hidden mode work, listener lifetime, and layout thrash; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0470 --format prompt`

## JULES-0471 — Radar update path — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-radar`

**Objective:** Measure radar update path for recurring allocation in its normal update/render path, concentrating on glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** radar update path: glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of radar update path in the smallest representative route.
2. Attribute the result to a concrete owner in glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0471 --format prompt`

## JULES-0472 — Radar update path — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-radar`

**Objective:** Profile radar update path for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** radar update path: glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of radar update path in the smallest representative route.
2. Attribute the result to a concrete owner in glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0472 --format prompt`

## JULES-0473 — Radar update path — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `perf-radar`

**Objective:** Audit radar update path caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup.

**Context:** radar update path: glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of radar update path in the smallest representative route.
2. Attribute the result to a concrete owner in glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0473 --format prompt`

## JULES-0474 — Radar update path — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `perf-radar`

**Objective:** Run repeated create/use/remove cycles for radar update path, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup. Repair one proven leak.

**Context:** radar update path: glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of radar update path in the smallest representative route.
2. Attribute the result to a concrete owner in glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0474 --format prompt`

## JULES-0475 — Radar update path — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-radar`

**Objective:** Use the repository performance witness/probe appropriate to radar update path, identify its highest current structural cost in glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** radar update path: glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup.

**Inspect:** `src/ui/radar.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of radar update path in the smallest representative route.
2. Attribute the result to a concrete owner in glyph allocation, entity filtering, sort frequency, DOM/canvas updates, and stale marker cleanup; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0475 --format prompt`

## JULES-0476 — Tactical ai cadence — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-ai`

**Objective:** Measure tactical AI cadence for recurring allocation in its normal update/render path, concentrating on off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** tactical AI cadence: off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation.

**Inspect:** `src/ai/stack.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0476 --format prompt`

## JULES-0477 — Tactical ai cadence — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-ai`

**Objective:** Profile tactical AI cadence for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** tactical AI cadence: off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation.

**Inspect:** `src/ai/stack.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of tactical AI cadence in the smallest representative route.
2. Attribute the result to a concrete owner in off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0477 --format prompt`

## JULES-0478 — Tactical ai cadence — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-ai`

**Objective:** Audit tactical AI cadence caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation.

**Context:** tactical AI cadence: off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation.

**Inspect:** `src/ai/stack.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of tactical AI cadence in the smallest representative route.
2. Attribute the result to a concrete owner in off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0478 --format prompt`

## JULES-0479 — Tactical ai cadence — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-ai`

**Objective:** Run repeated create/use/remove cycles for tactical AI cadence, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation. Repair one proven leak.

**Context:** tactical AI cadence: off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation.

**Inspect:** `src/ai/stack.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of tactical AI cadence in the smallest representative route.
2. Attribute the result to a concrete owner in off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0479 --format prompt`

## JULES-0480 — Tactical ai cadence — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-ai`

**Objective:** Use the repository performance witness/probe appropriate to tactical AI cadence, identify its highest current structural cost in off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** tactical AI cadence: off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation.

**Inspect:** `src/ai/stack.js`, `src/systems/aiPorts.js`, `src/ai/perception.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of tactical AI cadence in the smallest representative route.
2. Attribute the result to a concrete owner in off-table cadence, repeated spatial queries, contact allocations, inactive actor work, and full-rate local-threat preservation; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0480 --format prompt`

## JULES-0481 — Traffic and world cadence — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-traffic-world`

**Objective:** Measure traffic and world cadence for recurring allocation in its normal update/render path, concentrating on far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** traffic and world cadence: far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of traffic and world cadence in the smallest representative route.
2. Attribute the result to a concrete owner in far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0481 --format prompt`

## JULES-0482 — Traffic and world cadence — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-traffic-world`

**Objective:** Profile traffic and world cadence for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** traffic and world cadence: far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of traffic and world cadence in the smallest representative route.
2. Attribute the result to a concrete owner in far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0482 --format prompt`

## JULES-0483 — Traffic and world cadence — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-traffic-world`

**Objective:** Audit traffic and world cadence caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness.

**Context:** traffic and world cadence: far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of traffic and world cadence in the smallest representative route.
2. Attribute the result to a concrete owner in far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0483 --format prompt`

## JULES-0484 — Traffic and world cadence — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-traffic-world`

**Objective:** Run repeated create/use/remove cycles for traffic and world cadence, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness. Repair one proven leak.

**Context:** traffic and world cadence: far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of traffic and world cadence in the smallest representative route.
2. Attribute the result to a concrete owner in far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0484 --format prompt`

## JULES-0485 — Traffic and world cadence — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-traffic-world`

**Objective:** Use the repository performance witness/probe appropriate to traffic and world cadence, identify its highest current structural cost in far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** traffic and world cadence: far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness.

**Inspect:** `src/systems/traffic.js`, `src/systems/world.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of traffic and world cadence in the smallest representative route.
2. Attribute the result to a concrete owner in far-actor updates, spawn/despawn churn, route computation, visibility/admission disagreement, and local correctness; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0485 --format prompt`

## JULES-0486 — Physics and spatial-query path — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-physics-spatial`

**Objective:** Measure physics and spatial-query path for recurring allocation in its normal update/render path, concentrating on sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** physics and spatial-query path: sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of physics and spatial-query path in the smallest representative route.
2. Attribute the result to a concrete owner in sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
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

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0486 --format prompt`

## JULES-0487 — Physics and spatial-query path — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-physics-spatial`

**Objective:** Profile physics and spatial-query path for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** physics and spatial-query path: sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of physics and spatial-query path in the smallest representative route.
2. Attribute the result to a concrete owner in sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0487 --format prompt`

## JULES-0488 — Physics and spatial-query path — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** high · **Size:** m · **Collision:** `perf-physics-spatial`

**Objective:** Audit physics and spatial-query path caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization.

**Context:** physics and spatial-query path: sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of physics and spatial-query path in the smallest representative route.
2. Attribute the result to a concrete owner in sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0488 --format prompt`

## JULES-0489 — Physics and spatial-query path — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** s · **Collision:** `perf-physics-spatial`

**Objective:** Run repeated create/use/remove cycles for physics and spatial-query path, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization. Repair one proven leak.

**Context:** physics and spatial-query path: sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of physics and spatial-query path in the smallest representative route.
2. Attribute the result to a concrete owner in sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0489 --format prompt`

## JULES-0490 — Physics and spatial-query path — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-physics-spatial`

**Objective:** Use the repository performance witness/probe appropriate to physics and spatial-query path, identify its highest current structural cost in sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** physics and spatial-query path: sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization.

**Inspect:** `src/core/physicsAuthority.js`, `src/core/rapierCollisionWorld.js`, `src/core/spatialHash.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of physics and spatial-query path in the smallest representative route.
2. Attribute the result to a concrete owner in sleeping bodies, duplicate queries, temporary arrays, body lookup maps, and deterministic structural optimization; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run probe:runtime-witness`
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0490 --format prompt`

## JULES-0491 — Economy and mission cadence — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-economy-missions`

**Objective:** Measure economy and mission cadence for recurring allocation in its normal update/render path, concentrating on unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** economy and mission cadence: unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling.

**Inspect:** `src/systems/economy.js`, `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of economy and mission cadence in the smallest representative route.
2. Attribute the result to a concrete owner in unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0491 --format prompt`

## JULES-0492 — Economy and mission cadence — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-economy-missions`

**Objective:** Profile economy and mission cadence for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** economy and mission cadence: unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling.

**Inspect:** `src/systems/economy.js`, `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of economy and mission cadence in the smallest representative route.
2. Attribute the result to a concrete owner in unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0492 --format prompt`

## JULES-0493 — Economy and mission cadence — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `perf-economy-missions`

**Objective:** Audit economy and mission cadence caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling.

**Context:** economy and mission cadence: unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling.

**Inspect:** `src/systems/economy.js`, `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of economy and mission cadence in the smallest representative route.
2. Attribute the result to a concrete owner in unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0493 --format prompt`

## JULES-0494 — Economy and mission cadence — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `perf-economy-missions`

**Objective:** Run repeated create/use/remove cycles for economy and mission cadence, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling. Repair one proven leak.

**Context:** economy and mission cadence: unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling.

**Inspect:** `src/systems/economy.js`, `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of economy and mission cadence in the smallest representative route.
2. Attribute the result to a concrete owner in unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0494 --format prompt`

## JULES-0495 — Economy and mission cadence — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-economy-missions`

**Objective:** Use the repository performance witness/probe appropriate to economy and mission cadence, identify its highest current structural cost in unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** economy and mission cadence: unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling.

**Inspect:** `src/systems/economy.js`, `src/systems/missions.js`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of economy and mission cadence in the smallest representative route.
2. Attribute the result to a concrete owner in unnecessary per-frame work, board regeneration, event subscriptions, large object cloning, and day/tick scheduling; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0495 --format prompt`

## JULES-0496 — Audio and presentation cue path — remove avoidable hot-path allocation

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P1 · **Risk:** medium · **Size:** m · **Collision:** `perf-audio-presentation`

**Objective:** Measure audio and presentation cue path for recurring allocation in its normal update/render path, concentrating on cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work. Remove one proven allocation source through scratch reuse, pooling, or representation changes without altering output.

**Context:** audio and presentation cue path: cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of audio and presentation cue path in the smallest representative route.
2. Attribute the result to a concrete owner in cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Before/after evidence names the allocation site and representative route.
- The change reduces allocation count/bytes or GC pressure measurably; code-size folklore is not evidence.
- Scratch or pooled state has explicit ownership and cannot leak data across entities/frames.
- Visual/gameplay output and deterministic sim behavior remain equivalent.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0496 --format prompt`

## JULES-0497 — Audio and presentation cue path — eliminate duplicate or over-frequent work

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-audio-presentation`

**Objective:** Profile audio and presentation cue path for repeated scans, derivations, uploads, DOM work, or calculations that run more often than their inputs change. Introduce the narrowest valid cadence/invalidation seam.

**Context:** audio and presentation cue path: cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of audio and presentation cue path in the smallest representative route.
2. Attribute the result to a concrete owner in cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The task proves the work is redundant or over-frequent before changing cadence.
- Near-player threats, input, collision, and other correctness-critical work remain full-rate.
- Invalidation is tied to real owner changes rather than a blind long interval.
- Before/after timings and focused correctness checks are recorded.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0497 --format prompt`

## JULES-0498 — Audio and presentation cue path — tighten cache and residency ownership

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** high · **Size:** m · **Collision:** `perf-audio-presentation`

**Objective:** Audit audio and presentation cue path caches, pools, prewarm state, and resident resources for unbounded growth, stale identity, rebuild-after-admission, or premature eviction. Focus on cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work.

**Context:** audio and presentation cue path: cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of audio and presentation cue path in the smallest representative route.
2. Attribute the result to a concrete owner in cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The lifecycle from key creation through reuse and eviction/disposal is documented by a focused test or trace.
- A fix uses bounded, identity-correct ownership; it neither pins everything nor evicts useful warm assets blindly.
- Repeated route/sector/screen cycles converge to a stable resource count.
- Default authored quality and startup readiness remain intact.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0498 --format prompt`

## JULES-0499 — Audio and presentation cue path — close disposal and listener leaks

**Model:** Flash (`gemini-3.6-flash`) · **Priority:** P2 · **Risk:** medium · **Size:** s · **Collision:** `perf-audio-presentation`

**Objective:** Run repeated create/use/remove cycles for audio and presentation cue path, counting listeners, timers, scene objects, bodies, DOM nodes, audio voices, or GPU resources relevant to cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work. Repair one proven leak.

**Context:** audio and presentation cue path: cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of audio and presentation cue path in the smallest representative route.
2. Attribute the result to a concrete owner in cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- Resource counts return to baseline or a documented bounded warm-cache plateau after repeated cycles.
- Cleanup is owned by the creator and is idempotent.
- The fix does not dispose shared leases still used elsewhere.
- A regression test or soak probe reproduces the old growth.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0499 --format prompt`

## JULES-0500 — Audio and presentation cue path — make one measured structural optimization

**Model:** Pro (`gemini-3.1-pro`) · **Priority:** P2 · **Risk:** medium · **Size:** m · **Collision:** `perf-audio-presentation`

**Objective:** Use the repository performance witness/probe appropriate to audio and presentation cue path, identify its highest current structural cost in cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work, and implement one bounded optimization. Do not optimize an unmeasured theory.

**Context:** audio and presentation cue path: cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work.

**Inspect:** `src/audio/audioSystem.js`, `src/systems/presentationOrchestrator.js`, `src/presentation/`

**Read first:** `CANONICAL_BUILD_MAP.md`, `AGENTS.md`, `design/PERF_BUDGET.md`, `src/render/AGENTS.md`, `docs/VALIDATION_WORKFLOW.md`

**Work:**
1. Measure or instrument the current cost/lifetime behavior of audio and presentation cue path in the smallest representative route.
2. Attribute the result to a concrete owner in cue normalization, duplicate fan-out, source pooling, listener lifetime, and muted-mode work; distinguish CPU, GPU, allocation, upload, residency, and lifecycle costs.
3. Implement one structural correction only when the measurement identifies a real pole or leak. Preserve the authored picture and simulation fidelity.
4. Repeat the same measurement and run focused correctness/visual checks once.

**Acceptance:**
- The same representative scenario and quality settings are used before and after.
- At least one load-bearing metric improves without shifting the cost into another worse frame-time bucket.
- No default resolution, DPR, draw distance, authored asset, population, particle, bloom, shadow, or simulation-quality cut is used.
- The PR states rollback conditions and preserves semantic/visual parity evidence.

**Suggested proof:**
- `npm run check:baseline`

**Honest negative result:** Return NO_CHANGE when the scoped cost is not measurable or another owner is the real pole. Record the attribution and do not land speculative micro-optimizations.

**Dispatch:** `node scripts/jules-dispatch.mjs --id JULES-0500 --format prompt`
