# Wave 84 audit — boot-loading lane

- Branch audited: `devin/1791064509-perf-w60`
- HEAD audited: `6e86d0305de4904c6a3875ee929f487300e52f53` (checked out and confirmed)
- Contract honored: zero visible quality degradation; sim determinism bit-identical (golden sf-sim.mjs 47a, hash `892f88c9…`). All findings below preserve both — they are algorithm/cadence/slicing/residency changes only, no authored-visual removal, no quality lowering.
- Scope: audit only, no code changes, no PRs, no app runs.

`saturated: false` — at least four mechanism-level wins with concrete implementation paths remain unfixed: the first-presented-frame diagnostic cluster, the forced `updateMatrixWorld(true)` compose inside the plan build, six remaining synchronous `compileShadowDepthPipelines` drains inside loading/shell legs, and a torn-stamp write escape in `captureOpeningSubmissionPlanSteps`.

## Regression notes — landed waves verified (W83 @ 6e86d0305)

### 1. `releaseMeshSet` batch scope — VERIFIED, no drift

- (a) Batch scope survives every exit including generator `.return()` abandon. All seven wrapped sites run `_meshReleaseBatchBegin`/`_meshReleaseBatchEnd` inside try/finally: renderer.js:1798-1821 (rekey sweep), 8305-8321 (`disposeRendererMeshRoots`), 12215-12241 (F9 leftover), 14712-14732 (sector-depart), 20401-20410 (`clearAllMeshes`), 20603-20638 (`reconcileMeshesSteps`), 20783-20827 (`reconcileMeshResidencySteps`). Stepped generators abandon via `iterator.return()` in the abandon helpers (2644-2696), which runs their finally blocks — the batch always closes. The unbatched single-row path is intact: `_unbindPresentationMesh` falls through to per-registry `releaseMesh` at 20133-20137 when `batchDepth === 0` (20130-20131 accumulate instead).
- (b) Verdict identity preserved: each `releaseMeshSet(pending)` (20078-20082) applies the same ancestor-walk / membership matcher per registry that the five per-mesh `releaseMesh` calls at 20133-20137 applied — pending entries are released by mesh identity across all five registries (`globalShipMicroMotion`, `globalAsteroidMotion`, `globalInfrastructureMotion`, `globalForgeCrown`, `globalLawArenaDressing`); deadOwners flush at 20359-20364 covers the same three registries the old per-owner calls did.
- (c) `_meshReleasePending` is nulled at 20076 BEFORE the five `releaseMeshSet` calls at 20078-20082 — a re-entrant `_unbindPresentationMesh` inside a release callback mints a fresh Set (20131), never mutates the in-flight one.
- (d) A mesh disposed mid-batch stays in `pending` until flush — nothing removes entries; `releaseMeshSet` drops refs by identity regardless of disposed state.

### 2. `compileShadowDepthPipelinesSteps` — VERIFIED, no drift

- (a) The sync driver `compileShadowDepthPipelines` (shadowDepthAdmission.js:521-526) drains the Steps twin inline (`let step = it.next(); while (!step.done) step = it.next(); return step.value;`) — yields become no-op loop points and the whole census+mutate span runs atomically. Sync call sites: renderer.js:9267, 9524, 11297→11380, 12793, 13160, 14232, 24427 — all receive the identical `step.value` return object the twin produces.
- (b) Fused census is byte-identical: `stagedLights` are gathered in the same traverse order as `collectPotentialShadowCastSubjectsSteps` (218-255, explicit-stack DFS with reversed-children push = pre-order); `sigCounts` feeds `lightCensusSignature` (369-392) as `'${type}:${layersMask}:${castShadow?1:0}x${count}'` sorted — fog `'fx'/'fs'/'f0'`, the `'l0|f0'` join, and the `''` (null lightingScene) edge cases all match the pre-W83 mint (verified against `04d973c8d~1`).
- (c) No yield inside the mutate window: yields exist only at 555 (delegated `yield*`) and the census `%512` slice at 598; the mark/compile span 629-768 — first `captureObjectHome` through the `finally` restores — is yield-free.
- (d) Post-opening async drives re-check the epoch at iterator mint: the postPace drive at renderer.js:15142-15163 mints `freshDepthLightSig()` and passes it as `lightSigOverride`, so marks are never written under a drifted census.

### 3. `byDetailOwner` index (asteroidInstancePool.js) — VERIFIED, no drift

- (a) Every `pool.byDetail` mutation maintains `byDetailOwner`: register 188-190, per-entity release 263-273, `releaseEntityDetailRecords` 320-330, rekey 301-314. No other `.set`/`.delete` sites exist.
- (b) `rekeyAsteroidInstanceEntity` (285-318) moves the whole Set under `newId` (301-314) and rewrites each record's `entityId`/`detailKey` (`${newId}#${leaf.uuid}`, 310-312).
- (c) Both pool resets clear both maps atomically: 716-717 and 739-740.

### 4. Queue-integrity write-backs — VERIFIED, no drift

- `hoistDeadlineGlassMeshBuildsSteps` (3149-3229): dead-array bail at 3201 (`owner._meshBuildQueue !== queue` → return `glassCount`, advisory only, live queue untouched); live-tail re-anchor at 3207-3224 drops consumed rows via `queued` stamp re-check at 3213 and re-evaluates never-scanned appends inline (`v === 2`); each live row is written at most once because the live walk is the deduped queue itself.
- Poll rehoist (20960-21032): `liveQueue === pendingBuilds` identity bail at 21003; `classifiedIds` (urgentNow+restNow, 21005-21007) partitions live rows into written vs appended; `seen` at 21013-21026 collapses a consumed-then-re-added id to exactly one tail entry; `queued` stamp re-checks at 21017/21023 drop rows consumed since classify.
- `_drainProtectedFirstFlightBuildsSteps` (21067-21159): same identity bail at 21117; `snapshotIds`+`seen`+`keep()` at 21119-21139 collapse consumed-then-re-added ids and drop consumed rows; `_holdExemptRemaining = exemptWritten` at 21140 counts rows actually written, not `hoisted.length`.

### 5. Bounded re-kick (`_mintWarmReKick`) — VERIFIED, no drift

- (a) Timeout is correctly bounded: `reKickDeadlineMs` = `max(0, warm.settleDeadlineAt - Date.now())` or `WARM_BUILDING_SETTLE_DEADLINE_MS` (30000) fallback (18415-18417); the race at 18418-18422 resolves `{status:'warm-kick-timeout'}`. The release continuation at 18423-18430 does land on the timeout outcome — intended: the unclaimed result calls `releaseClaim(false)`, erring toward re-warm rather than pinning the covered+claim pair forever (comment 18410-18414).
- (b) The RAW `reKickResult` is pushed to `warm.pendingAttachments` at 18431 — the settle arm (`_armCrucibleWarmBuildingSettle`, 18333-18356) waits on real outcomes and re-arms only while `Date.now() < warm.settleDeadlineAt`; post-snapshot pushes can grow the array but never extend the wait past the deadline; `entry.reKicked = true` at 18380 caps re-kicks at one per entry.
- (c) A kick resolving after the timeout still reaches `pendingAttachments` (the raw promise is what was pushed); its late settle is observed by any still-open `allSettled` window, while `entry.result` was already stamped by the bounded race.

### 6. Reskin reorder (`rockSurfaceLibraryReady.then`) — VERIFIED, no drift

- (a) One predicate — `stillLive = () => !!(this._meshes && this.scene === liveScene)` (9421) — gates every leg boundary: entry at 9418, then 9436, 9444, 9452, 9460, 9472, 9498 (inside the census drive), 9515. Legs run exactly once, in the required order: prewarm reskin 9432-9435 → count-gated prewarm compile 9437-9443 → reskinnedLive `_meshes` reskin 9446-9451 → `seatReadyRockSurfaceTextures` 9453 → parallax-group compiles 9454-9459 → `warmAsteroidInstanceVariants` 9463-9466 → count gate covering reskinnedLive + pool roots + depth variants 9470-9536.
- (b) `planetDetailLibraryReady` is hoisted to mount scope at 9409 — `preloadPlanetDetailLibrary(renderer)` evaluates eagerly once at mount with identical inputs and no dependence on the rock library's resolution.
- (c) A torn-down renderer between yields cannot throw or act on the dead scene: `stillLive()` gates each leg; per-iteration compiles inside a leg are individually try-wrapped (`catch (_) {}` at 9440/9477/9505); the depth site is gated at 9515. Worst case between a gate and the next yield is one bounded slice span of no-op compiles.

## Boot-lane residuals (prompt items a–e)

### (a) Remaining synchronous `compileShadowDepthPipelines` call sites — enumerated and ranked

Each site drains the whole census (O(subjects) DFS over `subjects` + O(lightingScene) light census) plus the mark/compile window inside whatever frame its async leg occupies. Ranked by expected work:

| rank | site | subjects | shell-frame context |
|---|---|---|---|
| 1 | 11380 `warmOpeningShadowPipelines(allSubjects)` | full opening leaf set (thousands) | inside `compileOpeningSubmissionPlan`, awaited behind the loading shell — largest remaining atomic depth block on the required path |
| 2 | 13160 SurvivalPostSettle `[scene, livingHullRoot]` | whole scene (~21k walk) | inside `prepareLiveSectorBeforeFlight`'s settle leg — runs inside the veil during the loading→flight seam |
| 3 | 14232 CookRockPool `cookCompileRoots.concat([scene])` | whole scene when under budget, else `cookCompileRoots` | inside the survival cook; the comment itself calls it "a single synchronous render" |
| 4 | 9267 context-restore `[scene]` | whole scene | context-recovery path — rare, but the player watches the frozen recovery screen while it runs |
| 5 | 12793 SurvivalPoolSeal `latePoolRoots` | bounded pool cohort | inside the seal leg, already surrounded by paced `admitOpeningUnitsAcrossSlices` work |
| 6 | 9524 rock-reskin `rosterPrewarmRoots + poolCompileRoots` | bounded cohort | inside a `.then` continuation — lands inside a presented flight frame whenever the decode resolves late |
| 7 | 24427 armDepthStage fallback `leg` | capped slice (`SHADOW_DEPTH_ARM_MESH_CAP`) | flight-time session fallback — not a boot leg; listed for completeness |

Ranks 1-6 all sit in async legs where a yield cadence exists or can be added: convert each call to mint `compileShadowDepthPipelinesSteps` and drive `next()` under the leg's own yield (`postPace`/`yieldToBrowser`/`sealPace`), keeping the `freshDepthLightSig()`→`lightSigOverride` epoch re-check at iterator mint the way the 15142-15163 post-opening drive does. Site 9524 additionally needs its `.then` body turned async (already legal — it awaits).

### (b) Torn-commit guard — three commit sites atomic, one write escape found

`captureOpeningSubmissionPlanSteps` (11392-11405) mints `captureStale` at 11396, delegates via `yield*`, then checks `captureStale()` at 11398 and performs all three commits — `state.render.openingSubmissionPlan = plan` (11399), `openingCohort.capture(identities)` (11402), `state.render.openingAdmissionCohort = snapshot` (11403) — in one synchronous span. Those three cannot tear: nothing interleaves between check and writes; on a mid-drive flip the plan is discarded whole.

Escape: inside the delegated `buildOpeningSubmissionPlanSteps`, five `state.render` writes at 11263-11267 — `firstPlayableContentHashes`, `firstPlayableContentHashesVerified`, `firstPlayableGlobalProgramKeys`, `firstPlayableOpeningProgramKeys`, `firstPlayableResourceIdentitySets` — commit BEFORE `yield*` returns to the caller, i.e., before the stale check runs. A world flip landing in any earlier yield window (11159/11174/11206/11236, per-8 at 11246) leaves those five fields stamped with values minted from census legs that straddled two worlds — the abandoned capture's writes survive on the shared facade until the next successful capture overwrites them. Bounded: they are producer-receipt diagnostics and plan-input fallbacks (read at 11281-11287 only inside the next capture, which has already overwritten them); no visual defect, but it is a real write past the guard. Also inside the unguarded span: `scene.updateMatrixWorld(true)` (11108), `seatReadyRockSurfaceTextures()` (11138), `ensureOpeningGeneratedScenarioPropPackage` (11239) — all idempotent or re-derivable, not torn verdicts.

Drive note: pipelineReadiness.js:874-886 abandons by `submissionPlan = null; break;` without `steps.return()` — safe today because neither generator holds try/finally obligations; flag for any future finalizer addition.

### (c) `collectLateAdmissionCensus` parked walks — mutations and stale-verdict analysis

The census (14896-14954) suspends on `await postPace()` inside four places: the `collectInstancePoolCompileRootsAndSubjectsSteps` scene drive (14908-14912), the `meshRootSet` walk over `this._meshes` (14915-14917), the per-subject `opening.has` classification (14935-14941), and the second `_meshes` walk minting `lateEntities` (14944-14947).

`_meshes`/scene mutators that can run during those yields: mesh-build drain attaches (21462, 21640), residency evictions `reconcileMeshResidencySteps` (20808), sector-depart sweep (14721), F9/leftover/other disposes (12224, 15614, 20407, 20632, 21592), the rekey sweep (1803-1804), deferred-enter materialization, and authored-admission boundary commits that `scene.add` children.

Verdict analysis post-resume:
- Over-inclusion (evicted-after-visit) is waste-only: a detached root in `lateEntities` compiles harmlessly.
- Classification is evaluated live per subject (`opening.has` at 14937), so a subject admitted mid-walk is correctly skipped; no double-class.
- Under-inclusion (added behind the walk cursor) is the only real direction: the newcomer is absent from `census.subjects`, `meshRootSet`, and `lateEntities`. Flagged joiners re-arm `_postOpeningRescanRequested` (15286-15290) and the bounded rescan (15195-15204, ≤3 passes) re-sweeps before `released` stamps. Unflagged additions — a bare mesh-build attach — rely on their own admission chain; the late leg is only the backstop. Narrow residual: a scene root mounted mid-window with neither a joiner flag nor its own compile path stays a cold-link risk.
- The `released` stamp at 15268 is epoch-gated (`passEpoch === enterSerial`) AND rescan-gated — it cannot commit while a flagged rescan is pending.

Net: the minted census cannot write a stale VERDICT post-resume (snapshot consumed as a "compile these" superset); its only stale direction is unflagged under-inclusion.

### (d) `collectOpeningSubmissionLeavesSteps` partial readers — none

The suspended leaf census at 9756-9761 holds `out` inside the generator closure (openingSubmissionPlan.js:335-350); `leaves` binds only at `step.done`, and `extraVfx` merges happen after (9762-9769). The delegated `yield*` at openingSubmissionPlan.js:1277 keeps the same closure discipline. No mid-drive readers exist. Mid-walk scene mutation inherits the same superset-vs-miss analysis as (c); `includeOffscreen: true` keeps it superset-leaning.

### (e) Remaining atomic O(scene/entities) blocks in the opening cook / boot sequence — ranked by row count

1. `captureOpeningAdmissionIdentity` (renderer.js:23674 → openingGpuAdmission.js:128-151: full `scene.traverse` + per-material `materialProgramKeys`) then `describeOpeningAdmissionIdentityDelta` (23704 → traverse at openingGpuAdmission.js:184) then `validateOpeningSubmissionReceipt` (23732 → openingSubmissionPlan.js:1364-1433: program-key set diffs + `revalidateProgramBindings`) — three consecutive whole-scene/program-set passes inside the FIRST presented frame (the veil-lift frame itself). Largest unsliced boot leg by far.
2. `scene.updateMatrixWorld(true)` (11108) — forced whole-scene compose (~21k nodes) at the head of the plan build, before the first yield.
3. `syncEntityViews(1)` (22771) + `scene.updateMatrixWorld(true)` twice (22777, 22802) — the opening presented-frame prime: full entity→view sync plus two forced whole-scene composes in one call; the second exists only because `_syncAsteroidInstanceSubmission` (22800) writes transforms after the first.
4. `collectFirstFlightEffectRoots(scene)` — atomic ~21k `scene.traverse` at TWO boot sites: 9769 (first-present admission) and 11234 (pooled-resource subjects inside the plan build).
5. `uniqueAdmissionUnits([...leaves, ...extraVfx])` (9773) — atomic dedupe over the full leaf set on the first-present path; a chunked pattern already exists at 15003-15024 (`dedupeLateSubjects`, 1024-row slices sharing the seen sets).
6. `ensureOpeningGeneratedScenarioPropPackage` loop (11238-11240) — unyielded pass over every candidate.
7. `collectOpeningSubmissionLeaves` sync drains at 11145/11197/11213 — bounded per-subtree (parallax children, derived pool roots, vfx roots); the vfx-root loop is the largest of the three.
8. Atomic collector fallbacks at 14901-14903 (`collectInstancePoolCompileRoots`, `collectLateAdmittedCompileRoots`, `collectUncompiledSceneDrawables`) — reachable only if the Steps twins are absent; defensive path.
9. `combineOpeningProducerCensuses` (11260) + `createOpeningSubmissionPlan` (11269) — O(programs/subjects) merges, synchronous but cheap per element.
10. Rehearsal `renderer.render(this.scene, recookCamera)` + `gl.finish()` (11574-11576) — one GL submit, not sliceable by nature; listed for completeness.

## Ranked findings

### F1 — First-presented-frame diagnostic cluster pays three whole-scene passes inside the veil-lift frame — impact H, effort M, risk M

- Evidence: renderer.js:23674 (`captureOpeningAdmissionIdentity` — traverse + per-material program keys, openingGpuAdmission.js:132-146), 23704 (`describeOpeningAdmissionIdentityDelta` — traverse at openingGpuAdmission.js:184), 23732 (`validateOpeningSubmissionReceipt` — set diffs, openingSubmissionPlan.js:1364+). All run inside the `openingFirstDraw` arm of `drawPreparedFrame`, the exact frame the player sees first.
- Mechanism: the first presented frame already carries the render itself; it additionally pays ~21k-node traversal + per-material `renderer.properties` reads before the submit and another traverse + program-key attribution + receipt diff after it — hundreds of ms of JS inside the frame the veil drops on. Hitches here read as a frozen veil-lift.
- Fix sketch: keep the pre-draw baseline census (it must precede the submit), but slice it via a Steps twin driven across the pre-present warm frames, and move the post-submit delta attribution + `validateOpeningSubmissionReceipt` to `afterBrowserPaint` / the deferred-validation path the D25 comment already tolerates (`openingFirstDrawIdentityCensus` is persisted on `state.render` at 23682 precisely so a later frame can consume it). No visual change; same diagnostic output one frame later.
- Risk: M — validation lands one frame later; the persisted-census design already anticipates deferral.

### F2 — Forced `scene.updateMatrixWorld(true)` compose at the head of the plan build — impact H, effort S, risk M

- Evidence: renderer.js:11108 inside `buildOpeningSubmissionPlanSteps`, first statement before the first yield at 11159; ~21k nodes force-composed in one atomic span (compare the per-frame comment at 19490: the unfrozen walk alone is ~11 ms).
- Mechanism: the capture leg that paces everything else opens with the single largest atomic block in the whole cook — a compose that recomputes every matrixWorld even where no ancestor moved since `prepareFrame` already ran the same sync at 22771/22777 minutes earlier in the same loading window.
- Fix sketch: drop the force flag to `scene.updateMatrixWorld()` — clean subtrees early-out on `matrixWorldNeedsUpdate`, preserving correctness through the dirty flags three already maintains (the cook's own freeze machinery at 20038 relies on those flags). If a flag-trust audit is wanted first, run it as a diagnostic wave; the change itself is one argument.
- Risk: M — if any boot-path write sets matrices without flagging `matrixWorldNeedsUpdate` (matrixAutoUpdate=false subtrees), admission verdicts would observe stale poses; the 5597 comment shows this class has bitten before.

### F3 — Six synchronous depth-ceremony drains inside shell-window legs — impact H, effort M, risk M

- Evidence: sync `compileShadowDepthPipelines` drains at 11380 (allSubjects — full opening leaf set), 13160 ([scene]+livingHullRoot), 14232 (cookCompileRoots[+scene]), 9267 ([scene] context-restore), 12793 (pool cohort), 9524 (roster+pool reskin `.then`); each atomic from census through mark/compile (see residuals table above for per-site ranking).
- Mechanism: each site runs the whole census+mutate span in one JS task inside a leg the loading shell's own frame cadence shares — on the shell path these extend the window the player watches; site 9526's `.then` can land inside a presented flight frame entirely.
- Fix sketch: mint `compileShadowDepthPipelinesSteps` at each site and drive it under the leg's existing yield primitive (`postPace`, `yieldToBrowser`, `sealPace`), preserving `freshDepthLightSig()`→`lightSigOverride` epoch re-check at iterator mint (the 15142-15163 post-opening drive is the template). The Steps twin already exists — this is a driver change, not a new ceremony.
- Risk: M — stale-epoch handling must be preserved verbatim; sites that currently rely on atomicity across a yield boundary (none found — each is followed by its own `cookStale()`/lifecycle re-check) need the recheck kept after the drive.

### F4 — `firstPlayable*` writes escape the torn-commit guard — impact M, effort S, risk L

- Evidence: renderer.js:11263-11267 — five `state.render.firstPlayable*` assignments inside `buildOpeningSubmissionPlanSteps`, committing before the caller's `captureStale()` check at 11398.
- Mechanism: a world flip inside the build's yield windows leaves torn-census receipt stamps on the live facade after the plan itself is correctly discarded — the only write that escapes the guard the census redesign built.
- Fix sketch: move the five assignments into `captureOpeningSubmissionPlanSteps` after the 11398 check (same synchronous span as the existing three commits), sourcing values from `plan.producerCensus`; the builder's own `createOpeningSubmissionPlan` inputs at 11281-11290 already read `producerCensus` directly where present, so no input path changes.
- Risk: L — identical values on the success path.

### F5 — Atomic `uniqueAdmissionUnits` over the full leaf set on the first-present path — impact M, effort S, risk L

- Evidence: renderer.js:9773 — `units: uniqueAdmissionUnits([...leaves, ...extraVfx])` inside `admitOpeningUnitsAcrossSlices` args, executed synchronously after the paced leaf walk; the chunked twin pattern already exists at 15003-15024 (`dedupeLateSubjects`, shared seen sets across 1024-row slices).
- Mechanism: the leaf census is paced and the admit loop is paced, but the dedupe between them is one atomic O(leaves) pass inside the first-present leg.
- Fix sketch: hoist the dedupe into a local paced helper (share `seenMaterials`/`seenGeometries` across slices like `dedupeLateSubjects`) or mint `uniqueAdmissionUnits` per slice — same membership semantics.
- Risk: L — pure chunking change; the existing helper proves the slice-boundary semantics.

### F6 — `collectFirstFlightEffectRoots` atomic whole-scene traverse at two boot sites — impact M, effort M, risk L

- Evidence: renderer.js:9769 and 11234 → latePipelineAdmission.js:151-161 (`scene.traverse` over ~21k nodes with the name/userData predicate chain).
- Mechanism: two more full-scene atomic walks on the boot path, one inside the first-present admission block, one inside the plan build.
- Fix sketch: mint a Steps twin (`collectFirstFlightEffectRootsSteps`) with the same explicit-stack pre-order shape as `collectInstancePoolCompileRootsAndSubjectsSteps` and drive it under each site's yield cadence; at 11234 the twin can fuse into the same walk that collects pooled-resource subjects if a combined visitor is cheaper than two passes.
- Risk: L — read-only census; ordering of `extraVfx`/`roots` preserved by identical traversal order.

### F7 — Opening presented-frame prime pays `syncEntityViews` + two forced `updateMatrixWorld` composes — impact M, effort M, risk M

- Evidence: renderer.js:22771 (`this.syncEntityViews(1)` — full entity→view sync), 22777 and 22802 (two `scene.updateMatrixWorld(true)` — the second only because `_syncAsteroidInstanceSubmission` at 22800 writes transforms between them).
- Mechanism: the loading→flight boundary prime runs entity sync plus two forced whole-scene composes in one call, behind the shell — the largest concentrated atomic span left in the opening sequence after the depth drains.
- Fix sketch: reorder so `_syncAsteroidInstanceSubmission` runs before the single compose (its contract is pose population, not compose ordering — verify no submission consumer reads matrices minted at 22777), or scope the second call to the pool meshes it actually dirties. Either removes one full-scene walk.
- Risk: M — ordering sensitivity inside the prime is subtle; needs the compose-vs-submission contract re-read carefully.

### F8 — Unflagged `_meshes`/scene mutations during the parked late census can evade both the minted sets and the rescan — impact L, effort S, risk L

- Evidence: census suspensions at 14908-14947 vs `_meshes` writers at 21462/21640/20808/1803-1804 and scene.add sites; only `preparePostOpeningPipelines` joins arm `_postOpeningRescanRequested` (15289).
- Mechanism: a newcomer mounted behind the walk cursor with no own compile path and no joiner flag misses the late cohort and stays a cold-link candidate at first draw — narrow, since realistic mutators (build-drain attaches, authored admissions) carry their own admission compile.
- Fix sketch: arm `_postOpeningRescanRequested` from the `_meshes.set` attach sites while `this._postOpeningPipelinesInFlight` is non-null (one-line flag at the two attach points, 21462/21640).
- Risk: L — worst case is one extra bounded rescan pass per flag flip.

### F9 — Remaining small atomic legs (kept together, individually below the H/M line) — impact L, effort S each, risk L

- `ensureOpeningGeneratedScenarioPropPackage` loop 11238-11240: add a per-8 yield like the producer loop at 11246.
- `collectOpeningSubmissionLeaves` sync drains 11145/11197/11213: drive the Steps twin under the same `yield*` delegation; bounded subtrees make this cosmetic.
- Atomic collector fallbacks 14901-14903: only reachable when Steps twins are absent — no action unless the fallback becomes live.

## Not re-reported

Adjudicated KEEP/DOCUMENTED/REJECTED/GATED items, the WHAT-ALREADY-LANDED list, the PREEXISTING TEST FAILURES list, and the DEFERRED/WONTFIX list (BatchedMesh specimen gap, loading artwork GL pause, ambient compile-tail serialization, LOD-F2/F3/F5, LOD-N4, world-store.js/slotMap, BOOT-F3(a) enterSector split, BOOT-F7 emit slicing, F4/F5/F9 tick-paced emit slicing, F6 combat:damage intern, next-wave-nxb-059 stale pin) were honored — none are re-raised here.
