# SpaceFace performance deep review and convergence roadmap

**Date:** 2026-08-24  
**Scope:** current `master`, after the opening-path and Continue/load admission fixes  
**Primary campaign:** `PQ-129` hitch/crowded-frame convergence  
**Picture contract:** default bloom, shadows, particles, near meshes, authored asset fidelity, draw distance, simulation rules, and on-glass population remain intact. Performance is bought by eliminating redundant work, moving unavoidable first-touch work behind safe boundaries, changing cadence for irrelevant/off-table work, reducing state/program entropy, and improving batching/residency—not by making the game cheaper-looking.

---

## 1. Executive conclusion

The game no longer has one generic performance problem. Current evidence separates it into four classes:

1. **The original opening GPU brick was largely solved.** The shadow-refresh gate and opening GPU admission work moved entering-flight from multi-second visible freezes to single-digit-millisecond presentation on the measured Intel route. Do not keep re-solving this old pole.
2. **Continue/load first-touch admission was a separate class.** The useful mechanism from PR #100 was ported into `PQ-129.19` on current master. That receipt records exact geometry admission behind loading, post-paint yielding, and aux-pool capacity fixes, with 76/76 focused tests and no hitch-count regression. The old PR was correctly obsolete as an implementation branch even though its reasoning remained useful.
3. **The current broad pole is simulation cadence in crowded play.** `design/program/PERF_WHAT_MATTERS.md` records `simFrame p95 ~9 ms` on the latest green sector-entry fly versus a 5 ms target. Off-table AI/traffic and forced-awake physics are the highest-leverage quality-preserving targets.
4. **A secondary residual class is first-use GPU program entropy.** If a headed route still hitches when a genuinely new hull/material/plume appears, the next legal direction is fewer distinct program keys/material states, not more prewarm. Exact-key prewarm already regressed the measured route.

The convergence order should therefore be:

> **sleep/cadence off-table simulation → physics sleep if still required → collapse program/material key entropy → same-material hull batching if GPU present/draw submission becomes the remaining pole → only then consider worker/WASM/WebGPU architecture.**

Anything outside that order needs new evidence showing a different current pole.

---

## 2. Current measured state: what is already solved and must not be redone

### 2.1 Shadow redraw was the dominant old GPU bill

The prior renderer repeatedly refreshed the directional shadow map when the scene did not require it. The landed dirty/refresh policy reportedly cut the sector-entry `bloomScene` path from roughly 247 ms to roughly 3.6 ms while keeping shadows enabled.

Implication: do not turn shadows off. Keep the visual result and attack refresh frequency, caster membership, and redundant submissions.

### 2.2 Bloom is not the present optimization target

The current operator document reports bloom-specific incremental work around ~0.5 ms and no useful crowded-p95 win from disabling it. Bloom is therefore not a serious optimization candidate on the present route.

Implication: bloom strength, bloom disablement, render-scale cuts, and “cheap mode” work are excluded from the structural campaign.

### 2.3 Shader prewarm has already failed promotion

The shader-key census was useful; the exact-key prewarm candidates were not. They moved work earlier but worsened headed flight.

Implication: when first-use shaders remain a problem, reduce the number of unique programs. Do not add more dummy meshes or broader precompile cohorts without a new census proving a different mechanism.

### 2.4 PR #100 was superseded, then partially ported

PR #100 explored exact opening geometry residency. A later opening-path fix superseded that specific branch. The useful geometry-admission mechanism was then ported to current master as `PQ-129.19` for Continue/load.

Current master’s `PQ-129.19` receipt records:

- post-paint yielding rather than merely yielding to another callback in the same paint;
- clipped 1×1 geometry admission behind Continue/loading;
- one-heavy-boundary admission before opening graph freeze;
- execution-time invalidation of stale loading callbacks;
- ship auxiliary pool pre-sizing and post-paint replacement growth;
- 76/76 focused tests;
- matched A/B with hitch count 1 → 1, p95 3.0 → 3.0 ms, max 3.9 → 3.7 ms;
- no claim of a measured visible improvement because the old ~730 ms player-visible pole did not reproduce in either arm.

Implication: donor work is not missing. It is already in master where it belongs. Future work should not resurrect the stale opening branch.

---

## 3. Performance model: stop mixing cost classes

Every investigation must classify the observed cost before editing code.

| Cost class | Player symptom | Evidence | Correct tool |
|---|---|---|---|
| Simulation CPU | steady crowded slowdown; cost scales with actors/rules | `simFrame`, subsystem timers, deterministic scenario counts | cadence, algorithm, spatial queries, sleep |
| Presentation CPU | transform/closure/UI work fat every frame | `prepareFrame`, `entityViewSync`, UI/VFX timers, allocation/GC | dirty propagation, pooling, cadence, cache |
| GPU steady state | stable present time; draw/state/pixel bound | GPU timers, draw calls, pass pixels, material/program counts | batching, state reduction, culling, pass reuse |
| Driver admission | isolated first-use bricks | program/geometry/texture/render-target deltas | exact residency, fewer program keys, post-paint admission |
| Asset construction | long task while creating/decoding/composing a visual | asset/build timing and long-task traces | prebuilt packages, cache, workerizable decode, bounded publish |
| Memory/GC | periodic sawtooth stalls or degradation over time | heap growth, GC events, resource counts | eliminate transient allocations, owner-correct teardown |
| Scheduling | frame misses despite cheap measured work | rAF interval, long tasks, callback queues, contention | task slicing, post-paint work, priority and cancellation |

A fix only counts if it moves the metric in the class it claims to fix.

---

## 4. Workstream A — off-table simulation cadence (`PQ-129.15`): highest priority

### Problem

The latest operator record says the dominant remaining bucket is `simFrame p95 ~9 ms` with a 5 ms budget. The renderer already declines to submit much off-glass geometry, but simulation continues to think and integrate far more actors than the player can currently interact with.

### Goal

Keep local hostiles, immediate collision threats, current mission actors, target/tether relationships, and on-glass traffic at full simulation cadence. Reduce update frequency for distant/off-table actors without altering deterministic outcomes at the moments those actors become relevant.

### Design

Use a **tiered cadence authority**, not ad hoc modulus checks scattered through AI systems.

Suggested tiers:

- **Tier 0 — immediate:** player; current hostile engagement set; projectile/contact threats; tethered/targeted actors; scripted/mission-critical actors. 60 Hz.
- **Tier 1 — local table/runway:** actors within a relevance envelope that can become visible or interact soon. 30–60 Hz depending on subsystem.
- **Tier 2 — sector background:** distant traffic, non-engaged neutral ships, remote formations. 5–15 Hz strategic update plus deterministic interpolation/prediction when promoted.
- **Tier 3 — abstract/off-sector:** no per-frame entity AI. Existing strategic/sector simulation owns state.

### Critical rules

- Promotion into a faster tier must occur **before** the actor can affect the player.
- Hostiles cannot sleep merely because they are one pixel outside the camera.
- Cadence phase must be deterministic from stable identity/tick, not wall-clock timing.
- A demoted actor cannot accumulate hundreds of milliseconds and then run a huge catch-up loop.
- Expensive perception/formation/route planning can run slower than control/steering even for a locally visible actor.

### Tests

- deterministic replay hash for equivalent player-visible outcomes;
- promotion latency test: actor entering engagement/runway becomes full-rate before meaningful interaction;
- hostile no-sleep test;
- mission-critical no-sleep test;
- cadence distribution census in crowded scenario;
- headed A/B: `simFrame p50/p95/p99`, hitch count, present p95, entity counts unchanged.

### Promotion bar

Keep only if crowded `simFrame p95` moves materially toward ≤5 ms without increased hitches or behavior degradation.

---

## 5. Workstream B — physics sleep and collision workload (`PQ-084` if A is insufficient)

### Problem

Rapier is already native/WASM and therefore not an obvious rewrite target. The meaningful question is whether too many bodies are forced awake and whether broad-phase/query work scales with irrelevant entities.

### Investigation

Measure separately:

- active rigid bodies;
- sleeping rigid bodies;
- active colliders;
- narrow-phase contacts;
- CCD bodies;
- queries/raycasts per frame;
- bodies whose transform is being rewritten every frame by gameplay code;
- wake reasons.

### Candidate changes

1. Re-enable Rapier sleep for bodies that do not require continuous active integration.
2. Prevent presentation-only transform updates from waking physics owners.
3. Use collision groups/masks aggressively so categories that can never interact do not enter unnecessary narrow-phase work.
4. Ensure projectiles use the cheapest correct collision representation and lifetime.
5. Pool transient rigid bodies/colliders only when ownership semantics remain clean; stale collider state is worse than allocation cost.
6. Batch or spatially bound gameplay raycasts/perception queries.
7. Remove duplicate “physics-like” proximity checks where Rapier/spatial authority already answers the same question.

### Reject

- lowering physics tick near the player;
- turning off CCD where tunneling becomes visible;
- reducing collision accuracy for hero interactions.

---

## 6. Workstream C — shader/material program-key entropy (`PQ-129.13`)

### Problem

A first sight of a new material configuration can still cause program compilation. The old answer—precompile more variants—was measured and regressed performance.

### Correct direction

Minimize the **number of distinct program signatures** actually shipped.

Audit program identity across:

- hull exterior PBR;
- canopies;
- emissive strips;
- engine/plume families;
- damage overlays;
- decals;
- shadow depth variants;
- instanced versus non-instanced variants;
- vertex-color and UV channel differences;
- alpha-test/transparency flags;
- material `defines`, `onBeforeCompile`, `customProgramCacheKey`.

### Candidate changes

- share material instances where only uniforms differ;
- replace compile-time `defines` with uniforms when the branch cost is cheaper than a second program and preserves output;
- canonicalize map-channel usage across a material family;
- keep canopy/plume families on a small explicit program grammar;
- prevent runtime mutation of program-defining properties after admission;
- separate cosmetic color variation from shader identity;
- detect duplicate program keys generated by semantically equivalent materials.

### Instrument

For any program created after the route’s warm boundary, record:

- object/asset identity;
- material UUID/type/name;
- normalized feature flags;
- custom program cache key;
- map/UV channels;
- light/shadow counts;
- instancing/skinning/morph flags;
- output target/color space/tone mapping;
- first phase/frame/requester.

Do not accept “+3 programs” as diagnosis. Name the three signatures.

---

## 7. Workstream D — draw submission and same-material batching (`PQ-129.12` only when GPU/draw becomes pole)

### Problem

Rocks are already heavily instanced. Unique ships and authored props can still pay many draw submissions, particularly expensive on Intel-class GPUs.

### Rules

- Batch only when material/program identity matches.
- Do not recreate the rejected heterogeneous mega-batch.
- Preserve independent culling for objects where culling saves meaningful work.
- Preserve object-level effects/selection/damage identity through per-instance data or explicit exceptions.

### Candidate families

- repeated traffic hull family using identical PBR material grammar;
- repeated debris chunks;
- repeated prop/furniture classes;
- projectile and pickup meshes;
- contact-shadow/auxiliary markers already structured as pools.

### Measure

- draw calls;
- material switches;
- program switches;
- triangles;
- GPU time;
- CPU submit time;
- overdraw/pixel cost;
- culling precision lost by batching.

Fewer draw calls is not automatically a win if overdraw or culling gets worse.

---

## 8. Workstream E — dynamic-buffer discipline

### Goal

A one-particle or one-instance change must not cause a full-capacity buffer upload.

Audit every dynamic owner:

- trail/history geometry;
- projectiles;
- VFX particles;
- ship auxiliary pools;
- asteroid instance matrices;
- HUD/radar geometry where WebGL-backed;
- debug geometry (must be dormant in production).

### Requirements

- capacity and live count are separate;
- dirty byte ranges are explicit;
- static attributes never set `needsUpdate` in steady state;
- pool growth is geometric and rare;
- growth occurs outside the present-critical path;
- buffer orphaning/reallocation is owner-labeled in diagnostics;
- context restoration rebuilds exactly once.

Track bytes uploaded per owner, not just calls.

---

## 9. Workstream F — render-target and full-screen pass lifetime

The current renderer already avoids some historical mistakes, but this class deserves a hard invariant.

### Invariants

- no render-target allocation in steady frame loops;
- resize only when drawing buffer / render scale / route genuinely changes;
- zero/off optional effects skip their pass family without bypassing canonical presentation;
- scene render happens only the number of times required by the selected route;
- shadow map renders only when dirty;
- post targets are persistent and context-loss aware;
- no “adaptive” oscillation that reallocates large target chains every few frames.

### Telemetry

Per route:

- render-target allocations and reallocations;
- target dimensions/formats;
- full-screen pass pixels;
- scene render count;
- shadow pass count;
- post pass count.

A frame that allocates a full-resolution HDR target is a defect unless it is a real resize/context transition.

---

## 10. Workstream G — asset construction, decode, and publication

First-use asset construction can look like rendering cost when it is actually CPU content work.

### Separate these stages

1. network/file fetch;
2. parse/decode;
3. CPU composition/generation;
4. texture decode;
5. shader/program admission;
6. geometry/texture GPU residency;
7. publication to the live scene.

### Quality-preserving optimizations

- ship production assets should ship as production packages rather than be procedurally rebuilt at runtime when the result is deterministic and static;
- cache deterministic generated content by content hash;
- share decoded GLB resources rather than clone heavyweight geometry/material graphs unnecessarily;
- use clone semantics appropriate to skinned/animated assets only where needed;
- avoid repeated tangent/bounds/normal generation after release assets are finalized;
- workerize parse/decode/generation where browser APIs permit it, but keep final Three/WebGL resource ownership on the correct thread;
- publish a complete prepared root atomically; never show half an authored ship while later parts arrive;
- maintain exact lifetime/reference ownership so one entity teardown cannot dispose shared assets still used elsewhere.

### Acceptance

No missing or partial ship is an acceptable “performance optimization.” Asset completeness remains a hard visual gate.

---

## 11. Workstream H — JS allocation and GC

Modern engines make small allocations cheap until they are not. Profile first; then remove allocation in genuinely hot loops.

High-value suspects:

- per-frame `Array.from`, spreads, `map/filter/reduce`, transient `Set`/`Map` creation;
- temporary `{x,z}` / vector objects in entity loops;
- string construction/stamps per entity per frame;
- repeatedly rebuilding sorted lists that change rarely;
- UI text/layout objects recreated every frame;
- closures created inside hot frame loops.

Existing render code already uses scratch objects in places. Extend that pattern only where allocation profiles prove pressure.

### Gate

Track bytes allocated/sec and GC pause distribution in representative crowded flight. A source grep is not evidence.

---

## 12. Workstream I — spatial-query convergence

AI, targeting, physics helpers, VFX relevance, and presentation residency often ask overlapping spatial questions.

### Goal

One authoritative broad-phase/index per domain, bounded result sets, reusable storage.

### Review

- perception neighbor searches;
- target selection;
- formation neighbors;
- collision prechecks outside Rapier;
- VFX influence queries;
- render residency/glass/runway queries;
- asteroid proximity/mining queries.

### Risks

- stale indices after teleports/rebases;
- duplicate indexing of the same population;
- full scans hidden behind convenience helpers;
- allocation-heavy query result arrays;
- deterministic-order changes when replacing scans with hashes/trees.

Every optimized query requires an oracle test against the old/reference result set over randomized deterministic scenarios.

---

## 13. Workstream J — presentation/UI cadence

The game should not spend world-frame budget repainting static panels.

### Candidates

- event-driven HUD values where possible;
- fixed low cadence for expensive text/layout whose source changes slowly;
- cached measurement/layout for labels;
- no canvas resize/reallocation unless CSS/device size changes;
- radar/minimap reuse of already-indexed world data;
- bounded trails/history arrays;
- avoid DOM reads that force layout after DOM writes in the same frame.

### Preserve

Target/reticle/lead indicators and immediate combat feedback must remain visually responsive. Do not reduce all HUD work to 10 Hz indiscriminately.

---

## 14. Workstream K — memory and lifetime soak

Performance must remain stable after repeated gameplay transitions.

### 20-minute / repeated-transition soak

Record at fixed checkpoints:

- JS heap used/committed;
- `renderer.info.memory.geometries`;
- textures;
- programs;
- render targets;
- active entity meshes;
- pooled capacities/live counts;
- event subscribers;
- timers/rAF owners;
- audio nodes;
- decoded asset cache entries.

Exercise:

- New Game → flight;
- Continue/load repeatedly;
- several sector transitions;
- dock/undock cycles;
- combat with VFX saturation;
- mining screen enter/exit;
- death/retry;
- WebGL context loss/restore if harnessed.

Every count must plateau. Monotonic growth without a designed cache bound is a leak until proven otherwise.

---

## 15. Workstream L — scheduling and frame pacing

A “cheap” task that runs in the wrong part of the frame can still hitch.

### Rules

- heavy admission/parse/upload work runs after a presented frame when it cannot be hidden behind loading;
- post-paint yield must actually cross paint, not merely enqueue another callback in the same frame;
- bounded work slices have both item and byte/time budgets;
- stale async jobs carry generation/ownership tokens and abort before commit;
- no giant catch-up loop after a frame hitch;
- background-tab return must clamp or reset timing safely;
- diagnostics should distinguish CPU work, GPU/driver wait, and external scheduling/descheduling.

PQ-129.19 already corrected one important post-paint scheduling defect; apply the same discipline to other admission queues.

---

## 16. Long-horizon architecture: Worker, WASM, WebGPU

These are valid options only after the current architecture is made cheap enough to know what remains.

### Simulation Worker

Prerequisite: a compact immutable snapshot/fence so rendering does not deep-copy live entity objects every frame.

Measure:

- serialization/copy cost;
- SharedArrayBuffer feasibility/security headers;
- input-to-sim latency;
- sim-to-present latency;
- deterministic save/replay behavior;
- debugging/complexity cost.

A Worker is worthwhile only if isolated sim CPU exceeds transfer/synchronization overhead by a healthy margin.

### Additional WASM/Rust islands

Rapier already occupies the obvious physics island. Additional WASM candidates need CPU profiles showing hot, numeric, data-oriented loops with low boundary traffic. Do not port object-heavy orchestration code simply because Rust is fast.

### WebGPU

Potential long-term benefits:

- lower submission overhead;
- compute-driven particles/culling;
- more explicit resource lifetime;
- indirect draws/compute pipelines.

Costs:

- backend divergence;
- shader/tooling rewrite;
- browser/device support and validation matrix;
- visual parity risk.

Treat as a backend program after draw/sim architecture is already clean, not as the next hitch fix.

---

## 17. Experiment matrix

| ID | Hypothesis | Minimal experiment | Required win | Automatic rejection |
|---|---|---|---|---|
| E1 | off-table AI/traffic is current dominant sim cost | central cadence tiers on one representative population | crowded sim p95 materially ↓, no behavior/visual change | hitch count ↑ or promotion latency visible |
| E2 | forced-awake physics is next sim pole | enable controlled sleep + wake-reason census | physics/sim p95 ↓ after E1 | missed collisions, delayed response |
| E3 | unique program keys cause first-new-ship hitch | normalize and collapse one measured material family | late program count/first-use hitch ↓ | extra program or visual divergence |
| E4 | unique ship draws dominate remaining GPU present | same-material batching on one family | CPU submit/GPU frame ↓ | overdraw/culling regression |
| E5 | dynamic buffers upload excess capacity | owner byte-range census + one owner fix | upload bytes and CPU time ↓ | corruption or synchronization stalls |
| E6 | asset construction causes residual long tasks | separate parse/build/admit/publish timings | named long task moves/vanishes | merely moves hitch into visible load shell |
| E7 | UI/radar repaint is a meaningful CPU slice | event/cadence one expensive static surface | UI frame slice ↓ | combat information lag |
| E8 | resource lifetime degrades long sessions | repeated transition soak | all resource counts plateau | monotonic growth |
| E9 | Worker can remove remaining sim pole | snapshot-fence prototype + copy benchmark | net main-thread win after transfer | transfer/sync consumes benefit |
| E10 | WebGPU lowers mature submission pole | representative backend prototype | substantial GPU/CPU frame win with parity | visual/backend complexity outweighs gain |

---

## 18. Benchmark protocol

### Representative scenarios

1. New Game opening.
2. Continue/load opening.
3. Quiet flight.
4. Crowded traffic.
5. Heavy combat/projectile/VFX load.
6. Mining playfield.
7. Sector transition.
8. Dock/undock.
9. 20-minute mixed soak.

### Required metrics

- frame interval p50/p95/p99/max;
- frames >16.7 / 32 / 50 / 100 ms;
- simFrame p50/p95/p99;
- presentation CPU buckets;
- GPU pass timings where disjoint timer queries are available;
- draw calls / triangles;
- program count and late-program events;
- geometry/texture/render-target deltas after warm boundaries;
- buffer upload bytes by owner;
- heap allocation rate and GC pauses;
- active/sleeping physics bodies;
- AI population by cadence tier;
- visual hash/capture identity where deterministic;
- gameplay/replay hash when simulation authority changes.

### A/B rules

- same backend, browser/Electron route, viewport, DPR, quality settings, seed, save, and input path;
- quiet machine or explicitly record contention;
- at least several matched runs for noisy headed data;
- no threshold loosening to make the candidate green;
- a lower p95 plus a worse max/hitch tail is not automatically a win;
- a headless-only win does not close a player-facing performance leaf.

---

## 19. CI/performance regression gates

Do not make CI depend on noisy absolute GPU milliseconds across heterogeneous runners. Split contracts:

### Deterministic structural gates

- no steady-frame render-target allocation;
- no late opening/Continue resource identity outside the declared cohort;
- no unbounded pool growth in deterministic stress scenarios;
- no forbidden full scans for specified indexed queries;
- no new per-frame production interval/timer ownership;
- replay hashes stable for presentation-only changes.

### Relative benchmark gates on pinned hardware

- fixed scene + seed + browser/backend;
- compare to retained baseline distribution;
- fail on statistically/operationally significant p95 or hitch-tail regression;
- store machine-readable report and traces.

---

## 20. Explicitly rejected shortcuts

Do **not** close this campaign by:

- lowering default render resolution, DPR, draw distance, texture resolution, LOD quality, particle count, population, projectile density, or shadow quality;
- disabling bloom, shadows, fog, reflections, post presentation, or authored VFX;
- reducing near-player AI/physics correctness cadence;
- substituting fallback/procedural junk for authored assets;
- increasing hitch thresholds;
- excluding slow frames from samples;
- preloading the entire game universe before play;
- moving a visible hitch into a frozen loading shell and calling it solved;
- rewriting the engine before measuring the existing remaining pole.

Adaptive quality remains a resilience feature for weak/software rendering. It is not a substitute for structural optimization.

---

## 21. Recommended execution order

### Immediate

1. **PQ-129.15: central off-table cadence / AI-traffic sleep.**
2. Re-run crowded headed witness.
3. If `simFrame p95 > 5 ms`, take **PQ-084 physics sleep**.
4. Re-run crowded headed witness.

### Conditional GPU work

5. If first-new-ship hitch remains: **PQ-129.13 program-lane/material-key collapse**.
6. If sim is ≤5 ms and crowded GPU/draw remains over budget: **PQ-129.12 same-material unique-hull batching**.
7. Then dynamic-buffer byte-volume and asset-construction long-task work based on current attribution.

### Architectural door

8. Snapshot fence.
9. Worker copy/synchronization benchmark.
10. Only then Worker/WASM islands/WebGPU if the measured remainder justifies them.

---

## 22. Definition of optimal for this game

“Optimal” is not the smallest frame time at any aesthetic cost. The target is:

- full authored picture preserved;
- crowded combat presentation at the intended frame budget on target hardware;
- `simFrame p95 ≤ 5 ms` on the owner reference route;
- steady present inside the 16.7 ms 60 Hz target where hardware permits;
- rare and attributable >32 ms frames rather than unexplained bricks;
- no first-use ship/material compile brick on normal routes;
- no asset pop-in caused by incomplete publication;
- stable resource counts over long sessions;
- deterministic simulation/replay preserved;
- every remaining expensive frame has a named owner and an explicit reason.

The fastest path to that state is not a rendering rewrite. It is to keep attacking the current pole, one causal owner at a time, while refusing to buy milliseconds with a cheaper-looking game.
