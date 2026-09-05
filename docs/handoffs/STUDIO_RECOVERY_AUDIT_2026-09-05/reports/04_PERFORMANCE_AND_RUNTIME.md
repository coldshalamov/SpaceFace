# 04 — Performance: recover responsiveness without degrading the intended game
## A measurement strategy tied to player experience

Performance is a product constraint here, not an optimization milestone at the end. Fast physical interaction stops being enjoyable when input feels old, distant objects consume every tick, or a new effect stalls the first important fight. The current repository already contains substantial performance work: separated simulation/presentation runners, activity scheduling, CCD gating, projectile-body reuse, post-processing simplification, and lifecycle-aware presentation. A recovery effort that proposes these as absent would be starting from an obsolete diagnosis. [LOOP] [SIM] [PRESENT] [SCHEDULER] [PHYSICS] [BLOOM]

**This audit does not establish the current dominant bottleneck.** It establishes what is already present, identifies structural risk areas, and specifies how to choose the next optimization without reliving failed campaigns. Historical frame times in repository reports are not measurements from this session.

## 4.1 Define the performance contract in the player's terms

Use a named device class, resolution, rendering preset, and display cadence. My proposed primary target is a stable 60-Hz presentation on an explicitly selected baseline machine at the supported default resolution; a second, lower-end profile should have its own honest target. The repository evidence does not justify inventing a minimum GPU specification here. Choose it from hardware the development process can actually exercise.

Track four separate qualities. **Pacing** is the distribution of displayed-frame intervals, including long tails. **Response** is the age of the input and simulation state when a frame is displayed. **Continuity** is the absence of conspicuous stalls during entry, first use, mode transition, and saving. **Fidelity** is the amount of intended gameplay and visual information that remains present under the chosen budget.

A mean frame rate does not prove any of the other three. Nor does a low p95 prove that a rare multi-second stall is gone. Report p50/p95/p99, maximum, threshold exceedances, and the route locations of the longest frames. Keep the entire foreground trace so a reviewer can see whether a percentile was improved by changing the run's composition.

Do not add phase p95s together. The 95th-percentile simulation frame and 95th-percentile renderer frame may be different frames. Analyze complete-frame timing and correlated phase samples. The included `frameAudit.mjs` keeps those distributions separate and reports excluded lifecycle samples explicitly.

## 4.2 What the current loop already does

The simulation runner uses fixed steps and an ordinary four-step catch-up ceiling, with explicit backlog shedding. The presentation runner distinguishes visibility/lifecycle states, bounds long elapsed intervals, and includes a reduced catch-up recovery behavior after a late presentation. This is already a considered overload policy. [SIM] [PRESENT]

Do not present it as an optimization that makes work disappear for free. Dropping debt means fewer simulated steps occur than an unrestricted wall-clock catch-up would have executed. That can be the right decision for responsiveness, but the result must report shed simulated time and input age. A “smooth” frame that repeatedly skips world progress is not equivalent to a frame in which the world ran on budget.

The split into simulation and presentation modules is not, by itself, multithreading. Both can still consume the main thread. Likewise, a metadata digest in the tick queue is not a complete deterministic state hash. Use the actual replay/state machinery when making a determinism claim; do not infer it from a field with a reassuring name. [SIM] [PRESENT]

## 4.3 Build one trustworthy route matrix, not another benchmark framework

Extend existing capture and laboratory tools with a small route matrix:

| Route | What it exposes | Evidence that matters |
|---|---|---|
| Cold ordinary opening | Asset decode, shader/pipeline creation, GPU upload, first UI and first input | Time to controllable frame; longest foreground gaps; upload/compile tasks attributed |
| Warm dense combat | Simulation cost, body/collider activity, particles, material submission, HUD churn | Complete-frame trace with correlated CPU/GPU samples and effect counts |
| Fast earned-speed traversal | Streaming/admission, collider horizon, camera-dependent visibility | Input age, missed presents, admission work, collision continuity |
| Swarm after sustained play | Wreck/debris retention, pool high-water marks, replacement bursts | Residency and live-count plateaus, not only a short opening sample |
| Dock, refit, undock | Preview renderer and main renderer handoff, UI allocation, shader reuse | Transition stalls and release/reuse accounting |
| Enter and leave Asteroid Works | Shared post path, alternate scene resources, input handoff | Frame continuity, retained resources, modal input correctness |
| Save/reload at a busy site | Serialization, restoration, exactly-once operations, rebuild bursts | Save latency, round-trip state, duplicated work, first-use hitch after restore |

The existing Swarm arena already has explicit debris and wreck-retention policies. Its historical comments describe a prior growth problem; they do not prove that the current policy still leaks. Run a sustained route to test plateau behavior. [SWARMARENA]

Every comparison names the commit, profile, physics backend, route revision, seed, input tape, player hull/fittings, asset configuration, device, browser/runtime build, display rate, resolution, quality settings, foreground state, and cold/warm condition. A candidate can intentionally change assets or code, but the change must be visible in the manifest rather than smuggled into an allegedly identical comparison.

## 4.4 Separate CPU wall time from GPU execution

A `performance.now()` bracket around render submission measures elapsed CPU-side time, potentially including browser/driver waits. It does not directly report how long the GPU spent drawing the frame. The current presentation code contains such timing brackets, so labels and conclusions must preserve that distinction. [PRESENT]

Use asynchronous timer queries where the runtime supports them; collect a result only after it becomes available and discard disjoint samples. The WebGL and WebGL2 extension names/APIs differ, and availability must be checked. Do not block on a query to measure a stall, and do not treat unavailable GPU data as zero GPU cost. [GPUTIMER]

Then distinguish cases rather than guessing. High simulation time with modest submission and GPU time suggests simulation work. High renderer CPU time with modest GPU time suggests scene traversal, material/state submission, or driver work. High GPU time with modest CPU submission suggests shading, fill, bandwidth, geometry, or post-processing. A large end-to-end gap with neither instrument explaining it requires browser/OS/GC/compile investigation, not a random draw-call patch.

The historical performance campaign includes dramatic shadow and prewarm results. One operator document still names work another document marks shipped. Preserve those as experiment history, not a permanent ranking of bottlenecks. A prewarm strategy that increased entry latency should not be automatically repeated because “prewarm” sounds like a universal cure. [PERFCAMPAIGN] [PERFORDER]

## 4.5 Simulation admission: preserve causality while avoiding full-world ticking

The activity-tier scheduler already provides staggered or sleeping behavior for distant tiers, with active/pinned exceptions. The unanswered question is whether each expensive consumer honors the intended tier and whether the tier contains every dependency that can affect the current fight. [SCHEDULER]

A visible object is not the complete active set. A tethered off-screen body, an incoming projectile, a pursuing ship, a connected industrial transfer, or a structure whose failure affects a visible machine may need to remain active. Conversely, a visible distant decorative ship may not require the same tactical cognition as a nearby attacker.

Use a **dependency-closed active set**: begin with player-relevant bodies and pending interactions, then include linked bodies and near-future collision candidates. Apply different policies to physical integration, tactical decisions, strategic jobs, and rendering. A lower-rate AI decision loop does not mean a moving body should skip collision integration. A virtual economic job does not need a rendered ship, but it must preserve identity, cargo, progress, and pending outcomes.

The NPC job adapter already provides a strong foundation: a pure job kernel, stable record links, materialized and virtual paths, and a bounded elapsed-time advance. Reuse that pattern. Verify actual arrival and custody before granting a delivery; an ideal route clock and a physically delayed hull are not necessarily at the same place. [JOBS]

The general principle is **nearby causes are resolved physically; remote processes advance coherently at an appropriate abstraction**. Do not require every rock in every sector to be stepped at 60 Hz. Do not freeze all off-screen state and call it optimization either.

## 4.6 Sleeping is not a one-line fix

The current dynamic-body creation explicitly calls `setCanSleep(false)`. Its stated reason is that save/reload reconstructs bodies from authoritative pose and velocity rather than preserving all hidden solver/sleep state, and attachments need stable replay behavior. This is a confirmed code choice, not a guess from an old report. [PHYSICS]

Rapier's sleeping mechanism can skip integration of inactive bodies and provides explicit and interaction-driven wake behavior. That makes selective sleeping worth investigating, but not safe to enable blindly. [SLEEP]

Several surrounding details matter. The wrapper loops over dynamic records to consume commands, apply springs, capture expected motion, correct contacts, and publish state. Those JavaScript loops still cost time even if Rapier integrates fewer bodies. Reeled attachments can trigger per-step canonicalization with body setters that request waking. Force-reset and synchronization policies may also defeat a naive sleep change. [PHYSICS]

A bounded experiment should begin with unconnected, genuinely inactive bodies, not the player's taut rope. Record sleep state as needed for the chosen restore contract, define wake conditions for impulses, nearby interactions, reattachment, relocation, and materialization, and compare save/reload and replay results. Ensure the wrapper can skip appropriate inactive work without dropping required commands.

The code quantizes selected reeled-body state to a fine lattice for replay stability. That is not a general proof of cross-platform determinism. Rapier's official guarantees depend on the same version, matching initialization and insertion order; JavaScript transcendental calculations can also affect equality across platforms. Decide whether a test requires bit identity, stable event order, or bounded physical equivalence, and use the right proof. [PHYSICS] [DETERMINISM]

## 4.7 Specific code-level performance hypotheses

These are inspection-led hypotheses, not measured bottlenecks.

**Attachment incidence lookup.** The inspected `_hasManualSpringAttachment` checks attachments while iterating bodies. At large body and attachment counts that can become proportional to their product. An incrementally maintained body-to-attachment adjacency index could make incidence lookup proportional to actual degree. The index must invalidate on attach, cut, body replacement, entity rematerialization, and restore. Measure before implementing; a tiny attachment count may make the present approach cheaper overall. [PHYSICS]

**Per-tick normalization/allocation.** Some pure propulsion and presentation paths construct objects. That is not automatically a problem. Use allocation sampling and GC-correlated frame traces before converting every helper into mutable scratch state. Scratch reuse can reduce allocation but also introduce aliasing bugs and nondeterministic consumption if ownership is unclear. [FLIGHT] [PRESENT]

**Body churn.** Ghost projectile bodies are already pooled, and some mass-only changes update existing body properties instead of recreating the body. Preserve those paths. Investigate remaining rebuild bursts by reason and high-water mark instead of adding a second generic pool that retains objects forever. [PHYSICS]

**Presentation journaling.** Determine which paths still rebuild or scan entity lists and which consume change journals. Do not assume every journal is incremental merely because the type exists. Track inspected entities per frame separately from visible entities and submitted draws. [PRESENT]

**Save and restore bursts.** Test serialization size, synchronous work, restore ordering, and admission after restoration. The existence of a hitch near saving is not proof that JSON serialization is its cause; asset recreation and first-use work can coincide. The historical campaign already warns against treating autosave as the primary pole without evidence. [PERFCAMPAIGN]

## 4.8 Rendering and assets: spend cost where the camera can perceive it

Batch by compatible material, spatial cell, and useful LOD range. A giant batch can reduce draw calls while weakening culling and increasing the number of invisible vertices processed. A large number of material variants can eliminate the benefit of otherwise similar geometry. Track submitted draws, material/pipeline changes, visible instances, and GPU time together.

Three.js provides batching for different geometries sharing material behavior, including per-object culling support in its current API. Verify the repository's actual revision before adopting that API, and benchmark the intended scene. The recommendation is a batching strategy, not a promise that a current documentation example is a compatible drop-in. [THREEBATCH]

Choose geometry and texture detail by projected size at the supported camera distances. The existing asset standard already says this; enforce it before commissioning more micro-detail. Bake or merge detail that does not need independent animation, interaction, damage, or material response. Keep identifiable tools, silhouette breaks, and meaningful mount changes. [ASSETLAW]

For long trails, use bounded world-space history buffers and shared material families. A bright ribbon can communicate speed without a long chain of separately allocated meshes and lights. Bound overdraw and temporal retention without shortening every distinctive trail into a generic spark. The visual target and implementation budget should be approved together, not traded away silently.

The current bloom path already has a compact multi-scale pipeline and shared presentation composition. Profile it before replacing it. Likewise, separate “revise the style because the owner changed the brief” from “lower fidelity to hide a performance problem.” An approved matte, emissive style can cost less and look better; turning off defining effects behind a quality flag does not establish that outcome. [BLOOM] [VFXLAW]

## 4.9 Workers and engine replacement are later decisions

Move simulation to a worker only when measurements show a substantial main-thread simulation bottleneck after bounded local work, and when the ownership/snapshot boundary is ready. Account for input transfer, snapshot latency, serialization or shared-memory synchronization, error reporting, deterministic timing, and the extra frame of state age an incautious pipeline can introduce.

The existing module split helps architecture, but it is not a completed worker boundary. A worker is not useful when the actual bottleneck is GPU shading or asset upload on the rendering thread. An engine replacement would also reopen assets, controls, save migration, physics feel, and tooling simultaneously. Neither should be the studio's default recovery plan. [LOOP] [SIM] [PRESENT]

The first performance milestone is a trustworthy route comparison that identifies one dominant cause and removes or bounds it without damaging the physical game. The second is sustained behavior under realistic play. A green microbenchmark by itself is not either milestone.

<!-- Source links are pinned to the audited commit. -->
[LOOP]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/loop.js#L1-L220
[SIM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/simulationRunner.js#L1-L220
[PRESENT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/presentationRunner.js
[FLIGHT]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/flight/propulsionKernel.js
[PHYSICS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/sg02DynamicBodyOwner.js
[PERFCAMPAIGN]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/PERF_HITCH_CAMPAIGN.md#L1-L200
[PERFORDER]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/design/program/PERF_WHAT_MATTERS.md
[SCHEDULER]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/core/activityScheduler.js#L1-L210
[JOBS]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/npcJobsRuntime.js#L1-L195
[BLOOM]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/render/bloom.js#L1-L190
[VFXLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VFX_TECHNIQUE_STANDARD.md#L1-L145
[ASSETLAW]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/docs/visual-assets/VISUAL_ASSET_PRODUCTION_STANDARD.md#L1-L140
[THREEBATCH]: https://threejs.org/docs/pages/BatchedMesh.html
[GPUTIMER]: https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query
[SLEEP]: https://rapier.rs/docs/user_guides/javascript/rigid_body_sleeping/
[DETERMINISM]: https://rapier.rs/docs/user_guides/javascript/determinism/
[SWARMARENA]: https://github.com/coldshalamov/SpaceFace/blob/571659e86d892022e2dfa118f058bdcdd0c96eed/src/systems/swarmArena.js#L1-L175
