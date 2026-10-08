# Wave 119 audit — popin-admission lane

Audited: master `653ad4d14` (includes upstream listener-fault rewrite `5b62cade5` and driver-bank rewrite `8ac1efd2f`; both verified present and consistent with the W118 contracts).

`saturated: false`

## Regression notes — W118 machinery verified on master

- **popin F1/F2 (softBudgetPending)** — `softBudgetPending` declared `assetResidency.js:631`, `SOFT_BUDGET_INLINE_MAX = 128` at :632. Armed at `retain()` :302-305, `releaseOwner()` :398-399, `release()` :494-495, all under the `assets.size >= 128` gate. Drained by `releaseDetachedBoundaryOwnersSteps` :460-463 (`released.length || softBudgetPending`) riding the `_pruneMotionTrackerRecordsSteps` tail (`renderer.js:23874`) under `RESIDENCY_PRUNE_SWEEP_MS = 1000` (:3888) — call sites :24519-24527, :24676-24682. Present and correctly shaped. Coverage gaps are findings F2 below.
- **popin F3 (driveCacheCleanup paced drain)** — `applySectorExitResidency` passes `driveCacheCleanup` at `assetResidency.js:1477-1478`; `sector:exit` listener `renderer.js:19284-19326` composes `releaseUnreferencedCacheOwnersSteps(primary) + releaseUnreferencedCacheOwnersSteps(postDispatch)` at :19305-19308 with a non-Steps fallback at :19298-19303. Drive loop :3193-3216 slices under `>= 4ms || pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` and debits `notePacedFrameSpend` :3215. No epoch guard — documented at :3189-3192 as deliberate cross-`enterSerial` drain. Fault path stamps `noteLaneFault(owner.state,'sectorExitCleanup')` + `laneWarn` at :3202-3203.
- **boot F1/F4/F5/F6** — `installPreparedBoundaryDisposer` captures install epoch and refuses mismatched re-install (`partsLibrary.js:9281-9318`). `composedShipSteps` mints `root.userData.visualBounds` via `expandComposedPlaceBoundsSteps` (:11073-11087); `primeDrawnCullStamps` early-outs on measured stamps (`visualCullRadius.js:377`) at the four commit sites + `visualFactory.js:5973`. `commitLegStarted` restamped after each `composeYield` (:3503, :4450-4582, :9930, :10011-10040). `_callDeserialize` pairs each restore with `yield 'x-restored'` under the `RESTORE_YIELD_SLICE_MS` gate (`saveSystem.js:4668-4688`, `_restoreChunks` :4799+).
- **lod L1-L3** — `STAGE_COLLECT_EPOCH_KEY` :7737, `collectGate` epoch-stamped :29259-29262, `collectServeLive`/pendingIter withhold :29311-29319, `parkedServeFresh` compare :29106-29114, whole-subtree withhold `syncShadowCasterPolicy(..., allowCast:false)` :11967-11969.
- **hitches H1-H6** — `composeYield` routes both rAF and 48ms-timer paths through `postTaskAtBackgroundPriorityBounded` (`partsLibrary.js:11137-11156`). `invokeBusListener` always delivers (`eventBus.js:55-58`); dedup lives in `noteBusHandlerError` keyed `${label}|${event}|${busListenerToken(listener)}` with verbatim cap + suppressed-count heartbeat — matches `5b62cade5`. `attachAuthoredMotionDriverSteps` defines `detach` before the first `yield` (:259 vs :311), `retired` guard :260, `bankTransferred=true` :365, finally-leg :367-381 picks `detach()` else raw bank loop — matches `8ac1efd2f`, no double-dispose. `dedupWarn` static keys throughout `partsLibrary.js`.

## Lane enumeration

### (a) softBudgetPending drain coverage

Arming sites: `retain` :302-305, `releaseOwner` :398-399, `release` :494-495. **The only flag-clearing consumer in the codebase is `releaseDetachedBoundaryOwnersSteps` :460-463** (and its sync twin :424-426). Enumerated consumers that should drain it and don't:

1. `releaseUnreferencedCacheOwnersSteps`/`releaseUnreferencedCacheOwners` (:881-980) — never consults the flag. It runs both the paced sector-exit cleanup and the 10s in-sector decay sweep (`renderer.js:3166-3187`, `minAgeMs:30000`, `maxCacheOnlyBytes:128MB`) — the two places mass releases actually happen — yet leaves the flag armed until the next prune sweep.
2. The `driveCacheCleanup` composition (`renderer.js:19305-19308`) — same gap; it is precisely the moment a boundary's releases peak, but its tail does not drain.
3. Sync twin `releaseDetachedBoundaryOwners` :424 — drains only when `released.length > 0`; a lone `release()` that armed the flag is not covered by this path (the Steps twin's `|| softBudgetPending` clause covers it — parity gap, fixture-class).

A lone `release()` on a ≥128-asset world therefore waits on the next `residencyPruneSweepDue` pass — ≤~1s in steady flight; longer wherever the reconcile/poll passes are skipped. Bounded; the sweep itself is the only enforcement route, so any window where it doesn't run leaves released-but-unenforced soft budget.

### (b) driveCacheCleanup iterator faults — what a mid-iteration throw skips

`renderer.js:3193-3216`: on `iterator.next()` throw, the iterator is `return?.()`'d and dropped (`owner._sectorExitCleanupIter = null`), lane-stamped correctly. Skipped: every remaining `releaseUnreferencedCacheOwnersSteps` row in the faulted leg **plus the entire not-yet-started postDispatch leg** — cache-only rows that neither leg released stay resident until the 10s in-sector decay sweep's `minAgeMs:30000`/`maxCacheOnlyBytes` caps evict them or the next `sector:exit` re-mints. `softBudgetPending` armed by the partial releases is left for the prune sweep. `packageCacheBudgetDepth` unwinds via `finally` (:884-889) — no depth leak; partial releases are monotonic-safe. Recovery path exists but is slow (up to ~30s of over-cap residency for rows under the byte cap).

### (c) budgetTotals() freshness — verified non-defect

`enforceBudget` :1369-1426 mints `budgetTotals()` (:1370) and the `entries` snapshot (`[...assets.values()].map(governorEntry)` :1371) in the same synchronous stretch — no yield between consult and census, so freshness is atomic. Mutations landing between the census and the per-candidate release are re-validated at :1382-1394 (`everyOwnerEvictable` + fresh active-request check) — fail-closed, conservative direction. Entries retained after the snapshot simply aren't in `entries` and are enforced by the next `enforceBudget`. Not a defect.

### (d) Remaining admission-path work without wallet consults or stride bounds

Ranked — findings below.

## Ranked findings

### F1 — `enforceBudget` still runs the full O(assets) governor census synchronously inside the `sector:exit` emit (impact H, effort M)

- Evidence: `applySectorExitResidency` calls `residency.enforceBudget('gpu')` synchronously at `assetResidency.js:1493-1494`, reached from the `sector:exit` listener `renderer.js:19310` in the same emit that already ran `prepareSectorExit`'s O(assets) pin. `enforceBudget` :1369-1426 unconditionally builds `entries = [...assets.values()].map(governorEntry)` — `governorEntry` :1294-1328 allocates per entry: `[...pendingRequests].some(...)` (O(assets × pendingRequests) across the map), owner-record spreads, role/tier Set dedupe — then `governor.plan` → `selectEvictions` sorts all entries and builds `entryIndexes`/`memoryUnitOwners` maps (`resourceGovernor.js:352-365`), then `afterEntries` + `blockedBreakdown` rows :1396-1401 — **all of this runs even when the budget is already satisfied** (`plan.evict` empty; the under-budget fast path at `resourceGovernor.js:340-351` still consumes the fully-built `entries` array).
- Mechanism: W118 paced the two census/release legs via `driveCacheCleanup` but left the third leg — the eviction plan — inline in the same emit. On a sector boundary this is an allocation-heavy O(A×P) walk + sort + breakdown on the frame that is also minting the incoming roster.
- Fix sketch: (i) cheap early-out — when `budgetTotals()` shows `residentBytes <= cap`, skip building `entries`/`plan`/breakdown entirely (the plan can't select anything); (ii) hoist `pendingRequests` into a single snapshot/Set consulted by `governorEntry` instead of a per-entry `[...pendingRequests]` scan — O(A×P) → O(A+P); (iii) if over-budget actually needs pacing, add an `enforceBudgetSteps` third leg to the `driveCacheCleanup` composition preserving the :1382-1394 per-candidate re-validation.
- Risk: (iii) defers real GPU releases past the emit — a brief over-ceiling window bounded by the decay sweep and next poll; (i)/(ii) are pure wins.
- Contract check: pacing defers eviction *computation*, not authored residency — no authored visual is removed early; consistent with the zero-degradation contract.

### F2 — `softBudgetPending` drains only via the 1s prune sweep; the exit/decay sweeps that do the releases never clear it (impact M, effort S)

- Evidence: enumeration (a) above. Clearing consumer set = {`releaseDetachedBoundaryOwnersSteps` :460, `releaseDetachedBoundaryOwners` :424 conditional}. `releaseUnreferencedCacheOwnersSteps` :881-980 — the lane that actually releases render-package/decode-cache mass — never consults it, and the `driveCacheCleanup` composition's tail has no drain step.
- Mechanism: after a release burst (sector exit, decay sweep), soft-budget enforcement is deferred to the next prune sweep (~1s in flight, longer where reconcile is skipped). During that window `retain`/`release`/`releaseOwner` keep arming a flag nobody drains; soft-owner growth between the release and the sweep is unenforced.
- Fix sketch: append `if (softBudgetPending) { softBudgetPending = false; yield* enforceSoftResidencyBudgetsSteps(); }` to the tail of the `driveCacheCleanup` composition (and/or inside `releaseUnreferencedCacheOwnersPassSteps` after its release leg); align the sync twin's condition to `released.length || softBudgetPending` for parity.
- Risk: low — identical census, just an additional drain site; `enforceSoftResidencyBudgetsSteps` is already paced (yields per entry, `packageCacheBudgetDepth`-guarded :676-710).

### F3 — a `sectorExitCleanup` iterator fault discards the un-started postDispatch leg entirely (impact M, effort S–M)

- Evidence: `renderer.js:3199-3206` — catch → `laneWarn` + drop; no re-drive. The composed iterator is a single generator over both legs, so a fault in leg 1 also forfeits leg 2.
- Mechanism: cache-only rows scheduled for release sit resident until the 10s decay sweep's 30s-age/128MB-byte gates (or next exit). Under-cap rows can ride the whole inter-sector gap.
- Fix sketch: on fault, park a degraded re-mint — next poll, mint a fresh single-leg `releaseUnreferencedCacheOwnersSteps(postDispatchReason)` so the second half isn't lost; or stamp a `sectorExitCleanupFaulted` flag the next `applySectorExitResidency` consults to re-run the un-drained legs.
- Risk: low — re-minted iterator re-walks live `assets`; releases remain monotonic (already-established invariant).

### F4 — `handoffWarmOwnerWhenCovered` scans all `warmAssets` per `retain()` while a warm owner is armed (impact M, effort M)

- Evidence: `assetResidency.js:309-322`, invoked from `retain()` :295. During the post-exit warm window (`warmOwner` non-null), each of the N admissions arriving pays O(K × owners-per-entry) over K warm entries plus a `[...entry.owners.keys()]` alloc per entry — O(N×K) across a burst.
- Mechanism: the coverage probe iterates every warm entry to test whether the newly retained entry covers it; the warm set is largest exactly when admissions are densest (post-jump).
- Fix sketch: pre-filter warm entries by `warmEntry.owners.has(warmOwner)` before the coverage probe, or gate the scan behind a cheap bounds-overlap test so non-overlapping warm entries skip the owner walk; alternatively index warm entries by sector/bounds at pin time.
- Risk: behavioral — handoff timing/order must stay identical; verify `warm-sector-handed-off` emit count/order unchanged.

### F5 — `rotateSector`/`prepareSectorExit` per-entry `asset-retained` emits inside their synchronous census (impact L, effort M)

- Evidence: `retain()` emits `asset-retained` per call (:283); `rotateSector`'s previous-sector census (:1077-1089) and `prepareSectorExit`'s pin loop (:1108-1116) call it once per matching entry inside the `sector:enter`/`sector:exit` emits; `invokeBusListener` always delivers (`eventBus.js:55-58`), so each emit fans out synchronously to every subscriber.
- Mechanism: on a K-entry prior sector the emits alone add K listener invocations on top of the O(assets × owners-per-entry) metadata scan — inside the emit frame, on top of F1.
- Constraint: the census + pin itself is the documented "pins synchronously" contract and cannot be paced (the warm lease must exist before the old sector's census releases). Only the per-entry emit fan-out and scan cost are movable.
- Fix sketch: batch/suppress `asset-retained` during bulk pins (emit a single `assets-retained-bulk` detail with the key list), or pre-index `assets` by `metadata.sectorId` so the census doesn't re-scan every row's owner metadata per rotation.
- Risk: emit-shape change touches subscribers (diagnostics/telemetry listeners must accept the bulk form); scan-index change touches every retain/release mutation site — moderate.

## Deferred/dedup notes

- `prepareSectorExit`/`rotateSector` synchronous pin: contract-bound ("pins synchronously"), not re-reported as a pacing finding — only its internal constant factors appear in F5.
- `budgetTotals` consult→census atomicity and per-candidate re-validation: verified sound ((c) above).
- Admission job lane (`admitNextUpgradeJob`, `partsLibrary.js:7643+`): verdict memoization, forced-wallet consult (`:7669`), one pick per scheduled frame — already paced; no residual.
- Not re-reported per adjudicated/deferred lists: `post-opening-pipeline-admission`, `authored-critical-admission-order` (preexisting test failures), and all prior-wave KEEP/WONTFIX items.
