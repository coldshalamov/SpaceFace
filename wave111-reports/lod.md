saturated: false

# W111 lod-in-frame audit — SpaceFace @ 74cb6ef65 (branch devin/1791416524-perf-w110)

Scope: LOD-in-frame lane of renderer.js / shadowDepthAdmission.js / decodeTaskBudget.js / visualCullRadius.js. Read-only audit; no code run beyond inspection. Closure doc + hillclimb log and adjudicated/deferred lists honored — every finding below is a new mechanism, not a re-report.

## Findings (ranked)

### F1 — Unsigned-window signature consults pay a sync O(scene) traverse per call
**Evidence:** `shadowDepthAdmission.js:553` (`collectUnstagedShadowCasters` mints `lightCensusSignature(lightingScene)` when `lightSigOverride` isn't a string), `:570` (`markCastersDepthStaged` same fallback inside the ceremony), call sites `renderer.js:17491-17492` (per-512-subject chunk loop), `17576-17577` (rescan delta loop), `29328` (arm's per-root collect, up to 32 roots per arm fire). All pass `freshDepthLightSig()` / `_shadowCensusForFrame()` which serve `null` while the stepped census mint pends (or is storm-parked). Also `renderer.js:641-644`: retry legs take `depthOpts.lightSigFor()` → `null` → `lightSigOverride = null`.
**Mechanism:** the stepped memo exists to amortize one whole-scene light traverse per pass; while unsigned, EVERY collect call re-pays that traverse synchronously — N chunks or roots → N traverses inside paced/async legs. Bonus damage: `compileShadowDepthPipelinesSteps` requires `lightSigOverride !== null` for `_depthStageSessions` reuse (`shadowDepthAdmission.js:674`), so an unsigned window also defeats session reuse → full staging-session re-mint per arm.
**Fix sketch:** mint the signature once per unsigned epoch-window and share it — e.g. a per-`_viewSyncSeq` cache beside `_shadowCensusForFrame` that the collect sites consult, or let `collectUnstagedShadowCasters` accept the memo object and serve the in-flight mint's partial/last-good sig. Signature content is unchanged; purely memoization.
**Effort:** M. **Magic-frame impact:** H (the traverse is exactly the class this lane hunts — atomic whole-scene walk multiplied per call inside presented-frame legs). **Risk:** low.

### F2 — Storm-pinned epoch never re-arms the census mint
**Evidence:** `renderer.js:29020-29028` (`memo.superseded >= 4` pins `memo.stormEpoch`, permanently unsigned for the census epoch); flag consults `28594`, `29721`, `11700s` (`collectUnstagedShadowCastersFlag` with null sig → every caster reads unstaged → withhold); parked-recheck sig compare `28438-28442`.
**Mechanism:** a sector swap plus a persistent mint fault (or 4 rapid supersedes) leaves the epoch permanently unsigned: flag consults withhold every capable caster for the whole epoch — newly promoted casters stay dark until an enter/restore flips the epoch — and F1's per-call traverses never stop. No retry arm exists for the stepped mint itself; only epoch flips clear it.
**Fix sketch:** bounded storm pin — re-arm the stepped mint after K passes or a wall-clock cooldown (mirror `sigFallbackSeq`'s once-per-seq budget or the lane fault-retry pattern).
**Effort:** S. **Impact:** M (real visual regression under a rare path: missing new shadows for the epoch, plus F1 cost). **Risk:** low.

### F3 — `driveHoldExemptDegrade` is a private-clock-only slicer
**Evidence:** consults `pacedFrameSpend()` at `renderer.js:3699-3700` but never calls `notePacedFrameSpend` — no debit anywhere in the function (returns at 3703). Compounded: caller `enqueueHoldExemptMeshBuildsSliced` early-returns into it at ~3760, so the caller's exit debit at 3993 doesn't cover these slices either. Additionally the four holdExempt stepped catch paths (3819, 3854, 3928, 3947) early-return skipping the caller debit — faulted slices are free to the ledger.
**Mechanism:** same recurring class as prior waves — a stepped lane that reads the shared wallet but never writes. Its 16ms slices are invisible to sibling lanes' consults, so per-frame budget accounting under-reads exactly when the degrade lane is active (post-fault, high load).
**Fix sketch:** debit `notePacedFrameSpend(elapsed)` at every exit of `driveHoldExemptDegrade` (try/finally), and route the four catch-path early returns through the caller's debit (or wrap the whole stepped lane in a shared consult+debit helper so the class can't recur).
**Effort:** S. **Impact:** M. **Risk:** low.

### F4 — keepGpu reconcile degrade: forced consult without mint-time forced debit
**Evidence:** `renderer.js:2718` consults `forcedFrameSpend() < FORCED_FRAME_BUDGET_MS`, then mints a stepped `_reconcileMeshesSteps` iterator at 2726-2730 with zero `noteForcedFrameSpend` at mint (only the fixture else-branch at 2743 debits). The minted drain's subsequent slices debit the PACED wallet at 2789, not the forced one.
**Mechanism:** the consult-before-mint / debit-at-mint contract this wave established: consulting the forced wallet and minting work without debiting lets a second forced lane consult the same clean wallet in the same tick — the exact double-spend the contract prevents. Degraded-rescue slice work is real (it's counted against paced later), but the forced wallet never sees the mint's charge.
**Fix sketch:** `noteForcedFrameSpend(<mint charge>)` at the mint site (or debit the drain's measured slices to the forced ledger while `armForcedRun`).
**Effort:** S. **Impact:** L-M. **Risk:** low.

### F5 — laneFaults stamp gaps (hunt-b enumeration)
Lanes that warn per fault but never `noteLaneFault`, so the diagnostics rollup can't see accumulated fault counts:
- `protectedFirstFlightDrain` stepped catch (`2463`) — the lane only stamps when its degrade twin fires (2429); faults 1-2 invisible.
- keepGpu mesh reconcile catch (`2768`) and keepGpu reconcile degrade catch (`2740`).
- `arrivalRoster` catch (`3078`).
- holdExempt warm-refill/collect/enqueue/kick stepped catches (`3819/3854/3928/3947`) — only the sync-twin and degrade sites stamp.
- `rebuildBridge` settle (`2549`), flight shadow-depth admission (`11744`), `meshBuildDrain` (24457 warns via `laneWarn` but never stamps).
- ~20 cook-path drive catches warning "running the sync twin" (600, 616, 10610, 10868, 10904, 10926, 11559, 11617, 11657, 12693, 13131, 13263, 13388, 13508, 13586, 13648, 13715, 13742, 13877, …) — mostly load-mode lanes, so warn volume is bounded by epoch parking anyway.
**Mechanism:** the warn dedup (laneWarn) caps log volume; the rollup is the observability contract. Sites using raw `console.warn` per fault are additionally outside the dedup (bounded only by their per-epoch fault caps — currently ≤4, so the blast radius is diagnostics, not warn spam).
**Fix sketch:** stamp `noteLaneFault` in each listed catch (and prefer `laneWarn` for the presented-frame-adjacent ones).
**Effort:** S. **Impact:** L. **Risk:** trivial.

### F6 — Hunt (c): remaining per-pass O(subtree) walks, ranked
Beyond F1, no remaining *unbounded* per-pass traverse in the lod/depth/cull paths; the residual bounded ones by worst-case:
1. `collectPotentialShadowCastSubjects` per root — `SHADOW_DEPTH_PASS_NODE_CAP`-bounded.
2. `collectUnstagedShadowCastersFlag` evals — nodeBudget-capped; over-cover parks the root.
3. `drawnCullRadiusForMesh` → `Box3.setFromObject` — ~4/pass budget + stale-serve (`visualCullRadius.js:127-179,336,378`).
4. Hidden freeze/unfreeze mints — bounded queue (`_queueHiddenSubtreeFreeze/Unfreeze`).
5. `updateMatrixWorldSteps` — stepped, vendored early-outs skip frozen/clean subtrees.
No action beyond F1.

## Regression notes — W110 checklist @ 74cb6ef65
1. **Post-step wallet floors:** VERIFIED — rebind drain (post-step consult 27052-53, exit debit 27055-57), fence pack (pre-mint consult 27093-94, post-step 27148-49, debit 27151-53), flight reconcile (3239-44), residency poll (3303-07), arrival reserve (3160-63). Exceptions enumerated → F3/F4.
2. **Reattach-mint gate:** VERIFIED — feed-moved mint requires `!owner._residentReattachIter` and fault-epoch clear (2619-22); `mintResidentReattachSweep` closes the in-flight iter via `iterator.return()` before re-minting (1938-52); event-site mints gated identically (19326, 19401). No path clears the in-flight marker without closing the iterator (identity-guarded clear at ~2605).
3. **Forced double-spend:** MOSTLY VERIFIED — mint-time debits at pack pre-mint consult (27093-94), sync twins, sigFallback (29121). Residual → F4.
4. **Publish-tail coverage:** VERIFIED — all 13 sites route through `tryPresentedCall` (26502-26589 + `activity-frame` at 27224) with correct-typed fallbacks (`shadow-cast-radius` → `_frameShadowCastRadius`/`SHADOW_ORTHO_EXTENT`; `keylight-frustum`/`shadow-follow`/`shadow-refresh-schedule` → false; `active-shadow-camera` → prior camera; instance submissions → void); band yields are stepped-generator yields paced by the driver's `yieldToBrowser`, not rAF.
5. **Spawned-bind chain gate:** VERIFIED — `_openingSpawnedBindActive` set at mint (27002), cleared in the leg's `finally` (27010) which runs on `.return()` through the `yield*` chain (23602-05) and on drive catch (27029-38); both concat sites dedupe via Set (26465-66, 26930-31); pending-list identity guard prevents clearing a newer list (27006). No flag-leak or lost-slot-id path found.
6. **Census sigFallback presented gate:** VERIFIED — null `memo.sig` serves unsigned with no traverse while `paceEpochNow() >= 0` (29051); sync `lightCensusSignature` fallback only when `paceEpochNow() < 0`, once per `_viewSyncSeq`, under the forced wallet with debit (29095-29121); parks after 3 faults (29113-17).
7. **laneWarn dedup:** VERIFIED — epoch-keyed reset on `serviceFaultEpoch` flip (2130-32), first 8 verbatim then one summary per lane per epoch (2134-40), non-render-state owners warn unconditionally (2125).
8. **laneFaults completeness:** PARTIAL — stamped at fence-pack catch (27133), holdExemptDegrade catch (3686), both shadowCensus catches (29063, 29113), plus entityViewRow/entityViewSync/presentedTail.*/depthStageArm/residentReattach/arrivalReserve/residencyReconcile/residencyPoll/holdExemptEnqueue(sync twin)/shadowPolicyRoot/protectedFirstFlightDrain(degrade only). Gaps → F5.
9. **prepareFrame head belts:** VERIFIED — `_frameMembrane.sync` + `_applyFrameOriginRebase` inside one `tryPresentedCall` (27201-04); `_adaptive.update` belted (27209); `_publishSnapshotFenceStats` belt inside the method (25398) covering all call sites.
10. **arrivalReserve composite epoch:** VERIFIED — `_arrivalReserveEpoch`/`_arrivalReserveFaultEpoch` key on `serviceFaultEpoch(owner.state)` = enterSerial|contextRestoreSeq (3100-3120); a context restore without enterSerial flip mints a new epoch → parked reserve iter closed (3103-06) and retry ledger reset (3111-13).

## Hunt (d) verdict — sfRowFaultedEpoch structured retry
CORRECT as landed. Hidden loop gates at row top (25573) and stamps in its catch (25646); visible loop same (25687/26059). On cooldown lapse a healed row re-executes its ENTIRE row body — pose write, visibility apply, closure calls are all idempotent set-to-current writes, so a mid-body fault's partial application is fully re-applied by the retry; no half-applied state persists. Rows parked at ≥3 faults/epoch serve last pose — the intended degrade direction.
