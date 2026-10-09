# Wave-121 Independent Global Bottleneck Review — coldshalamov/SpaceFace

**Audited**: `devin/1791504143-perf-w120` @ `3fa568f84` (HEAD; brief required `31352a672` or later).
**Mode**: blind review. Read from source, not from wave history. No app run (SwiftShader box presents 0 frames); all frame-time/GPU conclusions marked `hardware-unverified` where applicable.
**Bar**: real models in frame, no late pop-in, no hitches, no frozen loads, off-stage = lightweight sim. Zero visible-quality loss, golden `0b33dde18…` bit-identical.

---

## 0. Frame-loop anatomy (verified in code)

`src/core/presentationRunner.js` `frame()` (line ~1053) runs, per presented frame:

1. `advanceSimulation` → `simulationRunner.advance` → `registry.step` → ~140-system `PRODUCTION_UPDATE_ORDER` walk (`src/runtime/authoritativeSystemManifest.js:76-149`), partitioned into table/calendar/combat clocks (`src/core/catchupPolicy.js`).
2. `presentLastCompletedSnapshot` → `registry.renderUpdate` → `runRenderUpdatePhase` (`src/core/renderUpdatePhase.js`): `render.prepareFrame` → `render.drawPreparedFrame` → `vfx.update` → `feel.frame` → `ui.frame`.
3. `drainAfterPresentCompile` + `bus.drainEmitSlice` + `bus.drainPresentationTail` on the honest remainder (lines ~1197-1228).
4. A **second, independent rAF loop** drives audio (`src/audio/audioSystem.js:7003-7021`, `_frame()` at 7021) — not part of the presentation runner, not budgeted by it.

`renderer.prepareFrame` (`src/render/renderer.js:27605`) itself runs: publisher consume → rebind machinery → pose pack (`O(activeCount)`, 27799-27901) → `syncEntityViews` → occluders → authored+asteroid instance submission → sector transitions → shadow census/follow/refresh scheduling. `drawPreparedFrame` calls Three's `renderer.render` (renderGraph or straight/bloom route, ~31707-31722).

---

## 1. Ranked remaining bottlenecks

Ranked by estimated cost×frequency against THE BAR. Evidence level per item.

### B1 — Whole-scene traversals inside every `renderer.render()` — `PERFORMANCE-RELEVANT, MECHANISM_VERIFIED` (magnitude hardware-unverified)

Every draw pays two full scene walks before any rasterization:

- `scene.updateMatrixWorld()` — `vendor/three.module.js:17789` → recursive `Object3D.prototype.updateMatrixWorld` (patched :103-140; the `sfMatrixFrozen` skip only prunes *frozen* subtrees — every live/moving subtree is still walked every frame).
- `projectObject(scene, camera, 0, sortObjects)` — `vendor/three.module.js:17835` → recursive `projectObject` (:17985-18097): per-node frustum/visibility work over the entire graph.
- A second `updateMatrixWorld`+`projectObject` pair runs per shadow-map re-render when `_shadowMapDirty` (`renderer.js` ~253-289 schedules realtime refreshes; the pass re-traverses casters).
- A third traversal runs per UI-stage present (`presentUiStage`, renderUpdatePhase.js:54) when a stage is resident.

**Size estimate**: authored GLB hulls/stations carry multi-node subtrees (274 packages, ~5M triangles corpus per `w4-meshlets-REPORT`); a live sector's retained scene graph is plausibly 1-3k Object3D nodes. Per-frame cost ≈ O(nodes) × (matrix compose + frustum test) — on the order of low single-digit ms/frame on commodity CPUs, multiplied ×2-3 when shadow refresh or a UI stage lands in the same frame. This is the largest *unconditional* per-frame CPU item in the render path and none of the four lanes owns it (it is neither a hitch nor an admission event — it is every frame).

**Lane coverage**: **missed entirely**. lod-in-frame audits stand-ins, popin audits admission timing, boot/hitches audit bursts — nobody owns the steady-state traversal floor.

### B2 — Per-entity presentation bookkeeping in `syncEntityViewsSteps` — `MECHANISM_VERIFIED`

The visible-row loop (`renderer.js:26352-26600+`) executes per visible entity per frame: hidden-frozen restore queue consult + show-seq stamp (`26370-26383`), `refreshVisibleEntity` (`26391`), pose fence check + conditional `_applyPresentationPose` (`26396-26419`), band classify + LOD resolve (`26425-26463`), cradle-layout callback (`26465`), shadow-caster policy check for ship/station/place (`26472-26487`), geometry-pending roster note (`26489-26493`), live-glass test (`26498`), `livingMachineScore` (`26501-26520`), **two `noteOwnerVisibility` calls** (`26523-26526`), on-glass-pending ledger (`26532-26546`), ~20-field `_submitVisibilityOptions` fill + `shouldSubmitEntityMesh` + `applyEntityMeshVisibility` (`26547-26570`), deadline-glass promotion (`26575-26578`), shadow-caster pose note (`26579-26593`), `classifyRenderEntity` (`26595`), then runtime/closures per tier.

**Size estimate**: O(visible entities) × ~15-25 field-decision sites. With sector entity counts in the hundreds (`traffic`, asteroid fields, stations, NPC fleets, dressing mounts) this is the dominant *steady-state* CPU column of the present path — every mechanism is individually correct and dedup'd, but the sum is a fixed tax paid every presented frame even when nothing changed.

**Worst sub-mechanism**: `noteOwnerVisibility` (`src/render/assetResidency.js:916-925`) iterates the owner's *entire retained asset set* writing String-keyed Map rows — called **twice per visible entity per frame** (mesh + entity). For a ship owner retaining a whole GLB package (tens of entries), that is O(visible × ownerAssets) String() allocations + Map ops per frame — e.g. 200 entities × 30 assets × 2 calls ≈ 12k map ops + 12k string interns/frame. `UNVERIFIED` in magnitude, `MECHANISM_VERIFIED` in structure. A per-(owner, present, visible) memo collapses it to O(visible): the verdict inputs (onLiveGlass, owner set) are frame-stable.

**Lane coverage**: **partially attacked** — in-flight-hitches owns long frames, and the loop is already yield-stride'd for the opening publish path; but the *steady-state presented-frame* cost (the sync drive at 26116-26137 exhausts the iterator inline every frame) is nobody's headline finding.

### B3 — Sim bursts that cannot legally slice — `PERFORMANCE_VERIFIED` (measured W4), `MECHANISM_VERIFIED` (structure unchanged)

`econTick` ≈ **19 ms × 2 per run** (measured in `w4-workersim-REPORT`; code at `src/systems/economy.js:1564`, driven at `1559-1561`). It is synchronous inside `registry.step` — slicing mid-tick hands half-drifted `markets` to same-tick consumers → golden moves. `STRUCTURAL-HORIZON.md` S7 adjudicates slicing **illegal**. Other same-class bursts: sector-enter emit fanout (dozens of listeners on one emit), save serialize bursts, restore slicing overshoot, GC majors over the ~716 MB construction-garbage plateau (HILLCLIMB-LOG exp 1-5: ~450-570 MB still unattributed).

**Size**: a 19 ms synchronous burst at 60 Hz is ≥1 full dropped frame every occurrence; sector-enter emit fans were the historical ≥2.5 s long-task class (metric C, 3/60s at baseline).

**Lane coverage**: **partially** — hitches lanes have shaved the emit tails (sliced listeners, bounded drains) but the atomic kernels themselves (econTick, the step's 140-system walk on catch-up ×N steps) are unreachable by any lane because they are sim-atomic.

### B4 — Sector transitions still pay O(sector) total work — `MECHANISM_VERIFIED`

~120 waves of slicing made every leg *paced* — `sectorExitCleanupIter`, `arrivalRosterIter`, `enforceBudgetSteps` (O(assets) census at `assetResidency.js:1644`), mesh-build queues, decode runway, shell admission — but pacing is a *scheduler*, not a *reduction*: the total work is conserved, spread across tens of frames with iterator/drive overhead on top, and it occupies the same wall window during which the player sees the new sector (deadline-glass holds only ~0.25 s of grace per `PQ-210.03` gauge at 26219-26222). The scoreboard's own residual admits it: "residency census family — still O(assets × owners + pending) total per sector:exit drain, now paced but not reduced" (partially improved in W121 to O(assets) via `sectorOwnerIndex` — direction right, total still O(assets)).

**Lane coverage**: **attacked effectively** by boot-loading + popin-admission (this is their home turf). Remaining lever is *doing less work*, not scheduling it (see §3).

### B5 — First-draw shader link set — `UNVERIFIED` (hardware-gated re-measure)

Baseline B = 36 draw-time-miss links. Since then: program canon (`src/render/programCanon.js` — neutral-texture slot unification + dithering pinned) + retained **specimen pinning** (:159-413) so linked programs survive material teardown, + pull-queue urgent preemption + cohort `beginScenePipelineReadinessBatch` (per PR194-WAVE-LOG W39). Current count **cannot be measured on this box** (0 presented frames). What remains uncovered by construction: specimen signatures only cover material-states actually admitted once (`canonicalProgramSpecimenSignature` returns null for BatchedMesh and morph-textured InstancedMesh — :206-207), and any program whose axes only arise on a never-yet-seen subject class still links at first draw.

**Lane coverage**: **attacked** (boot/admission machinery), but effectiveness is unverifiable without owner hardware.

### B6 — Parallel audio rAF loop — `MECHANISM_VERIFIED`, unmeasured

`audioSystem.js:7003-7021`: a second `requestAnimationFrame` chain independent of the presentation runner, running `_stepWantedSearchAudio` + want-loop reconciliation + sidechain scan over `rt.voices` + `_applySettings` + `_updatePriorityDuckGains` + `_pushElementaryVoices` + `_updateEngineHum` + `_syncRemoteEngines` + brake/slipstream/tether/drill/mine/sector-cues/murmur/place/pressure/mix-ledger — ~15 subsystems per rAF tick. It shares the main thread, is unbudgeted, unlached against the frame ledger, and runs even during presentation freeze windows.

**Size**: probably sub-ms typical, multiplicative under combat voice counts; `UNVERIFIED` in magnitude. It is the only per-frame consumer that no pacing machinery touches at all.

**Lane coverage**: **missed entirely**.

### B7 — Physics step + post-step FFI surface — `MECHANISM_VERIFIED` (residual)

`sg02DynamicBodyOwner.js:1467-1547`: `world.step()` then per-dynamic-record WASM kinematics readback + `_enforcePlane` + `_clampSpeed` + `_syncEntityFromKinematics` + `_publishTelemetry`. W4 already cut the big FFI waste (isSleeping 44,820→0). Remaining is O(dynamicRecords) × (one WASM readback + entity sync) per tick — the sleep-verdict skip (1502-1504) covers sleeping islands only; every awake body still pays.

**Lane coverage**: **partially** — physics is in no lane's name; picked up only when it produced measurable spikes.

### B8 — Remaining per-frame consumers (bounded, mostly gated) — `MECHANISM_VERIFIED`, small each

- `vfx.update` (`vfx.js:12288-12610`): ~40 subsystem relevance polls + active-pool integrators per frame. Heavily quiet-latched already; the poll overhead itself (~40 method calls + a few index-version reads) remains.
- `ui.frame` (`hud.js:5416+`): settle springs ×~8 gauges + change-detected DOM writes; gated by 4 cadence clocks.
- Presentation-journal consume/merge + pose pack O(activeCount) each present (publisher `consume`, presentationPublisher.js:322; pack at snapshotFence.js:316).
- Warn-storm heartbeats (scoreboard residual): dedup'd, still mint suppressed-count heartbeat per second during persistent faults.

**Lane coverage**: attacked piecemeal by hitches lanes; individually small, collectively the fixed tax of the frame.

---

## 2. Lane-coverage verdict on the four standing lanes

| Bottleneck | lod-in-frame | popin-admission | boot-loading | in-flight-hitches | Verdict |
|---|---|---|---|---|---|
| B1 scene traversals | — | — | — | — | **missing entirely** |
| B2 per-entity bookkeeping | adjacent (LOD resolve inside it) | adjacent | opening-publish path sliced | the sync drive is theirs but steady-state isn't claimed | **partial** |
| B3 sim-atomic bursts | — | — | restore slicing | emit tails only | **partial — structurally unreachable** |
| B4 sector transitions | entrance cohort | admission queueing | cook window | slice pacing | **attacked effectively (scheduling), work itself unreduced** |
| B5 shader links | — | admission warms | compile machinery | drain tail | **attacked; unverifiable here** |
| B6 audio rAF | — | — | — | — | **missing entirely** |
| B7 physics FFI | — | — | — | adjacent | **partial** |
| B8 small consumers | — | — | — | piecemeal | **attacked piecemeal** |

The lanes are *hitch hunters*: they own variance, bursts, and admission timing. The uncovered territory is the **steady-state per-frame floor** (B1, B2, B6, B7) — the cost that exists when nothing is wrong — and the **atomic sim kernels** (B3) that no scheduler can legally split.

---

## 3. Adjudication of the major approach classes

### 3a. Whole-sim-in-worker (S1) — **PURSUE: the highest-ceiling remaining lever, already SHIP-proven on the spike**

`devin/s1-sim-worker-spike` (see §4) carried this to a stage-9 SHIP: golden 47a bit-identical in `worker_threads`, journal transport 0.21-0.26 ms mean, 16/16 playable on the `?simLane=worker` flip. This is the *only* approach that removes B3 entirely (econTick, sector sim bursts, restore slicing, GC majors all move off the presentation thread — the frame physically cannot hitch on them) and it removes B2's sibling risk (sim work and presentation no longer share the thread that must make the frame). It is also the only approach that converts "catch-up ×N steps after a hitch" from a dropped-frame amplifier into worker-side latency.

*Adjudication vs. the list*: **data-oriented sim** (S2) is real but measured small (whole sim ≈0.57 ms/tick — the sim is not the floor); it is worthwhile mainly *as S1's transport layout*, per STRUCTURAL-HORIZON's own ordering. **Off-thread preparation** is already landed (decode pools, glbPrepass worker, compile batches). **Simulation workers per-kernel** (S0) stays rejected — W4 proved intra-tick ordering blocks it; whole-sim sidesteps that exact objection.

### 3b. Scene-graph diet + submission consolidation — **PURSUE: the direct attack on B1**

Three independent legs, ordered by effort:

1. **Detach, don't hide**: culled/frozen roots currently stay in the scene and pay the traversal every frame (`visible=false` still walks). Removing off-stage subtrees from the graph (or re-rooting them under a detached "holding" group that `projectObject` never descends) converts O(scene) into O(on-stage). The `sfMatrixFrozen` machinery already computes the freeze boundary; the detach is mechanical. Golden-safe (render-side only). Effort M.
2. **BatchedMesh consolidation for dressing props / station parts / debris** — S3's deferred residual, gated on a density census. Worth re-census now: the last verdict pre-dates ~80 waves of residency churn. Every 50 same-geometry statics folded into one batch is 50 nodes out of both traversals AND out of the draw-call count. Effort S (census) + M (land).
3. **Persistent render lists / layer submission**: Three re-builds the render list per pass per frame. A retained-mode submission (build the draw set from the presentation world's own visibility verdict — already computed in B2 — instead of re-deriving it from the scene graph) is the architectural end-state; it subsumes frustum culling the game already does on slot columns. Effort L-XL, highest risk of the leg (diverges from Three's pipeline); only after legs 1-2 land.

### 3c. Column-ize the per-entity bookkeeping (B2) — **PURSUE: surgical, landable now**

The visible-row block is ~25 independent field-decisions per row executed as object code. Two cheap sub-moves before any big refactor:

- `noteOwnerVisibility` memo: stamp per (owner, visibilityPresent, verdict) — the inputs are frame-stable; drops B2's worst sub-loop from O(visible×assets×2) to O(visible). **S, near-zero risk, golden-safe** (presentation bookkeeping only).
- Group the per-row predicates (band, LOD, glass, shadow policy, living score) behind a per-row dirty/version key so settled rows evaluate once per *change* rather than once per frame — the presentation world already carries per-slot versions/generations; `PRESENTATION_QUERY_*_RETAIN` proved the pattern works at query level. Effort M.

Full SoA of the row (transpose the ~20 verdict fields into typed columns) is the data-oriented direction: real but the per-row work is branchy enough that the memoization above captures most of the win first.

### 3d. Adjudicated and NOT recommended now

- **GPU pipeline restructuring / reducing program diversity further**: real work already landed (canon + specimens + readiness cohorts + depth-prepass + postfx consolidation). Next step is *measurement on hardware*, not more mechanism.
- **Alternative rendering backends (WebGPU)**: still correctly GATED. Three's WebGL2 has no draw-indirect and no compute; WebGPU would unlock GPU culling but is an XL port that invalidates the SwiftShader-visible verification tooling; revisit only if B-measurement on owner hardware shows the draw-submit path is still the pole after 3b.
- **Instancing restructuring**: asteroid pool landed (765→54 leaf draws); residual is census-gated under 3b leg 2.

---

## 4. `devin/s1-sim-worker-spike` adjudication

**What it is**: 23,886-line branch (203 files) implementing the whole-sim-in-worker flip end-to-end — typed command ring + input channel (stage 1), deep-flat event bridge (stage 2), domain read-model mirrors (stages 3-4), hard-sync remediation (stage 5), worker-driven ticks + narrowed mirrors (stage 6), SAB journal + WASM worker-init (stage 7), browser Worker adapter + real-browser flip (stage 8), census-driven main→sim event forward surface + independent re-review (stage 9). Verdict: **SHIP** — golden bit-identical on main/worker/SAB lanes, 16/16 playable checks on both lanes, worker restore burst with presentation advancing through it.

**Relevance to current limiters**: directly and uniquely removes B3 (atomic sim bursts) and shelters everything else (presentation thread no longer competes with sim for the frame). It is the only lever addressing the *variance* the four lanes keep shaving at the edges.

**Gaps recorded by its own review** (post-stage-9): postMessage wire p95 ~0.85 ms on this Windows box vs <0.5 ms budget (SAB journal proves 0.03 ms pack+consume — gated on COOP/COEP isolation on the serve path); Electron `?simLane` provisioning unexercised; opt-in `rapier` backend bare-specifier import gap; ~67 KNOWN_UNFORWARDED event types adjudicated-but-not-forwarded; documented rare same-type-echo drop window.

**Verdict: PURSUE — mine the branch, do not merge it wholesale.** The branch is a working proof + a staged map; a production landing wants: (1) SAB journal under COOP/COEP on the real serve path (kills the wire p95 objection — the cheap path is already proven), (2) Electron provisioning path, (3) staged rollout behind the existing flag with the census-covered event set, (4) keep main-lane fallback forever (it is the debug/golden path). The honest caveat: this is the largest-risk integration in the campaign — but it is the only remaining move that is *structural* rather than *incremental*. If the campaign's mandate is "keep hill-climbing until 3 successive reviewers say stop," this is the mountain the increments are orbiting.

---

## 5. Rejected/GATED/WONTFIX reconsideration

From `PERF_CORPUS_CLOSURE_2026-09-26.md`, `PERF_MASTER_PLAN_2026-09-26.md`, W4 closure, and STRUCTURAL-HORIZON:

| Item | Prior verdict | Reopen? | Why |
|---|---|---|---|
| Whole-sim worker (PERF-09/S1) | GATED (entityList not emptied, copy-cost unproven) | **YES — top item** | Spike proved copy-cost (journal 0.26 ms, SAB 0.03 ms); gate (b) was *transport*, now demonstrated. See §4. |
| SoA entity columns (S2/PQ-067) | precondition | **YES as S1 transport layout** — standalone marginal (sim 0.57 ms/tick), but it is what makes S1's transport cheap; fold into the S1 landing plan. | |
| Rigid opaque batching / BatchedMesh statics (PQ-052, S3 residual) | GATED on draw-count census | **YES — cheap re-census** under 3b leg 2; attacks B1 directly. | |
| GPU-driven culling | GATED — WebGL2 no draw-indirect | NO | Platform unchanged. |
| WebGPU backend | GATED future | NO (see 3d) | |
| Kernel-level worker (S0, econTick isolation) | REJECTED on ordering | **Partially** — S1 supersedes the *reason* (whole-tick move makes ordering moot); per-kernel stays dead. | |
| Event interning | REJECTED (0.136% self-time) | NO | |
| three-mesh-bvh | REJECTED (no mesh raycasts) | NO | |
| Meshlets/clustered LOD | REJECTED (authored lod2 suffices) | NO | |
| Autosave slicing (.17) | REJECTED — not on classifier | NO (later bounded-autosave work covered the real cases) | |
| Render-in-worker (OffscreenCanvas submit) | parked (alternate S1 shape) | NO — whole-sim-in-worker is strictly better (fence was built for it; narrower migration surface). | |
| Texture-atlas bind reduction | KEPT, ~26 programs/frame floor | MAYBE via specimen coverage for non-authored families (VFX/UI/station-screen program set) — cheap audit, unmeasured payoff. | |

---

## 6. `saturated: false`

The campaign is **not** saturated. Three evidence-supported fronts remain:

1. **S1 integration** (§3a/§4): the single largest remaining lever is already proven on a branch. Sim-atomic bursts (19 ms econTick class) are unreachable by any other means.
2. **Steady-state presentation floor** (B1, B2, B6): scene traversals + per-entity bookkeeping + the unbudgeted audio loop are un-owned by the standing lanes and untouched by ~120 waves of burst-hunting.
3. **Sector-transition total work** (B4): paced but unreduced — the residency/decode/dispose volume per enter/exit is the same work in more places.

**Hardware-blocked parts of this review**: all frame-time magnitudes (B1, B2, B6 sized structurally only), the current B-metric link count (B5), GPU-side fill/program-switch costs, and every pacing claim — the box presents 0 frames under Electron/SwiftShader. The `probe:runtime-witness`/`probe:shader-timeline`/`probe:frame-solid` owner commands in scoreboard.json are the re-measurement path; **the single highest-value next action for the campaign is one owner-hardware re-measurement**, because every wave since W1 is MECHANISM_VERIFIED and the actual frame-time ledger has not been read since the baseline.

*Report ends. Audit-only; no source files modified.*
