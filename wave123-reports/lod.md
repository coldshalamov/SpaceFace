# Wave-123 audit — lane: lod-in-frame

Branch `devin/1791504143-perf-w120`, HEAD `b16d2730a` (PR #257; two doc-only wave-log commits past the spawn-stated `a7151dcaf` — audited code is identical). Read-only audit; no app run, no code changed.

`saturated: true` — the W122 saturation claim survives falsification at `b16d2730a`: all four W122 machinery groups verify clean in code, the stand-in machinery is intact and layered exactly as W122 described, no W122 commit opens a new admission-path exposure, and the B1 residual list *shrinks* this wave — the shadow-map whole-scene walk W122 listed as uncovered (row 2) is in fact already covered by the vendored `_shadowCasterRegistry`. Third consecutive `saturated` for lod-in-frame — per the wave-123 prompt this **closes the lane**.

## Regression verification — W122 machinery (PR #257, `b16d2730a`)

### hitches F1 — audio frame body on bounded post

- **VERIFIED.** `audioSystem.js:~6997` `_startFrameLoop`: the rAF tick contains ONLY guards + re-arm — `rt._rafId = 0; if (rt._lifecycleSuspended || !rt.ctx || rt.ctx.state !== 'running') return;` → `postTaskAtBackgroundPriorityBounded(() => { this._frame(); });` → `rt._rafId = requestAnimationFrame(tick)`. `_stopFrameLoop` (~7015) cancels `rt._rafId`. `_frame()` (~7025) still carries its internal guards (`!ctx || rt._lifecycleSuspended || ctx.state !== 'running'`) — the deferred body no-ops on a suspended/stopped context. `postTaskAtBackgroundPriorityBounded` (`backgroundPost.js`) dedupes via `fired`, prefers `scheduler.postTask(fire, {priority:'background'})`, falls back to `setTimeout(fire,0)`, and pins a `setTimeout(fire, boundMs=48)` starvation bound.

### hitches F3 — stormWarn sibling contract

- **VERIFIED.** `renderer.js:~2182-2257`: row mint `{logged, suppressed, lastWarnAt: -Infinity, heartbeatMs: 1000}`; verbatim arm stamps `row.lastWarnAt = now`; heartbeat fires when `now - lastWarnAt >= heartbeatMs` then `heartbeatMs = Math.min(heartbeatMs * 2, 30000)` (1s→30s doubling); quiet-gap heal `now - lastWarnAt > 60000` resets `logged=0; suppressed=0; heartbeatMs=1000`. Structurally identical to `laneWarn` below it — the contract carries.

### popin — W122 deferred-mint / class-ledger / row-memo machinery

- **VERIFIED.** `assetResidency.js` +432/−137 rewrite keeps every prior mechanism and adds:
  - `applySectorExitResidency` (~2263) mints `warmMintIter = residency.prepareSectorExitDeferred(sectorId, options)` when `options.deferWarmMint === true`; renderer.js:19423 sets `deferWarmMint: true`.
  - `driveCacheCleanup(primaryReason, postDispatchReason, warmMintIter)` (renderer.js:19362) runs leg 0 `yield* warmMintIter` inside try with `dropLeg(err,'warm-mint')` → `laneWarn('sectorExitCleanup')`; non-Steps registries drain the iterator inline.
  - `queueResidencyWarmMint` (renderer.js:19553) FIFO-chains `_sectorExitCleanupIter` via `(function*(){ yield* existing; yield* mintIter; })()`; three call sites (~19710, ~19755, ~19869).
  - `prepareSectorExitDeferred` (~1674) / `rotateSectorDeferred` (~1716): eager row snapshot (owner qualification at emit time), `yield` every 256 rows, `try/finally` releases the owner on abandon (`warm-sector-mint-abandoned`), deferred rotate assigns `currentSectorId` only at iterator end; sync `prepareSectorExit` (~1626) still pre-mints coverage inline for the includePlayer path.
  - `mintWarmCoverageSteps` (~1654): paced; aborts if `warmOwner !== owner` or coverage already minted.
  - `governorEntry` (~1942): per-entry memo on `{ownersVersion, kind}`; `activeRequest` re-stamped per consult.
  - Class byte ledgers: `rekeySoftBudgetClass` (~830), `packageCacheOnlyBytesTotal`/`softResidentBytesTotal` + member sets (~862-865); `enforceSoftResidencyBudgets` (~874) and `enforceSoftResidencyBudgetsSteps` (~1052) early-out O(1) when neither class is over; `LEDGER_VERIFY_EVERY_ENFORCES=4` owner-graph re-derive survives; drift check covers the new scalars + member counts.
  - `diagnosticsRow` (~1803): memo on `{ownersVersion, canonical}` serving frozen rows.
- W121 spot-checks (same file touched): `ownerVisibilityMemo` (~1246) keyed `{present, visible, assetsVersion, writeSeq}` intact; `activePendingKeys` is now refcount-maintained via `activePendingRefcounts` (~78-105) — strictly stronger than the W121 memo, still O(1); `verifyLedgerConsistency` (~982) intact; `visibilityGcIter` bounded sweep `max(256, size/VISIBILITY_OFF_GLASS_PRESENTS)` intact.

### boot — W122 async-prepare / prepared-envelope machinery

- **VERIFIED.** `saveSystem.js`: `loadEnvelopeFromString` non-gzip leg preserves O(1) sync rejects (byte-cap/invalid → literal `false` + `save:error`) then routes `_loadEnvelopeFromStringAsync`; `_commitAutosaveSnapshot` (~3231) awaits `_prepareEnvelopeStringAsync(previousRaw)` then re-checks `_autosaveInFlight`/`_activeAutosaveJob`/`_restoring`/`restoreSequence`; `_autosaveValidatePreviousSync`/`_autosaveValidateReadbackSync` are async twins awaiting the paced lane with `!this._autosaveTransactionCurrent(...) return false` re-checks; readback skips re-verify entirely when `storedRaw === snapshot.json`; `_preparedEnvelopeCache` FIFO-8 (`_cachedPreparedEnvelope`/`_rememberPreparedEnvelope`, ok-only entries) consumed at `_writeSlot` (~1458-1460), remembered on write success (~1590) and async prepare (~4193); restore lane prefers stubbed `_restore`/`_restoreAsync` over canonical.

## (a) Saturation falsify — verdict: HOLDS

Attempted falsification vectors, all closed:

1. **Stand-in mesh reality.** `lodStandInFor` (visualOverrides.js:272), `resolvingMarkerFor` (:348 — octahedron scaled `x*0.5, x*(0.3/3.4), x*0.25`), `installBoundaryResolvingMarker` (~369, arm-only via `wantsBoundaryResolvingMarker`), `materializeBoundaryResolvingMarker` (~446 — record-resident → `lodStandInFor` via `boundaryStandInResolver`; else octahedron + `admissionStandInPending` retry latch or `resolvingMarkerFallbackReason='stand-in-record-unusable'`), `boundaryStandInTarget` (~489 — fit/scale/x arm chain → committedX → visualBounds → r*3.4), `upgradeAdmissionStandIn` (:648). Unchanged from W122.
2. **Materialization on every visibility path.** `syncResolvingMarker` (renderer.js:5129) runs on all three submit legs at this HEAD: doomed-hide (:26336), stale/protected keep-visible (:26362), live submit (:26624). It materializes armed boundary markers on the first evaluated pending frame, drives marker visibility off `isAuthoredPendingStatus`, banks the marker with the hull (`rotation.x/z`), upgrades pending stand-ins, and releases the fallback count when the pending window closes. (W122 listed four call sites at c3d84934c line numbers; the W122 renderer diff consolidated — every visibility path is still covered.)
3. **Fallback bounded + counted.** `resolvingMarkerFallbacks++` (:736) → `publishResolvingMarkerFallbacks` (:207-210) → `render.resolvingMarkerFallbacks` (renderer.js:10386). Live tripwire intact.
4. **Arming coverage across families.** `installBoundaryResolvingMarker` call sites: partsLibrary.js:3132, :3825, :3994, visualOverrides.js:1088; renderer arms via `wantsBoundaryResolvingMarker` (:5134). No unarmed mount path found.
5. **No new exposure from W122.** The popin deferred warm mint paces the *same* retain set through a paced iterator — admission-path semantics unchanged; entities are still warm-retained, just spread across presents. Boot/hitches commits touch no lod code.
6. **`sfAdmittedOnce` propagated** into `_submitVisibilityOptions` at :26369/:26634; `pendingSubjects` gate (bloom.js:1182-1287) hides never-compiled roots until admission — unchanged.
7. **Known deferred surface adjudicated** — BatchedMesh specimen gap, LOD-F2/F3/F5 markers, LOD-N4 depth over-inclusion: not re-reported per contract.

## (b) B1 whole-scene traversals — re-enumerated at `b16d2730a`

| # | Walk | Site | Coverage at HEAD | Cost |
|---|------|------|------------------|------|
| 1 | `projectObject` render-list walk | vendored `three.module.js:17985-18080` | None — raw three.js, rebuilt per `renderer.render(scene,camera)` | per presented frame: 1× native route, 1× bloom route (`renderScenePass` bloom.js:2030-2066; `rehearseScenePass` :2130-2150 runs only inside the held first-draw gate, not per-present), **2× graph route** (main :436 + `options.ao` normal-override pass :444 — `ao` defaults ON :288); plus O(fixed) quad/producer scenes |
| 2 | `shadowMap` per-light walk | `three.module.js:9747-9771` | **COVERED — correction to W122 row 2.** `713dc74ed` (landed before W122's HEAD) replaced the recursion with `_shadowCasterRegistry`: the `castShadow` setter maintains a live registry (:16-52); `eachShadowCaster` (:60-75) iterates registered casters and re-proves ancestor visibility + scene membership per entry; `sfShadowCastSubset` narrows staging scenes. VSMShadowMap intentionally keeps the traversal (draws receiveShadow-only objects). | O(live casters × ancestor hops) per shadow refresh — no longer O(scene) |
| 3 | `scene.updateMatrixWorld()` | `renderer.js:31767` (`_renderPostRoute`, once/frame shared across routes) | **COVERED** — vendored `sfMatrixFrozen` skip (`three.module.js:103-146`) under `!force` | O(dirty frontier) steady-state |
| 4 | `hideUnreadySceneDrawables` | `bloom.js:1182-1313` | **BOUNDED** — O(pendingSubjects ∪ mountedRoots); program-length latch early-outs | small loop per bloom pass |
| 5 | `bloomGeometryWalkSteps` | `bloom.js:1916-1955` | **BOUNDED** — ≤256 nodes/call; `drainAll` only inside held gate + `gl.finish()` | amortized ~0 |
| 6 | `receiveShadow` count traverse | `renderer.js:31420` | **BOUNDED** — dirty flag + forced-frame wallet | only when dirty AND budgeted |
| 7 | `scanPresentedDrawables` fallback | `bloom.js:1307` | **RARE** — only when `info.programs` isn't an array | ~never |
| 8 | `compile()` census `traverseVisible` | `three.module.js:17545` | **COVERED** — amortized into staging session | zero per-frame |
| 9 | `describe*` diagnostic traverses | `bloom.js:1962-1990`, `renderer.js:872` | **BOUNDED** — brick-path/deferred diagnostics | zero steady-state |
| 10 | Bulk shadow re-stage | `renderer.js:30504` | **BOUNDED** — `collectUnstagedShadowCastersBulkSteps` iterator under `collectDeadline`; nested roots pruned | only on light-signature change |
| 11 | Material-settle census | `renderer.js:14331` | **BOUNDED** — explicit stack walk, 512-node yields inside the cook, not per-present | amortized ~0 |
| 12 | Raycast/picking | `worldObjectPicking` + helpers | **COVERED** — 500ms TTL latch, envelope rejects, MeshBVH | not O(scene) per frame |

**Row-1 detail (the sole material B1 residual).** `projectObject` still descends every mounted node per render pass — `visible===false` early-returns at :17987 (cheap per node, but O(mounted-nodes), not O(visible)). Pass count at HEAD: 1/frame on native+bloom routes, 2/frame on the graph route with AO (default). The one genuinely uncovered whole-graph walk remaining. MECHANISM_VERIFIED for the walk; CPU magnitude hardware-unverified (SwiftShader).

**Levers for row 1 (ranked):**
1. **Flat renderable-leaf registry** (vendored, same shape as `_shadowCasterRegistry`): maintain a `Set` of renderable objects (mesh/line/points/sprite/light/probe) via `add`/`remove`/`attach` overrides; `projectObject`'s caller iterates the set and re-proves ancestor visibility per entry — converts O(mounted-nodes) into O(renderables × ancestor hops) and skips the structural-node majority of the ~16.5k-node graph. Render-order determinism holds: `sortObjects` (default true) re-sorts by renderOrder/z/materialId anyway; `groupOrder` inheritance needs care (renderOrder propagates through groups — the entry must carry its nearest group ancestor's order). Light/probe pushes and `isLOD.autoUpdate` must be handled inside the same visit. Effort L, magic-frame impact M (CPU-side only; no visual change), risk M-H. UNVERIFIED — vendor-patch territory.
2. **Mounted-node diet** — already exploited (parked warm roots detach 13.8k/16.5k nodes losslessly); remaining headroom needs a mounted-node census (runtime, hardware-unverified here).
3. **Pass count** — bloom/native already at 1; graph's second pass is AO-by-design (visual feature, not waste). No lever without losing AO.

**BatchedMesh re-census.** Unchanged from W122 — `batchedInstanceRenderer.js` is the dense-snapshot archetype batcher (O(visible entities), zero per-frame alloc), not THREE.BatchedMesh. No new unbatched population of consequence found.

## Verdict

`lod-in-frame: saturated: true` — third consecutive saturated wave → **lane closes** per the wave-123 prompt. W122's claim verified at `b16d2730a`: all W122 machinery verified concrete in code; stand-ins remain real authored bodies at committed extents with the counted/bounded octahedron fallback; every submit path syncs the marker; the one remaining O(scene) walk is vendored-three `projectObject` render-list construction (hardware-unverified cost, diet lever already partially exploited, flat-registry lever sketched above). Shadow traversal removed from the residual list — already covered by `_shadowCasterRegistry` since `713dc74ed`.
