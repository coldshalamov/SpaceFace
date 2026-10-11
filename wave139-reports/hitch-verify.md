# Wave 139 — hitch-verify (cold regression audit)

- **lane:** `hitch-verify` — presented-frame hitching: main-thread work that can stall a frame inside the 60 Hz loop (event-bus fan-outs, per-frame walks/allocations outside the render path, HUD/diagnostics/saves/audio/physics callbacks, GC pressure, timer storms, synchronous multi-ms jobs reachable during play)
- **audit head:** `5e9efb499eb6e1405fd0c40b5d1453cf9c0b2fc4` on `devin/1791504143-perf-w120` (pinned via `git fetch` + `git rev-parse FETCH_HEAD`; every cited line read against this SHA)
- **saturated: true** — nothing since W128 introduced a NEW presented-frame hitch, and the W128 adjudicated floor still stands. No unaddressed, MATERIAL, evidence-supported mechanism remains in this lane's scope.

Evidence base: read-only cold audit at `5e9efb499`. Diff anchors vs W128 head `38d75108f`: `src/core/{coreSystem,eventBus,presentationRunner,simulationRunner}.js` and `src/save/sharedPlayerStore.js` are **byte-identical** — every drain bound, ledger, and queue cap verified at W128 carries forward unchanged. The prior lane record: `wave128-reports/in-flight-hitches.md` (saturated, 3rd consecutive; lane closed at W128).

## Q1 — did anything since W128 introduce a NEW presented-frame hitch?

**No.** Itemized cold read of every mechanism the brief named, plus the other landings:

### 1a. W138 captured render-list replay (`vendor/three.module.js` + `src/render/post/spaceRenderGraph.js`) — PASS, strictly less per-frame work

- `three.module.js:~17802` `this.render = function (scene, camera, capturedList)`: when `capturedList` is provided the path **skips** `projectObject` traversal, `finish`, sort, and `background.addToRenderList` — it replays `captured.opaque/transmissive/transparent` into the live render list with `dst.push(item)`, dropping only `isInstancedMesh && count <= 0`. It does not mint `info.render.frame`, so `objects.update`'s WeakMap dedup still elides the second pass.
- `spaceRenderGraph.js:~409-437`: `renderAndCaptureList(scene, camera)` → `scene.overrideMaterial = this.normalMaterial` → `renderCapturedList(scene, camera, captured)` inside one synchronous `SpaceRenderGraph.render` call with a `finally` restore. No staleness window, no cross-frame mutation, no retained epoch — the captured arrays are minted, replayed, and discarded within the call.
- Per-frame cost delta: +3 bounded `slice()` copies of the render-list arrays (O(items)) vs −1 full `projectObject` scene-graph walk. **Strictly less work on the presented frame** — this partially retires the W128 deferred B1 residual (the AO pass's second `projectObject` pay is gone; the first-pass walk remains the only vendor traversal left, same as W121's residual).
- `Object3D.prototype.copy` deep-copies `userData` via `JSON.parse(JSON.stringify(...))` — pre-existing vendor behavior in `vendor/three.core.js:~7724`, not introduced by W138; W138's commit message merely relies on it.

### 1b. W138 transform signatures (`three.module.js:~116-145`) — PASS, strictly less per-frame work

`sfTransformSignatureClean(object)`/`sfTransformSignatureStore(object)`: a 13-float signature (pos xyz, quat xyzw, scale xyz, pivot xyz) in `object.userData.sfTransformSig`. `Object3D.prototype.updateMatrixWorld` now calls `updateMatrix()` only when `matrixAutoUpdate && (matrixWorldNeedsUpdate || !sfTransformSignatureClean(this))`. Clean frames cost ~14 scalar compares/node instead of a `compose` + 16-float write; a dirty node allocs one 13-elem array once. Net win on both paths; no new allocation class on the presented frame.

### 1c. Save / spec machinery (W129–W139, `src/save/saveSystem.js`, `src/save/saveWorker.js`) — PASS

- **Speculative prepare is flight-inert:** `speculateLoadPrepare` (`saveSystem.js:~2727`) early-outs unless `state.mode === 'menu' || this._frozenTickBoundary()` — cannot fire mid-play. `_pendingSlotRearm` rides `setTimeout(...,0)` hop-dispatch, drops `pending.raw` after dispatch, dies on `disarmSpeculativePrepare`, and re-arms only when the live arm owns the slot AND is stale.
- **Generation latch:** `latchGen = _saveStoreGeneration` captured at consume; unconditional `_saveStoreGeneration !== latchGen` recheck (`~5046`) kills stale dispatches — a parked task cannot pay a multi-MB parse under a newer generation.
- **Unbounded-structure check:** `_decodedSaveEnvelopes` FIFO-capped at 8; `saveWorker.js` `MAX_WORKER_SESSIONS = 4` with `capWorkerSessions` FIFO evict applied on both `validate_begin` and `encode_begin` in both the module-scope and `self.addEventListener` copies. No map/set added in this wave range is unbounded.
- **Autosave on the presented frame:** `update()` gated by `isCatchupPresentationSkip || shouldSerializeDuringPresent`; `requestAutosave` 10 s debounce + calm-window defer. The flush chain (`_flushAutosave`→`_captureAutosaveSlice`→`_startAutosaveEncoding`→`_beginAutosaveTransaction`→`_autosaveReadPrevious`→`_autosaveValidatePrevious`(worker-first)→`_autosaveWriteBackup`→`_autosaveWritePrimary`→`_autosaveReadback`) hops each leg on `setTimeout(...,0)` via `_scheduleAutosaveWork` — worker encode posts are paced per hop. The only per-hop synchronous costs remain single-call `localStorage` ops (backup write, primary `setItem`, readback) — the established W128 floor, unchanged in class. `_syncSharedPlayerStore`/`_queueSharedStoreMirror` remain chunked + yielded (`applySharedStoreKeysChunked`, `APPLY_SHARED_STORE_BATCH = 8`, injected `yieldQueue`).

### 1d. Residency claims (W137, `src/render/assetResidency.js` +413) — PASS

- Sector-claim bookkeeping (`ownerSectorIds`, `sectorClaimStamp(IfMissing)`, `unionOwnerSector`, `pruneLapsedSectorClaims`) runs on residency state transitions — request arm, sector enter/exit — **event-driven, never per-frame**. `sectorClaimStamp` early-outs on an existing live claim.
- `hasLiveSectorClaim`/`exitWarmQualifies` (O(owners × sectorIds), small maps) run inside `prepareSectorExit`/`prepareSectorExitDeferred` — sector-transition calls. The deferred twin (`mintWarmCoverageSteps`, `prepareSectorExitDeferred`) is a paced iterator, and the code mints the coverage ledger under the caller's bound *explicitly so the O(warmAssets × owners) census cannot land inside a presented frame* (`assetResidency.js:~2046` comment).
- `reclaimWarm` (W137): resident entries re-stamp `entry.lastWarmClaimAtMs`; cold entries scan `owners.get(owner).requests` — an in-flight request set, not the resident registry.
- `prepareAuthoredGpuResidency` stays the present-sliced residency lane; `tickUiStagePrewarm` still early-outs on `dockInRange !== true` (`renderUpdatePhase.js:88`, unchanged).

### 1e. New per-tick call: `tickPhysicalEffects` (physics.js +93, `src/combat/physicalEffects.js` +262) — PASS, bounded

The only new body of code reachable inside the sim tick: `physics.update` now calls `tickPhysicalEffects(state, dt, helpers)` (`physics.js:~208`). Cold read of the callee (`physicalEffects.js:253-261`): `runtime(state)` is a WeakMap lookup; `rt.lastDrain === rt.tick` once-per-tick guard; loop over `[...rt.blasts]` (typically 0–2 entries) + `rt.blasts.filter()` — two tiny allocs per tick when quiescent. `drainBlast` iterates `job.pending` ids (Map lookups, optional `promote` capped at `PROMOTIONS_PER_TICK = 12`). Candidate gathering pools `SHARED_GATHER` behind a depth counter — allocation-free on the hot path. This is a **deferred-delivery spreader**: blast impulse application is distributed across ticks instead of one atomic multi-ms pass — the shape of a fix, not a hitch. `collectAnchoredRecoil`/`sanitizeAnchoredRecoil` run only in serialize/deserialize. New listeners (`clearPhysicalEffects` on `save:loaded`/`game:newGame`/`sector:exit`) are WeakMap deletes — trivial, and all three events carry existing slice budgets.

### 1f. HUD delta (+74) — PASS

`targetEdge` selected-contact edge marker (`hud.js:~2387, ~4536-4570`): on the off-screen-target path, `resolveSelectedTargetMarker` math + `setText`/`setAttr`/`setDataEdge`/`setCssVar`/`setStyle` writes — all routed through the existing JS last-written caches, so static frames touch no DOM; only the `translate3d` transform writes while moving. On-screen path does one cached `setDisplay(false)`. `resolveObjectiveGatePresentation` (`navigationWaypoint.js:99-115`): early-outs, `active.find` over the (small) missions array, gate-fix lookup — runs only while `wp == null` (cross-sector objective). `resolveFlightEdgePlacement`/`invalidateObjectiveEdgeBoxes` — scalar math + resize hook cleanup. Signature gates (`hudSignatureUnchanged`, `hudFieldsUnchanged`, `~hud.js:1162` last-written cache) and clock decimation are all intact.

### 1g. Remaining deltas re-verified

- `src/ui/watchlistHud.js` `setInterval(render, REFRESH_MS=1000)`: signature-gated DOM rebuild of ≤`WATCHLIST_MAX` rows, `box.isConnected`/destroyed guards, timer unref'd. 1 Hz, sub-frame class.
- `src/render/pipelineReadiness.js:~155` `startOpeningCookLaneSampler`: 1 Hz diagnostic sampler while a cook runs, try/catch "diagnostics only"; `createPipelineAdmissionTracker` resumes via `armCallbackAfterPresent({idleBoundMs:48})` — parked until post-present idle.
- `src/ai/reflexes.js` (+151) `REFLEX_KIND.BODY_DODGE`/`nearestIncomingBody`: O(contacts) with early-outs (speed ≥120 WU/s, closing ≥100, eta ≤1.4 s, miss pad, `bodyOccluded`, hashed notice) on the AI think cadence; `bodyDodgeOnly` skips the ally/incoming/marked scans. `src/systems/combat.js` `beamEnvironmentCandidates`/`admitBeamTarget` reuse pooled `_beamEnvScratch` and `ensureCombatRuntime` scratch — spatial-hash queries per beam-tick, not per-frame.
- `economy.js` (+41): `producedAtStation`/`producedHere` market-seed/trade logic — station-entry and trade-call paths, not per-frame. The adjudicated `econTick` sweep at `:1559` is untouched.
- `audioSystem.js` (+6): cue-map additions only. `_frame()` unchanged: `postTaskAtBackgroundPriorityBounded` body, 10 Hz `_remoteCandVersion`-latched remote engines, `LOOP_POSITION_UPDATE_S`, `MUSIC_RECOMPUTE_S`, O(voices) `_gcVoices`.
- `renderer.js` (+546): bulk is `warm*Decode` arm-collect refactorings riding the yield-bounded residency poll generator (`~25014`, yields between warm calls); `syncResolvingMarker(mesh, state)` added into the strided hidden-slot sweep (yields every 128 rows / 2 ms) with a 1 s `missionCriticalMemo` per mesh — O(1) hot path on a generator that cannot stall a frame. `raycastToPlane`/`screenToWorldDirection` are pooled-vector scalar math.
- `gyreSnarePresentation.js` (+1579): weapon-effect presentation, `update(dt, state)` alive only during a discharge; `_seenGraves` Set is refilled per publish tick and nulled on flush — bounded; spiral/glow buffers are pooled.
- `physicsAuthority.js` (+69): `prepareExternalPhysicsImpulse`/`consumeAnchoredPhysicsImpulse`/`EXTERNAL_FEEDBACK` WeakMap — per-impulse O(1) event machinery.
- `presentationAdmission.js` (+33): `entityIsMissionCritical` walks `state.missions.active` — called only via the 1 s per-mesh memo above.
- New listeners added to `save:loaded`/`game:newGame`/`sector:exit`: WeakMap delete each; `entity:destroyed`/`entity:killed` fan-outs gained **no new presentation-pure consumers** — the W125 exhaustion of sim-atomic listener classification stands.

## Q2 — independent saturation re-verdict

The W128 adjudicated floor re-verified at `5e9efb499`:

| Avenue | Status at `5e9efb499` | Why it stays out |
|---|---|---|
| Kill-write funnel (`lifetimeSweep`, `coreSystem.js:567`) | Byte-identical to W128 | DOCUMENTED, ≤0.12 ms worst (W127 measure) — sub-noise |
| `econTick` 5 s sweep (`economy.js:1559`) | Hunks at :349/:1985/:2237 only; sweep untouched | Sim-atomic (RNG order, simTime stamps); slicing risks golden hash — adjudicated W122 |
| Physics FFI spans (`sg02.step`) | Same class; `tickPhysicalEffects` rides beside it | Irreducible under main-thread sim — S1 sim-worker lane owns it |
| Sim-atomic listener bursts (`entity:killed`/`destroyed` inline fan-out) | No new presentation-pure consumer entered any storm fan-out | Determinism contract — needs listener-classification surgery |
| Vendored-three `projectObject` render-list construction | **Partially retired by W138** — the AO pass's second walk is gone | The remaining first-pass walk is the W121 B1 residual — vendor-patch territory, hardware-unverified benefit |

Fresh enumeration (this audit):

- **Per-frame segments:** all 42 `tryPresentedCall` segments still present in `renderer.js`; `recordPhase`/`recordSystem`/`frameUntrackedStats`/`frameExternalGapStats`/`frameDispatchLagStats` coverage unchanged (byte-identical presentationRunner). Catch-up bound `MAX_CATCHUP_STEPS=4`, hitch shed to 2, unchanged.
- **Emit queues:** `eventBus.js` byte-identical — `pendingSlicedEmits` cap 8 (oldest delivered inline), shared `windowEnd`, `drainPresentationTail` bounded by count AND wall-clock deadline AND `pacedFrameSpend() < PACED_FRAME_BUDGET_MS`, `PRESENTATION_PRIORITY_INTERLEAVE`, `invokeBusListener → noteBusHandlerError` fault coverage on all four invoke paths, presentationQueue 64-cap + overflow shedding + priority for `entity:destroyed`. Storm-class slice budgets (`sector:enter`, `save:loaded`, `sector:exit`, `mode:changed`) unchanged.
- **Timer storm census:** every `setInterval` enumerated — `stationBroadcast.js:158` (gated ~20 s), `watchlistHud.js:87` (1 Hz signature-gated, docked screen), `main.js:926` loading-gate pulse (self-clearing), `pipelineReadiness.js:~155` (1 Hz cook sampler), crucible/screen-scoped + boot/witness diagnostics — all seconds-cadence or off-path, none per-frame.
- **Allocation-driven frames:** presented path remains scratch-and-retain (`_craftMicroMotionOptions`/`_protectedRootOptions`/`_submitVisibilityOptions` module scratches `renderer.js:713-740`, `publishActivityFrame` retained records, `feel.frame` alloc-free, vfx pooled + `_consumeCadence`-gated). New allocations introduced since W128 on presented paths: 3 bounded render-list slices (W138 replay), 1 transform-sig array per dirty node (W138), 2 tiny blast-array allocs per tick (physicalEffects), `_seenGraves` Set per publish tick (gyre). All bounded; none a growing-per-frame class.
- **Unbounded-structure census:** every new Map/Set/registry in the W129–W139 range has an explicit cap or lifecycle clear — `_decodedSaveEnvelopes` ≤8, worker sessions ≤4, `_impactPairKeys` outer cap 1024, `shelvedDiscoveryMoved` cleared on cell rebuild, `_seenGraves` refilled per tick, `EXTERNAL_FEEDBACK`/`RUNTIMES`/`missionCriticalMemo` WeakMap/GC-owned.
- **Periodic fat-tick census:** `consumePeriodicClock` users re-swept — econTick remains the only >1 ms periodic (adjudicated); automation/claims clocks iterate tens-bounded collections.
- **Post-frame tail:** `captureWitness` bounded, `checkGraphicsRecovery` 3 reads, `mustRescheduleAfterFrame` cheap — unchanged.

## Rejected levers (quality-degrading; not taken, not available)

- Culling/LOD/pool-size reductions to hide per-frame cost — violates the no-LOD/no-pop-in mandate.
- Dropping or decimating the AO pass (would silence the replay machinery entirely) — quality loss.
- Slicing `econTick` or listener-classification surgery on sim-atomic bursts — determinism/golden-hash risk; owned by sim-worker S1, not this lane.
- Skipping the `objects.update` WeakMap dedup on captured replay — would regress correctness; already handled by not minting `info.render.frame`.

## Hardware-unverified queue

- **H1 (carried, owner-side):** real-GPU frame-time benefit of the accumulated machinery — everything here is MECHANISM_VERIFIED on this box (SwiftShader); `SPACEFACE_WITNESS_MS=60000 npm run probe:runtime-witness -- --no-sample-shots` + `npm run probe:smooth-flight` from `design/perf/scoreboard.json`.
- **H2 (carried):** SG-02 contact-burst sim fan-out; remaining first-pass `projectObject` traversal cost on a mounted-node-heavy sector on real hardware.
- **H3 (new, small):** W138 replay's three `slice()` copies per frame on a render-list-heavy sector — bounded O(items) copy on real hardware; expected sub-noise vs the removed `projectObject` walk.

## Lane verdict

**saturated: true** — cold regression clean at `5e9efb499`. Every mechanism the brief named (W138 render-list replay, W138 transform signatures, W129–W139 save/spec machinery, W137 residency claims, worker session caps) reads as a net per-frame *reduction* or as event-driven/paced/generator-bounded work that cannot stall a presented frame. The single new per-tick entry point (`tickPhysicalEffects`) is a bounded deferred-delivery spreader, allocation-free on its hot path. The W128 adjudicated floor carries forward byte-identical on the drain/ledger/queue owners. Recommend this lane stay closed; future hitch reports fold into the global/skeptic lane until new mechanism evidence exists.
