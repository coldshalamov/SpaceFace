# W108 audit — in-flight-hitches

Audited: `devin/1791064509-perf-w60` @ `4373603f5` (includes W107 `2ee99c295`+`3a4626bc8`+`30b0fedcd`
and W108 lod `c676e7f44` + popin `4373603f5`). Audit-only; no code touched, no app run.

saturated: false

## Ranked findings

### F1 — `_shadowCensusForFrame`: unguarded stepped drive + unguarded sync fallback — worst reachable rethrow cadence (per-frame brick + inline O(scene) traverse on recovery)

**Evidence:** `src/render/renderer.js:27822` — `step = memo.pendingIter.next()` inside
`while (memo.sig == null || now < deadline)` with no try/catch; `:27837-27841` —
`memo.sig = lightCensusSignature(scene)` sync fallback also unguarded. Presented-path call sites:
`:27221`, `:27263`, `:27376`, `:27579` (inside `_syncShadowCasterPolicyChecked`, itself invoked per
dirty root inside the syncEntityViews frame pass at `:24864`), `:27977`, `:28061`, `:28142`, `:28194`
(inside `_armDepthStage`), `:28396` (`_stageShadowDepthOnSettingEnable`).

**Mechanism:** W96/W98 minted the epoch memo + `lightCensusSignatureSteps` paced drive but never
fault-hardened it. A throw mid signature-walk escapes the loop → propagates through the call site →
syncEntityViews → `prepareFrame` → `renderUpdatePhase.js:86-96` worldError → `drawPreparedFrame`
skipped — the frame never presents. The dead `memo.pendingIter` is left non-null, so the NEXT call
drives the thrown generator → `{done:true, value:undefined}` → `pendingIter=null`,
`memo.sig=undefined` → `memo.sig == null` → falls into `lightCensusSignature(scene)` — the full
O(scene) traverse the Steps twin exists to amortize — inline inside a presented call. Under a
persistent fault (sync twin throws too, e.g. a corrupt node), EVERY call rethrows AND re-pays the
whole-scene walk → per-frame brick for the fault window. Under a transient fault the cost is
1 aborted frame + 1 inline whole-scene traverse. Note faults never increment `memo.superseded`
(that counter only covers mint-abandon at `:27800`), so the storm-pin can't engage on a fault loop —
and `memo.sig` fast-path (`:27777`) only resumes once a signature actually stamps.

**Fix sketch:** wrap the `pendingIter` drive: catch → `pendingIter.return?.()` + `pendingIter=null`
+ `memo.superseded` increment (count fault-abandon toward the existing storm cap) + serve `memo.sig`
(stale — the conservative direction the memo already documents). Guard `:27839` the same way — catch
→ serve `memo.sig`; only a never-stamped first call (boot-path, `memo.sig == null` and no pending
iter minted) may rethrow. Matches the wave's per-step catch→degrade convention exactly.

**Effort:** S. **Magic-frame impact:** H. **Risk:** low — served value is the same conservative
stale-sig the memo returns mid-mint today.

### F2 — `_presentationRebindIter` drain rethrows through `prepareFrame` head — per-frame under publication churn

**Evidence:** `src/render/renderer.js:25923-25931` — `try { step = iter.next(); } catch (err) {
this._presentationRebindIter = null; throw err; }`. Mint gates at `:25884-25915`
(`publication.remapped || rebuilt && appliedDelta !== 0` → whole-rebind re-mint EVERY frame while
the flag holds; `spawnedCount > 0` → chained spawned bind each frame with spawn activity).

**Mechanism:** the catch nulls the iterator then rethrows — straight out of `prepareFrame` before
`serviceRenderMeshResidency` (`:26045`), `syncEntityViews`, `cam.follow`, pool syncs and the asteroid
submission. One systematically-faulting row (a mesh whose userData/walk always throws mid-sweep)
re-mints and rethrows every frame while publications keep arriving — the presentation freezes at the
head of the frame indefinitely. The W107 `serviceFaultEpoch` machinery exists for exactly this lane
class but the rebind drive doesn't use it.

**Fix sketch:** same convention as the residency lanes — catch → `closeIter` + warn +
`this._rebindFaultEpoch = serviceFaultEpoch(state)` + swallow; gate the mints at `:25896-25915` on
`this._rebindFaultEpoch !== serviceFaultEpoch(state)`; re-arms on next enter/context-restore.
Unbound rows degrade to the per-row lazy bind checks the code already tolerates (`:25907` notes
re-binding is idempotent and tail order non-load-bearing).

**Effort:** S-M. **Magic-frame impact:** H. **Risk:** low — degrade direction is "binds arrive
lazily", never wrong binds.

### F3 — hold-exempt collect family: four catch→abandon→`throw err` sites rethrow through `serviceRenderMeshResidency`, per 100 ms beat during holds

**Evidence:** `src/render/renderer.js:3337` (`warmIter.next()`), `:3368` (`iterator.next()`),
`:3440` (`_holdExemptEnqueueIter.next()`), `:3459` (`_holdExemptKickIter.next()`) — each catch does
`abandonHoldExemptCollect(owner)` + `throw err`. Drive sites `:2559` (stream-hold arm) and `:2709`
(first-flight-hold arm); re-mint cycle at `:3305-3327` re-runs every `HOLD_EXEMPT_COLLECT_SECONDS`
(0.1 s, `:859`) once the previous cycle completes/abandons.

**Mechanism:** exactly the site the brief flagged. `serviceRenderMeshResidency` is called only from
`prepareFrame` (`:26045`) — every rethrow aborts the whole presented frame including
`driveProtectedFirstFlightDrain` and the hold tail. Abandon clears all four parked iters → the next
beat re-mints the full warm→collect→enqueue→kick chain → under a persistent fault every beat throws
≈10 frame aborts/sec for the hold's duration — the exact windows (stream-hold, first-flight hold)
this lane exists to keep hitch-free.

**Fix sketch:** same fault-park shape — catch → abandon + warn + swallow, plus a per-hold fault flag
(e.g. `owner._holdExemptFaultHoldId`/epoch stamp) that suppresses re-mint until the hold releases or
the epoch advances. The collect is a residency-warm optimization; skipping it leaves builds flowing
through the normal queue — degrade direction correct.

**Effort:** S (four sites share the abandon+flag pattern). **Magic-frame impact:** H-M.
**Risk:** low.

### F4 — `_fencePackPending.iter.next()` unguarded — one abort + silent pose-fence desync

**Evidence:** `src/render/renderer.js:25988` — `const step = pendingPack.iter.next();` inside
`for(;;)` with no try/catch; completion stamps `:25990-25991`
(`_snapshotSourceTick = pendingPack.sourceTick; _publishSnapshotFenceStats(step.value)`).

**Mechanism:** a throw escapes `prepareFrame` (frame abort) leaving `_fencePackPending` on the
thrown generator. Next frame with the same `packEpoch`: `pendingPack.iter.next()` on a dead
generator returns `{done:true, value:undefined}` → `done` branch → **`_snapshotSourceTick` stamped
for a pack that never ran** + `_publishSnapshotFenceStats(undefined)` (stats poison) + pending
cleared. `snapshotNeedsPack` (`:25953-25957`) now reads stamped-tick == completedTick → false — the
fence keeps serving stale poses until `publication.applied > 0`/rebuilt re-arms it. In a quiet
cruise (no publication churn) the pick/raycast pose stream desyncs indefinitely. One-shot per fault
but silent bookkeeping corruption of the kind W99 minted the epoch-keyed parking to prevent.

**Fix sketch:** wrap the drive: catch → `iter.return?.()` + `_fencePackPending = null` + warn —
crucially do NOT stamp `_snapshotSourceTick` or publish stats; `snapshotNeedsPack` then re-mints the
same-tick pack next frame. Optionally a small fault counter parks re-mints for the epoch.

**Effort:** S. **Magic-frame impact:** M. **Risk:** low.

### F5 — `driveShadowPolicySteps` bare `.next()` — aborted eval then a silently-accepted torn verdict

**Evidence:** `src/render/renderer.js:29788` — `const step = slot.iter.next();` unguarded;
caller `:27669` unguarded (`changed = driveShadowPolicySteps(...) === true` inside
`_syncShadowCasterPolicyChecked`, `{framePass:true}` presented pass at `:24864`; the `:28309`
`_armDepthStage` restore caller IS guarded). Mint at `:29780` also outside any try.

**Mechanism:** on throw the slot stays in `_policyStepsParked` (delete runs only on `done`).
Next eval re-drives the dead iterator → `{done:true, value:undefined}` → `parkedMap.delete(root)` +
`stampShadowCasterPolicyLodLevel(root, lodLevel)` (fresh LOD stamp over a torn walk) +
`return undefined === true → false` → the caller records a completed "no-change" verdict over a
half-applied walk: castShadow flags mid-flip stay as the prefix left them, receiverDelta truncated,
and the root's dirty latch clears until its next dirty trigger. Mint-side throws re-enter per-eval
while the root stays dirty.

**Fix sketch:** catch in the drive loop: error → `parkedMap.delete(root)` + warn + return `null`
(suspended — the established re-enter-later sentinel) so the root stays dirty and re-mints fresh on
the next eval; the existing per-class starvation slot already bounds forced mints so it can't
livelock. Guard the mint identically.

**Effort:** S. **Magic-frame impact:** M. **Risk:** low.

### F6 — `_arrivalRosterIter` rethrow permanently abandons the sector's roster tail (asteroid capacity reserve never mints)

**Evidence:** `src/render/renderer.js:2816-2821` — `catch (err) { owner._arrivalRosterIter = null;
throw err; }`; mint is one-shot per `sector:enter` at `:18442`. Abandoned tail:
`:22044-22113` — `state.render.arrivalRoster` publish + `yield* _reserveArrivalAsteroidCapacitySteps`
→ `reserveAsteroidInstanceCapacity` → `bucket.reservedCapacity` floors
(`asteroidInstancePool.js:370-395`).

**Mechanism:** W107 nulled the iter on fault (good) but still rethrows — so the price of one
transient fault is one aborted frame PLUS the entire tail never running for that sector. The pool
comment states the stakes (`asteroidInstancePool.js:361-366`): without `reservedCapacity` floors,
live registrations grow buckets power-of-two and each growth is a fresh instanceMatrix `bufferData`
inside a presented frame — the mid-round GPU-alloc stall the reserve exists to prevent. `state.render.arrivalRoster` is telemetry-only (no reader besides the miss counter), so the visible
consequence is the reserve, not the publish.

**Fix sketch:** match the wave's own convention — catch → `iter.return?.()` + null + warn + swallow
(do not rethrow). To keep the tail alive: on fault, arm a cheap `owner._arrivalReservePending` flag
consumed by the next pump tick to mint a reserve-only pass (`_reserveArrivalAsteroidCapacitySteps`
drives standalone — it needs `entities`, not the roster result); or accept the per-enter loss. The
frame abort itself is the fixable part; the tail abandonment is the worse half.

**Effort:** S-M. **Magic-frame impact:** M. **Risk:** low.

### F7 — keepGpu reconcile fault-park can deadlock authored-visuals → hard boot failure after ~210 s

**Evidence:** mint gate `src/render/renderer.js:2470-2520` (keepGpu window: reconcile mints only if
`!owner._residentReattachIter && owner._reconcileFaultEpoch !== serviceFaultEpoch(st)`); pump
`return 'session-recook-keep-gpu'` each tick at `:2539-2540`; gate consumers
`main.js:1013-1024` (`waitForInitialAuthoredVisualsWithRetry` →
`throw new Error('Loaded authored ship visuals did not become ready…')`);
`partsLibrary.js:8448-8452` (mesh-less entity → `authoredAssetState` = `'missing'` → `openingPending`).

**Mechanism (axis b):** inside the keepGpu window, `serviceFaultEpoch`
(`enterSerial|contextRestoreSeq`) never advances — one throw inside `_reconcileMeshesSteps` parks
the reconcile lane for the WHOLE restore window. `_meshReconcileDirty` re-banks each tick but can't
mint → a required entity whose mesh needs reconcile (id-changed or never-mounted) stays mesh-less →
`'missing'` → `openingPending` retains it → gate spins `INITIAL_AUTHORED_VISUAL_TIMEOUT_MS` (180 s)
+ `AUTHORED_VISUAL_RETRY_TIMEOUT_MS` (30 s) → `visualsReady=false` → hard throw → the load fails.
One transient generator fault converts into a guaranteed boot failure ~3.5 minutes later — the
park's only bound is a timeout whose exit is fatal, not degrading. Same ordering hole on the
sibling lane: a parked `_residentReattachIter` evaluates as "sweep complete" (`!iter` → mint
allowed), so reconcile releases dead-id meshes the parked sweep could have rekeyed — wasted
dispose+re-cook and the same missing-gap when the entity is gate-required.

**Fix sketch:** bound the park inside the keepGpu window — either (i) a paced re-mint retry budget
per beat (N attempts, then park — never an unbounded re-mint loop), or (ii) a one-shot degrade to
sync `reconcileMeshes()` when the dirty flag has aged past K ticks inside this window (the loading
shell tolerates the atomic call — W87 ran it inline pre-stepping), or (iii) exempt the bounded
keepGpu window from the epoch park entirely. Any of the three preserves the fault boundary without
parking a gate-blocking lane.

**Effort:** M. **Magic-frame impact:** M-H (narrow trigger — a fault inside that window — but the
consequence is the worst outcome class: refused load). **Risk:** medium — retry budgets must not
recreate the re-mint loop W107 killed.

### F8 (minor) — analytic asteroid clearance box ignores `mesh.position.y`

**Evidence:** `src/render/renderer.js:4087-4089` — analytic mid-size rock path mints
`box.minX = mesh.position.x - half; box.minZ = mesh.position.z - half;` but
`box.minY = -half; box.maxY = half` — centered on global y=0, not the rock's position.

**Mechanism:** leftover asymmetry under the W108 Y-key fix (the memo key + translate now carry Y,
but this mint's Y extent still anchors at the world origin). A rock parked at y=±200 registers its
clearance roof at the plane, not at the rock — the camera-clearance grid sees a phantom roof /
fails to cover an off-plane rock. Duck direction is conservative (extra clearance or no-op), and
most field rocks sit near the plane — cosmetic-grade.

**Fix sketch:** `box.minY = mesh.position.y - half; box.maxY = mesh.position.y + half;`.

**Effort:** S. **Magic-frame impact:** L. **Risk:** none.

## Regression notes — W107 machinery verification (all PASS)

1. **`drainMeshBuildsBehindShell` drainFallbackAlive latch — PASS.** `:12555-12623`: stepped drive
   catch → `drainIter=null`; else-arm runs `runCookSyncTwin('mesh-build drain', () =>
   this._drainMeshBuildQueue(1), -1)`; `if (drainRow < 0) drainFallbackAlive = false` — (a) the
   non-numeric (`-1` sentinel from the guarded twin on a head-of-queue bail) latches the arm off
   after its first unproductive pass — prologue no longer re-runs per pass; (b) a later numeric row
   does NOT re-arm within the latch but the latch only gates the bare-else arm — the stepped lane
   keeps minting/driving normally, so the latch is per-arm not per-owner-permanent; (c) the
   Steps-less fixture path still runs the sync twin through `runCookSyncTwin` — behavior unchanged.

2. **`_drawnCullForceRemeasure` FIFO — PASS.** `visualCullRadius.js:104-158`: drain pops ≤
   `DRAWN_CULL_REMEASURE_PER_PASS` (4) rows per `resetDrawnCullPassBudget` under current keys
   (assetState/compositionId/lodLevel/childCount re-read at `:135-141`, outgoing key stashed to LRU
   `:142-148` before rewrite — no remembered-envelope loss); consult paths queue at `:244-247` and
   `:262-266` only when `known > 0` (never-measured rows still pay the honest inline walk —
   over-serve direction preserved); `drawnCullForceQueued` cleared on dead/detached drop (`:113`)
   AND on serve (`:116`) so dropped rows re-queue on next consult and served rows can't
   double-remeasure; dead rows `continue` before `spent += 1` — free dequeue, no walk.

3. **Dispose-lane headroom floor — PASS.** `:2120-2125`: `budgetMs = Math.min(Math.max(budgetMs * 2,
   DESPAWN_DISPOSE_BUDGET_MS), Math.max(budgetMs, headroom))` with `headroom =
   PACED_FRAME_BUDGET_MS - pacedFrameSpend()`; `drainWarmDisposeQueue` receives
   `Math.max(0, DESPAWN_DISPOSE_BUDGET_MS - (now() - liveLaneStarted))` from the live lane's
   leftover — floor formula and inheritance both as briefed.

4. **Clearance memo translate + admission slice + travel-pad — PASS.** (a) `:4030-4052` position-only
   drift now covers X/Y/Z (W108 lod F3 carried the Y): `posY` in the key (`:4019`), `dy` translates
   `minY/maxY` (`:4038`), `clearanceLayoutFromBox` rebuilds layout (`:4040`), `_clearanceBoxEpoch`
   bumps (`:4044`). (b) `liveGeometryAdmission.js:203-218`: urgent `prepareBatch` sliced at 8-root
   chunks with `await yieldToMain()` between. (c) `primeMotionTravelPad` early-returns when
   `data.drawnCullRadius == null` (`visualCullRadius.js:59-63`) — post-fit roots only.

5. **Foundry drain + env-source stamp — PASS.** (a) `_foundryEnvPending` arms for ANY non-loading
   mode (`:23089` — comment now names the menu live-rAF case), drained idempotently at
   `enterLoadingMode` head (`main.js:1195`), `drainMeshBuildsBehindShell` head (`:12527`), cook seam
   (`:15873`), `preparePostOpeningPipelines` head (`:17064`). (b) `_envMapSource = iblSource` stamps
   only after `queueSceneEnvMapRebind`/direct-dispose commits (`:23193` after `:23184-23188`) —
   a throw in that window can't phantom-stamp the same-source guard. (c) `_foundryIblPromise.catch`
   warns (`:23095`); `_bakeEnv` outer catch warns (`:23194-23197`).

6. **13 tight-try re-shapes — PASS.** Systematic scan of all ~120 `.next()` sites: every paced
   drive's `iter.next()` is the sole expression under try (env-bind triple `:11017`, `:14629`,
   `:15903`; settle bridges `:14208`/`:14266`; receipt mints `:14418`/`:14458`; dispose lanes,
   `_flushMeshReleasePending`, release-detached-owners, asset-lease, warm-slot prewarm,
   drain-behind-shell, deferred-enter slice). Awaits live outside the try at each site;
   `cookSuperseded`/`cookStale` sentinels still propagate (env-bind's `envComplete` bail,
   cook-provider `:16100` and pool-seal `:16423` keep `return cookSuperseded` inside their wider
   cook-scope tries — those two are provider-isolation tries, not presented drives).

7. **syncEntityViewsSteps + fault parks — PASS.** (a) `syncEntityViews` (`:24551-24554`) is a sync
   driver over `syncEntityViewsSteps`; the twin yields at `(index & 127) === 127` inside the two
   counted loops only (`:24643` hidden-tail, `:24748` visible pass) — byte-identical ordering.
   (b) `drainSceneEnvRebindQueue` (`:29725-29745`) drops a torn head like a done head —
   `iter.return?.()` + warn + `queue.shift()` + `disposeTarget.dispose` try. (c) `serviceFaultEpoch`
   (`:2248-2256`) = `` `${enterSerial ?? 'x'}|${contextRestoreSeq}` ``; all four parks
   (`_protectedFirstFlightFaultEpoch` `:2279`, `_residentReattachFaultEpoch` `:2467`/`:2519`,
   `_reconcileFaultEpoch` `:2797`/`:2887-2895`, `_residencyPollFaultEpoch` `:2938-2947`) suppress
   re-mint within the epoch and re-arm on the next enter/context-restore; reconcile parks re-dirty
   `_meshReconcileDirty`. (d) `_flushMeshReleasePending` (`:22526-22563`) clears the pending set
   pre-loop, per-registry try + `rePend` flag → re-pends on throw, paced-ledger debit + skip cap.
   (e) All 7 census degrades run `collectInstancePoolCompileRootsAndSubjects` (seal `:13792`/`:13812`,
   late-admission `:16634`, cook census `:14866`, pool census `:15546`, first-flight `:14604`,
   pool-compile `:10072`) — fault twins return real `{roots, subjects}`; `deriveCensus`
   (`:16574-16622`) buckets subjects under enclosing roots.

## Hunt axes — enumerated residuals

**(a) warn cadence / unguarded `.next()` reachable from prepareFrame — ranked by rethrow cadence:**
per-frame-under-churn: F2 (`_presentationRebindIter`, mint re-arms while publications arrive);
per-call≈per-frame under persistent fault + unbounded O(scene) recovery walk: F1 (`_shadowCensusForFrame` ×9 presented sites);
per-100 ms beat during holds: F3 (hold-exempt ×4);
per-eval on a torn parked root + silent torn verdict: F5 (`driveShadowPolicySteps`);
once-per-minted-pack + bookkeeping corruption: F4 (`_fencePackPending`);
once-per-enter + permanent tail loss: F6 (`_arrivalRosterIter`).
Opening-path `drivePublishFirstPicture`/`driveUpgradePromises` (`:25724`/`:25739`) remain bare by
design — boot-lane territory (W108 boot F1), throws are intentional hard boot errors, not hitches.
Sync-driver tails (`:6088`, `:12282`, `:21997`, `:22067`, `:22719`, `:22787`, `:23214`, `:23741`,
`:24553`, `:25497`, `:25611`) are the sanctioned mint-then-inline-drain closure shape — reachable
only from sync callers, and their throws land inside a catchable driver (in the pump they surface
through the generator's `.next()` → the lane's own fault park).

**(b) fault-epoch starvation consumers:** F7 is the blocking-gate case (authored-visuals waits on
reconcile's gap-heal; parked lane + banked dirty + fatal timeout exit). Also verified: a parked
reconcile in the normal pump still trips the `return 'full'` at `:2908-2911` while
`_meshReconcileDirty` stays banked — the residency-poll block (`:2912+`) and its
predicted-prewarm/missed-mesh recovery remain starved for the epoch (W108 boot F2's mechanism,
confirmed still live — poll and collect unreachable while the flag is set; the mesh-build drain
inside the block still runs). A parked `_residencyPollFaultEpoch` merely skips the poll block —
degrade by design. A parked `_residentReattachFaultEpoch` makes `!iter` evaluate true → reconcile
mints anyway → the keepGpu ordering contract (reconcile must not release meshes the sweep could
rekey) has a fault-path hole — see F7. `_arrivalRosterIter` abandon starves the asteroid-capacity
reserve — see F6.

**(c) queue-shift-on-throw coverage — CLEAN.** Enumerated every head-driven drain:
`drainSceneEnvRebindQueue` (fixed, torn-head drop), `drainDisposeQueueLane` (per-corpse parked
iters, mint/step catch → `headField` advance), `drainDeferredEnterSlice`/`drainDeferredEnterMaterializers`/`dropDeadDeferredEnterEntries` in `core/sectorEnterDefer.js`
(provider-mint catch → `done=true` → `queue.shift()` at `:168`/`:186`; dead-epoch sweep splice;
liveness filter), `_meshBuildQueue`/`_warmDisposeQueue` (guarded drivers), `_meshReleasePending`
(re-pend), `_rebuildBridges` (per-row try + bounded tail re-append + release on abandon),
`_rosterPrewarmSpecQueue` (map consume under per-emit try at `:19124-19128` + `drive.catch` at
`:19177-19179`). No `while(queue.length)` drain with the stuck-head shape remains.

**(d) subjects-fallback consumers — CONSISTENT.** `collectCompileSubjectsPaced` remains reachable:
`subjects:null` degrade drives the all-roots fallback loop (`:13880-13885`, `:16647-16653`), and
healthy censuses still fall back per un-reached root (`bucket === undefined` → per-root collect at
`:13873-13875`, `:16686-16687`). The two fault-twin fallback shapes (`{roots:[],subjects:null}` seal
vs `{roots:[],subjects:[]}` late-admission) converge: empty-subjects runs per-root collects via
bucket misses anyway. Nothing depends on the degraded `subjects:null` shape beyond the designed
fallback; no test pins located.

**(e) remaining presented-frame walks, ranked by worst-case node count:**
1. `lightCensusSignature(scene)` sync fallback (`:27839`) — full O(scene) traverse, reachable
   per-call after a torn stepped walk (F1). The never-stamped first mint also drains synchronously
   (`:27819-27820`) — once per scene, bounded.
2. `syncShadowCasterPolicySteps` per dirty root — bounded by the `SHADOW_POLICY_PASS_MS` slice
   clock + per-class starvation cap; fault path is F5.
3. `cameraClearanceBoxForMesh` cold mints — `setFromObject` O(subtree) per cold/crossed-cell
   structural mesh; memo + position-translate keep sustained cost bounded.
4. `drawnCullRadiusForMesh` never-measured inline walks — honest direction only, jittered defer cap.
5. `_shadowReceiverTally.resolve` — paced (`spendGate`/`debit` hooks at `:28616-28619`); the
   `:28626` bare `scene.traverse` fires only when the tally helper is absent (harness envs).
Everything else reachable from `prepareFrame` is paced, parked, or ledger-skip capped.
