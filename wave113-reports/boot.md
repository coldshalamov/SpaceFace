# W113 audit — boot-loading lane

- **Audited HEAD:** `8dda7f22f` on `devin/1791416524-perf-w110` (PR #238). W113 builds `946b62781` + `8dda7f22f` already landed on top of the pinned `e83550298`; verified as part of the regression block.
- **saturated: false**

Three contract-preserving wins with concrete implementation paths remain (F-1 S-effort port, F-2/F-3 M-effort stepping), plus two L-M cleanups. None trade quality or touch sim determinism.

## Findings (ranked by magic-frame impact)

### F-1 — `disposeDetachedPackagedGroup` is a sync whole-tree teardown on ~12 packaged-commit sites — the visualOverrides fix was never ported here

**Evidence:** `src/render/visualFactory.js:4134` — `disposeDetachedPackagedGroup` runs a synchronous `group.traverse` disposing geometry + materials atomically. Call sites: 4295, 4324, 4336, 4341, 4371, 4383, 4387, 4393, 4403, 4426, 4439, 4449, 4472 — several sit mid-continuation after `waitForOpeningGraphPublicationRelease` (4439/4449) and on orphan legs after `driveLeg(record.renderPackage.createInstanceSteps(...))` (4295), i.e. inside presented beats. The same class in `src/render/visualOverrides.js:1000` already has `disposeDetachedPackagedGroupSteps` (128-node yields) routed through `queuePacedDetachedTeardown` (`src/render/partsLibrary.js:9175`) at :1027.

**Mechanism:** an orphaned/failed packaged-body commit tears down the fully built hull subtree in one atomic span inside the paced commit continuation — the exact mid-present hitch the detached-teardown pacing was built to kill.

**Fix sketch:** clone the visualOverrides pattern verbatim: mint `disposeDetachedPackagedGroupSteps` (or reuse the shared helper) and route all visualFactory call sites through `queuePacedDetachedTeardown`, preserving the return-path semantics (sites return `{status:'orphaned-before-swap'}` either way). The related best-effort sync `disposeDetachedObject(partial)` at partsLibrary.js:10808 (compose-aborted path) can ride the same queue.

**Effort: S. Magic-frame impact: M-H. Risk: L** — proven grammar upstream; disposal target is off-stage by construction (orphaned roots never publish).

### F-2 — Cook reveal/restore bursts run atomic over whole root arrays

**Evidence:** `src/render/renderer.js:16067` `firstFlightRoots.map((root) => revealSubjectForCompile(root))` and `:16107` `layerRoots.map(...)` inside `cookLiveSceneGpu` (:15218); the paired restores run fused in `finally` at :16079/:16115 (each `restore()` iterates its whole captured object-state). The Steps twin `revealSubjectForCompileSteps` (src/render/compilePresentSlice.js:213, 256-node yields + `applyRestore` generator) exists and is already driven under the paced compile path at renderer.js:15384.

**Mechanism:** on a wide first-flight cohort (dozens of protected rocks + layer roots) the cook pays N full subtree reveals in two atomic spans and N restores in two more — tens of subtree walks fused inside the cook beat, sandwiched between paced `prepareStartupGpuResidency` calls.

**Fix sketch:** drive `revealSubjectForCompileSteps(root)` per root with an inter-root yield (mid-array suspension is legal — restores are already-minted objects and ordering is preserved); same for the restore loops via the existing `applyRestore` generator. Sync `revealSubjectForCompile` stays as the rescue path.

**Effort: M. Magic-frame impact: M. Risk: L-M** — identical ordering, but must keep the finally-restore pairing exact per subject.

### F-3 — `instantiateFlightRootTemplate` is the largest fused leg inside `composedShipSteps`

**Evidence:** call at `src/render/partsLibrary.js:10284` runs before the generator's first yield (~10330). Inside it, fully synchronous: `createFlightTemplateRootInstance` (:11403) — `sourceRoot.traverse` + recursive `clone(true)` of the whole authored template + `templateRoot.traverse` cloning geometry + `cloneMaterialPreservingShaderHooks` per node; then per-recipe `instantiateRenderPackagePart` (:13014) — `createPackageInstance` + `packageRoot.updateMatrixWorld(true)` + the flat planNodes specialization loop + synchronous `bindInstanceMotion` (:13165, a second O(subtree) name-map walk per recipe); then `restoreFlightTemplateBindings` (:11434 — `findFlightTemplateObject` path resolution per binding key = subtree walks) + `kit.finalizeShip`.

**Mechanism:** on a template cache hit (continue-path player ship, mid-flight remounts) the entire authored-ship rebuild — clone, specialize, bind, finalize — executes inside ONE paced-leg step. For a large authored ship this is plausibly the biggest single-leg span left in the compose pipeline (tens of ms on SwiftShader-class hardware).

**Fix sketch:** mint `createFlightTemplateRootInstanceSteps`/`restoreFlightTemplateBindingsSteps` twins (the clone phases are over a detached subtree — mid-clone suspension is safe and invisible) and yield between per-recipe `instantiateRenderPackagePart` calls; alternatively hoist the call behind its own yield so it never fuses with the selection preamble (partial fix — the instantiate leg itself still needs stepping for very large templates).

**Effort: M. Magic-frame impact: M-H. Risk: M** — template mutation visibility is the only real hazard; the instance root is detached until return, so suspension between phases is safe.

### F-4 — `prepareStartupGpuResidency` resident-scan span + unstepped work-item seams

**Evidence:** `src/render/startupGpuResidency.js:714-739` — residency-stamped textures `continue` at :726/:734 *before* `await yieldToMain()` at :738, so a recook/F9/context-restore re-verify over a mostly-resident texture set runs the whole O(N) scan — `detachPackageTexture` + `textureProgress.update(index+1)` (DOM progress writes) per texture — as one atomic span. `createGeometryWorkItems`/`partitionGeometryWork` run unstepped between the paced collect family and the paced batch drain. The collect Steps family (140/221/283) yields per-256-visited-nodes only — it never gained the `>=2ms` wall-clock disjunct the W112 census family got, so 256 heavy nodes can still overrun a stride.

**Mechanism:** the recook path (the worst cold spot after the first present) pays an unbounded atomic scan proportional to the texture count, then two unstepped linear passes mint the work list.

**Fix sketch:** hoist a stride yield (per-256 or the `>=2ms` disjunct) into the resident-scan loop — the deadline check already lives there; wrap `createGeometryWorkItems`/`partitionGeometryWork` behind a single yield (they're linear scans, a boundary yield suffices — stepping internals is overkill); add the `>=2ms` wall disjunct to the three collect Steps generators (one-line each, mirrors census).

**Effort: S-M. Magic-frame impact: L-M. Risk: L.**

### F-5 — Sync per-subject traversals in publish/mount seams

**Evidence:** `hasUnresidentGeometry` (src/render/startupGpuResidency.js:318) sets a flag on first unready mesh but THREE.traverse keeps visiting every descendant — called per rebuilt mesh at renderer.js:25005/:25136/:25178 inside the view-sync/rebuild evaluation, so a mass-rebuild beat pays O(Σ subtree sizes). `detachedSubjectUploadsPending` (renderer.js:11771) runs `collectStartupTextures` synchronously inside `state.render.touchSubjectExactTarget`'s publish seam at :12371 — the async twin exists at :11776 but the sync collect runs first in the fast path.

**Mechanism:** each seam is individually small but they sit on hot mount/publish paths — during first-picture assembly, per-subject O(subtree) checks multiply across the cohort inside otherwise-paced legs.

**Fix sketch:** replace with a manual-stack early-exit walk (genuinely O(k) to first unready); memoize the residency verdict per mesh keyed on mount epoch so repeat rebuild checks are O(1); at 12371 prefer the async pending-check when the caller is already a paced leg.

**Effort: S-M. Magic-frame impact: L-M. Risk: L-M.**

## Regression notes — W112 machinery verified at `8dda7f22f`

Boot items (this lane's contracts):

- **F-1 PASS** — `_openingPublishDegradeVerdict = undefined` at renderer.js:27043 clears immediately before the mandatory post-settle republish (`drivePublishFirstPicture()` ~27045); memo read only inside the driver (:26973-4), written :26995.
- **F-2/F-3 PASS** — `collectOpeningEntityRootCandidatesSteps` (:1025) yields `%32 || >=2ms` (:1037-41); shadow twin (:1082) identical (:1089); `syncEntityViewsSteps` (:25704) shared `viewSweepNow`/`viewSweepStrideAt` clock, hidden + visible sweeps both `&127 || >=2ms`; `_openingFirstPictureUpgradePromisesSteps` (:26853) `%64 || >=2ms`.
- Publish leg well-sliced: `_publishOpeningFirstPictureSteps` (:26688) yields between every leg (rebind, fence-pack, view-sync, compose, shadow band).

Spot-checks on other lanes' W112 items:

- **lod F1 PASS** — `verdictSig`/`markSig`/`leftoverSig` = `lightSig ?? _shadowCensusForFrame()` at use (:29748/:29942/:30032); the W113 epoch gate `verdictStale` (:29950-56) + `verdictSig != null` (:29957) skip the deny on stale/unsigned — roots stay queued (safe direction).
- **lod F2 PASS** — unsigned collect breaks: `if (markSig == null) break;` :29800.
- **lod F5 PASS** — park entries stamp `lightSig: verdictSig` + `lightSigEpoch: shadowCensusEpoch()` (:29987-88).
- **hitches H1 PASS** — arm-vs-park gate `armFaultCount >= 3 || armNow() < _depthStageArmRetryAt` (:29575); `armSigEpoch` machinery (:29737, :29858, :29913) from `946b62781` present.
- **hitches H2 PASS** — `suppressedBricks` counted at bloom.js:2063/2067.
- **hitches H3 PASS** — `noteBusHandlerError` wired at eventBus.js:66/328/377/445 (sliced + presentation drains).
- **popin P2 PASS** — `forcedFrameSpend()` consults at 25 sites; `8dda7f22f` added post-unit debits at the consult sites.

## Largest remaining atomic boot stretches (hunt e), ranked

1. `instantiateFlightRootTemplate` leg (F-3)
2. Cook reveal + restore bursts (F-2)
3. `disposeDetachedPackagedGroup` sites (F-1)
4. Resident-scan span + work-item mint (F-4)
5. `runCookSyncTwin` rescue — deliberate once-per-epoch, documented contract (not a finding)
6. `_bakeEnv` PMREM — contract-required synchronous render (not a finding)

Audit-only per brief; no code touched, no app run. `git show`/`git grep` used against the pinned SHA (worktree checkout hangs on this host).
