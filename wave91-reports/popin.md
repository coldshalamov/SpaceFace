# Wave 91 — popin-admission audit

- head: `8109eee8e92c07986f712efb624ad8e7792ed96a` (`devin/1791064509-perf-w60`)
- lane: popin-admission
- `saturated: false`

Two contract-preserving fixes with concrete implementation paths remain (F1, F2), plus a real but bounded teardown pacing gap (F3) — the lane is not saturated.

## W90 regression verification (9 blocks — all landed at `8109eee8e`)

1. **Settle-time depth park — verdict timing/payload/re-offer.** VERIFIED. `renderer.js:24705-24724` (`parkedRelease`/`parkedReleaseOnDrift` gates: `dirtySeq` bump 24713, `lightSig` ≠ census 24714-24716, ortho cell 24717-24723) + recheck cadence `24741-24753` + `collectGate` 24761-24764 + verdict fan-out `parkedMap.set` payload at 25234-25245 under `allUnmarked` 25201+. Note: parked roots release on dirtySeq bump and the deliberate recheck cadence too — not only on drift — and the parked record's `lightSig` field carries the census signature.
2. **Drift-release traverse skip.** VERIFIED. `skipTraverseOnDrift` 24871; `traverseDeferred`/`changed`/pass-count bookkeeping 24872-24889.
3. **Arm sig/epoch pairing + session close + marker children-scan.** VERIFIED. `armSigEpoch = shadowCensusEpoch()` (renderer.js:25079) handed into `driveCompileShadowDepthPipelines` as `lightSigEpoch` (25185-25198); `censusStale = lightSigEpoch !== shadowCensusEpoch()` consulted at shadowDepthAdmission.js:587/635/666; `closeShadowDepthStagingSession` does the WeakMap delete + `session.close()` (542-547), reached from `_killDepthStageSession` (renderer.js:25400-25401); session sig+epoch reuse gate 601-603. Marker straggler purge scans `boundary.children` only under `authoredResolvingMarker === true && Array.isArray(children)` (visualOverrides.js:622-629).
4. **Corpse-iterator identity.** VERIFIED. `iter._corpse = m` stamp at mint (renderer.js:1981-1982), re-mint on identity mismatch (1979), both reset sites null the iter (destroy flush 17448, clearAllMeshes 20842).
5. **retainedDisposeQueue paced drain + disposePreparedAuthoredShip attempt().** LANDED WITH DEFECT — see F2. Queue + `setTimeout`-paced drain exist (partsLibrary.js:8960-8994), each head drives `disposeDetachedObjectSteps` one slice per fire under a 4 ms slice clock + wallet check; `disposePreparedAuthoredShip`'s `attempt()` yields at `>= 4 || pacedFrameSpend() >= BUDGET` (8791-8840). But the aging counter is invocation-local — the drain can starve indefinitely under sustained wallet pressure.
6. **Commit dispose wallet gates ×2.** VERIFIED. Both authored-commit `finally` legs consult `disposeLedgerSkips < 2 && pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` before minting the next `Steps` slice (partsLibrary.js:4307-4313 place, 9466-9472 ship), with post-wait `commitLegStarted` restamps (4311/4318, 9470/9477). Caveat: `disposeLedgerSkips` is per-drive — see F6.
7. **updateFromEntities eligibility recheck + hide block + absent sweep.** LANDED WITH DEFECT — see F1. Recheck mirrors the push halves (`_noMesh` 865, `projectileSkipsVisualFactoryMesh` 866); `hiddenIds` hide block 900-908; dense absent sweep 914-926 with `byId.get(idCols[s]) === s` slot-exact guard.
8. **Dirty-column fence pack.** VERIFIED. `packPresentationWorldToFence` copies the latest pack's row verbatim when `previous.poseEpoch === poseEpoch` and `dirtyMasks[slot] === 0` (snapshotFence.js:302-317); slot remaps fall back to full write via the epoch gate.
9. **hiddenIds doomed-row feed.** MECHANICALLY PRESENT, SEMANTICALLY INERT — see F1. Runner feeds `rebuildSuppressedDestroyIds` as `hiddenIds` only while a prefix is streaming (`presentationRunner.js:783-801` → `populateJournalFrame` 854-891 → `presentationPublisher.js:120-125` → `updateFromEntities` hide block). The write never reaches the draw path.

## Findings (ranked)

### F1 — Doomed-row hide never reaches the mesh; its sticky dirty defeats both retain paths for the whole suspension window (H)

Evidence:

- `src/render/presentationWorld.js:900-908` — the hide writes `world.visible[slot] = 0` + `markDirtyBits(VISIBILITY)` for suppressed-destroy ids not stamped this feed.
- `world.visible[]` has **zero draw-path readers**: only writers (588 alloc, 669 retire, 749 unbind, 905 hide, 993 setVisibility) and two self-referential readers (904 hide guard, 992 setVisibility compare). Nothing in `presentationQueries`, `snapshotFence`, or `renderer` consults it.
- The only real hide channel — eviction into `query.hiddenSlots` → `applyEntityMeshVisibility(mesh, false)` (renderer.js:22376-22441, `hidden: true` at 22404) — never receives the slot: `exactVisible` (presentationQueries.js:128-143) checks `world.alive` (still 1 — retire is suppressed), `meshRefs` (still bound), `flags`, and bounds — never `world.visible` or `entity.alive`. The slot re-confirms every frame (`currentMarks[slot] = frameEpoch` at 326) so the hidden-diff loop skips it (341).
- The VISIBILITY dirty is never consumed either: the visible loop `continue`s at `renderer.js:22470` (`entity.alive === false` — `entityRefs[slot]` still holds the dead object; kills mutate `e.alive = false` in place, coreSystem.js) *before* the dirty check at 22504 and the `clearDirty` at 22825; the hidden loop's `clearDirty` at 22427 never runs.
- Net effect per frame for the whole ~1-8-present suspension window: `dirtyCount > 0` → zero-dirty retain dead (presentationQueries.js:187) and VISIBILITY is a `nonTransform` fail-open for pose-dirty retain (215-219) → every presented frame pays the full `collectSpatialBounds` + `collectSpecialSlots` + `exactVisible`-per-candidate walk until the publish retire clears the mask (`retireSlot` → `writeDirtyMask NONE` → `noteCleanSlot`, 670/555-559).

Mechanism: the player keeps seeing the ghost mesh at its stale pose through the entire suspended collect — exactly what the hide set out to prevent — and pays a whole-scene full spatial walk per present on top.

Fix sketch: make the hide observable where the query re-confirms membership — a dedicated bit (new `hiddenMask`/`doomed` column, or a `PRESENTATION_FLAGS` bit checked *before* the FORCE_RENDER/NEVER_CULL/player bypasses in `exactVisible`) set by the `hiddenIds` loop and cleared when a feed pushes the id (the `lastSeenSeq !== seq` guard already distinguishes respawns). The slot then evicts into `hiddenSlots` next query → real `applyEntityMeshVisibility(mesh, false)` → hidden-loop `clearDirty` consumes the bit, restoring both retain paths. Restore guard: the same feed that pushes a live id must clear the flag atomically or a respawn flashes hidden one frame.

Effort: M. Magic-frame impact: H (the W90 goal — no stale ghost drawing through suspension — is unmet, plus a per-frame full-walk regression). Risk: M (flag must not leak into the spawn-clean `visible=0` mint — gate exactVisible on the flag, not on `visible[]`).

### F2 — `retainedDisposeQueue` starvation: `skips` is invocation-local, so the aging bound is dead code (M)

Evidence: `src/render/partsLibrary.js:8968` declares `let skips = 0` inside the `setTimeout` callback — re-minted per drain invocation. The wallet gate at 8970 (`pacedFrameSpend() >= PACED_FRAME_BUDGET_MS && skips < 2`) increments and `break`s at 8972 — `skips` can never reach 2 within one invocation, and never carries across invocations. Contrast the despawn drain it claims to mirror: `owner._despawnDisposeLedgerSkips` is persistent across drain calls (renderer.js:1943-1948), so the third consecutive busy frame forces work.

Mechanism: under sustained wallet pressure — precisely an admission/decode storm, when demoted retained LOD roots accumulate fastest — every `setTimeout(0)` drain reads `>= BUDGET`, skips, and reschedules; the queue dwell is unbounded until a frame happens to stay under budget at fire time. Roots are already detached (no visible trail), but their renderer-registered geometries/materials stay resident — GPU/memory growth with no reclaim, releasable only by `disposeWholeShipLodRetained` re-attach at boundary death (9069-9079) or a quiet frame. `releaseComposedRetained` does not rescue it — it drives the paced `disposePreparedAuthoredShip`, not this queue.

Fix sketch: hoist the counter to module scope (`let retainedDisposeLedgerSkips = 0`), increment on the wallet-skip, reset it when a drain does work, and fall through to a bounded slice when `>= 2` — the exact despawn-lane contract at renderer.js:1943-1948.

Effort: S. Impact: M (indefinite reclaim starvation under the storm class the queue exists for; invisible but real residency growth). Risk: S.

### F3 — Prepared-boundary abandon legs run the SYNC teardown twins — whole authored subtrees atomically mid-present (M)

Evidence:

- `src/render/partsLibrary.js:3217` — `disposeDetachedAuthoredCargoCapsule` → sync `disposeDetachedPlaceFallback(authored.root)` (then `root.clear()`), invoked via `installedPreparedDisposer()`/`disposePreparedCargoCapsule()` on pipeline-error and orphan legs (3233, 3246, 3259, 3263, 3278).
- `src/render/partsLibrary.js:4059-4071` — `disposePreparedPlace` → same sync `disposeDetachedPlaceFallback(authored.root)` on every place-admission abandon leg (4082, 4097, 4109, 4113, 4127).
- `src/render/visualOverrides.js:982-997` — `disposeDetachedPackagedGroup` is a synchronous `traverse` + geometry/material dispose (no `Steps` twin), called from ~15 orphan/error legs inside the packaged-prop commit continuation (1161-1288).
- `installPreparedBoundaryDisposer` fires the disposer via `Promise.resolve().then(dispose)` (8857) — a bare microtask, not a paced leg; the sync fallback teardown runs atomically inside it.
- Compare the W90-paced originals the commit path uses: `disposeDetachedPlaceFallbackSteps` (4300) / `disposeDetachedObjectSteps` (9463) with wallet consult + per-slice `yieldToNextPresent`.

Mechanism: an admission abort racing a presented beat tears down a whole prepared authored tree (cloned batch geometry, typically hundreds of nodes — the despawn lane notes ~1-3k for a packaged hull at renderer.js:1960) in one microtask — same atomic-slice class W90 removed from the commit legs. Each abandon leg is individually rare, but orphan storms (re-admission under a newer epoch mid-flight) fire several in a row.

Fix sketch: point the prepared disposers at the `Steps` twins (`disposeDetachedPlaceFallbackSteps`, a new `disposeDetachedPackagedGroupSteps`) driven by the same wallet+4 ms loop the commit `finally` legs already run, or push the detached roots onto `retainedDisposeQueue` once F2 makes it non-starving.

Effort: M. Impact: M (atomic whole-tree teardown inside a presented beat — a hitch, not a pop). Risk: M (the registry-unregister `finally` semantics at 3222/4068 must still run even if the stepped drive is abandoned).

### F4 — Mid-window eligibility tombstones draw through suspension with no hide coverage (M)

Evidence: `updateFromEntities` skips `_noMesh === true` and `projectileSkipsVisualFactoryMesh` entities in the feed (partsLibrary-side push mirrors, presentationWorld.js:865-866), so a post-push tombstone's `lastSeenSeq` goes unstamped — but it is *not* a destroy, so it never enters `suppressedDestroyIds` (presentationJournal.js:270 adds only `kind === 'destroy'`) → no `hiddenIds` coverage; and the retire sweep is suppressed for prefix feeds (914). `exactVisible` still passes (alive + bound + in-bounds) → the stale row draws the whole window; the completed collect's unsuppressed sweep retires it only at publish. (`projectileSkipsVisualFactoryMesh` flips are rare; `_noMesh` flips post-push "after repeated build failures" per the 863 comment.)

Mechanism: an entity that tombstones mid-window shows its last bound pose through the suspension — same ghost class as suppressed destroys, zero coverage. (Note: fixing F1 gives this a flag to reuse — feed recheck-skipped stale slots into the same hide path.)

Fix sketch: when the recheck skips a `byId`-resident entity, add its id to the hide set alongside `hiddenIds` (or OR the tombstone predicate into the hide loop); publish-retire remains the outer bound.

Effort: S-M. Impact: M (bounded by the suspension window; narrower class than F1 but same player-visible symptom). Risk: S-M.

### F5 — Commit dispose pacing is gated on `mode === 'flight'`; non-flight commits drain the whole stepped iterator atomically (L)

Evidence: `yieldBetweenGpuStages: !!(liveState && liveState.mode === 'flight')` (partsLibrary.js:6830; same gate at 13390 `live.mode === 'flight'`). Both commit dispose loops predicate the wallet consult *and* the per-slice yield on that flag (4307-4308, 4320; 9466-9467, 9479) — with it false, the `for(;;)` runs `disposeIter.next()` to completion synchronously.

Mechanism: a commit finishing while docked/menued disposes the entire fallback subtree in one beat. This mirrors the deliberate `overlapAuthoredPipelineCompile: mode !== 'flight'` convention (6829) — non-flight phases batch because the present isn't the contested frame — but it hinges on "non-flight presents never show the live world hitching." If dock/station views present the world behind UI, the atomic dispose is a visible hitch there too.

Fix sketch: keep the batching behavior but run the iterator under the slice clock alone (`>= 4 ms` leg bound, wallet consult optional) so worst-case non-flight cost is bounded without spreading across presents.

Effort: S. Impact: L. Risk: — (design question; likely DOCUMENTED after a look at what dock views actually present).

### F6 — Per-drive `disposeLedgerSkips` re-arms every commit independently under a K-commit storm (L)

Evidence: `let disposeLedgerSkips = 0` is per-`finally`-block (partsLibrary.js:4301, 9464). K concurrent commit disposes each burn two waits then work anyway; the shared wallet still serializes them intra-beat (each debit lands before the next peer's check, so per-beat dispose spend stays ≈ BUDGET + one overshoot slice), but the aging is not cross-drive — a storm of K commits re-arms K work-now drivers rather than one.

Mechanism: bounded in-cost (wallet dominates), so this is fairness headroom, not a burst defect: after ~2 saturated beats all K drives converge on "work anyway" and the ledger alone gates them — correct, but a shared counter would hold the *intent* (bounded skip aging) across the storm rather than per participant.

Fix sketch: module-scope `authoredDisposeLedgerSkips` shared by both loops (reset on any productive slice), same pattern as F2.

Effort: S. Impact: L. Risk: S.

## Lane (d) verdict — dense retire-scan stale-byId classes

The dense sweep (`presentationWorld.js:914-926`) is slot-exact (`byId.get(idCols[s]) === s` guard) and id-reuse is contractually excluded — `state.nextEntityId` is monotonic (`entity.js:169-178`; load reservations at asteroidField.js:126-129 / dressingTable.js:43-46 exist precisely to keep post-load ids from colliding with the spawn order), and `byId.delete(entityId)` is atomic inside `retireSlot` (673). `allocateRecord` throws on duplicate ids (580-583). No stale-byId → dead-row-alive hazard found beyond F4's tombstone class. Related note: `updateFromEntities` zeroes `sourceGenerations`/`revisions` on every retained refresh (887-888) since `generationForEntity` is always `null` (publisher feed) — subsequent journal records for a zeroed slot trip `assertRecordSlot` (693) → throw → fallback persists until stepped republish re-mints. That's the intended fail-fast, but it means a diff-apply window and the journal stream can never interleave on retained rows.

## Lane (a) verdict — hiddenIds restore latency / ghost-hide flicker

As written, `hiddenIds` can produce **no** ghost-hide flicker: its only writes are the unobservable `world.visible[]` bit plus a sticky VISIBILITY dirty (F1) — no class of entity loses its mesh via this path, so none can lag a restore either. Enumerated for completeness: in-view dead entities (`entityRefs[slot].alive === false`, skipped at renderer.js:22470 before any visibility apply); respawned ids arriving in a later prefix (the `lastSeenSeq !== seq` guard at 903 already skips them — sound design); protected roots (player/forceRender/neverCull bypass the `!posed` hide at 22508 but not the hiddenSlots path — consistent). The inherent 1-frame restore floor remains on the publish-retire side: a respawned id re-mints via `allocateEntity` (BINDING|TRANSFORM|VISIBILITY all dirty) and draws only once its row lands in a completed pack (`_hasCompletedPresentationPose` fail-closed → `applyEntityMeshVisibility(mesh, false)` for the first frame). That floor is by design; an F1 fix must preserve the same atomic clear-on-push to keep respawn restore at zero extra frames.

## Coverage

- (a) hiddenIds restore latency → F1 (+ restore-floor note)
- (b) retainedDisposeQueue starvation bound → F2 (unbounded under sustained wallet pressure; invisible)
- (c) wallet-consult cap / K-drive storms → F5, F6 (bounded by the shared wallet intra-beat)
- (d) dense retire-scan stale-byId → F4 (+ no id-reuse hazard)
- (e) un-paced teardown/release on popin boundary → F3 (+ F5 mode gate)
