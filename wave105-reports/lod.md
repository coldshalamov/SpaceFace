# W105 audit — lane: lod-in-frame

Target: `devin/1791064509-perf-w60` @ `3ed6f56a3` (wave 104 tip). Golden sim hash contract `0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1` — nothing below touches sim; all findings are presentation-side.

## saturated: false

One clean mechanism-level win (F1) plus three more bounded residuals remain. The flag-keep window and the recount bookkeeping are otherwise airtight — no stranded-flag or hidden-forever path found, all delta-note directions verified conservative-on except F3.

---

## Ranked findings

### F1 — `_drainHiddenUnfreezeQueue` mints restores on invisible roots (missing `mesh.visible` gate)

**Evidence:** `src/render/renderer.js:21583-21584` — the dead-entry gate checks `sfHiddenFreezeQueued === true || mesh.matrixAutoUpdate !== true || !mesh.parent` but never `mesh.visible`. The parked-restore abandon at `:21594` has the same hole. Compare the freeze drain's mirror gates, which *do* check visibility: `:21463` (`mesh.visible === true` drops a mint) and `:21483` (same for parked mints).

**Mechanism.** The cull-edge re-hide is already safe: `_queueHiddenSubtreeFreeze`'s flag-set early-out at `:21397-21410` stamp-kills `sfHiddenUnfreezeQueued/Seq` and `iter.return()`s a parked restore — a sub-dwell cull→show→cull flap costs zero walks, exactly as designed. The hole is the *other* hide class: hide-in-place. `applyEntityMeshVisibility(mesh, false)` at `:23868` (pose-fail) and `:24021` (submit-false — `authoredPending`, `geometryPending`, `pipelinesPending`, marker states) sets `mesh.visible = false` while the root stays in the visible slot set, never touching the freeze queue. So: culled+frozen root → re-enters the cull band → `:23824` sees `sfHiddenFrozen`, queues the restore (`:23832`), sets `matrixAutoUpdate = true` (`:23833`) → same pass or next, submit-false keeps it invisible → the entry sits past `HIDDEN_FREEZE_FLAP_DWELL` (`:21573`) → the mint fires at `:21585-21586` on a mesh that draws nothing. The flag is consumed, ~2 subtree walks are spent, and the now-unfrozen interior pays full compose for the rest of the pending window (authoredPending rows sit invisible for tens to hundreds of passes — the freeze's savings are surrendered at the exact moment they were supposed to accrue). When the row later re-culls, `sfHiddenFrozen` is false → the freeze re-mints in full. A show→pending-hide→cull cycle costs freeze + wasted restore + re-freeze (~5 subtree walks) where 0–1 sufficed. The drain runs at `:24190`, after this pass's submit decisions, so `mesh.visible` is a valid fresh-read gate.

**Fix sketch.** Add `|| mesh.visible !== true` to the dead-entry gate at `:21583` and to the parked-abandon set at `:21594`. On drop, `sfHiddenFrozen` stays true — the correct resting state for an invisible mesh — and the next real show re-queues via `:23824` (queued stamps were already deleted at `:21577-21578`, so re-push is free). Mid-restore abandon keeps the stamped prefix frozen (documented self-heal); a subsequent show re-mints the restore over it. No new epoch machinery needed — flag semantics already cover every transition.

**Effort:** S (two conditions + comment). **Impact:** M — bounded per row (~4 subtree visits wasted per flap), but the authoredPending population makes it frequent: every band-crossing deferred-admission root pays it. **Risk:** low — worst case a show→hide→show inside the drain window re-dwells ~3 passes, during which the vendored force-descend (`staticChildMatrices.js:342-343`) keeps poses correct — the supported path.

### F2 — First-measure `Box3.setFromObject` has unbounded per-pass multiplicity

**Evidence:** `src/render/visualCullRadius.js:144-155` — `DRAWN_CULL_REMEASURE_PER_PASS = 4` defers *served* re-measures, but a never-measured row (`known === 0`) falls through to `:154-155` and pays `_drawnCullBox.setFromObject(mesh)` regardless of budget — deliberate ("nothing honest to serve"). Same story in `motionTravelPadFor` (`:29-46`): first call per mesh pays `entry.nodes.length` × `setFromObject` before `__authoredMotionPad` caches.

**Mechanism.** First consults land on presented frames by construction: the bind-time consult (`renderer.js:21681`) runs while `authoredAssetState` is still pending, and `drawnCullRadiusForMesh` early-outs unless the state starts with `'authored'` (`:199-200`) — so the real first measure fires on the pass after the authored body commits, inside `refreshVisibleEntity` (`:23734`/`:23842`), admission grading (`authoredAdmissionPolicy.js:120-121`), or publish. A cluster of commits settling on one frame (sector publish burst, several deferred admissions resolving together) stacks N × O(subtree) walks in one pass — packaged hulls run ~1-3k nodes (per the frozen-subtree comments), so a dozen simultaneous first-measures is a ~20-40k-node atomic walk class landing inside the admission frames this campaign exists to smooth.

**Fix sketch.** Stamp the radius where the subtree is already being walked, off the presented pass: at the authored-commit tail / `publishPreparedAuthoredBoundary` path in `partsLibrary.js` (commit legs are already paced and already traverse the subtree for stamps — fold a `setFromObject` union or a `stampDrawnCullRadius(mesh)` call in there), so the first consult hits the memo. Do the same for `authoredMotionPadSpec` → `__authoredMotionPad` at the same site. Key care: the stamp must run after the final `authoredAssetState`/`compositionId`/`lodLevel` assignments or the memo key mismatches and the consult re-measures anyway. The lazy path stays as fallback for rows whose stamp never landed (procedural mount, rebuilts). Do **not** serve a shrunken radius instead — under-cull is the pop-out direction (station_helios draws 549×420 against a 90 WU dock radius).

**Effort:** M (commit-site plumbing + key bookkeeping). **Impact:** M-H — eliminates the largest remaining *unbounded-multiplicity* presented-frame subtree-walk class; burst frames are where it bites. **Risk:** low-moderate — a missed stamp silently falls back to lazy measure (status quo), a wrongly-keyed stamp wastes one walk.

### F3 — Recount resume re-index skips nodes inserted before the open cursor (non-conservative under-count)

**Evidence:** `src/render/shadowReceiverTally.js:113-118` — on `parentFrame.node.children[parentFrame.idx] !== f.node`, `indexOf` re-seats the cursor: `if (shifted < 0) deadAt = i; else parentFrame.idx = shifted;`. When `shifted > parentFrame.idx` (insertion *before* the cursor), `children[oldIdx..shifted-1]` are never pushed — skipped permanently. Real mid-array splices exist: `openingGpuAdmission.js:651` (`host.children.splice(at, 0, ...children)`), `:720-721` (reorder), `partsLibrary.js:5090` (`unshift` — always position 0, always before any cursor), `bloom.js:806-807` (remove+insert reorder).

**Mechanism.** Every other mutation class errs conservative-on: detached ghosts skip pop-time, re-adds fold via notes, FIFO evict at `:147-149` only loses stamps into the over-count direction, mid-descent removals keep the absorbed add (`:271-274`). This one errs the other way: an insert-before-cursor under a spliced host on the open ancestor chain yields an *under*-counted stamped total. Consumers gate on `count > 0 || dirty` (`renderer.js:24641-24644`), so the injury needs the skipped gap to hold *all* receivers — but when it does, the stamp settles at 0 with `dirty=false` and `shadowMapActive` drops the depth pass: all shadows vanish, and since silent splices emit no notes, the wrong count persists until the next unrelated mutation marks dirty — sticky whole-scene shadow loss, not a one-frame flicker. Window is narrow (a splice must land on an open-chain node during a ~ms suspend), but the outcome is a visible, persistent quality regression — exactly the class the machinery was built to exclude.

**Fix sketch.** On `shifted > parentFrame.idx`, push `children[oldIdx..shifted-1]` in reverse onto the stack ahead of continuing (with `openSet.add` bookkeeping) — gap nodes already visited get re-walked (bounded over-count, the legal direction) instead of skipped (under-count, illegal). Alternatively mark the parent frame for a suffix re-scan. Keep removals behavior unchanged (`shifted < 0` → deadAt).

**Effort:** M (stack splice + openSet bookkeeping + a test that splices mid-walk). **Impact:** M — narrow trigger, sticky and visible payoff. **Risk:** low-moderate — touching the resume chain; the conservative-direction invariant must be re-verified, but the fix itself only converts a skip into a bounded re-walk.

### F4 — Key-moved drawnCull stale serve misses the 1.15 bias

**Evidence:** `visualCullRadius.js:144-147` serves `known` (max-ever or cached radius) raw over-budget; the cadence-expiry branch at `:150-152` serves `cached.radius * DRAWN_CULL_STALE_SERVE_BIAS`.

**Mechanism.** Mostly consistent by design — max-ever is already the over-direction bound — but the residual is real: a brand-new key whose true envelope exceeds *every* previously measured key under-serves for up to one pass (the memo keeps the outgoing key and retries). A demoted hull over-draws; a promoted hull whose new composition outgrew all prior keys can under-cull → the root drops while a limb is still on the glass for one pass. Narrow window, but the fix is free.

**Fix sketch.** `return known * DRAWN_CULL_STALE_SERVE_BIAS` at `:146` — same bias direction as the cadence branch; over-serving a demoted envelope is the accepted tradeoff everywhere else in this file.

**Effort:** S. **Impact:** L (≤1-pass under-cull, only on never-measured-larger compositions). **Risk:** none — pure bias toward keep-drawing.

### F5 — Inline `unfreezeHiddenSubtreeMatrices` on non-disposeBound unbind

**Evidence:** `renderer.js:21815` — every non-corpse unbind of a flagged root pays the sync ~2-walk restore inline. Live-unbind fan-in: keepGpu recook path `:16757` (`_unbindPresentationMesh(id, kept)` — the same-sector `_clearEntities` rebuild loop can carry K frozen boundaries into one frame), publish swap `:10516`, rebind `:1968`, `rebuildShipMesh` `:23367`. Corpse paths all pass `disposeBound=true` (`:12910`, `:15719`, `:16778`, `:22171`, `:22398`, `:22571`) and `clearAllMeshes` is deliberate sync teardown (`:22142`) — those are correct.

**Mechanism.** A mass live unbind of frozen roots (worst case: keepGpu recook over a culled sector's kept boundaries) pays ~2 subtree walks per root inside the sweep frame — the same O(scene)-in-one-pass class the freeze/unfreeze queues exist to amortize. It can't simply ride the lazy queue: the restore must be definitive before pooled reuse, since `sfCullFrozen` stamps + copied `matrixAutoUpdate=false` would otherwise ride the mesh into its next owner (the flag cleared at `:21810` means no future path would heal it).

**Fix sketch.** Cheap version: bound *count* of inline restores per sweep and queue the remainder through the existing unfreeze drain with a settle-before-reuse contract (the drain already abandons `!mesh.parent` rows — needs a "still-bound, must-restore" tier). Safer version: keep semantics, but run the restore through `unfreezeHiddenSubtreeMatricesSteps` and interleave it in the unbind sweep's existing batch (`_meshReleaseBatchBegin/End` already brackets the loop at `:22167-22176`).

**Effort:** M. **Impact:** L — only mass live-unbind paths hit it, and those are already heavy exceptional frames. **Risk:** moderate if deferred past reuse — the simple bound + drain tier is the safe variant.

### Notes (not standalone findings)

- **`crucibleGhost` clones keep `sfCullFrozen` stamps** (`crucibleGhost.js:19-46` drops `sfHiddenFrozen`/`sfMatrixFrozen` but not `sfCullFrozen`): a clone of a cull-frozen source copies `matrixAutoUpdate=false` interiors with dead restore stamps. Benign for a static playback prop (frozen-at-rest matrices are the intended pose; sockets were never frozen); flag only because a future *animated* ghost consumer would silently inherit frozen parts.
- **Reparented-visited nodes re-walk**: a node visited pre-reparent then re-pushed under a new live parent counts twice — bounded over-count, legal direction.
- **Stale-cap settle** (`shadowReceiverTally.js:340-356`): a storm-capped walk stamps a measured-but-stale count — documented tradeoff; the count self-heals on the next quiet resolve (`RE recountCooldown`), and direction isn't pinned but the window is bounded.
- **`sfDespawnPartialTeardown` consume verified**: `:26209-26215` invalidates caster policy + notes census mutation on remount — the mint-fail advance at `:2132-2141` correctly skips the stamp (nothing torn yet); the step-fail path stamps at `:2161` and abandons-on-remount stamps at `:2110`.
- **Dispose lanes**: `drainDespawnDisposeQueue` + `drainWarmDisposeQueue` sequential at `:2296-2297`, shared `drainDisposeQueueLane` with backlog>32 doubling and `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS=2` aging — verified; warm lane reuses leftover budget, push gates honor `wasMounted` (`:19083-19102`, `:20917-20975`), flush covers destroy (`:18223`) and `clearAllMeshes` (`:22145-22146`).

---

## Hunt answers

**(a) `sfHiddenFrozen` flag-keep window — readers/writers, stranded flags.** Complete map: set `true` at mint `:21473`; cleared at unfreeze-mint `:21585` and unbind `:21810`; read at queue guards `:21397`, `:21531`, drain gates `:21463`/`:21582-21594`, show site `:23824`, ghost clone drop-list `crucibleGhost.js:29`. **No stranded-flag path exists**: every reachable state either stays frozen (hidden — desired), re-queues on the next visible-set pass (`:23824` fires per pass per flagged row), or clears the flag definitively (unbind :21809-21816 kills queued flags + parked iters on both lanes). Detached-but-bound rows can't leak — the unfreeze drain abandons on `!mesh.parent` and reattach rebinds go through the flag check again. The actual defect found is not a strand but **F1** — the restore mints on still-invisible roots because the drain lacks the freeze drain's `mesh.visible` gate.

**(b) Dwell asymmetry.** Freeze dwell = `viewSeq - max(lastShowSeq, freezeQueuedSeq) < 3` (`:21451-21456`); restore dwell = `viewSeq - unfreezeQueuedSeq < 3` (`:21573`). Ping-pong is bounded both ways: sub-dwell re-cull cancels the restore outright via the freeze-queue stamp-kill (`:21403-21409`) — zero walks; sub-dwell re-show just keeps the queued entry (flag survives, restore proceeds when dwell passes). No shared flap epoch is needed — the kept flag + stamp-kill already make the pair idempotent. The residual flap cost is entirely F1: the hide-in-place class never touches the freeze queue, so its shows/hides can't cancel the pending restore.

**(c) Recount resume chain + openSet.** Resume pass runs once per `REOUNT_NODES_PER_SLICE=512` yield and walks only the open ancestor chain — `O(depth)` detached/parent-link checks + an `O(degree)` `indexOf` + an `O(depth-to-scene)` ancestry probe *per broken link*. Realistic scene depth is ~10-15 (scene → sector shell → entity root → hull → LOD family → part → leaf); per-yield cost is negligible next to the 512-node slice it follows. **No openSet leak**: every push `:163` is matched by exactly one delete across the three pop sites (:83 dead-pop, `:126` post-resume dead-pop, `:166` normal pop); dead frames marked by the `deadAt` suffix sweep `:121-123` each pay O(1) pop+delete — no probe, no orphan. `notedWalkRootFinished` on a dead-marked-not-yet-popped frame returns "mid-descent" → kept-add → over-count, legal direction. Verified defect is **F3** (insert-before-cursor gap-skip — the one non-conservative direction in the file).

**(d) Remaining presented-frame whole-subtree walks, ranked by worst case.**
1. `_drawnCullBox.setFromObject` first-measure — O(subtree ≤~3k packaged) × *unbounded rows/pass* → **F2**.
2. `motionTravelPadFor` first-call — O(Σ per-entry-node subtree) per mesh, same landing site → folded into **F2**'s fix.
3. `unfreezeHiddenSubtreeMatrices` sync at non-disposeBound unbind `:21815` — ~2×O(subtree) per flagged live unbind; mass-keepGpu-recook → **F5**.
4. `countShadowReceivers(root)` inline on non-finite notes — O(subtree), capped `UNMEASURED_SHADOW_NOTE_EXACT_PER_PASS = 2` (`:2019`, `:27584-27640`) — verified bound.
5. `disposeObject`/`collectPresentationTextures` (`:9076`, `:28905`) — cold release/teardown paths; `scene.traverse` at `:27678` is the no-tally defensive fallback — not hot.
6. `updateMatrixWorldSteps(scene, force)` at `:11681`/`:24625` — deliberate stepped refresh points, sfMatrixFrozen elision active — by design.

---

## Regression verification — W104 machinery (on `3ed6f56a3`)

1. **Unmeasured-note pass budget** — `UNMEASURED_SHADOW_NOTE_EXACT_PER_PASS = 2` at `:2019`; `_noteShadowMeshAdded/Removed` + `_unmeasuredShadowNotePass` keyed on `_viewSyncSeq` at `:27584-27640`. Verified: non-finite measures past 2/pass → `markDirty` (paced recount); finite measures always exact. ✓
2. **`drawnCullRadiusMax` + stale-serve** — `visualCullRadius.js:82-176`: `REMEASURE_PER_PASS=4`, LRU=8, bias=1.15, max-ever recorded at `:132`/`:176`; over-budget serves at `:144-152`. Verified — with the F4 caveat (key-moved branch serves unbiased).
3. **Stepped freeze/unfreeze mints + kept-flag dwell** — queues/drains `:21394-21620`; constants `:889-908` (6 roots/pass, 256 scan, 1024 visit, 1024 yield nodes, 4096 node budget, dwell 3); Steps twins `staticChildMatrices.js:210-292` yield every 1024 nodes; flag survives until mint consumes (`:21585`). Verified ✓.
4. **Frame-stack recount** — `shadowReceiverTally.js:65-170` open-frame stack, `openSet` O(1) `notedWalkRootFinished` `:226`, resume pass `:97-129`, `RECOUNT_SUPERSEDE_CAP=4`, `RECOUNT_STORM_QUIET_RESOLVES=8`, `NOTED_WALK_VISITS_CAP=4096`. Verified ✓ — modulo F3.
5. **Warm dispose lane** — dual drain `:2296-2297`, shared lane impl `:2060-2185`, `sfDespawnPartialTeardown` stamps `:2110`/`:2161`, consume `:26209-26215`, pushes gated on `wasMounted`. Verified ✓.
6. **Ring-ascending field walk** — `asteroidField.js:247-282`: Chebyshev ring buckets, every live unpromoted record emitted once, yield per ring; `renderer.js:12725-12741` paced caller, `coveredKeys` chunked 256/batch. Verified ✓.
7. **Roster re-emit queue** — `_admitSurvivalRosterPrewarm` re-emit queue + drive chain + `_rosterPrewarmPending` single entry `:18429-18474`; release clears queue+stamp `:20915-20916`. Verified ✓.
8. **`sfDespawnPartialTeardown` stamp site** — covered in item 5 / notes above. Verified ✓.

## Bottom line

`saturated: false`. F1 is a near-free fix that closes a real wasted-walk + lost-savings class on the most common deferred-admission population; F2 removes the last unbounded-multiplicity atomic walk on presented frames; F3 is the only correctness-direction violation found (low-probability trigger, sticky visible payoff); F4/F5 are small bounded residuals.
