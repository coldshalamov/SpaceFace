# Wave 127 — In-Flight Hitches audit

- lane: `hitches`
- audit_sha: `236614edc39a7a4c3e14446198773d9c69077f17` (moved from `64b539976` mid-audit; all findings re-verified at the new HEAD)
- method: read-only audit; micro-benches on `/c/hostedtoolcache/node/24.0.1/x64/node`, one process at a time
- **saturated: true** — no unaddressed, material, evidence-supported optimization remains in this lane's scope. One provable funnel exists (finding 1) but its measured payoff is below materiality; it is documented for future waves, not recommended now.

## Ranked findings

### F1 — (a) Kill-write funnel: coverage IS provable, win is sub-noise → DOCUMENTED / skip

- **evidence (MECHANISM_VERIFIED, census)** — `lifetimeSweep`'s unconditional backward collect runs once per sim tick at `src/core/coreSystem.js:567` (`for (let i = list.length - 1; i >= 0; i--) ... if (e && !e.alive) corpseIndices.push(i)`), reaching `_removeEntityAtIndex`/`_removeEntitiesAtIndices` → `bus.queue('entity:destroyed')`. Call sites: `registry.js:950/979`, `sim.js:199`. The adjacent comment documents why the scan exists: ~168 `alive=false` write sites bypass `DIRTY.MEMBERSHIP`, so any deferred discovery leaves a corpse visible to same-tick consumers — the Ceres sector-identity regression (`f39fd835c`) traced to a single asteroid corpse surviving ~4 ticks.
- **census** — 197 literal `.alive = false` / `.alive = 0` writes across 83 files: ~140 entity-domain (systems 107, core 12 incl. physics.js 6, world 9, ai 7, combat 4, save 1, testing 1, data 1); ~55 non-entity particle/VFX pool lifecycles under `src/render`/`src/ui` (phaseBlinkPresentation 8, vfx.js 5, rcsImpulse 4, contactMarks 4, floatingText, loadingTerminalArt) that are NOT entityList members. Plus 3 indirect channels: `contracts.js:340` (`self.alive = value.alive`, deserialize), `heistFacilities.js:2004` (`s.alive = load.alive !== false`), and 26 born-dead `alive: false` spawn literals.
- **funnel sketch** — `killEntity(state, e)` helper = `e.alive = false` + `clearEntityRuntime` + `markDirty(state, e.id, DIRTY.MEMBERSHIP)` (+ `bus.queue('entity:destroyed')` at removal). Coverage is provable: the entity/particle domain boundary is the directory (`src/systems|core|world|ai|combat|contracts|save|data` vs `src/render|src/ui`), so a source-scan lint banning `.alive` assignment outside `killEntity` in entity-domain dirs guards all ~140 literal sites plus the 3 indirect channels.
- **measured win (PERFORMANCE_VERIFIED, CPU-side only)** — micro-bench of the backward collect: 18.3µs @N=2000 zero-dead, 43.0µs @2%-dead, 13.6–15.2µs @N=5000, 29.2–29.9µs @N=10000. Even ×4 catch-up ticks ≈ ≤0.12ms against a 33ms frame budget — sub-noise. Confirms W126's "below materiality" verdict at this HEAD.
- **mechanism** — nothing the player sees; removing the scan buys <0.1% of a frame budget in the worst measured case.
- **effort: M** (~140 call-site rewrite + lint + golden-hash re-verify — deserialization and born-dead literals must NOT take the funnel or MEMBERSHIP churn doubles).
- **magic-frame impact: L**
- **risk: M** — a funnel miss reintroduces the documented corpse-visibility class (`f39fd835c`). The funnel must cover the 3 indirect channels too, or it is worse than the scan it replaces.

### F2 — (b) O(entityList)/O(assets) walks inside presented frames — clean

- The unconditional per-tick list scan in F1 is the only one left inside the presented path.
- `sorterTargetsForSector` (`precursorMachines.js:1017`) pools `index.bySectorId.get(sectorId)` under `__spacefaceEntityIndexV1` with entityList fallback; `tickBolus` (`theBolus.js:265`) pools `bolusIndex.bySectorId.get(BOLUS_SECTOR_ID)`; `refreshMachineLabels` walks entityList only on protocol-state transitions, not per frame.
- `bandRadio` `_landmarkCarrierCache` (`bandRadio.js:394–444`) is lane-version-gated via `entityIndexLaneVersion(state, LANDMARK_CARRIER_LANES)` — the carrier walk runs only when the lane version changes.
- `syncEntityViewsSteps` (`renderer.js`) yields at 128-row strides; `_applyFrameOriginRebase` loops `this._meshes` on a rare floating-origin event only.
- No material per-frame O(entityList)/O(assets) walk remains.

### F3 — (c) bus.dispatch/flush listener bursts — below materiality

- `combat:damage`: single emit site (`damage.js:335`), ~56–58 listeners. Sampled bodies (`ai.js:107`, `collisionConsequences.js:97`, `factionPresence.js:453`, `volatileExposure.js:216`, `heat.js:301`, `lawSecurity.js:313`) are filter-then-return — `Map.get` + predicate early-out. Pooled-payload snapshotter is already armed (`damage.js:288` → `eventBus.setPayloadSnapshot`), so deferred presentation tails read emit-time fields.
- **measured (PERFORMANCE_VERIFIED, CPU-side only)** — synthetic dispatch of 55 filter-listener bodies: 0.5µs/emit → even a 30-emit/tick projectile storm ≈ 0.02ms. Sub-noise.
- `sector:enter` (~79 listeners) is already count-sliced — `emit()` routes it through `startEmitSlice`/`drainEmitSlice` under a shared `maxMs` deadline (`eventBus.js` sliceBudgets path); `entity:destroyed` and `entity:spawned` drain via priority/once-only presentation queues.
- `physics:impact` (~26 listeners) same shape: inline filter bodies + snapshotted payload. `economy:tradeCompleted` (~13) is rare-frequency.
- No burst worth restructuring; mechanism verified cheap.

### F4 — (d) W119 seam class (rAF/timer callbacks resolving paced work inline) — no regressions

- All paced-work resume seams route through `postTaskAtBackgroundPriorityBounded` (28 sites): `armFrameDrain` (`decodeTaskBudget.js:320` — rAF + 48ms timer both post at background priority), `yieldLiveSectorGpu` (`renderer.js:13408, 16909` — both carry the documented "resolving inline would resume the next leg inside this rAF/timer task" comment + bounded post), `composeYield`'s `fire()` (`partsLibrary.js:11212`), `afterBrowserPaint` two-hop (`renderer.js:32318–32322`), gpuQueuePace wiring (`bloom.js:528`, `renderer.js:11142`, `startupGpuResidency.js:672/791/962`), `uiRoot.js:167`, `main.js:1366/1390`.
- Sweep for inline `resolve()` inside rAF callbacks found only: `saveSystem.js:5303` `requestAnimationFrame(() => finish(false))` — restore-path yield where the restore driver owns cadence and a 48ms timer arm covers starved rAF (comment at 5289–5300); and `renderer.js:10564` — one-shot context-restore retry, not a paced-work gate.
- `partsLibrary.js:7612` (`processUpgradeQueue` scheduling) deliberately stays on the display callback — adjudicated: the adjacent comment cites the measured 40–150ms compose parked on `setTimeout(0)` made every rAF late.
- `setTimeout(resolve, N)` yield sites (partsLibrary, precompile, saveSystem, bloom) fire in a separate task — the continuation cannot land inside the presented frame's task; not the seam class.

### F5 — (e) Stall-reporter blind spots — no material gap

- Instrumentation envelope: `perf.beginFrame` (`presentationRunner.js:1090`) → `perf.tier1.endFrame` (1314), with `recordFrameCallback` + `tier1.sampleRendererFrame` inside the same `finally` so a throwing frame still closes its counter frame.
- Self-measurement exists: `frameUntrackedStats`, `frameExternalGapStats`, `frameDispatchLagStats` quantify work escaping phase accounting; opt-in hitch-owner attribution self-disarms.
- Post-`endFrame` segment is thin on the flight path: `captureWitness` (bounded `witness.observe`, try/catch), `checkGraphicsRecovery` (3 property reads + timestamp compare), `mustRescheduleAfterFrame`, restore transition leg (restore-only).
- Remaining non-frame callbacks (audio tick, composed legs, drain pumps) run as background-priority tasks by design — escaping the presented frame is the contract, not a blind spot.

## Hardware-unverified findings

None. All conclusions rest on code-mechanism verification or CPU-side measurements; this box cannot carry GPU/frame-time evidence (SwiftShader), and none is claimed.

## Regression notes — landed waves re-verified at `236614edc`

- **Roster pool restore (popin F1)** — VERIFIED. `_publishArrivalRosterSteps` pools `entities` directly (`renderer.js:23267`, `const pool = entities`). `sorterTargetsForSector` and `tickBolus` still ride `bySectorId` buckets.
- **Mirror re-queue dominance (boot F1)** — VERIFIED. `_queueSharedStoreMirror` re-queue filters collected keys against the pending `_sharedStorePatch` (`saveSystem.js:601`, `!Object.hasOwn(pending, k)` arm).
- **Chunked shared-store apply (boot F2)** — VERIFIED. `applySharedStoreKeysChunked` (`sharedPlayerStore.js:315`, `APPLY_SHARED_STORE_BATCH = 8`) yields via injected `yieldQueue` across BOTH the write/compare pass and the tombstone sweep; `saveSystem._syncSharedPlayerStore` awaits it inside the restore path.
- **W125 machinery spot-check** — VERIFIED intact. `bySectorId` lane + restamp funnel (`worldRecords.js:1223` stamp → `world.js:2021` `registerEntityWorldRecordId` + `syncEntitySectorMembership`; `_stampHomeSector` honors the funnel). W127 HEAD additions (bolusView freeze-card sector bucket, keepalive-gated TextEncoder, pre-push `_restoreFrameYield`) do not touch W125/W126 machinery.

## Lane verdict

**saturated: true.** The only actionable avenue (F1 kill funnel) is provable but pays ≤0.12ms worst-case against non-trivial corpse-regression risk — a DOCUMENTED-class idea, not a material optimization. Lanes (b)–(e) verified clean: no per-frame O(entityList) walk, listener bursts measured sub-noise, all paced-work seams bounded-posted, and the stall envelope self-measures its escaping tail. Recommend the lane move to the next wave's open avenues.
