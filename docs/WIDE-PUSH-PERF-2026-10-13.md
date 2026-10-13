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
| `... --heap-sampling` | V8 sampling heap profiler across launch: which allocation sites still hold live memory at flight, with the JS heap at each milestone |
| `probe-smooth-flight.mjs [--crucible]` | rAF fps, p50/p95/p99, hitch classifier, link placement, cook ledger for a 30 s window |

## Results (before -> after, same instrument)

| Change | Evidence |
|---|---|
| Dispose-registration probe finishes in one render (was ~8 per second in flight) | open-flight fps 18.6 -> 39.9 (opening included), settled 49.9; hitch callbacks 22/369 -> 4/815 |
| Opening resource census no longer waits a frame per node (stride clock stamped after the yield, 12 generator sites; the async texture scan of an already-resident set had the same defect, 342 yields for 595 textures, fixed later) | Launch click -> flight 30-37 s -> 14-17 s warm; census 680 pointless frame waits removed; **first seconds of flight 14.2 -> 25 fps (p50 67 -> 33 ms)** (`launch-before-census-fix.md` -> `launch-after-census-fix.md`) |
| Shader-readiness poll queries at most 8 programs or 2 ms per task | the 221 ms single-task poll is gone |
| Deep-sky plates behind the loading screen (D1), L0 background bake program kept (D5), HUD obstacle reads before writes (D2), loading emblem on its own layer (D6) | Mechanism proven by a test per change that goes red on revert; the fps effect of these four is NOT isolated. The one isolating A/B, D6 on vs off, shows first-seconds-of-flight 25.4 vs 26.2 fps, no change (`launch-d6-on.md`, `launch-d6-off.md`); D6's measured effect is 10-15% less document/compositor work per second of loading |
| Flight-footage JPEGs encode in a worker instead of `canvas.toBlob` | Crucible main thread: capture 2478.8 ms -> 64.9 ms of a 21.9 s window (11.3% -> 0.3%), idle 15.8% -> 27.7-29.9%, long tasks 20-24 -> 7-11; clip ring 15 -> 103 frames; within-session A/B (7 s blocks, quiet host): recording off 45.3 fps, old main-thread path 36.3, worker path 39.9 |
| Translation idle-warm fallback no longer spins a zero-delay timer without `requestIdleCallback` | 60 zero-delay timers per 900 ms -> 5; settings-parity test no longer hangs |

## Targets, plainly

| Owner target | Status | Evidence |
|---|---|---|
| About 2x average fps | **Met** on the original witness | open flight 18.6 -> 39.9 fps with the opening included (host 61% -> 43% busy), 49.9 settled 25 s into flight; launch click to flight 30-37 s -> 14.3 s warm; first seconds of flight 14.2 -> 25-30 fps. Crucible: the clip recorder no longer costs 11% of its main thread. |
| No hitching | **Not met** | The first ~10 s of flight keep the main thread ~100% busy (25-30 fps, p95 ~50 ms). The New Game screen opens with two 250 ms stalls (ledger D198). Crucible is GPU-bound on this iGPU (39-45 fps quiet host, 11-18 when the host is 70% busy), so its remaining hitches are GPU time, not code. |
| Smooth, animated loading screen | **Partly met** | The boot ring and the backdrop video render off the main thread and keep moving. The DOM labels and progress freeze for the gaps below. `loading: gpu-resources` (10 s of the load) holds 43.9 fps with a p95 of 50 ms. `authored-library` is 3 frames over 0.4 s (150 ms gaps), `authored-visuals` 19.6 fps with a worst gap of 233 ms, `entering-flight` 27.8 fps with a worst gap of 200 ms. Source: `oct13-o1-launch/report.md`, quiet host. |

## Evidence files

Every number in this record comes from a file in `docs/perf-evidence/2026-10-13-wide-push/`:

| File | What it is |
|---|---|
| `open-flight-A-before.log`, `open-flight-B-after.log`, `open-flight-B2-settled.log` | `probe-smooth-flight.mjs` witnesses for the 18.6 -> 39.9 -> 49.9 fps rows (host busy printed in each) |
| `launch-before-census-fix.md`, `launch-after-census-fix.md`, `launch-latest-quiet-host.md` | `probe-main-thread-profile.mjs --from-launch` reports; the last is the quiet-host run behind the loading-smoothness table |
| `launch-d6-on.md`, `launch-d6-off.md` | the D6 emblem-layer A/B |
| `crucible-before-footage-worker.md`, `crucible-after-footage-worker.md`, `crucible-old-footage-rerun.md` | steady-flight Crucible profiles around the footage worker |
| `footage-ab-*.json` | within-session rotating-block A/Bs of the clip recorder (modes, bitmap-only, CPU canvas, resize, capture rate, MediaStreamTrackProcessor) |

## Probe corrections made during the push

* Playwright role locators (`getByRole`) build an ARIA tree inside the page's main thread, which appeared as 50-100 ms long tasks on the New Game screen and at the Launch click in the very windows being measured (`isElementHiddenForAria`, `getAriaRole`). The probe now finds buttons with a plain DOM query and a real mouse click. Loading-smoothness numbers taken before that correction (everything above that names a New Game or Launch-click stall) overstate those two windows.
* Clicking New Game within a second of the title menu appearing measures boot-time background residency work, not the screen; `--menu-dwell-ms` reads the menu first the way a person does.
* `--sampling-us=4000` keeps the CPU profiler's own cost out of a smoothness read.

## What is left, with the reason

* Crucible is GPU-bound on this iGPU after the footage fix (main thread ~30% idle; bloomScene ~11-12 ms, composite
  ~4 ms of a 16.7 ms frame). Reading pixels for the clip recorder costs a flat ~8-12% fps while recording, whatever
  the capture rate (1.7/s costs what 6/s costs); `createImageBitmap(video)` alone costs the same as the whole encode.
  Further relief is a render-scale or recording-off choice, which is the owner's call, not a code fix.
* Loading `gpu-resources` stage (10 s warm) is spread thin: `three.core` traverse 1.6 s, native 2.6 s, no single
  hotspot above 2%. The New Game screen's 1.2 s main-thread cost is style recalc (211 ms), GL command-buffer waits
  (245 ms) and microtask churn (104 ms).
* The first 10 s of flight keep the main thread ~100% busy (render, residency, view sync).
* Heap: `usedJSHeapSize` reads 301 MB at the title screen, 798 MB at the first flight frame and 1021 MB after 8 s of
  flight, but the sampling profiler attributes only ~104 MB of live objects to everything allocated since New Game
  (scene graph nodes 15.7 MB, `cloneUniforms` 7.8 MB, GLB parse 5.8 MB, package loader 4.9 MB). The rest is garbage
  awaiting a collection (about 27 MB/s of churn in the flight tail; total GC time was 0.6% of the Crucible window),
  so the 800-1000 MB figure is not a leak and not a stall source. The 300 MB base before New Game is the real
  standing cost.

## Method notes (do not repeat these experiments)

* Footage recorder variants measured in one session each: worker encode, bitmap-only (no encode), CPU-canvas worker,
  resize quality low/none, capture gaps of 6/12/30 ticks, MediaStreamTrackProcessor in a worker. None beat the
  shipped worker path; MSTP is free when frames are only read and dropped and costly once drawn.
* An empty scene still reads ~8 ms in the `bloomScene` GPU timer here (the GPU is time-sliced with other processes),
  so per-pass GPU attribution on this host is a ceiling, not a measurement.
