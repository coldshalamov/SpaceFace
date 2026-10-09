# wave-124 audit — in-flight hitches lane

Audit branch: `devin/1791504143-perf-w120` @ `70f757475` (≥ required `767089340`; post-floor
commits are popin-lane only — the hitches surface is unchanged since the prompt floor).
Audit-only: no code written, no PR, no app run. No headless probes needed — every leg in scope
was verified by direct source read; all cost figures are CPU-scope estimates (SwiftShader box,
no GPU-cost conclusions drawn).

```yaml
saturated: false
```

## Ranked findings

### F1 — `frame()`'s post-try tail is the last unquarantined segment on the presented frame
**MECHANISM_VERIFIED (gap + consequence), UNVERIFIED (throw likelihood).**
`src/core/presentationRunner.js` — `frame()` clears `frameHandle` at entry (:1054), runs the
body inside one big `try/catch/finally`, and reschedules via `schedule()` only **after** the
`finally` (:1313-1330). Two unquarantined call sites survive in that tail:

- `finally` tail (:1297-1311): `perf.recordFrameCallback(measureNow() - callbackStart)` and
  `perf.tier1?.sampleRendererFrame(...)` / `perf.tier1?.endFrame()` — the `?.` guards existence,
  not throws.
- Post-finally segment (:1313-1330): `checkGraphicsRecovery(now)` — its own body is field
  reads and its consumer callbacks (`stop()`, `onPresentationFailure`) are individually
  try-wrapped at :699-704 — then the restore block (`recordState`, `setAudioLifecycle` —
  internally guarded :516-525) and `schedule()`.

Any throw in that tail propagates to the rAF caller *past* the frame `catch`, so
`frame._errs` never increments, the stall reporter never arms, and `schedule()` is skipped —
the loop dies permanently and silently (frameHandle is already null; nothing else reschedules
outside lifecycle transitions). This is strictly worse than the W123 `diag.update` gap it
resembles: that throw was still caught by this `catch` (counted, stall-reported, rescheduled).
A tail throw bypasses all three. Every other presented-frame consumer callback is already
quarantined (`deps.onPresented` :998-999, `captureWitness` :383-392, audio release :506-514,
both failure notifiers :656-704, and every `runRenderUpdatePhase` lane).

- **Fix sketch:** wrap the `finally` tail's `perf.*` calls and the post-finally segment so
  `schedule()` is unconditional — e.g. `try { perf…; checkGraphicsRecovery(now); } catch (e) {
  capped console.error }` before `mustRescheduleAfterFrame`, or hoist `schedule()` into its own
  guarded tail. Keep the restore block inside the guard.
- Effort **S**, magic-frame impact **M** (throw probability is low — the sites are internal
  counters — but the failure mode is a permanent dead loop with zero diagnostics), risk **S**.

### F2 — `classifyWorld` pays ~2 O(entityList) passes on every classify tick
**MECHANISM_VERIFIED (bound); no deterministic-preserving slice avenue — verdict:
keep-atomic + document.**
`src/world/activityRuntime.js` — `ensureActivityClassified` (:1908) memoizes on
`entityIndexVersion` + `physicsStaticVersion`, so it re-runs on **every membership-bump tick** —
i.e. every spawn/death tick in combat. Each pass does `rebuildPinFacts` (:560 — aiShips lane +
projectiles lane + attachment keys + ≤48 trace events) then `selectClassifyEntities` (:869 —
≤48 unstamped rescan else full + exactIds/nearIds/spatial query) then the **full-entityList
discovery-authority walk** (:943-961, presence-envelope test per entity, runs every non-latched
pass). Retain machinery (`tryEarlyQuietClassifyLatch` :1062, frame-retain :1250) and
`admitSameTickProjectiles` (:829) already cover quiet ticks and projectile-only bumps — so this
is ~1-2 full-list passes specifically on spawn/death ticks, the same ticks that already pay the
corpse collect + `bus.flush` fan-out. ~0.2-0.5ms/pass at n≈4k (CPU-est) → ~1ms stacked on a
death tick.

- **Slice avenue:** none legal. Classification is published same-tick — physics sync and owner
  views consume it inside the same `s.update`; freezing `tickSimTime` does not help because the
  hazard is interleaved reads of a half-published classification, not RNG order. A shelved/
  secondary discovery structure (index covering shelved entities) is the only avenue —
  effort **L**, determinism risk **M-H**, benefit **UNVERIFIED**. Documented, not recommended.
- Magic-frame impact **M** (bounded, only on busy ticks; stacked with F2-adjacent costs).

## Hunt coverage — (a) B3 per-tick O(n) sim-atomic bursts

Sim runs on the main thread inside `frame()` on this branch (the worker lane is PR #260,
unmerged) — every burst below lands directly on a presented frame. Tick structure:
`registry.step` → `core.preStep` → `input.update` → partition system updates →
`core.lifetimeSweep` → `bus.flush`.

| Leg | Site | Verdict |
|---|---|---|
| preStep movables pose-publish walk | `coreSystem.js:~352-394` | **Gated/necessary.** Walks `index.movables` (not entityList), pose-dirty early-outs; prevPos snapshots feed interpolation — same-tick semantics, keep-atomic. |
| `packCombatTable` | `coreSystem.js:394` → `combatTable.js:48` | **Gated.** Lane-version latch (`COMBAT_TABLE_LANES`); pose-only refresh updates rows in place; full O(roster) rebuild only on membership/lane drift. |
| `reconcileEntityIndexSource` | `coreSystem.js:1494` | **Gated.** Full O(n) re-append only on `_sourceList`/`_sourceLength` mismatch. All live mutators mark synced — `industrialBeam.js:216` / `survivorPod.js:338` raw `entityList.push`/`splice` are documented minimal-harness fallbacks; live path is canonical `helpers.spawnEntity`. The mismatch rebuild therefore never fires in production. |
| `refreshVolatileEntityIndex` | `coreSystem.js:1516` | **Gated.** `VOLATILE_INDEX_PERIOD_TICKS = 8`; O(ships + shipLike) per 8 ticks. |
| `stampNearWorkBudget` | `coreSystem.js` → `activityScheduler.js:194` | **Gated.** Rotary S1 NEAR budget; cached always-awake bit. |
| lifetimeSweep clock walk | `coreSystem.js:~506-540` | **Gated.** `skipQuietClocks` early-out when short-lived lanes are empty. |
| dirty publish (`collectDirtyIds`) | `coreSystem.js:~533-549` | **Dirty-bound** — O(dirty ids). |
| corpse collect | `coreSystem.js:572-598` | **W123-gated, verified intact** — see regression section. |
| `bus.flush()` → inline sim listeners | `coreSystem.js:598` → `eventBus.js:581` | O(events × listeners). `entity:destroyed` still has ~20 inline (non-presentation) listeners (missions ×3, ai, encounterDirector, lawSecurity, npcJobsRuntime, aftermathWrecks, asteroidSites, kernel, swarm arenas, survivalWave, stationSideEventDirector, gateControlDirector, heistFacilities, cloak, aiEncounter, combatOutcome, spawnBudget…), so a K-corpse tick runs ~20K listener invocations atomically (~1-3ms at K=60, CPU-est). **No deterministic slice avenue** — deferred contract requires same-tick delivery; listeners can emit/spawn (RNG order + interleaved mutation); tick-paced emit slicing is the adjudicated W122 deferred item. Presentation-tier tails are already sliced (8/frame, `presentationRunner` claim). Keep-atomic; residual lever is listener-count reduction via retag — sim-meaningful, not a mechanical fix. |
| `_emitSg02ContactImpacts` (contact drain) | `physics.js:784` | O(contacts-this-tick); Rapier receipts → `physics:impact` queue per receipt. Pile-up spikes are real events; same listener-ordering contract blocks slicing. Keep-atomic. |
| `shouldMaintainDynamicSpatialHash` → `dynamicMembershipMix` + `_syncDynamicLayer` | `physics.js:1586` / `spatialHash.js:174` | ~2×O(dynamics) per physics tick while moving (mix checksum walk + member re-stamp). A pose-dirty gate nets zero — flight marks POSE dirty every tick. Forced every 60 ticks bounds foreign writes. Keep-atomic. |
| `ensureActivityClassified` / `classifyWorld` | `activityRuntime.js:1908/1452` | **F2 above** — ~2 O(entityList) passes per classify tick; no legal slice; design avenue documented. |
| index rebuilds inside tick | various | `reconcileEntityIndexSource` (above) is the only in-tick full-index path; whole-index rebuilds are load-time, not in-flight. |
| ledger sweeps / id recycle | `entity.js:145` | `worldLedgerHoldsId` = 3 Map lookups per corpse — O(1); `allocateEntityId` recycles via `freeIds`. No sweep. |
| econTick | world econ leg | Adjudicated W122 deferred (needs per-station state partitioning); not re-reported. |

## Hunt coverage — (b) rolling corpse probe order sensitivity

`_lifetimeCorpseProbeCursor` (`coreSystem.js:574-580`): on non-due ticks the probe walks
`[cursor, min(len, cursor+128))` (`LIFETIME_CORPSE_PROBE_SLICE = 128`); finding one dead row
arms the full collect; cursor wraps at `len`.

- **Swap/shift interplay:** collect removes corpseIndices; an element shifted into an
  already-probed prefix escapes detection for up to one full probe pass ≈ `ceil(len/128)`
  non-due ticks — at n=4000 ~31 ticks, still under the 64-tick backstop; at n>8192 the
  backstop is the bound anyway. **No O(slice) worst case worth shrinking** — the slice *is*
  the per-tick bound and latency is bounded independently by the backstop.
- **No thrash:** any detected corpse triggers the full reverse collect, which removes *all*
  corpses — the probe cannot re-fire the sweep indefinitely on a persistent unmarked corpse.
- **Considered, below materiality:** the 64-tick unconditional sweep (`tick % 64 === 0`) is
  provably redundant whenever the probe covered the whole list since the last sweep
  (n ≤ ~8k: 63 probe ticks × 128 = 8064 — note the probe skips backstop ticks, so effective
  cover is ~8k, not 8192). A `probeWrappedSinceLastSweep` flag could skip it (effort S, saves
  one O(n) walk/64 ticks ≈ 1-3µs/tick at n=4k — sub-noise). Documented, not recommended.

## Hunt coverage — (c) presented-frame fault/quarantine gaps

`runRenderUpdatePhase` quarantines every lane (stage/prewarm/vfx/feel/ui, 20-cap logs; world
rethrows fail-closed). `frame()` wraps its whole body; `deps.onPresented` (:998-999) and the
sliced bus drains (`drainEmitSlice`/`drainPresentationTail`, inside the big try) are covered;
the failure notifiers internally wrap `stop()` and both consumer callbacks; `captureWitness`
is guarded. Sim-side `s.update` calls stay unquarantined by design (a swallowed system failure
desyncs the golden hash). **The only remaining unquarantined sites are the `perf.*` finally-tail
calls and the post-finally `checkGraphicsRecovery`→`schedule()` segment — F1.**

## Regression verification — W123 machinery at `70f757475`

**Hitches F1 (corpse gating): PASS.** `LIFETIME_CORPSE_SWEEP_PERIOD_TICKS = 64` (:26),
`LIFETIME_CORPSE_PROBE_SLICE = 128` (:30); `lifetimeSweep` (:490) computes `corpseSignal` in the
dirty walk (:551-555), `corpseSweepDue` = signal OR `tick % 64 === 0` (:572-573), rolling probe
via `_lifetimeCorpseProbeCursor` (:574-580), full reverse collect only when due, `bus.flush()`
at :598. Contract preserved.

**Hitches F2 (diag quarantine): PASS.** `registry.js:1002-1011` — `finally` wraps
`diag.update(frameDt)` in try/catch, 20-verbatim cap + suppression message, comment cites the
journal-ack contract at `renderUpdatePhase.js:68`.

**Boot F1 (paced save chain): PASS.** `saveAsync` (:1433) gates on `_frozenTickBoundary()`
(:1454); `_runPacedSaveChain` captures `this.state` once (:1470); `abortReason()` (:1477) =
superseded → restoring → stale(runEpoch); `fail()` returns false with no receipt on 'stale',
re-`_noteWritePending` on 'superseded' (:1492-1496); `endFocusLossSaveWrite(state)` in `finally`
(:1615). Wiring: `game:save` → `saveAsync` (:331); `game:exitToMenu` →
`requestExitAutosave({ paced: true })` (:471) → `saveAsync` (:2675+); pagehide/beforeunload →
unpaced `requestExitAutosave()` — synchronous save on unload, correct.

**Boot F2 (async export): PASS.** `exportSlotAsync` (:6543) consults `_cachedPreparedEnvelope`
for primary AND recovery with `_prepareEnvelopeStringAsync` fallback; `_finishExportJson`
(:6567) serialize fallback + `save:error` on null; `saveLoad.js:1457-1461` awaits
`exportSlotAsync` with `exportSlot` fallback.

**W122 spot-check:** NOT REQUIRED — W123 commits (`f39fd835c`, `10cd72d65`) touched only
`coreSystem.js`, `registry.js`, `saveSystem.js`, `pause.js`, `saveLoad.js`, tests, and popin
files; W122 files (audioSystem.js, renderer.js stormWarn/deferred mint, assetResidency.js
`governorBlockedMembers`) untouched.
