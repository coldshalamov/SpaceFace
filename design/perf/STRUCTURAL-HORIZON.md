# Structural Horizon — Drastic Perf Levers (wave-26 vantage)

Triggered by the user question: "are you getting stuck in a local maximum — are there more drastic things that'd improve performance without hurting quality?"

Scope rule: every lever must satisfy the two hard contracts — zero visible quality degradation, and bit-identical sim determinism (`sf-sim.mjs` golden, sha256 `e517a97b…`). Everything below is execution-placement, layout, or scheduling — no behavior change.

## S0. Worker-side sim — ADJUDICATED, conditions not yet met

`design/perf/w4-workersim-REPORT.md` measured this to a dead end: whole sim ≈ **0.57 ms/tick**; the only kernel over the 5 ms bar is `econTick` (~19 ms ×2/run) which fails isolation (synchronous mutating `quote()`/`execute()` public API, rng draws on read paths, ~10 same-tick listener families). Bit-identical application requires blocking waits → transport overhead exceeds savings. `sim.js` is already a headless worker-ready host and `simWorkerHost.js` holds the phase-14 SAB seam, but the route is gated on:

- (a) a kernel > ~5 ms/invocation with isolated state — economy would qualify *after* a pure-snapshot refactor of its read paths;
- (b) `entityList` emptied → far-actor SoA + SAB triple-buffer (PQ-067 precondition);
- (c) deterministic-async contract renegotiation (deferred application is illegal under the golden today).

Status: revisit conditions live in the W4 report; the W-lane campaign keeps shrinking the blockers (index lanes are the SoA direction) but does not meet (a)/(b) yet.

## S1. Whole-sim-in-worker — the transport is already built (highest ceiling)

**The ordering blocker that killed worker-sim does not apply to whole-sim placement.** W4 rejected moving *individual kernels* because their results must apply mid-tick at fixed points. But if the WHOLE tick runs in the worker end-to-end, intra-tick ordering never crosses the boundary: the tick executes deterministically in the worker, input enters via the existing `inputCommandSnapshot` command path, and results flow out as packed presentation frames — a direction with no authoritative ordering (a late frame just re-presents the previous one).

**The machinery exists and is production-live today**:

- `src/render/snapshotFence.js` — triple-buffered presentation snapshot fence; its own comment: *"Render reads the latest complete packed frame, never live entity objects. Required before a simulation Worker."* Readonly column facades + entityId index + sequence diagnostics.
- `src/render/presentationSnapshot.js` — `spaceface.presentationSnapshot.v1`: SoA columns (position/quaternion/scale/tint/bank/pitch/entityId/archetype/flags), capacity-doubling zero-alloc steady state, ordered journal ring for spawn/destroy/visual events. Typed-array layout is already SAB/structured-clone friendly.
- `renderer.js` consumes it live: `packPresentationWorldToFence` each frame (:15946-15958, :16264+), `_applyPresentationPose` reads `latestSnapshot()`+`previousSnapshot()` with pose-span interpolation alpha (:15107-15143), `_presentationPublisher` handles mesh bind/rebind.

**What the spike actually has to build**:

- **Packer placement**: the fence packs from `_presentationWorld` on the main thread today. Worker-sim moves the pack INTO the worker (it owns state) — main only transfers/reads. Cost: the pack is a linear scan already; the question is transport (SAB columns vs postMessage of the buffers).
- **Input/commands IN**: `inputCommandSnapshot` exists; the other direction is synchronous *main→sim* calls — UI paths like `economy.quote()`/`execute()` that read sim state between ticks (the isolation failure from W4, but now as a *narrower* surface: only main-thread callers need a read-model or command queue, not same-tick sim internals).
- **Non-pose state surface**: census of render-lane `state.*` reads = ~12 sim-owned keys (entities×235, world×118, mode×112, simTime×99, player×86, combat×28, jobs×44, input×12, entityIndex/entityList×46). The fence covers poses/identity today; the other keys need packed equivalents or main-side read-models.
- **Save capture**: `serializeData` runs on sim state — inside the worker it's fine (it already runs as a generator there).

- **Why it pays under the bar**: every remaining hitch class — econTick spikes (~19 ms), decode drain, restore slicing overshoot, GC — stops dropping *frames*; the magic frame can't freeze because presentation no longer shares a thread with sim bursts.
- **Effort**: XL but decomposed — the spike is no longer "build a transport," it's "move the packer + command ring + read-model surface." **A/B**: identical scripted-input probe, sim on/off worker — bit-identical golden (headless path untouched), frame-time histogram diff, dropped-frame count under injected sim spikes.
- **Risk**: highest of the list — the synchronous main→sim call surface (trade UI, mission accept, spawn commands) is the migration surface, not the render lane.

_Alternate shape considered and parked_: render-in-worker (OffscreenCanvas submit off-thread, sim stays main). Also ordering-free, but migrates ~60 render-lane live-state reads instead of the narrower main→sim call surface, and DOM/canvas interleaving is its own risk class. Whole-sim-in-worker is the better shape because the fence was built for it.

## S2. SoA entity columns (PQ-067 precondition + direct GC win)

Entities are object literals in `entities:Map` + `entityList:Array` + index lanes. The W4 report names `entityList` emptying as the gate for the SAB transport shape.

- **Smallest honest step**: a position/velocity/rotation `Float32Array` sidecar for the physics-read path (broadphase, cull, optic lane) — readers get vectorized columns, object API stays for everything else. Writers stamp through the existing index-append path.
- **Ceiling**: M (GC pressure + cache misses on per-tick iteration) now; unlocks S1's cheap transport later.
- **Effort**: L. **Contract**: sim-visible behavior unchanged if writes stay single-source (sim writes columns; objects become views or are stamped from columns at the same tick point).

## S3. Instanced/BatchedMesh for repeated static geometry — PARTIALLY LANDED, residual audit-gated

`src/render/asteroidInstancePool.js` already instances untinted common-rock bodies into keyed InstancedMesh buckets (warmed per-variant pre-flight; adopted bodies republish `leaf.matrixWorld`). What the W4 deferral still covers: BatchedMesh for heterogeneous repeated statics (dressing props, debris, station parts) — re-open only if a density census shows N≳50 same-geometry unbatched statics drawing per frame. **Effort**: census S. **Ceiling**: gated on the census.

## S4. Decode/compile fan-out depth — VERIFIED LANDED

`src/render/decodeTaskBudget.js` is already a shared FIFO gate across decoder pools with class-priority release (`visible > deadline > ambient`, FIFO within class), sized `cores−2` so bursts can't starve the present thread; KTX2 pool `max(4,min(8,cores−2))`, glbPrepass pool `resolveDecodeTaskBudgetLimit`. Program-link precompiles ride dedicated salvos. Only remaining question is pool-width tuning — a measurement, not a structural lever.

## S5. Residency horizon — sector-graph lookahead

Current warm horizon is the incoming sector + membership-candidate dwell. A two-sector-deep, byte-budgeted prefetch (weighted by jump-probability from the route graph) would cover plotted multi-hop routes; cost is wasted decode on unvisited branches — bounded by the existing soft-lease eviction. **Effort**: M. **Ceiling**: M (only the second hop of multi-hop travel gains).

## S6. Frame-graph ordering inside the present frame — VERIFIED LANDED (W26+)

Audited at `presentationRunner.js:830-985`: the rAF frame already orders **sim advance → present (`registry.renderUpdate`) → compile drain offered only the honest remainder (`frameBudgetMs − everything spent, sim included`) → emit-slice drain on re-measured remainder**. Deferred work cannot precede the present. Nothing left here.

## S7. Economy burst slicing — PARTIALLY LANDED, remainder illegal under the golden

- `save:loaded → refreshAllPersistentDemand` is already sliced: `ECONOMY_SAVE_LOADED_SLICES` adjacent listeners at `economy.js:1058-1065`, and `sectorsim:offlineSummary` queues the same sliced refresh drained one slice/tick at `:1083-1091` (deterministic boundaries).
- `econTick` itself (~19 ms ×2/run) **cannot slice legally**: it is synchronous inside `registry.step`; yielding mid-tick hands a half-drifted `markets` map to downstream systems in the same tick → sim state differs → golden moves. Its emit sits at the end (`economy.js:1173`) but the internal work order is the contract, not the emit. Only legal reductions are internal algorithmic wins — the wave lanes' job, not a structural lever.

## Execution order (by ceiling × tractability)

1. **S1** — the XL spike and the only remaining big game: render-worker transport. Prototype scope: pose/identity transport for ship-like bodies only (the ~12-key census is the contract surface), SAB columns for pos/vel/flags + mount/unmount event ring, OffscreenCanvas submit. Gate on a measured read-model cost < the hitches it removes.

### S1 Phase-A verdict — GO (all three gates PASS, spike `devin/s1-sim-worker-spike` `f913823d5`+`e504b25f9`)

Whole-sim-in-worker (not render-in-worker): the worker runs the sim, journal records cross to the presentation lane, everything else stays main.
- **Golden-in-worker**: 47a inside a real `worker_threads` Worker → `sha256 e517a97b…` bit-identical, `deterministic:true`, allEqual across every repeat/pipeline/pause run.
- **Journal transport**: pack + postMessage + consume through the real publisher/world — mean **0.21–0.26 ms**, p95 0.33–0.42 ms over 720–2160-tick samples (wire ~0.21 ms dominates; pack ~0.01; consume ~0.013). Two orders under the frame budget.
- **Ring bounds**: completedTick ring bounded at 8 (`hw=8/8` under `--pipeline 8 --consume-batch 8`); journal overflow→rebuild exercised (66 rebuilds, 0 failures, pending bounded).
- **Real defect found + fixed on-branch, backported to the perf lane (`bd6cfadbc`)**: spawn-suppressed-during-rebuild entities the collect set can't republish (mesh-less lanes) tripped `*-without-spawn`→rebuild→suppress once per tick for life (~120 rebuilds per projectile flight → 2). `presentationJournal.isEntityJournaled` predicate; `sim.js` ctx gains `options.presentationJournal` (headless parity).

Phase-B gap list (mechanical plumbing, not conceptual risk):
1. 47a orchestration isn't just `registry.step` — tape commands, per-tick pre-step hooks, save-reload, phase-0 metrics needed ~290 LOC replicated worker-side; Phase-B extracts a shared sim-driver lib (the CLI self-executes on import — can't rewire it).
2. Read-model census was short — `presentationFlags` also needs `isPlayer`/`farResident`/`fieldResident`; asteroid/dressing/farActor tables resolve outside `entities` Map (unexercised by 47a) — projection/journaling of those tables is open work.
3. Ring bound holds only if the consumer drains — production needs drain-on-arrival backpressure (or a deeper ring).
4. Live-payload events: 437 dropped across 7 types in the spike run (`ship:thrust` 360, `entity:spawned` 48, `combat:damage`, `projectile:hit`, presentation cues) — 42 flat events bridged; id-resolution shims needed for HUD/cue consumers.
5. Command drain must move out of `advanceFixedTimestep` to runner level regardless of the scale gate.
6. Physics WASM is thread-local — init inside the worker, can't transfer (trivial).
7. Journal-over-postMessage suffices for the gate; SAB (`simWorkerProtocol`/`snapshotFence`) is an optional transport optimization, not a requirement.
2. **S2** — SoA sidecar: implement *inside* the S1 spike as its transport layout (a standalone sidecar without S1 is marginal on this hardware profile — sim is already sub-ms/tick).
3. **S5** — audit-gated M win (2-deep sector lookahead).
4. ~~S3~~ — partially landed (asteroidInstancePool); residual = density census only. ~~S4~~ — verified landed (shared class-priority decode budget). ~~S6~~ — verified landed. ~~S7~~ — save:loaded half landed; econTick slicing proven illegal. **S0** — gated on W4 revisit conditions.

### W28 structural audit — Phase-B decomposed (lane report `w28-structural-horizon.md`)

**Scope gate verdict: OPEN.** ~50 seam classes censused; exactly **3 hard-synchronous** surfaces — `economy.quote` (mutating read: lazy `ensureMarket`/`mintUnseededListing`/`getCycle` draws `state.economy.rngSeed`), `promoteAsteroidFieldRock`/`promoteFarActor` (sync-returning mutations — legal via command+ack: promotion was never same-frame-visible anyway), `physicsPrep/finalize` (already async → RPC). All three have legal resolutions; nothing blocks the flip.

**9-stage plan** (each flag-gated, independently revertable; stages 0–5 rehearse without the worker driving live flight; stage 6 is the flip):

| # | Stage | Gate | Risk |
|---|---|---|---|
| 0 | Shared sim-driver lib — extract ~290 LOC of 47a orchestration into `scripts/lib/simScenarioDriver.mjs` consumed by CLI + worker | golden via CLI AND worker | LOW |
| 1 | Command ring + input channel — `{input\|bus\|settings\|rpc}` per directive; input fold unchanged worker-side; gamepad sampled main-side | golden in-worker + `inputCommandHistory.toTape()` A/B | MEDIUM |
| 2 | Deep-flat event bridge — depth-4 projection, entity→read-model ref, per-type adapters only for live-object payloads; presentation tier re-enqueues into main's `presentationQueue` | 0 unintentional drops (was 437/7); listener-invocation parity probe | MEDIUM |
| 3 | Read model v1 — entities + aux rows (ledger/farActor/dressing journal transform records; `appendNearbyLedgerRows`→windowed query; `_syncWorldPresentationTableMeshes` dies) | collect-set equality vs live walk | MEDIUM-HIGH |
| 4 | Read model v2 — domain mirrors (player/missions/economy/cargo facades, mutate-in-place never swap) | DOM-diff probe on fixed-seed replay | MEDIUM |
| 5 | Hard-sync remediation — flag-gated eager market mint (commodity order → quote pure), promote→command+ack, physicsPrep→RPC | golden + market parity probe; save-compat review on mint ordering | HIGH(quote)/MEDIUM |
| 6 | **The flip** — `advanceSimulation`→directive send (accumulator math stays main; steps count crosses), `consumeLatestCompletedTick` reads transport ring, `SIM_LANE=main` revert flag | identical journal streams tick-for-tick + digest canary | HIGHEST |
| 7 | Ring + backpressure — depth 8, starvation→`completed-tick queue overflow`→`onSimulationFailure` (fail-closed, mirroring main today) | hold-consume probe throws at depth 9 | LOW |
| 8 | WASM init + optional SAB — `loadRapierCompatRuntime` worker-side (CSP bridge verify in Electron); SAB journal double-buffer opt-in (0.2ms baseline → polish) | rapier-dynamic golden in-worker | LOW-MEDIUM |

**Compounding finds**: worker-side `serializeData` is atomic *by construction* between directives (the live-lane coherent brick `saveSystem.js:4110-4113` becomes free); encode+checksum folds in — envelope worker keeps load-lane `restorePrepareSaveJson`, its encode half retires. **New items**: `stateDigestMarker` canary (rolling `snapshotSimState` FNV stamped on completed ticks → live golden-parity), `isEntityJournaled` consolidation (main.js:141 predicate vs worker copy — the drift class that produced the bd6cfadbc defect), eager market mint (kills the census's only mutating read + hardens determinism: today quote draw order depends on UI gesture order), GC isolation measurement plan (`monitorEventLoopDelay` + `externalCallbackGapMs`/`untrackedMs` A/B delta = the GC-share reading).

**?drawhist reopen condition** (S3-beyond-rocks): a `topClusters` row with `avg ≥ 2` draws/f on a SHARED geometry in a bloom-sector window AND `instanced === 0` — offline proxy: ≥2 live bodies sharing `data.archetypeGlb`/`authoredCompositionId` in a captured bloom state. Stations/dressing are expected unique; the histogram decides.

## A/B verification protocol (all levers)

- Golden `47a` sha256 `e517a97b…` bit-identical after every change.
- `node --check` + focused suites per touched area.
- For frame-pacing claims: A/B on identical revisions with the scripted-input probe; SwiftShader box = directional only, CI label evidence where it exists.
- Any lever that moves the golden hash is dead by definition — revert, don't negotiate.
