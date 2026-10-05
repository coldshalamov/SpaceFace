saturated: false

Audit target: branch devin/1791064509-perf-w60 @ 2162d361e (verified checked out). Lane: in-flight-hitches.

## FINDINGS (ranked)

### HITCH-85-1 — Journal-suspension per-frame atomic fallback: the paced rebuild multiplies, not slices, the presented-frame cost (impact: H, effort: S)

Evidence:
- src/core/presentationRunner.js:721-784 — `rebuildJournalIfNeeded` mints `steppedJournalRebuild` and drives `JOURNAL_REBUILD_SLICE_ROWS = 512` rows per call.
- src/world/presentationSources.js:122-129 — `collectJournalPresentationEntitiesChunked` yields **per row**, so the collect leg spans `ceil(E/512)` presented frames (E = live journaled entities + dressing rows; e.g. E=2000 → 4 presents, E=16384 → 32 presents).
- src/core/presentationRunner.js:786-800 — `populateJournalFrame` sets `journalValid = journal !== null && !needsRebuild()` → **false for the entire suspension**.
- src/render/presentationPublisher.js:151-152 — `consume()` hits `needsRebuild === true || journalValid === false` → `fallbackFromState`.
- src/render/presentationPublisher.js:81-96 — `fallbackFromState` = `requestRebuild` + `world.rebuildFromEntities(aliveEntities(state))` — an **atomic O(E) collect + clear + allocateEntity loop** (presentationWorld.js:804-822).
- src/render/renderer.js:23257-23258 + 20548-20555 — `publication.rebuilt` → `_rebindPresentationMeshes()` = **O(_meshes) full rebind** (`resolveWorldPresentationEntity` + `_bindPresentationMesh` per row — texture-claim and motion-note re-sync per mesh).

Mechanism: a journal rebuild (spawn-suppression overflow, tick-rewind, capacity, foreign-write invalidation, save/relocate/events `requestRebuild`) used to pay ONE atomic frame. Now the journal's internal republish is paced across `ceil(E/512)` presents — but **every presented frame of that suspension still pays the full atomic fallback**: `aliveEntities` whole-state collect + `world.clear()` + O(E) `allocateEntity` + O(_meshes) rebind. The W84 pacing moved cost out of the invisible write-log leg while leaving the foreground worse than the old sync rebuild: S presents × O(E + _meshes) instead of 1 × O(E). In a big fight this is a sustained multi-frame hitch train exactly when the journal already told us it was rebuilding.

Sub-detail: during the **collect** leg `rebuildInProgress === false`, so foreign `recordCoalescible`/`publishSpawn`/`recordDestroy` writes are *suppressed* (presentationJournal.js:247-250, 316-318, 381-384) without marking `rebuildInvalidatedDuringSteps` — the fallback's own `requestRebuild` also `clearRetained()`s per frame (236-244), harmless since the journal is already doomed and the collect reads live state. The retained ring stays intact until `rebuildFromSteps`'s first publish `.next()` runs `clearRetained()` at :546 inside the same runner call that finishes the collect.

Starvation analysis (hunt d): convergence is **guaranteed for E ≤ 16384** (ring capacity, presentationJournal.js:11/122): the publish leg advances ≤512 yields × 64 rows = ~32k rows per call, so it never suspends across presents for any capacity-feasible E; `rebuildInProgress` is true only inside that one synchronous call — no write can interleave — so `rebuildInvalidatedDuringSteps` and the `'invalidated'` verdict (:568-571) are effectively unreachable today. For E > capacity the attempt deterministically returns 'rebuild-capacity' forever → infinite per-frame fallback loop (theoretical; journaled set is much smaller than 16384 in practice — worth a one-line diagnostic counter note, not a fix). Meanwhile the *presentation* content during suspension is the fallback's raw-entity mirror: journal-coalesced visual records pending application are dropped (`spawnedSlots` zeroed, publisher.js:92-93), so staged visual transitions snap straight to sim state each fallback frame.

Fix sketch: the collect leg is the only suspension — `pushAlive` per row is ~sub-µs. Drive the collect on the shared paced-ledger/4 ms wall-clock budget (same contract every other slicer uses) instead of the fixed 512-row slice: the collect then completes inside ~1 present for any feasible E, collapsing the episode back to ~1 fallback frame while the publish leg stays paced. Alternative accepted-but-weaker shape: in `consume()`, when a stepped rebuild is in flight and the world was already rebuilt this episode, return an idempotent result — but that freezes poses for the suspension, so the ledger-paced collect is strictly better. Risk: low — identical pacing contract as `driveProtectedFirstFlightDrain`.

### HITCH-85-2 — `_syncWorldPresentationTableMeshes` origin-rebase walk is now the exposed monolith (impact: M-H on rebase ticks, effort: L)

Evidence:
- src/render/renderer.js:22792-22865 — gated on `fieldStale || dressingStale`; the `fieldDirty`/`dressingDirty` journals already narrow version-churn frames, but `this._worldFieldPoseOriginSeq !== originSeq` (origin rebase) or a pre-journal table still forces the **full `field.rocks` + `dressing.rows` walk** (22832-22834, 22851-22852): per row `_meshes.get` + `_frameMembrane.toLocal` + `position.set`/`rotation.y` + `updateMatrix`, then `invalidateAsteroidInstancePool` (22847) which re-drives the whole instance-submission upload.
- src/render/renderer.js:22988-22990 — the second compose is now `scene.updateMatrixWorld()` unforced (comment 22984-22987); three's vendored `updateMatrixWorld` (node_modules/three/build/three.core.js:12853) recurses **unconditionally** — unforced saves the per-node `multiplyMatrices`, not the traversal (~2.6k nodes post-warm-root-park; the 19666-19670 note measured 16,506 nodes ≈ 11 ms → ~0.7 µs/node).
- Mechanism/re-cost answer (hunt c): the deferred-item calculus *does* change sign. Previously the forced second compose recomputed every node's world matrix anyway, so stepping the table walk bought nothing against the bigger atomic leg. Now clean subtrees skip their math, so the atomic origin-rebase pose walk is **exposed as the largest remaining in-frame leg on rebase ticks** — and the rebase lands inside presented flight whenever the membrane origin shifts (sustained travel = periodic).
- Stepping it is unsafe mid-frame (torn mixed-origin presentation for a frame). The contract-preserving fix is structural: parent field/dressing table meshes under a membrane-local group node so `frameOriginSeq` shifts become an O(1) group-position write and the dirty journal keeps covering per-row pose churn — this also shrinks `poseRow`'s `toLocal` to dirty rows only. Interplay to preserve: `occEntry` y-sink write (22821-22822), `matrixAutoUpdate===false` path (22824), `invalidateAsteroidInstancePool` on posed rows, and the same for the dressing table (no instance pool). Risk: M (parent-transform ordering, occluder interplay, audit of every `position.set` reader that assumed scene-direct parenting).

### Ranking — render loop's remaining atomic registry/queue drains by worst-case rows per call (hunt e)

| drain | worst-case rows/call | bound |
|---|---|---|
| `consume()` → `fallbackFromState` → `world.rebuildFromEntities` + `_rebindPresentationMeshes` | O(E) + O(_meshes), unbounded, **per suspended frame** | none — finding HITCH-85-1 |
| `scene.updateMatrixWorld()` (presented compose, 25491) | O(scene nodes ≈ 2.6k) traversal | inherent; matrix math dirty-only |
| `_flushMeshReleasePending` (20256-20265) | 5 × O(registry records) per flush | registry-size bounded; one/frame when non-empty |
| `_syncWorldPresentationTableMeshes` (22792) | O(rocks + dressing) on origin rebase | finding HITCH-85-2 |
| `settleRebuildBridges` (2034) | O(_rebuildBridges) | small map |
| `drainDespawnDisposeQueue` (1926) | ≤ max(8, ceil(backlog/4)) items | count + 2 ms deadline + 2-skip aging |
| `driveProtectedFirstFlightDrain` (1975) | ≤ 4 ms | clock + paced ledger |
| `visitRange` happy path / `discardThrough` | O(frame/pending range) | coalesced, bounded by retained window |
| `_drainMeshBuildQueue` / `drainDeferredEnterSlice` / emit slices | per-slice budgets | paced |
| `_pruneMotionTrackerRecords` (20340) | stepped, ~1/s cadence | generator twin |
| `clearAllMeshes` (20570) | O(_meshes) | non-flight only |
| `_publishOpeningFirstPicture` forced `updateMatrixWorld(true)` (22960) | O(nodes × matrix math) | once, opening boundary — acceptable |

## HUNT (a)/(b) — deferred identity release: verified safe, no finding

(a) Flush ordering — `_flushMeshReleasePending` runs after `drainDespawnDisposeQueue` in `serviceRenderMeshResidency` (2062-2065). Enumerated every registry reader between unbind and flush:
- **Live-keyed records are unaffected**: `releaseEntityMesh(entityId)` still runs *inline* at unbind (20302-20308) — clears `mountMesh/mountHull/bells/rcsNozzles` (shipMicroMotion:2264-2272), `veinRig` (asteroidMotionPresentation:674-677), `dishNodes/armNodes` (infrastructureMotion:544-547), `boundMesh` (forgeRegentCrown:275-283, lawArenaDressing:1100-1108). Every per-frame motion/dressing update is entity-id-keyed, so a record whose entity is gone is never walked; a record whose entity re-bound rescans on identity mismatch (`rec.mountMesh !== mesh` → `scanMountPivots`, shipMicroMotion:1727).
- The deferred identity pass only covers the **straggler class** — records keyed by a *recycled/dead* id still holding this mesh (20315-20317). No live driver addresses those records; their per-frame updates never run. A stale ref therefore can at most sit in an unreachable record for ≤1 service call, and a write would land on a detached/disposed node (invisible) — no observable delta vs the old immediate-null semantics.
- Dispose interplay (4b): `nodeInsideTree`/`nodeInsideAnyOf` walk parent chains that `disposeObject` leaves structurally intact, so `releaseMeshSet` matching still resolves on a disposed tree; refs drop at the same-frame flush.

(b) Nested batch interplay — verified. One shared `_meshReleasePending` Set + `_meshReleaseBatchDepth` counter: `_meshReleaseBatchEnd` decrements and flushes only at depth 0 (20250-20253), so an inner scope's `end` at depth ≥1 cannot flush a set its outer scope still appends to; a mid-batch per-frame flush (2065) drains accumulated rows early and is idempotent (flush nulls the field first, 20257-20259; `releaseMeshSet`'s `clearRecordMeshRefs`/`detachCrown`/`detachBoss` are no-op-safe on already-cleared refs), and later rows simply start a fresh set drained at batch end or the next frame. Double-run impossible — the field is nulled before the drain loop, single-threaded.

## W84 REGRESSION VERIFICATION

1. **Packaged-commit pacing** (visualFactory.js `.then` 4090-4288) — verified.
   (a) `packagedCommitOrphaned` (4109-4115) re-checks `root.parent` + epoch-scoped `releaseBoundaryResidency` + `'orphaned-before-swap'` stamp after every `yieldToBrowser` (4154→4155, 4192→4193, 4198→4199, 4204→4205) plus post-compile (4235-4239), post-`publicationWait` (4240-4248), and the epoch/abort/owner-inactive guard (4252-4258) — each exits via `disposeDetachedPackagedGroup`; a detached root can never mount or leak its residency claim.
   (b) Mount tail 4261-4276 (`hideProceduralChildren`→`root.add`→`carryAdmittedOnceStamp`→`canonicalizeObjectSurfaceProgramKeys`→`packagedShadowSync`→userData stamps) is yield-free — no presented frame sees the graft with minted-default `castShadow`.
   (c) `authoredAssetState` sequencing unchanged per exit path: `compiling-pipelines` (4209), `orphaned-before-swap` (4095/4113/4237/4246), `unavailable` (4095/4164/4227/4230/4285), `stale-verdict-superseded` (4093/4162/4257/4279), `fallback-after-error` (4233/4287), `authored` (4274).
   (d) `staleAuthoredRunVerdict` short-circuits before packaged work at 4092 (head, `!record`), 4161 (empty-children), 4214 (pipeline-fail catch), 4278 (`.catch` head); every yield-resume checks `packagedCommitOrphaned` first, so no guard was moved past a leg that needed it.

2. **`rebuildFromSteps` + stepped driver** — verified.
   (a) `rebuildFrom` inline drain returns `step.value === true` (581-586): `'invalidated'` maps to `false` for the sync caller — treated as failure → the journal already re-requested → retry; identical verdict surface.
   (b) `rebuildRequired` stays set through suspension; every foreign-write path marks `rebuildInvalidatedDuringSteps` while `rebuildInProgress`: `prepareRecord` 247-250 (covers `recordDestroy` 353 and the non-coalesced `recordCoalescible` append leg 423), `recordCoalescible` early-out 381-384, `publishSpawn` 316-318. External `requestRebuild` (236-244) does not mark the flag but also `clearRetained()`s — a mid-publish external request can wipe the ring the publish loop is still filling; commit would then land on a partial range and fail `hasRange` at consume (publisher 187) → `fallbackFromState` → `requestRebuild` → self-heals via the range gate, never a torn presented world. (In practice unreachable: publish never suspends, see note below.)
   (c) `'invalidated'` → runner drops `steppedJournalRebuild` (758-765), `needsRebuild` still set → next present re-collects — converges for any E ≤ 16384 since the publish leg completes within its first driven call (512 yields × 64 rows ≈ 32k rows ≥ capacity).
   (d) Cursor ordering: `alignJournalCursor(end)` at 769 precedes `pendingJournalStart/End` assignment (770-774); commit only reached when `step.done === true` (756).
   (e) `populateJournalFrame` marks the journal invalid for the whole suspension (786-800) — see HITCH-85-1 for the consequence of that contract.

3. **`captureOpeningAdmissionIdentitySteps` + deferred diagnostics** — verified.
   (a) Stepped census completes before submit: `openingFirstDraw` arm gate (23520-23525), iterator mint/advance (23532-23541), proceed-path inline drain of the remainder (23873-23895).
   (b) Deferred latch: `!this._openingFirstDrawDiagnosticsDeferred` in the arm gate (23522) plus `!openingSubmissionValidation` — every falsy path enumerated; a pending tail can't double-arm.
   (c) `_finishOpeningFirstDrawDiagnostics` writes `openingFirstVisibleGpuCounts` before the validation block inside the same callback (24031+); the in-place validation guard (23928-24012) keys on the deferred flag, so no path validates a receipt before counts land.
   (d) No double-fire: the arm requires `!state.render.openingFirstVisibleGpuCounts` — once written, a re-armed renderer can't mint a second arm; `finally` clears the deferred flag (24142). Latent notes (diagnostic-only): if the flag were ever left set across a context restore the validation could not re-run (counts path is bounded anyway), and a hidden-tab stall defers the diagnostic arm until the first real rAF — self-resolving via the `afterBrowserPaint` `scheduleLater` fallback (25980-25991).
   (e) Steps twin = reversed-children stack DFS = pre-order; census `Map` insertion order identical to `traverse` — contents key-order-safe.

4. **Deferred identity release** — verified; full enumeration in hunt (a)/(b) above.

5. **`updateMatrixWorldSteps`** (renderer.js:519-556) — verified.
   (a) Identical per-node semantics to vendored `Object3D#updateMatrixWorld` (three.core.js:12853): `matrixAutoUpdate`→`updateMatrix`, `needsUpdate||force`→compose+clear+propagate, document-order DFS via reversed-children push; yields per 2048 visited.
   (b) Overridden children (`child.updateMatrixWorld !== base` → atomic `child.updateMatrixWorld(childForce)` at push time, 555) cover the vendor override sites SkinnedMesh (three.core.js:23757, bind-matrix path) and Camera (45693, `matrixWorldInverse`); sibling world updates are order-independent so delegated-at-push preserves identical matrices.
   (c) Only call site passes `force: true` (11212) — no unforced `updateMatrixWorldSteps` exists; the `sfMatrixFrozen` skip class is absent from the vendored base and moot here. (`_renderPostRoute`'s per-frame walk stays unforced *by design* at 25491 — clean-subtree `matrixWorldNeedsUpdate` skip retained.)

6. **`driveCompileShadowDepthPipelines` retry** (renderer.js ~15309-15344) — verified: `lightSigEpoch: shadowCensusEpoch()` minted into `depthOpts` at head; each attempt drives `compileShadowDepthPipelinesSteps`; `result.stale === true` breaks to re-mint `lightSigOverride` + `lightSigEpoch` before the next attempt (≤4); non-stale returns immediately; exhaustion returns `{skipped:true, reason:'light-census-drifted-repeatedly', subjects:0}` — no throw.

7. **`_syncShadowMapEnabled` change-gated epoch** (renderer.js ~25130-25175) — verified: castShadow writes that don't change the value never bump the census-mutation epoch; a real flip either direction bumps exactly once.

## Notes for the orchestrator

- 'invalidated' is latent dead code today (publish leg can't suspend: 512×64 = 32k rows/call ≥ 16k capacity) and `aliveCount > size` would wedge `rebuild-capacity` → infinite per-frame fallback — theoretical at current E; a diagnostic counter suffices.
- Determinism: no journal/consume-path change proposed; sf-sim.mjs 47a golden `892f88c9` unaffected by either fix sketch (both are present-side only).
