# wave-122 audit — popin-admission lane

Audit branch: `devin/1791504143-perf-w120` @ `c3d84934c` (PR #257 HEAD, W120+W121 landed).
Audit-only: no code written, no app run. Probe + micro-bench: `wave122-popin-probe.mjs` /
`wave122-popin-bench.mjs` (session-local, not committed), node24, one process at a time.

```yaml
saturated: false
```

## Ranked findings

### F1 — Warm-mint is the last synchronous sector-scale leg inside `sector:exit`
**MECHANISM_VERIFIED + CPU-measured.** `applySectorExitResidency` calls
`residency.prepareSectorExit` synchronously inside the `sector:exit` listener
(`src/render/assetResidency.js:2012-2013`, emit site `src/render/renderer.js:19340-19398`).
`prepareSectorExit` (`assetResidency.js:1511-1531`) runs `releaseOwner(warmOwner)` on the
previous warm generation — O(prev-sector assets) — then a K-retain loop over the exiting
sector's `sectorOwnerIndex` — O(exit-sector assets) — each retain emitting `asset-retained`
and running `noteOwnerMembershipIndexed` + `handoffWarmOwnerWhenCovered`. Everything else at
the crossing (2× cache sweeps, governor enforce) already rides `_sectorExitCleanupIter` on the
paced slice clock; the warm mint is the only O(sector) work still inside the emit.
Measured: K=500 retains + prior-warm release = 0.80–4.47 ms (GC-sensitive tail) on this box;
a real sector's asset table is several× larger.
**Fix sketch:** chain the mint as leg 0 of the fused `_sectorExitCleanupIter` — yields between
the owner release and the retain loop — placed strictly before the two cache sweeps, which
preserves the ordering invariant (warm holds must land before any sweep can evict the exited
sector's cache-only rows). `rotateSector` (`assetResidency.js:1474-1509`, boot site
`renderer.js:10773`) has the same shape and can share the stepped twin. The save/restore
`includePlayer` path (`renderer.js:18741`) can keep the sync twin — it runs inside the veil.
**Effort M · Impact M · Risk M** (ordering with the paced sweep legs is the contract; the
iterator head precedes them today by construction, so the fold is legal by position).

### F2 — `governorEntry` census still mints O(assets) rows on every `enforceBudget` call
**MECHANISM_VERIFIED.** `enforceBudget`/`enforceBudgetSteps` (`assetResidency.js:1779-1879`,
`1884-1969`) walk every asset and mint a `governorEntry` row per entry: `[...owners.values()]`
+ per-metadata clone (`:1708`), two Set-dedupe arrays (roles, presentationTiers `:1709-1711`),
and a memoryUnits dedupe walk over `entry.resources` (`:1713-1721`). This runs under-budget too
(the row census is the only source for `blockedBytesByRole/byReason`), and it runs at the
sector-exit leg 3 where **the receipt is discarded** (`renderer.js:19386-19389` comment).
The W121 ledgers killed the O(assets×requests) term and the second census; what remains is the
row mint itself.
**Fix sketch (ranked options):**
(i) per-entry governor-row memo keyed on a new `entry.ownersVersion` (bump inside
`noteOwnerMembershipIndexed/Unindexed` — already the funnel) + a pending-version counter +
`visibilityWriteSeq` + kind — unchanged entries reuse their frozen row, census fold becomes
O(assets) near-zero-alloc;
(ii) a totals-only enforce variant for receipt-discarding callers (the sector-exit leg):
running ledgers already give `initialResidentBytes`; under the cap the whole census can be
skipped when `blockedBytesBy*` isn't consumed (the under-budget receipt literal at `:1803-1818`
already exists);
(iii) deepest: maintain a blocked-set index — re-derive verdicts at mutation time. Blocked-ness
depends on `visibilityHeld` (decays per present) and active requests, so it needs re-eval on
those two funnels too — bigger change for the same asymptote as (i).
**Effort M · Impact M · Risk L-M** ((i) is additive; (ii) touches the receipt contract).

### F3 — Cache-owner sweep still allocates two arrays per asset per pass
**MECHANISM_VERIFIED.** `releaseUnreferencedCacheOwnersPassSteps`
(`assetResidency.js:1309-1390`) materializes `[...entry.owners.entries()]` and a
`filter(isRenderPackageCacheOwner)` array for **every** entry (`:1327-1328`) — 2 allocs +
O(owners) per asset — before classifying. The W121 counters now answer both classifications in
O(1) with **exact folds**: `cacheOwners.length === ownerRecords.length` ⇔
`entry.rpcOwnerCount === entry.owners.size && owners.size > 0` = `isPackageCacheOnlyEntry`
(state guard already hoisted at `:1326`); `ownerRecords.every(isSoftResidencyOwner)` ⇔
`entry.softOwnerCount === entry.owners.size` = `isSoftOnlyEntry` (budget-candidate legs
`:1330-1331`, `:1367-1368`). Only matching rows need the ownerRecords array at all (for the
release loop's owner identities `:1350-1352`). Measured sweep: 0.18–0.30 ms @ N=600 with a
2.17 ms GC tail — small wall time, pure-GC allocation ×2 passes per crossing + the 10 s decay.
Residual after the fold: `hasWarmDecodeLease`/`hasServedDecodeLease` stay O(owners) but only on
cache-only rows (a decodeWarm/decodeServed counter pair would close them too — optional).
**Effort S · Impact M · Risk L** (the counters are already maintained by the same funnel).

### F4 — Soft-budget census early-out can go O(1) via class byte ledgers
**MECHANISM_VERIFIED.** `enforceSoftResidencyBudgets(Steps)`
(`assetResidency.js:800-830`, `954-1038`) still walks all assets every call — per-row work is
O(1) now (`isPackageCacheOnlyEntry`/`isSoftOnlyEntry` counters + `activePendingKeys`), but the
walk + the always-on drift recompute fold (`cpuPackageRe` O(assets), `memoryUnits` O(units),
`pendingRequests` O(P) `:1009-1023`) run per invocation. Next structures: running
`{packageCacheOnlyBytes, softResidentBytes}` ledgers (bytes change only through
register/evict/owner-set mutation — same funnel as the counters) plus candidate-class
membership sets; under-budget early-out then consults two scalars with zero walk, and an
overage walks only the candidate sets (usually ≪ assets). Bonus: `diagnostics()` recomputes the
same two byte totals per call (`:1641-1644`) — the ledgers serve it too. Gate the drift
recompute's cheap folds inside the same decision so a verified-clean sweep costs O(units+P).
**Effort M · Impact M · Risk M** (membership must also re-key on pending-request activation —
`notePendingRequestActivated/Deactivated` is the funnel — and on `entry.state` flips).

### F5 — First post-exit live retain pays the warmCoverage mint inside a random frame
**MECHANISM_VERIFIED + CPU-measured.** `warmCoverageComplete` (`assetResidency.js:389-398`)
mints the uncovered-key set O(warmAssets × owners-per-entry) lazily on the first retain after a
warm owner exists (`retain` → `handoffWarmOwnerWhenCovered` `:364`). Measured 0.64 ms @ K=500 —
lands inside whatever live retain happens to run first post-crossing, unpaced.
**Fix sketch:** pre-mint coverage inside the stepped warm-mint leg proposed in F1 (the
iterator already bounds sector-scale work), or inside `prepareSectorExit`'s tail for the
save/restore path. Cheap tail of F1's change.
**Effort S · Impact L-M · Risk L**

### F6 — `diagnostics()` row mints are per-epoch O(assets×owners) + O(A log A) sort
**UNVERIFIED** (materiality unknown at real seam cadence). `diagnostics()`
(`assetResidency.js:1574-1678`) mints a frozen sorted row per asset — each with 3 Set-dedupe
arrays over owner metadata — plus `O(A log A)` key sort. `canonicalDiagnostics`
(`:1680-1688`) memoizes on `diagnosticsEpoch`, which bumps on **every** emit (`:176`) — the
code's own comment names the seam callers (mesh reconcile, residency service, the 0.25 s
readiness poll). The deferred publish dedupes burst cost to one rebuild per epoch-gap, but
the **sync** seams still pay it inline right after mass mints: context-restore completion
(`renderer.js:10544`, `:10737`) and the save-path publish (`:18743`, immediately after the
`includePlayer` warm mint). A per-entry row memo keyed on a new `entry.rowVersion` (same
funnel bump as `ownersVersion` in F2) cuts rebuilds to O(assets) reads.
**Effort M · Impact L-M · Risk L**

## Lane-brief residuals — enumerated

**(a) Deferred afterEntries second census — RESOLVED, fold exists.** The W121 "blockedRows
fold" already landed: `enforceBudget(Steps)` collects `blockedRows` inside the single census
(`:1793-1797`, `:1891-1895`), and the after-table is the filter
`plan.evict.length === 0 ? blockedRows : blockedRows.filter(row => assets.has(row.key))`
(`:1847-1849`, `:1938-1940`); after-scalars come from `budgetTotals()` running ledgers O(1)
(`:1400-1406`). No second census remains. The residual is the **first** census's row mint —
that is F2.

**(b) Per-callsite work remaining under the new ledgers:**
- `handoffWarmOwnerWhenCovered`: per retain = `owners.get` + early-outs + O(1) coverage
  consult once minted (`:411-422`, `:389-398`). Residuals: the lazy mint (F5) and
  `warmEntryCovered` O(entry.owners) inside `noteWarmCoverageEntryMutation` — only for
  entries the warm set owns (`:400-409`). Effectively closed.
- `evictIfUnowned`: the O(P) pending scan is gone — `activePendingKeySet().has` is O(1) via
  the refcount set (`:1408-1410`, `:82-107`); remainder is the O(resources) finalize tail,
  inherent to disposal. Closed.

**(c) Census-family next index/memo structures:** F3 (counter folds for the two whole-map
sweep filters), F4 (class byte ledgers + membership sets → O(1) early-out), F2 (per-entry
governor-row memo / totals-only variant), F6 (per-entry diagnostics-row memo). Ranked as
F3 < F4 < F2 < F6 by effort; by impact F2 ≈ F4 > F3 > F6.

**(d) Sector-transition volume — what still scales with sector size at a crossing:**
| work | placement | scale | incremental? |
|---|---|---|---|
| old warm release + new warm retain | inside `sector:exit` emit, synchronous | O(sector) | **no — F1** |
| warmCoverage mint | first live retain post-exit, unpaced | O(warmAssets × owners) | **no — F5** |
| 2× cache-owner sweeps | paced `_sectorExitCleanupIter` legs | O(assets) walk + O(owners)/asset | yes — F3 folds |
| governor enforce | paced leg 3 | O(assets×owners×resources) row mints | partially — F2 |
| arrival roster mint | `_arrivalRosterIter` slice clock | O(entityList+field.rocks) | already paced |
| mesh reconcile poll | `_residencyPollIter` slice clock | O(meshes+entities)/sweep | already paced |
| canonical diagnostics re-mint | deferred post-present, deduped arm | O(assets×owners) per epoch | yes — F6 |

## Regression verification — W121 + skeptic machinery

- **Owner-visibility memo (global B2) — VERIFIED.** `noteOwnerVisibility` memoizes on
  `{present, visible, assetsVersion, writeSeq}`; a hit returns without walking `state.assets`
  (`:1130-1137`). `state.assetsVersion` bumps at every mutation site (retain `:350`, release
  `:594`, releaseOwner `:485`). Memo rows die in `cleanupOwnerState` (`:616`).
  `visibilityRowOffGlass` virtual staleness (`:1046-1050`) reproduces the eager sweep boundary
  exactly — verified against `test/grok-build20-picture.test.mjs` row-139 pin: pin noted at
  present 1 survives advances through present 8 (offGlass 7), drops at present 9's advance —
  the 8th-advance pin. `advanceVisibilityHysteresis` GC sweeps `max(256, ceil(size/8))` rows
  per present via the persistent `visibilityGcIter` (`:1156-1178`) — bounded share, no
  whole-table pass. Minor: the `:1043-1045` comment ("held through P+8's tail, drops at P+9's
  advance") reads off-by-one vs the formula (drop lands at the P+8 advance for a note at P) —
  the code matches the oracle; the comment could say "8 presents of grace".
- **Sector ledger/index — VERIFIED + probe-called.** `sectorOwnerIndex` +
  `softOwnerCount`/`rpcOwnerCount` maintained at the single `noteOwnerMembership*` funnel
  (`:634-679`) reached by retain `:347`, release `:592`, releaseOwner `:483`. Probe drove
  retain/release/dup-key request cancel+commit/`rotateSector`/`prepareSectorExit`+rotate/
  `enforceBudgetSteps`/5× soft-enforce (crossing the every-4th owner-graph verify)/2× cache
  sweeps/detached sweep → `verifyLedgerConsistency()` returned `{ok:true}` at all 13 points,
  `ledgerDriftEvents === 0`. No un-indexed `metadata.sectorId` post-mutation site found (the
  decodeWarm→decodeServed upgrade mutates only demand flags, not indexed fields).
- **swapEpoch (skeptic F1) — VERIFIED.** All three closures re-stamp after
  `residencyOptionsForBoundary` mints the epoch (`partsLibrary.js:3141→3173` capsule,
  `3836→3887` station, `4018→4088` place; mint at `:7191-7195`). A genuinely stale closure is
  still refused: `admissionEpoch !== swapEpoch` → self-clears `__setActiveVisualRoot`
  (`:3143-3148` and twins). Epoch bumps arriving through *other* lanes (visualFactory:4268,
  visualOverrides:1144) don't touch the cell — correct refusal. Same-lane superseded runs are
  refused upstream by per-run `options.admissionEpoch` gates (`:3396-3397`, `:4375-4376`,
  `:4509-4510`, stale-verdict helper `:2795-2796`) plus epoch-scoped `releaseBoundaryResidency`.
- **Per-leg sector-exit guards (skeptic F2) — VERIFIED.** Clean path fused iterator
  (`renderer.js:19368-19395`): primary release `:19378-19380`, post-dispatch `:19382-19384`,
  `enforceBudgetSteps` `:19390-19394` — each in its own try → `dropLeg` →
  `noteLaneFault(state,'sectorExitCleanup')` + `laneWarn`. Re-mint path (`:3220-3254`): a
  faulted primary re-mints post-dispatch + enforce legs behind the same per-leg `dropLeg`
  (`:3241-3249`); a post-dispatch fault drops only itself.
- **Deferred restore catch (skeptic F3) — VERIFIED.** `_restorePreparedEnvelopeAsync`'s
  `deferRunTransition` closure chains `.catch` on the re-entered async call identical to
  `_restoreAsync`'s twin (`saveSystem.js:~4527-4532` vs `:~4721`): console.error +
  `save:error` + `{restored:false, error:true}` — no unhandled rejection path.
- **Native rebuild abandon (skeptic F4) — VERIFIED.** `rebuildWorldFromEntitiesSteps`
  (`sg02DynamicBodyOwner.js:771-815`): `try { … commit; committed = true } finally {
  if (!committed) candidate.dispose(); }` — `iterator.return()` on a parked drive runs the
  finally and disposes the scratch RAPIER world + colliders.
- **laneWarn quiet-gap heal (skeptic F6) — VERIFIED.** `laneWarn` resets
  `{warns, suppressed, summarized, heartbeatMs:1000}` when `warnNow - lastWarnAt > 60000`
  (`renderer.js:2225-2227`); exponential heartbeat 1 s → 30 s cap (`:2242-2244`). Same shape
  verified on `warnDedup` (`src/core/warnDedup.js:36-42`) and `busError`
  (`src/core/eventBus.js:136-144`) — W121's backoff item covers all three ledgers.
- **Ledger drift verify (skeptic F5) — VERIFIED.** `enforceSoftResidencyBudgetsSteps`
  recomputes cheap totals every sweep and the owner graph every
  `LEDGER_VERIFY_EVERY_ENFORCES=4` sweeps (`:961-997`, `:1019-1023`); `noteLedgerDrift` emits
  only on real mismatches (`:841-845`). Probe: 5 stepped drains (crossing the verify)
  produced zero `ledger-drift` events on a clean workload; eviction legs still run under
  `packageCacheBudgetDepth` with the sort/evict twin (`:1024-1037`).
- **W121 machinery — VERIFIED.** Import lane rides the sliced restore:
  `loadEnvelopeFromString` → `_restorePreparedEnvelopeAsync` (plain `saveSystem.js:4164`,
  gzipped → `_loadEnvelopeFromStringAsync` → `:4185`), which drives chunked `_restoreAsync`
  (`:4576`). `mode:changed` restore-scoped slice: `setEmitSliceBudget('mode:changed', 8)`
  armed in `_openRestoreSession` (`:4849`), cleared to 0 in `_closeRestoreSession` (`:5441`)
  — plus `sector:exit` at 8 for the same window. Diagnostics publish deferred post-present
  via deduped `armCallbackAfterPresent` (`renderer.js:23305-23314`).

## Hardware-unverified

Nothing in this lane requires GPU evidence: all findings are CPU-side structures (walks,
allocs, ledger folds). The F1 mint is in the emit on all platforms; its real-sector wall cost
is content-dependent — verify with the sector-jump scenario in `design/perf/scoreboard.json`
on real hardware if a GPU-side frame regression is suspected.
