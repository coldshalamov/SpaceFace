# Wave-122 audit — lane: lod-in-frame

Branch `devin/1791504143-perf-w120`, HEAD `c3d84934c` (PR #257, contains wave-120 boot/popin/hitches + all of wave-121). Read-only audit; no code run beyond node-level probes.

`saturated: true` — the W121 saturation claim survives falsification at HEAD: every W121 remediated item verifies clean, the stand-in machinery is intact and layered, and no material lod-in-frame gap remains unaddressed. New scope (B1 whole-scene traversals) is enumerated below with evidence levels; what remains is vendored-three render-list fan-out and rare-path traverses, not a magic-frame defect.

## Regression verification — W121 machinery (PR #257, `c3d84934c`)

### blind-global B2 — owner-visibility memo

- **VERIFIED.** `assetResidency.js` — memo keyed `{present, visible, assetsVersion, writeSeq}` at `:1130-1148`; all three `state.assets` mutation sites bump `assetsVersion` (`:350`, `:485`, `:594`); `cleanupOwnerState` deletes the memo (`:616`); `visibilityRowOffGlass` virtual staleness is boundary-exact vs the 8th-advance oracle (holds through exactly 7 advances, drops at the 8th); amortized GC sweeps `max(256, size/8)` per present via a persistent `visibilityGcIter`. Live node probe confirmed: fresh `visibilityRowFor` verify → zero false staleness; post-consult mutation → only the true staleness row (2045 vs 2046) re-verified.
- **Ledger drift verify (F5).** `enforceSoftResidencyBudgets` still evicts on real overage (probe: 12 evictions driven); folded recompute emits `ledger-drift` events only on real mismatch (0 drift events across a retain/release/rotate/exit + 8×enforceBudget workload); owner-graph check runs every `LEDGER_VERIFY_EVERY_ENFORCES=4` sweeps.

### popin

- **VERIFIED.** `activePendingKeySet` memo on `pendingRequestsVersion` (`:78-86`); `sectorOwnerIndex` + per-entry counters kept in lockstep at every index/unindex site; running byte ledgers make `budgetTotals` O(1); `blockedRows` fold at `:1792-1795`/`:1889-1893`; `canonicalDiagnostics` epoch-memoized on `diagnosticsEpoch` (`:1680-1688`) so the deferred re-mint stays O(1) post-present; `enforceBudgetSteps` is leg 3 of the fused sector:exit iterator (renderer.js:19321-19351) and re-arms on the fault path.

### boot

- **VERIFIED.** `loadEnvelopeFromString` routes through `_restorePreparedEnvelopeAsync` with `acceptSeq` stamp (saveSystem.js:4148-4164); gzipped twin same (4167-4185); `setEmitSliceBudget('sector:exit',8)` + `('mode:changed',8)` restore-scoped at `:4843-4849`, cleared in `_closeRestoreSession`; `deserializeChunked` twins exist for recoveryEncounter/aceMemory.

### hitches

- **VERIFIED.** Exponential dedup-heartbeat backoff 1s→30s carries on all three ledgers: `warnDedup` (`warnDedup.js:39-42`), `laneWarn` (`renderer.js:2242-2244`), `busError` (`eventBus.js:141-144`). Quiet-gap heal: `laneWarn` re-earns verbatim budget at >60s silence (`renderer.js:2225-2227`); `warnDedup`/`busError` re-arm the heartbeat interval at the same gap.

### skeptic F1-F6

- **F1 swapEpoch — VERIFIED.** All three residencyOptions install sites re-stamp after the mint (sg02DynamicBodyOwner.js:3173, 3887, 4088); stale commits refused via `options.swapEpoch !== this._boundaryResidencySwapEpoch`; join-merges carry the bump.
- **F2 per-leg sector-exit guards — VERIFIED.** Clean fused iterator at `renderer.js:19378-19394` has per-leg try/catch stamping `noteLaneFault` + `laneWarn('sectorExitCleanup')`; the re-mint path at `:3220-3250` guards postLeg and enforceLeg independently; failure arms the resync + VerboseRestore.
- **F3 deferred restore `.catch` — VERIFIED.** saveSystem.js:4532-4536 chains `.catch` on both deferred async restores (`_restoreLegacyEnvelopeAsync`, `_restorePreparedEnvelopeAsync`), stamping `save:restore-failed`.
- **F4 native-rebuild abandon dispose — VERIFIED.** `rebuildWorldFromEntitiesSteps` (sg02DynamicBodyOwner.js:771-815) wraps the candidate in `try/finally { if (!committed) candidate.dispose(); }` — `iterator.return()` abandon runs the finally and frees the candidate.
- **F6 laneWarn quiet-gap heal — VERIFIED** (above).

## (a) Saturation falsify — verdict: HOLDS

Attempted falsification vectors, all closed:

1. **Stand-in mesh reality.** `visualOverrides.js:249-340` `lodStandInFor` builds `AuthoredResolvingStandIn` — a real THREE.Group of the resolved record's primitives at `STAND_IN_LOD_PREFERENCE` lod0>lod1>lod2, armed at committed basis (fit/scale/x semantics identical to the commit path) with recenter-xz/xyz + `authoredApproachYawDegFor` yaw. A visible stand-in is now the ship's own low-LOD body at committed extents, not a placeholder — the magic-frame bar is met by content even when a stand-in draws.
2. **Fallback octahedron is counted + bounded.** `resolvingMarkerFor` fires only when no resident record exists yet (cold boot → `admissionStandInPending` retries while the library resolves) or the record is unusable (`stand-in-record-unusable`, never retries). Both paths instrumented: `resolvingMarkerFallbacks++` at `:736` published via `publishResolvingMarkerFallbacks` → `render.resolvingMarkerFallbacks` counter. `STAND_IN_RETRY_MS=200` floor is the documented W121 residual.
3. **Materialization is on every visibility path.** `syncResolvingMarker` (renderer.js:5118-5126) is called at all three submit sites (`:26290`, `:26316`, `:26578`, `:26592`); `upgradeAdmissionStandIn` swaps octahedron→stand-in atomically (remove+add same step, no blank gap); `setBoundaryStandInResolver` carries the resolver.
4. **Known deferred surface is already adjudicated.** The BatchedMesh specimen gap and the F2/F3/F5 marker items were DOCUMENTED in prior waves — no re-report per the contract.
5. **No unwitnessed mount path.** `pendingSubjects` gate (`bloom.js:1201-1211`) hides never-compiled roots until admission; `sfAdmittedOnce` roots keep drawing their linked children while never-compiled additions are covered by the per-material scan + `renderBufferDirect` guard.

`resolvingMarkerFallbacks` is the live tripwire: if it ever grows past the cold-boot window on real hardware, the count is already instrumented for the owner to see.

## (b) New scope — B1 whole-scene traversals, enumerated

Per-present O(scene) walks still paid at HEAD, ranked:

| # | Walk | Site | Coverage | Cost at ~16.5k-node scale |
|---|------|------|----------|---------------------------|
| 1 | `projectObject` frustum-cull/render-list walk | vendored `three.module.js:17985-18080` | None — raw three.js, rebuilt per `renderer.render(scene,camera)` call | ~1 full recursive descent per render pass; frame total = pass count (main + shadow-light passes + bloom internals + graph scene/normal passes) |
| 2 | `shadowMap` per-light `renderObject` recursion | `three.module.js:9747-9757` | Light census decides WHICH lights cast (`_shadowCensusForFrame` epoch memo), but each remaining caster walks the whole graph | 1 full `scene.children` recursion per shadow-casting light per frame |
| 3 | `scene.updateMatrixWorld()` | `renderer.js:31727` (`_renderPostRoute`) | **COVERED** — vendored override at `three.module.js:103-146` skips `sfMatrixFrozen` clean subtrees when `!force`; single atomic walk replaces N-per-pass repeats (`matrixWorldAutoUpdate=false`, `renderer.js:10257`); all transform writes complete before dispatch | O(dirty frontier) steady-state; O(scene) only under membrane re-origin force |
| 4 | `hideUnreadySceneDrawables` | `bloom.js:1187-1287` | **BOUNDED** — O(pendingSubjects ∪ mountedRoots) steady-state; program length+tail latch early-outs at `:1248-1250`; full `scene.traverse` only on uninstrumented growth or the ~30-frame failsafe sweep | ~1 small loop per bloom pass; full traverse is the exception |
| 5 | `bloomGeometryWalkSteps` | `bloom.js:1916-1955` | **BOUNDED** — paced ≤256 nodes/call; `drainAll` only inside the held gate + `gl.finish()` drain (`:2143-2148`) | amortized to near-zero outside the gate |
| 6 | `receiveShadow` count traverse | `renderer.js:31360-31382` | **BOUNDED** — `_shadowReceiversDirty` flag + `forcedFrameSpend() < FORCED_FRAME_BUDGET_MS` wallet; production envs use the incremental `_shadowReceiverTally` | traverse only when dirty AND wallet has room |
| 7 | `scanPresentedDrawables` fallback traverse | `bloom.js:1224` | **RARE** — fires only when `renderer.info.programs` isn't an array | full traverse on a path that doesn't run on the normal route |
| 8 | `compile()` light census `traverseVisible` | `three.module.js:17545` | **COVERED** — amortized into the staging session (compile drain machinery); not per-present | zero per-frame |
| 9 | `describeNewProgramOwners` traverse | `bloom.js:1962-1990` | **BOUNDED** — brick-path diagnostic only, capped at 24 rows | zero steady-state |
| 10 | `describeOpeningInstancedPbrLeaves` traverseVisible | `renderer.js:872` | **COVERED** — `setTimeout(0)`-deferred diagnostic | zero steady-state |
| 11 | Raycast/picking walks | `worldObjectPicking` + helpers | **COVERED** — 500ms viewport-TTL latched cache (W28), envelope rejects, `raycastToPlane` MeshBVH; camera clearance already BVH | not O(scene) per frame |

**Row-1/2 detail (the material B1 residual).** `projectObject` walks every mounted node regardless of visibility (`visible===false` early-returns at `:17987` — cheap per node but still O(mounted-nodes), not O(visible)). Per presented frame the walk runs once per render pass: the route dispatch (`_renderPostRoute` → graph/bloom/native at `renderer.js:31738/31744/31753`) plus one pass per shadow-casting light inside `shadowMap.render` (`three.module.js:17860` → per-light `renderObject` recursion) plus bloom's two internal scene renders (`bloom.js:2066`, `:2142`). On the bloom route with one shadow light that's ~4 recursive whole-graph walks per presented frame. MECHANISM_VERIFIED for the walk itself; the CPU cost is hardware-unverified (SwiftShader box).

**Diet levers (ranked):**
1. **Pass count** — already consolidated: `_renderPostRoute` shares the `guard.hide/render/restore` bracket across all three routes; bloom/graph folds were W41-territory. Remaining lever is shadow-caster count, already epoch-memoed.
2. **Mounted-node count** — the proven lever: parked warm roots detached 13,845 of 16,506 nodes losslessly (renderer.js:22753 context) — same mechanism applies to any subtree that is never presented while mounted. That is scene-graph diet's remaining headroom; enumerating which subtrees qualify needs a mounted-node census (runtime, hardware-unverified here).
3. **Shadow walk flattening** — `renderObject` recursion could be replaced by a vendored per-light render list maintained incrementally (the census already knows the casters). Vendor-patch territory; benefit ∝ shadow light count. UNVERIFIED.

**BatchedMesh re-census.** `batchedInstanceRenderer.js` is NOT THREE.BatchedMesh — it's the dense-snapshot archetype batcher: linear scan over `spaceface.presentationSnapshot.v1` typed columns, reserve-then-write into per-archetype buffers, one draw per live archetype, zero per-frame allocation (`:107-139`). Per-frame cost is O(visible entities), not O(scene). The actual THREE.BatchedMesh instance covers retained-slot authored plates (renderer.js:10185, `:32716-32722` for disposal). The documented specimen gap stands — this census found no new unbatched population of consequence.

## Verdict

`lod-in-frame: saturated: true` — W121's claim verified at `c3d84934c`; stand-ins are real authored bodies at committed extents, the octahedron fallback is counted and bounded, and no unwitnessed admission path exists. B1 enumeration: every per-present O(scene) walk is either covered by epoch/memo machinery (rows 3-11) or vendored-three render-list construction (rows 1-2) whose remaining headroom is mounted-node diet and pass-count — both already partially exploited and bounded. No new material finding rises to fix level.
