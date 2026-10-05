# Wave 91 — boot-loading audit

Audited: `8109eee8e` on `devin/1791064509-perf-w60` (W90 landed: 5d5beb451 lod / 0914fe5ce boot / 19ef135db shared / 8109eee8e docs). Contracts honored: zero visible quality change, sim golden `892f88c9` bit-identical. Read-only audit; no code touched.

`saturated: false`

## Findings (ranked)

### F1 — `session.slice()` is the largest remaining atomic block on the arm path: bounded by caster cap, not wall time — effort M, magic-frame M, risk M

Evidence: `src/render/shadowDepthAdmission.js:837-944` (whole slice window is yield-free; comment at 549-554 explains why — a suspended generator must never leave live lights parked in staging or castShadow flags forced on the live scene); `src/render/renderer.js:25161-25177` (`SHADOW_DEPTH_ARM_MESH_CAP = 128` leg cap; the comment concedes "no internal yield, so a cap-sized leg still landed atomically inside one `armCallbackAfterPresent` task").

Mechanism: one `next()` of the paced drive = one atomic slice = capture homes + `revealSubjectForCompile` + castShadow force + reparent ≤128 caster roots + `staging.updateMatrixWorld(true)` + one real rasterized `renderer.render(staging, camera)` (shadow-map depth pass at `SHADOW_MAP_SIZE` + override scratch pass) + `markCastersDepthStaged` + full restore. The draw count is capped at 128 but the WALL time of that window is not subdividable; on software GL it is the single biggest synchronous chunk on the boot path, and it lands inside one task adjacent to presented loading frames.

Fix sketch: subdivide `slice()` internally — per sub-batch of ≤32 casters: `staging.add(subset)` → render → mark-drawn(subset) → remove subset → return/yield → next. Each sub-pass re-rasters only the currently staged subset, so total raster work is conserved while the atomic chunk shrinks ~4×. Legal under the contract: every window fully restores reparents/flags before suspending, and marks are per-drawn-object so partial batches mark correctly.

### F2 — held staging session survives a count-preserving key-light identity swap (latent, structural) — effort S, magic-frame H if ever triggered / L today, risk L

Evidence: `shadowDepthAdmission.js:601-603` (reuse iff `heldSession.sig === lightSigOverride && heldSession.epoch === shadowCensusEpoch()` — light identity never compared), `761/782/784` (`stagedKeyLight` minted once at session mint and `staging.add`ed), `910` (`slice()` calls `admissionKeyLight(renderer, light, THREE)` fire-and-forget — the returned clone is never reparented), `89-111` (`_admissionKeyLights` maps source→clone: a NEW source object mints a SECOND clone); `renderer.js:9846` (`this._keyLight` minted once at init), `8769` (nulled at teardown), `22937-23024` (sector palette changes animate the same objects in place — no re-mint path).

Mechanism: if `_keyLight` were ever swapped without a census term changing (one `DirectionalLight` replaced by another keeps `DirectionalLight:mask:castShadow` counts identical), the held session keeps the OLD clone attached to staging while per-slice re-seat mints and re-poses a clone of the NEW source that is never added to staging. Staged depth renders then run under the stale clone's frozen ortho: casters inside the live shadow volume but outside the stale one never depth-draw → never mark → withhold-forever → the first live depth draw links the program inside a presented frame. Reachability today: none — `_keyLight` is a stable singleton. The reuse predicate checking sig+epoch but not identity is a latent hole.

Fix sketch: store `light` on the held record and add `heldSession.light === light` to the reuse check at 602; or inside `slice()` assert `admissionKeyLight(...)` returns `=== stagedKeyLight` and close+remint on mismatch. One-line invariant, zero per-frame cost.

### F3 — render-camera `layers.mask` flip silently invalidates layerMiss marks (latent) — effort S, magic-frame M if triggered / L today, risk L

Evidence: `shadowDepthAdmission.js:516-520` (an undrawn caster is marked anyway iff `!caster.layers.test(camera.layers)` — the comment says "that attempted state is marked under its mask term and a layer flip re-keys it"), `454-466` (the signature carries `ly:<caster.layers.mask>` — the CASTER mask only).

Mechanism: the exception is correct for caster-mask flips (the `ly:` term re-keys), but the mark records nothing about the camera side. If the render camera's `layers.mask` ever mutates to newly include a layerMiss-marked caster, `staged.has()` still hits — yet that caster's depth program was never linked (the staged pass skipped it). Its first real depth draw links cold inside a presented frame. Reachability today: none — no runtime writes to the live render camera's layers (only scratch cameras: `startupGpuResidency.js:461`, and object-side masks like the depth-prepass at `partsLibrary.js:4840` are caster-side and covered).

Fix sketch: fold `camera.layers.mask` into `lightSig` (or into the mark signature) — one extra term, census stays O(1).

### F4 — `_stagedDepthSignatures` accumulates dead signature strings for the renderer's lifetime — effort S, magic-frame L, risk L

Evidence: `shadowDepthAdmission.js:269` (WeakMap→Set mint), `502-505` (get-or-create), `521` (`.add` per signature). Zero delete/clear call sites; `closeShadowDepthStagingSession` (542-547) closes the session but leaves the Set.

Mechanism: every census re-sign writes a fresh family of `uuid|kind|morph|cdm|ly|variant|lightSig` strings; prior families persist. Growth is unbounded in time (#distinct census sigs × staged casters × materials, ≈80-120 B/entry — realistic worst case tens of KB, memory only, never a frame cost). Not purely dead weight: the retention accidentally doubles as a cross-sig mark cache — a light-set flip-flop returning to a previously seen sig re-validates old marks and saves re-staging, which is correct behavior.

Fix sketch: do NOT blanket-clear on close (it would drop the cross-sig cache and restage legitimately-marked casters on sig regress). Either bound with a per-sig-family cap/LRU, or document the retention contract. Low priority — enumerate-and-bound is itself the deliverable for (c).

### F5 — session-level diagnostic sets (`drawnDepthObjects`/`drawnNames`/`drawnKeys`/`programCacheKeys`) capture strings on every drawn caster, read only at `close()` — effort S, magic-frame L, risk L

Evidence: `shadowDepthAdmission.js:804-809` (minted per session), `862-890` (capture per `renderBufferDirect` call: uuid adds, `drawn.name` strings, `${name}|key:…|side:…` composites), `946-962` (`close()` is the sole reader).

Mechanism: a steady small alloc stream inside every paced slice leg, accumulating for the session's whole lifetime, consumed only as close-time diagnostics. The per-slice sets (`sliceDrawn`, `slicePrograms`, `sliceNames`, `sliceKeys`) are load-bearing — `sliceDrawn` feeds the layerMiss mark check and `slice*` values are returned per slice — only the session-level four are pure diagnostics.

Fix sketch: gate the four session-level sets behind `options.collectDiagnostics` (default off); keep per-slice captures unchanged. Zero behavioral delta.

### F6 — corpse queue is unbounded: backlog grows without cap under sustained push; drain cost stays bounded but GL retention stretches — effort M, magic-frame L, risk M

Evidence: `renderer.js:1927-1932` (`DESPAWN_DISPOSE_BUDGET_MS=2`, `DRAIN_MAX=8`, `LEDGER_MAX_SKIPS=2`), `1934-2004` (drain: deadline + backlog-scaled count + one ≤128-node iterator overrun), pushers `16003` (kill-burst), `20021` (roster-prewarm releases whole composed warm trees at run:ended), `2062` (rebuild bridge), `21076` (reconcile evict under the loading veil), `21252` (dead-class evict), `22069` (appearanceChanged).

Mechanism: per-frame drain cost is bounded (~2 ms + one ≤128-node corpse step ≈ ≤3 ms worst) and `serviceRenderMeshResidency` runs every presented frame including `mode: 'loading'` (23616 — no loading bail before it). But push rate can exceed drain rate indefinitely (fat corpses each cost up to the budget while every pusher is O(1) to enqueue): the queue has no cap and no same-subtree coalescing, so under a sustained despawn storm the backlog — and the GL memory it retains — grows linearly through the veil window. Detached-owner teardown does NOT ride this queue (own stepped generator at 20683-20812) — the lane premise is partially stale there.

Fix sketch: backlog-aware budget escalator (raise `budgetMs` when `queue.length > K` during non-presented or veil-covered windows), or coalesce corpses that share a teardown owner. Retention stretch only — no hitch vector.

## Regression verification — all 9 W90 items verified at 8109eee8e

1. **Settle-time depth park** — VERIFIED. (a) Verdict runs inside the drive `.finally` at `renderer.js:25201-25252`, where `legSet` membership and `casterDepthMarkCurrent` are final — the `allUnmarked` write only ever happens post-drive. (b) Parked records carry `{lodLevel, entity, seq: dirtySeq, recheck, lightSig, census(=lightSig alias), oqX, oqZ, depthNodeScale}` and their casters sit in `_withheldDepthCasters` (25220-25240, restore loop bounded). (c) NUANCE — "census/ortho drift is the ONLY re-offer path" is imprecise: parked re-offers also fire on `dirtySeq > parkedEntry.seq` (24713) and on the backed-off `recheck` counter reaching its interval (24741-24754). Both deliberate; the comment overstates. No action needed beyond noting the wording.
2. **Drift-release traverse skip** — VERIFIED. `skipTraverseOnDrift = !scopedSync && parkedReleaseOnDrift === true && collectGate` (24871); `traverseDeferred`/`changed`/`_shadowRootSyncPassCount` all respect it (24872-24880); a packed/swap root (`parkedReleaseOnDrift` false) still pays the exempt traverse; a collect that never ran falls through to the traverse.
3. **Arm sig/epoch pairing + session close** — VERIFIED. `armSigEpoch = shadowCensusEpoch()` minted at 25079 beside `lightSig` (25074) and passed as `lightSigEpoch` (25196); `censusStale()` checked at 585-588, 635-637, 666-672 inside `compileShadowDepthPipelinesSteps`. `_killDepthStageSession` routes through `closeShadowDepthStagingSession` (25400 → 542-547: WeakMap delete + `session.close()`); no `this._depthStageSession` field remains. `detachBoundaryResolvingMarker` scans `boundary.children` only under `data.authoredResolvingMarker === true` (`visualOverrides.js:622-629`).
4. **Corpse-iterator identity** — VERIFIED. `iter._corpse` stamped at mint (1982); drain re-mints on head mismatch (1979-1983); both whole-tree resets null `owner._despawnDisposeIter` — destroy (17445-17451) and `clearAllMeshes` (20839-20845).
5. **retainedDisposeQueue paced drain** — VERIFIED. `releaseRetainedRoot` enqueues `{root, iter}` + `setTimeout(0)` driver (9058-9062); lazy `disposeDetachedObjectSteps` mint with try/catch per mint AND per `.next()`; 4 ms clock break (`monotonicNow()-started >= 4`), `skips < 2` wallet aging, `notePacedFrameSpend` tail, reschedule while non-empty (8960-8994). `disposePreparedAuthoredShip.attempt()` debits `notePacedFrameSpend` per segment and yields at `>=4ms` OR `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` (8801-8808).
6. **Commit dispose wallet gates** — VERIFIED. Gate `disposeLedgerSkips < 2 && pacedFrameSpend() >= PACED_FRAME_BUDGET_MS && options.yieldBetweenGpuStages === true && typeof options.yieldToNextPresent === 'function'` sits at loop top before the next slice mint — place (4300-4328) and ship (9463-9487); fallthrough preserves inline behavior; `commitLegStarted` restamps after each `waitForAuthoredAdmission`.
7. **Eligibility recheck in `updateFromEntities`** — VERIFIED. `_noMesh === true` skip (865) + projectile-skip (866) mirror the pushAlive halves; the `hiddenIds` hide block writes `visible=0`+VISIBILITY dirty only for slots alive AND `lastSeenSeq !== seq` AND `visible !== 0` (900-909 — feed-refreshed rows never hidden); the absent sweep walks dense `alive`/`entityIds` columns guarded by `byId.get(idCols[s]) === s` (918-924).
8. **Dirty-column fence pack** — VERIFIED. Copy path requires `previous.poseEpoch === poseEpoch` (`snapshotFence.js:303`); `previousIndex` is `entityId`-keyed (302-313); `copyRow` grows columns like `write()` and copies every `SNAPSHOT_COLUMN_SPECS` stride (`presentationSnapshot.js:148-156`); `dirtyMasks`-undefined worlds take the scalar path (310). Pack precedes the sync pass at both call sites (23215 before `syncEntityViews(1)` at 23239; 23574 before the main sync), so the mask provably holds the whole window's dirties at copy time.
9. **hiddenIds doomed-row feed** — VERIFIED. `rebuildSuppressedDestroyIds` published only under `steppedJournalRebuild && !publishIter` (`presentationRunner.js:888-890`); publisher passes `hiddenIds` only under `collectPrefix` + `retire:false` (`presentationPublisher.js:119-125`); `getSuppressedDestroyIds` returns the live Set, cleared in place at collect mint (762) and collect completion (803).

## Hunt answers

### (a) held-session lifetime — census-uncovered drift classes

The reuse contract is `sig === lightSigOverride && epoch === shadowCensusEpoch()`. `lightCensusSignature` (374-397) covers `type:layersMask:castShadow` counts of ancestor-visible lights + fog kind `fx|fs|f0`. Enumerated uncovered classes:

- **Key-light identity swap** — count-preserving; stale clone stays attached while the re-seated new clone is never added. Harmful — see F2. Latent today (`_keyLight` minted once at `renderer.js:9846`; sector palettes animate in place via `applySectorPaletteFrame`).
- **Count-preserving aux-light swap** — stale clone persists; program counts identical so marks stay correct → benign by construction.
- **Same-kind fog object swap** — `staging.fog` binds the live object by reference at mint (780); a new same-kind `FogExp2` object leaves the stage holding the stale object → uniforms stale, program keys identical → benign.
- **Light intensity/color/position drift** — key light re-seated per slice via `admissionKeyLight` (910); aux clones freeze at mint but only counts enter program keys → benign.
- **Render-camera `layers.mask` flip** — silently re-verses the layerMiss marking verdict without re-keying any signature — see F3. Latent today.
- **`renderer.shadowMap.type` flip** — re-keys every depth program globally while marks stay current; pinned to `PCFShadowMap` (25644) with no runtime write → latent.
- **In-place `visible`/`castShadow`/`layers` flips mid-frame without `noteShadowCensusLightMutation`** — the seq-keyed `_shadowCensusMemo` (24941-24952) can serve a stale sig within one presented seq, then self-corrects at next mint — bounded one-pass staleness. Current coverage is complete: every existing mutation site notes the epoch (weaponLights.js:108, flightOverheadPresentation.js:61, precompile.js:180/198, renderer.js:25580/25614/25669, heldLight disposes 26704/26726). The residual is only that a FUTURE mutation site forgetting the note gets seq-window staleness, never a stuck session.

Live-scene light inventory confirming no current swap path exists: ambient+key+rim+fill minted once (9150-9153); weapon pool 2 + vfx event pool + nozzle light are permanent visible-flash-by-intensity residents (constant-count contract documented at weaponLights.js:5-7 and vfx.js:14948-14951); all other `new THREE.*Light` sites are private scenes (probe/preview/UI/lab).

### (b) per-slice key-light re-seat cost — bounded O(1), no finding

`admissionKeyLight` (89-111) on a warm session: WeakMap hit → `syncAdmissionLightBaseline` (~6 field copies) + `syncAdmissionTransform` ×2 (light + target: local copies + matrix rebuilds over ~2-node subtrees) + `shadow.camera.copy` + `updateProjectionMatrix`. Total ≈ 15-20 scalar writes + 2 tiny matrix walks + one 4×4 copy — low-µs against a slice render that is ms-class even on GPU. A no-drift fast path (transform/param hash to skip the sync) would save noise-level cost while adding a second correctness surface. Verdict: already trivially bounded; the only real cost edge is the stale-identity case covered by F2.

### (c) drawnDepthObjects / never-pruned paths — enumerated

- `drawnDepthObjects`/`drawnNames`/`drawnKeys`/`programCacheKeys` — session-scoped, freed at `close()`; bounded by distinct drawn casters over the session (~hundreds → tens of KB worst). Diagnostics-only — see F5.
- **`_stagedDepthSignatures`** — the one genuinely never-pruned path: `.add` only, no delete/clear anywhere; persists across every census re-sign for the renderer's lifetime. Bounded by #distinct sigs × casters × materials; doubles as an accidental cross-sig cache — see F4.
- Drive-abort-mid-slice: the slice `finally` (934-943) restores `renderBufferDirect`, `shadowMap` flags, reparented roots, castShadow flags, visibility reveals, and object homes — no residual state on throw. Abort between slices leaves the session held for reuse by design.
- Close-without-evict: `_killDepthStageSession` → `closeShadowDepthStagingSession` → `staging.clear()` + `restoreVisibility()` — clean; `_depthStageSessions` is WeakMap-keyed on renderer so a dead renderer releases the entry with it. No path abandons a session without an eventual close or GC.
- `_deferredDepthStageRoots` — cleared in the drive `.finally` (25202-25209) on both success and failure.

### (d) corpse-drain share — bounded per frame, unbounded in backlog time

Correction to the lane premise: detached-owner teardown does NOT ride the corpse drain — `_releaseDetachedBoundaryOwnersSteps` (20683-20812) is its own stepped generator driving `disposeObjectSteps` directly (≤128-node yields + claim-scan yields per 512/1024 visits). The corpse queue carries: kill-burst despawn (16003), roster-prewarm releases (20021), rebuild bridges (2062/22069), reconcile evicts (21076), dead-class evicts (21252).

Worst-case per-frame drain time when all classes stack: `budgetMs=2` + one ≤128-node `disposeObjectSteps` overrun (≈ ≤0.5 ms) ≈ **≤3 ms per presented frame** — bounded regardless of backlog. The unbounded dimension is backlog time-to-reclaim (queue has no cap/coalescing; drain rate is fixed while push rate isn't) — retention stretch under sustained despawn, not a hitch vector — F6.

### (e) remaining atomic loading-path blocks, ranked by node count

1. `session.slice()` — ≤128 caster roots' reparent + `staging.updateMatrixWorld(true)` over the staged set + one rasterized render + mark + restore. Largest atomic block; yield-free by design (reparent/flag windows can't suspend). F1 proposes internal subdivision.
2. `markCastersDepthStaged` — O(≤128 casters × materials), inside the same slice window.
3. `.finally` withheld-caster restore in the arm (25219-25240) — walks per-entry withheld sets bounded by each root's collect (≤ `SHADOW_DEPTH_PASS_NODE_CAP`·scale ≤ 32768 nodes pre-park).
4. `collectGate` collect in the policy pass — resumable across passes via `_depthCollectPassSeq/Count/NodesLeft`; per-pass bound `SHADOW_DEPTH_PASS_NODE_CAP = 4096`.
5. Session mint inside a drive leg — handed-in `stagedLights` (no traverse), `staging.updateMatrixWorld` over ~≤10 light clones + one lights-only render — O(light count), small.
6. `captureObjectHome`/`revealSubjectForCompile` per root + `entries.sort` + requeue bookkeeping — O(small subtree)/O(pending), trivial.
7. `packPresentationWorldToFence` — synchronous O(entities × strides) column copy on the dirty path; bounded, single-shot per present.
8. `syncEntityViews` — dirty-entity bounded per pass.

No atomic block lacks a bound; F1 is the only one whose bound is a count rather than a wall-clock slice.
