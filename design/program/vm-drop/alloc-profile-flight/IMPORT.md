## What it is

Heap/allocation sampling report for SpaceFace flight on the quiet soft-GPU VM: settled ~60 s held thrust plus New Game→load→early-flight, matched to `cpu-profile-flight` windows. CDP `HeapProfiler.startSampling` via `scripts/probe-runtime-witness.mjs`.

## Live path that would receive it later

None wired. Optional later import: paste tables into `design/perf/` or a roadmap perf note. Do not treat sampled MB as live-heap MB.

## What was not wired

- No game code, scripts, or `VM_LANES.md` edits.
- No Chrome `.heapprofile` / heapsnapshot file (stock probe only emits `allocProfile` top-25 in `report.json`).
- No `clinic` / `0x` / memlab flight scenario.
- No merge to master.
