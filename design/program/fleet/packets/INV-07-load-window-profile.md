# INV-07 — Where do the ~42 s between PLAY and the first hostile go? (READ-ONLY, measured)

**You change no tracked file.** Create files only under `.devshots/fleet/inv07/`. Output: RECEIPT.md.

## What is already known (do not re-measure these)
- `.devshots/fleet/runs/INV-01-swarm-load-compile.grok.*/RECEIPT.md` (your cook-ledger table) and
  `.devshots/fleet/load01/` (LOAD-01 counts): between PLAY and the first hostile only ~118 programs are created,
  `ACTIVE_UNIFORMS` sync waits total only ~0.7 s in that window, and a warm browser profile is NOT faster.
  Deferring `preparePostOpeningPipelines` did not shorten the wait — the time moved elsewhere.
So the question is: of the ~42 s, how much is the main thread busy (and doing what), and how much is it idle —
waiting on timers, rAF pacing, worker replies, network/asset fetches, GPU fences or `await`ed promises?

## Do this
1. Reuse `.devshots/fleet/load01/load-split.mjs` (headless is fine) to drive title → SWARM → PLAY. Start a CDP
   `Profiler` (sampling interval 1 ms) at the PLAY click and stop it at the first hostile. Also enable CDP
   `Tracing` or `Performance.getMetrics` if you can, and record every network request in the window
   (url, size, start, duration) with `page.on('requestfinished')`.
2. Report: total window; main-thread busy time vs `(idle)`/`(program)`/`(garbage collector)`; top 30
   functions by self and by total time with `url:line`; the network timeline (count, bytes, the longest 15
   requests and whether they run in series).
3. Find the code that deliberately waits during the load: `setTimeout`/rAF yields, pacers, "settle" or
   "idle" waits, frame budgets in the cook (`grep -n "settle\|pace\|yield\|budget\|idleWait\|whenIdle"
   src/render/renderer.js src/render/pipelineReadiness.js src/main.js src/render/gpuQueuePace.js`). For
   each, estimate its total contribution in this window (from the cook ledger steps
   `state.render` records, or by timestamps you log).
4. Ranked list: the 5 biggest buckets of the 42 s with evidence, and for each whether it is real work,
   waiting on something real (assets, GPU), or self-imposed pacing that a loading screen does not need.
Run ONLY through the lock.
