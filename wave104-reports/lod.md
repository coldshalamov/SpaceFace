# W104 audit — lane: lod-in-frame

Branch audited: `devin/1791064509-perf-w60` @ `00fb8e62d` (W103 tip, includes 4262aa519 + a4c068205).

saturated: false

## W103 regression verification — all items hold

1. **Dirty-window shadow notes** (`renderer.js:27328-27356`): (a) `!Number.isFinite(measuredReceivers) && tally.dirty` → `markDirty()` only at :27336-27337/:27350-27351 — no inline `countShadowReceivers`; (b) finite measures route to `noteAdded`/`noteRemoved` regardless of dirty state (else-branches); (c) quiet tally + unmeasured → `noteAdded(root, null)` → `countShadowReceivers(root)` inline at `shadowReceiverTally.js:154/167` — settle-path contract unchanged.
2. **Dispose-bound unbind** (`_unbindPresentationMesh` :21464): (a) `disposeBound !== true` gates `unfreezeHiddenSubtreeMatrices` at :21554 inside the `sfHiddenFrozen===true` branch — flag + `matrixAutoUpdate` still restored at :21549-21550; (b) all six `true` sites are corpse-bound — F9 leftover :12818, departing sweep :15624, entity:destroyed :16684 (despawn queue), mass teardown :21919 (`disposeObject` inline), residency/dead-class evicts :22146/:22319 (despawn queue); non-true sites are all live-reuse — id rekey :1960, shared boundary callbacks :10458/:10473, kept-F9 :16663, remount bridge :23115 (old hull keeps drawing); (c) `sfHiddenFreezeQueued`/`sfHiddenFreezeQueuedSeq`/`sfHiddenFreezeLastShowSeq`/`sfHiddenUnfreezeQueued`/`sfDespawnNoted` all deleted unconditionally at :21540-21546 on every path. Cosmetic residual: `disposeRendererMeshRoots` (:8657-8676) does not pass the flag — pays the ~2x unfreeze walk on still-frozen rows during whole-renderer teardown; legal (context is dying) and off the presented path.
3. **Universal lastShowSeq** (:23585): the stamp sits outside the `sfHiddenFrozen===true` branch (:23572-23582) — every visible row stamps, so never-frozen roots hit the flap dwell on their first hidden pass.
4. **Queue-age dwell + dead-entry exemptions** (`_drainHiddenFreezeQueue` :21270-21320, `_drainHiddenUnfreezeQueue` :21338-21368): (a) `dwellBase = Math.max(lastShow||0, sfHiddenFreezeQueuedSeq||0)` at :21300 — a fresh entry keeps `pending[w++]` until `viewSeq - dwellBase >= 3`; (b) flag-cleared entries `continue` at :21291/:21356 before `scanned += 1` — they consume only `visited`, never mint/scan budgets; (c) `HIDDEN_FREEZE_VISIT_PER_PASS = 1024` (:896) bounds `visited` in both drains; (d) unbind deletes `sfHiddenFreezeQueuedSeq` at :21541.
5. **sfDespawnPartialTeardown** (drain :2059-2063 + consume :25957-25960): (a) stamped only when `abandonedIter._corpse === m` — mint-fail/mismatch leaves no flag (:2073 re-mints on identity mismatch); (b) consume deletes the flag then `invalidateShadowCasterPolicy(root)` — dirtySeq early-outs cannot skip the torn prefix; (c) unflagged roots never enter the branch — memoized early-outs intact.
6. **notedWalkRootFinished + armed visits** (`shadowReceiverTally.js`): (a) both -delta writes are gated — :186 (`note.delta = -delta` after prior-note-already-visited) and :190-191 (`visits.get(root) !== undefined && notedWalkRootFinished(root)` for the bare removal); the ancestry probe at :136-141 walks `lastPopped.parent` — DFS pops subtrees contiguously so lastPopped inside root's subtree ⇒ unfinished; (b) `visits.set` arm-gated at :81 on `notes.size > 0 || detached.size > 0`; `seq` (:72) and `lastPopped` (:76) unconditional; (c) unvisited-note removal deletes the pair at :176-179 while `count -= delta` at :199 nets the served count to zero; (d) mid-descent removals keep the positive add-note → walked prefix stays in the stamp → conservative-on.
7. **drawnCullRadius stash + re-measure budget** (`visualCullRadius.js`): (a) outgoing-key stash at :108-113 lands BEFORE `lru.get(lruKey)` at :114 — A→B→A oscillation serves the flipped-away key's measurement; (b) `DRAWN_CULL_LRU_SIZE = 8` (:73); (c) `_passRemeasureCount >= DRAWN_CULL_REMEASURE_PER_PASS` (=4, :78/:133) bounds cadence-expiry re-measures; `resetDrawnCullPassBudget()` runs once per `syncEntityViews` at :23379; (d) over-budget row serves `cached.radius` and re-arms `calls -= 8` (:134-135) — stale, never guessed.
8. **Warm/catalog teardown contract** (`teardownWarm` :18951-18986, `_discardEarlyCrucibleWarm` :19496-19539, `_releaseSurvivalRosterPrewarm` :20785-20843): (a) `wasMounted`/`catalogMounted` captured before `parent.remove` (:18965, :19521, :20796, :20821); (b) contextLost → inline note + `sfDespawnNoted` at :19523-19526, :20801-20803, :20826-20828 — asymmetry: `teardownWarm`'s contextLost path (:18967-18969) notes inline but does NOT stamp `sfDespawnNoted`; harmless since that root never reaches the queue; (c) mounted roots → `disposePreparedAuthoredBoundary` else `_despawnDisposeQueue` — never bare `disposeObject` on a mounted root (:18975-18984, :19528-19537, :20804-20813); (d) catalog's missing explicit note is covered by the drain's measured walk at :2121. Consistent note: the release loop's push at :20837-20838 is unconditional (no `wasMounted` gate) — for a detached root the drain's measured walk still settles whatever remains noted-added, i.e. it heals a missing remove-note rather than double-counting.
9. **Corpse-row hoist** (leftover :12818-12851, departing :15624-15643): `_unbindPresentationMesh` + `scene.remove` + `_meshes.delete` + `_meshesVersion += 1` + `clearEntityMeshReference` all land before the first `await` inside each dispose loop — a suspended corpse can't be re-collected or kill a re-issued row; `noteShadowMeshRemoved(mesh, measure.receivers)` stays post-dispose (:12851/:15643).
10. **Opening scan pacing** (:12345-12362, :12488-12491): the four collects (shipLike/stations/wrecks/payloads) run inside the single drive at `(++openingScanSinceYield % 256) === 0` → `cookStale()` + `yieldLiveSectorGpu()`; post-sort seam at :12490-12491 lands before `seenRockKeys`; `_drainHiddenFreezeQueue()` runs in both sweep yield seams (:12848, :15640).

## Findings (ranked)

### L1 — Quiet-tally unmeasured-note storms still pay N inline receiver counts (LOD swap = 2 per hull)

**Evidence:** `_noteShadowMeshAdded`/`Removed` only defer when `tally.dirty` is already true (`renderer.js:27336/:27350`); on a quiet tally every unmeasured note pays `countShadowReceivers(root)` inline (`shadowReceiverTally.js:154/:167`). Storm sources inside presented frames: `partsLibrary.js:9186-9195` `swapTo` — one `removed` + one `added` unmeasured note per whole-ship LOD level swap (the demote/promote attach-detach itself); `partsLibrary.js:9146-9160` `refreshWholeShipLodFamily` — one unmeasured `removed` per retained level on every authored re-commit (K≈2-4 per boundary); `asteroidInstancePool.js:941-943/:969-971` bucket mount/dispose; `partsLibrary.js:13675/:14102/:14215` packaged-instance chunk seams.

**Mechanism:** a camera-driven fleet LOD flip or an authored re-commit storm lands 2×N inline O(subtree) traverses (packaged level roots ~1-3k nodes) inside the presented pass — the same churn-frame stacking the tally exists to prevent; the W103 deferral covers only windows that are already dirty, so the first storm's notes pay the walks that make the frame a brick.

**Contract proof:** every `_shadowReceiverCount` consumer is boolean — `> 0` at `renderer.js:24390/:24931`, and `Math.max(1,count)` only feeds `prepareActiveShadowCamera`, which itself tests `> 0` (`:8333`). `shadowMapActive` ORs `tally.dirty || _shadowReceiversDirty` at `:24389-24392` and `:24930-24933`, so a markDirty-deferred note is conservative-on by construction; the paced recount re-measures scene truth (no root-scoped attribution needed — detached/added roots resolve structurally through the existing `notedWalk` machinery or a fresh mint).

**Fix sketch:** count unmeasured notes per `_viewSyncSeq` window (or per resolve beat); on the K-th (K≈2-4) call `_markShadowReceiversDirty()` instead of `noteAdded/noteRemoved`. First K-1 notes keep exact counting so a lone swap doesn't pay a whole-scene recount; deferred window self-heals in ~1-2 resolve calls at 4 ms/slice. Measured notes keep their exact path under both regimes.

**Effort S-M · magic-frame impact H · risk low** — conservative-on preserved by the dirty-OR gates; this is exactly the churn-frame brick class the tally was built for, now inside the LOD machinery itself.

### L2 — `drawnCullRadiusForMesh` key-moved misses bypass the per-pass Box3 budget

**Evidence:** `visualCullRadius.js:131-138` — `_passRemeasureCount >= DRAWN_CULL_REMEASURE_PER_PASS` gates only `!keyMoved && cached` (cadence expiry); every key-moved miss pays `_drawnCullBox.setFromObject(mesh)` inline at :138. Reached per visible slot per pass at `renderer.js:23590` (plus :23482/:23646).

**Mechanism:** `Box3.setFromObject` walks the whole subtree unioning geometry bounds — ~1-3k nodes on a packaged hull. The 8-entry LRU absorbs A↔B oscillation, but a one-way fleet descent through a LOD threshold, or an authored-composition churn (compositionId/childCount/lodLevel all key terms), mints a fresh key per flipping mesh — N uncapped fat-subtree Box3 walks inside one `syncEntityViews` pass, landing exactly on the frames the LOD system is already busiest.

**Fix sketch:** on an over-budget key-moved miss, serve `data.drawnCullRadiusMax` (max radius ever measured for the mesh) and enqueue the real re-measure on the paced lane. Max-ever is the only legal serve direction — a demoted hull culls lazily, a promoted hull can never under-serve — and it self-corrects next re-measure. Keep the 4/pass cadence cap for expiry paths.

**Effort M · impact M-H · risk low** — over-serve is the sanctioned direction for cull envelopes; no stale-key accounting beyond one max scalar per mesh.

### L3 — Node-unbounded mint cost inside the bounded freeze/unfreeze drains

**Evidence:** caps at `renderer.js:21280-21281` and `:21347-21348` bound ENTRIES (6 mints / 256 scans / 1024 visits); each mint is ~2 subtree walks — freeze: `traverse` + `updateMatrix` + `markStaticMatrixSubtrees` + `remarkStaticMatrixAncestors` (`staticChildMatrices.js:155-169`); unfreeze: `traverse` restore + ancestor clear + `markStaticMatrixSubtrees` + `matrixWorldNeedsUpdate` (`:177-200`). Unfreeze drain fires once per pass at :23938.

**Mechanism:** a mass warp-in / zoom-in across the cull boundary queues hundreds of entries; six mints of packaged-hull subtrees ≈ up to ~12 fat-subtree walks (~2-36k node visits) inside one presented pass. The backlog-vs-saving curve itself is benign: while queued, still-marked interiors keep eliding the vendored compose (`three.module.js:139-140`, `!force && sfMatrixFrozen` skip) and pose writes land via `matrixWorldNeedsUpdate` + the `matrixAutoUpdate===false` compose hook — backlog delays restore work, not savings, so it self-amortizes. The residual is the drain's own unbounded per-pass node cost.

**Fix sketch:** Steps twins of `freezeHiddenSubtreeMatrices`/`unfreezeHiddenSubtreeMatrices` parked mid-subtree on the queue entry (pattern exists at `staticChildMatrices.js:77-112`), resuming next pass; or a per-pass node counter that halts the drain mid-mint only between roots (weaker bound). The Steps twin is the clean contract — same shape as the parked despawn iterators.

**Effort M · impact M · risk low** — deferral semantics identical to today's queue; only intra-mint suspension is new.

### L4 — Remounted mid-teardown corpses re-arm only the cast prefix; ~7 other torn-state classes have no flag

**Evidence:** flag mint `renderer.js:2059-2061`, consume `:25957-25960` (invalidate → cast flags only). The teardown grammar each visited node already paid (`disposeObjectNode` :28562-28608): `__disposePreparedAuthoredBoundary` unregistration (:28572-28573), `disposeWorldSitePresentation` (:28574), `releaseAuthoredAssetResidency` (:28576), `disposeWholeShipLodRetained` (:28581), `detachAuthoredMotion` (:28585), `releaseOwnerInstances` (:28590), instanced/batched `dispose` (:28591), geometry/material dispose (:28596-28607). `heldLight → noteShadowCensusLightMutation` at :28627/:28650 is never reached mid-park.

**Mechanism:** a boundary re-mounted while its parked `disposeObjectSteps` iterator held a torn prefix shows: (i) released instance-pool owner slots → missing instanced draws (asteroid interiors); (ii) disposed geometry/material → first presented draw re-uploads buffers AND re-links programs — the draw-time-miss brick class; (iii) released residency rows → the still-mounted subtree's GLB records become evictable → authored pop-out while on-glass; (iv) unregistered preparedAuthoredRoots → prepared-set divergence; (v) detached motion pivots → dead motion channels; (vi) torn retained LOD levels → demote-swap pop-in; (vii) no light-census epoch bump → `lightSig` memos serve stale sig for the remounted tree's lights. Ranked by per-event cost: (iii)/(ii)/(i) highest.

**Fix sketch:** widen `sfDespawnPartialTeardown` into a torn-state record: on the remount path re-run the idempotent bind-time acquisitions over the whole subtree (re-adopt instance slots, re-claim residency, re-attach motion, re-register prepared roots) — each hook dedupes on a per-corpse generation so only the torn prefix changes state; program re-link belongs to the compile/depth-stage lane, not the draw. Cheap fallback for (vii): stamp the flag whenever the abandoned iterator's `heldLight` is true and bump the census epoch unconditionally on remount-consume.

**Effort L · impact M · risk medium** — trigger is rare (a fat corpse parked >1 frame AND re-mounted inside the drain window) but lands on exactly the churn frames; per-hook idempotence must be audited before re-arm.

### L5 — `visits` Map worst case = O(scene) during a noted walk; seq-window pruning is provably safe

**Evidence:** `shadowReceiverTally.js:81-83` — while `notes.size>0 || detached.size>0`, every popped node writes a Map entry; cleared only at walk end (:126) or re-mint (:112). A noted storm mid-recount pins an entry per live-popped node — full-scene worst case (~tens of thousands of entries, a few MB + per-pop hashing on the storm frames).

**Pruning safety (verified against every consult):** (i) stamp compare `visitSeq === undefined || visitSeq <= note.seq` (:262-263) treats a pruned entry as "apply delta" → for adds it over-serves (conservative); (ii) `noteRemoved`'s -delta creation requires `visits.get(root) !== undefined` AT NOTE TIME (:190) — pruning afterward never corrupts a written note; (iii) the unvisited-note pair-delete (:176-179) fires identically on a pruned miss — the walk's own measurement already covers the root; (iv) `notedWalkRootFinished` is independent of `visits`. So pruning entries with `seq < min(pending note.seq)` — or bounded FIFO eviction — errs strictly conservative-on in both directions.

**Fix sketch:** at each slice yield, drop `visits` entries below the oldest pending note's seq (one pass over a Map that preserves insertion order) or a hard FIFO cap (~4k entries).

**Effort S · impact L · risk low** — memory/churn bound on storm frames, not a hitch fix; the safety argument above must be mirrored in the code comment.

### L6 — Residual presented-frame whole-subtree walks, ranked by worst-case node count

1. `Box3.setFromObject` key-moved misses — covered in L2 (uncapped count × fattest roots).
2. `countShadowReceivers` inline quiet-tally notes — covered in L1 (uncapped count × level/hull subtrees).
3. freeze/unfreeze mints — covered in L3 (count-capped, node-unbounded).
4. `motionTravelPadFor` first-query pad measure (`visualCullRadius.js:22-49`) — `Box3.setFromObject` per pad-entry node + 8 corner `hypot`s, paid inside the visible loop on the first post-mount pass; stacks on a warp-in of authored-motion subjects. Memoized per mesh (`__authoredMotionPad`); a deferred-pad lane with a presence-only serve until measured would unstack it (pad is additive — serving 0-pad transiently errs toward culling — NOT legal; serve `drawnCullRadius`/presence until pad lands, direction-safe only as an over-serve of presence, needs care). Effort M · impact L-M.
5. Vendored `updateMatrixWorld` — re-shown interior-frozen subtrees force-walk under `matrixWorldNeedsUpdate` until the unfreeze mint clears the marks; bounded by the L3 backlog, saving deferred not lost. No separate action.
6. `socketCache` first-query `m.traverse` per socket name (`renderer.js:27612`) — memoized per name, mount-scoped. Negligible.
7. `keyLight.updateMatrixWorld(true)` + target (`renderer.js:8334-8335`) — ancestor-depth only. Trivial.

## Lane sweep note

The stand-in visibility contract itself is intact: `syncResolvingMarker` (:4185-4234) hides the marker the moment any sibling draws (:4233), `authoredPendingBoundarySubmitsStandIn` (:4250-4259) submits a stand-in only while the authored payload is pending AND only on already-linked programs, and the W16-W20 same-envelope/lod0-first machinery is unchanged. No remaining "stand-in stays visible past commit" mechanism found — the residuals above are all frame-pacing classes around the LOD/hidden-freeze machinery, not stand-in-visibility defects.
