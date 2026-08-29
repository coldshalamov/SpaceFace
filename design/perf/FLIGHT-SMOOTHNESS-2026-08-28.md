<!-- LIFETIME: DURABLE -->

# Flight smoothness: what moved, and the one thing that now dominates

**Date:** 2026-08-28
**Campaign:** PQ-129 (performance convergence)
**Instrument:** `npm run probe:runtime-witness` at `SPACEFACE_WITNESS_MS=60000`, Intel/ANGLE D3D11
**Companion:** `design/perf/OPENING-COMPILE-BATCH-2026-08-28.md` (the loading half of the same work)

## Result

Nine 60-second flights, New Game seed 47, held thrust, host CPU 18–23% throughout. "Excess ms" is
frame time in hitch frames beyond a 16.7 ms budget — a severity measure, because a hitch count
weights a 500 ms freeze the same as a 35 ms one.

| | before (n=3) | after (n=8) |
|---|---|---|
| hitches per 1000 frames | 38.1 / 11.1 / 36.9 | **6.2 / 8.7 / 8.3 / 6.5 / 5.8 / 5.9 / 8.2 / 7.9** |
| excess ms per 1000 frames | 1429 / 924 / 1298 | **530 / 608 / 613 / 509 / 498 / 530 / 607 / 579** |
| frames delivered in 60 s | 2888 / 2974 / 2924 | **~3050 (2989–3080)** |

|  | before | after | ratio |
|---|---:|---:|---:|
| hitches / 1000 frames, mean | 28.7 | 7.2 | **4.0x** |
| hitches / 1000 frames, median | 36.9 | 7.2 | **5.1x** |
| excess ms / 1000 frames, mean | 1217 | 559 | **2.2x** |

The last two rows are the honest pair to quote together. Hitch *rate* improves more than hitch
*severity* because the multi-second collections described below survive both arms and dominate what
is left of the excess-milliseconds number.

**Quote the improvement as a range, not a point estimate.** The before-arm is n=3 with a 3.4x
internal spread (38.1 / 11.1 / 36.9), and the whole mean-versus-median gap is the single mild run.
At n=3 there is no way to tell "that run was lucky" from "the other two were unlucky", so the true
multiple sits somewhere in **2–5x** depending on which measure you trust: ~2.2x on severity, ~4x on
mean rate, ~5x on median rate. The after-arm is n=8 and tight (5.8–8.7), so the uncertainty is
almost entirely in the baseline.

The game also delivers ~4% more frames in the same wall clock, and the spread collapsed — before,
hitch rate ranged 11–38 per 1000 frames (3.4x between runs); after, 5.8–8.7 (1.5x). Every owner
category improved, including `sim` (mean 23 → 3.2), because frames that are not being stolen by a
driver stall finish inside their budget.

Two changes produced this, both quality-neutral and both recorded in their own commits: the opening
readiness cohort, and the global pipeline warmup that had never run outside context recovery.

## The remaining cause is named, measured, and NOT rendering

Do not spend another session hunting hitches in the renderer. The dominant remaining cost is
**major garbage collection on a ~1.3 GB JS heap**, and here is the evidence trail, including the
hypotheses it killed.

The classifier reports ~20 hitches and ~1600 excess ms, but the game delivers only ~3050 frames in
60 s — about 51 fps, not 60. The missing ~9 seconds do not appear in the hitch budget because the
frame-dt clamp caps a stall at 250 ms. An always-on long-task observer (added to the witness in this
work) finds them:

```
count 34; total 17273 ms; max 4379 ms; >=100 ms 24
  4379 ms at 53277 ms
  3500 ms at 33795 ms
  2453 ms at  9318 ms
```

Roughly three multi-second main-thread blocks per minute of flight. Sampled alongside them:

```
JS heap MB over run:      131 179 209 814 818 1254 1347 1182 1208 1317 1310 1330 1335
GPU geometries over run:   47 102 107 112 111  198  209  253  322  348  342  337  336
GPU textures over run:     60  74  78  78  83  148  163  178  219  237  237  237  237
```

GPU residency **plateaus** — geometries settle near 340, textures at 237 — so this is not runaway
streaming. The JS heap reaches ~1.3 GB and stays there, and the 1347 → 1182 step is a collection.
A V8 major GC on a 1.3 GB heap costing 2.5–4.4 s is exactly the observed block.

**Ruled out, with the measurement that ruled it out. Do not re-run these:**

- **The probe's own screenshots.** `locator('#gl-canvas').screenshot()` does block the renderer, and
  three shots land inside a 60 s sample, which is a seductive match for three blocks. It is wrong:
  with `--no-sample-shots` (added for this) the blocks are unchanged — 4148/3406/2429 ms against
  4076/3336/2449 ms.
- **Asset streaming.** The witness pairs each long task with resource-timing entries over 300 KB
  landing in the 3 s before it. No block has one. Nothing is being fetched and parsed into them.
- **Background bakes.** Every deep-field bake funnels through `_bakeLayer`; timing it found three
  events over 60 ms in a whole run, all at boot (a 1×1 warmup, a 2048² and a 1024² nebula tile),
  totalling ~1.3 s. None mid-flight.
- **Event-bus handlers.** Timing every handler dispatch found one 154 ms `sector:enter` and nothing
  else above 80 ms. World generation on cell crossings is not it.
- **Anything I changed.** The baseline arm shows the same curve: 145 → 1308 MB, max long task
  4218 ms. This is pre-existing.

That is the whole of game JS accounting for ~1.3 s against ~16 s of observed blocking, which is what
puts the cost outside instrumented game code and inside the collector.

### It is churn, not retention — and the allocators are named

A forced collection (`--gc-probe`, CDP `HeapProfiler.collectGarbage`) settles the question:

```
heap 1331 MB -> 486 MB
```

**About 845 MB of the 1.3 GB is garbage, not live data.** The live set is ~486 MB. So the fix is to
stop allocating, not to dispose — those are different fixes, and the earlier guess (retained decoded
texture sources) was wrong. That guess is recorded here because it is the plausible-sounding one.

V8's *sampling* heap profiler (`--alloc-probe`) then names the sites. A sampling profile is the
right tool: a full snapshot of a 1.3 GB heap is multi-gigabyte and unreadable, while sampling costs
almost nothing and reports self-size per call frame.

**Read these as proportions, not absolute bytes.** The profiler samples at a 64 KiB interval, so its
20 MB total is a statistical estimate standing in for the ~845 MB of real garbage. A site listed at
"3.4 MB" is 17% of allocation, i.e. on the order of 140 MB — do not read it as 3.4 MB and drop the
lead. Top sites over a 60 s flight:

| share of allocation | site |
|---:|---|
| 17% | `pointFromMid` @ `src/ui/priceHistory.js:52` |
| 12% | `pricePointAt` @ `src/systems/economy.js:267` |
| 10% | `append` @ `presentationJournal.js:274` |
| 6% | `cloneUniforms` @ `three.core.js` |
| 5% | `frame` @ `presentationRunner.js:659` |
| 2% | `seedStationFromHistory` @ `src/ui/priceHistory.js:60` |
| 2% | `createCycle` @ `economyCycles.js:106` |
| 2% | `(anonymous)` @ `src/ui/priceHistory.js:93` |

**The single largest allocator in flight is the ECONOMY, not the renderer.** `priceHistory` plus
`economy` account for roughly a third of all allocation. The mechanism: as the player flies, new
stations come into existence, `ensureMarket` builds each one a synthetic price past
(`HISTORY_POINT_LIMIT = 64` points per commodity), and `seedStationFromHistory` then copies that
past into a UI ring buffer, allocating a second object per point — plus a fresh `events: []` array
for each, on points that are synthetic and can never carry an event.

This is UI chart data being built eagerly for stations the player has never opened, and there is
already an `economy:marketOpened` handler that seeds on demand.

**Deliberately not changed here.** Deferring that generation changes what a chart shows for a
station visited long after it spawned, which is a design call, and it is the economy lane rather
than the renderer. The measurement is the deliverable; the decision is not this lane's to make.
Anyone taking it should re-run `--gc-probe` and `--alloc-probe` before and after.

## Instrument notes

The witness now reports, always on: long tasks (count/total/max/top with the heavy resources that
preceded each), the JS heap series, and the GPU geometry/texture series. `--no-sample-shots` scores
flight without the measuring apparatus in the number. An engine without the `longtask` entry type
reports **NOT MEASURED**, never "none".

`hitch.mjs` in the session scratchpad deliberately does not correlate anything against host CPU. An
earlier version did, and reported bloom bricks at r=0.99 with host load — impossible, since those
are deterministic program links. The rows spanned two code arms, so every "correlation" was the arms
differing in two variables at once. Compare arms; never regress across them.
