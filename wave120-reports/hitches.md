# Wave-120 audit report — lane: in-flight-hitches

Branch `devin/1791494351-perf-w119` at HEAD c3895c513 (superset of 47cd5fbbe; W119 hitches = f23553b9b verified in-tree).

## 1. `saturated: false`

Multiple contract-preserving mechanism wins remain (below).

## 2. W119 hitches verification — all five items check out mechanically

- **F1 post-present resume seams — PASS.** `armFrameDrain` routes the drain through `postTaskAtBackgroundPriorityBounded` (decodeTaskBudget.js:325). Both `yieldLiveSectorGpu` twins resolve via the bounded post (renderer.js:13360, 16861). `waitForPresentedFrame` accepts an injected `scheduleTask`; all four `makeGpuQueuePacer` call sites pass `postTaskAtBackgroundPriorityBounded` (bloom.js:528, renderer.js:11099, startupGpuResidency.js:669/788). `saveSystem._restoreFrameYield` resolves via `postRestoreTaskAtBackgroundPriorityBounded` (saveSystem.js:4746, helper at :202 — scheduler.postTask('background') + 48ms bound). No inline resolve remains on these seams.
- **F2 WeakMap fault rows — PASS.** `busErrorRows` WeakMap keyed on listener fn (eventBus.js:~52); per-listener `rows` array scanned for `label+event`; `busErrorRowsByKey` (non-function listeners) caps at 256 oldest-evict; `busErrorIndex` caps at 512 oldest-evict; 8-verbatim + 1s heartbeat semantics preserved (eventBus.js:100-115).
- **F3 busFaultSummary — PASS.** `busFaultSummary(limit)` returns top-N {label,event,faults,suppressed,lastErrorHead,lastWarnAt} rows; `diagnostics()` stamps `state.render.busFaults` and includes it in the return (renderer.js:31580).
- **F4 policiesMs — PASS.** `pacePolicyWalk` sums only `legMs` per leg; the `yieldToNextPresent` wait is awaited after the debit, not counted (partsLibrary.js:8837-8854).
- **F5 warn routing — PASS.** Diff confirms all ~21 conversions: renderer x8 stormWarn (resource-dispose, resource-teardown, dynamic-buffer-owner-teardown, sector-boundary-abort, asteroid-instance-pool-dispose, appearance-retirement + 2), partsLibrary x6 dedupWarn, renderPackageLoader x2, physics x2, embeddedKtx2 x2, GLTFLoader x1 dedupError/dedupWarn.

## 3. Ranked findings

### A — inline-resolve / timer-priority resume seams still open

**H1. `pipelineReadiness` quiet/maxTimer flush runs the whole compile batch at timer priority — M impact, S effort.**
`scheduleFlush` fires `observePipelineAdmission(flushQueued())` inline inside `setTimeout(quietMs/maxWaitMs)` callbacks (pipelineReadiness.js:253-254). `flushQueued → flushQueuedThrough → enqueueLink → pumpLinks` folds every queued subject into ONE `compileBatch` call, invoked via microtask inside the timer task (pipelineReadiness.js:340-345). Mechanism: the deferred-compile queue's debounce fires the entire queued link cohort inside a timer-priority task — the exact externalScheduling race `postTaskAtBackgroundPriority` exists to kill — and unlike the `boundedResume` lane it skips the `shouldStartHeavyAdmission`/forced-wallet consult entirely (that consult only guards `scheduleResumedBatch`, :408-443). Fix sketch: route the quietTimer/maxTimer callbacks through `armCallbackAfterPresent(cb, {idleBoundMs:48})` (same helper the resume lane already uses, :183-192) so the batch dispatch lands post-present at background priority; pumpLinks serialization keeps batch shape identical. Risk: low — compile ordering unchanged, only dispatch priority moves.

**H2. `uiRoot.yieldPresentationFrame` resolves inline inside rAF — screen-prewarm chunks resume pre-present, in flight — M impact, S-M effort.**
`requestAnimationFrame(() => { clearTimeout(timer); resolve(); })` (uiRoot.js:159-162). `_drainScreenPrewarmQueue` awaits it between every `prewarm(id)` and `paintWarm(id)` leg (uiRoot.js:1593-1609) — and `paintWarm` is a forced style/layout pass measured at ~6-14ms per its own comment. The resolved continuation lands as a microtask inside the armed rAF callback, i.e. pre-present — the same defect shape F1 closed on five other seams. This drain runs in-flight (dock/undock warm station screens mid-flight per W28). Fix sketch: resolve via a bounded background post — uiRoot doesn't import `render/` today; either clone `postRestoreTaskAtBackgroundPriorityBounded`'s shape (saveSystem.js:202 is the render-free precedent) into a core module both can share, or inject the renderer's `postTaskAtBackgroundPriorityBounded` via `state.render`. Risk: low-moderate — the 250ms starve timer keeps its contract either way.

**H3. `main.js` `nextFrame()`/`nextPaint()` resolve inline inside rAF — boot/restore legs resume pre-present — M impact, S effort.**
`finish(false)` calls `resolve()` synchronously inside the rAF callback (main.js:1357-1360, 1373-1385). Every `await nextFrame()`/`nextPaint()`/`nextPaintSliced()` continuation — `bootstrapScene`, the `waitForInitialAuthoredVisuals` readiness scan, the continue-path legs — runs as a microtask inside the armed frame's task, pre-paint, freezing the loading paint it was meant to yield to. `_restoreFrameYield` was converted for exactly this. Fix sketch: route `resolve` through a bounded background post (clone or shared core helper). Adjacent to my lane (boot not flight) but the same mechanism and the bar includes frozen loading screens. Risk: low.

**H4. `programBinaryCache.scheduleDrain` — `setTimeout(drainPending, 0)` drives a sync `getProgramBinary` readback loop at timer priority — L-M impact, S effort.**
After a link burst, `drainPending` walks `pending[]` calling `getProgramParameter`/`getProgramBinary` per program (programBinaryCache.js:184-200, armed :212). `getProgramBinary` is a synchronous driver readback; a dozens-deep tail mints serial readbacks inside one timer task. Fix sketch: dispatch the drain via `postTaskAtBackgroundPriorityBounded` (or slice the walk under the paced ledger if pending can run deep). Risk: low; ordering is already FIFO-approximate.

**H5. `partsLibrary.scheduleRetainedDisposeDrain` — `setTimeout(0)` drives the GL teardown drain at timer priority — L-M impact, S effort.**
The drain does real dispose work per corpse inside the timer task (partsLibrary.js:9435+). It's already forced-wallet-metered once running, but the *dispatch* still races the compositor beat — converting to `postTaskAtBackgroundPriorityBounded` closes the last metered-but-timer-priority arm. Risk: low.

### B — busErrorIndex cap behavior (the asked-about interplay)

- **Function listeners: no verbatim re-mint hole.** Index eviction removes the row from `busErrorIndex` but the row object stays in the listener's WeakMap `rows` array — a continuing stormer finds its row, `logged` stays ≥8, `suppressed` keeps accruing. The 512-cap cannot re-arm verbatim budgets for function listeners. **Residual (diagnostics-only, L):** the evicted row is never re-added to the index, so a >512-distinct-row storm permanently blinds `busFaultSummary` to still-active stormers — faults keep accruing invisibly. Fix sketch: re-add the row to the index on each `entry.faults += 1` (Set.add of a live member refreshes insertion order for LRU semantics — currently `busErrorIndex.add(entry)` is only minted once, so a hot row can age out while storming). S effort.
- **Non-function listeners: dormant verbatim re-arm.** `busErrorRowsByKey` evicting a key deletes that listener's whole rows array — the next fault mints a fresh row (fresh 8-verbatim budget) and a duplicate logical row enters `busErrorIndex`. No non-function listeners exist today (the code comment says so), but the asymmetry means the first one silently gets weaker dedup. Fix sketch: on byKey evict, keep a `{label,event,logged,suppressed}` tombstone row, or make the index-evict mirror it. S effort, L impact (dormant).

### C — un-deduped console.* sites on repeatable paths (beyond the F5 list)

- **H6. `vfx.js` teardown family — verbatim `console.error` per resource — M, S.** `releaseVfxDynamicBufferOwner` (16973), `invokeVfxDisposer` (16984), `invokeVfxCall` (16995), root walk/detach (17040/17046), unsubscribe (1715). These run per-geometry/material/texture inside `disposeVfxRoot` — a context-loss or sector teardown burst where disposers throw en masse mints one verbatim error *per resource*. Same family as the F5 renderer resource-dispose converts — missed because these use `console.error` not `console.warn`. Fix: `dedupError` from `core/warnDedup.js`.
- **H7. `pipelineReadiness.js:203` `onRejected` default — verbatim per rejected admission — L-M, S.** The renderer's tracker doesn't pass `onRejected` (renderer.js:12122-12130), so the default `console.warn('[render] pipeline admission failed', error)` fires once per rejecting run — an invalidation storm (context loss, mass owner churn) rejects every queued/pending admission verbatim. Fix: `stormWarn`-equivalent or `dedupWarn` on a fixed site key.
- **H8. `uiStage.js` repeatable screen-path warns — L-M, S.** `part load failed` per url per mount (:864), `stage draw failed` (:414), `status listener failed` per notify (:657), `berth prewarm`/`warm-up draw` (:504/:1226). Screens mount repeatedly in flight (dock flows); a failing part warns on every mount. Fix: `dedupWarn` per site.
- **H9. `input.js` pad-verb warns — L-M, S.** `onPadButton` fires per *frame* while a pad button is held (`st.held` every update tick, :1075) — a throwing screen handler is a verbatim console storm per frame. `pad capture error` (:968) and `onEscape`/`onKey` (:273/:301) are per-event. Fix: `dedupError` per screen-def site.
- **H10. Per-event verbatim warns, lower tier — L, S each.** `openingGpuAdmission.js:56/60` (admission texture reattach — per admission leg), `killcamStage.js:107` (visual lookup per killcam), `deepSkyPlates.js:208` (per failed plate), `asteroidInstancePool.js:812` (variant retire), `partsLibrary.js:4418/4427/9193/14716` (admission-failure warns — fire once per retried job; retry budgets bound the storm but warns stay verbatim), `materialLibrary.js:233` (unknown-role — verbatim per resolve call with a bad role; only bites if a data-driven role typo slips in).
- **`_drainScreenPrewarmQueue` catches** — `console.error('[ui] prewarm/paintWarm(id)')` (uiRoot.js:1590/1598/1605) verbatim per screen per drain cycle; a failing screen re-warns each cycle. Fold into H2's fix or `dedupError`.

Already-clean (verified, don't touch): `authoredMotion.js` has its own verbatim-8 + heartbeat dedup (:55-76); `bloom.js` GPU-brick warn is sampled 1/120 + 1s heartbeat (:2090); opening pre-submit gates are cadence-gated at `refusals % 120` (renderer.js:28227/28397); `renderUpdatePhase` caps at CAP+suppression; `flightV3:214` is `_warnedBackend`-latched; `assetLoader.warnOnce`/`visualOverrides` already dedupe; shipPreview/shipShot warns are dev-tool paths.

### D — throw-through-cadence / rethrow-per-frame

Largely closed by prior waves: `invokeBusListener` swallows into `noteBusHandlerError` (no rethrow); `tryPresentedCall` epoch-latch + doubling backoff to 30s (renderer.js:2279-2304); the `_*FaultEpoch` lanes bound in-epoch retries; the `[loop] frame error` catch caps at 20 verbatim + one suppression note (presentationRunner.js:1243-1244). Remaining residual (L): a persistent per-frame fault still pays 20 full `console.error(err)` logs with Error objects before suppression, and the thrower's own `Error+stack` mint per frame is untouched — but that's in the faulting site's domain, not fixable from the catch side; `busFaultSummary` now names the owner, which is the intended diagnostic path. Optionally the 20-verbatim window could route through `stormWarn` to suppress at ~8 — S effort, marginal.

## 4. Ranked summary

| # | Finding | Effort | Magic-frame impact |
|---|---|---|---|
| H1 | pipelineReadiness quiet/maxTimer flush → whole compile cohort at timer priority | S | M (compile bursts are the named brick owner) |
| H2 | uiRoot yieldPresentationFrame inline rAF resolve → prewarm/paintWarm legs pre-present | S-M | M |
| H3 | main.js nextFrame/nextPaint inline rAF resolve → boot/restore legs pre-present | S | M (frozen-loading bar) |
| H6 | vfx teardown verbatim console.error family | S | M |
| H4 | programBinaryCache drain at timer priority (sync readbacks) | S | L-M |
| H5 | retainedDispose drain at timer priority | S | L-M |
| H7 | pipeline admission onRejected verbatim | S | L-M |
| H8 | uiStage repeatable warns | S | L-M |
| H9 | input.js per-frame pad-verb warns | S | L-M |
| B1 | busErrorIndex evicted rows invisible to faultSummary while still storming | S | L (diagnostics) |
| B2 | non-function-listener key evict re-arms verbatim budget (dormant) | S | L (dormant) |
| H10 | per-event verbatim warns, lower tier | S | L |
| D1 | [loop] 20-verbatim window → stormWarn | S | L |