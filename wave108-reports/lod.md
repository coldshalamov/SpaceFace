# W108 audit — lod-in-frame

Audited `devin/1791064509-perf-w60` @ `46e3ccf39` (W107 log atop `30b0fedcd`), read-only.
Scope: resolving-marker / same-identity stand-in / authored-pending fallback / whole-ship LOD /
hlod machinery, and every lane W107 touched that can mint, demote, or stale-serve inside the
presented frame.

## saturated: false

Two legal contract-preserving improvements remain with concrete implementation paths (F1, F2).
Neither requires a quality trade nor touches sim determinism. F3–F5 are smaller but real.

## Ranked findings

### F1 — FIFO-dropped rows keep `drawnCullForceQueued === true` → permanent stale-serve, and the drop comment is wrong
- **Evidence**: `src/render/visualCullRadius.js:108-113` — `resetDrawnCullPassBudget` drops a row
  whose mesh is dead/unparented/`!isObject3D`/stamp-already-cleared via `continue` **without
  clearing `data.drawnCullForceQueued`**. The drop-path comment claims "re-queue on their next
  consult" — but both queue arms (`:227-232` key-moved over-cap, `:246-250` cadence over-cap)
  gate the push on `data.drawnCullForceQueued !== true`, so a row dropped with the stamp set
  can never re-enter the FIFO.
- **Mechanism**: a mesh unparented between enqueue and drain (mid-pass teardown, re-graft)
  keeps stamp=true on its surviving `userData`. On re-mount and a later key-moved stale consult
  in a sustained over-cap stretch, the stale-serve arm `return known * DRAWN_CULL_STALE_SERVE_BIAS`
  runs every frame with no re-measure ever scheduled. The streak cap (`defers <= 2 + (id&3)`)
  exists precisely because a fresh key whose true envelope exceeds every remembered one
  under-culls — the illegal pop-out direction — and the FIFO is the bound on that streak. With
  the queue unreachable, an under-serving row under-culls **forever** (until an under-cap consult
  or a re-admit `primeDrawnCullStamps` clears the stamp). Over-serve rows are harmless; the
  residual is the under-cull window.
- **Fix sketch**: clear the stamp on drop — set `data.drawnCullForceQueued = false` before the
  `continue` at :108-113 (the `!== true` arm already implies false; only the dead/unparented arms
  need it). One line. No ordering/pacing change.
- **Effort**: S · **magic-frame impact**: M (narrow trigger: unparent+re-mount+over-cap storm+grown
  envelope; consequence is the exact defect the machinery exists to bound) · **risk**: low.

### F2 — `_*FaultEpoch` lanes key on `world.enterSerial`, which does not advance on context restore or recook
- **Evidence**: fault stamps mint `st.world.enterSerial ?? null` — `_protectedFirstFlightFaultEpoch`
  (`renderer.js:2247+`), `_residentReattachFaultEpoch` (`:2445`), `_reconcileFaultEpoch` (`:2472+`,
  `:2835+`, with re-dirty), `_residencyPollFaultEpoch` (`:2901`). `enterSerial` mints only at
  `src/systems/world.js:974` (sector-changing exit), `:1065` (same-sector enter),
  `src/save/saveSystem.js:4668` (restore start), `src/main.js:1448` (fresh world). The context
  restore path (`renderer.js:9664-9880`) **captures** `restoreEnterSerial` but never mints; the
  same-sector recook (`renderer.js:12368` `_sessionLiveSectorCookedId` lane) re-runs
  `prepareLiveSectorBeforeFlight` with no `sector:enter` emit — verified via
  `pipelineReadiness.js:1346` calling it directly.
- **Mechanism**: one transient throw parks a lane for the remainder of the entire enterSerial —
  potentially the rest of a flight session with no jump. Worse, a fault adjacent to a WebGL
  context loss stays parked through the post-restore residency rebuild — the window where the
  parked lane is the *only* repair path (reattach sweep re-seating kept meshes, reconcile
  disposing dead-entity ghosts, poll evictions). Coverage degrades to pre-reconcile behaviour:
  ghosts linger, evictions stop, reattach orphans until a jump/restore/new-game re-arms. A world
  whose `enterSerial` was never minted (`null`) parks permanently — `null !== null` blocks
  re-mint forever (fixture/headless class only, but it's the same trap).
- **Fix sketch**: fold a restore counter into the epoch key — mint `state.contextRestoreSeq` in
  the `deferWebGlContextRestore` continuation and key lanes on `enterSerial|restoreSeq` — or bound
  the park: allow one re-mint per lane per pollDue/N-service-beat cadence inside the same serial
  (preserves the anti-thrash intent; a deterministic poison still can't spin). `_reconcileEpoch`,
  `_residencyPollEpoch`, `_holdExempt*Epoch` all alias the same `liveEpoch` domain in separate
  fields — no cross-lane aliasing defect, verified.
- **Effort**: M · **magic-frame impact**: M (coverage loss through exactly the window that needs
  the repair) · **risk**: M — the park exists to stop rethrow cadence; any retry must stay bounded.

### F3 — clearance memo is Y-blind (pre-existing, now indefinite)
- **Evidence**: `renderer.js:4010-4015` keys the memo on `Math.round(position.x/z)` only — no
  `posY`. The W107-verified translate arm (`:4017-4032`) shifts `box.minX/maxX/minZ/maxZ` by
  dx/dz on cross-cell re-key — `minY/maxY` never move, and the hit path returns the minted box
  verbatim.
- **Mechanism**: a clearance-kind mesh drifting vertically (capital climb, pitched hull in a
  bank) serves its mint-time roof indefinitely — over-duck after it climbs away, under-duck
  (camera through hull) after it climbs into the sightline. Pre-W107 the drift re-measure at
  least refreshed Y on every XZ cell crossing; the translate arm made the Y staleness survive
  those re-keys too. Same class as the documented rotation-staleness contract, but rotation
  decays through view-band churn; a boxed Y never re-mints.
- **Fix sketch**: add `posY = Math.round(mesh.position.y)` to the memo key and a `dy` arm
  (`box.minY += dy; box.maxY += dy`) beside the XZ translate. Cheap, no pacing change.
- **Effort**: S · **impact**: L-M · **risk**: low.

### F4 — `_drainMeshBuildQueue` head-delta return inflates diagnostic 'built' counters
- **Evidence**: `renderer.js:23812-23818` — on a Steps-skeleton throw the guarded driver returns
  `Math.max(0, headAfter - headBefore)`, counting dequeued-but-unbuilt (skipped/refused) rows.
  Consumers are all diagnostic: `built` in `drainMeshBuildsBehindShell` → `recordOpeningCookStep`
  `live.meshBuildsN` (`:12560,12576`), `jumpBuilt` → `jump.meshBuilds` (`:16364`), `stats.built`
  on `_meshResidencySweep` → `_publishAssetResidencyDiagnostics` (`:23674`), and the
  `_drainPendingMeshBuilds` `built > 0` publish gate (`:23681`). Verified no budget decision
  consumes it — the hold-exempt overflow (`:2577+`) measures `head - headBefore` directly, and
  `driveProtectedFirstFlightDrain`'s return is ignored at both call sites (`:2568`, `:2702`).
- **Mechanism**: probes/soak ledgers reading `built` see skips as builds — a fault can report
  work that didn't happen, masking a real stall in the ledger. Not a budget distortion.
- **Fix sketch**: return `{ built, dequeued }` (or log the head delta in the existing warn and
  return the twin's real `built` count).
- **Effort**: S · **impact**: L · **risk**: low.

### F5 — `settleRebuildBridges` drops a twice-faulted row without releasing it
- **Evidence**: `renderer.js:2350-2359` — `slot.faults >= 2` path does `bridges.delete(id)` and
  stops; `releaseRebuildBridge` never runs for it. The retry comment says "the row drops like a
  released one" — but a released row runs `releaseRebuildBridge` (releasing the cover state);
  this drop doesn't.
- **Mechanism**: a row that throws on both visits keeps whatever the bridge covered — the parked
  replacement stays the presented mesh past its window (stale stand-in-side drawing for the
  session's life) and any bridge bookkeeping leaks. Poisoned-slot rarity keeps it low, but it is
  an uncovered drop.
- **Fix sketch**: `try { releaseRebuildBridge(owner, id, slot); } catch (_) {}` before the drop.
- **Effort**: S · **impact**: L · **risk**: low.

## W107 regression verification — all 7 items pass

1. **`drainMeshBuildsBehindShell` `drainFallbackAlive` latch** (`renderer.js:12541-12578`):
   (a) the bare else-arm latches off only when `runCookSyncTwin` returns the -1 sentinel — a
   `drainRow >= 0` keeps `drainFallbackAlive` true and the arm keeps serving; (b) a later numeric
   result still runs — the latch is not permanent per owner; (c) Steps-less fixture owners take the
   same arm and a skeleton-level `TypeError` (no twin anywhere) surfaces once via `runCookSyncTwin`,
   warns once, latches off — bounded delay instead of per-frame rethrow. The `done`-arm re-mint at
   `:12566` reads `this._drainMeshBuildQueueSteps` unguarded but is unreachable without the method
   (a `done` step implies a live iterator minted under the guarded path). ✓
2. **`_drawnCullForceRemeasure` FIFO** (`visualCullRadius.js:104-138`): drains ≤
   `DRAWN_CULL_REMEASURE_PER_PASS` per pass, drops dead/detached/stamp-cleared rows free, re-walks
   `setFromObject` + restamps under CURRENT keys; inline walk (`:272`), LRU hit (`:184`) and
   `primeDrawnCullStamps` (`:313`) all clear `drawnCullForceQueued` — no double-remeasure within
   the live queue. Residual F1 covers the stuck-stamp drop arm. ✓
3. **Dispose-lane headroom floor** (`renderer.js:~2111`): `headroom = max(budgetMs,
   PACED_FRAME_BUDGET_MS - pacedFrameSpend())`, `budgetMs = max(budgetMs*2,
   min(DESPAWN_DISPOSE_BUDGET_MS, headroom))` — backlog>32 inherits the live lane's leftover via
   `drainWarmDisposeQueue(max(0, DESPAWN_DISPOSE_BUDGET_MS - liveSpend))` at `:2363`. ✓
4. **Clearance translate + admission slice + travel-pad gate**: (a) XZ translate +
   `clearanceLayoutFromBox` rebuild + `_clearanceBoxEpoch` bump verified (`:4017-4032`); Y gap →
   F3. (b) `prepareBatch` slices 8-root chunks with `await yieldToMain()` between
   (`liveGeometryAdmission.js`). (c) `primeMotionTravelPad` gates on `drawnCullRadius != null`
   (`visualCullRadius.js:59-63`) and `attachAuthoredMotionDriver` deletes `__authoredMotionPad`
   before priming (`authoredMotion.js:150-153`) — re-grafts can't stale-serve the pad. ✓
5. **Foundry drain + env-source stamp order**: `_foundryEnvPending` arms for any non-loading mode
   (`:23038-23058`), drains at `main.js:1195` (enterLoadingMode head) + both cook seams +
   `preparePostOpeningPipelines` head (`:12501`, `:15847`, `:17038`), flag-gated idempotent.
   `_envMapSource` stamps after `queueSceneEnvMapRebind`/`deferredEnvDispose` commits
   (`:23151`); bake and foundry rejections warn. ✓
6. **13 tight-try re-shapes**: `iter.next()` is the sole expression under each try; awaits sit
   outside; `cookSuperseded` sentinel propagation verified — `driveEnvBindSteps` returns
   `'drive-settled'|cookSuperseded` and callers propagate on `=== cookSuperseded`. ✓
7. **`syncEntityViewsSteps` + presented-drain parks**: (a) `syncEntityViews` (`:24507-24511`) is a
   sync driver over the Steps twin; the generator's only yields are `(index & 127) === 127` in the
   hidden loop (`:24598`) and visible loop (`:24703`) — counted rows only, byte-identical output.
   (b) `drainSceneEnvRebindQueue` drops a torn head exactly like a done head incl.
   `disposeTarget.dispose()` (`:29679+`). (c) all four `_*FaultEpoch` parks suppress re-mint within
   the enterSerial and re-arm on the next; reconcile re-dirties `_meshReconcileDirty`; residual F2
   covers the epoch-granularity gap. (d) `_flushMeshReleasePending` re-pends the whole set on any
   registry throw (`:22501-22521`). (e) all seven combined-census degrades (seal `:13767`, pool-roots
   `:13787`, seal-else `:13794`, cook `:14840`, pool `:15520`, late-admission Steps-less `:16598` +
   torn-drive `:16608`) run `collectInstancePoolCompileRootsAndSubjects` and share `deriveCensus`;
   the fault path returns real subjects — `subjects:null` survives only on a double-fault fallback
   (`{roots:[],subjects:null}`), matching the old null-subjects contract. ✓

## Residuals (a)-(d) — enumerated

**(a) fault-epoch lane coupling** → finding F2 above. Re-arm happens on sector exit/enter mints,
restore (`saveSystem.js:4668`), and fresh-world install (`main.js:1448`) — but not context
restore or recook; `enterSerial == null` parks permanently. Aliasing check clean: every lane
holds its own `_*FaultEpoch` field; `_*Epoch` pass stamps share the same domain by design.

**(b) `deriveCensus` shared-tail ordering** → verified equivalent. `uncompiled` =
`census.subjects` minus `opening` — identical predicate (`isMesh|Skinned|Instanced|Points|Line|
Sprite`, `latePipelineAdmission.js:5-13` vs the fused walk's) and identical scene-DFS order as the
old `collectUncompiledSceneDrawables`. `lateEntities` re-walks `this._meshes.values()` → same
insertion order as `collectLateAdmittedCompileRoots`. `subjectsForCompileRoots` buckets subjects
to enclosing compile roots preserving DFS order per bucket — same as the old per-root
`collectCompileSubjects` flatMap. One semantic delta: `enclosingMeshRoot` marks the **innermost**
`_meshes` root — the old per-root traverse could mark an outer root late via a nested root's
uncompiled subject; new code admits only the innermost. That is an over-cover→exactness change
(the outer compile covered the nested subtree redundantly); compile order per root unchanged —
no observable ordering regression on admit priority or test pins found.

**(c) `_drainMeshBuildQueue` head-delta** → finding F4. Every consumer enumerated: telemetry +
diagnostics publish only; no budget decisions consume the return.

**(d) remaining presented-frame whole-subtree walks, ranked by worst-case node count**:
1. `scene.updateMatrixWorld()` — `renderer.js:28920`, full scene (~21k nodes) per presented frame.
   Documented deliberate atomic (replaces per-pass walks; `matrixWorldNeedsUpdate` skips +
   `sfMatrixFrozen` subtrees bound the real work). Largest residual, adjudicated shape.
2. `resetDrawnCullPassBudget` FIFO — ≤4 `setFromObject` per `syncEntityViews` pass; worst case
   4 × largest authored subtree. Bounded.
3. `cameraClearanceBoxForMesh` `setFromObject` on memo mint/key-change — `renderer.js:4084` —
   biggest `CAMERA_CLEARANCE_KINDS` subtree per miss; translate covers XZ drift (F3 for Y).
4. `motionTravelPadFor` first-mint — `visualCullRadius.js:22-50` — `setFromObject` per spec node;
   cached thereafter; pre-fit roots stay lazy by design.
5. `_drainHiddenFreezeQueue` freeze mint — O(subtree) per root, few per pass (documented
   `:24680+`).
6. `countShadowReceivers(root, null, 128)` — cap-bounded per shadow note
   (`shadowReceiverTally.js`).
7. Fixture-only whole-scene `scene.traverse` receiver recount — `renderer.js:28581` — runs only
   when `_shadowReceiverTally` is absent (the real renderer always mints one).
8. `describeOpeningInstancedPbrLeaves` `traverseVisible` — `:816` — failure-path diagnostics only.
9. `collectPresentationTextures` `mesh.traverse` — `:9209` — per-mesh, re-attach path.
10. `getPooledNavLightSources` `root.traverse` — `:7305` — memoized on `userData`.

## Stand-in-visible sweep (lane core)

- Runtime whole-ship demotion is dead code while `WHOLE_SHIP_LOD_RUNTIME_DEMOTION === false`
  (`wholeShipLodPolicy.js:23`): 'load'→'keep' kills every file load, and 'swap' requires
  `roots[requested]` resident — which only populates through a load. No live path demotes a ship
  inside the frame; `selectSpawnLodLevel` has no live callers (`selectPrewarmLodLevel` pins lod0).
- `syncResolvingMarker` is fail-closed the right way: pending → marker on; non-pending → marker
  draws until a visible sibling exists (`renderer.js:4368-4440`). Commit mounts authored children
  before marking visible (pipelinesPending/geometryPending gates + off-glass staging), so no
  marker-off/body-not-ready hole.
- `admissionStandInPending` retry is throttle-bounded (`STAND_IN_RETRY_MS`) and releases on
  terminal states (`visualOverrides.js:644-712`); detached substrates release via
  `admissionStandInRelease` on dispose.
- Sim golden hash untouched — wave is render-layer only.
