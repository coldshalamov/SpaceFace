# W112 audit — boot-loading

Audited `devin/1791416524-perf-w110` @ `1cc691dd9` (tip; brief pin `811b92586 or later`).

```yaml
saturated: false
```

## Regression verification — W111 machinery (all verified on HEAD)

1. **Stride clocks on the four named generators** — PASS. `collectOpeningShadowCasterRootCandidatesSteps` yields on `(++censusVisited % 32) === 0 || censusNow() - censusStrideAt >= 2` (renderer.js:1089-1091, visit order unchanged). `reattachResidentGpuMeshesSteps` strides at 64-row/**2ms** in both the scan loop (:1985) and the rekey loop (:2039); comment correctly states matched rows pay `_bindPresentationMesh` subtree walks. `_rebindPresentationMeshesSteps` (:23653-23661) and `_bindPublishedPresentationMeshesSteps` (:23711-23714) both carry `%256 || >=2ms`.
2. **Publish degrade memo** — PASS. `_openingPublishDegradeEpoch/Verdict` minted only after two stepped-attempt faults (attempt 0 re-mints the iterator, attempt 1 degrades through `runCookSyncTwin`), keyed on `serviceFaultEpoch` (26877-26901). See finding F-1 for the staleness edge this creates.
3. **Depth-leg fault park** — PASS. Arm-path catches stamp `_depthStageArmFaults` via `_noteDepthStageArmFault` (29961-29969, epoch-keyed, `noteLaneFault('depthStageArm')` at >=3); head gate at 29460-29465 parks on retryAt; leg-drive `.catch` (29702-29706) and leg-setup/outer catches (29785-, 29904-) all covered; requeue tail + paced/forced debits in `finally` (29931-29935).
4. **Shared lightSig mint** — PASS. `_armDepthStage` takes `lightSig` from `_depthCollectLightSig` (29516) memo'd on `{seq,epoch}` (29340-29362); `markSig`/`verdictSig` live re-consults at 29532/29726 use the same memo; park-release back-fill writes only non-null sigs with `lightSigEpoch` stamped (28607-28619).
5. **Storm re-arm** — PASS. `_shadowCensusForFrame` superseded-count >=4 pins `stormEpoch` + `stormRetryAt=+1000ms` (29223-29226); release on expiry resets `superseded` and clears pin (29215-29220); epoch-flip gate clears pin before mint (29195-29203).
6. **Reconcile/keepGpu wallet debits** — PASS. Degraded rescue mint debits `noteForcedFrameSpend` (2760-2762); catch stamps faultEpoch/retries/retryAt + `noteLaneFault('residencyReconcile')` (2798-2812); degraded lane paced at 16ms slice (2827).
7. **Hold-exempt stepped fault exits** — PASS. All four catches (3870, 3907, 3983, 4004) run `abandon*` + `_holdExemptFaultEpoch` + `noteLaneFault('holdExemptStepped', true)` + warn + `notePacedFrameSpend` + return 0.
8. **driveHoldExemptDegrade wallet** — PASS. `finally { notePacedFrameSpend(clock()-started) }` at 3750-3752; >=3-faults sync twin behind forced wallet once per epoch (3683-3711).
9. **Mesh-build drain gate counter** — PASS. `_meshBuildLateSkips` commits `gate.skippedCount` only when `lateStartAllowed` (24652-24666 fresh, 24762-24771 resumed).

**Nit (not a mechanism):** `_stageShadowDepthOnSettingEnable`'s tail catch calls `noteLaneFault('depthStageArm', ...)` directly (30109-30113) instead of `_noteDepthStageArmFault()` — the per-epoch `_depthStageArmFaults` counter never increments on that path, so the >=3 arm-park can't engage there. Harmless today (per-click call, not a re-arm loop), but the comment at 29956-29960 claims the two paths share the stamp. One-line swap if W113 touches this file.

## Findings (ranked)

### F-1 — Degrade memo serves the mandatory post-settle republish (transient-fault stamp permanently skips it)

- **Evidence:** memo mint at renderer.js:26877-26901; settle loop `for (pass=0; pass<8)` at 26909; final republish `if (!(await drivePublishFirstPicture()))` at 26945 — added so the frozen census "sees committed authored leaves rather than pre-swap fallback children" (comment 26943-26944).
- **Mechanism:** once two stepped attempts fault, every `drivePublishFirstPicture()` in the epoch returns the memoized verdict — including passes 2-7 *and* the final republish at 26945. Two compounding edges:
  1. A *transient* fault (mid-mutation consult, re-anchorable array swap — the code itself acknowledges live-head swaps at 3987-3994) at pass 0-1 stamps a verdict that persists through the whole settle, even though a later pass would have succeeded.
  2. `runCookSyncTwin('opening-first-picture-publish', ..., true)` returns `true` on twin throw — the memo can't distinguish "published completely at stamp time" from "twin crashed, nothing published". In the latter case the first picture presents whatever pre-epoch state existed, and the one call that exists to capture post-swap authored leaves is skipped — so the presented frame can freeze on fallback children for the epoch's lifetime (epoch ends only on sector entry / context restore). Binds still heal via the presented-frame latch arm (27091-27100), so meshes do arrive — but the fence-pack/compose legs of the leg chain never re-run, which is exactly the content the republish was added to capture.
- **Fix sketch:** force-refresh the final republish — clear `_openingPublishDegradeVerdict`/`_openingPublishDegradeEpoch` immediately before the 26945 call (or add a `force` param to `drivePublishFirstPicture`). Keep the memo for settle-loop passes; the republish is a different logical operation (post-settle capture, not a retry). Worst case: one extra sync-twin run behind the existing catches.
- **Effort:** S. **Magic-frame impact:** H (frozen fallback children / stale census in the presented first frame under a recoverable fault). **Risk:** low — bounded by the same twin + catches; no new state.

### F-2 — `collectOpeningEntityRootCandidatesSteps` lacks the stride clock its sibling just got

- **Evidence:** renderer.js:1033 — `if ((++censusVisited % 32) === 0) yield;` with each row paying `collectOpeningSubmissionLeaves(mesh, { camera })` — a whole-subtree traverse (:1044). The shadow-caster sibling three pages below has the identical shape *plus* `|| censusNow() - censusStrideAt >= 2` (1089-1091). Called from the opening submission-plan census at 12589.
- **Mechanism:** worst-case stride = 32 subtree walks. On a station-scale authored root (hundreds of nodes per mesh), one stride is a multi-ms atom inside the opening plan — the same frozen-beat mechanism W111 closed on the shadow census. Row count alone can't bound wall time because row cost is itself a tree walk.
- **Fix sketch:** add the identical disjunct — `|| censusNow() - censusStrideAt >= 2` with `censusStrideAt` reset on yield.
- **Effort:** S. **Impact:** M (same class as the W111 fix; opening-plan census only). **Risk:** none — visit order unchanged, only yield frequency increases.

### F-3 — `syncEntityViewsSteps` first post-yield step fuses the hidden-row loop with no wall-clock bound

- **Evidence:** preamble→sweep split yield at 25689; hidden-count loop starts 25709 with `(index & 127) === 127` row-count yields only. Each hidden row pays `world.refreshVisibleEntity` + `entityVisualCullRadius(entity, mesh)` (:25739 — a bounds walk for meshes without a stamped radius) + `_applyPresentationPose` (:25741) + `applyEntityMeshVisibility` + `_queueHiddenSubtreeFreeze` (:25734).
- **Mechanism:** the first post-yield step fuses ~128 hidden rows × subtree-cost rows = a multi-ms atom, unbounded by any clock. At boot, hiddenCount includes roots prepared offscreen then hidden before freeze — nonzero on exactly the frames this lane cares about.
- **Preamble audit (rest of the brief's ask):** the ~75-line preamble is bounded — seq mint, budget reset, `tickLampBus` (bounded lamp count), `updateRoom` (one room), `_entityViewCullBounds`/`liveShadowCastRadius`/toLocal (O(1)), `beginVisibilityPresent` (ledger clear), and the `query()` mint — the deliberate O(world) classification the yield was placed after. No additional unbounded consult inside the preamble itself.
- **Fix sketch:** add the same `>=2ms` disjunct to the hidden loop (and audit the visible sweep below it for the same pattern). `beginRenderEntityFrame` (renderEntityFrame.js:25) is O(1) array clears — fine.
- **Effort:** S. **Impact:** M. **Risk:** low.

### F-4 — Verify-tier enumeration (remaining stepped generators with per-row subtree/heavy cost)

Stride-bound coverage is now good on the headline generators, but a few families still yield on row count alone while each row can pay a subtree collect. Worth a grep-for-yield pass before W113, ranked by plausible worst-case stride:

1. `collectStartupTexturesSteps` / `collectStartupGeometryDrawablesSteps` / `collectUnresidentInstancedDrawablesSteps` (startupGpuResidency.js) — 256-subject strides; per-subject collect walks that subject's materials/drawables.
2. `collectCompileSubjectsSteps` / `revealSubjectForCompileSteps` (compilePresentSlice.js) — 256-row strides over subject subtree work.
3. The detached-dispose family (`disposeDetachedObjectSteps`, `disposeDetachedPlaceFallbackSteps`, `disposeDetachedPackagedGroupSteps`, `detachedFallbackTeardownThenClearSteps`) — per-call subtree teardowns; confirm they yield per node, not just per call.
4. `bindInstanceMotionSteps` / `canonicalizeObjectSurfaceProgramKeysSteps` / `batchPackagedPropOpaqueMeshesSteps` — single-subject subtree walks; bounded per call but confirm internal node strides.

Already bounded (checked, no action): `replaceSceneEnvMapSteps` (256-node visited counter), `syncVisiblePointLightBudgetSteps` (nodesPerSlice=512), `bindEnvironmentToStandardMaterialsSteps` (nodesPerSlice), `lightCensusSignatureSteps`/`recountShadowReceiversSteps`/`collectPotentialShadowCastSubjectsSteps` (node budgets), `packPresentationWorldToFenceSteps`/`updateFromEntitiesSteps`/`visitRangeSteps`/`rebuildFromSteps`/`clearSteps` (256-row ledger rows, light per row), `enqueueMissingMeshBuildsSteps`/`kickDecodeRunwayAssetsSteps`/`hoistDeadlineGlassMeshBuildsSteps`/`updatePredictedSectorPrewarmSteps`/`collectNeverLinkedSceneRootsSteps` (bounded yields, light rows or named sub-steps), `buildArrivalRosterSteps`/`_publishArrivalRosterSteps`/`_reserveArrivalAsteroidCapacitySteps` (1024-row roster bookkeeping).

## Biggest remaining atomic boot stretches (hunt d, ranked)

1. **The `runCookSyncTwin` rescues themselves** — publish twin (26892), keepGpu reconcile twin (2760), hold-exempt degrade twin (3683-3711): each runs its whole leg chain inline on fault. Once per epoch each, by design; the publish twin is the largest (consume→rebind→fence→view-sync→compose×2). Not a defect — but it's why F-1's memo hit matters: the twin's atomicity is the reason the memo exists.
2. **`_bakeEnv` PMREM `fromScene`** (called in the settle success path ~27017; def 10167+) — synchronous cubemap convolve; on SwiftShader this is CPU rasterization, genuinely expensive. Already deduped per env-source token; called once per source change. Real cost, contract-required (env correctness is part of the presented frame).
3. **`syncEntityViewsSteps` preamble query mint** — one O(world) classification; deliberate, yield placed immediately after.
4. **F-3's fused hidden-row step** and **F-2's unstrided census** — covered above.
5. **`prepareFirstQueuedAuthoredBoundaryForOpening`** (26960-26978) — internally chunked and raced against `cohortRemaining`; the await is bounded, the synchronous interior is whatever the chunked pipeline leaves per slice.
6. **`afterBrowserPaint`-scheduled release** — scheduling, not work.

## Net assessment

W111's machinery all lands as designed. The lane is **not saturated**: F-1 is a genuine contract-relevant hole (a recoverable fault can freeze pre-swap fallback children into the presented first frame for the epoch), and F-2 is the same stride-clock gap W111 closed on the census's sibling. F-3 extends that pattern one loop further. All three are S-effort; F-1/F-2 are the recommended W113 targets.
