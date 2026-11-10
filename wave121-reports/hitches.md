# Wave 121 — in-flight-hitches audit

- lane: **in-flight-hitches** (timer-priority dispatches resuming paced work, dedup heartbeat cost, warnDedup cap pressure, throw-through-cadence sites)
- audited: `devin/1791504143-perf-w120` @ `0917823d6bbba02c71e379ca05ceef3a1fac5f96`
- **saturated: true**

Evidence: all findings are MECHANISM_VERIFIED in source. This box is SwiftShader — GPU/frame-time
claims are hardware-unverified; where a finding's materiality depends on per-frame ms it is marked
UNVERIFIED rather than PERFORMANCE_VERIFIED.

Verdict: the W120 resume-seam machinery holds at this HEAD — every dispatch path enumerated under
hunt item (a) either resumes at background priority post-present or arms a paced drive without
running work inline. The two open items below are LOW materiality / UNVERIFIED and are recorded for
the ledger, not as a blocker to saturation: no MATERIAL evidence-supported optimization remains in
lane scope.

## Ranked findings

### F1 — dedup heartbeat cadence is a flat 1 s with no backoff

- Evidence: `src/core/warnDedup.js` suppressed-count heartbeat — after the ≤8 verbatim window a
  faulting site prints `'${site}' faulted ${suppressed} more times; latest:` once per ≥1000 ms
  while the fault persists; same shape in `laneWarn` `src/render/renderer.js:2207-2239`
  (post-`LANE_WARN_BUDGET_PER_EPOCH` heartbeat) and `noteBusHandlerError`'s suppressed path
  `src/core/eventBus.js:79-160`. Sites that fault *continuously* (per-frame, not per-burst): a
  presented tail inside its first faults before backoff decays, a persistently-faulting bus
  listener at emit cadence, `sectorSim/_guard` sites `src/systems/sectorSim.js:1013-1015` on a
  per-tick fault, `stormWarn`/menu-warm catch sites. During a multi-site storm window (sector
  transition with N faulting lanes) the heartbeat cost is ~N console.warn + argument-serialize
  (incl. Error objects → stack-string serialization) per second — bounded but flat forever.
- UNVERIFIED: per-second warn cost is ~0.1–0.5 ms on this box's console path, so a single stormer
  is immaterial; only a correlated N-site storm (e.g. 8+ lanes faulting through one boundary)
  plausibly reaches ~1 ms/s — and those storms are exactly when the main thread is tightest.
- Fix sketch: exponential heartbeat — double the ≥1000 ms interval per heartbeat up to a 30 s cap,
  reset on epoch flip / heal (the exact shape `tryPresentedCall` already uses for its `retryAt`
  at `renderer.js:2300-2307`). Cheap, same observability (count still reported at each print).
- Effort **S**, magic-frame impact **L**, risk: none — warn cadence is diagnostic-only.

### F2 — `afterBrowserPaint` final hop still lands inside frame N+1's rAF task

- Evidence: `src/render/renderer.js:32185-32199` —
  `requestAnimationFrame(() => { scheduleLater(() => requestAnimationFrame(callback)); })` runs
  `callback` *inside* the second rAF invocation, i.e. pre-present of frame N+1 — the surface shape
  W120 closed everywhere else (rAF→background-post instead of rAF→rAF). Only in-flight consumer
  is `applyFirstPlayablePaintRelease` (`renderer.js:32040+`, armed once) plus the
  opening-first-draw diagnostics arm (~28600) — both one-shot opening-window paths.
- MECHANISM_VERIFIED immaterial: everything the release callback does is already paced or an
  early-out — `_parkBoundedWarmRoots` debits `pacedFrameSpend` per root and self-continues via
  `setTimeout(0)` when the wallet is spent (`renderer.js:22765-22790`);
  `resumeDeferredPipelineAdmissions`/`resumeAuthoredUpgradeQueueAfterOpening` are flag flips +
  `scheduleNextUpgradeFrame` arm (`partsLibrary.js:6207-6240`,
  `pipelineReadiness.js:651-661` — `resumeAutoFlush` itself gates on `deferAutoFlush()`);
  `gate.resolveRelease()`'s awaiters do **not** continue inline — they enqueue on
  `render._openingPublicationResumeQueue` via `paceOpeningPublicationResume`
  (`partsLibrary.js:6821-6930`) and drain ≤`OPENING_PUBLICATION_RESUME_MAX_BATCH` per presented
  frame inside `armCallbackAfterPresent`, with paced+forced ledger debits, skip-cap ≤2 forced
  leg, and a 2000 ms escalate head-insert. The rAF-slot defect class is already closed by the
  paced resume queue downstream, so the pre-present dispatch costs a cheap closure + flag work.
- Fix sketch (optional hardening): route the second hop through
  `postTaskAtBackgroundPriorityBounded(callback)` instead of a nested rAF — same post-present
  contract as every other seam, keeps `setTimeout(next,0)` fallback for no-scheduler contexts.
- Effort **S**, magic-frame impact **L** (opening window only, work already ledgered), risk:
  low — but also low value; record only because the shape survives.

### F3 — per-emit throw mint inside a persistently-faulting bus listener (documented contract)

- Evidence: `invokeBusListener` `src/core/eventBus.js:79-160` invokes the listener every emit —
  fault history suppresses *logs*, never delivery ("the next payload can be valid"). A listener
  that throws per-emit pays the thrower's own `Error` mint + stack capture at emit frequency
  (e.g. a presentation-tier listener faulting at frame cadence). `noteBusHandlerError` dedups
  the warn side; the throw cost itself cannot be deduped without skipping delivery — an explicit
  semantic contract the in-flight lane cannot re-adjudicate.
- MECHANISM_VERIFIED, no in-scope fix: `busFaultSummary(limit=8)` already surfaces the top
  faulting listeners for the triage lane; the correct remediation is fixing the thrower, which
  is a per-bug item, not a scheduler/ledger fix. Recorded for completeness; **DOCUMENTED** status.

## Hunt coverage

### (a) timer-priority dispatches resuming paced work — enumerated, all closed

Every callback registered via `setTimeout`/`rAF`/promise that can resume paced work, verified at
audit HEAD:

| Site | Verdict |
|---|---|
| `armCallbackAfterPresent` `compilePresentSlice.js:359-372` | rAF + `setTimeout(48)` both → `postTaskAtBackgroundPriority` — closed |
| `main.js:1349-1390` `nextFrame`/`nextPaint` | rAF resolves via `postTaskAtBackgroundPriorityBounded`; `frameWaitStarved≥2` → probe + `setTimeout(0)` — closed |
| `uiRoot.js:157-171` `yieldPresentationFrame` | `setTimeout(250)` + rAF → `clearTimeout` + bounded post — closed |
| `pipelineReadiness.js:247-266` `scheduleFlush` | `deferAutoFlush()` gate → `scheduleResumedBatch`; quiet/max timers → `armCallbackAfterPresent({idleBoundMs:48})` — closed |
| `programBinaryCache.js:209-217` `scheduleDrain` | bounded post — closed |
| `partsLibrary.js:9467-9520` `scheduleRetainedDisposeDrain` | bounded post; drain consults `pacedFrameSpend` + `forcedFrameSpend`, skip-cap ≤2 → forced leg — closed |
| `partsLibrary.js:~11197` `composeYield` | rAF + `setTimeout(48)` → bounded post — closed |
| `gpuQueuePace.js:31-51` `waitForPresentedFrame` | unstick timer → `schedule(resolve)`, callers pass bounded post — closed |
| `saveSystem.js:4747` `_restoreFrameYield` | rAF → `postRestoreTaskAtBackgroundPriorityBounded(resolve)`, starved ≥2 → `setTimeout(0)` + probe — closed |
| `core/backgroundPost.js` | `postTaskAtBackgroundPriorityBounded(cb, boundMs=48)` = `scheduler.postTask` background + `setTimeout` bound; render-free (no three import) — closed |
| `partsLibrary.js:6462-6469` `heldShipWakeTimer` | `setTimeout(100)` → `scheduleNextUpgradeFrame(state)` — arms a paced drive, no inline work — clean |
| `partsLibrary.js:6649-6664` `stalledHogWakeTimer` | fires `abortStalledOrInactiveUpgradeJobs` (O(in-flight serial cap)) + `scheduleNextUpgradeFrame` — clean |
| `partsLibrary.js:2730-2752` `scheduleRefusalTriggerRearm` | `setTimeout(1s)`/`visibilitychange` → `arm()` (re-request, not a drain) — clean |
| `renderer.js:22771-22786` `_warmRootParkContinuation` | `setTimeout(0)` re-entry of the paced park loop itself — the defer mechanism, not a defect — clean |
| `renderer.js:18697-18707` crucible-warm discard | `setTimeout(0)` guard-check + discard, best-effort catch — clean |
| `core/simTransport.js:88` | `queueMicrotask` delivery — deliberate async boundary — clean |
| `core/bootScheduler.js:17-26` `yieldForBootPaint` | rAF → `setTimeout(0)` resolve (timer-priority, pre-present for its beat) — but consumers are `bootSystemInit`/`bootEntry` only; boot lane scope, not in-flight |
| `afterBrowserPaint` `renderer.js:32185` | pre-present inner rAF — F2 above; resumed work already ledgered |

No remaining callback resumes paced work inline. The only pre-present dispatch left (F2) drives
work that is itself paced.

### (b) dedup heartbeat cost — covered by F1

Continuous-fault (per-frame cadence) sites exist in principle: `tryPresentedCall` tails before
backoff, faulting bus listeners, `sectorSim/_guard` labels (7-site bounded domain — fixed label
set, not per-entity). The heartbeat is the residual logging cost once a site storms; F1 proposes
the exponential-backoff cadence fix. Materiality LOW/UNVERIFIED on SwiftShader.

### (c) warnDedup 256-oldest-evict cap — no pressure (MECHANISM_VERIFIED negative)

~90 distinct `dedup`/`dedupWarn`/`dedupError`/`stormWarn` site keys enumerated across `src/**`,
all fixed string constants; the only parameterized family is `sectorSim/guard/${label}` with a
bounded 7-label domain. Max live rows ≈ 97 « 256 — a still-active stormer's row cannot be evicted
by distinct-site pressure at the current inventory. `laneWarn` rows live on `render.laneWarns`
keyed by ~85 fixed lane labels — same bound. Cap only becomes live if the site inventory grows
≈2.6×; not a finding.

### (d) throw-through-cadence / rethrow-per-frame — ranked

1. Bus listeners per-emit — F3 (documented contract, thrower-side fix only).
2. `tryPresentedCall` tails — already decayed: epoch latch + doubling `retryAt` 1 s→30 s cap +
   reset-on-heal (`renderer.js:2280-2311`). Residual = one Error mint per retry, ≤1/30 s — closed.
3. Presentation-row faults — `notePresentationRowFault` parks a row after 3 faults at ≥1 s spacing
   for the epoch (`renderer.js:2243-2279`); transient ≤3 heals serve last pose — closed.
4. `laneWarn` storm suppression — epoch budget + 1 s heartbeat (F1 for cadence shape only) — closed.

## Regression verification — W120 hitches machinery (all PASS @ `0917823d`)

- **H1** `scheduleFlush` triple-gate (`deferAutoFlush` / `boundedResume` / quiet-max timer →
  `armCallbackAfterPresent`) — `pipelineReadiness.js:247-266` ✓
- **H2** `nextFrame`/`nextPaint` bounded-post resolve + starvation probe — `main.js:1349-1390` ✓
- **H3** `yieldPresentationFrame` 250 ms bound + rAF → bounded post — `uiRoot.js:157-171` ✓
- **H4** `scheduleDrain` → `postTaskAtBackgroundPriorityBounded` — `programBinaryCache.js:209-217` ✓
- **H5** `scheduleRetainedDisposeDrain` bounded post + dual-ledger skip-cap-≤2 forced leg —
  `partsLibrary.js:9467-9520`, compose yield `:~11197` ✓
- **H6-H10** dedup sweep sites are all site-keyed constants (no parameterized keys found);
  `busErrorIndex` LRU `delete`+`add` recency refresh + `busErrorRowsByKey` tombstone on evict,
  caps 256/512 — `eventBus.js:40-160` ✓
- **Restore slice seams** `_restoreFrameYield` rAF→bounded-post + starved probe — `saveSystem.js:4747`;
  `_restoreCombatSteps`/`completeRestoreSteps` twins — `physics.js:392-447`,
  `sg02DynamicBodyOwner.js:740-810` ✓
- **`backgroundPost.js` render-free** — no three.js import, shared by ui/main/save paths ✓

## Regression verification — W120 popin machinery (all PASS)

- **P1** pending-keys set is now an incremental refcounted set (`activePendingRefcounts` +
  `notePendingRequestActivated`/`deactivateRequest`, `assetResidency.js:79-105`) — the W121 popin
  commit landed this lane-auditor's prior F3 fix; every `request.active` transition funnels through
  activate/deactivate, `activePendingKeySet()` readers unchanged ✓
- **P3** `softBudgetArmSuppressed` guards both arm sites (`assetResidency.js:491`, `594`) and wraps
  release() in both evict loops (`:942`, `:968`); `releaseDetachedBoundaryOwners(Steps)` drains
  when `released.length || softBudgetPending` (`:516`, `:552`) ✓
- **P4** `enforceBudgetSteps(kind='gpu', batchEntries=256)` `assetResidency.js:1644` yields per
  batch with byte-identical plan/receipt; `applySectorExitResidency` honors
  `options.deferBudgetEnforce`; fused leg-3 `yield*` chain + no-Steps fallback — `renderer.js:19322-19365` ✓
- **lod W120** Bolus intensity-0 keep-in-scene (`bolusView.js` — numPointLights program-key
  stable), leftover eval dual-sig + `shadowCensusEpoch`/`pendingIter` invalidation
  (`renderer.js:30858-30895`), bulk re-stage reachability-pruned forest with
  `SHADOW_DEPTH_ARM_COLLECT_MS` deadline + per-root fallback (`shadowDepthAdmission.js:635-723`,
  call `renderer.js:30400-30480`) ✓

## Deferred / wontfix boundary

Per the brief's adjudicated list: F4/F5/F9 tick-paced emit slicing and F6 combat:damage payload
interning remain deferred — no new mechanism evidence found to reopen them.
