<!-- LIFETIME: STABLE -->

# SpaceFace 2026 performance modernization execution plan

Status: **admitted source plan for PQ-034 through PQ-044; live lifecycle, leases, acceptance, and receipts remain in `design/program/`**

Authority: user direction → `ARCHITECTURE.md` → `design/program/` queue and active packet → this
selected source plan → packet-specific implementation notes.

Research appendix: [`PERFORMANCE_OPTIMIZATION_CONSTELLATION.md`](./PERFORMANCE_OPTIMIZATION_CONSTELLATION.md)
contains the broader option set, rejected alternatives, OSS survey, and large-port possibilities.
This document deliberately selects the work SpaceFace should actually do.

## 1. Executive decision

SpaceFace should pause further performance-sensitive architecture expansion and execute the following
program in order:

1. Establish a repeatable equivalence and performance harness.
2. Finish foreground/background lifecycle correctness.
3. Separate simulation scheduling from presentation scheduling without changing tick semantics.
4. Move authored ship and place geometry compilation out of gameplay and into deterministic release
   tooling.
5. Replace render-time scans of general `GameState` objects with a dense, event-maintained
   `PresentationWorld`.
6. Replace the proven per-job hostile full scan with deterministic batched spatial queries.
7. Upload only dirty GPU buffer ranges in high-churn pools.
8. Upgrade Electron to a supported Chromium/V8/GPU stack.
9. Use clean pass-level evidence to select the remaining GPU work.
10. Move simulation to a Worker only if the post-refactor trace proves presentation blocking still
    prevents simulation from keeping cadence.

Items 1 through 8 are the serious modernization program. Items 9 and 10 are evidence-selected
continuations, not excuses to postpone the first eight.

The central diagnosis is not that SpaceFace renders too much art. The central diagnosis is that its
runtime still performs work that a mature game would either compile offline, maintain incrementally,
or express in dense render-oriented data:

- ship/place render geometry is cloned, transformed, normalized, merged, and sometimes de-indexed
  while the game is running;
- the renderer traverses broad object collections repeatedly and performs interpolation and
  transform work before rejecting culled views;
- render diagnostics repeat collection scans and allocate fresh publication objects;
- one NPC-jobs query performs an `O(jobs × entities)` hostile search despite an existing spatial
  index;
- several dynamic GPU pools mark complete attributes dirty even when only a range changed;
- simulation, rendering, UI, and admission work share one main-thread frame callback, so a render or
  admission stall can create simulation catch-up work in the next callback;
- the desktop runtime is many major versions behind the supported Electron line.

Those are engineering defects worth fixing even when the game is not drawing a visually dense scene.

## 2. Non-negotiable outcome

The optimized game must be the same game.

Every packet must preserve:

- authoritative fixed-timestep results for the same seed and input tape;
- system order and event order;
- input response, flight behavior, AI decisions, combat outcomes, economy results, save continuation,
  and RNG consumption;
- authored geometry, textures, materials, animation, sockets, moving parts, VFX, lighting, bloom,
  HUD information, accessibility, and default quality;
- browser/Electron route parity;
- current WebGL2 support until a separately accepted backend proves equivalence;
- exact semantic identity where pixel identity is not stable across GPU drivers.

Performance work may change internal representation, scheduling, compilation location, allocation,
batching, query strategy, upload granularity, or backend. It may not obtain a pass by deleting authored
content, reducing default quality, lowering population, hiding effects, narrowing draw distance, or
changing gameplay.

> “Do not gain performance by reducing content, population, effects, draw distance, render quality, or default visual quality.”

## 3. What is proved today, and what is not

### 3.1 Current evidence

| Evidence | What it establishes | What it does not establish |
|---|---|---|
| July 23 60-second route: about 317 entities, rAF p95 near the display cadence, no unexpected over-32 ms frame intervals | A steady route can run smoothly on the same project | It does not cover heavy authored-asset admission or sustained dense combat |
| July 16 entity-residency capture: transitional rAF p95 66.6 ms, p99 233.3 ms, maximum 533.3 ms, long tasks, several authored upgrade jobs measured in seconds | Runtime asset admission has produced severe visible stalls | It does not prove every listed asset still has the same cost after later changes |
| July 25 profile: frame-GPU average around 25.6 ms, `bloomScene` around 20.5 ms, rAF p95 183.2 ms, plus Blender/export contention and an abnormally slow no-op control | The captured machine was badly contended and the frame was GPU-active | It is not a trustworthy clean baseline or proof that bloom itself is the root cause |
| Entity-sync scale probe: adding 1,000 roots raised sync p95 into roughly the 2.6–3.5 ms range, including far-culled roots | broad render traversal scales with roots that do not contribute pixels | It does not predict the exact gain from the final dense mirror |
| Current source inspection | the concrete defects named below exist in the live implementation | source inspection alone cannot rank their whole-frame effect |

### 3.2 Interpretation

SpaceFace has two different performance modes:

1. a steady-state route that can already approach the display floor; and
2. transitions, dense populations, runtime asset work, or contended presentation that can produce
   severe stalls.

That is why a single average FPS number is inadequate. This plan treats frame consistency, transition
latency, simulation cadence, GPU duration, allocation/GC, and scale behavior as separate results.

### 3.3 Claims intentionally not made

- Bloom is not declared broken from the contaminated July 25 trace. The current bloom pipeline is
  already small and avoids MSAA on its intermediates.
- Rapier is not declared a dominant cost without a trace selecting physics.
- A complete ECS rewrite is not presumed necessary.
- WebGPU is not presumed faster merely because it is newer.
- A renderer or engine port is not justified before the selected architectural defects are removed.

### 3.4 Feasibility and confidence

| Change | What is known | Feasibility | Equivalence risk | Classification |
|---|---|---|---|---|
| Lifecycle correctness | incomplete lifecycle policy and disabled browser throttling are present; an implementation lane already exists | High | Low outside intentionally hidden states | obvious overdue platform work |
| Scheduler/presentation seam | simulation and presentation share one callback today | High | Medium, controlled by tick-tape parity | professional prerequisite, not a speed miracle by itself |
| Offline render compiler | runtime clone/transform/merge/de-index code and long admission jobs are directly observed | High | Medium, controlled by semantic asset parity | highest-confidence stall removal |
| Dense `PresentationWorld` | repeated broad scans and pre-cull transform/LOD work are directly observed | High | High, controlled by shadow mode | highest-confidence scale refactor |
| Batched spatial hostile query | the `O(jobs × entities)` scan and an existing index are directly observed | Very high | Low | obvious algorithmic oversight |
| Dirty-range GPU uploads | complete attributes are marked dirty and the installed renderer supports update ranges | High | Low/Medium | obvious missing upload optimization; whole-frame effect must be measured |
| Electron modernization | 31.x is outside the currently supported lines | Very high | Medium due accumulated breaking changes | required platform maintenance |
| GPU pipeline branch | one contaminated capture points at GPU work but does not isolate its cause | High after a clean trace | branch-dependent | real work, diagnosis not yet selected |
| Simulation Worker | the seam is feasible; causal necessity is not established | Medium/High | High | conditional large refactor |
| WebGPU/TSL backend | supported by the installed Three.js line but officially experimental | Medium | High | deliberate vertical slice, not a current commitment |

The first seven rows are not speculative rewrites. They address code and platform conditions present
in the live repository. The final three are deliberately prevented from consuming the program until
their causal trigger is proved.

## 4. Target architecture

```mermaid
flowchart LR
    IN["Input snapshots"] --> SR["SimulationRunner"]
    SR --> GS["Authoritative GameState"]
    GS --> CJ["Spawn, destroy, transform and visual change journal"]
    CJ --> PW["Dense PresentationWorld"]
    PW --> VS["Visibility and presentation queries"]
    VS --> RD["Renderer and GPU pools"]
    RD --> UI["HUD and presentation"]

    AS["Authored GLB and semantic manifests"] --> RC["Deterministic offline render compiler"]
    RC --> RP["Versioned render packages"]
    RP --> RM["Runtime residency manager"]
    RM --> PW

    SR -. "optional only after proof" .-> SW["Simulation Worker"]
    SW -. "versioned snapshots" .-> PW
```

`GameState` remains authoritative and readable by simulation systems. `PresentationWorld` is a derived,
disposable mirror optimized for interpolation, culling, batching, GPU publication, and rendering.
Render packages are generated artifacts; authored GLBs and semantic manifests remain source truth.

## 5. Program sequence

| Order | Packet | Size | Decision | Primary payoff |
|---:|---|---|---|---|
| 0 | PERF-00 Equivalence and attribution harness | Medium | Do now | makes every later claim falsifiable |
| 1 | PERF-01 Lifecycle correctness | Small | Finish and accept existing lane | removes hidden/minimized work and resume storms |
| 2 | PERF-02 Scheduler/presentation seam | Medium | Do now | removes overload amplification and enables safe parallelism |
| 3 | PERF-03 Offline semantic render compiler | Large | Do now | removes seconds-scale runtime geometry work |
| 4 | PERF-04 Dense `PresentationWorld` | Large | Do now | makes render cost scale with changed/visible data |
| 5 | PERF-05 Deterministic hot-query service | Medium | Do now | removes proven `O(jobs × entities)` behavior |
| 6 | PERF-06 Dirty-range GPU uploads | Medium | Do now | reduces CPU copies, driver traffic, and pool stalls |
| 7 | PERF-07 Electron modernization | Medium | Do now | obtains supported Chromium/V8/GPU behavior |
| 8 | PERF-08 GPU pipeline correction | Medium/Large | Select branch from clean trace | attacks the measured remaining GPU limiter |
| 9 | PERF-09 Simulation Worker | Large | Conditional | isolates simulation only if main-thread coupling remains causal |
| 10 | PERF-10 WebGPU vertical slice | Large | Conditional | tests a future backend without betting the game |

PERF-00 is a dependency of every result. PERF-01 and the first half of PERF-02 may proceed while the
offline compiler is built. PERF-04 depends on the change-journal seam created by PERF-02. PERF-06 may
begin on unleased pools before PERF-04 and then adopt `PresentationWorld` handles. PERF-08 begins only
after PERF-07 so it measures the runtime intended to ship.

## 6. Common acceptance system

Before the first edit in every claimed packet, persist the exact candidate's `npm run check:baseline` link matrix in addition to the packet's L0–L2 entry gates. Rerun the same fast baseline at exit and require its green set to be a superset of the entry green set. A red entry check is repaired or carries an integrator-issued `INHERITED_RED` token under `design/program/roadmap/00_EXECUTION_PROTOCOL.md`; a worker may never classify a red check as `OUT_OF_SCOPE`.

### 6.1 Deterministic simulation oracle

For each scenario, record the seed and timestamped input-command tape. At every fixed tick, hash an
explicit authoritative projection:

- player and NPC transforms and velocities;
- health, shields, energy, heat, ammo, cooldowns, and active effects;
- AI state, selected target, job state, and issued intents;
- active entities with stable IDs and archetypes;
- credits, cargo, reputation, missions, faction state, and sector ownership;
- RNG state and consumed-stream counters;
- ordered gameplay events emitted during the tick.

Compare baseline and candidate tick by tick. A mismatch reports the first tick, field, and preceding
events. Expected-output files are never edited to make an optimization pass.

### 6.2 Presentation semantic oracle

For fixed cameras and fixed simulation snapshots, compare:

- stable render-object identity and parent relationship;
- world transform and interpolation result;
- visibility, culling classification, and LOD selection;
- geometry content hash, index/vertex count, draw range, bounds, and material pipeline key;
- texture identity and color-space settings;
- socket, hardpoint, trail, light, shadow, canopy, and dynamic-surface attachment transforms;
- render order, depth/blend behavior, and authored animation state;
- HUD semantic tree and accessibility state.

Near-, middle-, and far-camera stills plus short temporal sequences supplement the semantic comparison.
Pixel differences caused by driver sampling must be investigated; they are not an automatic waiver.
Any player-visible difference fails unless it fixes a separately documented bug.

### 6.3 Required routes

The harness must cover:

1. boot → new game → first controllable flight;
2. quiet flight with the current normal population;
3. the same flight with five times the entity population;
4. dense hostile combat with weapons, shields, trails, particles, and destruction;
5. mining/tether/salvage;
6. travel and system/region transition;
7. dock, station UI, undock;
8. map and navigation overlays;
9. save, load, and deterministic continuation;
10. authored ship/place cold admission and warm cache admission;
11. minimize, restore, hide/show, display change, suspend/resume, and lock/unlock;
12. WebGL context loss and recovery.

### 6.4 Matched A/B method

- Run baseline and candidate from the same seed, save, camera route, and input tape.
- Alternate run order so thermal or background drift does not always favor one build.
- Record display refresh, renderer/GPU identity, process census, power state, window state, and
  background contention.
- Run a WebGL no-op control beside game captures. A slow control invalidates whole-frame conclusions.
- Capture browser and Electron separately.
- Keep the old path behind a temporary diagnostic switch until the candidate passes equivalence and
  demonstrates a repeatable gain outside run noise.
- Remove the old path in the same packet or a named immediate cleanup packet; do not leave permanent
  dual implementations.

### 6.5 Measurements

Each capture publishes:

- rAF interval and callback duration distributions;
- fixed-tick count per callback, individual tick duration, backlog, and discarded-time events;
- render prepare, visibility, publication, scene render, post, and UI CPU duration;
- pass-level GPU duration where timer queries are valid;
- draw calls, triangles, visible roots, visible meshes, material pipeline keys, and shader programs;
- asset decode, compile, upload, admission, and first-visible latency;
- bytes requested and uploaded for dynamic attributes;
- query count, candidates visited, and results returned by owner;
- allocation rate, long tasks, GC pauses, and heap trend;
- memory/residency by asset class;
- input-to-photon markers for representative commands.

## 7. PERF-00 — Equivalence and attribution harness

### Defect

Existing probes contain valuable measurements, but a run can still mix browser delay, game callback
time, GPU time, and unrelated process contention. They also do not provide one baseline/candidate
equivalence report that can close a major refactor.

### Implementation

1. Add a versioned scenario manifest describing seed, save, input tape, camera tape, entity multiplier,
   required telemetry, and expected route completion marker.
2. Add a baseline/candidate runner that launches each candidate in alternating order and writes one
   comparison directory.
3. Move current performance counters behind a common frame identifier:
   `display-frame`, `simulation-tick`, `render-frame`, `GPU-query`, and `background-job`.
4. Add invalidation reasons: slow no-op control, unrelated high-CPU process, GPU timer disjoint,
   renderer fallback, asset-cache mismatch, wrong display refresh, or route divergence.
5. Add the deterministic simulation and presentation-semantic comparisons from Section 6.
6. Add a machine-readable verdict with separate fields for equivalence, measurement validity, and
   improvement. One cannot substitute for another.

### File map

- extend `scripts/lib/performanceScenarioDriver.mjs`;
- extend `scripts/probe-performance-profile.mjs`;
- extend `src/core/perfRuntime.js`;
- extend `src/render/postTelemetry.js`;
- add `scripts/lib/performanceEquivalence.mjs`;
- add `scripts/validation-manifests/performance-closure.json`;
- add `test/performance-equivalence-contract.test.mjs`;
- emit ignored evidence below `.devshots/perf/closure/<candidate>/`.

### Completion proof

- Intentionally alter one simulation field: the harness identifies the first divergent tick.
- Intentionally alter one material/transform/socket: the presentation comparison identifies it.
- Run a deliberately contended capture: measurement validity fails without failing equivalence.
- Run baseline against itself: it closes with no semantic difference and reports natural run variance.

### Exit condition

No later packet may claim completion until this harness can distinguish “same game,” “valid capture,”
and “faster.”

## 8. PERF-01 — Foreground/background lifecycle correctness

### Current state

A separate protected worktree, `codex/perf-01a-background-lifecycle`, is already implementing this
area. Its changes are not accepted merely because they exist. Do not overwrite or duplicate that lane.

### Defect

The primary desktop window currently disables Chromium background throttling, while simulation and
render scheduling do not have a complete minimized/hidden/suspend/resume state machine. This can waste
resources offscreen and can feed a large elapsed interval back into the fixed-step loop on resume.

### Required lifecycle

Use explicit states:

- `foreground-visible`;
- `foreground-occluded`;
- `hidden-or-minimized`;
- `system-suspended`;
- `restoring`.

Window events and `document.visibilityState` publish one idempotent lifecycle command. On entry to a
non-presenting state:

- stop presentation scheduling and GPU submission;
- stop cosmetic/UI clocks that have no background meaning;
- preserve authoritative state and save safety;
- do not accumulate wall time for a later catch-up burst.

On restore:

- reset the presentation timestamp;
- resume from the latest committed fixed tick;
- prewarm only resources invalidated by the platform;
- render one coherent snapshot before accepting player input that assumes a visible response.

Foreground gameplay behavior remains unchanged. Hidden-window behavior becomes explicit shell policy
rather than accidental background execution.

### File map

- `electron/main.cjs`;
- `src/main.js`;
- `src/core/loop.js`;
- `test/loop-lifecycle.test.mjs`;
- `scripts/check-electron-background-lifecycle.mjs`;
- `scripts/check-launch-policy.mjs`.

### Completion proof

- foreground input tape produces the same tick digest before and after;
- minimized/hidden CPU and GPU submission cease;
- restore produces no multi-tick storm and no large interpolation jump;
- suspend/resume and lock/unlock do not duplicate listeners or lose input state;
- packaged Electron and browser lifecycle routes both pass.

## 9. PERF-02 — Separate simulation scheduling from presentation scheduling

### Defect

`src/core/loop.js` currently advances up to four fixed ticks and performs renderer/UI work from the
same rAF callback. When presentation stalls, the next callback can inherit multiple simulation ticks,
making the callback longer and increasing the chance of another delayed frame. The loop also exposes
no clean boundary for a future Worker.

### End state

Introduce:

- `SimulationRunner`: owns accumulator semantics, fixed ticks, system order, RNG/time, and publication
  of a completed tick revision;
- `PresentationRunner`: owns rAF, interpolation alpha, renderer/UI scheduling, and lifecycle;
- `PresentationJournal`: records spawned, destroyed, moved, and visually changed stable entity IDs
  during each tick;
- `InputCommandSnapshot`: immutable commands consumed at a fixed-tick boundary;
- `CompletedTick`: revision, sim time, journal span, and state digest marker.

The first implementation remains on the main thread. It is a semantic extraction, not premature
parallelism.

### Implementation order

1. Characterize current accumulator, cap, and discarded-time behavior with input tapes.
2. Extract `SimulationRunner` behind a compatibility adapter that produces the same tick sequence.
3. Extract `PresentationRunner` without changing rAF order.
4. publish input only at fixed-tick boundaries.
5. Emit a journal from authoritative spawn/destroy and transform/visual-version owners.
6. Make renderer/UI consume `CompletedTick` plus interpolation alpha rather than assuming they own
   simulation advancement.
7. Add telemetry for backlog cause: simulation work, presentation work, admission work, or external
   scheduling.

### File map

- refactor `src/core/loop.js`;
- add `src/core/simulationRunner.js`;
- add `src/core/presentationRunner.js`;
- add `src/core/presentationJournal.js`;
- route input snapshot creation from `src/systems/input.js` without changing raw-axis/action semantics;
- add focused runner and journal tests under `test/`.

### Completion proof

- all deterministic scenario digests match the pre-extraction loop;
- callback traces no longer conflate fixed-tick and presentation ownership;
- no lifecycle transition creates catch-up work;
- renderer disabled, renderer stalled, and UI stalled tests attribute the delay correctly;
- the game remains playable after each extraction commit.

### Exit condition

Do not move simulation to another thread in this packet. The purpose is to make that later change
possible without rewriting gameplay systems and to stop presentation stalls from being an opaque
whole-loop failure.

## 10. PERF-03 — Offline semantic render compiler

### Defect

The live render path still contains a runtime compiler:

- `src/render/assetLoader.js` compiles blueprints and clones matrices;
- `src/render/partsLibrary.js` serially decodes assets, clones geometries, applies matrices, merges
  geometry, normalizes attributes, promotes quantized data, and may call `toNonIndexed()`;
- cold and even some cache-hit authored upgrade jobs have measured from hundreds of milliseconds into
  multiple seconds.

This work is deterministic from release inputs and should not run during play.

### Render-package format

For every release ship/place, generate:

```text
<asset-id>/
  render.glb
  render-package.json
```

`render.glb` contains immutable, pre-transformed render clusters. `render-package.json` contains:

- compiler and schema version;
- source manifest and content hashes;
- stable semantic node IDs;
- sockets, hardpoints, docking anchors, trail anchors, lights, and effect anchors;
- dynamic surfaces and moving-part group boundaries;
- material pipeline keys and texture references;
- LOD/HLOD records, bounds, collision references, and spatial-cluster IDs;
- geometry/material hashes used by the equivalence oracle.

Authored source GLBs remain the source of truth. Render packages are reproducible generated outputs.

### Compiler pipeline

1. Validate the exact release manifest and dependency hashes.
2. Load the source GLB and semantic metadata.
3. Separate immutable geometry from sockets, dynamic surfaces, and moving groups.
4. Bake immutable node transforms.
5. Normalize required vertex attributes without expanding indexed geometry unless semantically
   unavoidable.
6. Weld only bit-identical vertices.
7. Reorder indices/vertices for post-transform cache and vertex-fetch locality using meshoptimizer.
8. Group by compatible material/pipeline state and spatial cluster; never merge across a moving,
   semantic, transparency, or independently culled boundary.
9. Compute bounds and validate every anchor/group transform.
10. Write `render.glb`, metadata, provenance, and hashes deterministically.
11. Rebuild twice and require byte-identical outputs.

The equivalence phase does not simplify meshes, reduce textures, change material models, or alter
authored LOD distances.

### Runtime path

1. Resolve the render-package hash from the release manifest.
2. Decode/load the package once per content hash.
3. Share immutable geometry, material, and texture resources.
4. Instantiate lightweight stable roots and declared dynamic groups.
5. Attach anchors from metadata.
6. Publish residency and first-visible status.
7. Use the legacy runtime compiler only as a temporary diagnostic fallback until that asset class
   passes.

### Pilot order

1. player Kestrel;
2. one freighter with dynamic/auxiliary surfaces;
3. one large trade hub/place;
4. all release ships;
5. all release places.

This deliberately covers the most difficult semantic cases before bulk conversion.

### File map

- add `scripts/compile-render-packages.mjs`;
- add `scripts/lib/renderPackageCompiler.mjs`;
- add `scripts/check-render-package-equivalence.mjs`;
- add `src/render/renderPackageLoader.js`;
- add a versioned schema under `src/contracts/`;
- integrate hashes into existing release manifests;
- retain source assets and existing authored validation.

### Reused OSS

- existing `@gltf-transform/*` dependencies for deterministic glTF transforms;
- existing `meshoptimizer` for cache/fetch reorder and compression;
- existing Three.js GLTF/KTX2/Meshopt runtime loaders.

### Completion proof

- compiler outputs are reproducible;
- geometry, materials, anchors, dynamic groups, LOD/HLOD, screenshots, and temporal sequences match;
- no clone/apply/merge/de-index operation occurs on the accepted runtime route;
- cold and warm admission traces show those phases absent, not merely faster;
- all release assets pass before the fallback is removed.

### Expected magnitude

For assets that previously performed seconds of runtime geometry work, removing that work can exceed
a fivefold transition-latency improvement without changing a pixel. Whole-frame steady-state speed is
not claimed from this packet; its purpose is eliminating major stalls and making admission bounded by
I/O, decode, upload, and construction.

## 11. PERF-04 — Dense `PresentationWorld`

### Defect

`src/render/renderer.js::syncEntityViews()` currently:

- walks broad render-view collections;
- interpolates and writes transforms before the cull rejection;
- computes LOD before skipping a culled view;
- allocates a new sync-diagnostics object each frame;
- invokes additional diagnostics that scan the collection again.

Other frame consumers perform overlapping derived scans. This makes cost scale with registered roots
instead of changed or visible presentation work.

### Data model

Add a disposable `PresentationWorld` containing dense arrays indexed by stable handle:

- generation, alive flag, stable entity ID, and render slot;
- previous/current X, Z, rotation, bank, pitch, scale, and bounds;
- entity type/team/relation flags needed for rendering;
- mesh, material, LOD, effect, shadow, trail, light, and dynamic-surface flags;
- transform, visual, attachment, and residency revisions;
- visible-last-frame and visibility-cell membership;
- dirty masks and active-list positions.

Use typed arrays for numeric hot fields and compact side tables only for JS/Three object references.
Handles include a generation so a destroyed slot cannot alias a later entity.

### Publication rules

- spawn allocates a handle and publishes a complete record;
- destroy retires the handle and all pool memberships;
- physics/flight publishes changed transforms through existing single-writer points;
- ships/damage/effects publish visual revisions;
- asset residency publishes resource/LOD availability;
- static entities never re-enter transform work until their version changes;
- camera visibility produces candidate handles from the spatial index;
- newly visible handles receive a full transform/attachment sync;
- already visible handles receive only fields whose version changed.

No simulation system reads `PresentationWorld`; it can be destroyed and rebuilt from `GameState`.

### Migration sequence

1. **Shadow publication:** build `PresentationWorld` while the legacy renderer remains authoritative.
   Compare records every tick.
2. **Visibility source:** derive candidate handles from the spatial index and compare legacy cull/LOD
   decisions.
3. **Transform source:** render interpolation reads dense arrays; offscreen `Object3D` transforms are
   not written.
4. **One-pass frame publication:** the same visible-handle traversal feeds main meshes, contact
   shadows, ship auxiliary pools, authored instance pools, trails, and lights.
5. **Diagnostics removal:** debug telemetry reads counters maintained during publication instead of
   rescanning collections.
6. **Legacy removal:** delete broad scan/update paths after matched parity and scale results.

### File map

- add `src/render/presentationWorld.js`;
- add `src/render/presentationPublisher.js`;
- add `src/render/presentationQueries.js`;
- refactor `src/render/renderEntityFrame.js`;
- refactor `src/render/renderer.js::syncEntityViews()`;
- adapt contact-shadow, authored-instance, ship-auxiliary, trail, and light consumers;
- add handle-lifecycle, shadow-parity, culling, LOD, and interpolation tests.

### Completion proof

- shadow mode reports identical records and cull/LOD results;
- deterministic and presentation-semantic oracles pass;
- no per-frame diagnostic allocation or second diagnostic scan remains;
- transform work is proportional to visible/changed handles;
- at five times current entity count, entity-view publication is no slower than the old path at
  current count on the same route and machine;
- destroying/spawning into a reused slot cannot produce a one-frame wrong mesh, effect, or attachment.

### Expected magnitude

This is the strongest credible path to a fivefold entity-scale improvement because it changes the
growth function: broad `O(all registered roots)` presentation work becomes
`O(changes + visibility candidates + visible roots)`. It does not promise five times higher FPS when
the GPU or another fixed cost dominates.

## 12. PERF-05 — Deterministic hot-query service

### Defect

`src/systems/npcJobsRuntime.js::_nearestHostile()` scans `state.entityList` for each job on each
eligible update. With `J` jobs and `N` entities, this is `O(JN)` even though the project already has
`entityIndex`, `SpatialHash`, and batch-query support.

### Implementation

1. Add an owner-facing query API that accepts many origin/radius/relation requests.
2. Bucket requests by spatial cells and relation/team filters.
3. Reuse scratch candidate/result storage; avoid per-tick `filter`, closure, and sort allocations.
4. Return stable IDs in deterministic distance order with a stable-ID tie break.
5. Resolve IDs through `entityIndex`; never retain stale entity-object references across ticks.
6. Replace `_nearestHostile()` calls with one batch per NPC-jobs cadence.
7. Instrument requests, cells visited, candidates tested, results returned, and scratch growth.
8. Audit other repeated full scans using runtime owner counters, then migrate only owners that are
   measured hot. Cadenced or event-only scans are not rewritten automatically.

### File map

- refactor `src/systems/npcJobsRuntime.js`;
- extend the existing spatial-query owner rather than adding a second index;
- add deterministic query tests and dense-population scenarios;
- add owner query counters to performance telemetry.

### Completion proof

- baseline/candidate select the same hostile for every request and tick;
- empty, equal-distance, destroyed, spawned, cross-team, and boundary-cell cases pass;
- candidate visits grow with nearby density rather than total world population;
- the five-times-population scenario shows the NPC-jobs query remaining a small, stable portion of
  fixed-tick time.

## 13. PERF-06 — Dirty-range GPU uploads

### Defect

Several dynamic pools set complete attributes or instance matrices `needsUpdate` even when only a
small active range changed. No source path currently uses Three.js `BufferAttribute` update ranges.
That can copy excess JS memory, issue excess driver traffic, and create avoidable synchronization.

### Implementation

1. Add `src/render/dynamicBufferRanges.js` with a small non-allocating owner-side pending-span
   accumulator. Logical writes only union component indices; they never publish Three.js range metadata.
2. Chain the selected object's actual-draw pre-upload hook, normally `onBeforeRender`. Invoke any prior
   owner hook first, resolve the final current attribute after all writes/growth/replacement settle, then
   publish the complete pending union once with one `addUpdateRange()` call and one `needsUpdate`
   increment. A skipped/hidden/culled frame publishes nothing and retains the pending union.
3. After publication, keep the uploaded snapshot immutable. Writes made before its callback—including
   reentrant owner writes from the chained upload callback—enter a separate unpublished next-generation
   span and are not folded into the transfer already in progress.
4. Chain `onUploadCallback` with a reentrancy-safe acknowledgement. At callback entry verify the exact
   attribute/version, remove only the initial-`bufferData` snapshot's exact stale record when required,
   acknowledge/detach the uploaded snapshot before invoking the prior callback, and defer callback-time
   owner writes until a later pre-upload hook after `WebGLAttributes.update()` returns. Existing callbacks
   may not directly mutate the tracked attribute's version/range metadata; detect that condition and fail
   the migration rather than letting Three.js cache an unuploaded callback-created version.
5. Creation, growth/reallocation before publication, and context restoration publish one full initialized
   range on the final current attribute. An interrupted/context-loss publication without callback is an
   explicit terminal `superseded-reset`, not an acknowledgement or ordinary-budget success; carry the
   initialized union to the replacement attribute and report both records.
6. Set `DynamicDrawUsage` or `StreamDrawUsage` before first upload according to actual buffer lifetime;
   usage is not changed after upload. Set active instance/draw counts independently from capacity.
7. Record logical bytes, requested bytes, pending/published/acknowledged/superseded generations, range
   identity, capacity, reallocations, callback-guard violations, and cumulative range-record allocations.
8. Cap the initial combat-plus-trail-streak stage at 23 Three.js records per ordinary actual upload and
   1,380 records/second at 60 uploads/second, with zero on unchanged/skipped frames. Prove the ceiling
   under the live high-fanout-and-grow route: begin one slot below capacity, perform 18 capital-debris
   spawn commits plus one trail integration commit, replace/grow before the same draw, and still allocate
   only three final trail records—not 57 or six—at one-times and five-times population. Later stages
   require their own population-scaled allocation/GC ceilings before admission.
9. Use ping-pong/orphaning only if GPU/CPU traces still show synchronization after range uploads.

### Migration order

1. `src/render/combat/instancedSpritePool.js`;
2. `src/render/engineTrailSurfaces.js`;
3. authored-instance matrices in `src/render/partsLibrary.js`;
4. ship-auxiliary matrices in `src/render/renderer.js`;
5. high-churn pools in `src/render/vfx.js` after the active VFX ownership lane clears.

Do not alter leased VFX files merely to complete this packet.

### Completion proof

- output, instance identity, lifetime, ordering, and capacity behavior match;
- randomized sparse/dense dirty patterns upload the correct components;
- a skipped/hidden render followed by a disjoint write publishes nothing until the next actual draw, then uploads the complete union, including `ZERO_MATRIX` release and immediate slot reuse;
- callback-time owner writes remain in a separate next generation, direct callback version/range mutation fails closed, and Three.js never caches an unuploaded version;
- buffers never display stale data after wrap, grow, shrink, spawn, destroy, interrupted-render supersession, or context restoration;
- telemetry shows upload bytes following the pending union published at the actual pre-upload hook rather than allocated capacity;
- cumulative range-record and GC ceilings hold at one-times and five-times population, including exactly three final trail records across the 18-spawn-plus-one-integration-plus-grow pre-draw fanout;
- matched combat captures demonstrate a repeatable CPU/driver gain or the abstraction is removed.

## 14. PERF-07 — Electron modernization

### Defect

The project declares Electron 31.x, a mid-2024 runtime. As of 2026-07-26, the current stable release
is 43.2.0 and the supported major lines are 41, 42, and 43. SpaceFace is therefore missing two years
of Chromium, V8, ANGLE, GPU-driver workarounds, platform lifecycle fixes, and security support.

### Implementation

Use temporary compatibility checkpoints at 37, 40, and 43 to isolate breaking changes; only the final
supported line is retained.

At each checkpoint:

1. update Electron and the matching Playwright/Electron launch surface;
2. run main/preload API and security-setting checks;
3. run file/custom-protocol, asset URL, save path, window lifecycle, input, display, audio, controller,
   and packaging checks;
4. record Chromium, V8, ANGLE, renderer, GPU-feature, and hardware-acceleration identity;
5. run the same deterministic and performance scenarios;
6. fix compatibility without adding a browser-only gameplay route.

The final upgrade also audits removed/deprecated APIs, Content Security Policy, context isolation,
sandbox/preload boundaries, crash recovery, and power-monitor events.

### File map

- `package.json` and lockfile;
- `electron/main.cjs` and preload surface if required by documented breaking changes;
- Electron/Playwright launch and package scripts;
- lifecycle, launcher, packaged-build, and GPU identity checks.

### Completion proof

- the supported runtime launches, packages, saves, loads, and plays the same route;
- deterministic and presentation-semantic oracles pass;
- hardware acceleration and expected renderer are active;
- browser/Electron parity remains;
- performance comparison is reported even if the upgrade is neutral; support/security alone justify
  leaving 31.x.

## 15. PERF-08 — GPU pipeline correction selected by clean evidence

This packet is required, but its implementation branch is selected by valid pass-level evidence after
PERF-07. The July 25 contended trace is not enough to choose. Before either selecting capture begins,
the active packet must freeze and independently review the selecting render path, exact diagnostic
cells, scalar metric formulas, within-block and cross-block estimators, deterministic bootstrap,
numeric thresholds, sample floors, runtime manifests, and fail-closed selector. Changing any of those
values invalidates the selecting evidence and requires recapture.

The admitted contract disables the overlapping render-graph path for selecting cells and asserts the
live bloom or straight path. Physical default-bloom timing consists only of `bloomScene`,
`bloomDownsample`, and the fused `bloomComposite`; the diagnostic bypass consists of `bloomScene` plus
`bloomBypassCopy`. It uses seven paired counterbalanced blocks per runtime, Type-7 within-block
statistics, paired block-level transforms, literal statistic keys, deterministic FNV-1a/xorshift32
bootstrap streams with a zero-state remap, at least 120 sampled rendered frames per cell, at least 700
completed origin-linked queries per required physical pass/cell, zero promoted
overlap/disjoint/drop/reset/context-loss/nested/overflow states, and bounded pending-query drain.
Browser and Electron compute A/B/C raw facts independently, apply the frozen disjoint dominance/exclusion
equations, and must produce the same single final branch. Zero final results, an impossible multiple
result, invalid scalar or confidence boundary, missing data, or runtime disagreement returns `BLOCKED`.

### Diagnostic matrix

| Clean result | Root interpretation | Implemented branch |
|---|---|---|
| scene GPU time has the packet's minimum output-pixel elasticity, the `1.00 → 0.80 → 0.60` cells are directionally monotone, and draw/triangle/state counts stay fixed | fragment shading, transparency, lighting, or overdraw | PERF-08A pixel/overdraw correction when B and C raw facts are false |
| named structural growth, same-metric structure effect, absolute structure-minus-pixel effect, and the packet's zero-safe cross-multiplied relative margin all pass | submission/pipeline fragmentation | PERF-08B material and ordering correction when C is false |
| physical post share, post/display-interval cost, fleet-size equivalence, copy-cost-adjusted bypass reduction, scene equivalence, and omitted-group agreement all meet PQ-042's scalar bounds | full-screen pass cost | PERF-08C post-pass fusion/reuse |
| A/B/C raw facts are false and GPU p95/p99 remain below the packet's display-interval health ceilings; callback timing is either healthy everywhere (D0) or every late route/runtime has a stable origin-linked non-GPU owner while non-late peers remain healthy (D1) | not a GPU problem | PERF-08D evidence-only closure; no follow-up for D0, bounded CPU/scheduler-owner routing for D1 |

Raw facts may overlap, but final corrective ownership is literal and disjoint: C owns `C_raw`; B owns
`B_raw && !C_raw`; A owns `A_raw && !B_raw && !C_raw`; D owns the healthy case only when all three
corrective raw facts are false. The literal thresholds, statistics, exclusions, and D0/D1 cross-runtime
disposition are executable authority in `design/program/roadmap/active/PQ-042.md`; they may not be
invented or tuned after capture.

### PERF-08A — Pixel/overdraw correction

1. Capture opaque, transparent, lighting, bloom-input, and effect coverage separately.
2. Produce an overdraw/coverage heatmap without changing the shipping route.
3. identify the exact materials/effects with the highest covered pixels × shader cost.
4. Preserve authored appearance while reducing redundant layers, redundant depth work, or duplicate
   shading of fully occluded pixels.
5. Use tighter existing bounds, spatial clusters, depth prepass only for selected expensive opaque
   groups, and equivalent shader algebra/lookup reuse.
6. Do not lower resolution or effect quality to claim completion.

### PERF-08B — Material and ordering correction

1. Generate a report of material instances, normalized pipeline keys, shader program keys, and state
   changes.
2. Canonicalize materials that are semantically identical.
3. Move per-object values to existing instance attributes or `onBeforeRender` uniforms without
   cloning a material.
4. sort opaque packets pipeline-major while preserving required render/depth order.
5. Keep transparent packets in a separately correct ordering domain.
6. Recheck shader compilation, first-use stalls, draw calls, and GPU duration.

### PERF-08C — Post-pass correction

1. Measure the physical `bloomScene`, `bloomDownsample`, fused `bloomComposite`, and diagnostic `bloomBypassCopy` groups; do not invent separate upsample, grade, vignette, grain, or final-copy owners.
2. Fold compatible full-screen math into the existing final composite.
3. Reuse the existing bloom pyramid for effects needing the same resolutions.
4. Remove only provably redundant render-target transitions or passes.
5. Preserve output color space, exposure, bloom response, grade, grain, vignette, and accessibility.

### Completion proof

- the frozen graph-disabled selector reports all raw facts, applies the literal exclusions, and yields exactly one matching Browser/Electron final branch from consumed broker claims; a selected B metric and CPU/GPU aggregate domain also match across runtimes;
- the selected diagnosis reproduces across matched runs without post-capture exclusions, undefined qualitative rulings, or threshold changes;
- unchanged scene complexity or pixel coverage behaves according to the predicted scalar causal model;
- semantic and image/temporal equivalence pass at default scale, population, post, and quality;
- for A/B/C, the exact predeclared logical scope has complete non-overlapping pre/post owner-query lineage, its duration falls by at least 10% with six positive blocks and a paired lower bound above zero, and its selected aggregate domain improves by at least 1% under the same direction/confidence rules;
- every non-selected aggregate domain and unselected physical owner remains inside its frozen regression margin, so individually small regressions cannot sum to a whole-domain slowdown, and no unresolved dominant owner remains. The original pathology predicate may disappear after a successful correction and is rerun for reporting rather than required to stay true;
- for D0, GPU and callback timing remain healthy everywhere and no owner/follow-up is invented; for D1, GPU remains healthy, every late route/runtime's origin-linked non-GPU owner meets the frozen late-frame/excess equations and is routed, every non-late peer is recorded healthy, and neither subcase makes a branch-specific corrective renderer/post/material change beyond retaining or removing the frozen disabled diagnostic diff;
- no quality switch or diagnostic perturbation is used as the accepted route.

## 16. PERF-09 — Conditional simulation Worker

### Trigger

Implement only if post-PERF-08 evidence shows:

- the simulation by itself meets cadence;
- presentation or GPU submission blocks the main thread long enough to delay fixed ticks;
- the PERF-02 seam cannot prevent the missed cadence while both remain on one thread.

If simulation computation itself is the limiter, optimize the selected system/query instead. A Worker
does not make expensive simulation logic disappear.

### Architecture

- main thread: platform input capture, DOM/accessibility UI, Three.js renderer, audio, and shell;
- simulation Worker: `SimulationRunner`, authoritative `GameState`, system registry, deterministic
  RNG/time, and save snapshot creation at tick boundaries;
- command queue: tick-targeted input and shell commands with sequence numbers;
- presentation snapshots: versioned double/triple-buffered dense arrays from `PresentationWorld`;
- event queue: ordered audiovisual/UI events with tick and sequence;
- backpressure: renderer may skip obsolete presentation snapshots but never reorder simulation ticks;
- restart: Worker can rebuild from the latest authoritative save/checkpoint and command journal.

Use `SharedArrayBuffer` only when browser/Electron cross-origin isolation is proven on the shipping
route. Otherwise use transferable buffers with ownership handoff. Do not serialize the full object
graph every frame.

### Migration

1. Run `SimulationRunner` through an in-process port.
2. Run it in a Worker while retaining JSON messages for tiny control commands.
3. transfer dense presentation buffers.
4. move save snapshot construction to the Worker.
5. remove direct main-thread reads of authoritative mutable state.

### Completion proof

- tick-by-tick digest and ordered events match;
- input target-tick semantics are exact;
- save/load continuation and Worker restart match;
- renderer stalls no longer delay fixed-tick cadence;
- snapshot transfer does not replace main-thread stalls with allocation/GC stalls;
- reduced-motion/accessibility/UI event delivery remains correct.

## 17. PERF-10 — Conditional WebGPU/TSL vertical slice

### Purpose

Test the strongest realistic backend change without committing the entire game to an experimental
path. Three.js 0.184 includes `WebGPURenderer`, TSL, compute support, render bundles, automatic render
pass combination, and MRT facilities, but Three.js still describes the renderer as experimental.

### Slice

After PERF-03, PERF-04, and PERF-07:

1. render the standard flight/combat benchmark from the same `PresentationWorld`;
2. load the same render packages;
3. port custom materials and the bloom/composite path to TSL;
4. use WebGPU timestamps and pipeline-compilation telemetry;
5. retain WebGL2 as fallback;
6. compare output, first-use compilation, steady GPU time, CPU submission time, memory, context/device
   recovery, and packaged Electron behavior.

### Decision

- Continue migration only if the slice reaches semantic/image equivalence and provides a repeatable
  benefit on the actual limiting routes.
- Retain the slice as an experiment, not a hidden production fork, if it is neutral or worse.
- Consider GPU-driven visibility/indirect draw work only after the basic backend proves itself.

No PlayCanvas, Babylon, Godot, Bevy, or native renderer port should begin before this slice and the
core program establish what remains slow. The broad appendix retains those options if future evidence
justifies a recreation.

## 18. Parallelism and ownership

The work can be scheduled in disjoint lanes, but repository ownership and live leases control actual
start dates:

- PERF-01: existing protected lifecycle worktree; review/accept rather than duplicate;
- PERF-00 and PERF-02: core/scripts/tests;
- PERF-03: compiler scripts, contracts, loader, generated render-package outputs; source-asset
  generation waits for active Blender/asset locks to clear;
- PERF-04: renderer/presentation; coordinate with active render or VFX ownership;
- PERF-05: NPC-jobs/spatial-query owner;
- PERF-06: start with sprite/trail pools; wait before touching leased VFX paths;
- PERF-07: package/Electron/launcher owner;
- PERF-08 onward: begin after the earlier evidence and ownership gates.

The selected work is admitted as PQ-034 through PQ-044 in the live program queue. Each packet still
requires its own dependency, owner, lease, and evidence entry gates. This plan does not seize files
merely by naming them.

## 19. What should not be done first

- Do not replace Three.js because one contaminated trace showed high GPU time.
- Do not convert all gameplay state to a generic ECS.
- Do not replace Rapier without a physics-selected profile.
- Do not apply global heterogeneous `BatchedMesh` pooling; the prior measured experiment regressed and
  was correctly rejected.
- Do not add a high-frequency auto-tuner that continuously changes quality or reallocates resources.
- Do not use device-class guesses as the main control signal.
- Do not build an OffscreenCanvas render Worker before browser/Electron support, renderer ownership,
  and transfer costs are proved.
- Do not expand indexed geometry with `toNonIndexed()` in gameplay for convenience.
- Do not leave two render architectures indefinitely after acceptance.
- Do not use lower quality, fewer effects, fewer entities, or shorter distance as the comparison win.

## 20. Resource adaptation without thrashing

When adaptation is needed, use a slow, hysteretic state machine fed by existing telemetry:

- measure capabilities once at startup;
- cache renderer/driver/runtime identity and last-known stable state;
- observe only at coarse intervals or on explicit lifecycle/device events;
- enter a new state only after sustained evidence;
- use separate enter and exit conditions;
- impose a long residence time;
- allocate new resources before switching;
- retire old resources after GPU completion;
- change one dimension at a time;
- persist the stable result for that machine;
- expose every transition in telemetry.

This mechanism is for residency, pool growth, or a user-selected adaptive mode. It is not allowed to
silently degrade the default accepted graphics route.

## 21. Primary OSS and algorithm references

| Use | Existing/new project | Exact application |
|---|---|---|
| glTF processing | `donmccurdy/glTF-Transform` | deterministic offline transforms, validation, weld/reorder pipeline |
| mesh locality/compression | `zeux/meshoptimizer` | vertex-cache/fetch reorder and Meshopt-compressed package output |
| GPU attribute ranges | Three.js `BufferAttribute.addUpdateRange()` | sparse active-range uploads |
| WebGPU vertical | Three.js `WebGPURenderer` and TSL | alternate backend and post pipeline |
| render bundles | Three.js `BundleGroup` | later static draw-submission pilot only after WebGPU slice |
| spatial queries | current SpaceFace `SpatialHash`/batch query | replace repeated hostile scans; avoid a second world index |
| physics | current Rapier | keep unless measured physics evidence selects a narrow SIMD/memory pilot |

Primary references:

- <https://github.com/donmccurdy/glTF-Transform>
- <https://gltf-transform.dev/modules/functions/functions/reorder>
- <https://gltf-transform.dev/modules/functions/functions/weld>
- <https://github.com/zeux/meshoptimizer>
- <https://threejs.org/docs/pages/BufferAttribute.html>
- <https://threejs.org/manual/en/webgpurenderer>
- <https://threejs.org/docs/pages/BundleGroup.html>
- <https://releases.electronjs.org/release>
- <https://www.electronjs.org/docs/latest/tutorial/electron-timelines>
- <https://www.electronjs.org/docs/latest/api/power-monitor/>
- <https://www.electronjs.org/docs/latest/api/web-contents/>

## 22. Program routing and records

Live state is intentionally not copied into this stable plan. Read
[`program/roadmap/program-queue.json`](./program/roadmap/program-queue.json), exactly one selected file
under [`program/roadmap/active/`](./program/roadmap/active/README.md), the current lease board, and the
packet's exact-revision receipt. Only mark a packet complete when its completion proof is attached.

| Source packet | Queue identity | Required terminal record |
|---|---|---|
| PERF-00 | PQ-034 | baseline/candidate harness, validity and equivalence reports |
| PERF-01 | PQ-035 | lifecycle diff, focused checks, foreground parity, resume trace |
| PERF-02 | PQ-036 | runner/journal contracts, tick parity, causal callback trace |
| PERF-03 | PQ-037 | compiler reproducibility, asset parity matrix, cold/warm admission trace |
| PERF-04 | PQ-038 | shadow-parity report, scale curve, allocation/traversal trace |
| PERF-05 | PQ-039 | deterministic target parity, candidate-visit scale curve |
| PERF-06 | PQ-040 | dirty-range correctness, upload-byte and combat comparison |
| PERF-07 | PQ-041 | compatibility audit, packaged acceptance, runtime comparison |
| PERF-08 | PQ-042 | branch-selection trace, GPU pass/state comparison or no-change closure |
| PERF-09 | PQ-043 | causal trigger evidence, Worker receipt, or explicit not-needed closure |
| PERF-10 | PQ-044 | trigger evidence and WebGL2/WebGPU parity/performance comparison |

## 23. Definition of program success

The core program succeeds when:

- ordinary foreground play is behaviorally and visually unchanged;
- hidden/minimized/suspended execution is lifecycle-correct;
- authored runtime geometry compilation is absent from accepted gameplay;
- renderer work scales with changed/visible presentation data rather than every registered root;
- the proven NPC-jobs full scan is gone;
- dynamic pool uploads follow changed active ranges;
- the desktop runtime is on a supported Electron line;
- clean evidence identifies and corrects any remaining dominant GPU owner;
- the five-times-population route remains smooth relative to the old current-population route;
- admission and transition stalls formerly measured in seconds are removed;
- all claims are backed by matched, valid, machine-readable evidence.

At that point, SpaceFace will have the performance architecture expected of a modern game:
offline compilation, stable runtime packages, dense presentation data, incremental change
publication, indexed queries, bounded GPU updates, explicit lifecycle, current platform support, and
parallelism introduced only across a clean semantic boundary.
