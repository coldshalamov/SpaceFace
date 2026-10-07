# Wave 109 audit — lane 'in-flight-hitches'

Audited tree: `devin/1791064509-perf-w60` @ `8e574707d` (HEAD; includes w109-lod `14523c688`, w109-popin `991bd5b55`, w109-boot `8e574707d`). Audit-only — no code, no runs, no PR.

## Verdict

`saturated: false` — the W108 fault-park lattice + all three W109 fix trains verify clean, but five mechanism-level residuals survive, headed by the last unguarded `.next()` drive on the presented path (`syncEntityViews`): one faulting row closure still kills every presented frame → `PRESENTATION STALLED` → frozen 3D canvas while sim + HUD keep running.

## Regression verification — W108

| # | Item | Result |
|---|------|--------|
| R1 | `serviceFaultEpoch(state)` composite mint (enterSerial \| contextRestoreSeq) + consistent read at every lane | PASS — renderer.js:2294-2298; minted once per call site (2490, 2559, 3107, 3556, 26281, 3450) and compared on the same value; `_rebindFaultEpoch` composite adds `_meshesVersion`; `_arrivalReserveEpoch`/`_fencePackFaultEpoch` intentionally narrower (enterSerial / packEpoch) — consistent-by-design (boot lane concurs) |
| R2 | drawnCull force-remeasure FIFO drop clears `drawnCullForceQueued` w/o double-queue | PASS — visualCullRadius.js:139-144 (dead/live drops both clear), consult re-queue gated on `!== true` at 275/294; W109-popin forced-wallet skip at 125-129 preserves the flag |
| R3 | live-lane dispose headroom clamp `min(budgetMs*2, max(DESPAWN_DISPOSE_BUDGET_MS, headroom))` | PASS — renderer.js:2155 exact clamp; warm lane inherits `max(0, BASE - liveWall)` at 2441 |
| R4 | `_flushMeshReleasePending` metered ~4 ms wall + paced debit + idempotent re-pend | PASS — 22808-22860: paced ledger consult + `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS` skip cap + forced-run + registry-granularity deadline with `_meshReleaseRegistryIndex` resume cursor; Set stays pending (idempotent releases) |
| R5 | FIFO drain outgoing-key stash to LRU | PASS — visualCullRadius.js:158-176 (drain side) mirrors consult stash 211-242; `DRAWN_CULL_LRU_SIZE` bound; `calls = REMEASURE_CALLS >> 1` on hit |
| R6 | publish/upgrade drive belts: `iter.next()` under try + `closeCookStepsIter` + warn + exactly one re-mint then degrade | PASS — renderer.js:26055-26078 (`drivePublishFirstPicture`: attempt<2, second fault → `runCookSyncTwin('opening-first-picture-publish', ...)`); upgrade-promises drive has the identical belt |
| R7 | parked-reconcile poll fall-through gates on live iter, not banked dirty | PASS — 3024-3106: `reconcileParked` skips mint; `reconcileWorked !== 'full'` falls through to the poll lane at 3107-3160 |
| R8 | PMREM `_pmremGenerator` reuse per contextRestoreSeq | PASS — ~23434: generator cached across bakes inside one context epoch, re-minted on GL restore (`resolveIblSource` + force-bake guards at 23431-23433) |
| R9 | keepGpu degrade: ~1 s epoch-parked dirty → ONE atomic `reconcileMeshes({keepResidentSet:true})` + `_keepGpuReconcileDegraded` suppresses loop | PASS-with-amendment — W109-boot replaced the atomic twin with an escalated-paced re-mint: 2575-2606 (≥1 s dirty → `_reconcileDegraded = true`, `degradeSlice 16` at 2616-2650, skips ledger consult, fixture owners re-dirty on throw). Same contract, paced not atomic — strictly better for hitches |
| R10 | hitches fault parks (a)-(g) | PASS — (a) census catch/serve `memo.sig` + `sigFaults`≥3 park 28311-28363; (b) `_rebindFaultEpoch` stamps on both mint gates 26304/26318 + retry cap 26261-26270; (c) 4 hold-exempt sites stamp shared `_holdExemptFaultEpoch` → head gate 3556 → `driveHoldExemptDegrade` 3450-3499 (cap 3/epoch); (d) `_fencePackPending` catch: no `_snapshotSourceTick`/`_publishSnapshotFenceStats` stamps + `_fencePackFaultSince` arm + 3-try cap 26396-26461; (e) `driveShadowPolicySteps` catch drops parked slot + returns null 30330-30337; (f) `_arrivalRosterIter` catch arms `_arrivalReservePending` reserve-only iter 2923-2960, bounded at 2961-3017; (g) clearance analytic box Y band centers `mesh.position.y` 4371 |

## Ranked findings

### F1 — `syncEntityViews` row loops are the last unguarded drive on the presented path

**Evidence** — renderer.js:24881-24885: `syncEntityViews` drains the 665-line `syncEntityViewsSteps` generator via a bare `while (!step.done) step = iter.next()` — no try/catch at the drive and no per-row isolation inside either counted loop (hidden rows 24972-25049, visible rows 25077-25452). Per-row reachable throws include `userData.updateRuntimeState` (25321), `updateWorldSitePresentation` (25334), `updateDamageState` (25342), `updateDriveState` (25345), `updateAuthoredMotion` (25348), the micro-motion suite (`updateCraftMicroMotion`/`updateForgeCrown`/`updateBossDressing`/`updateProjectileMotion`/`updateAsteroidMotion`/`updatePickupMotion`/`updateOrdnanceMotion`/`updateGateMotion`/`updateStationMotion`/`updatePlaceMotion`/`updateDeathSpiral`/`updateWreckMotion` 25374-25423), `updateHulkEmber` (25106), `updateEntityShieldBubblePresentation` (25435), `userData.updateLod`/`lod.resolve` (25177-25181), `classifyRenderEntity` (25314), `applyEntityMeshVisibility`/`shouldSubmitEntityMesh` (25036, 25288), `_livingHullPresentation.sync`/`_crucibleGhostPresentation.sync`/`_overheadCues.sync` (25323-25384), and the bookkeeping calls (`resolveWorldPresentationEntity`, `world.refreshVisibleEntity`, `_applyPresentationPose`). Propagation verified: throw → `prepareFrame` (26552) → `runRenderUpdatePhase` catch (renderUpdatePhase.js:86-93) → draw skipped (113) → `worldError` rethrown (136) → frame-level catch presentationRunner.js:1185-1241 → `consecutiveFrameErrors++` → `PRESENTATION STALLED` + `presentationStalled` flag at ≥`PRESENTATION_STALL_FRAMES` (~0.5 s) → frozen 3D canvas while sim + HUD keep animating.

**Mechanism (player-facing)** — one bad entity row (a torn `userData`, an authored-motion closure throwing on odd `entity.data`, a pooled-identity mismatch) drops the presented frame; a persistent fault repeats it every rAF: the world picture freezes at the last successful paint, forever (until the faulting entity despawns), while the game keeps playing blind. This is the worst-stale-frame class the whole fault-park lattice exists to prevent — reachable through the most privileged lane.

**Fix sketch** — per-row try/catch inside both loops around the row body (or at minimum the closure block 25314-25450): on catch, stamp `userData.sfRowFaultedEpoch = serviceFaultEpoch(state)`, count to a `state.render` fault rollup (see F6), skip the row's remaining work, continue the pass. Epoch-latched skip prevents a faulting row from re-throwing every pass within one epoch. Degrade direction is legal: one row possibly stale/partially-written for the epoch vs. every row dead every frame. Pose/visibility authority for all other rows unchanged; presentation-only — no sim writes, golden hash untouched.

**Effort** M (the row body is ~200 lines; needs care that partial pose writes can't persist a torn matrix — safest to catch around the closure block rather than the pose path). **Impact** H. **Risk** M — must not swallow a fault that leaves `matrixAutoUpdate=false` on a live row; quarantine should stamp-and-skip, not abort.

### F2 — shadow light-census first-mint: unbounded synchronous drain + per-site O(scene) fallback inside one presented pass

**Evidence** — renderer.js:28289-28363. With `memo.sig == null`, `deadline = Infinity` (28301) — the stepped iterator drains synchronously to completion or to its fault point inside the *first call site of the pass* (28305-28326). On drive throw: `superseded++` + break (28319-28323), then `memo.sig == null` → sync fallback `lightCensusSignature(scene)` — a full O(scene) traverse inside the same presented call (28350-28360), retried per call site until `sigFaults >= 3` (28348). ~15 sites consult the memo per pass; worst case under a persistent census fault: ~3 stepped re-mints each driven synchronously to their fault point + 3 whole-scene sync traverses inside ONE presented frame (superseded cap 4, sigFaults cap 3, both epoch-keyed → re-armed every census mutation epoch — light mounts/demounts are frequent in combat).

**Mechanism** — a faulting census pays up to ~6 heavy walks in a single presented frame — the multi-O(scene) hitch the per-pass drain wallet (first-site-per-pass, `memo.lastDrainSeq === _viewSyncSeq` at 28295) was built to amortize. Between faults, subsequent sites correctly serve null (conservative/unsigned direction).

**Fix sketch** — two one-line bounds: (i) `deadline = startedAt + 4` even when `sig == null` (serve-null is already the legal direction per 28357 comment); (ii) `memo.sigFallbackSeq === this._viewSyncSeq` gate so the sync fallback pays at most one O(scene) walk per presented pass — `sigFaults` still caps the epoch. Contract-preserving: unsigned frames stay unsigned.

**Effort** S. **Impact** M (persistent-fault-gated; each fallback is a full-scene traverse). **Risk** L.

### F3 — presented-tail call sites carry no fault isolation (same PRESENTATION STALLED blast radius)

**Evidence** — the prepareFrame tail after `syncEntityViews` is a chain of unguarded plain calls: `updateShipPitchPresentation` (26551), `cam.follow` + `_updateCameraOccluders` (26563-26564), `syncContactShadowPool`/`tickShieldShellClock`/`syncShipAuxPools` (26575-26577), `_syncAuthoredInstanceSubmission` → `syncAuthoredInstancePools` (26583), `spaceBg.update`/`parallaxLayers.update` (26591-26592), `_syncShadowMapEnabled`/`_syncKeyLightShadowFrustum`/`_updateShadowFollow`/`scheduleRealtimeShadowRefresh`/`prepareActiveShadowCamera` (26594-26628), `_syncAsteroidInstanceSubmission` → `syncAsteroidInstancePool` (26632), `collisionDebug.update` (26635), and `publishActivityFrame` → `getActivityFrame`/`ensureActivityClassified` O(entities) classify (26518). Any throw lands in the same renderError → `worldError` → stalled-presentation path as F1. The busy-loop `.next()` census/collect drives inside them are guarded; these outermost call sites are not.

**Mechanism** — lower probability per site than F1 (single bounded calls vs. N-row closures) but identical outcome: whole presented frame dead per tick under a persistent fault, loop kept alive only by the outer catch.

**Fix sketch** — wrap each tail site in the established `runCookSyncTwin`-style try pattern (`tryCallSite`/`console.warn` once per epoch-keyed fault + continue). `getActivityFrame` can stale-serve `this._activityFrame` (the prior frame — over-admit direction, legal). `cam.follow` skipped for a frame degrades to one static camera beat — strictly better than a dead frame. Per-site epoch-latched warn counters, not unbounded logs.

**Effort** S-M (mechanical, ~12 sites). **Impact** M. **Risk** L.

### F4 — `driveShadowPolicySteps` parked-root re-mint: no per-root fault cap

**Evidence** — renderer.js:30330-30337: a drive fault `parkedMap.delete(root)` + `return null` — the root stays dirty and re-mints a fresh `shadowCasterPolicySteps` iterator at the next eval the wallet admits. There is no per-root fault counter: a persistently-faulting root pays a mint + partial walk on *every* subsequent pass (bounded per-pass only by `SHADOW_POLICY_PASS_MS` + starvation slots), forever — sustained burn that also crowds sibling roots' evals and never converges, the opposite failure shape to an unbounded park.

**Mechanism** — one bad root keeps re-faulting: a few ms of the per-pass shadow wallet burns on a guaranteed-failing walk each pass for the rest of the session — a persistent low-grade hitch tax, plus starvation pressure on legitimate policy evals.

**Fix sketch** — per-root fault counter in the parked map entry (`slot.faults`), epoch-keyed like `memo.sigFaults`: ≥3 faults per epoch → serve a conservative verdict (no-change) + leave the root dirty but re-eval-gated by the same jittered deferral the drawnCull consult uses. Warn once per root per epoch.

**Effort** S. **Impact** M. **Risk** L.

### F5 — post-retry starvation asymmetry: protected first-flight drain + hold-exempt degrade lane have no one-shot sync-twin degrade

**Evidence** — `driveProtectedFirstFlightDrain` (2300-2347): after `drainRetries ≥ 3` + 1 s cooldown the lane parks for the epoch. Consumers = the hoisted exempt cohort (rescue/on-glass rows the repartition exists to serve) — they sit in `_meshBuildQueue` unbuilt → meshless while the hold runs. The sync twin `owner._drainProtectedFirstFlightBuilds()` already exists (24054-24059) and is invoked at 2304 only when the Steps twin is missing — never as a post-retry degrade, unlike its siblings (`runCookSyncTwin('resident reattach', ...)` 2541, `runCookSyncTwin('presentation fence pack', ...)` 26477). Same shape in `driveHoldExemptDegrade` (3450-3499): cap 3 faults/epoch → returns 0 → mid-hold collect lost for the epoch (sync `enqueueMissingMeshBuilds` exists and is already used via `runCookSyncTwin('mesh-build enqueue', ...)` at 13003/13388/13617/16639). Starvation is bounded by hold end (post-hold drain at 2776-2803 + `_drainPendingMeshBuilds` covers the cohort), not by the epoch.

**Mechanism** — under a persistent fault, the two lanes that exist precisely to keep on-glass/hold-exempt rows building during the hold go silent for the whole hold — holes on glass where the machinery's own design says one bounded atomic rescue is acceptable (proven by the two sibling twins it added).

**Fix sketch** — after the retry cap, invoke the existing sync twins exactly once per epoch via `runCookSyncTwin('protected first-flight drain', ...)` / `runCookSyncTwin('hold-exempt enqueue', ...)`, mirroring 2537-2547 verbatim. Bounded: once per epoch, atomic, strictly better than silent starvation.

**Effort** S. **Impact** M (persistent-fault-gated; only inside the hold window). **Risk** L.

### F6 — no lane-fault telemetry surface: a persistently-faulting lane leaves the session deaf to graceful degradation

**Evidence** — every fault catch `console.warn`s per fault (up to ~3/epoch) then goes silent; `diagnostics.frameErrorCount`/`presentationStalled` cover only whole-frame kills (presentationRunner.js:1193+). A lane parked for N epochs produces zero signal on `state.render` — grep finds no `fault`/`park`/`degrad` surface on `state.render` except unrelated `parkedWarmRoots` (21947). A soak or live harness cannot distinguish "lane X parked and degrading" from healthy.

**Mechanism** — session deafness: the degradation machinery works as designed and hides persistent lane failure from every consumer that could report it — exactly the blind spot that let the original unbounded-park bugs live for dozens of waves.

**Fix sketch** — stamp a bounded `state.render.laneFaults` rollup at the shared catch sites (per-lane `{faults, parkedEpoch, lastAt}`), alongside the existing `entityViewSync`/`hlod`/`liveGeometry` diagnostic publications (25472-25535 precedent). Cheap O(1) writes at fault time only.

**Effort** S. **Impact** L-M (observability, not correctness — but the brief's item (c) assessment is: yes, the session is deaf). **Risk** L.

## Lane residuals summary

(a) **Unguarded `.next()` drives reachable from prepareFrame, re-enumerated post-F1-F8**: `syncEntityViews` (F1) is the last one — every other iterator drive on the presented path is guarded: rebind (ledger + 4 ms + bounded retry + durable latches), fence pack (ledger + 4 ms + 3-try cap + sync-twin degrade), census memo (per-pass drain gate + sigFault park), seam deferred-enter slice (deadline + ledger + per-entry try), `_openingFirstDrawIdentityIter`/`_openingFirstDrawDrain` (catch → done), coverage-class collect (catch → atomic lane), all live-lane slicers (ledger + skip caps + per-item try), hidden freeze/unfreeze mints (per-pass caps + per-mint try), `_drainMeshBuildQueue` (skeleton catch → `_drainBuildSeen`, per-row quarantine). The remaining unguarded surface is the F3 plain-call tail.

(b) **Parked-lane dependent starvation**: consumers enumerated — protected-drain cohort + hold-exempt collect (F5); rebind bounded by `_meshesVersion` re-arm (demand-coincident, no twin needed); fence-pack new rows bounded by packEpoch publication cadence + post-park sync twin (terminal: if the twin faults, frozen-poses is already the conservative direction); arrival reserve covered by bounded retry + sync twin; shadow-policy parked root is the inverse bug (F4).

(c) **Warn-once vs telemetry**: session is deaf — see F6.

(d) **Sync-twin degrade atomicity, ranked**: census first-mint + sync fallback — up to ~3 O(scene) walks in one presented pass, needs bounding (F2) — the only leg needing work; fence-pack twin O(activeCount) once/epoch — correctly atomic (partial pack = torn poses, illegal); keepGpu reattach twin — loading window only, off presented path; depth-compile twin — after-present lane, off presented path; keepGpu reconcile — W109-boot re-made it paced (16 ms slice), no longer atomic.

(e) **Remaining presented-frame walks by worst-case node count**: `syncEntityViews` O(visible+hidden rows) (inherent; F1) > fence pack O(activeCount) (gated stepped + degrade twin) > pool submissions O(submit subsets) (inherent) > activity classify O(entities) once/tick (F3 stale-serve fix) > occluder/aux/shadow-map syncs O(subset)/O(1) > bounded drains (2-4 ms + wallets) > `drawPreparedFrame` submit (inherent). No unbounded non-fault walk remains.

**Sibling-fix sweep**: `14523c688`/`991bd5b55`/`8e574707d` introduced no new presented-frame work — forced-spend wallet (decodeTaskBudget.js +37), census dedupe, keepGpu escalated re-mint, durable bind latches, metered private-clock slicers, `aborted:true` normalization (shadowDepthAdmission.js). All bounded or off-path.
