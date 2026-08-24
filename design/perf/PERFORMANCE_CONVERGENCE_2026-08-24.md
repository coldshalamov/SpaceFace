<!-- LIFETIME: DURABLE -->
<!-- Integrated onto master 2026-08-24 from origin/perf/exact-opening-geometry-residency (6ab735b9,
     the PR #100 branch). Its geometry-cohort admission code was already ported to master under
     PQ-129.19 (receipt: design/program/roadmap/receipts/PQ-129-19-continue-residency-REPORT.md).
     This plan is DURABLE research input: it grants no lease, dispatch authority, or acceptance;
     CANONICAL_BUILD_MAP.md section 8 and design/PERF_BUDGET.md remain the performance authority,
     and PQ-129/PQ-051..PQ-128 remain the admitted/reserved identities its backlog items map onto. -->

# SpaceFace performance convergence plan

**Date:** 2026-08-24  
**Campaign:** PQ-129  
**Baseline reviewed:** `master` at `484b84bf3b84d8ac9d9b2fb160038a2f43587f64`  
**Non-negotiable invariant:** performance work must preserve the authored picture, simulation density, controls, and game rules. Resolution, bloom, shadows, population, particles, and asset fidelity are not acceptable sacrificial variables unless the player explicitly selects a lower quality profile.

## Executive diagnosis

SpaceFace no longer has one undifferentiated “performance problem.” It has several different classes of cost, and treating them as one has repeatedly sent work toward the wrong subsystem.

The strongest current evidence separates the problem into four layers:

1. **Steady simulation and UI are not the dominant bottleneck.** Existing crowded-flight captures put simulation, VFX bookkeeping, and UI below the full present cost. Earlier renderer work has already reduced much of the ordinary CPU-side presentation overhead.
2. **Steady rendering remains submission-bound on weak/software GPUs.** Draw count, material/state diversity, shadow work, full-screen passes, and driver overhead still determine the continuous frame floor.
3. **The catastrophic opening freezes are first-touch admission failures.** Commit `730bc5c` recorded independent multi-second events from shader-program admission and geometry admission:
   - about 5.0 seconds while programs moved from 4 to 21;
   - about 3.4 seconds while programs moved from 20 to 23;
   - about 4.2 seconds while programs stayed at 56 but geometries moved from 41 to 56.
4. **The startup contract was asymmetric.** `compileAsync()` prepared programs. `prepareStartupGpuResidency()` explicitly initialized textures. Nothing drove Three.js through `WebGLObjects.update()` for the exact opening geometry. The first visible `renderer.render()` therefore remained the first point at which vertex attributes, index buffers, and instance buffers were registered and uploaded.

That last defect is the first code change in this PR. It is narrow because the evidence is narrow.

## What this PR changes

`src/render/startupGpuResidency.js` now performs an exact geometry-residency admission after texture admission:

- It consumes the same immutable `openingSubmissionPlan.residencySubjects` already selected by startup. It does not rediscover or render the broad scene.
- It deduplicates ordinary shared `BufferGeometry` objects while retaining every `InstancedMesh`, because instance matrices and instance colors are per-object buffers even when geometry is shared.
- It creates isolated proxy drawables that reference the production geometry and production instance buffers. Live scene ownership, visibility, transforms, callbacks, materials, LOD state, and authored objects are untouched.
- It renders those proxies with one disposable raw material into a disposable 1×1 render target. Vertices are deliberately clipped, color writes are disabled, shadows and XR are suspended for the admission call, and no picture is presented.
- It admits work in bounded batches, yielding to the browser before every batch. The default cap is four drawables or approximately 8 MiB of estimated buffer data per batch, whichever boundary arrives first.
- It restores render target, viewport, scissor, scissor test, auto-clear, XR, and shadow-update state even when the driver throws.
- It publishes per-batch `gpuGeometryResidency` blocking slices and a structured result containing source drawables, unique geometries, estimated bytes, batch durations, and `renderer.info.memory.geometries` before/after counts.

This does **not** reduce geometry, simplify a shader, lower resolution, disable an effect, change a material, or alter gameplay. It moves unavoidable GPU buffer admission behind the loading boundary and makes it observable.

## Why compile-only admission could never close the geometry gap

Three.js has two distinct paths:

- `WebGLRenderer.compile()` / `compileAsync()` traverse materials and create or wait for programs.
- `WebGLObjects.update()` calls `WebGLGeometries.get()` and `WebGLGeometries.update()`, which register geometry and upload attributes. That path is reached during rendering.

The existing startup sequence covered the first path and explicitly called `initTexture()` for the texture path. It did not cover the second path. The opening receipt compared planned geometry identities against identities re-derived from the live graph, not against a completed GPU upload. It could therefore be internally consistent while the first visible render still had fifteen new geometries to admit.

The proxy pass uses the public render path rather than private Three.js internals. That matters for compatibility: direct access to `WebGLAttributes`, `WebGLGeometries`, or binding-state caches would couple SpaceFace to undocumented renderer internals and make the next Three.js update a minefield.

## Why the pass is isolated instead of rendering the hidden production scene

The repository already learned this lesson the expensive way. A broad hidden render behind the loading shell can still freeze the shell, discover unrelated objects, run authored callbacks, compile unintended variants, update shadows, and turn startup cost into a function of everything attached to the scene.

The isolated pass avoids all of that:

- exact plan subjects only;
- production buffers, disposable proxy objects;
- disposable raw material, not production materials;
- no live object reparenting;
- no scene callbacks;
- no shadow pass;
- one pixel of raster target and clipped vertices;
- bounded batches with browser yields.

The render exists solely because Three.js owns buffer admission inside its render traversal. Everything else is stripped away.

## Performance model

### Cost classes

| Class | Typical symptom | Primary instrument | Correct response |
|---|---|---|---|
| Simulation CPU | consistent frame cost that scales with actors/rules | phase timers, entity counts, deterministic replay | algorithm/data-structure work |
| Presentation CPU | transforms, closures, culling, allocations, UI work | render-work lanes, allocation/GC traces | dirty propagation, pooling, cadence |
| GPU steady state | stable high present time | disjoint timer queries, pass pixels, draw/state counts | reduce redundant submissions and pixels |
| Driver admission | one-time 40 ms to multi-second brick | program/geometry/texture deltas around slow frames | pre-admit exact resources behind a gate |
| Asset construction | long task before GPU use | long-task stacks, authored build receipts | prebuild, cache, workerize, bound generation |
| Memory/GC | periodic sawtooth hitches | heap snapshots, allocation counters, GC events | remove transient ownership and churn |

Every optimization must name its class before code changes begin. A fix that moves a number in the wrong class is not evidence.

### Proposed acceptance matrix

These are campaign targets, not claims that current `master` already satisfies them.

| Scenario | 60 Hz target | 30 Hz floor | Catastrophic-hitch rule |
|---|---:|---:|---:|
| Empty flight, native target hardware | p95 ≤ 16.7 ms | p95 ≤ 33.3 ms | no frame > 50 ms after warmup |
| Crowded combat reference scene | p95 ≤ 20 ms | p95 ≤ 33.3 ms | no frame > 75 ms |
| Mining reference scene | p95 ≤ 20 ms | p95 ≤ 33.3 ms | no frame > 75 ms |
| Sector transition | handoff p95 ≤ 33 ms | p95 ≤ 66 ms | no frame > 100 ms |
| First playable frame | program delta 0; geometry delta 0; blocking textures delta 0 | same identity rule | no visible frame > 100 ms |
| 20-minute soak | stable p95 and heap plateau | stable p95 and heap plateau | no unexplained > 100 ms event |

Weak/software GPU evidence should be reported separately rather than averaged into discrete-GPU results. A 16.7 ms VSync floor and a 16.7 ms GPU frame are not the same phenomenon.

## Verification required for this change

### Unit and contract checks

1. Exact drawable collection deduplicates object references and excludes zero-count pools and zero draw ranges.
2. Ordinary shared geometry produces one geometry work item; every `InstancedMesh` retains an instance-buffer work item.
3. The admission target is 1×1, scissored, non-presenting, shadow-suppressed, and XR-suppressed.
4. Production materials are never attached to the proxy scene.
5. Production `instanceMatrix` is the exact buffer referenced by the instanced proxy.
6. Render target, viewport, scissor, scissor-test, auto-clear, XR, and shadow-update ownership are restored on success and failure.
7. Browser yields occur before every bounded batch.
8. Blocking-slice observers cannot change admission success or failure.

### Browser evidence

The decisive browser run is the existing PQ-129 opening witness on the same Intel/ANGLE or SwiftShader route that produced the recorded bricks.

Before and after must use:

- identical commit-independent seed and save/run path;
- identical browser, window size, DPR, GPU backend, video settings, and power state;
- at least five clean starts per side;
- no concurrent graphics lane or background capture;
- the always-armed `[GPU brick]` witness;
- first-visible program, geometry, and texture counts;
- loading-stage `gpuGeometryResidency` slices;
- first playable paint timestamp;
- screenshots or hashes proving the opening picture is unchanged.

The expected causal signature is specific:

- geometry count rises during `gpuGeometryResidency` while mode is `loading`;
- first visible `bloomScene` geometry delta becomes zero;
- the prior geometry-only multi-second brick disappears from the first visible frame;
- loading remains responsive between batches;
- image parity holds.

If the first visible frame still reports new geometry, the missing identities must be printed and added to the immutable opening plan. Do not broaden the pass to the entire scene.

## Remaining shader-admission problem

The geometry fix does not declare the shader problem solved. Commit `730bc5c` showed both classes independently.

The current exact compilation path is directionally correct:

- compile against the production output target, not the screen by accident;
- wait through `KHR_parallel_shader_compile` when available;
- capture exact first-picture subjects;
- hold post-opening admission behind the loading shell;
- preserve the prepared opening graph through first submit.

The remaining work is to establish why programs still appear after warmup. Candidate causes, in order:

1. **Compile/render graph mismatch.** A material is compiled with a different light, fog, clipping, shadow, output-color-space, tone-mapping, or render-target state than the first draw.
2. **Late graph mutation.** LOD replacement, authored swap, pool activation, environment assignment, or shadow membership changes after the exact census.
3. **Post-route program family.** Composite/downsample/shadow/depth variants are not included in the same admission receipt.
4. **Material mutation.** `defines`, `onBeforeCompile`, `customProgramCacheKey`, skinning/morph flags, vertex colors, maps, or transparency change after compile.
5. **Driver readiness semantics.** The extension reports readiness, but the first use still pays final link or command-buffer synchronization.

### Required next instrument

For every program created after the opening receipt, record a normalized program signature containing:

- material UUID/type/name;
- object type and authored asset identity;
- shader ID or custom shader hash;
- custom program cache key;
- light/shadow counts and shadow-map type;
- fog, clipping, instancing, skinning, morph, vertex-color, alpha-test, transmission, and side flags;
- output target identity, output color space, tone mapping, and render route;
- first creation phase and first object that requested it.

The instrument must diff exact signatures, not program counts. “+3 programs” is a symptom. The missing three signatures are the diagnosis.

## Quality-preserving optimization backlog

The order below follows expected leverage and evidence quality. It is deliberately not a list of fashionable rendering tricks.

### 1. Close the opening resource identity contract

- Require first visible draw to report zero new programs, geometries, blocking textures, shadow resources, and render targets.
- Attach every late resource to an owner and lifecycle phase.
- Fail the performance gate when a late resource is unexplained.
- Keep exact first-picture and post-opening cohorts distinct; do not turn startup into “load the universe.”

### 2. Finish program-family convergence

- Normalize material program signatures.
- Canonicalize identical material definitions so equivalent hull parts do not create accidental variants.
- Freeze `defines` and `customProgramCacheKey` after authored admission.
- Compile color, depth, distance, and post-route variants under the exact production state.
- Retain deferred nonopening admission in bounded batches after first paint.

### 3. Remove asset-construction long tasks

The previously observed `buildComposedShip` event around 1.8 seconds belongs to asset construction, not ordinary rendering.

- Make shipped GLB/LOD packages the runtime source of truth for production ships.
- Reserve procedural composition for editor/dev generation or genuinely generated content.
- Cache deterministic generated output by content hash.
- Move parse/decode/tangent/mesh-processing work off the main thread where browser APIs permit it.
- Bound any unavoidable main-thread commit by explicit object/byte budgets per turn.
- Record build, decode, upload, and publish as separate receipts.

### 4. Reduce steady draw submissions without reducing visible detail

- Instance repeated asteroid, projectile, debris, marker, and traffic geometry when material/program identity matches.
- Merge only static, same-material, same-lifecycle geometry whose independent culling is not valuable.
- Use HLOD/impostors only below a measured projected-pixel threshold; preserve LOD0 hero assets.
- Canonicalize material instances that differ only by uniforms.
- Sort stable opaque submissions by program/material while preserving transparent correctness.
- Measure CPU submission and GPU time separately; fewer draws can still lose if culling or overdraw worsens.

### 5. Attack overdraw and pass duplication

- Maintain pass-level pixel accounting for scene, shadow, bloom, AO, distortion, and composite.
- Cull transparent effects by projected influence before submission.
- Keep zero-strength/off effects out of their pass family while retaining the canonical presentation composite.
- Reuse persistent render targets; resize only on an actual drawing-buffer or scale change.
- Ensure the scene is rendered once per required route, not once per decorative subsystem.
- Preserve bloom/shadows; remove redundant work, not the effect.

### 6. Shadow efficiency without shadow loss

The renderer already contains local caster membership, dirty shadow refresh, a tight moving ortho region, and texel-stable follow. Continue that architecture:

- prove caster/receiver counts per frame;
- update the map only when caster pose, membership, light direction, or receiver need changes;
- keep distant low-LOD roots out of the depth pass while retaining contact/receive cues;
- atlas or share shadow resources only when it reduces passes on the target backend;
- test shadow stability and temporal popping, not only frame time.

### 7. Dynamic-buffer discipline

- Every dynamic attribute should publish the exact dirty byte range.
- Static attributes must never set `needsUpdate` after admission.
- Pool growth must be geometric and rare; steady play must not reallocate buffers.
- Separate buffer capacity from live draw count.
- Instrument `bufferData`, `bufferSubData`, and orphaning volume by owner.
- Treat a full-buffer upload caused by a one-particle change as a correctness defect.

### 8. Presentation CPU and allocation closure

- Keep the existing dirty/delta pose path and closure cadence.
- Remove remaining per-frame arrays, sets, object spreads, string stamps, and iterator allocation from hot loops where evidence shows GC pressure.
- Replace whole-scene traversals with owner-maintained counters and journals.
- Cache camera/projection work only against explicit invalidation keys.
- Keep UI and VFX failure isolation; performance code must not re-couple cosmetic lanes to world authority.

### 9. Spatial and AI scaling

This is secondary until the renderer no longer dominates, but survival/swarm mode will eventually move the boundary.

- Maintain broad-phase spatial indices for targeting, collisions, flocking, and render residency.
- Bound neighbor queries by cell/radius and reuse result storage.
- Separate strategic AI cadence from steering/control cadence.
- Use deterministic staggered updates for distant actors while preserving local responsiveness.
- Profile worst-case formation changes, target churn, and projectile saturation.

### 10. Memory and lifetime convergence

- Record heap, GPU geometry count, texture count, render-target count, program count, and pooled capacities across a 20-minute soak and repeated sector transitions.
- Every count must plateau.
- Dispose by owner journal, not broad traversal.
- Detect duplicate texture decode, duplicate geometry construction, and orphaned material/program references by content hash.
- Exercise WebGL context loss/restore after the scene has reached maximum residency.

## Experiment queue

Each experiment must have a control, one independent variable, a representative scene, quality evidence, and an explicit rollback condition.

| ID | Hypothesis | Experiment | Win condition | Rollback condition |
|---|---|---|---|---|
| E1 | first visible geometry brick is missing buffer admission | this PR’s exact 1×1 batched proxy render | first visible geometry delta 0; no picture change | any visual/state mutation or no causal delta shift |
| E2 | remaining opening programs are state-signature mismatches | log normalized late-program signatures | every late program maps to one differing state field | signatures remain identical but link still occurs |
| E3 | ship construction is a main-thread content-generation problem | compare shipped package vs runtime composition | build long task removed, same asset hash/picture | package increases runtime memory or breaks authoring contract |
| E4 | material instance entropy inflates draws/programs | canonicalize one measured family | fewer state changes/programs, identical captures | uniform coupling or visual divergence |
| E5 | transparent VFX overdraw dominates combat GPU time | projected-influence cull with pass-pixel counters | lower GPU pass time, no readable effect loss | effect disappearance at accepted screen size |
| E6 | shadow refresh is still more frequent than scene change | log dirty reason and skip clean maps | fewer shadow passes, stable captures | stale or swimming shadows |
| E7 | dynamic buffers upload capacity rather than dirty range | owner byte-volume census | lower upload bytes and CPU time | corruption or synchronization stalls |
| E8 | repeated assets remain separate submissions | instance one high-count family | lower draw CPU/GPU, same culling/readability | worse overdraw or coarse culling |

## Gate design

A performance gate must be able to fail for the intended reason. The current hitch gate was correctly left red rather than made permissive.

The campaign gate should produce one machine-readable packet per run:

```json
{
  "backend": "ANGLE / Intel / SwiftShader / discrete",
  "scenario": "opening | crowded-flight | mining | sector-transition | soak",
  "seed": 0,
  "frames": 0,
  "frameMs": { "p50": 0, "p95": 0, "p99": 0, "max": 0 },
  "hitches": [{ "frame": 0, "durationMs": 0, "owner": "" }],
  "programDeltaAfterWarmup": 0,
  "geometryDeltaAfterWarmup": 0,
  "textureDeltaAfterWarmup": 0,
  "renderTargetDeltaAfterWarmup": 0,
  "drawCalls": { "p50": 0, "p95": 0, "max": 0 },
  "triangles": { "p50": 0, "p95": 0, "max": 0 },
  "passPixels": {},
  "bufferUploadBytes": {},
  "heap": { "start": 0, "end": 0, "max": 0 },
  "visualParity": { "reference": "", "candidate": "", "accepted": false }
}
```

A zero-frame sample is a failed measurement, not a green result. A run with active unrelated lanes or a different backend is not an A/B pair. A lower p95 accompanied by a new max hitch is not automatically a win.

## Rejected shortcuts

The following can make a graph look better while making the game worse and are outside this campaign’s default solution space:

- lowering render scale or DPR as the primary fix;
- disabling bloom, shadows, particles, fog, reflections, or post presentation;
- shrinking population or projectile density;
- lowering physics or AI correctness cadence near the player;
- replacing authored ships with visibly simpler fallback geometry;
- loosening hitch thresholds;
- excluding slow frames from the sample;
- preloading every possible asset before play;
- moving a visible hitch into an unresponsive loading shell and calling it solved.

Adaptive quality remains useful as a player-facing resilience system. It is not evidence that a structural stall has been fixed.

## Convergence protocol

1. State one causal hypothesis.
2. Name the owner and cost class.
3. Add the smallest instrument capable of falsifying the hypothesis.
4. Capture a clean control on the target backend.
5. Change one independent variable.
6. Run deterministic correctness and visual parity checks.
7. Repeat enough times to separate noise from the effect.
8. Keep the change only when the causal signature moves in the predicted place.
9. Record negative results prominently so later agents do not repeat them.
10. Remove or permanently cheapen temporary instrumentation after the campaign closes.

Performance work is not a hunt for lower numbers. It is the construction of a model accurate enough that the next change does what it says.
