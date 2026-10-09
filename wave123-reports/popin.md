# wave-123 audit — popin-admission lane

Audit branch: `devin/1791504143-perf-w120` @ `4a69957fc` (≥ required `b16d2730a`; W119+W120-lod
via PR #247, W120+W121+W122 on PR #257).
Audit-only: no code written, no PR, no app run. Micro-bench: `wave123-popin-bench.mjs`
(session-local, not committed), node24 `/c/hostedtoolcache/node/24.0.1/x64/node`, one process.
SwiftShader box: all timings are CPU-scope; no GPU-cost conclusions drawn.

```yaml
saturated: false
```

## Ranked findings

### F1 — `selectEvictions` rebuilds the census it was just handed (the deferred "afterEntries" fold)
**MECHANISM_VERIFIED + CPU-measured.** Every over-budget `governor.plan(...)` call
(`src/render/assetResidency.js:2069`, `:2164`) runs `selectEvictions`
(`src/render/resourceGovernor.js:305-382`), which performs a **second full census** over the
entry list that `enforceBudget`'s own census just walked:

- `:309-313` — `list.map({...entry, kind, bytes})`: an O(assets) shallow-spread of every row
  (the same memoized `governorRowMemo` objects the census produced).
- `:315` — `summedEntryBytes` walk, O(assets) — used only as the `initialResidentBytes`
  fallback; `enforceBudget` already passes `initialResidentBytes` from `budgetTotals()`.
- `:316` — `buildMemoryUnitOwners(list, kind)` (`:98-121`): O(assets × memoryUnits) Map+Set
  index rebuilt per call, unconditionally — needed only by the evict-selection loop.
- `:323-333` — blocked-reasons walk over **all** entries calling `isGovernorEntryEvictable`
  + `governorEntryBlockReasons` per row: the same predicate over the same rows the enforce
  census already classified into `blockedRows`. Worse, the receipt fields it produces are
  **dead on this path**: `enforceBudget` overwrites `blockedBytesByRole/ByReason` with its
  own `blockedBreakdown(afterBlockedRows)` (`assetResidency.js:2104`, `:2126-2127`).
- `:352` `[...list].sort(compareEvictionOrder)` O(A log A) + `:355` `entryIndexes` Map O(A).

Measured on this box (synthetic census, 30% blocked, 2 units/asset — CPU-scope only):
N=4000 → over-budget plan **6.22ms**, under-budget early-out **4.33ms** (the ~4.3ms is pure
rebuild — it runs even though `total <= budget` returns at `:335` without the sort/selection);
N=8000 → **7.83ms/7.90ms**. So ~4-5ms of each over-budget plan is provably re-derivation, and
a same-order cost lands again inside `blockedBreakdown`.

**Exact fold (the prompt's item a — it is a filter of the first census, no blocker):**
`enforceBudget(Steps)` already computes the blocked subset during its single pass; pass it
through as plan options — `governor.plan(entries, kind, { initialResidentBytes, blockedRows,
memoryUnitOwners })` where `memoryUnitOwners` is minted once inside the census walk
(unit→entryIndexes is a pure projection of `entry.memoryUnits`). `selectEvictions` then
consumes `options.blockedRows` for its `:323-333` loop (O(blocked) instead of O(assets)) and
`options.memoryUnitOwners` for `:316`/`360-361`, keeping its standalone contract for the
test-pinned direct-call receipt (`test/resource-governor.test.mjs:122-223`). The
`{...entry, kind, bytes}` spread survives only as a lazy `bytes` accessor or stays — it is
the smallest of the four legs.
**Effort M · Impact M · Risk M** (receipt fields are pinned by tests; `selectEvictions`'s
public shape must stay — option-passed projections keep it; over-budget only).

### F2 — Sublinear census: `governorBlocked` member set + sweep rides class sets
**MECHANISM_VERIFIED.** W122 gave the census O(1) per-row cost (row memos) and O(1) byte
ledgers, but `enforceBudget`'s census still **iterates every registered asset**
(`assetResidency.js:2079-2098`) even under budget, because `blockedRows` can only come from
a full walk. The same funnel that already re-keys class ledgers —
`rekeySoftBudgetClass` (`:830-854`), called from `noteOwnerMembershipIndexed/Unindexed`
(`:683`,`:709`), `notePendingRequestActivated/Deactivated` (`:92`,`:102`), `evictIfUnowned`
(`:1526`) — can maintain a `governorBlockedEntries` member set alongside
`packageCacheOnlyEntries`/`softResidentEntries` (`:862-865`). Then the under-budget enforce
is O(blocked) (and the ledger early-out at `:874-894` short-circuits to O(1) when the set is
empty), and `releaseUnreferencedCacheOwnersPassSteps` (`:1425-1504`) can iterate the member
sets instead of `[...assets.values()]` (`:1443` — a per-leg O(assets) spread + walk).
Blocked-ness still depends on `visibilityHeld` decay and `activePendingKeys` — both already
funnel through the same note* callsites, so the set stays consistent by construction.
**Effort M · Impact M · Risk M** (membership recompute must cover visibility-decay re-stamps;
the funnels exist but the sweep is wide).

### F3 — `prepareSectorEntry` still mints the rotation synchronously at the swap seam
**MECHANISM_VERIFIED.** `assetLoader.js:998` calls `residency.rotateSector(exactSectorId)`
**synchronously inside the prewarm `.then` continuation** — the last statement before the
scene publishes ("Swap last", `:996`). `rotateSector` is the same O(prev-sector owners)
release+retain census W122 paced on the exit path (`prepareSectorExitDeferred`,
`assetResidency.js:1674-1711`); here it lands unpaced on the main thread at the exact
popin-admission moment. Two residuals compound it: `rotateSectorDeferred` (`:1716-1758`)
exists and `queueResidencyWarmMint` (`renderer.js:19553-19566`) already chains iterators
behind `_sectorExitCleanupIter`, but the entry path never uses it; and the sync rotate
**never pre-mints `warmCoverageComplete`** (only sync `prepareSectorExit` does, `:1647`), so
the next exit still pays the paced-but-resumable lazy coverage mint.
**Fix sketch:** route `:998` through `rotateSectorDeferred` and hand the iterator to
`queueResidencyWarmMint` (or chain it behind `_sectorExitCleanupIter`); `prepared.rotated`
stays truthy (non-null iterator) and ordering is preserved — the old sector's warmth releases
a paced-leg later, identical in shape to the exit path's contract.
**Effort S-M · Impact M · Risk M** (rotation ordering vs scene publish must be preserved:
deferral leaves prev-sector warmth retained a few frames longer — same trade the exit leg
already made).

### F4 — `blockedBreakdown` is a third walk over the same rows
**MECHANISM_VERIFIED.** `blockedBreakdown(afterBlockedRows)` (`:2104` / `:2195`) re-derives
byRole/byReason by re-calling `governorEntryBlockReasons` per blocked row — the second pass
over the blocked subset after `selectEvictions`'s own (`resourceGovernor.js:323-333`), which
it then discards. One computation should exist: either the census mints the breakdown inline
(single fold, zero extra passes) or the plan's fields are used instead of overwritten.
**Effort S · Impact L · Risk L** (covered by F1's fold; listed separately because it survives
independently as a receipt-shape decision).

### F5 — `entries` array minted even when the receipt can't consume it
**MECHANISM_VERIFIED.** The cap check is known **before** the census
(`initialResidentBytes <= governorCapBytes` from `budgetTotals()` at `:2071-2078`), yet the
loop still pushes every row into `entries` (`:2097`) and collects `blockedRows` — then the
under-budget branch (`:2053-2068` synthetic plan) throws `entries` away; `governor.plan` is
never invoked. With F2's member set the under-budget enforce needs neither array.
**Effort S · Impact L-M · Risk L.**

### F6 — `diagnostics()` rebuild sorts O(A log A) per epoch bump
**MECHANISM_VERIFIED.** Row mints are memoized (`diagnosticsRow` `:1805-1831`), but the
rebuild still walks + sorts all rows on each `ownersVersion`/`canonical` epoch flip. Small —
rebuilds are mutation-paced, not frame-paced. **Effort S · Impact L · Risk L.**

## Lane-brief residuals — enumerated

**(a) afterEntries second census → F1.** Exact fold produced above: `blockedRows` +
`memoryUnitOwners` as plan options; the blocked-fields dead-write at `:2126-2127` folds away
with F4. No blocker — `governor.plan` has exactly one production caller.

**(b) sublinear census → F2 + F5.** Structures that make census legs sublinear:
`governorBlockedEntries` member set (F2), class member sets for the sweep (F2),
early cap-check gating the `entries`/`blockedRows` mints (F5). What stays linear by contract:
the over-budget sort `O(A log A)` and evict selection (F1's residual — inherent to planning).

**(c) sector-transition volume — what scales with sector size vs incremental:**

| leg | scale | paced? |
|---|---|---|
| warm mint (exit) | O(exit-sector assets) | ✓ fused iter leg 0 (`renderer.js:19366-19371`) |
| cache sweep ×2 | O(assets) each — F2 makes it O(candidates) | ✓ legs 1-2 |
| governor enforce (exit) | O(assets) census + over-budget O(A log A) plan — F1/F2/F5 | ✓ leg 3 |
| **rotateSector (entry)** | **O(prev-sector owners) — SYNC, unpaced — F3** | ✗ `assetLoader.js:998` |
| warm coverage mint | O(warm assets × owners) | paced or lazy-residual — F3 |
| arrival roster re-emit | O(roster) | paced (`_arrivalRosterIter`, earlier waves) |

## Regression verification

- **Audio F1 (`audioSystem.js:6997-7027`)**: rAF tick holds only guards + bounded post +
  re-arm (`:7001-7011`); `_frame()` re-guards suspended/ctx-state at `:7027`; `_stopFrameLoop`
  cancels `rt._rafId` (`:7015-7023`); `postTaskAtBackgroundPriorityBounded` exists
  (`src/core/backgroundPost.js:7`). ✓
- **stormWarn F3 (`renderer.js:2178-2217`)**: >60s quiet-gap heal resets
  logged/suppressed/heartbeatMs (`:2198-2200`); 1s→30s doubling heartbeat (`:2211-2213`);
  `lastWarnAt` stamped on verbatim warns (`:2203`); contract identical to laneWarn
  (`:2236-2257`). Cap eviction deletes oldest row rather than clearing (`:2189-2190`). ✓
- **popin W122 6/6**: deferred warm mint is fused-iter leg 0 (`renderer.js:19366-19371`,
  generator `assetResidency.js:1674-1711` w/ abandon `finally` `:1707`); governorEntry
  ownersVersion row memos (`:1942-1988`, hit path re-stamps `activeRequest` `:1982`);
  fused cache-owner sweep (`releaseUnreferencedCacheOwnersSteps` both legs,
  `renderer.js:19372-19383`, O(1) class folds `:1425-1504`); class byte ledgers + O(1)
  early-out (`:862-865`, `:874-894`, Steps twin `:1052+`); paced warmCoverage mint
  (`mintWarmCoverageSteps` `:1654-1667`); diagnostics row memos (`:1805-1831`). No site
  bypasses the class-ledger funnels (`rekeySoftBudgetClass` callers enumerated `:683,:709,
  :92,:102,:1526`). ✓
- **boot W122**: `loadEnvelopeFromString` non-gzip leg routes async
  (`saveSystem.js:4223`), O(1) rejects stay sync (`:4213-4221`); `_prepareEnvelopeStringAsync`
  worker→yielded-twin fallback (`:4129-4199`); autosave fallback awaits async prepare with
  liveness re-checks (`_commitAutosaveSnapshot` `:3221-3248`, validates `:3544`,`:3584`,
  `:3719`); prepared-envelope FIFO memo cap 8 (`:4269-4281`, stamp `:4193`). ✓
- **W121 spot-checks (W122-touched files only)**: owner-visibility memo intact
  (`assetResidency.js:163,:639,:1246-1258`); `verifyLedgerConsistency` + drift emit
  (`:982-1046`,`:910-978`); per-leg `try/dropLeg` guards in the fused sector-exit iter
  (`renderer.js:19366-19389`); laneWarn quiet-gap heal (`:2236-2238`); deferred-restore
  `.catch` sites intact (`saveSystem.js:4426,:4610-4616,:4766,:4804-4810`).
  `partsLibrary.js`/`sg02DynamicBodyOwner.js` untouched by W122 — skip per prompt. ✓

## Hardware-unverified

- F1 probe numbers (4.3-7.9ms @ N=2000-8000 synthetic) are CPU-scope on this SwiftShader box;
  real census sizes and whether an over-budget plan lands inside a presented frame are
  hardware-unverified.
- F3's seam cost (O(prev-sector owners) inside a microtask at scene publish) is structural —
  no frame-time claim made.
