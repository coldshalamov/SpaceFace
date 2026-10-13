# Wide push performance record — 2026-10-13

Machine: Intel Core Ultra 7 155U (integrated GPU), 14 logical cores, Windows 11, the owner's Chrome and other
agents running alongside (25-75% host busy during most runs). Every number below names its instrument. Whole-run
fps from separate launches swings 10-45 on this host; the numbers that hold are main-thread self time by function
(independent of GPU contention) and within-session A/B blocks.

## Instruments added (all in `scripts/`)

| Instrument | What it answers |
|---|---|
| `probe-main-thread-profile.mjs --from-launch` | Launch click to flight, per phase: busy/JS/native/idle, long tasks, loading-screen smoothness (rAF cadence, long animation frames named by script, video drops), link waits, opening cook ledger |
| `... --trace` | A Chrome timeline summarised per phase (`UpdateLayoutTree`, GL command-buffer waits, microtask checkpoints) |
| `... --crucible --settle-ms=N` | The same steady-flight profile for the swarm mode (seed 4242, drafts auto-answered) |
| `... --gpu-timers` | Per-pass GPU time (bloomScene, downsample, composite) from the capability-gated timer queries |
| `... --eval-file=<expr.js>` | Runs one page expression in the settled flight and saves its result: the way to A/B inside one session (rotate modes in blocks) |
| `probe-smooth-flight.mjs [--crucible]` | rAF fps, p50/p95/p99, hitch classifier, link placement, cook ledger for a 30 s window |

## Results (before -> after, same instrument)

| Change | Evidence |
|---|---|
| Dispose-registration probe finishes in one render (was ~8 per second in flight) | open-flight fps 18.6 -> 39.9 (opening included), settled 49.9; hitch callbacks 22/369 -> 4/815 |
| Opening resource census no longer waits a frame per node (stride clock stamped after the yield, 12 sites) | Launch click -> flight 30-37 s -> 14-17 s warm; census 680 pointless frame waits removed |
| Shader-readiness poll queries at most 8 programs or 2 ms per task | the 221 ms single-task poll is gone |
| Deep-sky plates, L0 background bake program, HUD obstacle reads, loading emblem layer | first seconds of flight 14.2 -> 25 fps (p50 67 -> 33 ms) |
| Flight-footage JPEGs encode in a worker instead of `canvas.toBlob` | Crucible main thread: capture 2478.8 ms -> 64.9 ms of a 21.9 s window (11.3% -> 0.3%), idle 15.8% -> 27.7-29.9%, long tasks 20-24 -> 7-11; clip ring 15 -> 103 frames; within-session A/B (7 s blocks, quiet host): recording off 45.3 fps, old main-thread path 36.3, worker path 39.9 |
| Translation idle-warm fallback no longer spins a zero-delay timer without `requestIdleCallback` | 60 zero-delay timers per 900 ms -> 5; settings-parity test no longer hangs |

## What is left, with the reason

* Crucible is GPU-bound on this iGPU after the footage fix (main thread ~30% idle; bloomScene ~11-12 ms, composite
  ~4 ms of a 16.7 ms frame). Reading pixels for the clip recorder costs a flat ~8-12% fps while recording, whatever
  the capture rate (1.7/s costs what 6/s costs); `createImageBitmap(video)` alone costs the same as the whole encode.
  Further relief is a render-scale or recording-off choice, which is the owner's call, not a code fix.
* Loading `gpu-resources` stage (10 s warm) is spread thin: `three.core` traverse 1.6 s, native 2.6 s, no single
  hotspot above 2%. The New Game screen's 1.2 s main-thread cost is style recalc (211 ms), GL command-buffer waits
  (245 ms) and microtask churn (104 ms).
* The first 10 s of flight keep the main thread ~100% busy (render, residency, view sync).

## Method notes (do not repeat these experiments)

* Footage recorder variants measured in one session each: worker encode, bitmap-only (no encode), CPU-canvas worker,
  resize quality low/none, capture gaps of 6/12/30 ticks, MediaStreamTrackProcessor in a worker. None beat the
  shipped worker path; MSTP is free when frames are only read and dropped and costly once drawn.
* An empty scene still reads ~8 ms in the `bloomScene` GPU timer here (the GPU is time-sliced with other processes),
  so per-pass GPU attribution on this host is a ceiling, not a measurement.
