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
| Smooth, animated loading screen | **Mostly met; four small gaps remain** | Four runs with the corrected probe on a quiet host (8-22% busy, `launch-corrected-probe-run1..4.md`): Launch click to flight **11.4-12.5 s**. Main-thread tasks of 70 ms or more in the whole load: five events of 100-130 ms (the New Game click, the Launch click, three inside the cook), and in one of the four runs the Launch click ran 508 ms (the sim reply promoted a late-arriving environment map in one task: 2K float upload 179 ms + program link 90 ms + stars 59 ms). No task of 70 ms or more in the first 6 s of flight. The boot ring (worker-drawn) and the backdrop video are off the main thread; the video drops about 75% of its frames in its first second of playing (the decoder restarts at `currentTime = 0`) and 1-2% afterwards. Page rAF worst gaps by stage: New Game screen 133-150 ms, Launch click 183-233, authored-library 67-201, authored-visuals 117-167, gpu-resources 117-200 (4-6 frames over 100 ms of ~400), entering-flight 150-217. Open items: the video's first second, the 100-130 ms DOM pauses, the late-HDRI tail (reverted attempt below). |

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

## Tried and reverted

* Arming (not forcing) the late foundry-environment bake so it retires at the first veiled cook seam instead of inside the Launch reply: the intent is right, but the 445-508 ms case could not be reproduced on demand (one run in six; a held-back HDRI response in both old and new code never produced it), so there was no before/after to keep it on. The stack and the one-line change are recorded in the commit history of this record; try again with a boot that lands the HDRI between the menu bake deadline and the Launch click.

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
