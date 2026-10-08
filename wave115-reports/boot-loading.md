# Wave-115 audit — lane: boot-loading

Branch `devin/1791416524-perf-w110`, HEAD `d7ca1a599`. Read-only audit; no code written, nothing run.

`saturated: false`

## Findings (ranked)

### F1 (impact H, effort S) — `failAuthoredPlaceAdmission` releases residency BEFORE the stale gate, unscoped

`src/render/partsLibrary.js:4281-4344`. Line 4285:

```js
4284  assertQueuedAuthoredAdmissionActive(options, 'before-place-failure');
4285  if (!flags.residencyReleased) releaseBoundaryResidency(renderer, boundary, reason);   // NO admissionEpoch
4290  if (staleAuthoredRunVerdict(boundary, options || {})) {
4291    if (!flags.residencyReleased) {
4292      releaseBoundaryResidency(renderer, boundary, reason, options && options.admissionEpoch);
```

Two defects in one line:

1. **Ordering**: the release runs *above* the stale-verdict gate at :4290. The gate exists so a superseded drive "keeps the residency scope it minted under" — but by the time it fires, the live scope is already torn.
2. **Missing epoch**: `releaseBoundaryResidency` (:10243) guards with `admissionEpoch != null && userData.admissionEpoch !== admissionEpoch → return 0` at :10253 — passing `undefined` skips the guard entirely. It then calls `residency.releaseOwner` (assetResidency.js:366), which marks the owner `released` permanently and `request.cancel(reason)` on **all** pending residency requests — including the live epoch's in-flight ones.

Reachable second-drive paths: `upgradePlaceBoundary` → `driveAuthoredBuildStepsAsync` returns null on stale → `!authored` → `failAuthoredPlaceAdmission('place-build-unavailable', null)` at :4157. A stale drive A entering this path tears live drive B's residency: B's pending requests cancel, the released-owner mark stands until B's next request mint re-revives via `residencyOptionsForBoundary` (:6981) — in-flight work is already dead, surfacing as a failed/stalled authored build → the boot-loading-visible symptom (a place that never finishes admitting).

**Git archaeology**: W9 `50a8ea888` removed exactly this unscoped top release to fix the "release-before-readmit owner trap"; W17 `e97b91a74` added the stale gate; merge `128e014fb` re-introduced the unscoped release above the gate — a merge casualty, not intent. The capsule twin `failAuthoredCargoCapsuleAdmission` (:3341-3364) is clean: stale check precedes all releases and every release passes `admissionEpoch`.

Fix sketch: move the :4285 release below the stale check (the stale branch already releases epoch-scoped at :4292; the terminal path releases epoch-scoped at :4305), so a stale drive can never tear a live epoch. Belt-and-suspenders: pass `options && options.admissionEpoch` into the early release if the early ordering must stay for the non-stale fast path.

Risk: low — reorders inside an already-gated failure path; capsule proves the shape.

### F2 (impact M, effort S) — `releaseBoundaryResidency` never forwards epoch to `releaseOwnerInstances`

`src/render/partsLibrary.js:10255` calls `releaseOwnerInstances(boundary)` unconditionally — no `admissionEpoch` argument — inside an otherwise epoch-guarded function. `releaseOwnerInstances` (:15552, guard :15570-15571) treats `expectedEpoch == null` as "clear ALL release callbacks". So even the *epoch-scoped* releases at :4292/:4305 still drop every instance-release callback on the boundary, including ones minted under a *different* live epoch — a second-drive race still bleeds through the callback lane even after F1 is fixed.

Fix sketch: `releaseOwnerInstances(boundary, admissionEpoch)` — plumb the parameter through; the callee already has the epoch-check shape.

### F3 (impact M-H, effort S) — abort/dispose paths leak authored-motion registrations

`attachAuthoredMotionDriver` (authoredMotion.js:138-258) registers controllers in the module `registry` (Map entityId→Set plus `site:` aliases, :26/:65-80) at attach time and exposes removal only via `root.userData.detachAuthoredMotion`.

Actual detach call sites: capsule teardown :3466, and cradle-guard's `dispose()` chain (ceresCradleLayoutVisuals.js:128 → `priorDetach`), plus renderer.js:32009.

**Not detached**: `disposeDetachedObjectSteps` (:16623-16646 — the generic paced teardown used by retained-dispose drain and both abort paths at :10980/:10920) and `disposeDetachedPlaceFallbackSteps`/`detachedFallbackTeardownThenClearSteps` (:16671-16700/:3457). So every place or ship root that is aborted post-attach (:4793, :10701, :3534-covered capsule is fine, :11528/:11682 flight-template legs) or disposed via the fallback teardown leaves live controllers in the registry: leaked memory pinning the torn root, stale `onUpdate` writes into detached trees, and unbounded Set growth (each member is a per-controller linear scan on every motion tick of the entity id — a slow residency tax on every boot/admission churn).

Fix sketch: call `root.userData.detachAuthoredMotion?.()` in the root-hook block at the top of `disposeDetachedObjectSteps` (beside `releaseStandIn`/`disposeWorldSitePresentation`) and in `disposeDetachedPlaceFallbackSteps`. `unregister` is already idempotent. Risk: low.

### F4 (impact M, effort S) — abort pre-scan disposes *cached shared* static-batch geometries

`disposeAbortPartialPreScanSteps` (:10998-11000) disposes `object.geometry` on `spacefaceStaticBatch === true` meshes with **no `spacefaceSharedAsset` guard**. The generic teardown has the guard (:16634); the pre-scan doesn't. Static-batch leaf geometries are served from `staticBatchGeometryCache.js`, which stamps every cached geometry `userData.spacefaceSharedAsset = true` (:29-30, :38-39). Disposing one poisons the cache entry: the next compose hands out a disposed BufferGeometry which lazily re-uploads on first draw — a redundant GPU re-upload in an on-stage frame, i.e., exactly the hitch the pre-scan exists to amortize.

Fix sketch: add `&& !(object.geometry.userData && object.geometry.userData.spacefaceSharedAsset)` to the :10998 condition (mirroring :16634). Risk: trivial.

### F5 (impact M, effort M) — retained-dispose retry still leaks on deterministic throwers; re-pays the torn prefix

Drain at :9245-9271 mints `disposeDetachedObjectSteps(head.root)` once via `head.retried`, then consumes. Two surviving leak classes:

- **Root-hook repeat**: `releaseStandIn()`/`disposeWorldSitePresentation()` run at iterator *start* (:16624-16627). A hook that throws deterministically throws identically on the retry's first `.next()` → `head.retried` already true → consumed → the **entire** subtree leaks (worse than the suffix the comment describes).
- **Mid-tree thrower**: the retry re-walks the whole tree, re-firing `geometry.dispose()`/`material.dispose()` on the torn prefix (dispose events fire twice — mostly idempotent at GL level but double-counted for any dispose-listener accounting, and the prefix cost is paid twice), then throws at the same node again → suffix leaks anyway.

On "should the retry carry the torn prefix's measure": the iterator exposes no measure channel (the drain debits wall-clock via `notePacedFrameSpend`/`noteForcedFrameSpend` only), so there is nothing to carry — the real fix is making the pass not die. Fix sketch: wrap the per-node dispose block (and the two root hooks) in per-step try/catch inside `disposeDetachedObjectSteps` — the same per-step fencing the async dispose paths already use — so a bad node/hook is fenced and the walk continues; the one-retry mint then only matters for genuinely-corrupt iterators. Effort M (touches a hot teardown), impact M, risk low-moderate.

### F6 (impact M, effort M) — residual (d): terminal authored-build legs are still atomic whole-tree traverses

`buildPlacePropRootSteps` yields *between* legs but each terminal helper walks the entire composed root inside one uninterruptible slice:

- `canonicalizeMaplessHullMaterials(root, palette)` — :4775 (also :3528 on the capsule leg)
- `installWreckCathedralOpaqueDepthPrepass(root, …)` — :4783 (traverse)
- `specializeClaimRelayOpaqueMaterials` — `root.traverse` :4865
- `installAuthoredLod` — :4787 (traverse, also :3530)
- `_composedPlaceBoundsBox.setFromObject(root)` — :4823 — a full-tree `Box3.expandByObject` over every vertex-bearing node; on a station-scale subtree this alone can exceed the slice budget.

These ran serially before W114 too, so this is not a regression — but it is the largest remaining class of unstepped linear scan in the boot/admission lane: the build's *final* leg can spend several ms uninterruptibly inside the "paced" drive. Fix sketch: Steps-twins with the file's standard explicit-stack + 128-stride/`yield` pattern (precedent: `collectPreparedUnbindKeysSteps`, `attachAuthoredUiStepCountersSteps`). `setFromObject` can accumulate a Box3 in the walked prefix then union — result-identical, order-free. Impact M (hitch risk on large places at commit time — visible-frame adjacent), risk low for the traverses, moderate for bounds (must prove identical Box3).

### (a) enumeration of second-drive verdicts/stamps — other mints audited, safe

`registerPreparedAuthoredRoot` uses `Map<boundary, Set<root>>` (:670-727) — concurrent drives' roots coexist; `buildTrace` is per-call; commit-side stale guard :4252-4257 correctly epoch-scoped; `installedPreparedDisposer` is closure-bound per run (a stale run invokes its own disposer, not the successor's); `visualBounds`/`authoredAssetState` re-stamps by a stale drive write identical values — benign. The capsule path is clean end-to-end (:3241-3364). F1+F2 are the only live second-drive verdict defects found.

## W114 regression verification — all verified at d7ca1a599

- **lod F1 dual-sig deny verdict** (renderer.js:30200-30288): `verdictSigs` = arm-pinned sig + live memo sig when different; a mesh must be unmarked under BOTH to deny; unsigned-arm stale-memo guard `verdictStale` (:30222-30225) skips when the served memo's epoch lags live. ✓
- **lod F2 unstagedCache** (:30024-30048): keys on `dirtySeq` only (epoch deliberately excluded — comment :30027-30033); cache-hit re-proves each mesh's mark under live `markSig`; dirtySeq bump on subtree mutation invalidates. ✓
- **lod F3 authored-motion registration walk** (:25562-25572): explicit-stack preorder, yield every 128, `committed = true` after. ✓
- **lod F4 reattach live-map stamp** (:1982-2030): iterates `owner._meshes` directly (no snapshot), `sfResidentReattachMint` per-mint stamp dedups delete-readd revisits while fresh meshes still scan. ✓
- **popin P1 three skip-cap lanes**: `forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS` consults at decodeTaskBudget.js:375 (drainGltfCompileQueue), partsLibrary.js:6660 (opening resume), :9223 (retained-dispose drain), renderer.js:2367/2519-2532/2771 (twins); `noteForcedFrameSpend(min(elapsed, cap))` debits present. ✓
- **popin P2 withheld prune** (shadowDepthAdmission.js:190-206): `withheldDepthCasterProvablyDead` prunes only non-drawable / no-shadow-flagged / no-castable-material / detached-from-root members; live-unmarked members still veto; re-join via next collect union-add per docstring. ✓
- **popin P3 resumed-batch debit** (pipelineReadiness.js:432-444): `forcedFrameSpend() >= BUDGET && !ranSynchronously` + `noteForcedFrameSpend(min(measured, budget))` — the `!ranSynchronously` guard is present. ✓
- **boot F1 stepped authored builds + abort**: yields at every leg (:3524-3530, :4758-4794); driver consults `pacedFrameSpend`/slice-budget then stale verdict after `composeYield`; abort = stepped pre-scan + paced detached teardown, sync fallback only if the queue refuses. ✓ (F1 finding is on the *failure* path around it.)
- **boot F2 pool census**: `cookPoolCompileRoots` async mint honors `cookStale`, `closeCookStepsIter` on fault, `noteLaneFault('cookPoolRoots')`, `runCookSyncTwin` fallback; consult sites awaited. ✓
- **boot F3 flight-template marker index** (:11486-11700): WeakMap index minted once per root; `noteFlightTemplateMarker` at both stamp loops (:11489, :11641); first-match order preserved (`!index.has(marker)`); marker-miss falls back to `objectAtRootPath`. ✓
- **boot F5 geometry mint strides**: 1024-stride yields in both collect/partition twins (startupGpuResidency.js:392-467); unconditional `collectYield()` between collect and mint preserved (:619-636). ✓
- **boot F6/F7 retained-dispose retry + watermark**: `head.retried` mints one fresh iterator then consumes; `enqueuedSeq` stamps at both pushes; `starveNoted` + `RETAINED_DISPOSE_STARVE_DRAINS = 8` logs once per head. ✓
- **boot F8 first-flight layer drawables Steps**: 256-stride explicit stack at renderer.js:12774 and latePipelineAdmission.js:277-305, typeof-guarded sync fallback + `cookStale`/`closeCookStepsIter`/`runCookSyncTwin`. ✓
- **hitches P1 receiverDelta heal**: :31955-31964 — drive-throw does `parkedMap.delete` + `_shadowReceiversDirty = true` BEFORE `notePolicyRootFault`. ✓
- **hitches P2 pool-growth fault parks**: `pool._growthFaultRetryAt` ~1 s backoff at :7151 and :7643 (both lanes). ✓
- **hitches P3 busErrorLog**: eventBus.js:35-70 — `BUS_ERROR_CAP = 256`, oldest-evict via `keys().next()`; `busListenerIds` WeakMap (:42). ✓
- **hitches P4/P5 warn routing + evict**: `_stormWarnLog` Map 256-cap + oldest-evict (:2176-2191); `authoredWarnLog` same shape (authoredMotion.js:35-50); `laneWarn` tolerates bare state across all call sites. ✓

No W114 machinery regressions found beyond F1's merge-restored line (which predates W114).
