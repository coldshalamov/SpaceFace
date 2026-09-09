<!-- LIFETIME: STABLE -->
# Systematic smoothness program

Durable route for making SpaceFace hold vsync on the target Intel iGPU without
changing the default picture. This file is plan-route and outcome law. It does
not hold a queue snapshot, branch name, or cycle ledger.

Companion to [`PERF_BUDGET.md`](./PERF_BUDGET.md),
[`CANONICAL_BUILD_MAP.md`](../CANONICAL_BUILD_MAP.md) §8.1 / §8.2, and the
exhaustive reserved catalog [`PERF_OPTION_SPACE.md`](./PERF_OPTION_SPACE.md).

## Stop conditions

Work is not finished until both are true on a matched same-route capture:

- **A / 2×:** crowded or stimulus p95 frame time is ≤ half the frozen baseline
  or already ≤16.7 ms, **and** hitch count (frames >32 ms) is ≤ half the
  baseline, with no frozen 3D picture behind a live HUD.
- **B / 5× or exhausted workflow:** hitch count ≤ one-fifth of baseline (and
  p95 ≤ one-fifth or already vsync-locked), **or** the review→plan→implement→
  verify workflow has been run five times without reaching that 5× hitch cut.

On this class of machine an empty present is already vsync-locked. 5× is
therefore hitch / p99 / lock-up reduction, not unlocked 120 Hz.

## Picture contract

Default `renderScale`, `pixelRatioCap`, bloom, shadows, particles, draw
distance, population, and near-field authored mesh stay on. On-screen authored
ships and stations stay submitted. Only true off-screen query-hidden roots may
drop. A timer win that empties the sky is a failed cycle.

## Tradeoff board (choose by measured pole)

| Approach | What it buys | What it must not do | When it is the next job |
|---|---|---|---|
| **Submit collapse** | Fewer driver draws on Intel. Material-keyed instance/BatchedMesh, one shadow-caster set. | Change near materials, hide on-screen roots, or drop bloom/shadows. | Crowded p95 is 33 ms while idle vsync is 16.7 and `webgl-submit-noop` still proves GPU submit. |
| **Admission slicing** | Opening and first-use compile/upload no longer occupy one display callback. | Skip shaders, raise timeouts, or move the stall into Continue. | Worst-frame is hundreds of ms after playable, or combat/traffic first-use hitches. |
| **Cadence / sleep** | Inactive AI, traffic, and remote owners stop paying 60 Hz. | Touch input, flight, weapons, collisions, or required physics authority. | Sim p95 misses its 5 ms budget while GPU present is already cheap. |
| **Residency / transport** | Warm boot and repeat sector entry reuse bytes; long sessions plateau. | Evict/reload thrash or decode a monolith before the first useful frame. | Boot/Continue re-transfers release GLB/KTX2, or travel grows GPU memory. |
| **Present fusion** | Pay once for AA and the HDR composite. | Add a depth prepass, promote the unused render graph, or clamp resolution. | Canvas MSAA or extra fullscreen passes are dead work behind the bloom present. |
| **Conditional platform** | Worker, WebGPU, or native only after the web structural families above are exhausted. | Use a port to skip unfinished batching, LOD, admission, or scheduling. | Repeated quiet-machine p99 stays beyond the ceiling after those families. |

## Packet outcomes (map identities)

Execute in outcome order from [`CANONICAL_BUILD_MAP.md`](../CANONICAL_BUILD_MAP.md) §8.1:

`PQ-051` frame liveness → `PQ-052` rigid opaque batching → `PQ-053` live LOD/HLOD
→ `PQ-054` bounded GPU admission → `PQ-055` immutable asset transport →
`PQ-042` then `PQ-056` present/AA → `PQ-057` activity scheduler (decides
`PQ-043`) → `PQ-058` resource governor. `PQ-044` decides `PQ-059`. `PQ-060` is
the final native trigger.

A packet closes on the player outcome in that table, not on counter volume.

## Cycle law

Each cycle: measure the live pole → pick one row from the tradeoff board →
implement with shipped tests of the real functions → matched A/B that keeps
on-screen submit counts honest → keep or revert the slice. Do not stack a
second approach until the first has a same-route receipt.

When the owner names hitching, execute through admitted [`PQ-129`](../program/roadmap/active/PQ-129.md)
and [`PERF_HITCH_CAMPAIGN.md`](../program/PERF_HITCH_CAMPAIGN.md). That campaign consumes
reserved `PQ-061`–`PQ-128` identities. It does not replace this file's picture contract.
