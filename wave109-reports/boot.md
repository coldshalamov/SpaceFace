# W109 audit — boot-loading lane

Branch audited: `devin/1791064509-perf-w60` @ `991bd5b55` (contains W108 log `2e163093f` + W109-lod `14523c688` + W109-popin `991bd5b55`).

## Findings (ranked)

### 1. keepGpu one-shot degrade drains `_reconcileMeshesSteps` atomically inside the loading window — the worst remaining un-sliced boot stretch (hunt item a)

**Evidence:** `src/render/renderer.js:2573-2578` — the epoch-keyed degrade calls `runCookSyncTwin('keep-gpu reconcile', () => owner.reconcileMeshes({keepResidentSet:true}))`. `reconcileMeshes` (`23484-23496`) abandons the paced iter and drains `*_reconcileMeshesSteps` inline: `for(;;) { step = it.next(); if (step.done) return ...; }`.

**Blast radius during restore:** the kept resident set is the whole cooked sector — exactly the fat case the degrade exists for. The generator body (`23498-23668`) runs, in one task:
- first `_meshes` walk with per-row release/eviction verdicts (`23568-23598`),
- `warmNearbyLedgerRowsSteps` refill (`23611`),
- `collectMeshPresentationEntitiesChunked` — O(entities) census (`23615`),
- `kickDecodeRunwayAssetsSteps` (`23616`),
- `enqueueMissingMeshBuildsSteps` (`23617-23627`),
- `_drainMeshBuildQueueSteps(buildBudget)` (`23629-23631`) — up to `RUNTIME_MESH_BUILD_BUDGET` = 8 whole-ship boundary builds, each an atomic spec→compose→material mount (individually 5-30 ms on fat authored pieces),
- a second `_meshes` bind/upgrade walk (`23634-23648`),
- `_pruneMotionTrackerRecordsSteps` (`23654-23659`).

The paced form spreads this over many shell ticks at ~4 ms — so the inline span is tens-to-low-hundreds of ms of DOM-blocked work, fired ~1 s into the parked epoch, i.e. a visible Continue-bar freeze in the precise window the keepGpu lane exists to smooth. (Sibling 'resident reattach' degrade at `2532-2537` is **safe**: `reattachResidentGpuMeshes` → `mintResidentReattachSweep` since `_residentReattachStepped === true` at `10730` — re-mints the paced sweep, no inline drain.)

**Terminal wrinkle:** `_reconcileMeshesSteps` clears `_meshReconcileDirty` at its head (`23507`, first `next()`). If the sync drain throws the same persistent fault that parked the paced lane, `runCookSyncTwin` swallows it — dirty stays cleared **and** `_keepGpuReconcileDegraded` is latched, so the reconcile is permanently lost for the epoch (the paced-lane catch explicitly re-dirties at `2598-2600`; the degrade path has no equivalent). Dropped sweeps re-arm only on the next sector enter (`_meshReconcileDirty = true` at `18628`/`18659`).

**Fix sketch:** replace the inline drain with an escalated-paced re-mint — re-drive `render._reconcileMeshesSteps` across shell ticks inside the keepGpu window at an escalated wall-slice (e.g. 16-32 ms/tick, still far under the ~210 s authored-visuals gate) — completion guaranteed without the atomic span; or drive the same iter with a `yieldToBrowser()`/shell yield between legs. Re-dirty `_meshReconcileDirty` on a thrown degrade so a persistent fault still leaves the parked state honest.
**Effort:** M · **Magic-frame impact:** M (fault-gated, but hits the most fragile window hard) · **Risk:** low-M (leg order preserved — same generator, only scheduling changes).

### 2. Publish re-mint loses the consumed publication — an interrupted whole-set rebind leg never completes (hunt item b)

**Evidence:** `_publishOpeningFirstPictureSteps` (`25803-25808`): `const publication = this._presentationPublisher.consume()` — the whole-set rebind mints only `if (publication && publication.rebuilt) yield* this._rebindPresentationMeshesSteps()`, else the spawned-slot leg. `consume()` is incremental (`presentationPublisher.js:92-101` `resetResult`, `spawnedSlots.length = 0`, `lastAppliedSequence` advanced per consume). `drivePublishFirstPicture` (`26018-26040`) closes the faulted iter and re-mints once; on a second fault `runCookSyncTwin('opening-first-picture-publish', ...)`.

**Mechanism:** iter #1 consumes a rebuilt/remapped publication and faults inside `yield* this._rebindPresentationMeshesSteps()` — a private sub-iter that dies with the parent. The re-mint's consume() returns `rebuilt:false/remapped:false` (and an empty spawnedSlots) → the fresh iter takes the spawned-only leg → the torn walk's unbound tail **never** re-binds: `world.meshRefs[slot]` stays null and any `doomed` bit the feed set stays set (`bindMesh` is what clears it, `presentationWorld.js:809-816`) → visibility/doom verdicts treat those entities as absent → meshes invisible or unposed on the first presented frame — the exact defect the pass exists to prevent. Worse, there is **no self-heal channel**: the per-frame drive at `26219-26235` mints `_presentationRebindIter` only when *its own* consume reports `remapped===true || (rebuilt && appliedDelta!==0)` — the flags were already consumed by the torn publish iter, so the owner-parked drive never learns a rebind is owed. Same loss on a torn `_bindPublishedPresentationMeshesSteps(spawnedSlots)` — slots announced by the dead consume are never re-announced.

**Idempotency audit of the re-run legs (all safe):** consume (incremental), `_advancePosePackEpoch` (stable per sectorId), `_snapshotSourceTick`/`_publishSnapshotFenceStats` (same-tick restamps), fence pack (re-packs live world), `publishActivityFrame` (reclassifies), `cam.follow`, `syncEntityViewsSteps`, both `updateMatrixWorldSteps`, and the pool/shadow band (`_syncAuthoredInstanceSubmission`, `_syncAsteroidInstanceSubmission`, `prepareActiveShadowCamera`, etc. — re-runnable syncs). The bind legs are idempotent to **run**; the non-idempotent part is the branch **decision**, gated on one-shot consume state. Upgrade-promises re-mint is clean (no consume — census + `requestAuthoredUpgrade` are deduped/idempotent).

**Related hole:** the per-frame rebind drive's own fault (`26263-26268`) parks on `_rebindFaultEpoch` for the rest of the epoch with **no** bounded retry or one-shot degrade — a *transient* throw inside the longest leg drops the whole tail until the next enter/restore, unlike every sibling lane that got a degrade in W107/W108.

**Fix sketch:** make the bind obligation durable instead of consume-derived — e.g. an owner latch `_openingRebindOwed`/`pendingRebind` set when any consume reports `rebuilt`/`remapped` (or when a bind leg is torn), cleared only on leg completion; the re-minted publish iter and the per-frame mint gate branch on `publication-flags || latch`. Give the faulted rebind a bounded in-epoch retry (like `_reconcileFaultRetries`) or one-shot degrade instead of epoch-fatal park. Optionally snapshot a spawned-delta cursor so a torn spawned-leg re-covers unbound tail rows.
**Effort:** S-M · **Magic-frame impact:** M-H (wrong-content first frame — missing/unposed entities — worse than a stall; fault-gated) · **Risk:** low (rebind is already idempotent per row; latching only preserves intent).

### 3. Depth-compile sync degrade discards the drift-retry contract and forwards non-`aborted` stale shapes — callers park roots never compiled (hunt item c)

**Evidence:** `driveCompileShadowDepthPipelines` (`572-635`): the stepped drive retries drift (`stale`) up to 4 attempts under refreshed `lightSigEpoch`/`lightSigOverride` (`619-631`, `aborted:true` on exhaustion at `634`). But the `iter.next()` catch at `608-613` returns `runCookSyncTwin('compile-shadow-depth-pipelines', () => compileShadowDepthPipelines(depthOpts), {skipped:true,...aborted:true})` **immediately** — the remaining attempts are discarded, and the sync run inherits `depthOpts.lightSigEpoch`/`lightSigOverride` minted pre-fault (`584-601`), making a `{stale:true}` result likely under live drift. The ceremony's skip shapes are inconsistent: `'light-census-drifted-mid-pass'` (`shadowDepthAdmission.js:658`,`:709`) and the degraded-compile path (`:728`) carry `stale:true`/`subjects:0` with **no** `aborted:true`, unlike the drive's own terminal returns (`:634` aborted).

**Mechanism:** the deferred-leg audit at `28590-28603` treats `legResult.aborted === true` as "no marks landed → requeue". A degraded `{stale:true}` reads as NOT aborted → the audit evaluates mark verdicts on roots that were never compiled → parks them on the backed-off `sfDepthUndrawableCycles` cadence under an unearned "undrawable" verdict → cold depth links resurface in early flight (the in-frame compile stalls this machinery exists to kill). Divergent degrade policy too: the sibling post-opening drive (`17156-17185`) never calls the sync twin — it returns `{skipped:'depth-compile-drive-failed'}` (also missing `aborted:true`, but at least doesn't forward stale shapes).

**Fix sketch:** normalize the degrade's result at `611` — if the sync run returns `stale` (or any skipped shape that left subjects un-compiled), return `{skipped:true, reason:..., aborted:true}` so the parked/retry bookkeeping treats it like the drive's own exhausted loop; or move the sync-twin fallback *inside* the attempt loop so remaining retries run under refreshed epochs (bounded by the same 4-attempt contract). Align the `aborted` flag on the skipped shapes in `shadowDepthAdmission.js` (`:649`,`:658`,`:709`,`:728`) so callers can gate consistently.
**Effort:** S · **Magic-frame impact:** M (wrong park verdicts → in-frame depth compiles later) · **Risk:** low (flag/classification change; no behavior change on the happy path).

### 4. Private-clock-only slicers in `prepareFrame` — rebind + fence-pack drives (plus publisher internals, shadow census) stack un-metered ms inside restore ticks (hunt item d — biggest un-metered boot cost)

**Evidence:** `_presentationRebindIter` drive (`26255-26277`) and `_fencePackPending` drive (`26327-26362`) each self-bound on a private 4 ms clock only — the whole `26250-26395` span contains **zero** `pacedFrameSpend`/`notePacedFrameSpend`/`forcedFrameSpend` references (grep-verified). The publisher's internal parked iters are private clocks too (`presentationPublisher.js:132-141` collect, `168-176` second collect drive, `221-229` apply — each ~4 ms), as is `_shadowCensusForFrame`'s pendingIter drive (`28192-28200`).

**Mechanism:** during a keepGpu restore, one `prepareFrame` stacks: consume internals (≤~8 ms private) + rebind ≤4 ms + fence-pack ≤4 ms + census ≤4 ms — none consult the shared wallet nor debit — on top of the paced lanes in `serviceRenderMeshResidency` (reconcile/poll/protected-first-flight/reattach ~4 ms each + flush + remeasure). A single loading-shell tick can carry ~20-35 ms of renderer work → the loading bar visibly stutters in the exact window this machinery exists to smooth. The wave-67/99 ledger contract is that every slicer both consults `pacedFrameSpend()` and debits `notePacedFrameSpend(real)` — these drives do neither (the W99 work paced them per-leg but left them un-metered as a class).

**Fix sketch:** route each drive through the shared ledger — consult `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` at loop top (park instead of stepping) and `notePacedFrameSpend(now()-start)` at exit; equivalently for the publisher's internal drives (or thread a wallet through `consume()`). Both drives already tolerate parking, so the semantics carry.
**Effort:** S-M · **Magic-frame impact:** M-H (mechanism-class fix on the hottest boot path) · **Risk:** low-M.

### (d) Remaining atomic boot stretches — ranked

1. `_publishOpeningFirstPicture` sync degrade (`26032`) — fence pack O(active) + `syncEntityViews` O(entities) + 2× forced `updateMatrixWorld(true)` + authored/asteroid submissions + shadow frustum — biggest single-task stretch (two-fault gated).
2. keepGpu reconcile degrade — finding 1 (the only real-world unconditional-enough offender after a single fault + 1 s park).
3. `compileShadowDepthPipelines` sync degrade (`611`) — one atomic reparent→render→mark→restore private render (bounded by GPU submit but real).
4. `warmScenePipelinesForRenderTarget` (`bloom.js:758-815`) — atomic `subject.traverse` + forced `updateMatrixWorld(true)` + forced render inside the context-restore continuation (`10098-10116`); the render is inherent, the surrounding walk/compose could yield.
5. `getActivityFrame`/`classify` O(entities) inside the publish leg (`25836`) — unyielded per settle pass (smallish but unconditional).
6. `_bakeEnv` PMREM convolve — one render, inherent; already drained only at veiled seams.
7. `enterSector` generator — known-deferred BOOT-F3(a), not re-reported.
8. `admitNextUpgradeJob` sort — O(jobs·log jobs) with per-job memoized verdicts (`partsLibrary.js:7311-7378`) — bounded.

## Regression notes — W108 machinery verified on HEAD `991bd5b55`

- **serviceFaultEpoch composite** — `2285-2289` returns `` `${enter}|${contextRestoreSeq}` ``; `state.contextRestoreSeq` minted once at `9937` in `deferWebGlContextRestore` and nowhere else (grep-verified). All `_*FaultEpoch` stamp+gate pairs on the named lanes (protectedFirstFlight `2303/2321`, reconcile `2549/2567/2600`, residencyPoll, residentReattach `2484/2510/2529`, rebind `26218/26266`, holdExempt head+4 sites `3520/3578/3613/3687/3706`, keepGpuReconcile `2550-2578`) read the composite consistently. Two deliberately narrower keys verified consistent-by-design: `_arrivalReserveFaultEpoch` keyed on `enterSerial` (the reserve iter's snapshot is enter-scoped — a context restore does not invalidate capacity tallies; re-arms on every sector enter) and `_fencePackFaultEpoch` keyed on `packEpoch` (pose-stream epoch — fence contents are CPU-side and survive context loss).
- **drawnCull FIFO drop fix** — `visualCullRadius.js:139-144` clears `drawnCullForceQueued` on dead/unparented drops before `continue`; re-mounted rows can re-enter; stamp-clear does not double-queue (stash at `159-176` + consult path `211-223` verified).
- **Dispose headroom clamp** — `2144-2148`: `min(max(budgetMs*2, DESPAWN_DISPOSE_BUDGET_MS), max(budgetMs, headroom))` — equivalent refinement preserving both ceilings (escalates to 4 ms with headroom, stays at budget on a spent wallet); warm-lane floor unchanged.
- **`_flushMeshReleasePending` metered** — `22772-22834`: paced-spend gate + `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS` + forced wallet, registry-granular cursor over the five motion/dressing registries, 4 ms wall, re-pends on throw or residual size; `notePacedFrameSpend`/`noteForcedFrameSpend` debits present.
- **Publish/upgrade drive belts** — `26018-26040`, `26050-26071`: `iter.next()` under try → `closeCookStepsIter` + warn → exactly one re-mint → degrade to sync twin / `[]` wait — bounded, no unbounded re-mint; `settleWithin` never sees a rejection.
- **Parked-reconcile poll fall-through** — `2989-3071`: `reconcileWorked` set only on live mint/drive; `if (reconcileWorked) return 'full'` at `3070` — a parked epoch reaches the residency-poll section every tick.
- **PMREM cache** — `23401-23406`: `_pmremGenerator` keyed on `pmremContextSeq` from `contextRestoreSeq`; re-mints on restore.
- **keepGpu degrade wiring** — `2549-2578`: ~1 s gate via `_keepGpuReconcileDirtySince`, epoch-keyed `_keepGpuReconcileEpoch`/`_keepGpuReconcileDegraded` latches reset across windows, one-shot only (verified; the atomic blast radius is finding 1 — the machinery works as specced).
- **Hitches fault parks (a-g)** — all verified: census drive catch → `closeCookStepsIter` + superseded++ + serves memo.sig (`28217-28227`), sync fallback epoch-park (`28243-28262`); rebind catch → `_rebindFaultEpoch` + mint gate (`26218`, `26266`) — spawned leg intentionally unparked per its per-row-idempotent contract (`26215-26217`); 4 hold-exempt sites return 0 + head gate suppresses re-mint per epoch; `_fencePackPending` catch does NOT stamp `_snapshotSourceTick`/`_publishSnapshotFenceStats` (`26334-26351`), 3-try cap keyed on packEpoch (`26310-26311`); `driveShadowPolicySteps` catch → `parkedMap.delete(root)` + `return null`, root stays dirty (`30197-30255`); `_arrivalRosterIter` catch → `_arrivalReservePending=true`, reserve-only iter under 4 ms slice + 3-retry bound (`2897-2982`); clearance analytic box Y band centers on `mesh.position.y` (`4329-4351`) with posX/posY/posZ re-key (`4264-4298`).
- **Bounded in-epoch retries (W109-lod `14523c688`)** — `_reconcileFaultRetries`/`_reconcileRetryAt` twins verified on reconcile/poll/reattach/reserve/protectedFirstFlight lanes; `driveHoldExemptDegrade` four-site epoch parks + head gate verified; W109-popin forced-spend wallet + hold-exempt degrade lane (`3520+`, `2062+`) verified consistent.

## Verdict

`saturated: false` — four mechanism-level defects of material value remain: an un-sliced atomic reconcile inside the keepGpu loading window, a consume-blind re-mint that drops whole-set rebinds on the first presented frame, a depth-compile degrade that parks un-compiled roots on unearned verdicts, and a class of un-metered private-clock slicers stacking inside restore ticks.
