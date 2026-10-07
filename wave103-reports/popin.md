# W103 audit — popin-admission

Audited branch `devin/1791064509-perf-w60` at HEAD 87c75829a. Audit-only; no code written, no app run.

`saturated: false`

## Findings (ranked)

### F1 — drawnCullRadius LRU: the hit path never re-stashes the outgoing key → the A↔B oscillation it was built for re-measures every other flip

**Evidence:**
- `src/render/visualCullRadius.js:92-110` — on `keyMoved`, the LRU consult (`lru.get(lruKey)`, :95) hits → writes `rec` fields, sets `rec.calls = DRAWN_CULL_REMEASURE_CALLS >> 1` (:104), refreshes recency (:107-108), and `return`s (:109) — **before** the stash block.
- `src/render/visualCullRadius.js:112-117` — the outgoing-key stash (`lru.delete(outKey); lru.set(outKey, cached.radius)` + ≤3 FIFO) sits *after* the hit `return`, reachable only on a miss.

**Mechanism:** trace the exact pattern the LRU comment promises to absorb (:66-70, "level A→B→A across camera churn"):

- Flip A→B (miss): stash A, measure B. LRU = `{A:rA}`.
- Flip B→A (**hit**): serve rA, refresh A's recency, `return` — B's radius is never stashed. LRU = `{A:rA}`.
- Flip A→B: `lru.get(B)` misses → stash A (already there — a no-op recency refresh) → `Box3.setFromObject(mesh)` O(subtree), again.

So under steady 2-key oscillation — a hull hovering at a LOD-band hysteresis edge, the dominant flip pattern — every B-leg pays the full `setFromObject` walk inside `syncEntityViews`' per-slot cull test (`entityVisualCullRadius` → `drawnCullRadiusForMesh`, :162-163). The hit side works exactly once per cycle; the key that got away is never re-stashed, so the LRU's effective capacity for oscillation is *one* key regardless of `DRAWN_CULL_LRU_SIZE`. Worse for >2 keys: any key whose *exit* was a hit never lands in the LRU at all, so a 3-key round-robin (lod0→lod1→lod2) only ever serves keys whose exits happened to miss.

**Fix sketch:** hoist the stash above the `lru.get` — the outgoing `cached` key is guaranteed ≠ `lruKey` by `keyMoved`, so stash it first, then consult. On hit: outgoing lands in the LRU and the incoming is served — oscillation becomes all-hits after the first measured cycle. Optionally lift `DRAWN_CULL_LRU_SIZE` 3→~8 to cover the real composite-key domain (below, residual (a)). Effort **S** (≤10 lines). Magic-frame impact **M** — `setFromObject` is O(subtree) on transition frames inside the visible pass, multiplied per flipping mesh at a band edge. Risk **low** — pure memo bookkeeping; every served radius is still the key's own measurement (sub-check (d) preserved).

### F2 — LOD-swap / family-refresh shadow notes pay two unmeasured `countShadowReceivers` O(subtree) walks per swap, on the presented path

**Evidence:**
- `src/render/partsLibrary.js:9186-9197` (`swapTo`): `boundary.remove(prev)` → `shadowNotes.removed(prev)` and `boundary.add(next)` → `shadowNotes.added(next)` — both called with no measured count.
- `src/render/partsLibrary.js:9145-9162` (`refreshWholeShipLodFamily`): detaches **every** retained non-lod0 root in one loop, `shadowNotes.removed(root)` unmeasured per level.
- `src/render/renderer.js:9714, 21305` — the `shadowMeshNotes` seam routes to `_noteShadowMeshAdded/_noteShadowMeshRemoved(root)` with `measuredReceivers = null`.
- `src/render/shadowReceiverTally.js:131, 145` — `measured == null` → `countShadowReceivers(root)` runs an inline subtree traverse right there.

**Mechanism:** `boundary.userData.updateLod` resolves on the presented frame (retained roots swap "instant", partsLibrary.js:9227-9233). A single band crossing pays **two** O(lod-subtree) traverses — one on the outgoing root, one on the incoming — inside the same frame as F1's re-measure and the swap's own `invalidateShadowCasterPolicy` walk. A fleet-wide demotion (camera pull-out across a fight) multiplies by the hull count on adjacent frames. The retained LOD roots are *stable objects* (`roots[level]`, `retainedComposed`) — their receiver counts change only on graft, so the walk result is memoizable once per root instead of re-paid per swap.

**Fix sketch:** mint `root.userData.sfReceiverCount` at compose/admit time (partsLibrary owns every splice seam into retained subtrees — `instantiatePackagedPrimitives`, motion-driver grafts), invalidate on any graft, and pass it as `measuredReceivers` to both note calls. Cheaper variant: `swapTo` already invalidates the caster policy — fold both counts into that existing walk. Effort **S-M**. Magic-frame impact **M-H** — two guaranteed O(subtree) traverses per swap per hull, on exactly the band-crossing frames this lane exists to protect. Risk **low-mid** — the memo must be invalidated at every graft site into the retained subtree or the tally drifts (same staleness class as the cull-radius cache).

### F3 — `_releaseSurvivalRosterPrewarm` sync-disposes the part-catalog root and never notes its removal

**Evidence:**
- `src/render/renderer.js:20721-20726` — `catalog.parent.remove(catalog)` + `disposeObject(catalog)` inline, `contextLost`-gated; **no** `_noteShadowMeshRemoved` call at all.
- `src/render/renderer.js:18544-18549` — the catalog is a `scene.add`ed `THREE.Group` that accumulates ~30 GLB part holders + pool-witness pairs under it during the paced catalog load (`_admitRosterPartCatalog`).
- `src/render/renderer.js:20731-20755` — the very next loop in the same emit pushes every warm root into `_despawnDisposeQueue` ("pace across the despawn drain's parked per-corpse iterators instead of paying an atomic teardown inside the run:ended emit") — the catalog bypasses the queue it sits next to.

**Mechanism:** two defects. (a) `run:ended` (:17524-17526) pays an atomic `disposeObject` over the whole catalog subtree — hundreds-to-thousands of nodes (30+ part GLBs × holders + witness groups) — inside the same emit the drain exists to pace. (b) The catalog's composed parts carry `receiveShadow` and were counted while mounted (any intervening tally recount walks the mounted subtree regardless of `visible=false`); the release notes nothing, so `_shadowReceiverCount` stays inflated until the next incidental dirty recount — `shadowMapActive` stays conservative-on, a wasted depth pass rather than a pop, but exactly the under-note class the measured-corpse machinery exists to kill.

**Fix sketch:** route the catalog through `_despawnDisposeQueue` like the sibling warm roots (the drain's `corpseMeasure` settles the note exactly, remount-safe); the `contextLost` early-out already covers the abandon case. Effort **S**. Magic-frame impact **M** — one atomic O(catalog) teardown on `run:ended`, the frame class the queue protects. Risk **low**.

### F4 — warm teardown/discard lanes pay unmeasured notes + sync `disposeObject` fallbacks on failure paths

**Evidence:**
- `src/render/renderer.js:18918-18925` (`teardownWarm`), `:19460-19467` (`_discardEarlyCrucibleWarm`), `:20274-20277` (build-failure `teardown`): `root.parent.remove(root)` → unmeasured `this._noteShadowMeshRemoved?.(root)` → `disposePreparedAuthoredBoundary(root) || disposeObject(root)`.
- `src/render/partsLibrary.js:8915-8918` — `disposePreparedAuthoredBoundary` returns falsy when no disposer was installed on the boundary → vf.build warm exemplars take the sync `disposeObject` fallback.

**Mechanism:** same class as F3 on the failure/discard lanes: an inline `countShadowReceivers` traverse plus a whole-exemplar atomic `disposeObject` inside whichever presented frame the async continuation resumes on. Rarer than F3 (teardownWarm/teardown are failure-only; the discard is once per sector) but wholly un-budgeted and un-measured.

**Fix sketch:** when the context is live, push the root into `_despawnDisposeQueue` (measured note + paced teardown, remount-skip included); keep the sync fallback only for `contextLost`. Effort **S**. Magic-frame impact **L-M** (rare triggers, real subtrees when they fire). Risk **low**.

### F5 — cadence re-measure expiry burst is un-bounded per pass under a same-age fleet

**Evidence:**
- `src/render/visualCullRadius.js:83` — expiry at `++cached.calls >= 600 + (mesh.id & 63)` — the jitter spreads expiries over a 64-call window.
- `src/render/renderer.js:23130` + ten sibling call sites (:1050, :1225, :1438, :2921, :2946, :2974, :3391, :3427, :7137, :11510, :21324) — several increment the same mesh's `calls` per frame, so the jitter window compresses in *frames* as call fan-out grows (3 calls/frame ⇒ ~21-frame spread).

**Mechanism:** stationary camera, same-age sector mint, N continuously-visible authored roots: `calls` advance in near-lockstep → the 64-call jitter window lands as ~N/16–N/64 `Box3.setFromObject` O(subtree) re-measures *per presented pass* for a ~1 s stretch, with no per-pass cap. The id-residue spread itself is sound (Object3D's global counter decorrelates residues for sequential mints); the residual is only the un-bounded per-pass count and the multi-callsite acceleration.

**Fix sketch:** per-pass re-measure budget (e.g. ≤4 per `syncEntityViews` pass — pass a shared counter into `drawnCullRadiusForMesh`); a mesh past budget serves `cached.radius` one more call-cycle — the drift the cadence exists to bound extends by ≤budget passes, invisible against the 600-call baseline. Effort **S**. Impact **L** (shaves a rare ~ms-class lump; not a pop). Risk **low**.

## W102 machinery verification (required items)

| Item | Verdict | Evidence |
|---|---|---|
| 1. `_drainHiddenUnfreezeQueue` / `_queueHiddenSubtreeUnfreeze` | **Sound** | renderer.js:21230-21263 — drain drops on `sfHiddenFrozen \|\| sfHiddenFreezeQueued \|\| matrixAutoUpdate!==true \|\| !parent` (:21257-21258), each drop deletes `sfHiddenUnfreezeQueued`; mints bounded by `HIDDEN_FREEZE_MINT_ROOTS_PER_PASS`+`HIDDEN_FREEZE_SCAN_PER_PASS` (:889-897) with `pending.length = w` compaction. Visible loop (:23462-23471) queues **while** `sfHiddenFrozen===true`, then clears + `matrixAutoUpdate=true` + stamps `sfHiddenFreezeLastShowSeq`; `_unbindPresentationMesh` deletes the flag (:21434-21444). |
| 2. `HIDDEN_FREEZE_FLAP_DWELL` hysteresis | **Sound** | :21201-21205 — re-show within 3 passes defers the mint (`pending[w++]`, flag untouched); absent `lastShowSeq` mints; dwell compares `_viewSyncSeq` (:23268 increments it), never wall clock. |
| 3. `notedWalk` unconditional visit stamps | **Sound** | shadowReceiverTally.js:58-64 detached ancestor-liveness skip precedes the :71-74 stamp; visited-then-removed writes `note.delta = -delta` (:155-160); unvisited-note removal deletes the pair (:149-154); stamps are unconditional on live pops. |
| 4. Measured corpse notes via `_despawnDisposeQueue` | **Sound** | :2066-2069 `disposeObjectSteps(m, corpseMeasure)`; remount skip :2049-2055; `sfDespawnNoted` skip+clear :2107; else `noteShadowMeshRemoved(m, iter._measure.receivers)` :2108; torn iter nulls `_measure` :2095 → dirty recount. All four legacy unmeasured push sites are gone from the queue-adjacent paths; remaining unmeasured sites enumerated under residual (d) → F2/F3/F4. |
| 5. Stepped sweep disposes (leftover + sector-departure) | **Sound** | :12779-12824 drives `disposeObjectSteps` under 8ms+`pacedFrameSpend` inside per-corpse teardown, notes `leftoverMeasure.receivers` (:12809); :15578-15606 same shape under `providerSliceDue`, note at :15597; `cookStale` mid-teardown leaves scene-removed half-disposed corpse — documented contract. |
| 6. `drawnCullRadius` per-mesh LRU | **Present; stash defect — F1** | (a) LRU consulted only on `keyMoved` (:89-92) — cadence expiry still re-measures ✓; (b) hit halves cadence (:104) ✓; (c) outgoing keys stash with ≤3-entry FIFO (:112-117) — *but only on miss* → F1; (d) served radius is the key's own earlier measurement ✓ (:95, :105). |
| 7. Generation-validated retire bursts | **Sound** | presentationWorld.js `updateFromEntitiesSteps` deadResidents mint `{slot, slotGenerations[slot], resident}` and re-check alive/gen/entityRefs/`resident.alive` before retire; absent mints `{id, sourceGenerations[slot]}` → `retire(id, gen)` honoring the journal DESTROY contract; recycled slot / resurrected id mid-park skips. |
| 8. Cook-scoped drawable census | **Sound** | `mintTouchDrawableSession` :10761-10785 — `_touchDrawableCensus` keys `{scene, _liveSectorCookGeneration}`; the four leg sessions share `census.drawables`, each minting its own `keep` Set; paced `drawableHideSessionSteps` under `admissionPaceYield` — only first mint pays. |
| 9. Per-call `keep` (`withOnlySubjectsDrawable`) | **Sound** | openingGpuAdmission.js:500-534 — `keep` mints fresh per call (:506); ancestors+descendants join for this call's subjects; `session.keep` no longer read by the hide pass. |
| 10. Guarded census iter | **Sound** | both presented-frame `next()` sites (:24967-24972 arm, :25322-25330/:25389-25397 drain) try/catch → `{done:true,value:undefined}`; timer-gap drain already guarded. |
| 11. Paced roster-prewarm cohort | **Sound** | `needsWork` early-return :18272-18295; `cohortOwed()` is a sync check gating the `await` (:18323-18327); mounts use `_markShadowReceiversDirty` not `_noteShadowMeshAdded` (:18476); drain joins `_rosterPrewarmPending` (:18305-18310); `_rosterPrewarmLeafWarmed`/`_rosterPrewarmCatalogAttempted` stamp at attempt time (:18471/:18500); drain-end `upgradeBareRockMaterials` covers late mounts under `cohortOwed` yields (:18494-18498). |

## Lane residuals (a)–(e)

- **(a) LRU thrash:** real workloads *can* exceed 3 composite keys — `wholeShipLodActiveLevel` ranges over `{'','lod0','lod1','lod2'}` (partsLibrary.js:9096/:9177/:9220; `wholeShipLodFileForEntity` serves lod2 :2532), crossed with `authoredAssetState` transitions → 3-6 keys per mesh on a demoting hull. A `compositionId`-alone memo does **not** suffice — `lodLevel` is the flipper, `childCount` catches grafts; keep the composite key but fix F1's stash and consider cap 3→8. The dominant real pattern is the 2-key edge-hover oscillation, which F1 alone fixes.
- **(b) cadence burst:** worst case enumerated — ~N/(jitter window compressed by per-frame call fan-out) expiries per pass; F5.
- **(c) fence-pack membership-exact residual: verified clean.** Stepped pack (`snapshotFence.js:394-508`): frozen `mintedSlots` slice (:477), `packedSlotGens` slot|generation dedup (:414-420), churn-gated `world.liveSlotValues()` sweep (:492-505) armed only when mint-captured `diagnostics.allocations/retirements` moved (:401-402) — Map-iteration semantics make it insert-visit/delete-skip exact. Atomic twin `packPresentationWorldToFence` (:305-385) is synchronous — no park window, no sweeps needed. Hand-packed rows are safe: `snapshot.write` stamps `generation=0` (:140) and `nextGeneration` skips 0 (presentationWorld.js:58-61) so a gen-0 row can never alias a live slot generation in the `copyRow` guard (:336-340); `packEntityIntoSnapshot` has no production callers (tests only, renderEntityFrame.js-adjacent path uses the `beginFrame` snapshot, a different consumer). `liveSlotValues` = `byId.values()` (:1493), kept consistent with `activeSlots` by alloc/retire.
- **(d) unmeasured `noteShadowMeshRemoved`, ranked by subtree:** **F2** (LOD swap + family refresh — whole retained LOD roots, presented-path, hot) > **F3** (catalog — large, one-shot, plus missing note entirely) > **F4** (warm teardown/discard lanes — large, rare) > `onAuthoredAssetSwap` fallback :9305 (small stand-in) and `asteroidLeafWarmRoot` :15124 (medium, rare). The `:16570-16588` `disposeBoundaryObject` path the brief flagged is *already* stepped — `disposeObjectSteps` under a 4ms wall + `pacedFrameSpend` + `yieldToNextPresent` with `boundaryDisposeMeasure` settled-exact noting (:10476-10535) — not a residual.
- **(e) un-budgeted walks, ranked:** top fixable = F2 (two O(subtree) note walks per swap) with F1's re-measure on the same frames. Remainder verified bounded-by-design: `candidateSlots.sort(compareEntityId)` (:371) is the deterministic admit order — keep; `syncAsteroidInstancePool` dirty-gated (:500-521 `canReuseStaticSubmission`); `syncJournalRebuildEscalation` is the ≥3-invalidation atomic fallback that terminates the doom storm (presentationRunner.js:743-754, :802-803), and `collectedLiveIds` builds only on suppressed-destroy races (:787-797); `collectSpecialSlots` O(specialCount); `endRenderEntityFrame`'s `_evictIter` already paces map eviction ≤256/pass.

## Prior-wave adjudication notes

- All findings render-side; sim determinism untouched.
- F1 is a defect *in* the landed W102 machinery (verification item 6c), not a re-report: the stash block exists and is correct but unreachable on the hit path.
- F3/F4 extend the measured-corpse contract to roots that never enter `_despawnDisposeQueue`; the queue machinery itself verified sound.
- `:27261` full-scene `receiveShadow` traverse is the tally-absent fallback only (`_shadowReceiverTally` minted at :9938) — near-dead in production, not reported.
- `_renderPostRoute`'s single `scene.updateMatrixWorld` (:27600) is the documented replacement for per-pass walks — keep.
- No new preexisting-test-failure observations; audit ran no tests per lane rules.
