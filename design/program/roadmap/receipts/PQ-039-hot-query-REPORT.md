# PQ-039 — PERF-05 deterministic hot-query implementation receipt

```yaml
packet: PQ-039
scope: one owner-facing deterministic hostile-query batch for materialized NPC jobs
implementationBranch: claude/perf00-20260727
implementationParent: 75238d150948590b96e3a5512e271fcb68767f94
implementationCommit: bfb189b4
acceptanceCandidate: this_receipt_commit
routeClaim: integrated_structural_green
acceptanceClaim: deterministic_parity_and_query_scale_green
disposition: PASS
qualityInvariant: preserved
nativeClaimRequired: false
```

## What this receipt claims

PERF-05's first proven hot query is replaced on the ordinary simulation route. Materialized NPC jobs no longer run
one `state.entityList` hostile scan per job. `npcJobsRuntime` now builds all eligible threat requests, executes one
owner-facing `SpatialHash.queryRadiusBatch()` for that cadence, resolves stable result IDs through authoritative
`GameState`, and then advances/drives jobs in their existing deterministic order.

The production growth target for this query is now represented directly in code:

```text
O(requests + nearby broadphase candidates + same-tick changes)
```

instead of:

```text
O(materialized jobs × total entities)
```

The selected nearest hostile preserves the existing live/type/team filter and strict radius rule (`distance² <
radius²`). Exact-distance ties now use the lower stable entity ID, as required by PQ-039, rather than inheriting
incidental `entityList` insertion order.

This is terminal acceptance for PERF-05's canonical completion proof: selected-ID parity, stable ordering, bounded
scratch, and a deterministic candidate-visit scale curve. It does not claim an FPS, frame-time, CPU-time, GPU,
compositor, or resource improvement from this workstation. Those timing magnitudes are optional follow-up evidence,
not a reason to keep an already-proven algorithmic replacement open.

## Implemented architecture

### Bounded nearest-query owner

`src/core/spatialQuery.js` now provides `createNearestEntityQueryService(state, options)`. One service instance owns:

- retained request records, candidate arrays, per-request dedupe sets, diagnostics, and high-water storage;
- stable request/job ID, source entity ID, scalar X/Z origin, radius, fixed entity type/team filter, and top-1 limit;
- squared-distance selection with strict boundary exclusion and stable-ID tie ordering;
- ID-only results, with every broadphase/index candidate re-resolved through `state.entities` before eligibility;
- rejection of destroyed, stale, wrong-type, and wrong-team candidates;
- one inactive-hash fallback traversal over `entityIndex.ships` (or `entityList` only when that index is unavailable);
- same-tick `entity:spawned` ID supplementation for entities published after physics refreshed the hash;
- a retained exceptional-ID domain for live non-colliding ships that are intentionally absent from the collider hash;
- destroy/reset/state-replacement cleanup without retaining entity-object references across ticks; and
- an optional diagnostic full-scan shadow oracle, disabled on the ordinary production route.

The service clears candidate arrays and dedupe contents before returning from `execute()`. Its pooled request objects
retain scalar IDs/results only. A new state, new game, or deserialize clears pending spawn and exceptional identity
state so IDs cannot bleed across lifecycle boundaries.

### Retained SpatialHash batch scratch

`src/core/spatialHash.js#queryRadiusBatch()` keeps its existing query semantics while replacing per-batch
`map`/`find`/`filter`/`reduce`, spread-bound computation, and fresh footprint/meta objects with retained high-water
scratch and indexed loops:

- footprint records are reused per request slot;
- unique-query metadata records and dedupe sets are reused per unique footprint;
- static-query result transport uses one stable scratch record;
- union bounds and candidate diagnostics are accumulated scalarly;
- request/output references are released after the call so the hash does not retain caller or entity objects;
- ordinary independent outputs keep exact scalar candidate ordering; and
- opt-in exact-footprint and active-bucket-superset sharing remains immutable and compatible with existing AI
  sensor consumers.

The existing layered static/dynamic buckets, static query cache, incremental dynamic membership, query diagnostics,
and caller-owned output arrays remain the only simulation spatial index and broadphase contract.

### NPC jobs two-pass cadence

`src/systems/npcJobsRuntime.js` now:

1. keeps its existing `Object.keys(byId)` deterministic job order;
2. builds requests only for live, materialized, non-corrupt, non-complete jobs;
3. selects `FLEE_RADIUS` or `RESUME_RADIUS` exactly from the current job phase;
4. executes one batch for all eligible jobs;
5. matches retained results back to stable job/source IDs;
6. re-resolves the selected hostile through `state.entities` immediately before interrupt/resume ownership;
7. performs the existing cleanup, virtual relink, advance, terminal release, and drive sequence in job order; and
8. records spawn/destroy lifecycle deltas from the existing bus without adding a second spatial index.

The runtime's former `_nearestHostile()` `entityList` scan is removed from the production route. `_findEntityByRecordId()`
remains unchanged because it is a sector rematerialization join, not the admitted per-job hostile hot query.

## Concrete reread repair

One direct reread of the completed implementation found one lifecycle issue: replacing the authoritative state object
cleared exceptional IDs but could leave same-tick spawn IDs from the prior state. `setState()` now clears both pending
spawn buffers and exceptional identity storage before the new state can be queried.

No additional broad review or validation loop was opened after that repair.

The 2026-08-04 recovery audit found one evidence-access gap rather than a query defect: retained query counters were
private to the runtime's service instance. `npcJobsRuntime.threatQueryDiagnostics()` and the matching helper now
return a detached scalar snapshot of batches, requests, candidates, results, scratch growth, lifecycle supplements,
shadow checks, and high-water requests. Generic sampled owner timing was already available as
`perfRuntime.getReport().systems.npcJobsRuntime`; no second timer or headed harness was added.

## Focused deterministic verification

| Gate | Result |
|---|---|
| `node --check` on `spatialQuery`, `spatialHash`, and `npcJobsRuntime` | **PASS** |
| `node --test test/npc-jobs-runtime-spatial-query.test.mjs` | **6 pass / 0 fail** |
| Combined NPC kernel/runtime/convergence/natural-census/query suite | **67 pass / 0 fail** |
| `node scripts/check-spatial-hash-contract.mjs` | **PASS** |
| `node scripts/check-static-spatial-query-cache.mjs` | **PASS** — output parity, immutable sharing, live dynamic invalidation, and static-version invalidation preserved |
| `npm run check:sim:compare` | **PASS** — uninterrupted and reload hashes identical |

The focused suite covers:

- live/type/team eligibility and authoritative stale-ID rejection;
- strict radius exclusion and stable lower-ID exact ties;
- active-hash, non-collider exceptional, same-tick spawn, and inactive-hash fallback routes;
- retained request/output/dedupe and SpatialHash footprint/meta high-water scratch;
- full-scan shadow parity in stable request order across ties, empty/boundary cases, stale identity,
  destroy, and same-tick spawn churn (`3` checks / `0` mismatches);
- an exact 1x/5x curve (`100 -> 500` entities) with the selected ID unchanged and nearby candidate
  visits flat at `1 -> 1`;
- exactly one `queryRadiusBatch()` call for two eligible materialized jobs.

The static-cache compatibility check retained its deterministic candidate-count contract (`1,002,240` uncached visits
versus `3,076` cached/shared visits in its fixed fixture). Its elapsed-time fields are not used as acceptance evidence on
this contended workstation.

Per the architecture-first execution direction, no broad baseline matrix, test-of-test expansion, repeated adversarial
loop, or workstation FPS run was opened after the focused gates passed.

## Preserved boundaries

- `GameState` remains the only simulation authority; neither the query service nor `SpatialHash` retains entity-object
  authority across ticks.
- Fixed-step order, 60 Hz behavior, catch-up cap, accumulator remainder, backlog shedding, and presentation scheduling
  are unchanged.
- NPC job phase cadence, FLEE/RESUME radii, strict radius behavior, interrupt/resume ownership, virtual catch-up,
  movement intent, save shape, and sector relink behavior are unchanged outside deterministic tie ordering.
- Content, population, effects, draw distance, materials, lighting, render quality, and default visual quality were not
  reduced.
- Browser and Electron retain the same simulation and WebGL2 routes.
- Cinematic intro/menu, compact third-person HUD, Massline behavior, assets, package dependencies, and source/release
  manifests were not modified.
- No production GLB or texture was touched.

## Terminal boundary and retained repository red

No Browser/Electron run is required to close PERF-05. The authoritative execution plan defines its completion proof
as deterministic target parity plus a candidate-visit scale curve and explicitly calls this the lightest packet that
should not be over-proven. The later packet's `performance-hot-query` broker name has no implemented manifest and
adds no missing semantic observer. If product owners later want the absolute CPU magnitude, run one matched final
runtime claim against the owner snapshot and existing sampled `npcJobsRuntime` timing; do not treat that optional
measurement as packet correctness or repeat it unchanged.

One declared adjacent command is red on current master: `npm run check:encounter-director` reaches its unrelated
two-day soak assertion with `got 2` encounters. The PQ-039 diff does not touch the encounter planner/check and every
queue-listed PQ-039 gate is green. This exact red is retained for the encounter owner/integrator rather than widening
the hot-query packet or rerunning an unchanged check.
