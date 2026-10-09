# wave-124 audit — popin-admission lane

Audit branch: `devin/1791504143-perf-w120` @ `f33dc3058` (HEAD — waves 120-123 all present
on PR #257). Audit-only: no code written, no PR, no app run. Micro-bench:
`wave124-popin-bench.mjs` (session-local, not committed) against the extracted
`resourceGovernor.js`, node24 `/c/hostedtoolcache/node/24.0.1/x64/node`, one process.
SwiftShader box: all timings are CPU-scope; no GPU-cost conclusions drawn.

```yaml
saturated: false
```

## Ranked findings

### F1 — `rotateSectorDeferred` mints its previous-sector snapshot on a stale `currentSectorId` under FIFO chaining
**MECHANISM_VERIFIED.** `rotateSectorDeferred` (`src/render/assetResidency.js:1767-1810`)
derives `previousSectorId = currentSectorId`, snapshots that sector's `sectorOwnerIndex`
rows, and stamps the warm owner `{sectorId: previousSectorId}` — all **eagerly at call
time** — but only repoints `currentSectorId = exactNext` at the *end* of the returned
generator (`:1805`). Both queue sites (`renderer.js:19553-19566`
`queueResidencyWarmMint`, and W123's new `queueWarmMint` hook minted in the same commit at
`renderer.js:19795-19805` feeding `assetLoader.js:1004-1007`) append the iterator behind a
possibly-still-draining `_sectorExitCleanupIter`. Any residency op minted while an earlier
iterator is queued therefore reads a `currentSectorId` that lags one pending rotation:

- **Common case (2 ops):** sector:exit A queues `[warmMintA, sweeps, enforce]`
  (`renderer.js:19383+`); sector:enter B mints `rotateSectorDeferred(B)` while `warmMintA`
  still drains. `warmSectorId` is not yet A → the `warmOwner && warmSectorId ===
  currentSectorId` cheap path (`:1770`) misses → a full iterator is minted. When it finally
  runs it executes `releaseOwner(warmOwner, 'warm-sector-expired')` (`:1784`) **on the warm
  owner exitA just minted**, then re-retains the same A rows under a second owner and pays a
  second `mintWarmCoverageSteps` — the O(sector) release+retain+coverage is done **twice per
  crossing**. The window between `releaseOwner` and the re-retain loop is crossed by a
  `yield` (`:1785`), so the freshly-released rows sit unheld for a beat with enforce legs
  queued behind them.
- **3-op case (A→B→C inside one drain window):** rotateC mints while `currentSectorId` is
  still A → snapshots A's rows, stamps owner `sectorId:A`. Drain ends with `warmSectorId=A`
  and `currentSectorId=C`: the genuinely-previous sector B never receives warm coverage —
  a backtrack into B pays a cold decode (the lane's exact defect), and any correctly-minted
  warmB coverage is released to make room for the stale one.
- **Dropped reversal:** a B→A rotate minted while A→B is still queued evaluates
  `exactNext === currentSectorId` on the stale A (`:1769`) → returns `false`, nothing
  queues — the pending iterator still lands `currentSectorId=B` while the player is in A.
  The residency sector pointer drifts one hop behind the world from there.
- `sector:exit`'s `driveCacheCleanup` abandons the whole chain via
  `_sectorExitCleanupIter?.return?.()` (`renderer.js:19363`): a queued rotate mint is killed
  mid-flight — the `finally` releases its partial owner correctly, but `currentSectorId`
  never repoints while the caller already reported `rotated`.

`retain()` fails closed on evicted keys (`:343`), so this is wrong-sector/absent coverage,
not resurrection. **Fix sketch:** defer the previous-sector derivation into the generator's
first step — re-read `currentSectorId`/`sectorOwnerIndex` there (the eager snapshot exists
to capture qualification "while owner qualification still reflects the departing sector";
at first `next()` the true departing sector *is* current, which is strictly more correct
under chaining) — or maintain a `pendingSectorTarget` stamped at call time that the
same-sector guard and cheap path consult alongside `currentSectorId`.
**Effort M · Impact M-H · Risk M** (emission order of `sector-rotated` must stay FIFO;
the cheap path semantics for tests pinning `rotated` receipts must be preserved).

### F2 — `freedBytesForSelection` re-scans every memory unit per selected eviction — the residual superlinear leg inside `selectEvictions`
**MECHANISM_VERIFIED + CPU-measured.** W123 folded blockedRows/blockedReasons/
memoryUnitOwners into the census, but the selection loop in `selectEvictions`
(`src/render/resourceGovernor.js:354-366`) still calls
`freedBytesForSelection(memoryUnitOwners, selectedIndexes)` (`:130-145`) **once per selected
entry** — an O(units × owners-per-unit) rescan each, i.e. O(S·U·E) per plan. This runs
atomically inside `enforceBudgetSteps`' single `governor.plan(...)` call
(`assetResidency.js:2290`; sync twin `:2158`) — the stepped pacing yields between census
batches and evict candidates but **cannot slice inside the plan call**, so the whole
selection leg lands as one task per over-budget enforce (sector:exit drive leg 3, plus
every soft-budget drain).

Measured on this box (synthetic census, 2 memory units/asset — the memory-model path is
the common GPU path — 30% blocked, budget at 60% of resident bytes): **N=4000 plan =
150.7ms** of which the per-selection rescan cost-model measures **139.2ms (~92%)**;
**N=8000 plan = 624.7ms**, rescan model **670.1ms**. An incremental remaining-count
(remaining = |unit.entryIndexes|, decrement per selected owner index, `freed += unit.bytes`
at 0 — exact `allSelected` semantics, shared units never free while a blocked/unselected
owner remains) measures **0.43ms / 1.07ms** — a ~150-600× cut on the dominant leg. It also
deletes the O(A) `entryIndexes` map (`:355`), which exists only to feed `selectedIndexes`.
**Fix sketch:** build `entry → units` (already computed as `memoryUnitList(row)` or the
`{identity: row, bytes}` effective unit in the census) and a `unit → remaining` counter
alongside `memoryUnitOwners`; iterate the *selected* entry's unit list instead of all units.
**Effort M · Impact H · Risk M** (eviction *order* is untouched — identical selection
sequence and receipt; the freed formula is the only change, and direct `selectEvictions`
callers keep the map-based fallback).

### F3 — `sectorPrewarmRequests` pays an O(entityList) census per query — no sector→entity index
**MECHANISM_VERIFIED.** `sectorPrewarmRequests` (`renderer.js:18756-18763`) calls
`authoredPrewarmRequestsForEntities(state.entityList, { sectorId, ... })`
(`partsLibrary.js:1361+`), which walks the whole entity list and filters on
`entity.homeSectorId || data.homeSectorId || data.sectorId` per row. It runs at every
`refreshSectorPrewarmPopulation` (`renderer.js:19120-19127` — each
`beginIncomingSectorPrewarm` arm), inside `validateCurrentSectorPrewarmPopulation`
(`:18785-18795` — each certification check), and per `census(sectorId)` in
`updatePredictedSectorPrewarmSteps` (`:6840`, `:6900+` — each predicted-warm arm at the
residency poll). The selectivity is sector-wide but the walk is world-wide; crossing volume
therefore scales with *global* entity count, not sector count. **Fix sketch:** a
`Map<sectorId, entity[]>` member index maintained at the entity-spawn/despawn/
homeSector-write funnels (or a `sectorId → {entities, membershipEpoch}` memo re-derived on
the entity index's membership-version bump — `coreSystem.js:607-612` already keeps
per-lane membership counters that don't die on projectile churn); `deadlineRank` stays
per-call over the small subset. **Effort M-L · Impact M · Risk M** (the sector id is a
3-field fallback — the funnel coverage is the risk; a memo keyed on membership epoch is
the conservative variant).

### F4 — `selectEvictions`' remaining dead legs on the enforce path (the afterEntries fold's residue)
**MECHANISM_VERIFIED.** The W123 fold left four unfoldable-by-accident legs inside
`selectEvictions` (`resourceGovernor.js:305-355`) on the path `enforceBudget` feeds:

- `:309-313` `list.map({...entry, kind, bytes})` — O(A) object spread of every row; the
  memoized `governorEntry` rows already carry `kind`, `gpuBytes`/`cpuBytes`, `roles`,
  `presentationTiers`, `ownerRecords`, `memoryUnits`. Gate on `entry.kind === kind` (or a
  `options.rowsAreGovernorEntries` hint) → zero clones on the enforce path.
- `:314-315` `summedEntryBytes` walk — **dead whenever `options.initialResidentBytes` is
  finite**, which it always is from `enforceBudget(Steps)` (`:2158`,`:2290`); compute lazily
  only for the fallback (`residentBytesFromMemoryUnits`'s fallback arg).
- `:352` `[...list].sort(compareEvictionOrder)` — `compareEvictionOrder` calls
  `evictionPriority()` per compare → ~2·A·log₂(A) role/tier re-derivations. A single
  decorate pass stamping priority next to `bytes` in the row pass drops it to O(A)
  predicate evals; priorities are small ints (`GOVERNOR_ROLE_PRIORITY` 0-9), so a
  rank-bucket order is the deeper fold preserving exact order.
- `:355` `entryIndexes` Map — O(A), dead once F2's incremental freed lands.

Measured: under-budget plan 0.75-1.21ms at N=4000-8000 — these legs are the entire cost
once the blocked/unit options are supplied. **Effort S-M · Impact M · Risk L-M.**

### F5 — smalls (documented, low rank)
- `memoryUnitList(row)` (`resourceGovernor.js:84-96`) re-dedups per enforce a unit list the
  `governorEntry` memo already deduped at mint (`assetResidency.js:2010-2019`); the census
  could store the validated effective-unit list on the row once. O(A·U) Set+alloc per
  enforce → O(1) reuse. S/L.
- `[...packageCacheOnlyMembers, ...softResidentMembers]` (`assetResidency.js:1448`) mints a
  concat array per sweep pass; two bare set iterations avoid it. S/L.
- `blockedBreakdown` (`assetResidency.js:2041-2077`) mints `unitsByReason` Maps per call —
  could fold the per-reason unit walk into the census's blocked loop that already mints
  `blockedReasons`; marginal post-member-set (O(blocked·reasons·units)). S/L.

## Regression notes — W123 machinery verified on `f33dc3058`

- **Paced save chain (boot F1) — PASS.** `saveAsync` (`saveSystem.js:1433`) defers to
  `this.save(slot, options)` at `:1454` when `!_frozenTickBoundary()`; paced lane mints a
  job, supersedes `_activePacedSave`, emits `save:started` + `_noteWritePending`.
  `_runPacedSaveChain` (`:1470`) captures `const state = this.state` once (`:1474`), gates
  every post-hop leg on `abortReason()` (superseded/restoring/stale-epoch at `:1477-1481`,
  re-checked after serialize/envelope/stringify/verify-previous hops); `fail()` emits **no
  receipt** on `'stale'` (`:1485`) and re-`_noteWritePending()`s the active job on
  `'superseded'` (`:1494-1498`); `finally { endFocusLossSaveWrite(state); }` (`:1605`) uses
  the captured state. `game:save` routes `saveAsync` (`:331`), `game:exitToMenu` →
  `requestExitAutosave({ paced: true })` (`:471`) → `saveAsync` (`:2692`); the
  pagehide/beforeunload flush calls `requestExitAutosave()` with **no** options → sync
  `this.save` (`:2694`, comment `:2664-2668`). `_serializeDataFrozenAsync` retakes
  atomically via `return this.serializeData()` on unfreeze (`:956`).
- **Async export (boot F2) — PASS.** `exportSlotAsync` (`:6543`) consults
  `_cachedPreparedEnvelope` for primary (`:6547`) **and** recovery (`:6552`), falls back to
  `_prepareEnvelopeStringAsync`; `_finishExportJson` (`:6569`) holds the serialize fallback
  and `save:error` on null; `saveLoad._export` (`saveLoad.js:1449`) awaits it with the sync
  `exportSlot` fallback (`:1460`).
- **Corpse sweep gating (hitches F1) — PASS.** `lifetimeSweep` (`coreSystem.js:490+`):
  `corpseSignal` arms on a membership-dirty `!alive` row (`:551-557`); `corpseSweepDue =
  corpseSignal || tick % 64 === 0` backstop (`:572-573`); the rolling 128-slice probe
  (`:574-583`) advances a cursor and only then runs the full collect (`:584-590`);
  unmarked `alive=false` NPC despawns within ~length/128 ticks (player excluded both
  probe and collect).
- **Diagnostics quarantine (hitches F2) — PASS.** `registry.js:1001-1013`: the `finally`
  wraps `diag.update(frameDt)` in try/catch with 20-verbatim-capped `console.error` +
  suppression notice; `runRenderUpdatePhase`'s return is unmaskable.
- **Popin single-fold census (F1/F4/F5) — PASS.** Both `enforceBudget` (`:2080-2200`) and
  `enforceBudgetSteps` (`:2222-2340`) mint `entries`/`unitOwners` only when
  `initialResidentBytes > cap`, mint `blockedRows`/`blockedReasons` off
  `governorBlockedMembers` in the same fold, hand all three to `governor.plan` as options
  (`:2158`,`:2290`), and `blockedBreakdown(afterBlockedRows, blockedReasons)` reuses the
  minted reasons (`:2193`,`:2321`). Under-budget calls skip the census; `selectEvictions`
  consumes the projections with self-contained fallbacks (`resourceGovernor.js:316-333`).
- **`governorBlockedMembers` member set (F2) — PASS.** Re-keyed in `rekeyGovernorBlocked`
  at the membership/pending/eviction funnels (`:881-888`); consult re-qualifies members
  (`assets.get(key) !== entry` + `isGovernorEntryEvictable` at `:2129-2135`,`:2264-2271` —
  stale drops out, never trusted); `verifyLedgerConsistency` rebuilds the set wholesale
  every 4th enforce (`:1085-1086`,`:1163-1180`) as drift insurance.
- **`rotateSectorDeferred` FIFO (F3) — mechanism verified, DEFECT FOUND — see F1.**
  Eager snapshot + end-of-generator repoint + two FIFO append sites + `.return()` abandon
  in `driveCacheCleanup` = stale-sector warm coverage, doubled mint work, dropped
  same-sector reversals.
- W122 spot-check items (audio bounded-post, stormWarn backoff/heal, deferred warm mint
  FIFO) — **skipped per brief**: no W123 commit touched those files.

## Lane-brief residuals — enumerated

**(a) afterEntries second census → LANDED in W123 (verified); residue = F4 + the F2
selection rescan.** The fold produced: `blockedRows`/`blockedReasons`/`memoryUnitOwners`
as plan options, no blocker. What remains of the second census concentrates inside
`selectEvictions` itself: the per-selection `freedBytesForSelection` rescan (F2), the row
spread, dead sum, index map, and per-compare priority (F4). All are folds or decorate
passes — nothing blocked.

**(b) census walk TOTAL work → F2 + F4 + F5.** Structures that make the remaining legs
sublinear: per-unit `remaining`-count map replacing `freedBytesForSelection`
(O(U)+O(selected-units) total vs O(S·U·E)); rank-bucket or single-decorate eviction order
(O(A) vs O(A log A) predicate evals); `entry.kind`-gated spread + lazy `summedEntryBytes`
+ dead `entryIndexes`; row-memoized effective-unit lists; member-set iteration already
landed for blocked rows and the cache sweep (W123). The census itself is already O(A) with
O(1) row memos — the remaining superlinearity is entirely inside plan selection.

**(c) sector-transition volume → F1 + F3.** At a crossing today: warm mint O(prev-sector
rows, paced but now duplicable by the F1 defect); sweeps O(cache+soft members — W123
member sets); enforce O(assets) over-budget / O(blocked) under — with the F2 superlinear
selection leg landing atomically inside it; `refreshSectorPrewarmPopulation` +
certification + predicted-warm census each O(entityList) (F3 — a sector member index is
the incremental structure); `sectorOwnerIndex`, `warmCoverage`, fence-pack Steps already
incremental/stepped. Roster re-emit and boundary mint remain O(sector requests) — inherent
to the sector's authored definition.

## Hardware-unverified

None — every finding is CPU-scope mechanism/measured. F2's absolute magnitude scales with
asset count × selection count × units-per-asset and how far over budget the enforce runs;
the synthetic workload above is representative in structure, not a production calibration.
Owner-side verification commands live in `design/perf/scoreboard.json`.
