# W113 audit — lod-in-frame

Audited HEAD `e83550298` on `devin/1791416524-perf-w110` (W112 landed). Read-only; no code run.

**saturated: false**

## Findings (ranked)

### F1 — verdict/mark signature divergence on mid-leg census flip (residual a) — H impact / S-M effort / L risk

The arm pins `lightSig` at collect time (`renderer.js:29680`) and reuses it as the verdict sig in `.finally` (`renderer.js:29890`). `casterDepthMarkCurrent` is an exact `mark.l === lightSig` compare — there is no legacy/foreign-epoch accept clause (`shadowDepthAdmission.js:332-356`). Two divergence paths:

- **(i) pinned-stale verdict**: `driveCompileShadowDepthPipelines` aborts a stale leg and retries with `lightSigEpoch`/`lightSigOverride` re-minted via `lightSigFor` (`renderer.js:637-646`), so a census flip mid-leg leaves marks under **S2** while `.finally` compares under the arm-time **S1** → every staged mesh reads unmarked → whole root deny-parked (`renderer.js:29901-29939`). The park is stamped `lightSig: S1` **and** `lightSigEpoch: shadowCensusEpoch()` (current, post-flip epoch) — so the drift release clause needs an epoch mismatch that already matches live and cannot fire (`renderer.js:28716-28723` region: requires `lightSig != null && lightSigEpoch !== live epoch && sig != memo`). `deniedAllowCast: true` blocks the allowCast clause. Exit is only the escalating recheck (~96–768 evals ≈ seconds of real shadow outage on a legitimately staged root) plus a permanent `sfDepthUndrawableCycles` escalation on the root.
- **(ii) stale-serve inverse**: when `lightSig` is null the collect/verdict ride `_shadowCensusForFrame()`, which deliberately serves the **previous** sig while the stepped remint is in flight (`renderer.js:29283-29292`, "identical-or-older, never ahead"). During that window the flag collect marks **S0**-keyed casters as staged while the live census is already E1 — they are never withheld and draw their `...|S0` depth variant, which was never compiled under E1's light counts → in-frame program link. Serving stale is the right trade vs serving null (mass withhold), but it leaves a multi-present window where census flips still brick the very class this machinery gates. A third sub-case: session mints `markLightSig` live (`shadowDepthAdmission.js:717-725`) while verdict reads a still-stale memo sig → same false-deny as (i).

**Fix sketch**: in `.finally`, gate the verdict on `shadowCensusEpoch() === armSigEpoch` (treat a flip like `legAborted` — roots stay queued, safe direction), or return the actual `markLightSig` the session staged under from `driveCompileShadowDepthPipelines` and compare under that. For (ii) the collect could additionally re-prove marks only when `memo.epoch === live epoch`; a cheaper partial is gating just the *deny* mint (denial is the destructive direction; "staged" under stale sig is survivable since stale programs eventually re-link or get withheld next arm).

### F2 — post-rescue strand: `pending` left non-empty with no re-arm (residual b) — M impact / M effort / M risk

At `armFaultCount >= 3` the rescue loop (`renderer.js:29577-29619`) can exit with `pending.size > 0` via three paths: deferred-leg roots `continue`d at `29586`, rescue-deadline break at `29578`, wallet-spent gate at `29572` (skips the whole rescue). Post-loop `:29623-29628` sets `_depthStageScheduled = false` and returns unconditionally when pending survives — no re-arm. The stranded roots' withheld casters stay dark until an unrelated `_queueShadowDepthStage` enqueue; within the same epoch a re-arm can't help anyway (faults ≥3 → fault gate → degraded-epoch already stamped at `29573` → re-park), so worst case waits for both an epoch flip and an enqueue. Field parity vs the restore leg checks out otherwise: `sfDepthUndrawableCycles` cleared (`29616`), `STAGE_SELF_DIRTY_KEY` stamped (`29617`), `authoredCastShadow` branch preserved (`29587-29591`), `_policyStepsParked` resume semantics consistent (`driveShadowPolicySteps` consumes/abandons by sig at `31574-31638`), withheld set cleared per restored root (`29614`). Minor: a root queued while parked keeps its `_parkedDepthStageRoots` row through a rescue restore — zombie park entry; self-corrects via `seq` compare on next eval, bookkeeping-only.

**Fix sketch**: after the rescue, if `pending.size > 0`, schedule a deferred-completion re-arm (the deferred leg's `.finally` already re-queues leftovers — piggyback a `_armDepthStage()` call there), or clear the fault count only when the rescue fully drained so a later enqueue retries the ceremony rather than re-parking.

### F3 — rescue sync walk is atomic per root (residual c, worst remaining traverse) — M impact / S effort / L-M risk

The rescue calls `driveShadowPolicySteps` with `() => false` as the deadline (`renderer.js:29594-29598`): the 8 ms rescue deadline only bounds **between** roots — one sector-scale root (station-class, tens of thousands of nodes) pays an uninterruptible whole-subtree walk inside the fault gate, adjacent to present. Contrast the restore leg, which passes a real deadline and parks mid-walk via `_policyStepsParked`. Ranked remaining O(subtree) walks: (1) this rescue walk — unbounded mid-walk, once per fault epoch; (2) `_bindPresentationMesh` first-bind work per matched row inside `reattachResidentGpuMeshesSteps` (`stampCanonicalSurfaceProgramKeys` subtree walk etc., `renderer.js:2002-2015`+`23202-23227`) — stride yields bound between rows only; (3) `collectUnstagedShadowCastersFlag` per dirty pass — bounded by shared `_depthCollectNodesLeft`; (4) `countShadowReceivers` inline at `30309/30330` — node-cap + per-pass cap, bounded; (5) per-row bodies in `syncEntityViewsSteps`/opening collects — memoized cull radius + freeze queue per row.

**Fix sketch**: pass `() => armNow() >= rescueDeadline` as the rescue deadlineFn — `driveShadowPolicySteps` already returns `null` and parks the iterator on deadline, resuming next pass. Verify `receiverDelta` accounting carries through the parked resume.

### F4 — reattach scan iterates a live `_meshes` map across yields (residual d) — L-M impact / M effort / L risk

`reattachResidentGpuMeshesSteps` scans `this._meshes` live with stride yields every 64 rows / ≥2 ms (`renderer.js:1994-1998`). Map iteration semantics: a key deleted-then-re-added by an external path mid-yield (despawn → respawn, other bind lanes) re-visits the row → `_bindPresentationMesh` runs twice (per-row idempotency dampens it — `sfStableEntityKey` rewrite is stable, `sfHiddenFrozen`/`sfHiddenFreezeQueued` dedupe the freeze queue — but `world.bindMesh` at `23227` and `lanes.reserve` pay again); a key deleted while pending is skipped → mesh stays under its old resident id until the next reattach. The rekey loop's re-guards (`renderer.js:2053`: `owner._meshes.get(oldId) !== mesh || owner._meshes.has(entity.id)`) cover identity and name collision but not **liveness**: `entity`/`target` captured at deferred-collect time (`2032-2044`) can die mid-window → mesh rekeyed onto a corpse owner. `stamped` (`sfStableEntityKey` read at scan time) going stale is handled safely — a `has(entity.id)` mismatch just skips the rekey, leaving the mesh under its old key for the next pass.

**Fix sketch**: snapshot scan keys before iterating (or visit-log visited rows), and re-check `entity.alive`/`entity.mesh === mesh` inside the rekey loop before the set.

## Regression verification — W112 machinery (all confirmed at HEAD `e83550298`)

| Item | Verdict | Evidence |
|---|---|---|
| lod F1 markSig discipline | OK (F1 hole above) | `markSig`/`verdictSig`/`leftoverSig` re-consult memo when `lightSig` null: `29696`, `29890`, `29966-74`; verdict skipped on `verdictSig == null`: `29891` |
| lod F2 unsigned-window collect gates | OK | collect loop `break` on `markSig == null` `29748`; skipped tail `slice.splice(collected)` then `pending.set` `29815-24`; post-opening 512-chunk collects hoist `freshDepthLightSig()` (=`_depthCollectLightSig` `17566`) and break unsigned: `17583-89`, `17673-78`; atomic `lightCensusSignature` mints only under `paceEpochNow() < 0`: `29400`, `29450`; all `driveCompileShadowDepthPipelines` sites pass `lightSigFor` |
| lod F3 `_dmg*` latch ordering | OK | latches commit after `updateDamageState` `~26082-26092` |
| lod F4 storm-pin epoch transfer | OK | `stormEpoch`/superseded reset on real epoch flip `29294-29302` |
| lod F5 arm sig stamps | OK | overcap park `lightSig: markSig` `29781`; denied park `lightSig: verdictSig, lightSigEpoch` `29921-22`; deliberate else-branch re-key via `_shadowCensusForFrame()` `28760` |
| lod F6 reattach strides | OK | scan `%64` or `>=2ms` `1994-98`; rekey `%64` or `>=2ms` + identity re-guard `2048-53` |
| lod F7 settings-enable memo preserved | OK | `_shadowCensusMemo = null` only on scene change `29281`; comment `30159-61` |
| lod F8 `{seq,epoch}` sig cache | OK | `_depthCollectLightSig` cache `29440-29462` |
| popin P1 park back-fill drift guard | OK | `28697-28712`; drift clause requires non-null sig + epoch mismatch + sig!=memo `28716-23` |
| popin P2 forced-wallet consults x5 | OK | `deepSkyPlates.js:223-231`, `spaceBackground.js:1871+`, `2807+`, `partsLibrary.js ~7410-31`, `drivePoolAdmissionIfUnclaimed ~13615-30` — consult `forcedFrameSpend()` without committing skip streaks |
| popin P3 degrade debit hoist | OK | `twinStart` hoisted above entities/collect `~3687-3697` |
| popin P5 hold-exempt envelope catch | OK | try wraps the whole `enqueueHoldExemptMeshBuildsSliced` loop; all exits park+warn+fault+debit `~3856-4060` |
| boot F-1 republish verdict clear | OK | `_openingPublishDegradeVerdict = undefined` before mandatory republish `~26981-26992`; memo epoch-scoped `26961-69` |
| boot F-2/F-3 stride clocks | OK | `collectOpeningEntityRootCandidatesSteps` `%32` or `>=2ms` `1029-45`; both `syncEntityViewsSteps` sweeps `>=2ms` `25730+`, `25855+` |
| hitches H1 arm retry/rescue | OK | fault gate + retry + rescue `29562-29628`; `_noteDepthStageArmFault` epoch-scoped + 1s retry `30129-41`; clean-drain resets faults `~30109` |
| hitches H2 brick dedup | OK | `bloom.js`: full payload brick 1, every 120th, >=1s heartbeat, `suppressedBricks` counted |
| hitches H3 bus dedup | OK | `noteBusHandlerError` 8-verbatim + 1s heartbeat across dispatchRange/sliced/presentation drains (`eventBus.js`) |
| hitches H4-H6 warn routing | OK | renderUpdatePhase 20+1 caps; `noteAuthoredWarn` (type,entityId)-keyed, 8-verbatim, 512-cap; `stormWarn`/`laneWarn`/`warnOnce` routing; touchFailDiag 4/epoch |

No W112 machinery found regressed. F1/F2/F3 above are residual classes the wave's own fixes left open (documented, not regressions).
