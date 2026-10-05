# Wave-89 audit report — lane `lod-in-frame`

Audited: `devin/1791064509-perf-w60` @ `780d91fbf454c2a0fb9b948dec64ed91fd495e24` (verified checkout).

## saturated: false

A legal contract-preserving improvement path remains: the traverse cap drops exactly the subtree-wide withhold writes the cold-link doctrine requires, and two cheaper items (retry restamp, ledger over-charge) are plainly implementable. Findings below.

## Ranked findings

### F1 — Cap-deferred traverse silently drops the withhold verdicts' subtree-wide `castShadow=false`

**Evidence:** `src/render/renderer.js`
- `traverseDeferred` gate: 24736-24737 (`!scopedSync && _shadowRootSyncPassCount >= SHADOW_ROOT_SYNC_PASS_CAP`, cap=8 at 6655), skip at 24742 (`traverseDeferred ? false : syncShadowCasterPolicy(...)`).
- Withhold verdicts that carry their flag write ONLY through `syncOpts.allowCast:false` — i.e. only ever applied by the traverse that just got skipped: 24702 (`overCovered`), 24704 (`band!==1 && queued`), 24722 (band-1 queued, withheld-cache miss), 24727 (queued catch-all).
- Per-mesh flags that DO land under deferral: 24752-24755 (`withheldMeshes` loop — only covers meshes this pass's collect found; on over-cover `unstaged===null` so nothing lands).
- The design comment at 24729-24735 claims "the withhold bookkeeping below still lands (deferred unstaged casters must keep castShadow=false)" — true for `withheldMeshes`/queue/invalidate/stamp, false for the traverse-carried `allowCast:false` verdicts.
- The codebase's own doctrine states the requirement plainly — settings-toggle path, 25324-25330: "Withhold whole-subtree at queue time — a queued root that keeps castShadow=true draws its unlinked depth variants on the first presented refresh while it waits for the arm (the checked-sync else-if chain has no branch for band-1 + self-dirty + queued + uncached)." Same doctrine at 10588-10596 (batched-compile over-cover pays the full `syncShadowCasterPolicy(allowCast:false)` traverse rather than leave flags live).

**Mechanism:** trigger is a burst that (i) makes >8 roots consume traverses in one `syncEntityViews` pass and (ii) simultaneously produces withhold verdicts on later-ordered roots. Canonical producer is a light-census re-sign (`noteShadowCensusLightMutation` bump): every per-mesh mark tuple goes stale at once → mass band-1 collect+withhold across the ortho cohort → the cap saturates inside the burst → each deferred root's `allowCast:false` never lands → its meshes keep `castShadow=true` with now-stale marks → the next presented shadow refresh draws them and lazily links their depth variants mid-frame — the cold-link class the whole W88 machine exists to close. Self-heal is ~1-2 passes for the `overCovered` class (next pass re-collects → per-mesh flags land) but can persist under sustained cap pressure for the queued/cache-miss classes (collectGate stays closed on `band!==1 ? !queued : dirty>stamped`; a queued band-1 cache-miss root re-verdicts every pass while its traverse keeps deferring). Band<1 variants of the same hole are benign (out of ortho → never drawn by the shadow pass); the exposure is band-1 + queued + uncached and the over-cover tail while node-cap over-covers repeat.

**Starvation sub-question (a), answered honestly:** no K-bound exists in the cap itself — `_shadowRootSyncPassCount` counts traverses that ran in `query.visibleSlots` order; there is no FIFO rotation or aging, so a perpetually-Nth dirty root can defer indefinitely under sustained churn. In practice the arm drain (nearest-first slices, `min(32, max(8, ceil(n/2)))`, min-1-root progress) plus `STAGE_SELF_DIRTY_KEY` stamps shrink the dirty pool, so the deferral window is bounded by arm throughput rather than passes — but the withhold-verdict exposure above applies for the entire window.

**Fix sketch:** when `traverseDeferred` AND a withhold verdict fired (`overCovered` or `queued`-family), do not skip the flag work — either (i) exempt withhold-verdict traverses from the cap (verdicts are bounded ≤ collect cap = 8/pass; worst case 8 clean + 8 withhold traverses), or (ii) replace the skipped `syncShadowCasterPolicy(allowCast:false)` with a write-only iterative `castShadow=false` subtree walk (no policy/band evaluation — much cheaper per node, cannot re-open the seam). (i) is smaller and matches the doctrine sites.

**Effort:** S. **Magic-frame impact:** M (burst-scoped cold depth-program links inside presented shadow refresh — exactly the hitch class W88 targets). **Risk:** low-moderate — either variant preserves the no-cold-link invariant; (i) can overshoot the pass budget by ≤8 extra traverses on the pathological pass.

### F2 — Settings-toggle over-cover pays uncapped whole-subtree traverses per queued child inside one click task

**Evidence:** `src/render/renderer.js` 25290-25338 — shadow-enable toggle path: `collectUnstagedShadowCastersFlag` per top-level child under one shared 4096-node `toggleBudget`; on `UNSTAGED_COLLECT_OVER_COVER` it queues the dying root plus EVERY unvisited sibling (25310-25316), then pays a full `syncShadowCasterPolicy(child, lodLevel, {allowCast:false})` traverse per queued root at 25334-25336 — unbounded count × unbounded subtree size, no yield, inside the settings event task.

**Mechanism:** one settings flip on a busy sector: the shared 4096-node budget typically dies inside the first fat root → all remaining scene children queue → each gets a whole-subtree traverse → O(scene) ≈ 10-20k nodes of flag evaluation inside a single event turn. This is the presented-frame-adjacent stall the census half of the same function was paced to avoid (25318-25322 comment: the whole-scene synchronous reparent+census+compile "used to pay ... inside the settings handler — an unbounded stall on a presented frame"). The withholds moved the stall, not removed it.

**Fix sketch:** queue the roots and let the arm's own deadline-bounded collect+withhold path withhold them (queued roots already withhold at their next checked sync — the missing `allowCast:false` coverage is precisely F1); or drive the per-child withhold traverses stepped under `yieldToBrowser`/the paced ledger, one child per yield. Must keep withhold-before-present ordering, so pace it as a pre-arm leg, not lazily.

**Effort:** S-M. **Magic-frame impact:** M (one O(scene) stall per shadows toggle; rare but user-visible and squarely in the seam class). **Risk:** low — the arm machinery already implements the semantics; ordering is the only contract.

### F3 — `driveCompileShadowDepthPipelines` retry restamps `lightSigEpoch` but keeps a stale `lightSigOverride`

**Evidence:** `src/render/renderer.js` 526-547 — retry loop at 534-545 restamps only `depthOpts.lightSigEpoch = shadowCensusEpoch()` (:544); `lightSigOverride` passed by the arm (25053) is minted once per arm at ~24936 and stays. Contrast the post-opening driver's own loop at 15430-15466, which restamps BOTH on retry (15463: `depthOpts.lightSigOverride = freshDepthLightSig()`). The Steps generator is written for this: `markLightSig` = override when supplied (shadowDepthAdmission.js:618-627), while `stagedLights` re-collects fresh per attempt (:577-613).

**Mechanism:** a bumped census mid-drive (light mount/flip) aborts with `stale` → retry stages the NEW live light set correctly but still mints mark tuples under the OLD signature → next arm's collect mints the live sig → `casterDepthMarkCurrent` mismatches → every leg caster re-collects as unstaged → one extra arm cycle of redundant collect+offer+re-stage work per drifted leg. Direction-safe (casters stay withheld; no cold link), pure wasted work and delayed shadow return. Under a churning light set the loop can eat all 4 retries and still mint wrong-sig marks every time.

**Fix sketch:** inside the retry at :544 also set `depthOpts.lightSigOverride = lightCensusSignature(depthOpts.lightingScene)` (or thread the post-opening driver's `freshDepthLightSig` pattern into the shared driver). One-line field restamp.

**Effort:** S. **Magic-frame impact:** L (bounded churn, no visible defect — restores withheld casters one arm cycle sooner). **Risk:** trivial — the sibling driver already does it.

### F4 — Commit-leg dispose loops charge between-presents waits to the paced ledger

**Evidence:** `src/render/partsLibrary.js` ship leg 9379-9393 and place leg 4296-4310 — `commitLegStarted` is restamped inside the `finally` before the dispose drive (correct per W88), but the loop then `await waitForAuthoredAdmission(yieldToNextPresent(), options)` per steps-yield (9386-9388 / 4303-4305) WITHOUT restamping — the closing `notePacedFrameSpend(monotonicNow() - commitLegStarted)` (9392 / 4309) debits leg work + every between-presents wait (16-48ms each) into `paceFrameSpentMs`. The `driveLeg` convention (visualFactory.js:4265-4274) debits then restamps around each yield precisely so waits are never charged.

**Mechanism:** over-charge, not under-charge — the ledger believes the epoch's 4ms `PACED_FRAME_BUDGET_MS` is exhausted for the rest of the epoch → sibling paced work (decode legs, residency drains, the arm's own collect slices if they ride the ledger) defers longer than needed → admission tails serialize slower than the budget requires. No presented-frame hit; a pacing-efficiency loss on every authored commit. Also partially re-violates the W88 sub-check "the ~16-48ms between-presents admission wait no longer debits notePacedFrameSpend" — true for the pre-dispose wait, false for per-step waits inside the loop.

**Fix sketch:** inside the dispose loop, `notePacedFrameSpend` before each await and restamp `commitLegStarted` after it (same shape as the driveLeg loop), leaving only the tail debit.

**Effort:** S. **Magic-frame impact:** L-M (admission latency, not hitching). **Risk:** trivial — strictly less conservative than today, still debits real work.

### F5 — Light-set mutation classes that never bump `shadowCensusEpoch` (census memo invalidation enumeration)

**Evidence:** bump sites are exactly precompile.js:180,198 + renderer.js:25452,25486,25541,26571 (key-light castShadow flips ×3, precompile stand-in mount/release, light-holding subtree teardown via `disposeObject` `heldLight` at 26524). Enumerated un-bumped classes:

- `WeaponLightPool.dispose()` — `src/render/weapons/weaponLights.js:104-110` removes 2 pooled lights (`slot.light.parent.remove`, group remove) with no `noteShadowCensusLightMutation()`. Teardown-only in practice.
- `flightOverheadPresentation` dispose — `src/render/flightOverheadPresentation.js` (~line 56-58 area, `dispose() { light.parent && light.parent.remove(light) }`) — same, teardown-only.
- `light.visible`/layers/castShadow writes outside the 6 sites: none in live code today — pool contract (weaponLights.js:5-6) keeps lights visible forever and intensity-only flashing; authored GLB lights are rejected at load (assetLoader.js:1510); no light `.layers` writes exist (grep: only prepass-mesh mask copies and `camera.layers.enableAll()`).
- `scene.fog` re-assignment: only at init (renderer.js:9090); palette transitions mutate `fog.color`/`fog.density` in place (26454-26459, 26467-26472) — correctly non-sig terms.
- Subtree removals not routing through `disposeObject` (e.g. `boundary.remove(x)`, `root.clear()`) can't carry lights — authored content is light-free by contract, and all light-bearing groups (sector rig 9091-9094, pool group, overhead light, precompile staging) use bumped sites or teardown.

**Mechanism:** memo key `{seq:_viewSyncSeq, scene, epoch}` (24803-24814) serves the stale sig for the remainder of the pass after an un-bumped mutation → same-seq collects mint/compare a sig that doesn't describe the live set → conservative re-collect churn at worst; no cold link (marks re-prove against a future fresh mint and mismatch stays withheld). The guard contract is today enforced by convention only — a future light-mounting path (sector dressing light, scripted effect light) that forgets the bump silently degrades.

**Fix sketch:** call `noteShadowCensusLightMutation()` in the two teardown disposes (free), and add a one-line comment/assertion where lights get added in future (or a dev-mode trap: `scene.add` of `isLight` outside bump sites logs once).

**Effort:** S. **Magic-frame impact:** L (prophylactic; no live hole found today). **Risk:** none.

### F6 — `refreshWholeShipLodFamily` pays a synchronous whole-subtree dispose per stale retained LOD root

**Evidence:** `src/render/partsLibrary.js` 9011-9027 — on a re-commit, each retained LOD level root is removed and either `releaseComposedRetained` (async-floats, paced — fine) or, for non-composed roots, `try { disposeDetachedObject(root); }` runs inline. Caller context: 8936, inside `installWholeShipLodFamilyController`'s already-installed branch, invoked post-commit inside `completeAdmission` (8645) — an inter-present continuation, not a presented seam, but un-paced: no yield between roots, no Steps twin (`disposeDetachedObjectSteps` exists at 15742).

**Mechanism:** a second authored commit on a whole-ship-LOD boundary tears down each retained level's subtree atomically inside one continuation — mid-size roots (hundreds–~2k nodes), so ~1-3ms of unyielding work between presents; under a commit burst this lands back-to-back. Bounded, deferred-window, direction-safe — this is the weakest finding.

**Fix sketch:** drive `disposeDetachedObjectSteps` per root through the existing paced pattern, or float non-composed roots through the same `Promise.resolve().then(...)` lane the composed records already ride.

**Effort:** S. **Magic-frame impact:** L. **Risk:** low — teardown ordering is already async-safe here (roots are detached first at 9017).

### Nits (not ranked — informational)

- `suppressAuthoredReadableSilhouette` (partsLibrary.js:9421) has zero call sites — dead code; either wire it or delete it.
- `getPooledNavLightSources` (renderer.js:6927) and `socketWorldPose` (25691) do a memoized first-walk per root/socket — first-hit traverse inside a presented frame is bounded and cached; fine.
- `replaceSceneEnvMap` (26492-26507) whole-scene + detached-roots traverse is gated behind env rebakes (init 9936, opening-release 17245-17247, source-dirty 23365-23368) — rare, behind shell/admission gates; a Steps twin exists as a pattern but demand is absent.
- `fallbackRoot.traverse` hasMesh checks (partsLibrary.js:2814, 3766) pay a full walk for a boolean — trivially early-exit-able; runs once per wrap, not a seam. Ignore unless touched anyway.

## Regression notes — W88 machinery verified concretely

1. **`updateFromEntities` diff-apply twin** (presentationWorld.js:831-870, routed from presentationPublisher.js:114-118): PASS. Same early-out families (UNCHANGED_REFRESH_SKIP pose+type+flags+radius compare :746-786) on both paths; `allocateRecord` throws on entityId 0 (:566-607) so neither path can see id-0 entities — consistent.
2. **`commitLegStarted` inside finally** (partsLibrary.js ship :9379-9380, place :4296-4297): PASS for the restamp placement — restamp runs inside finally before the dispose drive, so the pre-dispose admission wait isn't charged. FAIL (residual) for the per-step waits inside the dispose loops — see F4.
3. **`bindAuthoredMotion` stepped** (motionBank.js:601-645; authoredMotion.js:1013-1023; driveLeg visualFactory.js:4264-4274): PASS. `collectNodesByNameMapSteps` mirrors the sync twin line-for-line (same falsy-skip, same push order) plus a caller-supplied map; `finishAuthoredMotionBind` is the shared tail; sync originals still exhaust inline identically; async legs pace via driveLeg.
4. **`mintResidentReattachSweep`** (renderer.js:1793-1799, pump 2115-2139, reconcile gate 2150): PASS — in-flight iterator closed via `.return()` before re-mint; pump mints only `if (!owner._residentReattachIter)`; reconcile mint waits on `!_residentReattachIter`; all sites route through it.
5. **`_armDepthStage` unconditional deferred drive** (renderer.js:25024-25063): PASS — no `createShadowDepthStagingSession`/`session.slice` remains on the arm path (session machinery only in shadowDepthAdmission.js + tests); `legDeferred=true` + `deferredMark` populated per offered root; rejection swallowed in `.catch`, deferredRoots cleared in `.finally`; restore's direct `syncShadowCasterPolicy` at 25201 bypasses the traverse cap under `SHADOW_DEPTH_ARM_RESTORE_MS` deadline.
6. **`SHADOW_ROOT_SYNC_PASS_CAP`** (6655, 24642-24651, 24736-24740): PASS on counting (only non-scoped traverses consume; scoped graft syncs and arm restores bypass; counter resets with `_depthCollectPassSeq`) and PARTIAL on the withhold tail — bookkeeping (queue/invalidate/stamp/per-mesh flags) runs unconditionally under deferral, but the `allowCast:false` verdicts the cap skips are the subtree-wide withhold (F1). Sub-check (b) "a deferred root can never close the next pass's collectGate on a stale stamp" holds: deferral writes no stamp.
7. **`settleRebuildBridges`** (2026-2062): PASS — 32-row cap, unreleased rows rotate to map tail (`delete`+`set` at 2055-2056), `releaseRebuildBridge` identical on release.
8. **`freezeStaticTransformRootMarked`** (staticChildMatrices.js:130-145): PASS at all 4 call sites — partsLibrary :3743→3744 and :3905→3906 (sync freeze immediately precedes), :4234-4246 and visualOverrides :1183→1187 (Steps freeze driven to completion immediately precedes). O(degree) semantics hold; the surrounding stamp discipline is consistent — `sfHiddenFrozen` root-level freeze/restore round-trips cleanly (20367-20372, 22310-22316, 22349-22353, 20466-20469), `markAnimated` clears `sfMatrixFrozen` up the ancestor chain (motionBank.js:558-564), graft clears ancestor marks via `add`/`attach`, `crucibleGhost` re-enable is safe because root re-pose forces the walk anyway (crucibleGhost.js:173). No call context found where a freeze pass did NOT just run.
9. **Registry side indexes** (shipMicroMotion `mountIndex` :420, asteroidMotionPresentation `boundaryIndex` :281, infrastructureMotion `boundaryIndex` :168, forgeRegentCrown `boundIndex` :180, lawArenaDressing `boundIndex` :840): PASS — `releaseMesh`/`releaseMeshSet` resolve O(1) via `mountIndex.get` (shipMicroMotion.js:2294-2306); `clearRecordMeshRefs`/`detachCrown` delete index entries before nulling; `prune` drops index entries (2314); re-stamp on (re)mount at :1135-1136; `nodeInsideTree`/`nodeInsideAnyOf` are fully gone (zero hits).
10. **Non-throw packaged-exit disposes** (visualOverrides.js:1124-1300): PASS — every non-throw exit disposes: `COMMIT_ORPHANED` at each of the 5 `driveLeg` sites (1161-1186), empty `packaged.children` (1165-1170), pipeline-fail catch (1200), post-compile/pre-publication orphans (1222-1238), stale-run guard (1246); thrown-leg `.catch` disposes hoisted `detachedCommitGroup` (1288-1290); `freezeStaticTransformRootMarked(packaged)` at 1187 correctly follows its own freeze leg.
11. **Reattach feed versions** (renderer.js:2091-2104): PASS — feed covers `_meshesVersion`, `entityIndex.version` (V1-flag-guarded, `entities.size` fallback), `entityList.length`, `field.version`, `dressing.version` (`byId.size` fallback), `farActors.version` (`byId.size` fallback), `sessionEntityIdRemap.size`, `enterSerial`; count-equal swaps mint stamps on versioned tables; 240-frame periodic catch-all at 2108.
12. **`upgradeMintPass` rejection swallow** (renderer.js:~17179): PASS — floating chunked IIFE carries `.catch(() => {})` with the documented fire-and-forget rationale.
13. **Census-memo + arm integration** (the wave's cross-cutting claim): PASS with the F3/F5 residuals — `_shadowCensusForFrame` memo keyed `{seq,scene,epoch}` mints once per entity-view pass; arm mints `lightSig` fresh at ~24936 (deliberately NOT the memo — correct for a multi-present drive); collect queries use the memoized sig consistently; the drive's `lightSigEpoch` auto-mints inside `driveCompileShadowDepthPipelines` (531-533) so `censusStale` is armed on every path; the reparent/render/mark window is yield-free inside one `next()` and all restores live in `finally` (shadowDepthAdmission.js:715-789) — no yield-gap abandonment can strand reparented subjects or lights in staging.

## Lane-residual enumeration summary (per prompt items a-e)

- **(a) traverse-cap starvation:** no K-bound — `visibleSlots` order, no aging; effective bound is arm-drain throughput. The starvation consequence is the F1 withhold-verdict exposure, not cold storage. **F1.**
- **(b) census memo invalidation:** all live-code mutation classes that touch sig terms are bumped; un-bumped classes are teardown-only disposes + the contract is convention-only. **F5.**
- **(c) `freezeStaticTransformRootMarked` preconditions:** clean — all 4 call sites run a freeze pass immediately before; clone/stamp/re-enable paths audited and consistent.
- **(d) unpaced whole-subtree traverses in presented seams, ranked by worst-case node count:** F2 (O(scene), settings toggle) > 10595 over-cover `syncShadowCasterPolicy` withhold inside the armed compile task (bounded by its own 4096-node flag budget preceding it; flight-mode admission task) > F6 (retained LOD roots) > `replaceSceneEnvMap` (behind gates) > packaged/fallback `disposeDetachedPackagedGroup`/`disposeDetachedObject` exits (detached continuations, already Steps'd where hot).
- **(e) deferredMark retry fields:** all restamps are correct except `lightSigOverride` — **F3**. Keep-across-retry by design: `subjects` (re-collected internally), `stagedKeyLight` (WeakMap-cached per renderer — no per-retry clone leak), `homes`/`stagedLightHomes`/`castShadowRestore`/`renderBufferDirect` (all per-attempt locals, finally-restored), `_deferredDepthStageRoots` (cleared in outer `.finally`, correctly kept for all in-flight attempts).
