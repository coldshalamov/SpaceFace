# Performance Modernization Progress

Read this file first after every compaction. Append one line after each packet commit; do not rediscover completed packets.

- 2026-07-28 | PERF-00–04 | DONE through `75238d15` | equivalence, lifecycle, scheduler seam, offline compiler, and dense PresentationWorld committed | next: PERF-05
- 2026-07-28 | PERF-05 / PQ-039 | DONE at `bfb189b4` | deterministic batched NPC hostile queries committed and pushed; broker acceptance pending | next: PERF-06
- 2026-07-28 | PERF-06 / PQ-040 | DONE at `8db096b7` | scene-owned dirty GPU ranges for combat sprites and trail streaks committed and pushed; broker acceptance pending | next: PERF-07
- 2026-07-28 | PERF-07 / PQ-041 | DONE at `03e85514` | Electron 43.2 runtime, hardened shell, explicit provisioning, and production package allowlist committed and pushed; native broker/exact packaged-startup acceptance pending | next: PERF-08
- 2026-07-28 | PERF-C01 | DONE at `97dbdf01` | HLOD canopy/shadow policy now refreshes on LOD or hierarchy transitions instead of recursively traversing unchanged visible roots every frame; focused render tests, bundle gate, and baseline 10/10 green; no live speed claim | next: rank offline continuation packets while PERF-08 awaits clean broker evidence
