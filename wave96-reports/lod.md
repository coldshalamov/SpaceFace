# wave96 audit — lod-in-frame

branch audited: devin/1791064509-perf-w60 @ 4f6df8366 (NOT master)

saturated: false

## Ranked findings

### F1 — Whole-scene `lightCensusSignature` traverse once per presented frame [hunt (e), rank 1]
- evidence: `shadowDepthAdmission.js:401-424` — `lightCensusSignature` runs `lightingScene.traverse` over every scene node plus an O(depth) ancestor-visibility walk per light (:412-414); `renderer.js:25326-25348` — `_shadowCensusForFrame` memo keyed on `_viewSyncSeq`; `renderer.js:22526` — `_viewSyncSeq++` at `syncEntityViews` entry = once per presented frame.
- mechanism: any frame evaluating >=1 shadow-policy check pays one O(scene) traverse; in steady flight that is every presented frame (entity sync at :22816 calls `_shadowPolicyOptions` -> census). Visits every scene node to find O(10) lights — the largest unconditional per-frame walk left in this domain. W94 already shrank the call rate (per-park -> per-seq memo + epoch prefilter); the walk itself remains.
- fix sketch: maintain the rendered-light multiset incrementally — hook `added`/`removed` on the scene root, walk only the grafted subtree on add (O(added)), decrement on remove; keep `noteShadowCensusLightMutation` as the drift guard and fall back to the traverse on desync. Cheaper variant: keep the traverse but extend the memo across frames, re-minting only when the census epoch moves.
- effort: M
- magic-frame impact: H — steady O(scene) tax on every presented frame in flight.
- risk: M — the sig must stay exact; a missed light mutation silently starves or over-arms the depth session.

### F2 — Receiver-tally dirty recount pays a whole-scene traverse inside the presented frame [hunt (e), rank 2]
- evidence: `shadowReceiverTally.js:51-63` — `recount` is `scene.traverse`; `renderer.js:26057-26070` — `resolve(scene, {force})` inside `_syncShadowMapEnabled`; per-frame call site `renderer.js:23936` (presented path) and :23504 (opening path). Dirty marks: `_markShadowReceiversDirty` (:26034) called from disposeBoundaryObject (:10441), mass entity clear (:21073), settings flip (:16304), `markShadowReceiversDirty` seam (:10396); plus dirty settled on `noteShadowPolicyChanged` non-settling paths.
- mechanism: every boundary teardown / despawn clear / uncertain mount marks the tally dirty; the NEXT presented frame pays one O(scene) traverse — landing exactly on eviction-burst frames already under load.
- fix sketch: fold measured receiver counts into the paced walks that already traverse those subtrees — `disposeObjectSteps` inside disposeBoundaryObject and the despawn drain both walk the corpse subtree; emit `noteDelta` instead of `markDirty`. Alternative: drive `recount` as a stepped twin (yield per 256 nodes) and serve the last settled count mid-recount — consumers only gate `count > 0`.
- effort: M
- magic-frame impact: M — bursty O(scene) on teardown-churn frames.
- risk: L-M — a transient stale count during a stepped recount delays the map-off gate by <=1 settle; exact delta accounting needs care at swapped-root seams.

### F3 — First-verdict uncovered withhold pays a full atomic subtree traverse past the cap [hunt (e), rank 3]
- evidence: `renderer.js:25188-25197` — `withholdCoverageKnown` requires `withheldMeshes != null || _withheldDepthCasters.has(root)`; uncovered verdicts take the atomic leg (:25245-25271, debits wallet, no yield).
- mechanism: a root with no established withheld coverage (first withhold verdict, or post-sweep re-verdict) pays O(subtree) synchronously inside the pass even past SHADOW_ROOT_SYNC_PASS_CAP — the intentional W95 cold-link belt, but the only unbounded single-root walk left on the verdict path; packaged cathedral/place subtrees run to thousands of nodes.
- fix sketch: pre-establish coverage off the presented path — at `_armDepthStage` the arm already walks the subtree via the collect; record the candidate withheld set there so the frame-side first verdict reads covered. Narrow alternative: for uncovered roots past the cap, mint the stepped walk instead of atomic and let the verdict land next pass (flags already applied fail-open).
- effort: M
- magic-frame impact: M — rare, but unbounded per-root worst case.
- risk: M — touching the belt reopens the cold-link class W95 closed; keep atomic where the verdict must be same-pass.

### F4 — Starvation slot shares `collectSeq` with non-frame callers [hunt (d)]
- evidence: `renderer.js:25055` — `collectSeq = this._viewSyncSeq || 0`; forced slot at :25219-25222; non-frame `_syncShadowCasterPolicyChecked` callers :9272 (authored swap), :10335 (prepared-boundary mount), :11313 (packaged graft).
- mechanism: a commit-path call evaluated between presented passes consumes the seq's single forced-mint slot before `syncEntityViews` runs; the pass's own spent mints then park instead of slicing -> +1 pass deferral on the frame's starved roots. Bounded (parked walks resume free), but the slot's fairness guarantee leaks.
- fix sketch: key the starvation slot on a frame-path-only seq (stamp a dedicated counter at `syncEntityViews` entry and use it in place of `_viewSyncSeq` for the slot check), or grant one forced mint per caller class.
- effort: S
- magic-frame impact: L — deferral, not starvation.
- risk: L

### F5 — needsAtomicOut / scoped-graft atomic traverses on commit seams [hunt (e), ranks 4-5]
- evidence: `renderer.js:25181` — `needsAtomicOut` forces `traverseWouldSync`; call sites :9269-9272 (authored swap: invalidate + `preCountRoot`), :11307-11313 (packaged graft: invalidate + `preCountRoot`); `scopedSync` graft traverse in the same dispatch.
- mechanism: commit-path roots still pay O(addedSubtree) — plus O(depth x nodes) ancestor receiver walk for `preCountRoot` — synchronously on whatever frame the commit lands. Bounded by graft size; today the only sync out-param contract that requires atomic.
- fix sketch: the `preCountRoot` ancestor walk is O(ancestors) — run just it inline and route the subtree traverse through the stepped lane where the out-param contract allows; only onAuthoredAssetSwap truly needs the atomic result.
- effort: S-M
- magic-frame impact: L-M — commit-adjacent frames only.
- risk: L

### F6 — Withheld-cache coverage is an invalidate-everything invariant [hunt (b) residual]
- evidence: `_withheldDepthCasters` mint/read/delete sites — :25280-25289, fast-path re-stamp :25125-25138, park-release delete :25028, empty re-collect :25115, detached sweeps :25386/:25399, mid-arm :25757, arm restore :25781, denied-park re-stamp :25708-25710, unbind/teardown :20765/:20990/:21055. Invalidate coverage at every subtree-mutation seam: partsLibrary.js:3342/:4280/:9455 (swap commits), :9169/:9201 (lod0/retained-root swaps), renderer.js:9269 (authored swap), :11307 (packaged graft), :25938/:25978 (settings toggle), :10739 (admission withhold).
- mechanism: a stale withheld entry would defer the traverse while its cached flags keep applying. Verified: every enumerated subtree-mutation seam invalidates or re-stamps, and arm restore re-derives the live set (:25537) — no "deferred forever" path exists; worst-case staleness window is arm-to-arm. Residual: a hypothetical silent mesh attach under cover lands `castShadow=false` (three.js default), so the failure mode is a missing caster — a bounded quality gap, not a cold link.
- fix sketch (optional hardening): stamp a subtreeSeq or child-count checksum on withheld entries and treat mismatch as coverage-unknown — converts the invariant into a checked one.
- effort: S
- magic-frame impact: L
- risk: L

## Hunt verdicts — resolved without finding

- (a) `shadowCasterPolicyNeedsSync` (shadowCasterPolicy.js:166-173) mirrors the walker early-out (`makeShadowPolicyWalker` :272-...) exactly: `state.dirty || state.lodLevel !== nextLodLevel || state.castBand !== nextCastBand` with identical `allowCast = !options || options.allowCast !== false` resolution; the lazy `policyState(root)` mint side effect is identical on both paths; the early-out consults no other state (no force flags, userData, or band overrides). Twin is faithful — the cap now counts exactly the calls that would traverse.
- (c) clean skipped calls lose nothing: pre-W95 a clean call already returned `false` (walker mint null -> changed false -> return false); the `policyState` mint still happens inside `needsSync`; `needsAtomicOut` callers force `traverseWouldSync` so their out-params still fill; all result consumers guard on truthiness and a skipped `receiverDelta` is semantically `0`.
- (d) no livelock: `driveShadowPolicySteps` calls `slot.iter.next()` (:27219) BEFORE the deadline check (:27233) -> every drive call executes >=1 generator slice (<=256 visited nodes per `syncShadowCasterPolicySteps` yield cadence); a starvation-slot mint therefore makes >=256 nodes of progress per pass even under a spent wallet; parked walks resume free of the cap (`hadParkedWalk` excluded from the counter at :25198) and of the wallet (minted once). Foreign invalidate mid-walk keeps `state.dirty` set -> re-drive next pass, still bounded; a sig flip abandons the walk but allowCast:false callers fall into the atomic lane which completes synchronously.

## Regression notes — W95 machinery (verified on 4f6df8366)

1. needsSync call-site gate — VERIFIED. Twin mirrors the early-out exactly (see hunt (a)); `_shadowRootSyncPassCount++` fires only when `traverseWouldSync` (:25198-25200) — clean calls are free; dispatch requires `!traverseDeferred && !skipTraverseOnDrift && traverseWouldSync` (:25203); `needsAtomicOut` force-sets `traverseWouldSync` (:25181).
2. withholdCoverageKnown — VERIFIED. Coverage test at :25188-25190 is `syncOpts.allowCast !== false || withheldMeshes != null || _withheldDepthCasters.has(root)`; uncovered withholds traverse atomically past the cap (belt); covered verdicts defer via `traverseDeferred` (:25191-25197).
3. Starvation slot — VERIFIED. `_policyMintStarvedSeq !== collectSeq` grants the first spent mint a forced slice (:25219-25222); subsequent spent mints in the same pass park; a fresh `_viewSyncSeq` re-arms the slot.
4. Atomic leg metering — VERIFIED. `atomicElapsed > 0` is the sole `notePacedFrameSpend` debit (:25269-25271); the atomic branch still completes synchronously — no yield mid-traverse.
5. lightSigEpoch prefilter + stamps — VERIFIED. Release clause requires `parkedEntry.lightSigEpoch !== shadowCensusEpoch()` before the sig compare (:24981-24983); same-epoch parks skip the census call; the keep-verdict re-key re-stamps `lightSig` + `lightSigEpoch` (:25012-25024); both park-mint literals carry the stamp pair (:25560-25574 and :25687-25705).
6. Ortho-interior recheck halving — VERIFIED. `shadowCastAxisDistance(root.position, framePlayerLocalX, framePlayerLocalZ) <= parkedCell` mints the halved recheck (`Math.ceil((96 + stamp%32) * min(8, 1<<(cycles-1)) * 0.5)`) at both sites (:25557-25565, :25684-25692); exterior roots keep x1; `git diff 332e07670..4f6df8366` confirms the pre-edit curve scaled by exactly 0.5.
7. boundEntityRefs doom — VERIFIED. Column declared at presentationWorld.js:223, grown in ensureCapacity :282, cleared in allocateRecord :638 / retireSlot :712 / unbindMesh :801; written `world.boundEntityRefs[slot] = entity || world.entityRefs[slot] || null` only inside the `meshRefs !== mesh` block (:776-779); the doom leg requires `resident === world.boundEntityRefs[slot] && resident.alive !== false` to skip (:984-986).
8. Journal collect narrow — VERIFIED. `collectedLiveIds` filters `entity.alive !== false` (presentationRunner.js:786-790); a suppressed destroy for a dead-at-publish id does not doom the collect; a live collected id still dooms and escalates through syncJournalRebuildEscalation.
9. Paced disposeBoundaryObject — VERIFIED. Dead-context guards run first (:10418-10419); flight-mode + Steps drives `disposeObjectSteps` yielding on `> 4ms slice || pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` with debit before yield; non-flight / no-Steps falls back to sync `disposeObject` (:10415-10439).
10. Cook cohort mint — VERIFIED. `cookPoolCompileRoots` lazy memo (:13890-13894) shared by the lateRoots tails (:13946, :13953) and the buffer-roots leg (:14245); `cohortSubjects` chunks 1024 through `uniqueAdmissionUnits` sharing `unitSeenMaterials`/`unitSeenGeometries` (:13994-14001); `cookStale()` bail inside the bucket legs; the seal unbucketed fallback awaits `sealPace()` per root (:13160); `_shadowCensusForFrame` latches `{seq, scene, sig, epoch}` per `_viewSyncSeq` (:25326-25348).
11. precollectedCasting — VERIFIED. `options.precollectedCasting || (yield* collectPotentialShadowCastSubjectsSteps(subjects))` at shadowDepthAdmission.js:605-608; both drive sites precollect once before their retry loops (renderer.js:542-551 and :15694-15705); drift retries re-mint `lightSigEpoch`/`lightSigOverride` only — no re-collect.
12. postPace superseded — VERIFIED. `postSuperseded = passEpoch !== world.enterSerial` (:15367); `postSupersededResult` shape `{skipped:true, superseded:true, queued, sector:sectorResult, lateRoots:0, depth:{skipped:true, reason:'epoch-superseded'}}` (:15369-15376); `postPace` debits + yields + returns superseded (:15377-15385); bail legs at :15407/:15414/:15435/:15446 (collectLateAdmissionCensus), :15465/:15487/:15501 (subjectsForCompileRoots), :15528 (dedupeLateSubjects), :15738/:15815 (unstaged collects), :15700/:15716 (driveDepthCompile); tail returns postSupersededResult().

No W95 regressions found. Two collateral notes:
- Stale doctrine comment at renderer.js:25931 still asserts the settings-enable withhold is "cap-exempt" — contradicts W94's deferrable-verdict semantics now that coverage-known gating applies; comment-only.
- `driveShadowPolicySteps` min-1 slice (:27219 before :27233) means the stepped lane's spent-wallet "park" still costs <=256 visited nodes per call — consistent with the W94 design note, worth keeping in mind when projecting worst-case per-pass spend: cap 8 traverses/pass, each bounded at one slice.
