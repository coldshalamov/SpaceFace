# Wave 117 audit — boot-loading

HEAD audited: `7f033f1e4` on `devin/1791416524-perf-w110` (W116 fully landed: lod `435e53a8d`, popin `6b4e5adb3`, boot `eaed1e7af`+re-pin `319cceb94`, hitches `e588f0ff4`).
Golden hash contract unchanged (`0b33dde…`), zero quality degradation allowed.

`saturated: false`

## Findings (ranked)

### F1 — Flight-template entry disposable while a suspended instantiate still walks it

- Evidence: `src/render/partsLibrary.js:10572` reads `flightRootTemplates.get(templateKey)` and hands it to `instantiateFlightRootTemplateSteps`, which suspends through `createFlightTemplateRootInstanceSteps` (`:11863`) and the per-recipe instantiate loop (`:11878-11911`, yield at `:11884`) — `retainFlightRootTemplate(entry)` is only called at `:11959`, near the generator's END. During the whole mid-yield window the entry sits at `instanceRefs === 0`.
- Mechanism: `finalizeFlightRootTemplateIfUnused` (`:12214-12236`) disposes every geometry/material and `entry.root.clear()`s when `disposed !== true && cacheHeld !== true && instanceRefs === 0`. `removeFlightRootTemplate` (`:12192-12199`) clears `cacheHeld` then calls finalize — reachable from the same-key re-store (`storeFlightRootTemplate` `:12182`), the cache-limit eviction (`:12183-12187`), and the cached-null removal (`:10577`). A suspended instantiate mid-clone therefore watches its source root get cleared and its geometries disposed; the half-built instance *aliases* the freed geometry objects (Object3D.clone shares geometry/material refs). Two same-loadout ships admitting concurrently — second wingman, two wasps in a sector — or one eviction mid-admission hits this.
- Player-facing: the concurrent ship pops in with holes / disposed GPU buffers, or the instantiate dies mid-path and burns a whole composed-ship admission.
- Fix sketch: hoist `retainFlightRootTemplate(entry)` to the head of `instantiateFlightRootTemplateSteps` (or to the `:10572` cache hit), releasing on every early-return path; alternatively stamp `entry.instantiating++` at entry and gate `finalizeFlightRootTemplateIfUnused` on it.
- Effort: S. Magic-frame impact: H (a real pop-in/holes class on a live presented owner). Risk: M — the retain must release on all four early-returns (`:11864`, `:11879`, `:11887`, `:11917`).

### F2 — Sync twin `disposeDetachedObject` leaves root hooks unfenced

- Evidence: `src/render/partsLibrary.js:16934-16938` — `admissionStandInRelease()` and `disposeSitePresentation()` are invoked bare; the Steps twin at `:16958-16970` fences both with `dedupWarn('teardown:standInRelease' | 'teardown:sitePresentation')`. The sync twin is the declared fallback when `queuePacedDetachedTeardown` declines (`:11119-11121` compose-abort path, `:3354` capsule teardown).
- Mechanism: a throwing stand-in/sitePresentation hook escapes the sync disposer and vetoes the entire remaining per-item geometry/material walk for the whole subtree — the throw also propagates into the caller's abort leg. The Steps twin's fence exists precisely because these hooks are registration-bearing and can throw on a mid-admission tree.
- Fix sketch: wrap both calls in the same try/catch + `dedupWarn` shape as the Steps twin.
- Effort: S. Magic-frame impact: M (leak class — a whole detached subtree undisposed, plus an escaping throw). Risk: S.

### F3 — Registration-bearing teardown hooks warn-only; no laneFault / defect bit

- Evidence: `disposeObjectNode` fences (`src/render/renderer.js:32178-32212`) emit `stormWarn('teardown:<name>')` and the detached twins (`partsLibrary.js:16958-17072`, `:17095+`) emit `dedupWarn` — none stamp `noteLaneFault`. The registration-bearing set, enumerated per hunt (b):
  - `teardown:residency` — `releaseAuthoredAssetResidency` throw → the boundary's residency pins stay held forever → over-retained owner assets, wrong-owner retention across sector epochs.
  - `teardown:preparedBoundary` — prepared-registry disposer throw → stale prepared root retained; interferes with the next admission's operand-B bookkeeping.
  - `teardown:ownerInstances` — `releaseOwnerInstances` throw → pool slots leaked → package pool wedges over time.
  - `teardown:lodRetained` — retained LOD subtree leak → GPU resources held + a stale re-attach source.
  - `teardown:authoredMotion` + `authoredMotion:driverDispose` (`authoredMotion.js:242-287`) — entity-keyed controller registrations survive → `updateAuthoredMotion` keeps animating a corpse root and pins entity refs.
  - `teardown:standInRelease`, `teardown:cradleGuard` — stand-in/keeper-mask registrations survive.
- Mechanism: a permanently-wedged residency/pool/registry is invisible to the `laneFaults` rollup that hitches-P4's parking and the audit probes rely on; today only the presented-tail lanes (`presentedTail.<label>` `renderer.js:2290`, `entityViewRow` `:2260`) fault-count. The cosmetic per-item geometry/material disposes can stay warn-only — they're self-limiting.
- Fix sketch: `noteLaneFault(owner.state, 'teardown.<name>', parked)` inside each registration-bearing warn path; `parked = true` for residency/ownerInstances.
- Effort: S-M. Magic-frame impact: M (observability → the defect stops being silent). Risk: S.

### F4 — `handleAuthoredBoundaryAdmissionError` post-cleanup re-check is a weaker predicate than the entry gate

- Evidence: `src/render/partsLibrary.js:9119/9130` gates on `staleAuthoredRunVerdict` (epoch mismatch OR `isAbortedStalledAdmission()`); after the three cleanup awaits (`:9136-9141`) the re-check at `:9143` uses only `isAuthoredAdmissionBoundaryCurrent(options) || signal.aborted` — and `isAuthoredAdmissionBoundaryCurrent` (`:8916-8919`) consults just `options.isAdmissionBoundaryCurrent()`, never `isAbortedStalledAdmission`.
- Mechanism: a run that goes stall-aborted during the cleanup awaits while the boundary stays current — owner died without a re-admission re-mint — passes the `:9143` re-check and continues into the verdict classification / warn leg on a stale run. Exposure is narrowed by downstream fail functions re-gating individually (`failAuthoredPlaceAdmission` re-checks at `:4371`), so the residual is the classification/warn/verdict leg itself.
- Fix sketch: mirror `staleAuthoredRunVerdict(boundary, options)` at the post-cleanup seam.
- Effort: S. Magic-frame impact: L-M. Risk: S.

### F5 — Deferred publish closures carry no epoch/identity guard

- Evidence: `installPreparedBoundaryPublisher` (`src/render/partsLibrary.js:9332-9341`) wraps `publish` behind only a `published` latch; `publishPreparedAuthoredBoundary` (`:9323-9330`) fires whatever currently sits in `boundary.userData.__publishPreparedAuthoredBoundary`. The ship/place/capsule publish closures write `authoredAssetState='authored'` (`:3481`, `:4515`, `:9921`), `setPresentationAdmission(ready)`, `activateRenderPackagePoolAdmission` (`:9912-9914`), `touchAuthoredExactTarget`, `primeDrawnCullStamps`, `onSwap` — none re-checks that the installing run is still the boundary's current admission.
- Mechanism: reachable ordering — old run commits with `deferBoundaryPublication`/`ceresCradleAutomaticPublication` → a newer admission starts and dies before its own commit installs a replacement publisher → a later `updateCeresCradleLayout` (`:4011-4013`) or the renderer reveal seam (`renderer.js:25553`) fires the stale publisher, stamping `authored`/`ready` and activating pool admissions for a run the boundary no longer owns. `markAuthoredBoundaryForReadmission` deletes the slot (`:2831`) but only on the re-admit path — a mid-flight failure that never re-mints leaves the stale publisher live.
- Fix sketch: capture `boundary.userData.admissionEpoch` (or the run's minted epoch) in the wrapper at install time; return false without publishing when it no longer matches.
- Effort: S. Magic-frame impact: M (verdict-write corruption on a narrow window). Risk: S-M.

### F6 — Suspended `attachAuthoredMotionDriverSteps` abandons constructed drivers with no teardown path

- Evidence: `src/render/authoredMotion.js:152-289` — driver constructions (`createTallyThreeVisualDriver`, `createRedKiteThrusterVisualDriver`, etc.) sit at the yield seams (`:177-198`); `activate()`, the `detach` closure, and `root.userData.detachAuthoredMotion` only mint at the end (`:236-287`). There is no try/finally around the bank.
- Mechanism: on `steps.return(undefined)` at the per-slice stale gate (`partsLibrary.js:11157`), drivers already constructed are reachable only through generator locals — the closure never formed, and the detached-partial teardown (`disposeDetachedObjectSteps` → `detachAuthoredMotion` hook) can't find them because `root.userData.detachAuthoredMotion` was never stamped. If any constructor registers entity-keyed or external state at construction time (the workfleet-motion / propulsion drivers are the candidates to check first), an abandoned bank leaks live registrations on a dead tree. If all constructors are pure traverses, the residual is GC-able objects only — still worth the fence for the invariant.
- Fix sketch: wrap the driver bank in try/finally that disposes constructed drivers on generator return/throw; or move all external registration into `activate()` so an un-activated bank is provably inert.
- Effort: M. Magic-frame impact: M (leak class; L if all constructions are pure). Risk: S-M.

### F7 — Remaining atomic spans inside boot/admission/publish, ranked

1. **Ship commit graft+publish tail** — `partsLibrary.js:9870-9939`: `boundary.remove/add`, `invalidateShadowCasterPolicy` (O(subtree) policy-mark traverse), `unregisterPreparedAuthoredAdmission`, `setActive`, `carryAdmittedOnceStamp`, userData stamps, then `publish()` → `touchAuthoredExactTarget(authored.root)` (residual variant compile across the whole authored hull), `activateRenderPackagePoolAdmission`×N, `recordCeresWorkfleet/LatchAuthoredSource`, `primeDrawnCullStamps` (`Box3.setFromObject` O(subtree)), `setPresentationAdmission`, `onSwap`. Largest authored-commit atomic span left. **Impact H** — the remaining authored-commit hitch on ship surfaces.
2. **Place commit graft+publish** — `:4474-4534`: same shape plus `layoutGuard.publish` + Ceres records. **Impact H** on place surfaces.
3. **Capsule commit** — `commitAuthoredCargoCapsuleBoundary` `:3434-3502`: the whole commit is one atomic span incl. `invalidateShadowCasterPolicy`, `primeDrawnCullStamps`, and the publish touch — no paced legs at all. Smaller trees, so **Impact M**.
4. **Atomic installs embedded inside stepped builds** — `installAuthoredLod` + `root.userData.updateLod('lod0')` (`:4910-4911`, full-subtree LOD binding + initial pick), `centerAuthoredPlaceRoot` (`:4901`, Box3 measure), `installWorldSitePresentation` (`:4905`), `normalizePlacePropBindings` (`:4900`), `installWholeShipLodFamilyController` (`:9075`), and the authoredMotion atomic tail (`authoredMotion.js:199-289` — two more driver traverses + `activate()` + userData stamps). Each is an un-yielded O(subtree) span inside an otherwise-paced generator — the Steps twin yields between legs, not within. **Impact M** each.
5. Smaller: `markReadableFallbackLayer` traverse (`:9996-10004`), `settleAuthoredShipToProceduralFallback`, `registerPreparedAuthoredAdmission`. **Impact S-M**.
- Fix sketch: hoist `touchAuthoredExactTarget`/`primeDrawnCullStamps`/pool activation behind the deferred publisher (or split publish into paced legs like the W113 publish-closure pattern); convert the named installs to Steps twins where their subtree is authored-scale.
- Effort: M. Risk: M (publish ordering is contract-bearing — pool activation and `authoredAssetState` must stay one transaction per `:9321-9322`).

## Hunt-item dispositions

- **(a) un-gated yield seams** — the three authored commit legs are now fully covered: build drivers re-gate staleness per slice (`partsLibrary.js:11096-11126`, `:11154-11156`); every authored path re-gates post-build and pre/post-wait (capsule `:3315`/`:3382`, place `:4234`/`:4333`/`:4464-4473`, ship `:9036`/`:9795`/`:9848`); `disposeOwnedPreparedBoundary` (`:9314-9319`) operand-B-matches the disposer slot. Residuals: F4 (weaker predicate at one seam) and F5 (deferred publisher has no epoch guard). Not re-verified this wave: the packaged path (`attachPackagedBody` `visualFactory.js:4181`, `visualOverrides.js:1156+`) — earlier waves' commit-orphan legs cover it; a targeted pass is a reasonable next-audit item.
- **(b) fence observability** — F3. Registration-bearing hooks enumerated above; cosmetic per-item geometry/material disposes correctly stay warn-only.
- **(c) stepped-leg interleaved mutation** — F1 (template census) and F6 (driver bank). Checked-clear: `staticBatches` collectors are build-local (`createStaticBatchCollector(root, bindings)` at `:3571`/`:4839`/`:10622`) — no cross-drive mutation class through the collector. Contained: keeper-mask mid-yield `visible=false` partial state (`ceresCradleLayoutVisuals.js:35-78`) — the root is unpublished until commit and abandoned partials are disposed; only a concurrent parked-root census could observe the half-masked tree (low severity). Also enumerated: `disposeDetachedPlaceFallback`/`...Steps` (`:16995-17072`) and `disposeObjectNode` never invoke `admissionStandInRelease` — only the generic detached-object disposers do (`:16934`/`:16958`); if a place fallback or live boundary can carry a pending stand-in, it is never released on those paths — worth a stamp-presence check.
- **(d) atomic spans** — F7 ranking above.

## Regression verification — W116 machinery (all PASS, verified at `7f033f1e4`)

- **lod F1** `casterDepthMarkAnyCurrent` (`src/render/shadowDepthAdmission.js:408` → `casterDepthMarkCurrent(caster, mark.l, camera)`) proves a mark under its own stored sig; the verdict's `allUnmarked` loop consults it at `renderer.js:30382` and the leftover eval at `:30478`; a dead-sig mark returns null → counted unmarked. PASS.
- **lod F2** all four park re-key sites stamp the epoch the recorded sig belongs to: unsigned-window re-key `:28953-28967` and drift-keep re-key `:29017-29020` stamp `memo ? memo.epoch : shadowCensusEpoch()`; mint sites `:30206`/`:30286`/`:30413-30414` stamp `lightSig != null ? armSigEpoch : memo.epoch`. PASS.
- **lod F3** unstagedCache consult re-proves membership by ancestor walk (`renderer.js:30128-30160`, `for (let p = mesh; p; p = p.parent)`), drops corpses from `cache.meshes`, and runs inside `_armDepthStage` (`:29791`) — arm-cadence amortized, not on the presented-frame hot path. PASS.
- **popin P1** `gltfParsePending = {visible, deadline, ambient}` (`decodeTaskBudget.js:297`); `regradeGltfParse` (`:429`) splices the in-queue record between lanes via `gltfParseEntries` — a join port, no duplicate enqueue. PASS.
- **popin P2** both decode drains' settle tails debit `noteForcedFrameSpend(tail)` when forced — parse drain `:377-391`, compile drain `:511-519` (0 < tail ≤ 24 ms window). PASS.
- **popin P4/P5** `pruneProbation` records `{root, set}` per member (`renderer.js:29899-29956`); the strike loop `continue`s through ALL newly-dead members per eval; offered-but-never-drawn members are prune-eligible via `undrawnLedger` real-draw evidence; rescue consult fails closed on stale memo (`:29894-29897`). PASS.
- **boot F1/F3** `commitAuthoredPlaceBoundary` post-yield gate `:4464-4473` re-checks `!boundary.parent || epoch mismatch || isAbortedStalledAdmission || signal.aborted || admissionEntity.alive === false` between `freezeStaticTransformRootMarked` and the fallback remove, cleaning up via `installedPreparedDisposer || disposePreparedPlace`; all three authored paths re-gate after the resolved prepared arrives (capsule `:3315`+`:3382`, place `:4234`+`:4333`, ship `:9036`+`:9848`). PASS.
- **boot F2/F4/F6/F7** `disposeObjectNode` fences every root hook with `stormWarn('teardown:<name>')` (`renderer.js:32178-32212`); `disposeDetachedPlaceFallback` + `disposeDetachedPlaceFallbackSteps` fence per-item disposes in both sync and Steps forms (`partsLibrary.js:16995-17072`); authoredMotion's 11 driver hooks fenced via `detachDriver`/`dedupWarn('authoredMotion:driverDispose')` (`authoredMotion.js:242-287`) with `__authoredMotionDeclined` stamped on retired-decline/propulsion-veto (`:220`/`:224`); Steps twins paced at declared strides: `attachAuthoredMotionDriverSteps` (yield per driver construction), `cookFlightProductSteps` (`flightProductCooker.js:27-35`), `createCeresCradleKeeperMaskSteps`/`installCeresCradleLayoutGuardSteps` (yield* mask, `ceresCradleLayoutVisuals.js:35-93`), `createFlightRootTemplateEntrySteps` subtree (`partsLibrary.js:11361` → collect `:11370` → create `:11371` → strip `:11372`, sanitize traverse yields /128 at `:11420-11457`), `instantiateFlightRootTemplateSteps` (`:11851`), `staticBatches.flushSteps` chain `:13199` → `:13289` → `:13253` → `:13368`. PASS.
- **hitches P1/P3** dedup keys are static call-site literals with the ID in trailing args: `encounterDirector/ambient-predation-tick` (`:405`), `encounterDirector/predation-retaliation-release` (`:427`), `encounterDirector/predation-tick` (`:1192`), `sectorSim/offscreenRiskPass` (`:427`), `sectorSim/injectConflictTension` (`:456`); encounterDirector.js and sectorSim.js now carry 0 raw `console.*`. PASS.
- **hitches P2** `_invalidateShadowPolicy` (`renderer.js:28870-28872`) pairs every renderer-driven `invalidateShadowCasterPolicy` with `_policyRootFaults.delete(root)` at all 7 call sites (`:10247`, `:11918`, `:12523`, `:28882`, `:29497`, `:30723`, `:30763`); six detach/teardown seams sweeping `_policyStepsParked` also delete/clear fault recs (`:23597`, `:23886`, `:24041` clear, `:29771`, `:29785`, `:30507`). PASS.
- **hitches P4** `tryPresentedCall` (`renderer.js:2279-2295`): per-epoch latch `_presentedTailFault_${label}`; epoch flip resets `{faults, retryAt, warned}`; ≤3 faults at ≥1 s spacing (`retryAt = now + 1000`) then parks serving `fallback`; warns once per epoch + `noteLaneFault(presentedTail.<label>)`. Row-quarantine twin `notePresentationRowFault` (`:2249-2271`) shares the same contract. PASS.

## Recommended next wave

1. **F1** — template-census retain hoist: S effort, H impact, the clearest live pop-in class left in the lane.
2. **F2 + F3** — teardown fence parity + laneFault stamping: S effort, hardens both correctness and observability.
3. **F7.1/7.2** — commit-tail publish splitting: M effort, removes the largest remaining authored-commit atomic spans.
4. F4/F5 gate tightenings: S each, narrow windows but cheap.
