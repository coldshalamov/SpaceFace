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
| Opening touch walk skips hidden branches (`withOnlySubjectsDrawable`), the private residency program is compiled before it is drawn, final settle touches go out four to a render, the boot video resumes instead of seeking to 0 | Four corrected-probe runs before (`launch-corrected-probe-run1..4.md`) and four after (`launch-after-flight-start-patches-run1..4.md`), quiet host: inclusive `withOnlySubjectsDrawable` 1595/1933/1883/1780 -> 1234/839/990/1189 ms; longest driver-link wait in the load 197/225/195/155 -> 51/45/33/52 ms and total main-thread time in link waits 0.6-0.9 -> 0.4-0.6 s; Launch click to flight 11.4/12.1/12.5/12.2 -> 14.0/11.0/10.3/11.1 s (mean 12.05 -> 11.6 s; three more runs with the reverted New Game patch 10.1-11.2 s); video drop rate in the first second 65% -> 47% (within noise). P01/P05 are measured together; the video change is not proven by itself |
| Translation idle-warm fallback no longer spins a zero-delay timer without `requestIdleCallback` | 60 zero-delay timers per 900 ms -> 5; settings-parity test no longer hangs |

## Targets, plainly

| Owner target | Status | Evidence |
|---|---|---|
| About 2x average fps | **Met** | Final witnesses on the shipped tree (`open-flight-final-*.log`, host 10-12% busy before each run, 31-57% during it): the first 20 s of open flight, opening included, runs 29.2 / 34.9 / 43.2 / 34.3 fps (mean 35.4) against 18.6 before the push, **1.9x**; the same flight 25 s in runs **58.7 fps, p50 16.7 / p95 17.0 / p99 33.3 ms, worst 83 ms, 1 frame over 50 ms in 1150, 0 hitch callbacks, classifier 26 hitches in 1181 frames** (49.9 fps, 5.8% of frames over 33 ms, 175 classifier hitches in 1025 frames in the earlier settled witness). Launch click to flight 30-37 s -> 10-14 s warm (mean 11.6 s). Crucible: the clip recorder no longer costs 11% of its main thread. |
| No hitching | **Met once settled; not met in the first ~10 s of flight** | Settled open flight (25 s in): 49.9 fps, p50 16.7 / p95 33.4 / p99 50 ms, worst 67 ms, 0 hitch callbacks in 1024 frames (`open-flight-B2-settled.log`). The same log's in-game classifier counts 175 hitches in 1025 frames (mostly `externalScheduling`, i.e. missed vsyncs), so settled flight is free of long stalls but not of 60 -> 50 fps judder. The first ~10 s of flight, four quiet-host runs before the loading patches: 20.8-25.3 fps, p50 33 ms, p95 67-83 ms, worst 100-400 ms, 1-4 frames over 100 ms; the four runs after them: 21.7-27.9 fps, p95 50-117 ms, 1-10 frames over 100 ms (one run had 10 and a 300 ms frame), no main-thread task of 70 ms or more, so the cost is many small tasks plus GPU time, not a script to fix (the paced-work budget is already 4 ms a frame). Crucible is GPU-bound on this iGPU (39-45 fps quiet host, 11-18 when the host is 70% busy). |
| Smooth, animated loading screen | **Mostly met; small gaps remain** | Four quiet-host runs with the corrected probe and the loading patches (8-34% host busy; `launch-after-flight-start-patches-run1..4.md`): Launch click to flight **10.3-14.0 s, mean 11.6 s** (12.05 s over the four runs before the patches; three more runs taken with the later-reverted New Game patch, `launch-after-all-patches-newgame-window-run1..3.md`, read 10.1-11.2 s). Main-thread tasks of 70 ms or more in the whole load: 5-7 events a run, every one of them 74-145 ms except a single 198 ms at one Launch click; none in flight beyond two of 73-78 ms. The late-loading burst that was 112-176 ms is now 99-144 ms; the longest driver-link wait fell from 155-225 ms to 33-52 ms. The boot ring (worker-drawn) and the backdrop video are off the main thread and keep moving; the video still drops about half its frames in its first second of playing (65% -> 47%, within noise) and 1-2% afterwards. Page rAF worst gaps by stage: New Game screen 133-167 ms, Launch click 167-233, authored-library 100-183, authored-visuals 150-200, gpu-resources 117-134 (3-7 frames over 100 ms of ~400), entering-flight 117-167. Open: the 100-145 ms DOM pauses, the video's first second, the late-HDRI tail (one run in six had a 445-508 ms Launch click; the attempted fix was reverted for lack of a reproduction, see "Tried and reverted"). |

## Evidence files

Every number in this record comes from a file in `docs/perf-evidence/2026-10-13-wide-push/` (the CPU profiles themselves, 5-15 MB each, are not versioned; `inclusive-sum.mjs` recomputes the inclusive-time numbers from a local `.cpuprofile`: `node inclusive-sum.mjs withOnlySubjectsDrawable,touchExactTargetSubjects <run-dir>...`):

| File | What it is |
|---|---|
| `open-flight-A-before.log`, `open-flight-B-after.log`, `open-flight-B2-settled.log` | `probe-smooth-flight.mjs` witnesses for the 18.6 -> 39.9 -> 49.9 fps rows (host busy printed in each) |
| `launch-before-census-fix.md`, `launch-after-census-fix.md`, `launch-latest-quiet-host.md` | `probe-main-thread-profile.mjs --from-launch` reports; the last is the quiet-host run behind the loading-smoothness table |
| `launch-d6-on.md`, `launch-d6-off.md` | the D6 emblem-layer A/B |
| `crucible-before-footage-worker.md`, `crucible-after-footage-worker.md`, `crucible-old-footage-rerun.md` | steady-flight Crucible profiles around the footage worker |
| `crucible-after-footage-worker-run1.md`, `heap-sampling.json/.md`, `gpu-timers-crucible.json`, `launch-after-all-patches-newgame-window-run1..3.md` | the 64.9 ms / 27.7% Crucible run, the heap numbers, the GPU pass times, and three more post-patch launches |
| `footage-ab-*.json` | within-session rotating-block A/Bs of the clip recorder (modes, bitmap-only, CPU canvas, resize, capture rate, MediaStreamTrackProcessor) |

## Probe corrections made during the push

* Playwright role locators (`getByRole`) build an ARIA tree inside the page's main thread, which appeared as 50-100 ms long tasks on the New Game screen and at the Launch click in the very windows being measured (`isElementHiddenForAria`, `getAriaRole`). The probe now finds buttons with a plain DOM query and a real mouse click. Loading-smoothness numbers taken before that correction (everything above that names a New Game or Launch-click stall) overstate those two windows.
* Clicking New Game within a second of the title menu appearing measures boot-time background residency work, not the screen; `--menu-dwell-ms` reads the menu first the way a person does.
* `--sampling-us=4000` keeps the CPU profiler's own cost out of a smoothness read.

## Tried and reverted

* New Game screen read-before-write batching (`yardCarousel.build` / `hullRing.draw` / `newGame.js`, codex patch P02): the still is byte-identical and the 26 carousel tests pass, but three corrected-probe runs showed no gain in the New Game window (2 long animation frames of 122-129 ms blocking vs 85-115 ms before; worst rAF gap 150-167 ms either way), so it was not kept (ledger row D198 stays open).

* Arming (not forcing) the late foundry-environment bake so it retires at the first veiled cook seam instead of inside the Launch reply: the intent is right, but the 445-508 ms case could not be reproduced on demand (one run in six; a held-back HDRI response in both old and new code never produced it), so there was no before/after to keep it on. The stack and the one-line change are recorded in the commit history of this record; try again with a boot that lands the HDRI between the menu bake deadline and the Launch click.

## What is left, with the reason

* Crucible after the footage fix: the main thread is ~30% idle and the GPU timers read bloomScene ~11-12 ms and composite
  ~4 ms of a 16.7 ms frame, which is consistent with GPU pressure on this iGPU; the residual hitches in those windows are
  NOT attributed (the two Crucible profiles still hold 7 and 11 long main-thread tasks, and the timers over-read on a
  time-sliced GPU, see the method notes). Reading pixels for the clip recorder costs a flat ~8-12% fps while recording,
  whatever the capture rate (1.7/s costs what 6/s costs); `createImageBitmap(video)` alone costs the same as the whole
  encode. Render scale or recording off are two ways to buy that back; neither is a completion gate.
* Clip trade, stated plainly: the recorder starts 5 s after the first playable frame, so the first five seconds of a
  flight are never available as clip pixels (an early marked moment exports as unavailable, not as a pose-metadata
  substitute).
* Loading `gpu-resources` stage (10 s warm) is spread thin: `three.core` traverse 1.6 s, native 2.6 s, no single
  hotspot above 2%. The New Game screen's 1.2 s main-thread cost is style recalc (211 ms), GL command-buffer waits
  (245 ms) and microtask churn (104 ms).
* The first seconds of flight: the extra cost is tied to MOVING, not to elapsed time. Same launch, 30 s of flight, per two-second bucket (`flight-cadence-held-still.md` vs `flight-cadence-under-thrust.md`, `--hold-still` option): held still it runs 37-47 fps from the first second (one dip to 33-37 fps at 14-18 s) and 44-50 fps after 22 s; under thrust it runs 22-33 fps for the first ~14 s and then 36-60 fps. So the first ~14 s of thrust pay for streaming the neighbourhood in (mesh builds, uploads, admissions as new objects enter range), and the settled number is what the world costs once it is resident. A codex analysis of the matched early/settled profile windows found the JS totals similar and the native `(program)` time similar but spread over half the frames, and could not attribute the native part; no quality-reducing or hold-lengthening change was made for it. The lever this points at (prefetching a wider neighbourhood behind the loading screen, at the cost of a longer load) is a product trade-off the owner has not been asked to make.
* Heap: `usedJSHeapSize` reads 301 MB at the title screen, 798 MB at the first flight frame and 1021 MB after 8 s of
  flight, but the sampling profiler attributes only ~104 MB of live objects to everything allocated since New Game
  (scene graph nodes 15.7 MB, `cloneUniforms` 7.8 MB, GLB parse 5.8 MB, package loader 4.9 MB). That the rest is
  garbage awaiting a collection is an inference from one profile (about 27 MB/s of churn in the flight tail; total GC time was
  0.6% of the Crucible window); it is not a multi-cycle retention test, so this record does not claim the 800-1000 MB
  figure is leak-free. The 300 MB base before New Game is a standing cost.

## Method notes (do not repeat these experiments)

* Footage recorder variants measured in one session each: worker encode, bitmap-only (no encode), CPU-canvas worker,
  resize quality low/none, capture gaps of 6/12/30 ticks, MediaStreamTrackProcessor in a worker. None beat the
  shipped worker path; MSTP is free when frames are only read and dropped and costly once drawn.
* An empty scene still reads ~8 ms in the `bloomScene` GPU timer here (the GPU is time-sliced with other processes),
  so per-pass GPU attribution on this host is a ceiling, not a measurement.
