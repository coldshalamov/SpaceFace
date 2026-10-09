# Wave 122 — in-flight-hitches audit

- lane: **in-flight-hitches** (resume-seam saturation falsification + new scope B3 sim-atomic bursts,
  B6 unbudgeted audio rAF, B7 physics FFI spans)
- audited: `devin/1791504143-perf-w120` @ `a57136572` (≥ required `c3d84934c`)
- **saturated: false** — the new-scope sweep produced two real in-window mechanisms (F1 audio rAF,
  F2 econTick) plus one low-materiality residual (F3 stormWarn asymmetry). W121's resume-seam
  saturation claim itself survives falsification — see Hunt coverage (a).

Evidence: all findings are MECHANISM_VERIFIED in source. This box is SwiftShader — GPU/frame-time
claims are hardware-unverified; findings whose materiality depends on per-frame ms are marked
accordingly rather than PERFORMANCE_VERIFIED. `verifyLedgerConsistency` was invoked headlessly
against this HEAD and returned `{ok:true}` at six checkpoints (see Regression verification).

## Ranked findings

### F1 — audio system runs a self-owned rAF chain outside the frame wallet (B6)

- Evidence: `src/audio/audioSystem.js:6995-7008` — `_startFrameLoop` arms its own
  `requestAnimationFrame` chain (`tick` → `_frame` → re-arm), gated only by
  `ctx.state === 'running'` and `!rt._lifecycleSuspended`. `_frame` (`:7021-7127`, ~106 lines)
  fans out to ~20-25 subsystem calls per presented frame: `_stepWantedSearchAudio`, `_wantBeam`/
  `_wantMining`/`_wantCruise` reconcile, `_updateCruiseLoop`, `_updateFuelVoice`, the voices scan
  for sidechain (`:7045-7054`), `_applySettings`, `_updatePriorityDuckGains`,
  `_ensureContinuousSources`, `_pushElementaryVoices`, `_updateEngineHum`, `_syncRemoteEngines`,
  `_updateBrakeHiss`, `_updateSlipstreamHiss`, `_updateTetherHum`, `_updateDrillGrind`,
  `_updateMine`, `_updateSectorCues`, `_updateStationMurmur`, `_updatePlaceContext`,
  `_updatePressureLayer`, `_writeMixLedger`, `_recomputeMusic`, `_tickAlarms`, `_updateHullBreach`,
  `_syncBombAudio`/`_syncFieldAudio`, `_updateLoopPositions` (O(loops)), `_gcVoices` (O(voices)).
  All of it runs inside the presented frame's rAF task, pre-present, with no frame-wallet debit —
  the only unbudgeted per-frame subsystem fan-out found at this HEAD. Two callees decimate
  internally (`_syncRemoteEngines` via `rt._nextRemoteEngineS`, `_writeMixLedger` via
  `led.nextAt`), but the dispatch fan-out and ~15 ungated subsystems pay every frame; the
  O(entities) `_syncRemoteEngines` and O(voices) `_gcVoices`/`_updateLoopPositions` walks ride on
  top. Audio param writes are schedule-ahead (`setValueAtTime` commits on the audio clock), so
  none of this work is display-coupled — unlike `scheduleUpgradeFrame`, there is no adjudicated
  reason for it to hold a rAF slot.
- Fix sketch: re-arm via `postTaskAtBackgroundPriorityBounded` (the seam shape every other paced
  loop already uses) so the tick lands post-present in a timer-gap task; worst-case cadence under
  load becomes the 48 ms bound instead of frame cadence — acceptable for schedule-ahead audio
  state, and strictly better during pause where rAF throttles. Alternative shape: keep the rAF
  arm but debit `_frame`'s body against `perfRuntime`'s frame budget and carry un-run subsystems
  to the next frame (same skip-ledger pattern the dispose drain uses).
- Evidence level: **MECHANISM_VERIFIED** (unbudgeted pre-present fan-out proved in code);
  per-frame ms magnitude **UNVERIFIED** (hardware-unverified — SwiftShader box). Expected scale:
  ~15 ungated subsystem calls + loop/voice walks ≈ 0.2–1.5 ms/frame on real hardware.
- Effort **S** (re-arm swap) or **M** (wallet integration), magic-frame impact **M–H** (it is
  inside *every* presented window), risk: moderate — `_updateMine`/`_updateSectorCues` rely on
  firing while the sim is paused; a background-post arm actually improves that case (rAF throttles
  under occlusion, the post does not), but callers must not assume 60 Hz cadence — `dt`-scaled
  envelopes already handle variable dt.

### F2 — `econTick` market sweep still lands atomically inside one sim tick (B3)

- Evidence: `src/systems/economy.js:1555-1564` — `update` gates on `consumePeriodicClock(clock…,
  ECON_TICK_S=5s)` then runs `econTick` `econDue.steps` times in one tick. Inside `econTick`
  (`:1564+`): `ageEvents`, `rollSpontaneousEvent`, `applyRegionalSupply` + `applyStationIndustry`,
  then the market sweep — `for sid in econ.markets → for cid in market` — per listing:
  `refreshListingDemand`, `getCycleCore`/`maybeAdvanceRegime` (RNG draws), `recomputePrices`,
  `recordPriceHistory`. O(stations × commodities) plus RNG inside a single atomic tick, ending in
  a synchronous `economy:tick` emit. W4 measured ~19 ms × 2/run (PERF_W4_CLOSURE) — that number
  is stale (~60 waves) and **UNVERIFIED** at this HEAD, but the sweep shape is unchanged. The
  sibling `_offlineSummaryRefresh` path already demonstrates the slicing primitive
  (`sliceIndex`/`ECONOMY_SAVE_LOADED_SLICES`, `:1545-1553`) — `econTick` itself is not sliced.
- Fix sketch: spread the market sweep across ticks behind a deterministic per-listing cursor
  (same order, same RNG draws per listing — golden hash must stay bit-identical, so the slice
  boundary must be *between* listings with a stable per-listing RNG layout and no cross-listing
  read; `demandProjectionCache` already memoizes within the sweep). Risk is determinism: NPC/econ
  readers of prices must not observe a mid-sweep market. If any do, safer variant: keep the sweep
  atomic but trim per-listing work (already partially cached — remaining headroom is thin).
- Evidence level: **MECHANISM_VERIFIED**; magnitude hardware-unverified/stale.
- Effort **M–L**, magic-frame impact **M–H** (a 19 ms tick lands whole inside the presented window
  on the due tick; on a degraded box that's a dropped frame), risk: **medium-high** — sim
  determinism constraint makes this the riskiest item in the lane.

### F3 — `stormWarn` never got the heartbeat backoff its siblings got

- Evidence: `src/render/renderer.js:2179-2206` — flat `now - row.lastWarnAt >= 1000` gate only;
  no `heartbeatMs` doubling, no >60 s quiet-gap heal. `warnDedup.js:26-45`, `laneWarn`
  (`renderer.js:2225-2247`), and `noteBusHandlerError` (`eventBus.js:117-160`) all carry the
  1 s→30 s exponential backoff + quiet-gap heal landed in W121/W122; `stormWarn` is the fourth
  sibling left flat. ~14 call sites (`pool-contact-shadow-growth`, `pool-ship-aux-growth`,
  dispose/iterator fault paths, `menu-crucible-roster-warm-failed`, …): a persistently-faulting
  storm site pays ~1 `console.warn` + Error-arg serialization per second indefinitely, no heal.
- Fix sketch: mechanical — port the `laneWarn` row shape (`heartbeatMs`, `warns`, `suppressed`,
  `summarized`, 60 s heal) onto the stormWarn row map.
- Evidence level: **MECHANISM_VERIFIED**. Impact **L** (diagnostic-only; matters only inside a
  sustained storm, which is exactly when the thread is tightest). Effort **S**, risk: none.

### F4 — physics FFI span per sim tick (B7) — irreducible under main-thread sim

- Evidence: `src/core/physics.js:762-766` → `_sg02.step(dt, tick)` inside `registry.step` inside
  the presented rAF callback; `sg02DynamicBodyOwner.js:1474-1554` — `world.step(eventQueue)` +
  `_captureContactImpacts`, then per non-sleeping dynamic record: `_captureExpectedKinematics`,
  `_readPostStepKinematics`, `_applyStructuralGive`, `_enforcePlane`, `_clampSpeed`,
  `_canonicalizeManualSpringBody`, `_syncEntityFromKinematics` — ~6-10 RAPIER WASM calls per
  record per step, plus `syncFromEntityLayers`/`_reconcileCombatPhysicsBeforeStep`/
  `_queueSectorFenceImpulses`/`_emitSg02ContactImpacts` on the same tick. Already mitigated:
  sleeping-island readback skip (`_postStepSleepSkip`, `:1509-1510`), single retained-scratch
  readback (`:1488-1490`), static-layer versioning (`physics.js:855-866`). What remains is the
  irreducible FFI volume of an authoritative non-sleeping set — no packed-bulk getter exists in
  the JS bindings, so per-record calls cannot be batched away on this architecture.
- Fix sketch: the durable fix is the adjudicated S1 whole-sim-worker path — `simWorker.js`/
  `simWorkerHost.js`/`simWorkerProtocol.js` exist but have **no production wiring** (only
  self-references); moving the owner onto the worker takes the entire span out of the presented
  window at once. No cheap interim reduction found at this HEAD.
- Evidence level: **MECHANISM_VERIFIED**; magnitude hardware-unverified (scales with awake
  dynamic-record count). Effort **L** (worker migration — already PURSUE), magic-frame impact
  **M** on the current architecture (sim + FFI live inside every presented frame).

## Hunt coverage

### (a) W121 saturation falsification — claim HOLDS within its scope

Re-enumerated every rAF/`setTimeout`/`setInterval`/promise/microtask/`postMessage` resume seam at
this HEAD (~140 timer sites + ~30 rAF/microtask sites across `src/render|core|save|systems|
presentation|audio`). Verdicts:

- **All paced-work resume seams dispatch through `postTaskAtBackgroundPriorityBounded`** (or its
  save twin `postRestoreTaskAtBackgroundPriorityBounded`, `saveSystem.js:202-218`): context-restore
  retry (`renderer.js:10551`), `yieldLiveSectorGpu` twins (`:13382`, `:16882`), `afterBrowserPaint`
  (`:32251-32265` — **W121 F2 closed**: `scheduleLater` now routes through the bounded post, no
  inner rAF), `composeYield` (`partsLibrary.js:11200`), `armFrameDrain`/`scheduleGltfParse`/
  `scheduleGltfCompile` (`decodeTaskBudget.js:320-329`), `waitForPresentedFrame`
  (`gpuQueuePace.js:32-58`), `yieldToNextPresent` (`startupGpuResidency.js:953-982`),
  `armCallbackAfterPresent` (`compilePresentSlice.js:359-391`), `nextFrame`/`nextPaint`
  (`main.js:1341-1390` + `frameWaitStarved≥2` probe), `_restoreFrameYield` (`saveSystem.js:4861`).
- **Bounded one-shot deadline arms** (Promise.race timeout legs in the warm-settle machinery,
  `_mintDeferredPaletteSubjects` gateTimer `renderer.js:22678`, `_warmRootParkContinuation`
  `:22842`, `stampLatePbr` `:28820`, opening-first-draw diagnostics `:28650`) resolve into their
  own standalone timer tasks — never inside a presented frame's task — and are one-shot or
  diagnostics-scoped. Clean, consistent with W121's enumeration.
- **`waitForAuthoredUpgradeQueueIdle`/`waitForOpeningCompositionSettled` raw `setTimeout(16)`
  yield fallbacks** (`partsLibrary.js:8483`, `:8564`) and the `drainPending`/`precompile`
  `setTimeout(0)` fallbacks are **dead in production**: every call site passes a paced
  `yieldToMain` (`yieldToBrowser`, `yieldLiveSectorGpu`, `yieldAndFlushLiveSectorGpu`,
  `createAmbientAdmissionYield`, sliced yields — `renderer.js:13641-13654`, `:14277-14607`,
  `:14858-14966`, `precompile.js:555-566`, `gpuTimers.js:451`). Fallbacks only fire for
  direct/test callers.
- **`scheduleUpgradeFrame`** stays on a rAF display callback **deliberately** (PQ-129 documented:
  parking on `setTimeout(0)` raised observed hitches 15→80) — adjudicated, not a defect.
- **Intervals**: `stationBroadcast` 5 s ticker (station-context only), `pipelineReadiness` 1 Hz
  cook-lane sampler (diagnostics), `shaderLinkReporter`/`renderPackageDigest`/`runtimeWitness`
  settle timers (probe/diagnostics). None resume paced game work.
- **Microtask/postMessage**: worker decode plumbing (`assetLoader`, `glbPrepass`,
  `renderPackageDigest`) + same-task continuations inside already-bounded dispatches. Clean.
- **Counter-example found**: the audio rAF chain (F1) — out of W121's enumeration scope, but it
  *is* a timer-priority loop resuming unbudgeted work every presented frame. The claim "all
  dispatch through `postTaskAtBackgroundPriorityBounded`" is true of paced *game* work; F1 is the
  surviving exception class.

### (b) Heartbeat backoff machinery — landed clean everywhere except stormWarn

- `warnDedup.js:42` `heartbeatMs = min(*2, 30000)` + `:39` quiet-gap heal (>60 s silent →
  re-earns verbatim budget) ✓; 8-verbatim window + 256 oldest-evict cap ✓.
- `noteBusHandlerError` `eventBus.js:141-144` — identical backoff + heal; `busErrorIndex` LRU
  recency refresh ✓.
- `laneWarn` `renderer.js:2244` doubling + `:2225-2227` heal — silent >60 s re-earns verbatim
  budget; per-listener rows ✓ (**skeptic F6 — PASS**).
- `tryPresentedCall` `renderer.js:2287-2313` — epoch latch + doubling retryAt + heal reset ✓.
- `stormWarn` — flat 1 s, no backoff, no heal → **F3**.

## Regression verification — W121 machinery (all PASS @ `a57136572`)

- **Owner-visibility memo** (`assetResidency.js:1242-1266`): keys on
  `{present, visible, assetsVersion, writeSeq}`; `assetsVersion` bumps at every retain/release
  site (`:373`, `:508`, `:617`); memo rows die with `cleanupOwnerState` (`:639`). ✓
- **Virtual staleness**: `visibilityRowOffGlass` (`:1162-1166`) materializes
  `offGlass + elapsed-since-note` on consult — boundary reproduces the eager sweep exactly
  (held through P+8 tail, drops at P+9 advance — code comment matches the 8th-advance pin
  oracle). Amortized GC sweeps `max(256, size/8)` rows per present (`:1273-1291`). ✓
- **Sector ledger**: `sectorOwnerIndex` + `softOwnerCount`/`rpcOwnerCount` maintained at every
  owner-membership funnel (`:656-735`). **Probe run**: `verifyLedgerConsistency()` returned
  `{ok:true}` at six checkpoints — after 40 retains across roles/sectorIds, after
  `beginRequest`, after releases + `releaseOwner`, after `rotateSector` + `prepareSectorExit`
  (sector re-key), after visibility-memo presents, and after `enforceBudget` +
  `releaseUnreferencedCacheOwners`. ✓ PERFORMANCE_VERIFIED (headless, CPU-side).
- **swapEpoch re-stamp**: all three authored-upgrade request closures re-stamp
  `swapEpoch = boundary.userData.admissionEpoch` after `residencyOptionsForBoundary`
  (`partsLibrary.js:3172-3173`, `:3886-3887`, `:4087-4088`); the stale-closure refusal
  (`admissionEpoch !== swapEpoch`) is intact at each. ✓
- **Sector-exit fused-iterator guards**: clean path `renderer.js:19372-19408` — 4 legs
  (warm-mint / primary / post-dispatch / enforce) each independently `try/catch`'d and stamping
  `sectorExitCleanup` lane fault via `noteLaneFault`+`laneWarn`; re-mint path `:3204-3257` same.
  ✓ (**skeptic F2 — PASS**)
- **Deferred restore .catch**: `_restorePreparedEnvelopeAsync`'s `deferRunTransition` closure
  chains `.catch` (`saveSystem.js:4610-4614`), mirroring `_restoreAsync`'s twin (`:4804`). ✓
  (**skeptic F3 — PASS**)
- **Native-rebuild abandon dispose**: `rebuildWorldFromEntitiesSteps` disposes the candidate
  world in `finally` when `!committed` (`sg02DynamicBodyOwner.js:810-815`) — covers
  `iterator.return()` mid-drive. ✓ (**skeptic F4 — PASS**)
- **`enforceSoftResidencyBudgetsSteps`**: O(1) fast path when no ledger is over budget and verify
  cadence isn't due (`:1058-1062`); verify-cadence O(assets) walk is a generator sliced every
  `batchEntries=256` (`:1080-1081`); folded recompute emits `ledger-drift` only on real
  mismatches (`:1130-1136` → `noteLedgerDrift` `:904-908`). ✓ (**skeptic F5 — PASS**)
- **W121 machinery**: import lane restore via `_restorePreparedEnvelopeAsync` (sliced,
  rollback-snapshot + defer + catch verified `:4590-4660`); `mode:changed` sits in the
  restore-scoped `startEmitSlice` emit set alongside sector:enter/save:loaded/sector:exit
  (`eventBus.js`); exponential dedup-heartbeat backoff verified above. ✓

## Sim-atomic burst inventory (B3) — enumeration

Per fixed tick, `registry.step` runs `core.preStep` (O(movables) pose snapshot, sleep-pose skip
at `coreSystem.js:362-371`) + ~140 system `update()`s + `core.lifetimeSweep` — all atomic, all
inside the presented callback when the sim is on the main thread (always at this HEAD —
`simWorker*` files have no production wiring). Per-tick O(n) work is already gated where it can
be: `lifetimeSweep` skips the movable walk on quiet-clock lanes (`:503-510`), `preStep` skips
sleeping still bodies, `packCombatTable`/`stampNearWorkBudget` are table ops. The standing
monolithic bursts:

1. **`econTick` market sweep** — F2 (the only un-sliced O(stations×commodities) burst found).
2. **Contact drain** — `_captureContactImpacts` + `_emitSg02ContactImpacts` per step
   (`sg02DynamicBodyOwner.js:1480-1538`, `physics.js:784+`), O(contacts); rode down with the
   physics span — folded into F4.
3. **Emit fan-out inside tick** — bus emits in-tick dispatch synchronously; the heavy events
   (sector:enter/exit, save:loaded, mode:changed) are sliced via `startEmitSlice`; per-hit
   `combat:damage` interning and tick-paced emit slicing remain on the adjudicated deferred list —
   no new mechanism evidence to reopen.
4. **Catch-up burst** — up to `MAX_CATCHUP_STEPS=4` ticks per presented frame (`2` on a hitch
   frame, `simulationRunner.js:5-41`) — adjudicated policy (shed-on-hitch), not a defect.

## Hardware-unverified items (for the real-GPU box)

- F1 per-frame audio `_frame` ms — measure `_frame` wall time under load; if <0.3 ms median the
  fix is still right (unbudgeted = unaccountable) but priority drops to L.
- F2 `econTick` current magnitude — re-run the W4 measure (economy tick wall ms) on the current
  HEAD before scheduling the slice.
- F4 FFI volume — count WASM boundary crossings per step on a busy sector (attach vs. awake
  records); mostly to size the S1 worker payoff.
