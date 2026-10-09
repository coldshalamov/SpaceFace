You are a wave-121 INDEPENDENT GLOBAL BOTTLENECK reviewer for the repo coldshalamov/SpaceFace — a Three.js space game (browser + Electron). This is audit-only: DO NOT write code, open PRs, or run the app. You may run node-level micro-benchmarks for modules that import headlessly (one node process at a time: /c/hostedtoolcache/node/24.0.1/x64/node).

CHECKOUT: work on branch `devin/1791504143-perf-w120` — pull latest and audit HEAD (31352a672 or later).

This is a BLIND review by design: you are intentionally NOT given the history of proposed optimizations or their conclusions. ~120 waves of pacing/caching/dedup work have landed — do not assume any of it is correct, sufficient, or pointed at the right bottlenecks. Diagnose from the source and the measurement artifacts.

THE BAR: the frame the player sees almost never shows LOD stand-ins instead of real models; nothing pops into existence late; no hitching; no frozen loading screens; nothing loads other than what the visible frame needs — everything else is lightweight sim until it comes on-stage.

HARD CONTRACTS: zero visible quality degradation (no removing authored visuals, no lowering default quality); sim determinism bit-identical (golden hash 0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1 via node scripts/sf-sim.mjs inspect --scenario 47a).

ENVIRONMENT: Windows Server 2022, Git Bash, no Python, no rg (use grep). SwiftShader software GL — never draw GPU-cost conclusions from wall timings; the game presents 0 frames under Electron here, so frame-time measurement is unavailable. Tag GPU conclusions 'hardware-unverified'.

READ FIRST: design/perf/scoreboard.json (the cumulative ledger + owner-side benchmark commands), design/perf/PERF_W4_CLOSURE_2026-09-29.md, design/perf/HILLCLIMB-LOG.md.

YOUR DELIVERABLES (all required):
1. Ranked list of the LARGEST remaining sources of latency, frame-time variance, and CPU/GPU cost — from your own read of the code, not the wave history. Each: file:line evidence, mechanism, size estimate, evidence level (MECHANISM_VERIFIED / PERFORMANCE_VERIFIED / UNVERIFIED / hardware-unverified).
2. The campaign's four standing lanes are: lod-in-frame (stand-ins in frame), popin-admission (late pop-in), boot-loading (loading stalls), in-flight-hitches (long frames). For each of your top bottlenecks: state whether those lanes are attacking it effectively, partially, or missing it entirely.
3. At least THREE meaningfully different approaches to the worst bottleneck(s), including architectural ones when appropriate. Explicitly consider and adjudicate: data-oriented simulation, instancing/batching restructuring, GPU pipeline restructuring, reducing shader-program diversity, off-thread preparation, simulation workers, alternative rendering backends.
4. Inspect the existing branch `devin/s1-sim-worker-spike` (git show/log/diff it — do not check it out destructively): what does it explore, is it relevant to the current limiting workloads, and should it be pursued, mined, or abandoned? Do not assume it must be integrated.
5. Rejected-approach reconsideration: list any approaches the docs mark REJECTED/GATED/WONTFIX that deserve a fresh look because the engine or workload has since changed.
6. `saturated: true|false` — true only if the representative game is provably fast on declared hardware and no material evidence-supported optimization remains. Declare which parts of your review are hardware-blocked.