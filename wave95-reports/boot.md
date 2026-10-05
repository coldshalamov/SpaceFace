# Wave-95 boot-loading audit

HEAD audited: `332e07670` on `devin/1791064509-perf-w60` (`docs: wave-94 wave log`). Read-only audit — no code touched, golden `892f88c9` untouched.

`saturated: false`

## Findings (ranked)

### F1 — The cook's `present` branch mints the whole compile cohort in one atomic stretch

**Evidence**
- `src/render/renderer.js:13919-22` — `const units = uniqueAdmissionUnits([...lateRoots.flatMap((root) => collectCompileSubjects(root)), ...shadowSensitiveLeftovers, ...neverDrawnPools])`. The other five `uniqueAdmissionUnits` call sites all slice input at 1024 subjects with pacing between chunks (`:10080`, `:11711`, `:13143`, `:14520`, `:15423`); this is the only unchunked mint.
- `:13863-13921` — after the paced `buildOpeningSubmissionPlanSteps` drive (`:13849-58`, `await yieldToBrowser` every ≥4 ms) there is no `await` until the compile/touch drive: `openingRoots` mint (`:13864-72`), the `lateRoots` ternary (`:13875-94`) calls sync `collectInstancePoolCompileRoots(scene)` — a whole-scene census — on both branches (`:13886` filtered asteroid-only for the warm path, `:13893` unfiltered beside `collectLateAdmittedCompileRoots(this._meshes, openingSubjects)`), `shadowSensitiveLeftovers` flat-maps `collectCompileSubjects` over `firstFlightRoots` (`:13904-10`), and the `units` argument flat-maps it again over the union of openingRoots + firstFlightRoots + preparedRoots + late-admitted + every instance-pool root. `collectCompileSubjects` is a per-root sync subtree traverse; the cohort union covers most mounted scene subtrees.
- `uniqueAdmissionUnits` (`src/render/openingGpuAdmission.js:401`) is itself a synchronous material/geometry dedupe — the 1024-slice chunking is caller-side convention this site doesn't follow.
- Same cook, `:14163` — `for (const root of collectInstancePoolCompileRoots(scene))` — a second sync whole-scene census to find asteroid buffer roots, ~270 lines before the paced `poolCensus` (`:14437-44`) derives the same root set.

**Mechanism** — This is the `options.present === true` block of the opening cook (initial New Game and every jump cook; same-sector F9 recook exits early via `skipCompile`). The census + two flatMaps + whole-cohort dedupe evaluate atomically inside the loading window — the largest single atomic stretch left on the opening path. It freezes the loading shell's own presented frames (veil/progress animation can't tick) for the duration of ~2 scene-wide censuses + subtree walks over the entire compile cohort + one unchunked dedupe pass. On constrained hardware this is the frozen-loading-screen signature this lane exists to kill; on fast hardware it is still the largest unyielded block in the window.

**Fix sketch** — Mirror the chunked convention the five sibling mints use: build the cohort as a paced flatMap (`await` the cook's pace fn per root — same `bucket === undefined` pattern W94 applied at `:14494`) and slice the `uniqueAdmissionUnits` input at 1024 like `:14520`. `collectInstancePoolCompileRoots(scene)` is consumed twice here (:13886/:13893 + `:14163`) and again paced at `:14437` — hoist one fused `collectInstancePoolCompileRootsAndSubjectsSteps` census ahead of the buffer-root loop and share its `roots`, or memo the roots census per scene+epoch.

**Effort** M · **magic-frame impact** H (every jump/initial cook pays it inside the window it is supposed to keep moving) · **risk** L — pure scheduling; cohort contents and order are unchanged (DFS order per bucket preserved by construction, same argument as `:14459-63`).

### F2 — Shadow-depth drift retries re-mint the whole generator: the light-independent subject census re-pays every attempt (≤4×)

**Evidence**
- `src/render/renderer.js:530-558` (`driveCompileShadowDepthPipelines`) and `:15589-15608` (`driveDepthCompile` twin): `for (attempt<4) { iter = compileShadowDepthPipelinesSteps(depthOpts); … }` — the generator is re-minted from the top per attempt.
- `src/render/shadowDepthAdmission.js:586-674` — each attempt re-runs `yield* collectPotentialShadowCastSubjectsSteps(subjects)` (`:605`; per-subject subtree DFS `:223-260`), then the session-reuse check (`:634-637`), which requires `heldSession.epoch === shadowCensusEpoch()` — never true after a drift retry (the advanced epoch is what made it stale) — then the whole-scene light census (`:643-674`) and a fresh `createShadowDepthStagingSession` mint (`:720+`, including the atomic `renderer.render(staging, camera)` census render at `:874`).
- Routine boot drives pass the whole scene as the subject set: `subjects: [scene]` context-restore (`renderer.js:9566`), `sweepSubjects.push(scene)` survival sweep (`:13528`), `subjects: cookCompileRoots.concat([scene])` survival cook (`:14632-35`).

**Mechanism** — Light churn peaks inside the loading window: palette/sector/station lights mount, precompile stand-in lights mount and unmount, `_syncShadowMapEnabled` flips — every one bumps `shadowCensusEpoch` (`noteShadowCensusLightMutation`, `shadowDepthAdmission.js:431`). A mid-drive `stale` verdict therefore fires most often exactly when the cohort is largest. Each retry re-pays (i) the subject census — a full subtree walk that reads no light state and yields an identical set every attempt — plus (ii) the whole-scene light census, plus (iii) a new staging session + atomic census render, all drawing on the shared `PACED_FRAME_BUDGET_MS` wallet the live cook's paced legs need. Worst case ≈ 4×(cohort census + light census + session mint + per-32-caster slices) inside one loading stretch; on exhaustion the `aborted:true` mint means the cohort staged nothing, so the next caller re-pays the whole thing again. W94 enumerated this under (d) #2; the bound is the 4-attempt loop — elevated to a finding because the boot lane owns the worst callers and the fix is now concrete.

**Fix sketch** — Hoist the light-independent half out of the retry: collect `casting` once at drive entry and pass it via `depthOpts.precollectedCasting` (or split `compileShadowDepthPipelinesSteps` into a census phase + stage phase so retries re-mint only the light census/session). Optionally allow session reuse on `heldSession.sig === lightSigOverride` across an epoch bump — the epoch term guards stale staged-light clones, but a sig-identical churn (a mount+unmount pair) re-mints a session that is program-key-correct; if clone freshness matters to the census render, gate on sig-match plus a light-content version rather than the global counter. Cheaper partial: scale the retry cap to cohort size (`subjects:[scene]` drives get 1-2 attempts; arm-leg cohorts keep 4).

**Effort** M · **magic-frame impact** M · **risk** L-M — a mint-time `casting` set is semantically identical to today's attempt-1 census (subject-subtree mutation between census and slice is already possible inside one attempt; the drift contract only promises fresh light sigs). Sig-only session reuse needs the cloned-light freshness question answered (clones feed the census render, not just keys).

### F3 — Paced opening-path loops still lack supersede guards: dead-scene work runs to loop end

**Evidence**
- Rescan path: `postPace` (`renderer.js:15291-98`) is a pure wall-clock pacer (`yieldToBrowser` + ledger debit, no epoch check). `passEpoch` is minted once (`:15247`) and re-checked only at the rescan while-head (`:15637-38`) and before the released stamp (`:15707-10`). Between them, `collectLateAdmissionCensus` (`:15305-63` — paced every 256 nodes but never epoch-checked), the unstaged collect loop (`:15611-21`), `driveDepthCompile` (`:15624`), and each rescan pass's legs (`:15644+`) all run to completion after a `sector:enter` flips `enterSerial`.
- Cook path: `paceCookStretch` (`:14429-36`) is likewise a pure pacer — the guards are `cookStale()` per-step inside the census drive (`:14440`) and at leg boundaries (`:14410`, next at `:14617`). Between `:14440` and `:14617` the subject-bucket loop (`:14480-87`, iterates the whole fused census) and the W94-paced unbucketed fallback (`:14489-97`) await `paceCookStretch()` with no `cookStale()` inside.
- Seal path mirrors the shape: census drive checks per-step (`:13066-69`); the bucket loop (`:13107-13`) checks nothing.

**Mechanism** — A `sector:enter` landing mid-loop leaves the superseded pass/cook burning the shared paced wallet on the dead scene: whole-scene censuses, unstaged collects, and a depth compile (itself up to 4 drift retries — F2) complete before the next guard reads the new epoch. The released-stamp guard keeps the *result* correct; the *spend* is pure waste charged against the live epoch's loading window — the stretch that decides when the veil lifts. Stale-scene compiles also link programs for a scene that will never present them.

**Fix sketch** — Thread the stale check into the pacer or the loop cadence: `postPace`/`paceCookStretch`/`sealPace` could return a `superseded` flag (or the loops re-check `enterSerial`/`cookStale()` every N awaits — the census loops already run a per-256 cadence to piggyback). Bail to the existing pass-head superseded return rather than mid-expression; every leg is already fail-open.

**Effort** S-M · **magic-frame impact** M · **risk** L — early bail only defers work the next epoch's pass recollects anyway; the released stamp is already correctly gated.

### F4 — Survival-seal unbucketed fallback missed W94's per-root pacing (third twin)

**Evidence**
- `src/render/renderer.js:13116-19` — `if (bucket === undefined) { sealSubjects.push(...collectCompileSubjects(root)); }` — no `await sealPace()`, though `sealPace` is defined at `:13054-61` and awaited per subject in the bucket loop directly above (`:13108`) and per 1024-unit chunk below (`:13150`).
- The defensive Steps-less `else` branch mirrors the miss unpaced (`:13124-26`).
- W94 landed the same await for the rescan twin (`subjectsForCompileRoots`, `:15399-404`) and the cook twin (`:14494-95`); this third instance keeps an unpaced per-root subtree traverse in the fallback path.

**Mechanism** — A pool root the fused census never bucketed (detached holder, subject-empty pool root) pays an atomic subtree traverse inside the seal's otherwise-paced stretch — one atomic gap per such root, the same class W94 fixed in the two sibling loops.

**Fix sketch** — `await sealPace()` inside the `bucket === undefined` branch, verbatim from the cook twin.

**Effort** S · **magic-frame impact** M (bounded per root; fires only for bucket-less roots — rarer than the cook's) · **risk** L.

### F5 — `_shadowCensusForFrame` re-pays a whole-scene traverse per mid-frame light mutation

**Evidence**
- `src/render/shadowDepthAdmission.js:401-24` — `lightCensusSignature` traverses the whole scene (callback visits every node).
- `src/render/renderer.js:25167-78` — memo keyed on `(seq, scene, epoch)`; `epoch` is `shadowCensusEpoch()` read per call. Eight call sites evaluate per presented frame while the policy machinery runs (`:24864`, `:24890`, `:24962`, `:25312`, `:25390`, `:25512`, `:25707`, `:10675`).
- Standing in W93/W94 residuals; the sharper mechanism: the memo's "once per `_viewSyncSeq` miss" bound holds only while the epoch is stable — during the loading window `noteShadowCensusLightMutation` fires per light mount/dispose, so every call site after a mid-frame mutation re-walks the whole scene. A mutation storm can re-pay up to ~8 whole-scene traverses in one presented frame.

**Mechanism** — Presented-frame whole-scene walks during exactly the window where mounts churn fastest (sector lights, palette dressing, precompile stand-ins). W94's parked-recheck piggyback removed the per-eval census; the epoch-term invalidation is the remaining cost.

**Fix sketch** — Fence the epoch read to pass/frame start: read `shadowCensusEpoch()` once at the top of the frame's policy pass (or latch it with `_viewSyncSeq`) so mid-frame mutations invalidate the NEXT frame's memo instead of re-walking inside this one; the sig terms feed program-key/staging decisions that already settle at pass granularity.

**Effort** S · **magic-frame impact** L-M · **risk** L-M — a mid-frame mount waits one frame for sig visibility; consumers re-read on their own cadence anyway (the parked-recheck arm re-keys on its ~96-128-eval cycle).

### F6 (minor) — Cook buffer-roots census re-walks the scene synchronously

**Evidence** — `src/render/renderer.js:14163` — `for (const root of collectInstancePoolCompileRoots(scene))` filters asteroid pool roots for `addFirstFlightBufferRoot`: one whole-scene sync walk inside the cook, ~270 lines before `poolCensus` derives the same root set paced (`:14437-44`).

**Mechanism/fix** — The fused census could serve both if hoisted ahead of the buffer-root loop (or this sync call deferred onto the paced census's result). Bounded to one traverse per cook — small, and free to reclaim alongside F1's hoist.

**Effort** S · **magic-frame impact** L · **risk** L.

## Residuals enumeration (a)–(e)

**(a) Retry re-pays census per attempt** — enumerated in full as **F2**. Bound: ≤4 attempts × (subject census + [non-reusable] light census + session mint + atomic staging render + ≤32-caster slice passes). The subject census is light-independent → hoistable; the light census + session mint are epoch-conditional → re-paid on every drift retry.

**(b) Other `legAborted` consumers / shape reliance** — `.aborted` has exactly one reader: the arm's denied-park gate (`legAborted` mint `:25485`, consumed `:25486` skipping the `allUnmarked` park). All other drive-result consumers ignore `aborted`: context-restore `:9562`, rock-reskin `:9819`, seal `:13171`, and arm `:25453` discard the result (sequencing only); `warmOpeningShadowPipelines` `:11635` returns it for readers that check `.ok`; the survival sweep `:13539` reads `stagedKeys/stagedNames/signatureDiff` for its probe record — on `aborted` it keeps the prior `survivalDepthSweepKeys` record (the cohort never staged, so the prior record remains the truthful last-staged set — cosmetic nuance, no contract break); cook `rockPools.depth` `:14626` carries the raw shape into a diagnostic dump with no field-dependent reader. `aborted:true` on the drift-exhaustion mint therefore changes no shape any diagnostic relied on — additive, consumed only where intended. Test pin `test/shadow-depth-admission.test.mjs:651-53` asserts `aborted === true` on the session-closed shape — consistent.

**(c) Interrupt/stale-guard interactions on rescan + cook** — enumerated as **F3**. Correction to the brief: `paceCookStretch` itself does NOT guard staleness (pure pacer `:14429-36`); the cook's guards are per-step in the census drive (`:14440`) and at leg boundaries — the bucket loop (`:14480-87`) and W94's own unbucketed fallback (`:14489-97`) run a full census-scale loop between `:14440` and `:14617` with no `cookStale()` inside. Rescan: epoch checked only at while-head `:15637-38` and released-stamp `:15707-10`; `postPace` never checks; every intra-pass leg is unguarded.

**(d) Remaining atomic stretches on the opening path, ranked by worst-case node count after W94:**
1. **F1 cohort mint** — `lateRoots.flatMap(collectCompileSubjects)` + unchunked `uniqueAdmissionUnits` (`:13919-22`) — ~whole mounted cohort, once per jump/initial cook. Largest single atomic block.
2. `collectInstancePoolCompileRoots(scene)` sync census for buffer roots (`:14163`) — whole scene, once per cook (F6).
3. `syncShadowCasterPolicy` verdict/scoped/`needsAtomicOut` traverses — atomic per root subtree; the pass cap counts traverses (8), not nodes — a fat holder root (~10³ nodes) pays atomically in a presented frame. Deliberate fail-open class.
4. `collectUnstagedShadowCasters` per call — sync, bounded by the shared `SHADOW_DEPTH_PASS_NODE_CAP=4096` wallet (`:15612-21`, `:15691`); paced between 512-root batches.
5. Staging-session census render `renderer.render(staging, camera)` (`shadowDepthAdmission.js:874`) — atomic GL submit scoped to staged casters per mint; deliberate.
6. `lightCensusSignature` whole-scene traverse per memo miss → F5.
7. `collectCompileSubjects(root)` per-root — atomic per subtree; paced between roots post-W94 (cook/rescan; seal missed → F4).
8. `session.slice` ≤32-caster sub-pass reparent+render+restore — deliberate atomic window (`:1019-35`).
9. Steps-less defensive fallbacks (`compileShadowDepthPipelines` syncDrive `:740`, census trio `:15308-14`, seal `:13124-26`) — dead on this build (static imports `:339`, `:356`).

**(e) `'light-census-drifted-repeatedly'` consumer distinction** — VERIFIED none: the string appears only at the two mints (`:558`, `:15608`). No consumer branches on it; result reads are `.aborted` / `.stale` / `.subjects` / `.skipped` / `reason === 'session-closed-mid-drive'` only.

## Regression verification — W94 machinery (332e07670): 10/10 VERIFIED

1. **Spent-wallet mint gate** — VERIFIED. (a) `!hadParkedWalk && policyNow() >= policyDeadlineAt` parks the fresh mint unpaid (`:25068-25087`): `changed` stays `false`, `receiverOut` stays `{receiverDelta:0}`, the root stays dirty and re-enters next pass under a fresh wallet. (b) `hadParkedWalk` exempts resumes; `driveShadowPolicySteps` calls `slot.iter.next()` (`:27037`) BEFORE the `deadlineFn()` check (`:27051`) — every call advances ≥1 slice. (c) zero flips applied = zero delta — consistent.
2. **Verdict traverses join the pass cap** — VERIFIED. (a) `traverseDeferred = !scopedSync && !skipTraverseOnDrift && !hadParkedWalk && !needsAtomicOut && count >= SHADOW_ROOT_SYNC_PASS_CAP` (`:25051-56`) — no `allowCast === false` exemption; withhold/over-cover verdicts defer like castable syncs. (b) A deferred withhold still lands `withheldMeshes` `castShadow=false` (`:25117-19`), `_withheldDepthCasters` union (`:25121-30`), `invalidateShadowCasterPolicy` + `STAGE_SELF_DIRTY_KEY` restamp (`:25137-38`), `_queueShadowDepthStage` (`:25141-43`); overCovered queues identically (`:25145-53`). (c) Deferred root stays dirty; re-mints next pass via the queued gates. (d) `_shadowRootSyncPassCount` increments for every non-deferred traverse incl. verdicts (`:25057-58`).
3. **needsAtomicOut exempt from traverseDeferred** — VERIFIED. (a) `needsAtomicOut = !!(extra && extra.preCountRoot)` hoisted at `:25051`. (b) `traverseDeferred` includes `&& !needsAtomicOut` (`:25053`) — preCountRoot callers (onAuthoredAssetSwap) always reach the atomic branch (stepped condition at `:25063` excludes it) and get their sync out-param even at full cap. (c) Its traverse still increments `_shadowRootSyncPassCount` when `!hadParkedWalk` (`:25057-58`) — a fresh atomic mint counts; an already-parked root was counted at mint.
4. **Env-drain done-head check** — VERIFIED. (a) The deadline/ledger check sits AFTER the `step.done` block (`:26997`), no continue bypass. (b) A done-head's `disposeTarget.dispose()` runs at `:26993` before the check; the loop then breaks at budget. (c) Non-done steps check identically. (d) `notePacedFrameSpend(elapsed)` at `:27000` debits elapsed > 0.
5. **lightSig compare piggybacks recheck** — VERIFIED. (a) `parkedRecheck` decrement block sits BEFORE the release chain (`:24833-46`). (b) The lightSig clause is gated on `parkedRecheck && parkedEntry.lightSig != null` (`:24863-65`) — no census walk on non-recheck evals. (c) The oqX cell else-if still fires every eval (`:24866-72`). (d) The keep-verdict re-keys `parkedEntry.lightSig = this._shadowCensusForFrame()` (`:24890`), `denied=true` preserved (`:24899`). (e) Re-arm is `96 + (stamp % 32)` (`:24843`).
6. **aborted on drift-exhaustion shapes** — VERIFIED. (a) `:558` mints `{skipped:true, reason:'light-census-drifted-repeatedly', subjects:0, aborted:true}`. (b) `driveDepthCompile`'s non-session-closed exhaustion mints identically (`:15606-08`). (c) The retry keys on `stale === true || reason === 'session-closed-mid-drive'` (`:15597-98`), `lastRetryResult` preserved. (d) The arm's `legAborted` reads it at `:25485` → skips denied-park on never-staged cohorts.
7. **Unbucketed-root fallback pacing** — VERIFIED on rescan (`:15399-404` `await postPace()` before `collectCompileSubjects`) and cook (`:14494-95` `await paceCookStretch()`); bucketed push unpaced; ordering/contents unchanged. **Coverage gap → F4**: the seal twin's identical branch at `:13116-19` missed the await.
8. **isUnstagedCollectOverCover** — VERIFIED. Export + predicate `value === UNSTAGED_COLLECT_OVER_COVER` (`:367-72`); imported `renderer.js:356`; all 6 consumers predicate-guarded (`:10681`, `:15619`, `:15695`, `:24964`, `:25369`, `:25720`); pin `test/shadow-depth-admission.test.mjs:660-74` asserts the predicate on both producers' sentinels + false on the array return.
9. **_policyStepsParked reaped by sweep** — VERIFIED. `_sweepDetachedDepthStageRoots` deletes the root from `_policyStepsParked` in BOTH branches — pending Map (`:25217`) and `_parkedDepthStageRoots` (`:25230`) — on `!root || !root.parent`; dirty-latch re-sync through `shadowCasterPolicyDirtySeq` intact.
10. **Row-resident doom + leg split** — VERIFIED. (a) hiddenIds leg: `resident.alive !== false → continue` (`:975-76`) — a bound respawn's refreshed refs skip doom. (b) skippedIds leg unconditional (`:989-1000`). (c) Both gate `alive === 1 && lastSeenSeq !== seq && doomed !== 1` + wasVisible-gated marks. (d) No `options.liveEntities` read in `updateFromEntities`; publisher passes `{retire:false, hiddenIds…}` without it (`presentationPublisher.js:129-35`). (e) `doomed` clears only at allocateRecord `:631`, retireSlot `:705`, bindMesh `:776-80`, unbindMesh `:794`, feed stamps `:936/:943`.

## Sweep notes (checked, non-findings)

- `drainDeferredEnterMaterializers` inline drain (`sectorEnterDefer.js`) — deliberate fail-open safety valve restoring emit semantics; adjudicated.
- `waitForOpeningGpuResources` / `waitForOpeningPresentationFloor` — bounded (120 s / 360 s survival) + fail-open; deliberate "shell pays not the round" bound (`pipelineReadiness.js:1361-63`).
- `_restoreAsync` chunked restore — `_restoreFrameYield` (rAF + 48 ms timer fallback + starvation downgrade); sound.
- `_prefetchSaveEnvelopeVisuals` / `_prefetchEmbarkVisuals` — fire-and-forget warm lanes; stub enumeration bounded by sector-def rows; `_embarkSpecLatch` 2 s signature latch on gesture bursts.
- Orphaned staging session on a non-reusable retry — resources are staging-scene-local pure JS + the shared scratch target; GC'd, no GPU leak.
- `collectPotentialShadowCastSubjects` sync version's double-visit root over-count (per W94's minor note) — cosmetic, conservative direction.
- Emit slicing on `save:restoring` / `save:loaded`, enterSector generator split, combat:damage intern — all on KNOWN DEFERRED; not re-reported.
