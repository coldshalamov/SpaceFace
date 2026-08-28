<!-- LIFETIME: DURABLE -->

# Opening shader admission: the wait was serialized, not the work

**Date:** 2026-08-28
**Campaign:** PQ-129 (performance convergence)
**Cost class:** driver admission
**Instrument:** `npm run probe:runtime-witness` (headed Electron, real GPU), Intel/ANGLE D3D11
**Related:** `design/perf/PERFORMANCE_CONVERGENCE_2026-08-24.md` — backlog items 1 and 2, experiment E2

## The measurement that changed the diagnosis

The loading route spent almost all of its wall clock in the `render-pipelines` stage, and the first
visible frame *still* failed its identity gate. Both facts had the same cause, and it was not the
amount of work.

A temporary census around the single choke point (`compilePipelinesContextSafe` in `bloom.js`)
recorded, per compile admission, the time inside `renderer.compile()` versus the time spent polling
`program.isReady()`. It was held constant across both arms and then removed; to re-take it, time
either side of the `renderer.compile()` call in that function and close the row in `finish()`:

```
238 admissions
  KHR_parallel_shader_compile : PRESENT
  inside renderer.compile()   :  0.12 s total
  waiting on isReady()        : 25.80 s total   (31 units carried 23.9 s of it)
  wait p50 0.6 ms | p95 636 ms | max 3676 ms
```

**Correct a stale belief while you are here.** Three comments in this tree
(`openingGpuAdmission.js`, `pipelineReadiness.js`, `renderer.js`) reason from "Intel/ANGLE *without*
`KHR_parallel_shader_compile`". On this baseline the extension is present. That is precisely why the
numbers look the way they do: with the extension, `renderer.compile()` only *starts* the driver
link and returns in microseconds. The seconds are all in the wait.

The admission loop compiled one unit, waited for that unit's link, then moved to the next. So the
cohort paid the **sum** of every link on a driver that was willing to overlap them.

## The change

`admitOpeningUnitsAcrossSlices` gained an optional `beginReadinessBatch`. With it the shape becomes
**issue-all → drain-once → touch-all** instead of compile→touch→yield per unit:

- `beginScenePipelineReadinessBatch()` (bloom.js) opens a shared cohort. While one is open,
  `compilePipelinesContextSafe` hands its programs to the cohort and suspends rather than running
  its own 10 ms timer.
- Every compile is issued without awaiting, so the whole cohort reaches the driver before the first
  wait begins. Awaiting in the issue loop would deadlock — nothing settles until `drain()`.
- `drain()` polls the whole cohort once and settles every waiter together.
- Touches run only after the drain. A draw against an unlinked program pays the same stall this
  removes, so that ordering is load-bearing, not cosmetic.

Three call sites opt in: first-present GPU admission, the opening submission drain, and the
post-opening late-color pass. Without the option the old interleaved path is kept verbatim.

**Nothing about the picture changes.** The same units are admitted, the same programs are compiled
under the same cache keys against the same target, and the same touches run. Only the waiting is
pooled. No resolution, effect, population, or asset fidelity is traded — the rejected-shortcuts list
in the convergence plan is untouched.

### Three safety properties worth keeping

- **A joiner cannot be released early.** `drain()` settles nobody until every registered program has
  linked, so an unrelated compile that lands mid-cohort is slowed, never made unsafe. Once `drain()`
  starts, `join()` refuses new arrivals and they run their own wait.
- **`close()` always settles.** A throw between open and drain would otherwise strand suspended
  compiles and the startup gate would simply time out twenty seconds later with no attribution.
- **The entry render target is re-asserted after the waiters unwind, not during settle.** This one
  was got wrong first and is worth spelling out. `compileScenePipelinesForRenderTarget` captures the
  bound target, sets its compile target, and restores the capture in a `finally`. While a cohort is
  suspended those captures nest — call *k* captured what call *k−1* had just set — so their
  unwinding leaves the renderer on a compile target rather than where it started. Crucially, settle
  only *resolves* each compile; every `finally` runs a microtask later. A restore performed inside
  `settleAll` is therefore ordered *before* all of them and is simply overwritten. The fix is
  `restoreEntryTarget()`, called once `await Promise.allSettled(issued)` proves every `finally` has
  run. A test that models the waiter synchronously cannot see any of this and will pass either way.

## Result

Same host, same route (New Game, seed 47), same instrument in both arms, host CPU 20.9–25.4% across
all six runs. The two arms differ only by the three `beginReadinessBatch` call sites in
`renderer.js`; the batch is inert without them.

| | control (n=3) | batched (n=3) |
|---|---|---|
| `render-pipelines` stage | 20.9 / 21.1 / 18.6 s | **6.4 / 7.3 / 6.2 s** |
| load to entering-flight | 25.7 / 25.4 / 22.4 s | **10.4 / 11.3 / 9.8 s** |
| flight hitches in window | 29 / 19 / 44 | **13 / 14 / 11** |
| opening post-submit validation | failed 3 of 3 | **failed 0 of 3** |

The arms do not overlap on any of the four measures.

Load time fell by roughly 60%. Hitches fell too, so this is not the forbidden trade of a visible
stall moved into an unresponsive loading shell — the shell got shorter *and* the frames after it got
smoother.

The identity-gate result was not the goal and is the more durable win: because the cohort drains
before any touch, every geometry and texture is now admitted behind the loading boundary instead of
some of them landing on the first frame the player sees. That closes backlog item 1 of the
convergence plan for this route.

## The headless route is a different machine, and that is fine

`npm run check:playable` runs software rendering, where the driver reports
`KHR_parallel_shader_compile extension not supported`. On that route `compilePipelinesContextSafe`
settles before it ever reaches the cohort, so `renderer.compile()` blocks and links inline exactly
as it always did; the batched path degrades to issue-all → empty drain → touch-all, which is the
same work in the same order per unit. No behavior is contingent on the extension being present.

This is also why the headed witness is the acceptance instrument and headless hitch budgets are not:
the two routes do not share the cost structure this change addresses.

## What this does not fix

- `precompilePipelines` (the post-opening sector probe path) still awaits `preparePipelines` per
  subject in a sequential loop. It cannot simply be wrapped in a cohort — a sequential await inside
  an open batch deadlocks, because nothing settles until the drain. Restructuring it is a separate
  change with its own measurement.
- The in-flight sliced path (`shouldSliceCompileAcrossPresents` → `yieldToNextPresent`) is
  deliberately serialized so each compile lands on its own frame beat. That is hitch-avoidance
  during play, not load-time cost. Leave it alone.
- `prepareOpeningFirstPicture` remains asset-construction cost, a different cost class.

## Coverage

- `test/scene-pipeline-readiness-batch.test.mjs` — cohort settles only after the whole cohort links;
  late joiners are refused; `close()` cannot strand a waiter; the entry render target survives the
  waiters unwinding a microtask later (the waiter is modelled asynchronously on purpose — a
  synchronous stand-in passes against the broken ordering); nested opens share one cohort.
- `test/opening-gpu-admission.test.mjs` — batched ordering (no compile waits on the previous one, no
  touch precedes the drain) and close-on-throw. The unbatched interleaved order is still asserted.

Every test in the tree that references `renderer.js`, `bloom.js`, or `openingGpuAdmission.js` was
run before and after: 331 tests, 326 pass, the same 5 failures on both sides. Those five
(`gpu-timer-attribution`, `planar-additive-policy`, `render-target-pipeline-warmup`,
`ship-aux-dirty-ranges`, `tabletop-policy`) are pre-existing and were verified red at the parent
commit. Do not attribute them here.
