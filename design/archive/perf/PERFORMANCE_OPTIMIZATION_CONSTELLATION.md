# SpaceFace performance optimization constellation

**Status:** research and decision support, not an activated implementation plan or program status.
The canonical program map and live queue remain authoritative. This document records the full
constellation of credible performance options, the evidence that would select among them, and the
rollback seams that keep the game playable after every slice.

**Research date:** 2026-07-25

**User direction carried through this document:** preserve or improve authored visual quality.
Do not win a timing comparison by removing content, reducing artistic ambition, weakening
accessibility, changing deterministic outcomes, or measuring a different game.

## Executive decision

SpaceFace does not currently have evidence for a generic ECS rewrite, a whole-simulation Worker, a
physics-engine replacement, or a full engine port. It does have credible paths to:

1. remove background and lifecycle waste immediately;
2. remove repeated object traversal, cross-domain scans, and allocation churn as scale grows;
3. compile authored assets into a runtime representation that is simultaneously richer and cheaper;
4. introduce a dense `RenderWorld` beside the existing authoritative `GameState`;
5. move rendering to a staged WebGPU/TSL backend and eventually GPU-driven visibility;
6. move a coherent simulation island to Rust/WASM if measured CPU scale eventually requires it; and
7. exceed 5x in supported entity, scene, particle, source-pixel, save-path, or numeric-kernel
   throughput under explicit conditions.

The best default path is evolutionary:

> clean evidence -> lifecycle and narrow hot-path repairs -> offline semantic render compiler ->
> dense RenderWorld -> staged WebGPU/TSL pilot -> only then choose Worker, Rust/WASM, renderer port,
> or native recreation from a proven product requirement.

This ordering preserves the large existing investment in gameplay, deterministic behavior, saves,
accessibility, authored assets, and browser/Electron parity.

## What the live evidence actually says

### The July 25 capture is a contention trace, not an acceptance baseline

The current
[`performance-profile.json`](../.devshots/perf/performance-profile.json)
was generated while the tree had 295 changed files and an active Blender asset pipeline. Process
diagnostics recorded one Blender process near 1.9 GB plus three Blender integration processes.

Key values:

| Signal | July 25 trace | Interpretation |
|---|---:|---|
| rAF p95 | 183.2 ms | catastrophic cadence, but not attributable to one game subsystem |
| WebGL-submit no-op p95 | 84.2 ms | a large floor remains after game GPU submission is removed |
| callback CPU p95 | 23.2 ms | elevated under contention |
| simulation-frame p95 | 13.4 ms | catch-up work caused by missed presentation frames |
| simulation paused | rAF unchanged | simulation is not the causal foreground limiter in this trace |
| shed frames / ticks | 42 / 186 | the fixed-step loop is protecting the process from a spiral |
| draw calls | 69 | already far below older crowded captures |
| triangles | 74,561 | not remotely consistent with “too much geometry” as the primary diagnosis |
| visible meshes / objects | 205 / 760 | object traversal and state synchronization remain scale concerns |
| transparent meshes | 65 | fill and ordering remain plausible dense-combat concerns |
| GPU timer total average | 25.6 ms | useful clue, but timing is contaminated by system contention |

The correct response is not to optimize until that 183.2 ms number turns green. It is to invalidate
the run as primary evidence, retain it as a contention/resilience case, and collect matched clean
profiles after the active asset workload is idle.

### A comparable July 16 capture already reached the display floor

The comparable
[`performance-profile-compact-economy.json`](../.devshots/perf/performance-profile-compact-economy.json)
recorded:

| Signal | July 16 |
|---|---:|
| rAF p95 | 16.8 ms |
| callback CPU p95 | 7.1 ms |
| simulation-frame p95 | 3.6 ms |
| GPU timer average | 5.17 ms |
| draw calls | 61 |
| triangles | 72,341 |
| visible meshes | 219 |
| visible material keys | 48 |

That is decisive context: the current-sized scene can run at the monitor cadence on this machine.
The program-level open item is a clean three-run ruling, not proof that the entire engine is slow.
The literal 16.7 ms assertion is also below the measured 16.8 ms no-op/vsync floor on this display;
acceptance should derive the presentation interval from the measured display cadence and then judge
p95, p99, long frames, and subsystem work without changing visual quality. See
[`02_REMAINING_WORK.md`](program/02_REMAINING_WORK.md) and
[`03_LIVE_ACCEPTANCE_MATRIX.md`](program/03_LIVE_ACCEPTANCE_MATRIX.md).

### The current architecture is more mature than a generic rewrite pitch assumes

Already present and worth preserving:

- deterministic 60 Hz fixed timestep, interpolation, bounded catch-up, and explicit debt shedding;
- specialized entity indexes and an incremental static/dynamic spatial hash;
- Rapier WASM physics behind a swap-ready authority membrane;
- 30 Hz tactical decisions, staggered perception, and 60 Hz action reauthorization;
- deterministic aggregate offscreen sector/economy simulation;
- bounded save capture with Worker encoding/checksumming;
- KTX2, Draco, and Meshopt support;
- authored LOD/HLOD hooks, asset residency ownership, and zero-reference disposal;
- ship-local immutable mesh merging and homogeneous instancing;
- bounded HUD, radar, roster, and other UI cadence;
- active-list/swap-remove VFX ownership;
- a lean bloom path with scene, downsample, and composite passes;
- environment-alpha canopies instead of physical transmission;
- single-pass eligible double-sided transparency;
- shader readiness, admission telemetry, and context-loss recovery.

The integrated performance work and rejected experiments are recorded in
[`01_VERIFIED_DONE.md`](program/01_VERIFIED_DONE.md). In particular, four heterogeneous
pool/`BatchedMesh` variants were slower and semantically defective. The final measured candidate
reached 250.1/616.8/433.3 ms p95 for 10/25/50 ships. Do not replay that range.

## Options by the kind of scale the game wants

| Desired result | Best architecture path |
|---|---|
| Make the current game consistently smooth | clean evidence, lifecycle suspension, frame-linked attribution, allocation and upload repair |
| Put 5x more active entities in local space | spatial/query repair, dirty journals, dense RenderWorld, typed hot-domain sidecars |
| Draw 5x more authored world detail | offline semantic compiler, cluster LOD/HLOD, static bundles, GPU visibility |
| Preserve output quality while shading far fewer source pixels | temporal/spatial upscaling integrated with the renderer |
| Run 5x more particles and combat VFX | GPU compute simulation, compaction, indirect draw, and purpose-scoped transparency |
| Simulate a much larger universe | retain aggregate offscreen simulation; move only hot local kernels or a coherent sim island |
| Raise the long-term desktop ceiling | staged Rust/WASM simulation, then optionally Rust/wgpu or Bevy |

These are not all additive. A renderer replacement, a native recreation, and a Three.js WebGPU
migration are mutually exclusive presentation futures after the evaluation phase.

## Quick wins: days, narrow seams, immediate rollback

### Q0. Clean, frame-linked attribution

**Mechanism**

- Run three matched profiles from one exact clean revision after Blender and unrelated GPU-heavy
  processes are idle.
- Record the measured display interval rather than treating 16.7 ms as a universal physical fact.
- Attribute entity synchronization, background/camera work, opaque and transparent submission,
  bloom subpasses, VFX buffer uploads, shader compilation, asset decode, blueprint construction,
  save capture, and storage commit separately.
- Record p50/p95/p99, long-frame count, GPU timestamp confidence, WebGL no-op floor, allocation
  rate, GC pauses, and process-contamination flags.

**Why**

The current severe trace has an 84.2 ms no-op floor. No algorithm inside SpaceFace can remove an
external compositor/driver/process floor that remains when submission is disabled.

**Keep only if**

Profiling overhead remains negligible when disabled and under 1% when enabled. Do not leave
per-system clocks or object-heavy diagnostics running by default.

### Q1. Explicit hidden, minimized, suspend, and resume lifecycle

[`electron/main.cjs`](../electron/main.cjs) sets `backgroundThrottling: false`, while
[`src/core/loop.js`](../src/core/loop.js) has no explicit visibility/minimize suspension contract.
Electron documents that disabling background throttling can continue drawing and swapping in the
background.

**Implementation slice**

1. Electron sends explicit minimize, hide, restore, OS suspend, and resume events.
2. Browser visibility is handled through the same runtime lifecycle port.
3. Stop scene submission, VFX stepping, and UI reconciliation when invisible.
4. Make the authoritative-simulation choice explicit: pause immediately or after a short
   autosave-safe grace period. Do not silently continue at full rate.
5. Clear or resample held input, reset wall-clock delta/accumulator, and restore audio deliberately.
6. Never catch up minutes of hidden time on resume.

**Expected result**

Near-total removal of hidden-window CPU/GPU work. This is a resource, heat, battery, and contention
win; it does not claim foreground FPS.

**Rollback**

One lifecycle feature flag restores current behavior.

### Q2. Remove actual allocation hot spots, not every object

Candidates visible in code:

- [`physicsAuthority.js`](../src/core/physicsAuthority.js) creates control objects, vectors, and
  impulse records through a per-tick command membrane;
- [`aiPorts.js`](../src/systems/aiPorts.js) materializes Maps, request objects, and contact results;
- [`renderer.js`](../src/render/renderer.js) replaces `state.render.entityViewSync` every frame;
- save capture can still clone changed state on the main thread even though encoding is workerized.

Use allocation sampling to choose one owner. Replace it with a tick-stamped reusable slab,
double-buffered record set, or typed sidecar. Poison-reset records in debug builds and assert that
no view escapes its tick.

**Promote only when**

The named owner shows meaningful allocation/GC cost and the change reduces either visible tail
latency or owner time. A prettier allocation profile with no player-visible or scale benefit is not
a win.

### Q3. Fuse repeated render traversal and reuse diagnostics

[`renderer.syncEntityViews()`](../src/render/renderer.js) walks every registered mesh, fetches the
entity, calculates culling after transform preparation, resolves LOD, and runs optional closures.
Ship pitch is also prepared by a separate entity traversal.

The narrow version:

- index the ship subset once;
- fold pitch preparation into the entity render frame;
- reuse the diagnostics object;
- skip immutable-static transform writes;
- retain exact interpolation, floating-origin projection, stateful material closures, and stable
  authored roots.

This is a precursor to RenderWorld, not a premature rewrite.

### Q4. Measure and trim GPU buffer uploads

Instrument bytes uploaded per frame for trails, beams, particles, instance matrices, and dynamic
attributes. Where buffers have sparse live prefixes, use active ranges, update ranges, or ring
segments so the driver does not receive unchanged capacity.

**Falsifier**

If upload bytes and driver time do not correlate with hitches in the dense combat case, stop.

### Q5. Index the concrete NPC-job hostile scan

[`npcJobsRuntime._nearestHostile()`](../src/systems/npcJobsRuntime.js) scans the entire entity list for
every materialized job, every tick. At current counts this may be cheap. At large traffic counts it
is O(jobs × entities).

Query the existing spatial index or maintain a hostile-ship bucket, preserve deterministic
distance/ID tie order, and compare results against the full scan in shadow mode. Indexing precedes
threading.

### Q6. Rapier SIMD and one-time memory reservation pilot

The current Rapier 0.19 line exposes a SIMD-compatible package and `reserveMemory()`. Pilot:

- regular build versus SIMD-compatible build on physics-heavy deterministic scenarios;
- a measured one-time reservation after physics initialization, based on representative peak plus
  modest headroom;
- no runtime growth polling or repeated resizing.

Run the complete flight, combat, tether, CCD, save/load, and deterministic evidence matrix. Retain
the current build if output or stability diverges without a meaningful win.

### Q7. Static material/program canonicalization report

The current scene reports about 49 visible material keys and 70 programs. Build a read-only report
that explains why each distinct pipeline exists, then canonicalize semantically equivalent
materials at build time. Do not merge glass, emissive, damage, faction, accessibility, or authored
surface roles merely because their current numbers look similar.

### Q8. Cooperative background-work admission

Save encoding, KTX2/Draco decode, shader precompile, metadata compilation, and future path jobs
should share a small persistent admission controller rather than independently saturating every
logical core.

- select one or two persistent Workers from a bounded startup calibration;
- schedule coarse jobs, never per-entity RPC;
- yield/cancel non-authoritative work on input or foreground contention;
- preserve deterministic synchronous fallback;
- prefer lower latency to maximum decoder throughput during active play.

## Medium refactors: self-contained systems, each leaving the game playable

### M1. Offline semantic render compiler

This is the highest-confidence structural graphics investment because it improves runtime work
without asking artists to author less.

**Input**

The exact accepted GLB, semantic material roles, sockets/hooks, collision proxies, authored LODs,
stable root identity, provenance, and release metadata.

**Compiler pipeline**

1. Verify the source hash and semantic contract.
2. Deduplicate accessors and immutable resources.
3. Weld only where normals, UVs, material boundaries, deformation, and authored seams permit.
4. Apply meshoptimizer vertex-cache, overdraw, and vertex-fetch ordering.
5. Generate shadow-only index/vertex streams where the full surface attributes are unnecessary.
6. Generate screen-error LODs with attribute- and silhouette-aware simplification.
7. Generate cluster/meshlet metadata and cluster hierarchy for future GPU-driven visibility.
8. Group immutable geometry by real pipeline key and spatial locality.
9. Canonicalize equivalent materials and create atlases or texture arrays only where semantic roles,
   filtering, color space, mip behavior, and update cadence remain compatible.
10. Generate static hierarchy nodes, far impostors where they preserve identity, and a manifest that
    binds every derived artifact to the exact source hash.
11. Emit a deterministic, versioned runtime package plus a fallback to the accepted source.

**Important SpaceFace constraint**

Stations and places currently rely on stable authored root identity. Generic proxy replacement is
disabled for good reason. An HLOD compiler must swap detail *inside the same stable root*, retaining
sockets, interactions, collision truth, map/place identity, save continuity, and visible state.

**Pilot**

- one dense ship family;
- one wreck/debris field;
- one hero place with stable-root internal LOD;
- near/mid/far matched captures and adversarial motion;
- exact source versus compiled package measurements.

**Acceptance**

- near-view output retains the accepted silhouette and material response;
- no socket, collision, scale, animation, interaction, or save change;
- stable LOD transitions in motion;
- meaningful reduction in submission, traversal, upload, residency, or GPU time in the selected
  dense scenario;
- derived artifacts remain reproducible and disposable.

**Why this can exceed 5x**

At large distance, HLOD changes work from “all original objects and materials” to “one spatially
coherent representation.” Published HLOD work has reported orders-of-magnitude gains in massive CAD
workloads. That is not a SpaceFace benchmark, but it establishes the algorithmic ceiling. The pilot
must prove the actual game crossover.

### M2. Dense RenderWorld beside authoritative GameState

Do not convert all gameplay to an ECS. Add a presentation-optimized sidecar whose only authority is
render representation.

**Record layout**

- stable entity handle and generation;
- source entity revision;
- render family/pipeline key;
- previous/current position, rotation, bank, pitch, and bounds in typed arrays;
- stable authored root reference;
- static/moving/dirty/visible flags;
- LOD/HLOD state and hysteresis;
- visibility cell and last-seen frame;
- instance/pool slot and active upload range.

**Frame flow**

1. Gameplay publishes spawn, removal, and revision journals.
2. RenderWorld updates only changed records.
3. Camera queries the existing spatial structure for candidate handles.
4. Static records retain frozen matrices; moving records interpolate from previous/current state.
5. Culling and LOD happen on the dense candidate set.
6. Visible records are grouped by true pipeline key.
7. Only changed active ranges are uploaded.
8. Existing Three.js objects remain the backend during the first phase.

**Rollback**

The current mesh map and `syncEntityViews()` remain a feature-flagged reference path until long
shadow comparisons pass.

**Scale acceptance**

Run deterministic 1,000/5,000 visible, moving, far-culled, churn, and floating-origin scenarios.
Compare:

- exact interpolated poses;
- visible handle set and stable tie behavior;
- LOD decisions;
- entity creation/removal/reuse;
- player, damage, shield, drive, world-site, and authored closure behavior;
- CPU time, upload bytes, heap/GC, and frame pacing.

The target is not “fewer objects” in the abstract. It is five times the supported render population
at equal or lower entity-sync cost, with identical visible behavior.

### M3. Anti-thrashing resource governor

The current adaptive-resolution controller already uses an EMA, sustained-pressure hold, cooldown,
and slow recovery. Its weakness is that render-target resizing itself can stall some drivers, and
browser-exposed hardware values do not describe real speed.

**Startup discovery**

Record once:

- WebGL/WebGPU capabilities and limits;
- coarse renderer class;
- coarse logical-core and memory hints;
- cross-origin isolation and WASM SIMD/thread availability;
- passive display-interval estimate;
- current Electron AC/battery/thermal signals where available;
- storage usage/quota;
- runtime and policy version.

`deviceMemory`, `hardwareConcurrency`, and WebGPU adapter information are hints, not performance
scores. Browsers clamp, reduce, or redact them.

**Bounded calibration**

- one representative GPU workload;
- one small numeric/typed-array workload;
- one Worker transfer round trip;
- total work divided into short slices;
- abort on input, hidden state, loading contention, or a long frame;
- cache only a coarse result per runtime policy version.

Never spawn a synthetic fleet at startup or repeatedly saturate the machine to rediscover its speed.

**Runtime state machine**

```text
BOOT -> DISCOVER -> CALIBRATE_ONCE -> NORMAL

NORMAL
  sustained classified pressure -> STEP_DOWN_ONE_POLICY

STEP_DOWN_ONE_POLICY
  remain for a long dwell interval
  -> stable headroom -> SAFE_POINT_RECOVERY_PROBE
  -> pressure returns -> previous stable level

ANY_FOREGROUND_STATE
  hidden/minimized/OS suspend -> SUSPENDED

SUSPENDED
  visible/resume -> RESET_WALL_DELTA -> previous stable level
```

**Rules**

- smooth CPU and GPU evidence separately;
- require repeated windows, not one hitch;
- change one discrete lever at a time;
- perform allocation-changing recovery only at dock, pause, loading, or another safe point;
- preallocate two or three render-target configurations, or render to a max-sized allocation using
  active subrects, so ordinary adaptation does not reallocate;
- never change deterministic outcomes, difficulty, accessibility, near-combat action cadence, or
  authored semantic content;
- never continuously poll process lists or memory;
- use event-driven minimize, suspend, AC/battery, and thermal signals;
- use one or two persistent Workers, not a continuously resized pool.

**Quality-preserving levers**

- internal source resolution plus high-quality reconstruction;
- screen-error LOD/HLOD selection;
- distant shader LOD;
- shadow refresh cadence on the optional shadow-enabled tier;
- particle simulation grid/cadence while preserving visible density and response;
- non-authoritative prefetch and background job admission.

### M4. Packed physics and AI membranes

If allocation and owner timing select these paths:

**Physics**

- fixed-capacity tick command slabs with stable entity handles;
- inline force/torque/impulse scalars;
- double-buffered post-solve telemetry;
- generation and tick stamps;
- bounded overflow path with diagnostics;
- one-time Rapier memory reservation.

**AI**

- persistent sensor request and result frames;
- typed IDs, positions, radii, filters, and scores;
- bounded top-K selection without sorting/materializing every candidate;
- shared immutable query results where origins/radii/filters are truly equivalent;
- revision-indexed attachment and recent-event lookups;
- distance/activity cadence tiers with stable hash staggering;
- 60 Hz safety authorization retained.

Every optimized owner runs in shadow against the current implementation until canonical results
match.

### M5. Change journals and activity scheduling

The production manifest invokes roughly 96 ordered update slots every simulation tick. Invocation
itself is probably small; repeated membership rebuilds and broad scans are more interesting.

Add:

- spawn/death/team/equipment/sector change journals;
- dirty membership updates for volatile indexes;
- stable sparse removal handles;
- event-driven invalidation for unchanged AI plans;
- hierarchical timing wheels for very large delayed-action populations;
- explicit always/active/event/low-cadence lanes while retaining exact relative order.

**Promotion condition**

Only when sampled registry/index/scan evidence identifies material work at the intended scale. A
0.08 ms owner should not become an architecture project.

### M6. Spatial/temporal reconstruction

#### First pilot: FSR1-class spatial reconstruction

This is feasible on the existing WebGL/TSL path:

- render an internal image at a lower source resolution;
- apply high-quality edge-adaptive spatial reconstruction and sharpening;
- compare motion, text/HUD separation, stars, thin structures, particles, canopies, docking geometry,
  and bright bloom edges;
- keep HUD/UI at native resolution.

It can reduce fragment work by 2.25x at 1.5x linear scaling or 4x at 2x linear scaling. It does not
reduce simulation, traversal, or submission work.

#### Later pilot: FSR2/TAAU-class temporal reconstruction

Requires:

- reliable motion vectors for ships, particles, camera, and floating origin;
- depth;
- jitter;
- reactive/transparency masks;
- history invalidation on cuts, teleports, rebase, resize, and context recovery;
- post-processing placement and exposure discipline.

At 2.25x linear scaling the source image contains about 5.06x fewer pixels; at 3x it contains 9x
fewer pixels. Those are source-pixel ratios, not promises of 5x whole-game FPS. The renderer work is
substantial, but this is one of the few honest ways to preserve rich output while multiplying the
available shading work.

### M7. Transparency and VFX architecture

The current canopies already avoid physical transmission, and eligible double-sided transparent
materials already render in one pass. Do not “discover” those again.

For dense plumes, dust, sparks, projectiles, and combat fields:

- GPU-simulated spawn/update/compaction;
- active prefix or freelist with indirect instance count;
- weighted blended order-independent transparency for particle/plume classes only;
- separate refractive/hero glass path;
- soft-particle depth handling;
- fixed deterministic spawn receipts, with presentation simulation remaining cosmetic;
- native-resolution reactive masks if temporal reconstruction is enabled.

Weighted blended transparency removes global per-particle depth sorting but is approximate. It must
be restricted to materials whose appearance survives that approximation.

### M8. Optional shadow-tier temporal cache

Default shadows are already off, so this is not a current quick win. If the authored high-quality
shadow tier becomes important:

- separate static and dynamic casters;
- freeze static maps;
- update dynamic cascades/faces only on light/camera/caster invalidation;
- stagger distant faces;
- use conservative invalidation and visible debug receipts.

This improves the optional tier without reducing authored geometry.

### M9. Coarse read-only Worker

Move a task only when it is:

- pure or read-only;
- coarse enough to amortize messaging;
- normally several milliseconds at the intended scale;
- able to return at a fixed tick/revision boundary;
- safe to reject when stale;
- equipped with a synchronous deterministic fallback.

Good candidates: AI scoring batches, a future path query, large economic projections, build-time
metadata work, or diagnostics. Poor candidates: hundreds of entity RPC calls, current-tick DOM/input,
Three.js objects, audio graph state, or a sub-millisecond system.

Use transferable typed snapshots. SharedArrayBuffer is a later choice because the current server does
not emit the required cross-origin-isolation headers.

### M10. Electron and runtime-platform upgrade

The current Electron 31 line uses an older Chromium generation. A supported-current upgrade is
required before treating WebGPU behavior as a production foundation.

Upgrade in bounded steps:

1. route, input, save, resize, alt-tab, context-loss, and accessibility parity;
2. ANGLE/WebGL2 matched performance;
3. shader/precompile behavior;
4. optional WebGPU capability and representative-scene pilot;
5. packaged-build soak and rollback.

An Electron upgrade is not itself a performance optimization. It removes platform risk and enables
new backend experiments.

### M11. Three.js WebGPU/TSL dual-backend pilot

Three's `WebGPURenderer` can target WebGPU with a WebGL2 fallback, but it is still experimental and
does not guarantee that WebGPU is faster for a given scene.

Port one representative vertical slice:

- one authored ship family;
- canopies and transparency;
- selective bloom and current post;
- particles/trails;
- instancing/static groups;
- context recovery;
- GPU timestamps;
- matched browser/Electron output.

Custom `ShaderMaterial`, `onBeforeCompile`, and EffectComposer-era assumptions need explicit TSL/node
material equivalents. Keep WebGL2 as the production rollback until parity and representative
performance are proven.

### M12. OffscreenCanvas render Worker

Moving Three rendering to an `OffscreenCanvas` Worker can isolate the DOM/input thread from render
traversal, asset parsing, and submission overhead.

It does **not** make the GPU faster. It also introduces:

- proxied input and resize;
- no DOM access in the render Worker;
- typed render snapshots;
- Worker context-loss/restart handling;
- devtools and capture complexity;
- potential contention with a future simulation Worker.

This is a smoothness-isolation option after RenderWorld and platform upgrade, not an immediate
foreground-GPU repair.

### M13. Pipeline-major opaque ordering and compact render packets

Keep Three's transparent ordering, but test an opaque comparator based on:

```text
pass -> program/material role -> geometry/VAO -> front-to-back depth tie
```

The intent is fewer program, texture, VAO, and uniform transitions—not fewer authored surfaces.
Sorting has CPU cost and may weaken front-to-back rejection on some GPUs, so record actual state
switches and GPU time.

In parallel, extract backend-neutral immutable render packets:

- resource and material-role IDs;
- pass;
- bounds;
- transform-table index;
- draw range;
- owner generation;
- static/dynamic revision.

These packets are useful under current WebGL, become the stable input to RenderWorld, and form the
rollback seam for a WebGPU backend. They must be compact data, not a second mutable scene graph.

### M14. Lifecycle-safe homogeneous pool v2

The rejected global heterogeneous pool should remain rejected. A narrower successor is still
credible for genuinely repeated roles:

- exact immutable geometry/material/pipeline identity;
- manifest-informed chunk sizes rather than one fixed capacity;
- occupancy diagnostics;
- free lists and owner-to-slot generation handles;
- empty-chunk release;
- optional safe-point compaction;
- destruction, sector transition, release, and context-loss tests.

If occupancy is poor or draw count does not collapse in the representative cohort, keep ship-local
batching and stop.

### M15. Narrow WebGL multi-draw experiment

`WEBGL_multi_draw` can turn many compatible ranges into one API invocation, but it is optional and
Three does not expose it as a general object-renderer path.

Build one raw-GL adapter for one homogeneous opaque family:

- compact typed draw arrays;
- `gl_DrawID`-driven object/material lookup;
- explicit Three state invalidation before and after;
- ordinary-draw fallback;
- complete lifecycle and context recovery.

Do not apply it to heterogeneous materials or ordered transparency. This is worth retaining as a
WebGL ceiling experiment only after offline material/pipeline consolidation creates a large eligible
cohort.

### M16. Post-pass fusion and pyramid reuse

Measure fullscreen bandwidth and attachment resolves. Where formats and sampling semantics agree:

- combine bloom add, tone mapping, final grading, vignette, and transfer into fewer passes;
- reuse compatible downsample/luminance products;
- audit redundant MSAA resolves;
- keep the ordinary lean bloom path separate from the heavier diagnostic graph.

Do not create one giant permutation-heavy shader. Use a small pass algebra and preserve identical
HDR, edge, accessibility, and context-recovery behavior.

## Large refactors and recreations

### L1. Full Three.js WebGPU/TSL presentation migration

**Retained systems**

Authoritative JS simulation, saves, event ordering, UI/DOM accessibility, authored asset semantics,
input, audio, and one browser/Electron route.

**Rebuilt systems**

Materials/shaders, post-processing, GPU timing, static bundle ownership, render diagnostics,
context/device recovery, and selected buffer/upload paths.

**New capabilities**

- render bundles for stable static groups;
- storage buffers and compute work;
- indirect draws generated from GPU-visible counts;
- better explicit resource lifetime;
- future temporal reconstruction and GPU particles;
- one modern shader language through TSL.

**Risk**

High visual parity work; experimental backend churn; WebGL can still win on some devices. Maintain a
WebGL2 rollback throughout migration.

### L2. Custom GPU-driven WebGPU backend

This is the highest-ceiling browser-rendering architecture.

**Offline data**

- meshoptimizer cluster/meshlet partitions;
- cluster bounds and cone data;
- cluster hierarchy/LOD;
- per-pipeline draw metadata;
- compressed vertex streams;
- stable semantic material IDs;
- shadow-only streams.

**Per frame**

1. Publish dense RenderWorld data to storage buffers.
2. Compute frustum and projected-error visibility.
3. Optionally use a previous-frame depth pyramid for conservative occlusion.
4. Compact visible cluster/instance IDs.
5. Generate indirect indexed-draw arguments by pipeline.
6. Execute a small number of pipelines/bundles.
7. Retain temporal visibility for hysteresis and to avoid query/readback stalls.

WebGPU does not expose a standard mesh-shader stage. Meshlet ideas therefore map to
compute-generated visibility plus indirect indexed drawing or vertex pulling, not to native mesh
shaders in the browser.

**Where 5x is credible**

Dense asteroid, debris, fleet, and station scenes where CPU traversal/submission and invisible
geometry scale with authored complexity. It is not justified by the current 61–69 draw-call route
alone.

**Rollback**

The offline cluster data is additive. Keep the Three WebGPU/WebGL backend until a representative
GPU-driven scene proves parity and scale.

### L3. GPU particle and combat-field backend

**Architecture**

- fixed persistent particle storage;
- compute spawn from compact event receipts;
- compute integrate/lifetime/compact;
- optional tiled collision/depth interaction;
- indirect instance count;
- weighted blended particle transparency;
- temporal-reconstruction reactive output;
- no CPU readback in the frame loop.

**5x claim class**

Active particle/VFX throughput, not whole-game FPS. Large CPU-authored particle populations commonly
pay per-particle JS, upload, sort, and draw costs that this architecture removes or amortizes.

**Determinism**

Gameplay effects remain authoritative in simulation. GPU particles are cosmetic consequences of
deterministic receipts and may use a separate cosmetic random stream.

### L4. Three-thread browser architecture

```text
Main thread
  raw input + DOM/HUD/a11y + lifecycle + audio
        |
        | timestamped intents
        v
Simulation Worker
  fixed 60 Hz authority + events + save capture
        |
        | previous/current typed snapshot, triple buffered
        v
Render Worker
  OffscreenCanvas + RenderWorld + Three/WebGPU
```

Use fixed roles, not a dynamically expanding pool. Every packet carries build, schema, world
revision, tick, generation, and stable handle identity. Worker count must never change gameplay
results.

This architecture isolates input/UI from simulation and rendering stalls, but it is a major rewrite
of lifecycle, snapshots, debugging, crash recovery, save ownership, context recovery, and capture
tooling. It improves smoothness and concurrency; it does not guarantee lower GPU time.

### L5. Rust/WASM hot kernel

Port one pure numeric owner only after a typed-JS version is measured:

- contact scoring;
- trajectory/intercept projection;
- broadphase candidate filtering;
- dense physics-control preparation;
- aggregate economy;
- cluster visibility preparation.

Keep data resident in WASM memory, batch calls, and avoid per-entity FFI. Shadow against JS and retain
the JS fallback. SIMD can produce a conditional 2–8x kernel improvement; the whole game receives
only the fraction allowed by Amdahl's law.

### L6. Authoritative Rust/WASM simulation Worker

This is the strongest long-term CPU-scale option that preserves the authored browser renderer and
DOM accessibility.

**Strangler sequence**

1. Freeze stable handles, generations, tick/input/event schemas, canonical digests, and save fixtures.
2. Publish typed previous/current snapshots from the current JS simulation.
3. Port one pure kernel with JS authority retained.
4. Port one coherent subsystem island.
5. Run long shadow simulations and compare canonical outputs.
6. Transfer one authority behind a feature flag.
7. Add old-save round-trip adapters.
8. Expand only while each island produces a material scale result.
9. Retire the JS owner after rollback rehearsal, not when the Rust code first compiles.

**Threaded WASM**

Only after the single-thread island is still materially limiting. It requires SharedArrayBuffer,
cross-origin isolation, deterministic fixed partitions/reduction, and a browser/Electron deployment
decision. Do not maintain transferable and shared-memory implementations indefinitely without a
real platform need.

### L7. PlayCanvas renderer port

PlayCanvas is the most plausible full browser-renderer comparator:

- MIT;
- browser-first WebGL2/WebGPU;
- glTF pipeline and streaming;
- clustered lighting;
- active engine development.

Retain the JS simulation and rebuild the asset/material/entity-view/camera/post/VFX/diagnostic
boundary. It may improve tooling or renderer architecture, but no automatic performance multiplier
exists. The migration is justified only by a vertical slice that beats the evolved Three path while
matching visuals and lifecycle.

### L8. Babylon.js renderer port

Babylon is an active Apache-2.0 browser engine with WebGL/WebGPU, materials, particles, and extensive
tooling. It is a credible comparator with similar migration hazards:

- authored material and hook semantics;
- selective bloom and custom post;
- particles/trails;
- stable place roots and HLOD;
- asset admission/residency;
- collision/debug overlays;
- normal-route visual evidence.

Choose Babylon or PlayCanvas for a port study, not both as permanent runtimes.

### L9. Rust/wgpu or Bevy recreation

**Custom Rust/wgpu**

Highest controllable native ceiling and maximum engine ownership. Also requires SpaceFace to build
and maintain its renderer, shader system, asset compiler, GPU visibility, post, UI bridge,
accessibility, input, debugging, packaging, device recovery, and web path.

**Bevy**

Provides ECS, scheduling, renderer, assets, and a Rust ecosystem, but introduces engine churn and
still requires recreation of SpaceFace-specific presentation, save, browser, input, and
accessibility semantics.

Start either only from a product requirement the evolutionary path cannot satisfy. Build one
representative sector and one complete save/input/accessibility vertical slice. Kill the recreation
if it cannot establish a clearly superior ceiling before the current game loses feature momentum.

### L10. Godot recreation

Godot is a credible native/editor comparator, but it is a poor current fit for SpaceFace's one-route
browser/Electron contract:

- current web export uses WebGL2 rather than a production WebGPU renderer;
- the ordinary web export is single-threaded unless cross-origin isolation is accepted;
- DOM accessibility and Electron parity would be recreated rather than retained;
- physics, shaders, saves, input, and authored asset behavior all need requalification.

Retain it as a product/platform comparator, not the preferred performance port.

## Honest conditional 5x pathways

### 1. Source-pixel pathway: 5.06x fewer source pixels

Temporal reconstruction at 2.25x linear scaling renders:

```text
1 / (2.25 * 2.25) = 0.1975
```

of native source pixels, or about **5.06x fewer source pixels**. At 3x linear scaling the ratio is
9x. Whole-frame speedup depends on the share of time attributable to resolution-sensitive GPU work,
the reconstruction pass, bandwidth, submission, and CPU work. This is an output-preserving shading
path, not permission to lower authored quality.

### 2. Entity-scale pathway: 5x population at lower hot-region cost

Suppose a future target-scale simulation hot region is:

- 45% perception/contact acquisition;
- 25% physics/query work;
- 15% pose/index synchronization;
- 15% population-independent work.

If measured pilots produce:

- 12x perception via spatial batching, shared query results, and bounded top-K selection;
- 5x physics/query via filtering, sleeping/islands, and cadence;
- 5x synchronization via dirty journals and typed sidecars;

then at five times the population:

```text
T(5N) = 0.15 + 5 * (0.45/12 + 0.25/5 + 0.15/5)
       = 0.7375
```

Five times the population would consume about 73.75% of the old hot-region time under those
assumptions. The same-cost mathematical ceiling is about 7.2x population.

The assumptions must be independently measured. Dense candidate count can grow superlinearly, and
rendering may become the next limiter.

### 3. Scene-capacity pathway: compiler + HLOD + GPU visibility

This combines:

- offline spatial/pipeline grouping;
- cluster LOD/HLOD;
- stable-root internal swaps;
- compute visibility and compaction;
- indirect submission/static bundles;
- reduced CPU object traversal.

Five times the authored scene complexity at equal frame work is credible in a purpose-built dense
asteroid/debris/fleet benchmark. It is not a claim about today's 69-draw scene.

### 4. Particle-capacity pathway

Moving spawn/update/compact/sort-like work and draw-count generation to the GPU can remove:

- per-particle JS iteration;
- per-particle object allocation;
- large CPU-to-GPU upload streams;
- global CPU depth sorting;
- many small draws.

A fivefold active-particle result is credible when those are the limiting costs. Measure visible
density, response, overdraw, GPU time, and output continuity; do not claim a multiplier from particle
count alone.

### 5. Physics-command membrane: 5.66x local, about 1.26x simulation

If one measured membrane is:

- 60% command allocation/copy;
- 25% telemetry construction;
- 15% unavoidable lookup/control;

and packed storage improves those parts by 10x, 6x, and 2x:

```text
S = 1 / (0.60/10 + 0.25/6 + 0.15/2) = 5.66x
```

If that membrane is only 25% of total simulation time:

```text
S_sim = 1 / (0.75 + 0.25/5.66) = 1.26x
```

This is why a real 5.66x local result must not be reported as 5.66x game performance.

### 6. Save-hitch pathway: 5.71x transaction tail

If a large transaction is 70% capture, 20% encode/checksum, and 10% commit, and change journals
improve capture by 20x while Worker processing improves encode by 5x:

```text
S = 1 / (0.70/20 + 0.20/5 + 0.10) = 5.71x
```

This can remove a visible save hitch while barely changing average steady-state frame time. Tail
latency is a legitimate player benefit when it is labeled honestly.

### 7. Amdahl boundary for whole-game 5x

If 80% of a frame becomes 5x faster:

```text
1 / (0.20 + 0.80/5) = 2.78x
```

To exceed 5x overall, roughly 90% of the limiting frame must become about 10x faster:

```text
1 / (0.10 + 0.90/10) = 5.26x
```

The July 16 route is already display-capped. For SpaceFace, supported scale, minimum-spec stability,
and p99 hitch elimination are usually more meaningful than multiplying foreground FPS on a scene
that already presents every refresh.

## Ranked option matrix

| Rank | Option | Size | Primary value | What selects it |
|---:|---|---|---|---|
| 1 | Clean randomized attribution plus frame-linked CPU/GPU/compositor traces | quick | establishes the real critical path | no prerequisite |
| 2 | Hidden/minimized/suspend lifecycle | quick | removes invisible CPU/GPU work and contention | current lifecycle code already establishes the defect |
| 3 | Offline semantic render compiler | medium | admission, memory layout, pipeline grouping, LOD/HLOD | representative compiled asset beats source path without semantic loss |
| 4 | Material-role canonicalization and opaque pipeline-major ordering | quick/medium | fewer state transitions and larger homogeneous cohorts | real switch census finds compatible roles |
| 5 | Exact dynamic upload ranges | quick | lower driver and shared-memory traffic | uploaded bytes correlate with dense-scene cost |
| 6 | Transparent-family structural pilot | medium | lower hot-pixel work without removing spectacle | pass timing and coverage identify transparency |
| 7 | Real HLOD and distant impostors | medium | multiplies distant authored scene scale | large place/debris held-out scene |
| 8 | Hierarchical visibility with temporal coherence | medium | removes O(all admitted roots) presentation growth | 1x/5x root scale curve |
| 9 | Dense RenderWorld | medium/large | typed active/dirty presentation and backend seam | entity sync becomes material at target population |
| 10 | Lifecycle-safe homogeneous pool v2 | medium | bounded submissions for repeated exact roles | high occupancy and complete lifecycle proof |
| 11 | Rapier SIMD/reservation and packed authority pilot | quick/medium | physics scale and lower memory-growth/GC tails | physics/authority owner becomes material |
| 12 | NPC/AI query indexing and packed contact frames | quick/medium | removes repeated scans and allocation | large traffic/combat scale curve |
| 13 | Spatial reconstruction, then temporal reconstruction | medium/large | 2.25–9x fewer source pixels with rich output | resolution-sensitive GPU work dominates |
| 14 | Three WebGPU/TSL dual backend | large | modern backend, bundles, compute, indirect path | supported Electron + representative parity slice |
| 15 | GPU-driven WebGPU RenderWorld | large | 5x+ candidate/scene scale under the right workload | compute/indirect prototype beats packet-extraction cost |
| 16 | GPU particle/VFX backend | large | 5x+ effect density | dense VFX becomes a real limiter |
| 17 | Coarse read-only Worker | medium | parallelizes a separable multi-millisecond job | transfer/snapshot overhead is small relative to work |
| 18 | Rust/WASM hot kernel | large | 2–8x numeric kernel | typed JS cannot meet a named scale goal |
| 19 | Rust/WASM authoritative simulation Worker | very large | long-term CPU scale with browser renderer retained | evolutionary path cannot reach product-scale requirement |
| 20 | PlayCanvas/Babylon or native recreation | port | alternate renderer/platform ceiling | complete vertical slice materially beats focused current path |

## OSS reuse and algorithm catalogue

| Project | License | Use in SpaceFace |
|---|---|---|
| [Three.js](https://github.com/mrdoob/three.js) | MIT | retain current renderer; use TSL/WebGPU, `BundleGroup`, indirect examples, loaders, and dual-backend pilot |
| [glTF Transform](https://github.com/donmccurdy/GLTF-Transform) | MIT | extend the existing offline compiler with deterministic dedup/weld/reorder/simplify/inspection |
| [meshoptimizer / gltfpack](https://github.com/zeux/meshoptimizer) | MIT | cache/overdraw/fetch ordering, simplification, compression, shadow streams, clusters/meshlets |
| [Basis Universal](https://github.com/BinomialLLC/basis_universal) | Apache-2.0 | retain KTX2/UASTC path; add role-aware profiles and safe array/atlas inputs |
| [KTX-Software](https://github.com/KhronosGroup/KTX-Software) | Apache-2.0 | KTX2 tooling and validation |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | MIT | benchmark object-level hierarchy/raycast owners; do not mistake triangle BVH for free renderer culling |
| [NASA 3DTilesRendererJS](https://github.com/NASA-AMMOS/3DTilesRendererJS) | Apache-2.0 | learn traversal, scheduling, cancellation, priority, and LRU separation for large-world streaming |
| [pmndrs/postprocessing](https://github.com/pmndrs/postprocessing) | zlib | learn effect/pass fusion; do not replace the current post stack without evidence |
| [Rapier.js](https://github.com/dimforge/rapier.js) | Apache-2.0 | retain physics; test SIMD-compatible build and one-time reservation |
| [Comlink](https://github.com/GoogleChromeLabs/comlink) | Apache-2.0 | optional coarse Worker control plane; avoid hot per-entity proxy RPC |
| [wasm-bindgen](https://github.com/wasm-bindgen/wasm-bindgen) | MIT/Apache-2.0 | typed Rust/WASM ABI |
| [wasm-bindgen-rayon](https://github.com/RReverser/wasm-bindgen-rayon) | Apache-2.0 | conditional threaded-WASM adapter after cross-origin isolation and deterministic partitioning |
| [PlayCanvas Engine](https://github.com/playcanvas/engine) | MIT | learn clustered lighting and WebGPU command architecture; strongest web-first port comparator |
| [Babylon.js](https://github.com/BabylonJS/Babylon.js) | Apache-2.0 | learn frame graph, WebGPU, occlusion, particles, and large-world techniques; port comparator |
| [wgpu](https://github.com/gfx-rs/wgpu) | MIT/Apache-2.0 | foundation only for a deliberate custom Rust renderer |
| [Bevy](https://github.com/bevyengine/bevy) | MIT/Apache-2.0 | learn GPU preprocessing, meshlet/occlusion/indirect systems; native recreation comparator |
| [Filament](https://github.com/google/filament) | Apache-2.0 | learn renderer/material/post/adaptation discipline; weak direct browser-product fit |
| [Niagara](https://github.com/zeux/niagara) | MIT | learn GPU-driven visibility and submission architecture |
| [DirectX Graphics Samples](https://github.com/microsoft/DirectX-Graphics-Samples) | MIT | learn meshlet, culling, and indirect execution patterns; not drop-in web code |
| [Khronos Vulkan Samples](https://github.com/KhronosGroup/Vulkan-Samples) | Apache-2.0 | learn explicit synchronization, descriptors, indirect draw, and mesh-shading architecture |
| [Recast Navigation](https://github.com/recastnavigation/recastnavigation) | zlib | future path/navmesh/crowd option only if obstacle-rich gameplay makes path search material |
| [Recast Navigation JS](https://github.com/isaac-mason/recast-navigation-js) | MIT | maintained WASM integration path if that future arrives |

## Research and primary references

### Renderer and GPU

- [W3C WebGPU specification](https://www.w3.org/TR/webgpu/) — render/compute model, bundles,
  timestamps, adapter features/limits, indirect drawing, and device behavior.
- [Three.js WebGPU renderer guide](https://threejs.org/manual/en/webgpurenderer) — migration,
  TSL/node-material requirements, experimental status, and WebGL2 fallback.
- [Three.js `BundleGroup`](https://threejs.org/docs/pages/BundleGroup.html) — WebGPU static command
  bundles.
- [Three.js `BufferGeometry`](https://threejs.org/docs/pages/BufferGeometry.html) — WebGPU indirect
  draw buffer support.
- [GPU Gems: efficient occlusion culling](https://developer.nvidia.com/gpugems/gpugems/part-v-performance-and-practicalities/chapter-29-efficient-occlusion-culling)
  — why naive query readback stalls and why hierarchy/temporal coherence matter.
- [GPU Gems 2: hardware occlusion queries made useful](https://developer.nvidia.com/gpugems/gpugems2/part-i-geometric-complexity/chapter-6-hardware-occlusion-queries-made-useful)
  — asynchronous hierarchical queries.
- [Weighted blended order-independent transparency](https://www.jcgt.org/published/0002/02/09/)
  — approximate transparency without global sorting.
- [NVIDIA mesh-shader introduction](https://developer.nvidia.com/blog/introduction-turing-mesh-shaders/)
  and [AMD mesh-shader practices](https://gpuopen.com/learn/mesh_shaders/mesh_shaders-optimization_and_best_practices/)
  — meshlet/cluster design references. Browser WebGPU maps these ideas to compute plus indirect
  indexed drawing rather than a standard mesh-shader stage.
- [FidelityFX FSR2](https://github.com/GPUOpen-Effects/FidelityFX-FSR2) — MIT temporal reconstruction
  reference requiring motion, depth, and reactive/transparency information.
- [FidelityFX spatial super resolution](https://gpuopen.com/manuals/fidelityfx_sdk/techniques/super-resolution-spatial/)
  — lower-risk spatial reconstruction reference.

### Asset compilation and representation

- [meshoptimizer algorithms and cluster LOD](https://github.com/zeux/meshoptimizer) — vertex cache,
  overdraw, fetch, simplification, compression, cluster partition, and cluster hierarchy.
- [gltfpack reference](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md) — glTF
  optimization pipeline.
- [KTX2 specification](https://github.khronos.org/KTX-Specification/ktxspec.v2.html) and
  [`KHR_texture_basisu`](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_texture_basisu/README.md).
- [Original HLOD research](https://www.researchgate.net/publication/220791896_Hlods_for_Faster_Display_of_Large_Static_and_Dynamic_Environments)
  — establishes the scale ceiling for hierarchical representation; published workload results are
  not SpaceFace benchmarks.
- [Automatic shader level of detail](https://research.nvidia.com/publication/2015-11_system-rapid-automatic-shader-level-detail)
  — automatic shader simplification and distance policy.

### CPU, JavaScript, parallelism, and platform

- [Amdahl's law](https://doi.org/10.1145/1465482.1465560) — why local multipliers shrink at whole-frame
  scope.
- [V8 fast properties](https://v8.dev/blog/fast-properties),
  [elements kinds](https://v8.dev/blog/elements-kinds), and
  [concurrent GC](https://v8.dev/blog/trash-talk) — data shape, arrays, and allocation/GC behavior.
- [Three.js OffscreenCanvas guide](https://threejs.org/manual/en/offscreencanvas.html) and
  [web.dev OffscreenCanvas](https://web.dev/articles/offscreen-canvas) — render-Worker constraints
  and message-proxy architecture.
- [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
  and [cross-origin isolation](https://web.dev/articles/cross-origin-isolation-guide) — deployment
  requirements for shared-memory Workers/threaded WASM.
- [`navigator.hardwareConcurrency`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency)
  and [`navigator.deviceMemory`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory)
  — coarse, privacy-reduced hints rather than trustworthy performance measurements.
- [Electron BrowserWindow options](https://www.electronjs.org/docs/latest/api/structures/browser-window-options),
  [BrowserWindow visibility behavior](https://www.electronjs.org/docs/latest/api/browser-window), and
  [powerMonitor](https://www.electronjs.org/docs/latest/api/power-monitor/) — background submission
  semantics and event-driven power/suspend signals.

## Staged implementation program

Every stage is independently reversible and leaves the default route playable.

### Stage 0 — establish current truth

1. Wait for the active asset workload to finish.
2. Seal one exact clean revision and environment.
3. Run randomized matched browser and Electron blocks with at least:
   baseline, submission no-op, simulation pause, transparency isolation, canopy isolation, bloom
   isolation, and HUD isolation.
4. Add delayed nonblocking GPU distributions, CDP/Perfetto frame correlation, state-switch counts,
   upload bytes, allocation/GC, and process-contamination receipts.
5. Run real authored 1x/2x/5x entity and scene sweeps.

**Do not select an architecture if machine contention or run order is larger than the candidate
effect.**

### Stage 1 — narrow, low-risk repairs

Implement independently:

- explicit hidden/minimized/suspend lifecycle;
- diagnostics object reuse and elimination of the second HLOD scan outside diagnostics;
- exact dirty upload ranges;
- indexed NPC-job hostile lookup;
- one allocation-selected physics or AI membrane;
- Rapier SIMD/reservation A/B;
- opaque pipeline ordering/material-role report.

Retain only changes that produce a repeatable improvement in the owner, player-visible tail, or
supported target scale with all behavioral/visual contracts intact.

### Stage 2 — offline compiler pilot

Compile one high-frequency ship family, one debris field, and one hero-place stable-root HLOD.
Compare source and compiled packages across cold/warm admission, heap/transient memory, upload,
submission, GPU time, motion, and exact semantics.

Expand the compiler only if the pilot is reproducible and exceptions do not overwhelm the semantic
schema.

### Stage 3 — RenderWorld scale pilot

Publish typed presentation records and run current-versus-RenderWorld shadow mode at 1,000 and 5,000
entities, including churn, rebase, LOD, damage, VFX, save/continue, and context recovery.

Stop if hierarchy/dirty-record maintenance costs as much as the traversals it removes.

### Stage 4 — reconstruction and platform/backend pilots

1. Spatial reconstruction on current WebGL.
2. Supported-current Electron A/B.
3. Three WebGPU/TSL vertical slice with one opaque fleet, one plume family, bloom, timestamps,
   device loss, and WebGL fallback.
4. Temporal reconstruction only after motion/depth/reactive data are trustworthy.
5. Static bundles and compute/indirect prototype only after the dual backend is viable.

Kill the WebGPU bet if representative visual parity requires a near-total rewrite and no target
adapter shows a material improvement.

### Stage 5 — choose one large future

Choose based on the named remaining limiter:

- evolved JS + Three/WebGPU;
- custom GPU-driven WebGPU backend;
- JS presentation plus Rust/WASM simulation;
- PlayCanvas or Babylon renderer port;
- native Rust/wgpu or Bevy recreation.

Do not fund multiple permanent presentation authorities. A port requires a complete representative
vertical slice, old-save import, input/accessibility parity, browser/desktop packaging, a kill date,
and a rehearsed rollback.

### Marginal-gains stop point

Return to content and game work when:

- the representative minimum-spec route presents smoothly with adequate measured headroom;
- p99 and long-frame regressions are absent in release soak;
- hidden-window work is effectively suspended;
- heap/residency is stable;
- the intended 1x/5x entity and scene scenarios pass;
- the next option is not expected to create a material player-visible or product-scale benefit.

There is no value in turning a harmless sub-millisecond owner into an architectural monument.

## Rejected or avoid

- global heterogeneous `BatchedMesh` or giant pooled scene;
- blanket ECS conversion;
- replacing Rapier without measured physics dominance;
- canvas/WebGL HUD rewrite;
- bloom-off, effect-off, lower default source scale, fewer assets, or reduced authored density as the
  claimed optimization;
- treating triangles, draw count, or material count as a universal answer;
- naive per-object occlusion queries with synchronous result reads;
- enabling an expensive depth prepass on every GPU;
- eager load/precompile of all content;
- continuous synthetic benchmarking or live resource probing;
- dynamically growing Worker pools;
- per-entity Worker RPC;
- WebGPU adoption justified only by novelty;
- Electron upgrade presented as a guaranteed speedup;
- native recreation before a representative browser/Electron/WebGPU vertical slice.

## Annotation-driven arbitrary-constraint cleanup

The repository-wide terminology scan found:

- 1,659 raw occurrences;
- 337 live non-archive files after excluding vendor, third-party, generated-log, and historical
  material;
- 52 files in the visual-quality/complexity subset.

A blind global replacement would also corrupt narrative prose, game mechanics, third-party records,
and generated evidence. The live poison-pill surface is smaller and concrete:

1. active agent/process instructions that pre-allocate write, proof, technique, or complexity;
2. visual-asset profile manifests and class tags that present historical triangle/byte values as
   authoring authority;
3. exporter and Blender scripts containing hard maximum-triangle or automatic decimation paths;
4. queue/prompt text that exposes universal triangle, texture, material, primitive, or draw ceilings;
5. performance document and check names that encourage agents to treat phase allocations as design
   authority rather than measured evidence;
6. repeated historical prompts still likely to be discovered by broad search.

The cleanup should:

- delete universal art/complexity ceilings and automatic quality-reducing enforcement;
- convert retained measurements into clearly labeled observed profiles, never pass/fail art
  authority;
- rename performance acceptance surfaces around measured targets and evidence;
- preserve player-visible quality, deterministic behavior, accessibility, semantic asset contracts,
  real platform limits, and exact source identity;
- preserve narrative/gameplay uses of the English term that have nothing to do with agent
  constraints;
- exclude third-party and generated evidence from policy;
- add search checks that fail when a new active policy introduces a universal visual ceiling.

The three currently dirty place GLBs and adjacent authoring surfaces are owned by an active Blender
writer. This research did not race, rewrite, stage, or invalidate them. Apply the cleanup after that
ownership signal clears, with focused asset/export/check validation.

## Three best next experiments

### E1. Causal frame-path matrix

On an exact clean revision and quiet machine, run matched randomized browser/Electron blocks and
correlate rAF, JS phases, GPU passes, Viz/compositor, GC, state switches, uploads, visible coverage,
and process metadata.

**Success:** one causal class repeats beyond environment/run-order noise.

**Stop:** blocks remain indistinguishable or contaminated. Do not alter runtime architecture.

### E2. Offline render-package pilot

Compile one high-frequency authored ship family into indexed, pretransformed opaque clusters with
exact material roles, sockets, dynamic-surface metadata, and source fallback.

**Success:** substantial measured improvement in admission/composition or dense-scene work, no
residency regression, identical semantics and accepted visual output.

**Stop:** runtime composition is not material, package memory grows, or exceptions make the contract
fragile.

### E3. RenderWorld camera-visible-set prototype

Feed compact immutable render packets into both current Three rendering and a dense visible/dirty
prototype. Test 1,000/5,000 moving, static, far-culled, and churn cases.

**Success:** five times the target population at equal or lower presentation-sync work with exact
pose/visibility/LOD/lifecycle parity.

**Stop:** packet publication, hierarchy maintenance, or semantic bridging consumes the saved work.
