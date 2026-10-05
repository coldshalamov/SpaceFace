# Wave 89 audit — in-flight-hitches lane

- **Audited HEAD**: `780d91fbf454c2a0fb9b948dec64ed91fd495e24` (branch `devin/1791064509-perf-w60`, W88 landed)
- **Contracts honored**: no quality-degradation proposals; sim determinism untouched (all findings are render-side bookkeeping).

## saturated: false

Concrete contract-preserving improvements remain (F1–F4 below). The lane is thinning — the largest spans are now mostly paced, gated, or amortized — but the W88 side-index machinery ships one real correctness residual (F1) and the diff-apply still mints O(N) garbage per fallback present (F2).

## Ranked findings

### F1 — Deferred identity release can wipe the NEW owner's record after an in-window rebind (side-index staleness)

**Evidence**

- `_unbindPresentationMesh` queues `mesh` into `_meshReleasePending` — `renderer.js:20461-20462`; the set drains once per frame in `serviceRenderMeshResidency` via `_flushMeshReleasePending` (`:20402-20411`, called at `:2070` / frame driver `:23490`), which passes the raw set to all five registries' `releaseMeshSet` with no liveness check.
- `_bindPresentationMesh` (`:20355-20384`) never removes the mesh from `_meshReleasePending`. Rebind sites run at `:23431-23432` (`_bindPublishedPresentationMeshes`) — *before* the same frame's flush at `:23490`.
- Registries resolve the pending entry through the side index and clear whichever record it names: `shipMicroMotion.js` `releaseMeshSet` → `clearRecordMeshRefs` (`:2271-2278`, `mountIndex` `:420`); `asteroidMotionPresentation.js:707-717` → `dropBoundaryIndex`; `infrastructureMotion.js` `releaseMesh`/`releaseInfrastructureRefs` (`:286`, `boundaryIndex` `:168`); `forgeRegentCrown.js` `releaseMesh` → `detachCrown` (`:182-187`, also `parent.remove(rec.group)`); `lawArenaDressing.js` `releaseMesh` → `detachBoss` (`:1013-1018`, also removes the dressing group).
- Compounding arm: every index `set`/`delete` is unconditional — `asteroidMotionPresentation.js:479/491`, `infrastructureMotion.js:273/275`, `shipMicroMotion.js:1136/2275`, `forgeRegentCrown.js:185/220`, `lawArenaDressing.js:1015/1058`. Neither `set` clears a displaced owner's stale root field, nor `delete` verifies `index.get(root) === rec`.

**Mechanism**

Concrete ordering that needs no batch tricks: frame N unbinds mesh M (pending `{M}`); frame N+1's publication bind re-seats M on entity B — pooled-mesh reuse / save-restore id-recycling is the designed-for trigger — stamping `index[M]=rec2`; the same frame's `serviceRenderMeshResidency` flush then calls `releaseMesh(M)`, which resolves the index to **rec2** and clears a live record's pins:

- ships: `mountMesh`+`bells`/`rcsNozzles` wiped → next update re-scans (self-heals after ~1 frame of dead flex/nozzle channels);
- asteroid/infrastructure: `veinRig`/`scaleBodyRef`/`dishNodes`/`armNodes` dropped → interior dressing detaches for a frame;
- forge/lawArena: `detachCrown`/`detachBoss` additionally `parent.remove(rec.group)` — the boss crown visibly detaches for a frame.

Under a restore/recook storm this fires per re-used mesh: a scene-wide one-frame blink of all attached dressing exactly on the frame the player first sees the restored world. The stale-owner arm is quieter but durable: a displaced or dead rec's late `dropBoundaryIndex` deletes rec2's *live* index entry; rec2 keeps `boundaryRoot === M`, never re-stamps, and a later `releaseMesh(M)` misses it — rec2's Object3D refs pin a dead boundary tree forever (the exact leak class the W88 machinery exists to prevent).

**Fix sketch** (two one-liners, mirrored in all five registries):

1. `_bindPresentationMesh`: `this._meshReleasePending?.delete(mesh)` — or equivalently, flush-time skip when `mesh.userData.sfBoundEntityId != null` (the mark is set before `bindMesh` returns, and `_unbindPresentationMesh` already preserves mismatched marks as a different binding's lifecycle — `renderer.js:20430-20437`).
2. Ownership-checked index writes: `if (index.get(root) === rec) index.delete(root)` in `dropBoundaryIndex`/`clearRecordMeshRefs`/`detachCrown`/`detachBoss`; on `set`, clear a displaced owner's root field (`const displaced = index.get(mesh); if (displaced && displaced !== rec) displaced.boundaryRoot = null`) so its later drop is a no-op.

**Effort** S · **Magic-frame impact** M · **Risk** L (guard-only changes; every new branch is a strict subset of current delete/clear behavior).

### F2 — `updateFromEntities` mints Set(N) + Array(N) per fallback present

**Evidence** — `presentationWorld.js:834` `const seen = new Set()` and `:865` `for (const entityId of [...byId.keys()])` per call. Caller: `presentationPublisher.js:114` inside `fallbackFromState` — the gate at `:100-101` means the diff-apply runs on **every** journal-fallback present once `completedTickCount > 0` (the `=== 0` + same-`lifecycleGeneration` case is the *skip* branch), i.e. on every presented frame during any journal invalidation window, not just the suspended opening.

**Mechanism** — two O(N) allocations (Set fill + keys snapshot) per fallback frame, plus the second O(N) walk even when nothing retired. On a churn-heavy sector entry this is sustained GC pressure on exactly the hot path W88 built the diff-apply to cheapen.

**Fix sketch** — replace both structures with a stamp array + cardinality fast-path:

- capacity-sized `lastSeenSeq` (Int32Array alongside the other slot arrays) + a per-call `updateSeq++`: `lastSeenSeq[slot] = updateSeq` marks seen; `lastSeenSeq[slot] === updateSeq` on lookup yields `duplicateIdRejects` — identical semantics, zero alloc.
- Retire fast-path: every seen id is in `byId` by construction (new ids allocate into `byId` first), so `byId.size === seenCount` proves `byId ⊆ seen` → skip the retire walk entirely (the common steady-state case: no births/deaths). Only on a size mismatch, walk `activeSlots` backward collecting `entityIds[slot]` where `lastSeenSeq[slot] !== updateSeq` (retire compacts `activeSlots`, so collect then retire).
- `visualRevisions`/`sourceGenerations`/`revisions` stamps and the `PRESENTATION_DIRTY.VISUAL` mark are untouched.

**Effort** S · **Impact** M · **Risk** L.

### F3 — Origin-rebase tail: contact-shadow full rebuild + asteroid-pool full re-eval every 4096-WU crossing

**Evidence** — `_applyFrameOriginRebase` (`renderer.js:22051-22086`, invoked from the membrane check at `:23466-23468`; quantum = `FRAME_ORIGIN_QUANTUM_WU = 4096`, `src/core/coordinates.js:7`, driven by `world._tickFrameOrigin` `src/systems/world.js:4888-4908`):

- `this._contactShadowPool.records.clear()` (`:22071-22072`) — records are `{index, x, z, radius}` with x/z frame-local (`renderer.js:6153`); the wipe forces every record to re-`compose` + `setMatrixAt` + upload next `syncContactShadowPool` (`:6127-6161`).
- `invalidateAsteroidInstancePool` → `pool.dirty` → next `syncPoolBucket` (`asteroidInstancePool.js:573-628`) pays `root.updateWorldMatrix(true, true)` per owner root + `leaf.updateWorldMatrix(false,false)` + 16-component compare-write per record + full-buffer upload.

**Mechanism** — every 4 km of straight-line flight, all contact-shadow instances and every instanced rock's matrix re-upload in the presented frame. Both are pure translation artifacts: post-rebase `leaf.matrixWorld = Trans(dx,dz)·old`, so the stored bytes are recoverable without a single tree walk.

**Fix sketch**

1. Contact shadows: iterate `pool.records`, add `(dx,dz)` to `x`,`z` instead of `clear()` — next sync's `Math.abs(prev.x - x) > 0.01` compares equal → zero writes, zero upload. ~3 lines.
2. Asteroid pool: an `translateAsteroidInstancePool(pool, dx, dz)` helper that adds `dx`/`dz` to `instanceMatrix.array` elements 12/14 of every live record slot across `variants` + `keyed` buckets, then one `markDynamicBufferItems`/`needsUpdate` per bucket. Stored values then equal the post-rebase `matrixWorld` → the next sync's per-record compare writes nothing. (Retiring buckets are dead weight — translate their arrays too or skip; both harmless.) Bigger-alternative, same effect: store bucket-relative matrices (`bucketInv·leafWorld`) so rebase is `bucket.mesh.position += (dx,dz)` only — but that adds a per-changed-record matrix multiply to the write path; the in-place translate has no standing cost.
3. The `_meshes.values()` position walk, `hazardVisuals`, `cam.reprojectFrame`, `vfxReprojectFrame` are inherent O(N) shallow writes — fine as-is.

**Effort** S (contact shadows) / M (pool translate incl. keyed buckets) · **Impact** M (scales with instanced-rock density × crossing frequency) · **Risk** L / M (the translate must cover every live slot and keep stored≡matrixWorld or subsequent syncs re-write rows spuriously).

### F4 — `upgradeMintPass` yields without paced-ledger participation

**Evidence** — `renderer.js:17167-17182`: floating chunked IIFE `await yieldToBrowser()` per 32 meshes (`:17176`) with no `pacedFrameSpend()` check and no `notePacedFrameSpend` debit (`.catch` verified present `:17182`).

**Mechanism** — the post-preparation upgrade walk can run while flight is live; `yieldToBrowser` only guarantees a beat boundary, not headroom. Its segments can land inside beats the paced lanes (reattach drive, reconcile, commit continuations) already spent — yield-stacked overrun exactly while the sector's meshes are being re-admitted.

**Fix sketch** — adopt the `driveLeg` contract already used everywhere else: stamp `legStarted`, `notePacedFrameSpend(legNow() - legStarted)` before the yield, and continue only while `pacedFrameSpend() < PACED_FRAME_BUDGET_MS`.

**Effort** S · **Impact** L-M (rare trigger: post-preparation only) · **Risk** L.

## Regression notes — W88 machinery verified at 780d91fbf

All twelve items concretely re-verified, clean:

1. **`updateFromEntities` diff-apply** (`presentationWorld.js:831-870` + `presentationPublisher.js:83-135`): retained rows keep slot/binding/visible and pay compare-then-write via `refreshVisibleEntity`; absent ids retire off a `[...byId.keys()]` snapshot; new ids allocate; `sourceGenerations=generation>>>0`, `revisions=0`, `visualRevisions` stamp + `PRESENTATION_DIRTY.VISUAL` on change (`:852-861`); `duplicateIdRejects` via the seen set (`:839-842`); publisher falls back to `rebuildFromEntities` only when `updateFromEntities` is absent (`:114-118`); `diagnostics.rebuilds++` per call (`:868`).
2. **`commitLegStarted` inside finally** — both commit continuations (`partsLibrary.js:4227-4311` / `:9312-9392`): restamp runs inside `finally` before the dispose drive; the `waitForAuthoredAdmission` wait is no longer debited. Residual nit (conservative-safe): the inner per-step `yieldToBrowser` at `:4304` / `:9387` still accrues into the final `notePacedFrameSpend` (`:4309`/`:9392`) — wait-charging one level down; over-debits the ledger, can't overrun a frame.
3. **`bindAuthoredMotion` stepped** — `collectNodesByNameMapSteps` yields per 512 visited (`motionBank.js:601-607`); `finishAuthoredMotionBind` (`:647`) holds the controller body identical for both `bindAuthoredMotion`/`bindAuthoredMotionSteps` (`:631`/`:641`) and `bindInstanceMotion`/`bindInstanceMotionSteps` (`authoredMotion.js:1013`/`:1020`); async pacing rides `driveLeg` + debit (`visualFactory.js:4265-4274`, `:4313-4314`).
4. **`mintResidentReattachSweep`** (`renderer.js:1793-1799`): `iterator.return()` in try/catch before fresh mint; mint gated on `!_residentReattachIter` (`:2115`); all four call sites (`:11792`, `:16860`, `:17236`, `:17309`) route through it.
5. **`_armDepthStage` unconditional deferred drive** (`:24985-25059`): no `session.slice` import on this path; leg always rides `driveCompileShadowDepthPipelines({stagingName:'SF_ShadowPromoteDepthAdmission'})` (`:25043-25054`); `legDeferred=true` + `deferredMark` populated from `unstagedByRoot ∩ legSet` (`:25035-25042`); `.catch` warns+swallows, `.finally` cleans `deferredDepthStageRoots` (`:25055-25059+`); scoped/arm restores bypass `traverseDeferred` via `!scopedSync` (`:24736`).
6. **`SHADOW_ROOT_SYNC_PASS_CAP`** (`:24642-24767`): pass cap counts only non-scoped `syncShadowCasterPolicy` traverses (`:24736-24740`); withhold/queue/cache/invalidate/stamp tails (`:24752-24767`) run regardless of `traverseDeferred` — a deferred root can't close the next pass's `collectGate` on a stale stamp; `_shadowRootSyncPassCount` resets with `_depthCollectPassSeq` (`:24647`).
7. **`settleRebuildBridges` cap + rotation** (`:2026-2062`): ≤32 rows/frame (`:2034`), unreleased row delete+set → map tail (`:2055-2056`), `releaseRebuildBridge` identical on release (`:2060`).
8. **`freezeStaticTransformRootMarked`** (`staticChildMatrices.js:130-145`): O(degree) — `matrixAutoUpdate=false` + `updateMatrix()` + direct-children `sfMatrixFrozen` check + `remarkStaticMatrixAncestors`; original `freezeStaticTransformRoot` still exported (`:118`); call sites (`partsLibrary.js:3744`/`:3906`/`:4246`, `visualFactory.js:410`) each immediately follow a `freezeStaticChildMatrices[Steps]` pass on the same root; `disposeDetachedObjectSteps`/`disposeDetachedPlaceFallbackSteps` twins pace the dispose legs (`partsLibrary.js:15742`/`:15788`).
9. **Registry side indexes** — all five registries resolve `releaseMesh`/`releaseMeshSet` through the index (O(1)/O(pending)) and a remount re-stamps (`asteroidMotionPresentation.js:488-491` `rec.boundaryRoot !== mesh` guard, `infrastructureMotion.js:271-276`, `shipMicroMotion.js:1134-1138`, `forgeRegentCrown.js` rebind via `detachCrown`+set, `lawArenaDressing.js` same). Entries die with the rec — *but see F1*: the deletes are unconditional and `set` doesn't clear a displaced owner.
10. **Non-throw packaged-exit disposes** (`visualOverrides.js:1161-1248`): every early exit — orphaned drive legs ×4, `!packaged.children.length`, `scenarioCommitOrphaned` ×2, `prepareAuthoredVisualPipelines` catch, both `!root.parent` post-compile/publication exits, stale-epoch tail — disposes `packaged` via `disposeDetachedPackagedGroup`; `detachedCommitGroup` hoist (`:1131`) backs the `.catch` belt (`:1287-1291`); the `.finally` publication tail is unchanged.
11. **Reattach feed versions** (`renderer.js:2091-2104`): 8-element feed reads `entityIndex.version` (V1-flag-guarded → `entities.size` fallback), `asteroidField.version`, `dressing.version`/`farActors.version` (`.byId.size` fallback), `entityList.length`, `sessionEntityIdRemap.size`, `enterSerial`; `feedMoved` compare (`:2106-2107`) + `%240` catch-all + `pacedFrameSpend() < 2` headroom (`:2108-2117`); paced drive debits (`:2119-2138`). Minting the 8-elem array is inside the keepGpu-loading gate (`:2072`) — not a per-flight-frame alloc; no action.
12. **`upgradeMintPass` rejection swallow** — `.catch(() => {})` present (`:17182`), `preparation.catch(()=>{})` present (`:17191`).

## Lane-hunt coverage notes

- **(a) side-index staleness** → F1 (both directions found: pending-release hits the new owner; unconditional deletes clobber a live entry → release-miss leak).
- **(b) interior-refs coverage** → clean. Update call sites pass the boundary root the index stamps; interior refs (`veinRig`, `scaleBodyRef`, `dishNodes`/`armNodes`, `group`/`clones`) are record-owned and cleared by release paths. No update path stamps an interior node as root.
- **(c) presented-frame spans** — ranked: `syncEntityViews` O(E) is presented-frame atomic (pose+visibility+LOD must commit coherently — a split pass presents half-updated rows); its per-row costs are already gated (`PRESENTATION_WORLD_UNCHANGED_REFRESH_SKIP`, `drawnCullRadius`/`__authoredMotionPad` caches, shadow-policy `dirtySeq`, band/score-gated closures). `_updateCameraOccluders` iterates a bounded candidate list — cheap. `_flushMeshReleasePending` amortized O(pending). Largest remaining legal win is F3's rebase tail; cadence-deferral of `classifyEntityViewBand`/`projectedWidthPx` is possible but hysteresis already bounds churn → low value, flagged as deliberately not sliced.
- **(d) diff-apply cost** → the compare-then-write + 15-field `UNCHANGED_REFRESH_SKIP` early-out (`presentationWorld.js:748-778`) is already the cheap skip; the residual is F2's allocations, not the compare.
- **(e) micro-allocations** → F2 (`new Set` + keys array per fallback call). `reattachFeed` array is loading-gated only. `_meshReleasePending` Set is per-batch — amortized.
- Divergence nit (not a finding): `updateFromEntities` silently skips `entityId === 0` rows (`:838`) while `rebuildFromEntities → allocateEntity → allocateRecord` throws on id 0 (`:566`) — same input, different verdicts; benign on real collects (ids are nonzero).
- F6/F7 documented-deferred — not re-reported.
