# W111 audit — boot-loading lane

Audited: `devin/1791416524-perf-w110` @ `74cb6ef65` (detached HEAD, exactly the pinned SHA). Read-only audit; no code executed beyond reading, no edits, no PRs.

## 1. Verdict

`saturated: false`

W110's machinery verified solid end-to-end (10/10 regression items pass — details below), but four legal contract-preserving improvements remain: (a) per-row subtree walks inside stepped boot legs defeat the 4 ms paced budget — one "step" can still be a ~20k-node traverse; (b) publish-leg faults re-pay the whole steps prefix per attempt across up to 8 settle passes, with un-deduped warns and no laneFault stamp; (c) `syncEntityViewsSteps`' ~75-line preamble (incl. the `presentationQueries.query` mint) is one atomic step inside the opening publish; (d) six shared-machinery drive catches stamp fault epochs but never reach `noteLaneFault`, leaving parked lanes invisible to `state.render.laneFaults`.

## 2. Ranked findings

### BOOT-W111-F1 — Row-granular yields hide O(subtree) work inside boot census/bind steps (impact H, effort M, risk M)

Evidence:
- `collectOpeningShadowCasterRootCandidatesSteps`, `src/render/renderer.js:1071-1099` — yields every 32 map rows (line ~1081: `if ((++censusVisited % 32) === 0) yield`), but each visited row pays `collectOpeningSubmissionLeaves(root, { camera })` — a complete subtree traverse collecting cast-shadow leaves. On a dense opening scene one 32-row stride can walk tens of thousands of nodes inside a single paced step.
- `_openingFirstPictureUpgradePromisesSteps`, `renderer.js:26630-26664` — yields every 64 `_meshes` rows (26631); each row calls `openingEntityRootIntersectsCamera` (~1110+) → `root.updateWorldMatrix(true, false)` + `entityVisualCullRadius(entity, root)` (subtree bounds walk) + `getWorldScale`, and unsettled rows additionally mint `requestAuthoredUpgrade`. 64 rows × O(subtree) per step.
- `_rebindPresentationMeshesSteps` (`renderer.js:23532-23564`) and `_bindPublishedPresentationMeshesSteps` (23581-23600) — yields every 256 rows; each bound row runs `_bindPresentationMesh` (23004-23065), which on first-time binds pays `stampCanonicalSurfaceProgramKeys(mesh)` (subtree traverse, 23025) + `entityVisualCullRadius(entity, mesh)` (subtree bounds, 23054) + `world.bindMesh`. A 256-row stride of fresh binds = up to 256 subtree walks in one step.

Mechanism: the paced drains consult `pacedFrameSpend()` only *between* steps. A step that is itself O(Σ subtree) blows straight through `PACED_FRAME_BUDGET_MS` — the loading→flight transition then stalls several hundred ms in one macrotask, and the first presented frame hitches exactly when the veil lifts. Post-step floors make it legal (one step always completes), but the step is the whole problem.

Fix sketch: meter inside the row body — either steps twins for `collectOpeningSubmissionLeaves`/`entityVisualCullRadius` (matching the `disposeObjectSteps` per-128-node precedent at 23511), or a per-stride cost check (`if (now() - strideStart >= 2) yield`) layered on the row counter so a fat stride yields early. Keep visit order and output identical.

### BOOT-W111-F2 — Unguarded publish-leg faults amplify across the ≤8-pass settle loop (impact M, effort S-M, risk M)

Evidence: `drivePublishFirstPicture`, `renderer.js:26717-26739`. In `_publishOpeningFirstPictureSteps` the unguarded legs — `_presentationPublisher.consume()` (~26449), `yield* _rebindPresentationMeshesSteps` (26469), `yield* _bindPublishedPresentationMeshesSteps` (26475), `yield* packPresentationWorldToFenceSteps` (26482-90), `yield* syncEntityViewsSteps(1)` (26521), `yield* updateMatrixWorldSteps` (26530, 26597) — propagate a throw to the attempt catch. Attempt 0 warns + re-mints (whole prefix re-paid); attempt 1 falls to `runCookSyncTwin('opening-first-picture-publish', …, true)` which exhausts the entire chain **inline** (sync twin `_publishOpeningFirstPicture` at 26435-26440). A persistent fault thus pays ~2 partial stepped runs + 1 full atomic publish *per settle invocation*, and the ≤8-pass loop at 26740 invokes it every pass — worst case ~24 publish prefixes. Warns are raw `console.warn` (not `laneWarn`-deduped) and no `noteLaneFault` stamp is issued anywhere on this path.

Mechanism: boot never rejects (twin fallback `true` keeps the settle loop alive — verified, correct for magic-frame), but a sick leg turns the loading window into repeated atomic publish attempts, and telemetry sees nothing.

Fix sketch: memoize the degrade per epoch — once the sync twin has run for the current `serviceFaultEpoch`, later settle passes skip straight to its verdict instead of re-driving; route both catches through `laneWarn(owner,'openingPublish',…)` + `noteLaneFault(state,'openingFirstPicture', twinUsed)`.

### BOOT-W111-F3 — `syncEntityViewsSteps` preamble is one atomic O(world) step inside the opening publish (impact M, effort S, risk L-M)

Evidence: `renderer.js:25486-25562` — before the first `yield` (25567) the generator runs `_viewSyncSeq` mint, `resetDrawnCullPassBudget`, `_entityViewCullBounds()`, `this._presentationQueries.query(queryOptions)` (the per-pass query mint — a world scan), `beginRenderEntityFrame`, `liveShadowCastRadius` (cheap, 1326-29), `tickLampBus`, `globalLawArenaDressing.updateRoom`, `_assetResidency.beginVisibilityPresent`, and the hidden-slots loop head. Driven from `_publishOpeningFirstPictureSteps` at 26521, all of that lands inside one step; in the double-fault degrade it runs fully inside the inline twin (twice, since the sync method's drive belt at 25464-78 isn't in the steps path).

Fix sketch: `yield` once after the query mint (or split the preamble into a `syncEntityViewsPreamble` step minted before the row loops), so the paced driver can park between the query and the row sweeps. Byte-identical ordering required.

### BOOT-W111-F4 — `noteLaneFault` coverage gaps on shared-machinery drive catches (impact L, effort S, risk L)

Verified stamped: fencePack 27133, holdExemptDegrade 3686, shadowCensus 29063+29113, residentReattach 2649, arrivalReserve 3150, entityViewSync 25474, presentationRebind 27037, protectedFirstFlightDrain (twin path) 2429, plus the `presentedTail.*` family via `tryPresentedCall` 2185 — 17 call sites total.

Unstamped drive catches that already own fault-epoch state:
- `renderer.js:2463` — protected first-flight drain catch (stamps `_protectedFirstFlightFaultEpoch/Retries/RetryAt`; rollup only fires if the twin path at 2429 is reached — retries 1-2 and the no-twin case leave no `laneFaults` row).
- `renderer.js:~2761-2769` — keepGpu-window `_reconcileIter` drive catch (stamps `_reconcileFaultEpoch`; the sibling service-lane catch at 3223 *is* stamped — same machinery, asymmetric).
- `renderer.js:~3071-3083` — arrival roster drive catch (sets `_arrivalReservePending`, console.warn; no fault epoch, no rollup — a persistently faulting roster lane is invisible, though its failure mode is telemetry-only).
- `renderer.js:3816, 3849, 3923, 3944` — holdExempt warm-refill / collect / enqueue / decode-kick catches (each stamps `_holdExemptFaultEpoch`, none call `noteLaneFault`; only the degrade twin at 3686 is stamped).
- `renderer.js:614` (+ precollect at 595) — shadow-depth pipeline drive catch (console.warn + `runCookSyncTwin` degrade; no rollup).
- `renderer.js:~31068` — env-rebind walk catch (drops entry, console.warn, no rollup).

Fix sketch: one-line `noteLaneFault(state, '<lane>', retries>=3)` per catch — diagnostic-only, zero behavior change. Also cheap: funnel the `console.warn`s through `laneWarn` where they can repeat per epoch.

### BOOT-W111-F5 — Remaining atomic boot stretches, ranked (context for (d))

1. `_publishOpeningFirstPicture()` sync twin, `renderer.js:26435-26440` — exhausts the full publish chain (consume → rebind/bind → fence pack → 15 wrapped tail sites → entity sync → whole-scene `updateMatrixWorld(force)`) inside a single macrotask when both stepped attempts fault. This is the documented rescue floor (veil still up, boot proceeds regardless); it is deliberately atomic. Optional bound: chunk the twin into a metered inline drive with an epoch-cap, or accept and document. Risk M — it is the last-resort path; weakening it can produce a black first frame.
2. Instance submissions inside the opening tail — `_syncAsteroidInstanceSubmission` (26415-27: `_syncWorldPresentationTableMeshes` over `field.rocks` + `syncAsteroidInstancePool`) and `_syncAuthoredInstanceSubmission` (26269-303: `syncAuthoredInstancePools` over authored records) — each is a single atomic call inside `tryPresentedCall`. First presented frames are the cold-cache case (`recordsDirty` forces a full submit). A chunked/steps submission twin is conceivable but L-effort, M-risk (buffer commit ordering).
3. `_bakeEnv` PMREM bake sites (23675/23688, 10120, 10300, 10857, 13168, 15123, 16436, 19338) — GPU bake is atomic by construction; it already fires only on env-change/context-restore, mostly behind the veil. No legal steppable path — noted for completeness, no action.
4. `freezeOpeningGraphPublication` (30755-66) — verified trivial (promise gate install only, no scene walk). Not a stretch.

### Hunts (a) and (c) — resolved clean

- **(a) Opening publish-tail parity: PASS.** Every one of the publish-tail call sites in `_publishOpeningFirstPictureSteps` (26447-26599) runs inside `tryPresentedCall` — 15 wrapped labels (the commit advertised 13; the belt covers a superset): activity-frame 26502, camera-follow 26513, opening-vfx-frame 26524, contact-shadow-pool 26533, ship-aux-capacity 26537, shield-shell-clock 26541, ship-aux-pools 26545, shadow-cast-radius 26551 (fallback `_frameShadowCastRadius || SHADOW_ORTHO_EXTENT`), authored-instances 26555, shadow-map-enabled 26559, keylight-frustum 26561 (false), shadow-follow 26564 (false), shadow-refresh-schedule 26575 (false), active-shadow-camera 26582 (`this._activeShadowCamera`), asteroid-instances 26588. `_publishSnapshotFenceStats` carries its belt inside the method (25395-408), covering all 4 call sites. Yields between band groups pace through `yieldToBrowser()` — macrotask (`scheduler.yield`/`setTimeout 0`), not rAF-bound — so a suspended pass cannot deadlock the veil lift. The only unguarded call sites are the stepped legs enumerated in F2, and a fault there degrades through re-mint → sync twin → `true`; it cannot reject the boot.
- **(c) Spawned-bind latch: PASS — no leak path.** `_openingSpawnedBindActive` is set at exactly one site (27002, immediately before chaining) and cleared in the spawned generator's `finally` (27010). Every abandonment path runs it: `iter.return()` at 26978, `closeCookStepsIter` at 27030, and `.return()` on the chain propagates through `yield*` into the inner generator's `finally` (`_chainPresentationBindIters`, 23602-05). Pending announcements dedupe via `new Set(pending.concat(announced))` (26930-31, 26466). Benign caveat: the flag is not epoch-scoped — a spawned leg suspended across an enter keeps binding on the new world's meshes; per-row `_bindPresentationMesh` is idempotent so it converges harmlessly.

## 3. Regression notes — W110 verification (all at 74cb6ef65)

1. **Post-step wallet floors — PASS.** Rebind drain consults *after* `iter.next()` (27052-53: `if (drainClockNow…>=4 || pacedFrameSpend()>=PACED_FRAME_BUDGET_MS) break`) and debits `notePacedFrameSpend` at exit (27055-57). Fence-pack drain identical (27144-49, debit 27151). Pack mint consults the wallet *before* minting (`packWalletSpent` 27093-96). One step per pass guaranteed in both.
2. **Reattach-mint gate (1f5d71670) — PASS.** `mintResidentReattachSweep` (1938-52) closes the in-flight `owner._residentReattachIter` via `.return()` before assigning `fresh`; pump abandons on `_remap` identity mismatch (2632-34); fault path `closeCookStepsIter`+null (2646-51); no path clears the iter without close-or-complete.
3. **Forced-wallet mint-time debits — PASS.** Enumerated every `forcedFrameSpend()` consult (~13 sites): each debits `noteForcedFrameSpend` at the work site, not only at drain exit — rebind twin 26963, fence-pack degrade 27187, census sig 29121, depthStageArm 29671, arrivalReserve 3129, holdExemptDegrade 3666, despawn lane 2374, meshRelease flush 23128/23143, envRebind drain 31086, protectedFirstFlight twin 2434, residentReattach twin 2680, keepGpu reconcile twin 2743. No both-mint-then-both-clear window found.
4. **Publish-tail `tryPresentedCall` — PASS.** See hunt (a). Correctly-typed fallbacks verified (false / `_frameShadowCastRadius` / `this._activeShadowCamera` / void). In `prepareFrame` the same sites are wrapped 27224-27375; `syncEntityViews(alpha)` at 27264 is intentionally unwrapped (its own drive belt at 25464-78 serves last-painted picture on fault).
5. **Spawned-bind chain gate — PASS.** See hunt (c).
6. **Census sigFallback presented gate — PASS.** `_shadowCensusForFrame` 29085-29122: `sigParked = sigFaultEpoch===epoch && faults>=3` (29093); fallback requires `!sigParked && sigFallbackSeq!==_viewSyncSeq && paceEpochNow()<0 && forcedFrameSpend()<FORCED_FRAME_BUDGET_MS` (29096-98) — once per view-sync seq, presented-gated, forced-wallet debited (29121); faults stamp `noteLaneFault('shadowCensus')` (29113). While `paceEpochNow()>=0` the memo's stepped `pendingIter` drains ≤4ms/pass (29036-51) and unsigned serves.
7. **laneWarn dedup — PASS.** `laneWarn` 2122-41: per-lane `{epoch, warns, suppressed, summarized}` row reset on `serviceFaultEpoch` flip; first `LANE_WARN_BUDGET_PER_EPOCH=8` verbatim, then exactly one summary per epoch; owners without `state.render` warn unconditionally.
8. **laneFaults completeness — PARTIAL.** All four named sites stamped (27133, 3686, 29063, 29113) — but the unstamped shared-machinery catches enumerated in F4 remain. Not a regression (the requirement covered the named sites) — tracked as residual gap.
9. **prepareFrame head belts incl. fence-stats inside-method — PASS.** `frame-membrane` 27200-04, `adaptive-quality` 27208-10 in `tryPresentedCall`; fence-stats belt inside `_publishSnapshotFenceStats` (25398) covers all 4 call sites (26498, 27140, 27162, 27183).
10. **arrivalReserve composite epoch — PASS.** `arrivalLiveEpoch = serviceFaultEpoch(owner.state)` (3100); epoch flip → parked iter closed + `_arrivalReservePending=true` (3103-07); bounded retry `{faultEpoch, retries≥3, retryAt+1000}` (3111-13); forced-wallet fixture fallback debits (3121-29); catch stamps `noteLaneFault('arrivalReserve', retries>=3)` (3150).

Excluded per brief: BatchedMesh specimen gap, loading artwork GL pause, ambient compile-tail serialization, LOD-F2/F3/F5, LOD-N4, world-store.js/slotMap, BOOT-F3(a) generator split, BOOT-F7 emit slicing, F4/F5/F9 tick-paced emit slicing, F6 combat:damage intern, next-wave-nxb-059 stale test, and the preexisting test-failure list.
