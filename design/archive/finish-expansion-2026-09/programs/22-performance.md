# SFQ-P22 — Smoothness, residency and predictable work

Full-quality play remains responsive through cold use, dense action, travel and long sessions.

**Disposition:** supporting source program, not an independently active queue. **Milestone band:** 1. **Existing owners to search:** Current PERF_BUDGET / VM_LANES / D24–D36 and existing performance owners.

## Baseline and uncertainty

This audit did not measure frame time. Existing logs describe historical latency and resource issues, some already fixed pending validation. First reproduce the current route and attribute the cost; do not copy old perf diagnoses as new facts.

Sources: [S01](../audit/SOURCES.md#s01), [S08](../audit/SOURCES.md#s08), [S14](../audit/SOURCES.md#s14), [S20](../audit/SOURCES.md#s20), [S21](../audit/SOURCES.md#s21), [S22](../audit/SOURCES.md#s22). Source pins do not establish current performance or visual quality.

## Candidate owner paths

- `src/core/registry.js`
- `src/core/loop.js`
- `src/core/perfRuntime.js`
- `src/render/renderer.js`
- `src/render/precompile.js`
- `src/render/assetLoader.js`

These are owner neighborhoods; some are directly inspected and others are routed/inferred from repository maps or prior source context. Resolve the exact live selected function/file before activation. Do not create a missing path just to conform to a plan.

## Build-plan candidates

| Local ID | Work | Player outcome |
| --- | --- | --- |
| [SFQ-B211](../builds/SFQ-B211.md) | Attribute the worst visible hitch | A real frame stall has a named CPU, GPU, asset or scheduling cause. |
| [SFQ-B212](../builds/SFQ-B212.md) | Warm actual first-use assets | The first weapon, fauna or wave does not compile/upload unexpectedly during its action. |
| [SFQ-B213](../builds/SFQ-B213.md) | Bound dense simulation work | Local complexity scales with relevant nearby actors rather than all entities or all pairs. |
| [SFQ-B214](../builds/SFQ-B214.md) | Control hot-path allocation | Repeated flight/combat frames do not create avoidable garbage bursts. |
| [SFQ-B215](../builds/SFQ-B215.md) | Reduce rendering submission cost honestly | Material reuse, batching and visibility lower work while preserving the picture. |
| [SFQ-B216](../builds/SFQ-B216.md) | Make state-driven UI quiet | Unchanged UI does not redo layout or write DOM on every simulation tick. |
| [SFQ-B217](../builds/SFQ-B217.md) | Close asset lifetime leaks | Repeated travel/load/refit does not retain dead generations or GPU resources. |
| [SFQ-B218](../builds/SFQ-B218.md) | Handle contention and context failure gracefully | Resource failure gives a recoverable state rather than an indefinite frozen-looking screen. |
| [SFQ-B219](../builds/SFQ-B219.md) | Budget new content before multiplying it | Each admitted family has measured marginal scene cost and bounded counts. |
| [SFQ-B220](../builds/SFQ-B220.md) | Verify sustained full-quality play | The selected reference build survives repeated loops on declared minimum and target hardware. |

## Directed INFERENCE candidates

| Local ID | Bounded change | Done when |
| --- | --- | --- |
| [SFQ-I085](../inference/SFQ-I085.md) | Empty effect owner takes its quiet path | No active output changes and the measured empty cost drops. |
| [SFQ-I086](../inference/SFQ-I086.md) | One shared material is not reallocated | Identity and disposal remain correct under multiple instances. |
| [SFQ-I087](../inference/SFQ-I087.md) | Cancelled load releases its own handle | A later valid load still succeeds and cancelled resources are collectible. |
| [SFQ-I088](../inference/SFQ-I088.md) | UI label only writes when changed | Actual value changes remain immediate. |

## Playable scenes

- [M36 — The universe keeps working](../missions/M36.md): CORE FINISH ROUTE / composite acceptance, not a new mission

## Required working method

[Admit into current owners](../integration/01_ADMISSION_AND_CROSSWALK.md), then use the [build-worker loop](../workflows/03_BUILD_WORKER.md) and [independent review](../workflows/08_INDEPENDENT_REVIEW.md). Uncertain design belongs in a [strong-agent campaign](../workflows/02_STRONG_AGENT_DESIGN.md), not a weak worker’s imagination.

Each selected feature needs real input, authoritative behavior, complete presentation and persistence. It is legal to finish this program’s useful core while cutting/defering optional proposals. The full candidate count is not a production quota.
