# Wave 128 — in-flight-hitches audit report

- **lane:** `in-flight-hitches` (long frames during flight)
- **audit head:** `38d75108f` on `devin/1791504143-perf-w120` (floor `165636c35` satisfied — includes the landed W128 popin + boot commits `4c4c40459`, `e057d80b7`)
- **saturated: true** — no unaddressed, MATERIAL, evidence-supported optimization remains in this lane's scope. This is the lane's third consecutive clean audit: **the in-flight-hitches lane CLOSES at this wave.**

Evidence base: read-only audit at `38d75108f`; every cited line read against that SHA. Node-level micro-benches from W126/W127 were re-anchored by `git diff` — `coreSystem.js`, `eventBus.js`, `presentationRunner.js`, `sharedPlayerStore.js` are byte-identical to the W127-verified SHA `236614edc`, so those measurements carry forward unchanged.

## Ranked findings

None. The only open avenues are the adjudicated set below, each re-verified against this HEAD — none carries new mechanism evidence that would lift it out of its boundary.

### Avenues re-verified, all still adjudicated

| Avenue | Status at `38d75108f` | Why it stays out |
|---|---|---|
| Kill-write funnel (`lifetimeSweep` unconditional collect, `coreSystem.js:567`) | DOCUMENTED — W127 measured 18–43µs, ≤0.12ms on a 4-step catch-up | No delta since `236614edc`; ~140 entity-domain `.alive=` sites + 3 indirect channels still unfunnelled; risk M for ≤0.1% of frame budget |
| `econTick` 5s sweep (`economy.js:1559-1561`) | Adjudicated-deferred W122 — 2.7ms p50 / 3.9ms p95 | Sim-atomic (RNG order, simTime stamps); slicing risks golden hash. Fresh census this wave: the only other `consumePeriodicClock` users are automation (offscreen 60s / autosell 60s / raid 600s) and claims (upkeep 60s / raid 600s) — all iterate small-N per-body/drone collections, sub-ms class |
| Physics FFI spans (`physics.js:762` → `sg02.step`) | Irreducible under main-thread sim — S1 sim-worker lane owns it | Unchanged; sleeping-island readback skip + retained scratch + static-layer versioning already in |
| Sim-atomic listener bursts (`entity:killed`/`destroyed` inline fan-out) | Determinism contract — needs listener-classification surgery | Zero delta since W125's exhausted enumeration (every remaining listener is sim-authority); no new presentation-pure consumer entered any storm fan-out |
| Vendored-three `projectObject` render-list construction | Deferred — vendor-patch territory, hardware-unverified benefit | Same shape as W121 B1 residual |

## Lane results — fresh enumeration at `38d75108f`

### (a) per-frame segments: everything >1ms-class is measured and adjudicated; nothing unbudgeted remains

- **Periodic fat-tick census (fresh):** swept `consumePeriodicClock` across `src/**` — the only >1ms periodic is econTick (adjudicated). automation's three clocks and claims' two iterate collections bounded by drone/outpost/site counts (tens), not entity counts.
- **Self-owned per-frame drivers:** audio `_frame` body rides `postTaskAtBackgroundPriorityBounded` (`audioSystem.js:7007` — W122 F1 verified intact; the ~25-call fan-out now lands post-present and shows up in `frameExternalGapStats`). Every `setInterval` site enumerated: `stationBroadcast.js:158`, `watchlistHud.js:87`, `main.js:926` loading pulse, screens — all seconds-cadence cosmetics, none per-frame.
- **Presented-frame coverage:** all 42 `tryPresentedCall` segments in `renderer.js` verified present (per-subsystem attribution); `recordPhase` buckets cover render/vfx/feel/ui; `recordSystem` covers every registry system on measured steps; `frameUntrackedStats` + `frameExternalGapStats` + `frameDispatchLagStats` quantify work escaping accounting; post-`endFrame` tail stays thin (`captureWitness` bounded, `checkGraphicsRecovery` 3 reads, `mustRescheduleAfterFrame` cheap).
- **`tickUiStagePrewarm` (per flight frame, `renderUpdatePhase.js:88`):** early-outs on `dockInRange !== true`; real work delegated to `prepareAuthoredGpuResidency` — the present-sliced residency lane. Bounded, no new segment.
- **Catch-up bound:** `MAX_CATCHUP_STEPS=4`, hitch sheds to 2 (`simulationRunner.js:7,22`) — a 4-step frame pays 4× ~0.57ms/tick sim, bounded by design.
- **HUD:** `frame()` (`hud.js:5416`) is clock-decimated everywhere (numeric/target/overlay/radar/overview clocks); `updateOverview` rides the 5Hz overview clock with `indexedShipLikeScan`/`indexedTypeScan` lane reads + entityList fallback, retained `_overviewContacts` scratch + swapped `_overviewIdScratch` — no per-frame O(list) work on the presented path.

### (b) allocation-driven long frames — presented path is scratch-and-retain throughout

- `syncEntityViews` per-entity option objects are module-level scratches (`_craftMicroMotionOptions`, `_protectedRootOptions`, `_submitVisibilityOptions` — `renderer.js:713-740`), rewritten per row, never retained.
- `publishActivityFrame`/`getActivityFrame` (`worldActivityManager.js:17-46` + `renderer.js:802`) reuse retained `frame`/`out` records via `Object.assign` — no per-tick fresh frame object.
- `feel.frame` documented "pure and allocation-free" (`feel.js:553`) with reused `_hsRequest` (`:707`).
- vfx `update()` (`vfx.js:12288`) runs pooled subsystems behind `_consumeCadence` gates; `bolusCableStyle` (`bolusCable.js:34`) allocates nothing on its hot path.
- Residual fresh allocs found: `want` array + join key in `syncFreezeCards` (bolus-sector members only, runs only inside the bolus sector), small contact rows in `updateOverview` (5Hz, near-field count). Both sub-noise.
- Vendored-three render-list allocation remains the deferred B1 vendor-patch item.

### (c) emit queues — every storm class still catches into `busFaultSummary`; all drains bounded

- **Coverage complete:** all four listener-invoke paths — `dispatchRange` (inline emits), `drainEmitSlice` (sliced), `flushSlicedEmits` (non-presenting flush), `drainPresentationTail` (presentation lanes) — route through `invokeBusListener` → `noteBusHandlerError` per-listener rows (`eventBus.js:79-85,174-178,443,491,558`). `busFaultSummary` reads the same `busErrorIndex` — a storming listener cannot evict itself mid-storm (recency re-add fix at `:125` intact).
- **Bounded drains:** `pendingSlicedEmits` capped at `MAX_QUEUED_SLICED_EMITS=8` with oldest fully delivered inline (`:395-401`); `startEmitSlice` shares one `windowEnd` across forced flush + fresh slice + restart (`:382-389`); `drainPresentationTail` bounds on `max(base, ceil(pending/4))` count AND `deadline` AND `pacedFrameSpend() < PACED_FRAME_BUDGET_MS` (`:524-561`); priority interleave `PRESENTATION_PRIORITY_INTERLEAVE` prevents cosmetic starvation.
- **Storm classes:** `sector:enter`/`save:loaded`/`sector:exit`/`mode:changed` carry slice budgets (`presentationRunner.js:204`, `saveSystem.js:5586,5591,6074`); `entity:destroyed`/`entity:spawned` ride priority/once-only presentation queues; `combat:damage`/`physics:impact` measured sub-noise at W127 (0.5µs/emit on 55 filter listeners → ~0.02ms on a 30-emit storm tick); `bus.queue` deferred flush runs end-of-step inside the sim tick (sim-atomic, adjudicated).

### (d) W127/W128 machinery — timing verification, all PASS

- **`syncFreezeCards` bolus bucket (W127 popin F1):** `bolusView.js:196-201` pools `bySectorId.get(BOLUS_SECTOR_ID)` under the standard index guard (`__spacefaceEntityIndexV1 === true && ready === true && bySectorId instanceof Map`) + `entityList` unready fallback. Canonical claim verified: `materializeBolus` gates `sector.id !== BOLUS_SECTOR_ID` (`theBolus.js:51`) and stamps `homeSectorId: sector.id` + `world._stampHomeSector(ent, sector.id)` (`:79,98`). Sibling `tickBolus` at `:265-270` re-checks `ent.homeSectorId` per member — the freeze-card predicate's `data.bolus` + FREEZE-role filter makes an equivalent check vacuous. Runs inside `tryPresentedCall('bolus-view')` which early-outs outside the sector (`syncBolusView` `bolusView.js:27-29`). Strictly better: O(bolus members ≈ organs) instead of O(entityList).
- **Keepalive-gated encoder (W127 boot F1):** `sharedPlayerStore.js:421-424` — `new TextEncoder().encode(body).byteLength` runs only inside `if (keepalive === true)`; the sole keepalive call site is the mirror flush `saveSystem.js:620`. Non-keepalive pushes skip the O(body-bytes) pass entirely — strictly less work.
- **Pre-push restore yield (W127 boot F2):** `saveSystem.js:561-562` — `await this._restoreFrameYield()` precedes `pushSharedPlayerStore(delta)` (gated `delta != null`); `save:store-synced` emit in `finally` fires in both outcomes (`:571-576`).
- **W128 popin (`4c4c40459`):** `uvulaHold` now `state.entities.get(att.targetId)` O(1) per attachment with entityList fallback (`bolusCable.js:7-30`) — the old code ran an O(entityList) scan inside the per-frame cable style path (`vfx.js:9856`); strict win on a presented-frame callee. `sectorPrewarmEligiblePool` buckets the three sector-scoped prewarm collects (`renderer.js:18757-18775`) — event-driven (sector enter/records), not per-frame; strict win.
- **W128 boot (`e057d80b7`):** saveSystem restore/slot-scan paths only — no presented-flight delta.
- **Diff anchor:** `src/core/{coreSystem,eventBus,presentationRunner}.js` and `src/save/sharedPlayerStore.js` byte-identical to W127-verified `236614edc`; renderer.js delta is exactly the three `sectorPrewarmEligiblePool` hunks.

### (e) kill funnel — stays DOCUMENTED

No new evidence: `coreSystem.js` unchanged since the W127 measure (≤0.12ms worst case, sub-noise); the funnel sketch + coverage argument (~140 entity-domain literal sites, 3 indirect channels, directory-boundary lint) carries forward verbatim. Deliberately not re-listed as a finding.

## Regression notes — landed waves re-verified at `38d75108f`

1. **Bolus freeze-card sector bucket (popin F1) — PASS.** See (d).
2. **Keepalive-gated store encoder (boot F1) — PASS.** See (d).
3. **Pre-push restore yield (boot F2) — PASS.** See (d); emit in `finally` covers both outcomes.
4. **W126 machinery — PASS where touched.** `_queueSharedStoreMirror` re-queue patch filter (`saveSystem.js:601` `!Object.hasOwn(pending, k)`) intact through the W128 boot rewrite; `applySharedStoreKeysChunked` (`sharedPlayerStore.js:315`, `APPLY_SHARED_STORE_BATCH = 8`, injected `yieldQueue` across both passes) untouched; `_publishArrivalRosterSteps` still pools `entities` directly with the documented W126-F1 rationale (`renderer.js:23270+`); `sorterTargetsForSector`/`tickBolus` still ride `bySectorId` buckets.

No W127 or W128 self-defects found in this lane's scope.

## Hardware-unverified queue

- **H1 (unchanged, owner-side):** real-GPU frame-time benefit of the accumulated wave machinery — every optimization since wave 1 is MECHANISM_VERIFIED on this box (SwiftShader); run `SPACEFACE_WITNESS_MS=60000 npm run probe:runtime-witness -- --no-sample-shots` + `npm run probe:smooth-flight` from `design/perf/scoreboard.json`.
- **H2 (unchanged):** SG-02 contact-burst sim fan-out cost on real hardware; vendored-three `projectObject` traversal cost on a mounted-node-heavy sector.

## Lane verdict

**saturated: true** — third consecutive clean audit (W126, W127, W128). Per the wave contract, **the in-flight-hitches lane closes.** Remaining open avenues are all adjudicated boundaries (sim-worker S1 for physics FFI, listener-classification surgery for atomic bursts, vendor patch for render-list construction) or documented below materiality (kill funnel). Recommend the orchestrator retire this lane prompt and fold any future in-flight hitch reports into the global/skeptic lane until new mechanism evidence exists.
