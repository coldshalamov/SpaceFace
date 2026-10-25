# 09 — Performance, deterministic lifecycles, and honest degradation

**Outcome:** the combined combat experience is responsive and stays within the repository's existing performance contract without quietly making the game uglier, less physical, or less fair. Planning only. Evidence: E12/E13/E14. Research: R06. This packet starts with baseline measurement and participates in every implementation wave; it is not a cleanup phase after features multiply.

## Establish the actual baseline

Follow the current quiet-host/capture rules and existing profiler. Use the exact source revision, actual production route, recorded inputs, known scene, fixed camera, supported device, window resolution, and default quality settings. Retain enough information to reproduce the run. A software-rendered fixture can validate shaders or lifecycle logic but cannot certify the user's GPU performance.

The inspected `design/PERF_BUDGET.md` sets a desktop target of 16.7 ms and a low-end floor of 33.3 ms. Its category budgets are 5.0 ms simulation, 7.0 ms rendering, 2.5 ms VFX, 1.2 ms UI, and 1.0 ms headroom. These are existing contract values, not measurements from this planning session. Re-read the current contract before adopting them. Do not treat a 30 fps profile as permission to run gameplay sensing or physics at an arbitrary lower frequency.

Measure the whole frame and relevant phases. CPU and GPU work can overlap, so do not add unrelated percentile values and call the result a measured frame. Include p50/p95/p99, the existing >32 ms hitch count, input-to-visible-response latency, simulation backlog/catch-up shedding, GPU timings where supported, allocations/GC, draw calls, shader programs, active physical bodies, contact/query cost, and persistent memory after repeated encounters.

The fixed-step loop can shed excessive backlog. A good FPS number is not a win if simulation time falls behind, warnings become late, or the player's controls are delayed. Report simulated time versus wall time and sensor/decision age under load alongside frame time.

## Stress the actual combinations

Measure quiet baseline, a typical mixed-role fight, dense swarm, simultaneous destruction, heavy physical manipulation, multiple shield contacts, and stealth under competing world load. Use CEC-B/C/D/E/F rather than isolated particle benchmarks alone.

A density sweep may begin at prototype bands such as 32/96/192 relevant combat actors, but these are experimental inputs, not claims that the game presently supports those counts. First record the actual intended production population and existing director limits. Vary enemies, projectiles, loose bodies, and overlapping effects separately, then combine the worst relevant cases. The highest entity count is not automatically the most expensive scene.

Include cold first-use effects and warm steady-state behavior. A pool that looks efficient after a private warm-up can still hitch when the ordinary player first uses Gyre or kills a new enemy family. Required warm-up belongs in the existing admission pipeline, not an undocumented developer sequence.

## Remove wasted work before visible quality

The existing contract forbids default fixes that reduce render scale, particle quality, bloom/shadows, or physical fidelity merely to pass a performance gate. Preserve that policy. Compare the same default picture and behavior. Optional player-selected lower settings remain legitimate accessibility/hardware choices, not evidence of a quality-preserving optimization.

Prioritize redundant entity scans, allocations, stale derived-index rebuilds, unnecessary DOM work, repeated material/shader variants, excessive transparent overdraw, avoidable collision pairs, and expensive work on inactive systems. Reuse the existing spatial queries and typed views; do not let every new pylon, awareness badge, and effect walk the entire world independently.

A large visual population does not require every decorative shard to be a gameplay body. Keep important physical fragments and their mass/custody truthful, and render cosmetic detail cheaply around them. Conversely, do not demote a dangerous launched core or a visible collidable wreck into a harmless particle just because a pool is full.

## Simulation and AI scheduling

Maintain the existing fixed simulation and actuation authority. High-level strategic decisions, low-urgency contact refresh, and presentation can use bounded cadences with explicit age limits. Close collision avoidance, committed attacks, player control, and relevant physical integration cannot simply be skipped while their visuals continue.

Use dirty/versioned state for expensive projections. Stable squad membership and role assignment should not be recalculated from scratch every frame. A cached firing decision must be revalidated against current death, concealment, authorization, and obstruction before it can cause damage.

Budget physical cascades by lineage and finite resources. A chain event can have bounded descendants and deterministic ordering without silently deleting accepted damage or duplicating resource transfer. If effects must be deferred, preserve their physical time semantics and make delays small enough not to change the advertised outcome. Do not spread a supposedly simultaneous explosion over seconds merely to flatten a graph.

Offscreen rendering can be culled. Offscreen bodies that can imminently hit the player, carry valuable custody, or affect an ongoing search cannot lose their gameplay consequences. Follow the existing world-residency contracts and explicitly test transitions between far and near simulation.

## Rendering and VFX

Reuse bounded pools, instancing, shared materials, and existing asset/LOD policy. Warm necessary shader combinations before the actual event. Avoid changing physical light counts during ordinary source churn. Do not allocate render targets or textures per effect or rebuild a whole scene graph per hit.

Measure transparent pixel coverage as well as particle count. Several large soft smoke layers can cost more than many small opaque fragments. Reduce unnecessary overlap, use authored temporal envelopes, and exploit depth/occlusion appropriately while preserving the intended effect. Any reduced-resolution internal pass must demonstrate matching default visual quality and fit the current renderer policy; it is not an automatic license to downscale the game.

Allocate salience and resources with stable priorities so effects do not flicker as they exchange slots. Mandatory information—an incoming attack footprint, target identity, active shield geometry, and control-loss state—must survive cosmetic saturation. Cosmetic exhaust wisps and redundant sparks can yield first. This is a bounded content policy, not permission to remove all explosions during the most exciting moment.

No new shader/material explosion should arise from every damage, team, or awareness combination. Keep semantic variations in existing data/uniform pathways when possible. Reuse the current Look and lighting ownership, including any landed NOCTURNE changes after a fresh audit.

## UI cost is gameplay cost

Do not create a permanent DOM panel for every entity. Project only relevant contacts, pool transient marks, update semantic state on changes, and move screen-space markers with compositor-friendly transforms. Avoid layout reads/writes that force synchronous reflow during aiming.

Hidden screens should actually stop expensive work. Tooltips and inspect surfaces do not need their own continuous animation loop. Reuse current UI sleep, token, event, and input ownership contracts. A more informative HUD must not make aiming or holding a power feel delayed.

## Lifecycle ownership matrix

For each new or revised relationship, name the existing authoritative owner and prove teardown. Proposed categories below describe obligations, not new duplicate stores.

| Fact/relationship | Authoritative persistence decision | Presentation obligation |
|---|---|---|
| Player selection/effective gun target | Current input/gunnery identity and invalidation policy | Retire stale brackets; never write a hidden replacement target |
| Observer suspicion/last fix | Existing perception runtime plus only justified durable alarm facts | Show current known state; no omniscient reconstruction |
| Cloak charge/reveal | Existing cloak/save policy, reviewed for raid exploits | Restore a truthful active/depleted/revealed indication |
| Captured aggregate/member transaction | One physical/custody representation, explicitly saved or safely resolved | Rebuild the core/lumps without re-consuming members |
| Pylon pair/charge/attachment | Existing deployable/physics/save owners with generation-safe endpoints | No orphan panel after teardown; context loss cannot change blocking |
| Incapacitated/dying ship | Damage/status/aftermath owner; one kill and successor transition | Visual recovery/death tracks real state, never repeats reward events |
| Loot and broken world structure | Existing cargo/economy/durable world identity | No reset that refills an emptied cache or restores consumed mass |
| Pure sparks, glow, smoke detail | Cosmetic lifetime, not authoritative save state | Bounded retirement/rebuild; no references to destroyed actors |

Exercise pause/resume, new game, death, docking, sector exit/entry, floating-origin rebase, Continue, entity-ID reuse, tab backgrounding, resize, device-input interruption, context loss, and disposal. Use actual production ownership transitions, not a fixture that manually clears everything and thereby hides cleanup defects.

## Evidence and closure

Before/after runs use the same machine class, scenario, source-defined settings, and input tape. Interleave baseline/candidate samples where practical to reduce temperature and load bias. Report variability and retained failures; an isolated fastest run is not representative.

Acceptance needs the complete normal-route experience within the current budget and no material regressions in input latency, warning timing, simulation progress, memory recovery, or visual readability. Where hardware access is unavailable, deliver verified narrow logic/performance diagnostics and a precise quiet-host requisition. Do not label target-device acceptance passed from a headless or software-GL result.

This planning PR contains no benchmark result. The implementation lead must attach actual measurements and the remaining unverified claims to each affected packet.
