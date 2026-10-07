# W107 audit — in-flight-hitches

Audited `devin/1791064509-perf-w60` HEAD. Extraction point was `2ee99c295`; a late commit `3a4626bc8` (wave-107 boot lane — foundry drain at veil head, env-source stamp order, wide-try drive re-shape, opening publish Steps) landed mid-audit; every finding below was re-verified against `3a4626bc8` (which also added two more instances of finding 2's class). All line numbers cite `3a4626bc8` (renderer.js unless noted).

`saturated: false`

## Ranked findings

### 1. `drainSceneEnvRebindQueue` — torn head rethrows into every presented frame, permanently
- **file:line** — :29658 (drain), :29673 (`const step = head.iter.next();` unguarded), :29675 (`queue.shift()` only on done), service call :2354, `serviceRenderMeshResidency` inside `prepareFrame` :25991.
- **mechanism** — `queueSceneEnvMapRebind` (:29567) mints `replaceSceneEnvMapSteps` (~:29584), a per-node material/userData walk over ~16k nodes of envMap predicates plus parked authored roots and retained LOD levels. A mid-walk throw (a poisoned material/userData getter — the file has live comments about `WebGLProgram.setProgram` throwing on torn state) propagates straight out of the drain: no try around `head.iter.next()`. The head never `queue.shift()`s, so **every subsequent frame's service call rethrows at the same head — a per-frame exception for the rest of the session**, not a one-shot. Worse, the drain sits at :2354 before the rest of the service (mesh-release flush :2357, rebuild bridges :2358, seam/deferred drains, residency pump) and `serviceRenderMeshResidency` sits at :25991 before `syncEntityViews` (:26021) — each throw also skips pose writes, camera, and instance submission. `renderUpdatePhase` catches it into `renderError` → `worldError` → rethrow to the loop logger, so the player sees a frozen picture plus a logged frame error every frame while the entry lives. The paced-ledger skip (:29662) only throttles the brick to frames with wallet room.
- **fix sketch** — wrap `head.iter.next()` in try/catch; on throw close the iter, `queue.shift()`, one warn, continue to the next entry. Entries are idempotent predicate pairs, so pushing the torn head to the tail for one retry before dropping is also safe.
- **effort** S · **magic-frame impact** H (under any systematic scene-node fault: sustained per-frame presented exception + dead view sync) · **risk** low (fault path only)

### 2. Combined-census drive faults degrade to the roots-only twin — `subjects` lane silently uncovered
- **file:line** — degrades at :13718-22 (`pool seal census`), :13741-45 (`pool roots census`), :13751-56 (Steps-less), :14792-97 (`cook census`; `cookCensusSubjects` stays null → `cookLateAdmittedRoots` never computed at :14809-10), :15471-78 (`pool census` → `subjects: []`), and both late-admission blocks keep `subjects: null` (:16510-20 Steps-less, :16578-86 drive-fail). Subjects-capable sync twin exists and is unused here: `collectInstancePoolCompileRootsAndSubjects` at latePipelineAdmission.js:331 — same visit predicate, one traverse, returns `{roots, subjects}`.
- **mechanism** — every fallback collects pool roots but starves the subjects lane to `null`/`[]`. Consumers are all guarded (`if (sealCensus.subjects)` :13780, `if (cookCensusSubjects)` :14810, `subjectsForCompileRoots` `!censusSubjects` fallback ~:16645), so nothing crashes — but on exactly the fault path the twin exists to preserve, late-admission subjects get no compile/pool coverage and link programs at first draw instead of behind the shell: the pop-in/hitch class this machinery prevents, relocated into the fault path.
- **fix sketch** — call `collectInstancePoolCompileRootsAndSubjects(scene)` in these fallbacks and assign both halves (`roots` + `subjects`/`cookCensusSubjects`). Same atomic-walk cost the fallback already pays; strictly more coverage.
- **effort** S · **impact** M (fault paths inside cook — but the degrade contract is preserve-behavior, and this preserves only half) · **risk** low

### 3. Abandon-and-rethrow drives re-mint and re-throw on a cadence (worst: every frame during first-flight hold)
- **file:line** — `driveProtectedFirstFlightDrain` :2243-2271: catch → null + `throw err` (:2260-62), but the guard re-mints `owner._drainProtectedFirstFlightBuildsSteps()` unconditionally at :2250 — a systematic skeleton fault rethrows **every frame for the whole hold**. Flight-path siblings found at HEAD: `_reconcileIter` mint :2806 → drive catch → `abandonReconcile` + `throw` at :2824-33, and `_residencyPollIter` catch → `abandonResidencyPoll` + `throw` at :2878-81 (re-mints each poll interval → periodic presented-frame throws). Loading-branch siblings: `_residentReattachIter` :2425-26, `_reconcileIter` :2472-77 (loading recook window only). `_arrivalRosterIter` :2768-70 is the benign member — re-minted only at each sector:enter emit, so the throw is once per enter.
- **mechanism** — rethrow-as-loud-fail is fine once; re-mint-and-rethrow converts a one-shot pathology into a sustained (hold: per-frame; poll: per-interval) presented-frame exception that starves every sibling lane behind it in `serviceRenderMeshResidency` and skips `syncEntityViews`. For the reconcile drives specifically, `abandonReconcile` (:3178) does not re-dirty — `_meshReconcileDirty` is cleared at pass start (:23188) — so a mid-pass throw is one-shot loud-fail but the reconcile request is **dropped** (self-heals via the frequent dirty sources at :17390-18684, but the intended sweep never ran).
- **fix sketch** — stamp a poison marker on abandon (`owner._<lane>FaultedEpoch = enterSerial`) and skip re-mint for that window; or quarantine to warn + drop like `_cacheLeaseIter` already does (:2741-44). For reconcile/poll, re-set dirty on abandon so the lost pass retries next cadence instead of propagating.
- **effort** S · **impact** M (bounded windows/cadences, but the hold is exactly the window the magic-frame bar measures) · **risk** low

### 4. `_flushMeshReleasePending` — unguarded 5-registry chain, pending set consumed before the work
- **file:line** — :22514-22 (`_meshReleasePending = null` at :22516 *before* the five `releaseMeshSet` calls :22518-22); call sites :22511 (`_meshReleaseBatchEnd`) and :2357 (service).
- **mechanism** — a throw in registry k propagates into `prepareFrame` that frame AND permanently loses the pending rows for registries k+1..4: their per-entity motion records pin dead meshes with no re-drive — a silent slow leak on top of the frame error. Contrast shape needed is already in-file: the per-entry isolation `drainDeferredEnterSlice` uses.
- **fix sketch** — wrap each `releaseMeshSet` call in its own try/catch; optionally re-pend the unflushed registries' rows so nothing leaks.
- **effort** S · **impact** M (permanent record leak + frame throw; leak persists until owner teardown) · **risk** low

### 5. `_drainMeshBuildQueue` sync driver — unguarded skeleton; only per-row builds are quarantined
- **file:line** — :23808-10 (`let step = iterator.next(); while (!step.done) step = iterator.next();` bare); per-frame callers via `_drainPendingMeshBuilds` (:23683) at :2489, :2853, :2896, :2900, plus hold-exempt burst :2544 and cook sites :12342, :16321, :23312, :23678.
- **mechanism** — row-level `vf.build(e)` IS wrapped (:23980+ → `_meshBuildLastError` + cap-3 `_noMesh` at :24039), so exposure is the generator skeleton: `makeHoldExemptScanContext`, late-present gate, hoist drive, newcomer census — any throw propagates through `serviceRenderMeshResidency` → `prepareFrame`. Fresh iterator per call means a systematic skeleton fault re-throws every frame while the queue is non-empty — the finding-1 class with a smaller surface.
- **fix sketch** — try/catch around the drive; on throw warn + return `built` so far (row-level quarantine already guarantees partial progress).
- **effort** S · **impact** M · **risk** low

### 6. `settleRebuildBridges` → `releaseRebuildBridge` unguarded
- **file:line** — :2301-41 (`bridges.delete(id)` at :2338 before `releaseRebuildBridge` at :2339); service call :2358.
- **mechanism** — row deletion first means a throw loses only that row (self-cleaning), but the exception still aborts the rest of the service tail that frame and propagates to the loop. With a persistent head-of-loop fault the pass burns one row per frame while throwing each frame — service tail dead until the map drains.
- **fix sketch** — try/catch per row; on throw count + continue (rotate to tail once, drop past N attempts).
- **effort** XS · **impact** L-M · **risk** low

### 7. Late-admission census degrade pays 3 atomic whole-scene walks + per-root subject collects — twice
- **file:line** — Steps-less block :16510-20 and drive-fail block :16578-86 each run THREE `runCookSyncTwin` atomic ~21k-node traverses (pool roots + late-admitted + uncompiled) in one cook leg, then return `subjects: null` → `subjectsForCompileRoots`'s `!censusSubjects` fallback (~:16645) pays per-root `collectCompileSubjectsPaced` walks downstream.
- **mechanism** — the fault path pays ~3× the scene walk the combined census amortizes, plus the per-root re-collect the census bucketing exists to avoid. Bounded once per cook, but `prepareLiveSectorAfterJump` is presented-adjacent (in-flight recook) so a systematic fault bricks one resumed macrotask for hundreds of ms.
- **fix sketch** — run `collectInstancePoolCompileRootsAndSubjects` once; derive `roots`, `lateEntities`, `uncompiled` from its `subjects` exactly like the healthy path at :16628.
- **effort** S-M · **impact** M (fault path only) · **risk** low

### 8. `sweepBoundarySettle` inner catch can undercount `pending` → early shell release
- **file:line** — :14079-14118 (inner `try { } catch (_) { /* census failure must not wedge the settle */ }` wraps the whole census and returns the partial `pending`); outer drive catch at :14140-45 correctly degrades to `pendingBoundaryCount = 1` but is reachable only via generator prologue throws — nearly dead code.
- **mechanism** — a mid-census fault inside the Steps body is swallowed into a possibly-0 `pending`, so the `pendingBoundaryCount === 0` gate can release the settle early on a torn census — precisely what the outer catch guards against. The inner catch predates W106; the interaction is new. Bounded: refused `requestAuthoredUpgrade` calls keep their live trigger armed (:14060 comment) — worst case is a too-early shell release the late-admission machinery covers.
- **fix sketch** — on inner catch, return a torn marker (`pending = Math.max(pending, 1)` or `{ torn: true }`) so the settle treats a torn census as still-pending.
- **effort** XS · **impact** L-M · **risk** low

### 9. Hidden freeze/unfreeze mints drop torn iterators silently
- **file:line** — :22266-73 (freeze mint `catch (_) { step = { done: true } }`), :22408-13 (unfreeze, same shape).
- **mechanism** — both drains swallow a torn mint and treat the row as done: iter and stamps deleted, stamped prefix stays recoverable by the by-stamp contract — honest degrade but zero telemetry. A systematic mint fault loses freeze/unfreeze work forever, silently; every other quarantined lane in the file logs at least once.
- **fix sketch** — one throttled `console.info` per drain pass naming the dropped root.
- **effort** XS · **impact** L · **risk** low

## Axis (a) — no unbounded warn site found
Enumerated every `console.*` inside a retrying or looping presented-path caller: the settle-sweep re-drive warn (:14144) is bounded by the settle cadence and nearly unreachable per finding 8; the mesh-build permanent-fail warn (:24043) fires once at failure #3 then `_noMesh` kills the row; the warm-root park warn (:21634) is per-call with a ledger-gated continuation; `pipelinePrecompile` rejection warns are once per stored promise per enter; the opening pre-submit gate uses a `refusals % 120` heartbeat (:26251/:26421 — comment notes a per-frame 10KB `console.error` is its own stall). Drive catches warn once per drive; no warn site re-mints into an unbounded loop — the re-minting lanes rethrow instead (finding 3). **No once-per-path/rate-limit change needed.**

## Axis (c) — sync-twin partial-double: clean
Audited for double-apply on drive-fail (partial Steps side effects + full sync-twin run): censuses are pure collects; `enqueueMissingMeshBuilds` idempotent via `_meshBuildQueuedIds`; env-bind/light-budget writes are idempotent flag sets; reveal mints self-restore on throw (`compilePresentSlice.js:281-84`, sync twin :194-98, `'cook-superseded'` checked first at ~:14577); `restoreReveal` replay is by recorded entry; deferred-enter entries hold their iterator on the entry itself so the inline safety drain continues it rather than re-running the provider (sectorEnterDefer.js:113); epoch guards + `dropDeadDeferredEnterEntries` close foreign parked iterators. No partial-double found.

## Axis (e) — remaining presented-frame walks, ranked by worst-case node count
1. `scene.updateMatrixWorld()` per frame — O(visible subtree); hidden-subtree freeze prunes it (PERF-59); inherent.
2. Fault-path sync-twin fan-out — up to 3 atomic ~21k-node walks in one macrotask (finding 7); bounded per fault, cook-context.
3. `subjectsForCompileRoots` null-subjects fallback — per-root subtree collects; cook-context (finding 2).
4. `syncEntityViews` hidden/visible slot loops + presentation query — O(slots); inherent.
5. `getActivityFrame` classify — O(entityList) once per tick (memoized on `state.tick`); inherent.
6. `replaceSceneEnvMapSteps` head walk — paced at 256 nodes/yield ✓ (its fault handling is finding 1, not its pacing).

## W106 regression verification — all seven items verified concrete at `3a4626bc8`

1. **Per-step cook drive guards + `runCookSyncTwin` belt** — `closeCookStepsIter`/`runCookSyncTwin` at :2046-58; ~76 guarded `.next()` call sites across the cook; every `driveError` catch inspected belts through `runCookSyncTwin` or degrades to an honest shape with a comment. The deliberately unguarded preflight prefix (opening env-bind ~:12604) is intact; guarded env-bind sites (:10993, ~:14600, :15863) did not regress.
2. **Recount prefix-any-shift + seededTotal cap** — shadowReceiverTally.js:161-70 prefix-rescan seed `[0, min(shifted, idx))` openSet-filtered (:189); `seededTotal > every*4` → `notedWalk.abandon` (:202) + `resolve()` re-mints under `RECOUNT_SUPERSEDE_CAP` (:438-46); `spendGate` early-exit :421 + `finally` debit :478 — once per call; call site renderer.js:~28541 passes `pacedFrameSpend() < PACED_FRAME_BUDGET_MS` + `notePacedFrameSpend`.
3. **Jittered defer cap** — visualCullRadius.js:216 + :234 `2 + (mesh.id & 3)` on both mint paths; `drawnCullDefers` cleared on write :271; FIFO :134; LRU hit :183; max-over-LRU :203-05 (deliberate decay). W107-landed `_drawnCullForceRemeasure` FIFO (:103-38, ≤4/call) driven by `resetDrawnCullPassBudget` at renderer.js:24512.
4. **Bound re-unbind re-queue** — `owedBoundRestore` captured before stamp clear (~:22600); re-queue branch re-stamps `sfHiddenUnfreezeBound` + `sfHiddenUnfreezeQueued` and re-pushes (~:22649-58); bound-tier drain mints regardless of attach/visible (~:22376); parked bound iter abandons only on re-freeze/detach-for-non-bound.
5. **Warm-lane floor + payload hoist** — `drainDisposeQueueLane` backlog>32 floor at :2118-21 (`max(budgetMs, PACED_FRAME_BUDGET_MS - pacedFrameSpend())`); warm lane at :2352-53 inherits `DESPAWN_DISPOSE_BUDGET_MS - liveLaneElapsed`. Payload hoist (~:19136-67) builds `mergedSpecs` FIFO-first then `concat(filtered)`; `runSeq` epoch retires stale drives.
6. **Foundry pending arm + drain** — `_loadFoundryIbl` :23038 arms `_foundryEnvPending` only on `state.mode==='flight'`; `_drainFoundryEnvPending` :23062 idempotent; drains at :12454, :15804 (yieldLiveSectorGpu seams) and :17062 (`preparePostOpeningPipelines` head — the new `3a4626bc8` veil-head drain); `_bakeEnv` internally try-guarded (`catch (_) { /* env-map optional */ }`).
7. **restoreReveal + tally spendGate + note cap** — `restoreRevealSteps` drive catch → warn → sync fallback in `finally` (~:14695-715); `resolve()` spendGate once-per-call + `finally` debit; `UNMEASURED_SHADOW_NOTE_NODE_MAX=128` + `UNMEASURED_SHADOW_NOTE_EXACT_PER_PASS=2` present.

**Lane verdict: `saturated: false`** — the per-frame pump/emit/park layer is paced and per-listener quarantined, but three presented-frame drains still rethrow into `prepareFrame` under systematic faults (envRebind stuck head — permanent; protected-first-flight re-mint — per-frame during the hold; mesh-build driver — per-frame while the queue is non-empty), two flush lanes lose work on throw, and every combined-census drive fault silently drops the subjects lane. All fixes are contract-preserving fault-path changes — no quality trade, no sim-hash risk.
