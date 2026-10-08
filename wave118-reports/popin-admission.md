# Wave 118 — popin-admission audit

Branch `devin/1791416524-perf-w110`, HEAD `99784b9cb` (includes `dddd0e7fe` W117 lod+popin+boot and `eadb72d4d` W117 hitches). Read-only audit; no code, no PR, no app run.

## `saturated: false`

## W117 regression verification — all pass

- **popin P4** — `release()` runs `enforceSoftResidencyBudgets()` inline only while `assets.size < SOFT_BUDGET_INLINE_MAX` (128) else arms `softBudgetPending` (assetResidency.js:464-484, const at :619); `releaseDetachedBoundaryOwners` clears+enforces when `released.length` (:397-416), `releaseDetachedBoundaryOwnersSteps` clears+enforces on `released.length || softBudgetPending` and yields through the census (:423-452). Sole flag consumer confirmed: `_pruneMotionTrackerRecordsSteps` → `releaseDetachedBoundaryOwnersSteps` inside the ~1 s `RESIDENCY_PRUNE_SWEEP_MS` sweep, driven from reconcile (renderer.js:24399-24407) and the residency poll (:24556-24564).
- **popin P5** — `_withheldDepthGens` mints scalar `{seq, roots: WeakMap, sets: WeakMap}` gens (:29943-29953); the strike binds `{rootGen, setGen}` (:29987-30001) so a re-minted Set's members re-probate from zero and dead roots/Sets GC their memo rows — no memo poisoning on remount. Undrawn stamping records the set gen at settle (:30421-30440); drawn members delete their row (:30430).
- **popin P6** — `pendingSeq` bumps at all three mutation sites (liveGeometryAdmission.js:111 enqueue, :297 pickNextWhere, :384 collectBatch); `stats()` memoizes `ids`/`types` behind `statsPendingSeq` capped at 24 (:407-444), `urgentQueued` live-scanned, `EMPTY_PENDING_LIST` when idle. Sole array consumer slices — no stale-membership reader mid-consume.
- **lod F1** — all four stale-serve consults gated: admission collect skips (:11894-11902), policy lane leaves `unstaged` null + stays dirty (:29148-29168), coverage walk sets `coverageWalkInFlight` (:29363-29384), OFF→ON toggle queues whole-subtree (:30760-30796).
- **lod F2** — leftover eval dropped `casterDepthMarkAnyCurrent`; live sig only served while `memo.epoch === shadowCensusEpoch() && !pendingIter`; `leftoverSigs` dedupes {pinned, live} (:30541-30571).
- **lod F3** — arm consult dual-sigs `{collectSig, fresh live}` (:30184-30217), `cache.meshes = live` membership re-prove intact.
- **boot F3** — `noteLaneFault`/`serviceFaultEpoch` in src/core/warnDedup.js (:58-80); `attachAuthoredMotionDriverSteps` banks drivers and `bankTransferred` gates the finally-dispose (:184-189, :359-368); `detachAuthoredMotionDriver(state)` stamps `teardown.authoredMotion.driverDispose` (:259-271); `driveAuthoredBuildStepsAsync` threads `options.state || options.renderer.state` (:11216). One residual call-site hole → finding F4 below.
- **boot F4/F5** — stale-gate on the upgrade path and `installPreparedBoundaryPublisher` installedEpoch refusal (:9354-9370) verified.
- **boot F6** — driver-bank disposal on abandon verified (above).
- **boot F7** — commit-tail pacing verified: cargo leg `__socketCache` :3460 → `await composeYield()` :3466 → publish def :3476 → `installPreparedBoundaryPublisher` :3501; `installAuthoredLod` :3596 → yield :3597 → `updateLod('lod0')` :3598; pre-graft stale re-gate (epoch + `isAbortedStalledAdmission` + `entity.alive === false` + `!boundary.parent` dispose) at :3370-3388.
- **hitches F1-F5** — `notePolicyRootFault` dirtySeq stamp + jittered `deferUntil` (:32165-32193), park gate honours deferral only within the faulted generation incl. `faultRec.epoch === serviceFaultEpoch` (:32203-32206), `_invalidateShadowPolicy` clears only `deferUntil` (:28886-28890), `tryPresentedCall` 1 s→30 s doubling backoff with reset-on-heal + per-epoch warn latch (:2272-2300, `PRESENTATION_ROW_FAULT_MAX=3` :2241, row-quarantine :2257-2263), `serviceFaultEpoch` WeakMap memo (warnDedup.js:58-69).

## Residual-class answers

- **(a) who enforces `softBudgetPending`**: only the two release twins, reached solely via the ~1 s prune sweep (reconcile + residency poll). A lone `release()` outside teardown (aborts, governor evictions inside `enforceBudget` :1368, `evictOldestSoftEntries` rows) re-arms the flag and the next sweep drains it — enforcement latency ≤ ~1 s while drivers run; during menu/loading the flag persists but nothing presents, so the overage is invisible and bounded. The flag contract itself is sound. The real (a) gaps are the paths that never consult the flag at all — F1 and F2 below.
- **(b) withheld-gens WeakMap lifetimes**: sound — scalar gens mean a remounted root's stale generation cannot poison compares (a fresh Set mints a fresh `setGen`; strikes bind `{rootGen, setGen}`). One aliasing wart → F5.
- **(c) `statsPendingSeq` staleness**: sound — all mutation sites bump it and the sole consumer slices.
- **(d) unbounded admission-path work**: `pickNextWhere`/`collectBatch` scans are O(pending) per drain — amortized across presents, fine. The remaining unbounded burst is the sector-exit residency seam → F3.

## Findings (ranked)

### F1 (M/S) — `retain()` pays the soft-budget census inline unconditionally for soft owners

`assetResidency.js:299` — `if (isSoftResidencyOwner(ownerMetadata)) enforceSoftResidencyBudgets();` has no `assets.size < SOFT_BUDGET_INLINE_MAX` gate; the P4 gate exists only on `release()` (:481). Every render-package-cache/decode-cache/runtime-cache lease walks the whole asset map (owner-scan per entry + 2 candidate arrays). During a decode-runway drain or sector warm burst, K package retains land in the same commit continuation → K × O(assets × owners) on the presented thread — the identical storm shape P4 fixed on the release side. `retain()` additionally runs `handoffWarmOwnerWhenCovered` (:295) per non-warm retain → O(warm-assets × owners) each, another K × O(N) term during sector transitions.
**Fix**: same deferred-flag idiom — `if (assets.size < SOFT_BUDGET_INLINE_MAX) enforceSoftResidencyBudgets(); else softBudgetPending = true;` The sweep already enforces on `released.length || softBudgetPending`, so a retain-armed flag drains even with zero detached owners. Deferral is strictly safe: retains are admission, not teardown; enforcement latency ≤1 s matches the P4 contract.
**Effort S · magic-frame impact M · risk L** (small-world behavior identical; large-world enforcement becomes deferred, same as P4).

### F2 (M/S) — non-deferred `releaseOwner()` census + per-detach `boundary-removed` listener

`releaseOwner` :366-388 — `if (released > 0 && !deferBudgets) enforceSoftResidencyBudgets();` is unconditional on registry size. The `owner.addEventListener('removed', …)` hook at :131 calls `releaseOwner(owner, 'boundary-removed')` with `deferBudgets=false` — a mass boundary teardown (sector unload, entity batch despawn) dispatches K `removed` events synchronously → K × O(assets) census inline. Other ungated callers: `handoffOwnerWhenCovered` (:460), `warm-sector-expired` at `rotateSector`/`prepareSectorExit` (:1046, :1081). (`disposeAll`'s owners loop :1133 is `packageCacheBudgetDepth`-guarded — already covered.)
**Fix**: gate the census identically (`assets.size < SOFT_BUDGET_INLINE_MAX` → inline, else arm `softBudgetPending`), or pass `deferBudgets=true` from the removal listener — the prune sweep drains the flag.
**Effort S · impact M · risk L-M** (teardown ordering unchanged; enforcement deferral only on big registries).

### F3 (M-H/M) — `sector:exit` runs a synchronous multi-pass residency burst mid-flight

`renderer.js:19192` — the bus handler calls `applySectorExitResidency` synchronously on dispatch, at the moment the player crosses the boundary:
- `prepareSectorExit` — full `assets.values()` census with per-entry owner scans + a `retain` per matching entry (:1084-1093);
- `releaseUnreferencedCacheOwners` **sync twin** — minAge + byte-budget census, per-candidate owner-release loop, `evictIfUnowned` GL disposes (:1446-1447). The `*Steps` twin exists (:868, exported :1414) but has **no caller**;
- `enforceBudget` — two full `diagnostics()` frozen-row builds (:1346, :1373) + a `[...assets.values()].map(governorEntry)` census before AND after the evict loop (:1347, :1372) + the evict loop itself;
- plus a `queueMicrotask` second cache-census (:1454).

Several O(assets × owners) passes + GL disposes land atomically in one emit — a visible hitch exactly at sector transitions, precisely when pop-in protection matters most. (`diagnostics()` alone builds sorted frozen owner rows across the whole registry — twice.)
**Fix**: drive the exit cleanup through `releaseUnreferencedCacheOwnersSteps` paced under the residency poll (the warm-owner pins are already minted by `prepareSectorExit`, so deferred cleanup is contract-safe); make `enforceBudget`'s diagnostic snapshots lazy or share one census; the microtask second pass can ride the same iterator.
**Effort M · impact M-H · risk M** (eviction window lengthens by a sweep interval on big worlds; pins already transferred so no residency correctness change).

### F4 (L/S) — place-fallback teardown calls `detachAuthoredMotion` without forwarding `state`

`partsLibrary.js:17135` (`disposeDetachedPlaceFallback`) and `:17185` (`disposeDetachedPlaceFallbackSteps`) invoke `detachAuthoredMotion?.()` bare while `disposeDetachedAuthoredCargoCapsule` (:3529-3531) and `driveAuthoredBuildStepsAsync` (:11216) forward `state`. Same hole at `ceresCradleLayoutVisuals.js:97` (`root.userData.detachAuthoredMotion?.()`). W117 boot-F3 made detach stamp `noteLaneFault(state, 'teardown.authoredMotion.driverDispose')` per driver-dispose fault — with `state` dropped, `noteLaneFault(null)` silently no-ops, so the `laneFaults` rollup never sees teardown faults on these paths and the ≥3-fault park can't engage (outer catch only fires on a whole-detach throw).
**Fix**: forward `state` (both twins have it in scope); pass `null`→state through the cradle call site's registry.
**Effort S · impact L (diagnostics) · risk L**.

### F5 (L/S) — undrawn consult strikes unevidenced members on `undefined === undefined`

`renderer.js:29979-29980` — `undrawnSeen.get(rescueMesh) === withheldGens.sets.get(rescueWithheld)` is true when **both** are absent: a member never stamped undrawn on a set that never minted a gen reads `undefined === undefined` → spurious "dead" verdict → probation strike minted (`:29998`) → `rescueAllCurrent = false` → the root's rescue is vetoed for that eval. Self-heals next eval (the strike records real gens; `undefined !== gen` thereafter), so the cost is one extra policy drive of withheld casters per set on its first rescue consult — withheld meshes stay flagged one eval longer than necessary.
**Fix**: `const strikeGen = undrawnSeen && undrawnSeen.get(rescueMesh); const undrawn = strikeGen != null && strikeGen === withheldGens.sets.get(rescueWithheld);`
**Effort S · impact L · risk L**.

## Out of scope / deliberately not re-reported

Per do-not-report list: all W1-W116 landed items, deferred/wontfix rows (BatchedMesh specimen gap, BOOT-F3(a), emit slicing, combat:damage intern), preexisting test reds. `pickNextWhere`/`collectBatch` O(pending) scans are amortized one-pick-per-present — no finding. `disposeAll`'s census loop is `packageCacheBudgetDepth`-guarded — no finding.
