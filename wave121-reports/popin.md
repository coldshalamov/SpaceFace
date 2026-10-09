# Wave 121 — popin-admission audit

- lane: **popin-admission** (things popping into existence late; admission/seam CPU work that stalls the visible frame)
- audited: `devin/1791504143-perf-w120` @ `f3368f8d0`
- **saturated: false**

Evidence: all findings are MECHANISM_VERIFIED in source plus CPU-side timings from a headless
registry harness (node24, 1200-asset fixture: 600 boundary-owned, 200 soft holds, 400 pending
requests, one `byteSize` resource per asset — same shape as the wave-120 fixture). Numbers are
main-thread JS bookkeeping cost, hardware-independent; what they cost a *presented* frame is
hardware-unverified on this box (SwiftShader can never carry PERFORMANCE_VERIFIED).

## Ranked findings

### F1 — Sector-seam warm-retain censuses are still atomic inside the emits

- Evidence: `prepareSectorExit` `src/render/assetResidency.js:1150-1178` (1200-entry
  `for (const entry of assets.values())` census + per-owner `sectorId` scan + per-key `retain`
  emits) runs synchronously inside `applySectorExitResidency` (`:1674-1678`), invoked inline in
  the `sector:exit` bus handler `src/render/renderer.js:19310-19353`. `rotateSector`
  `assetResidency.js:1182-1209` (same census + warm-owner release walk) runs inline in the
  sector:enter paths `renderer.js:19619`, `19664`, `19778` and the `save:restoring` path at
  `renderer.js:18711`.
- Measured (fixture above): `prepareSectorExit` **2.0 ms median**, `rotateSector` **1.9 ms
  median** — main-thread work inside the boundary emits, the exact cost class W120 paced for
  the cleanup/enforce legs but left atomic here.
- Mechanism: at a sector boundary the same emitted task that paces cleanup also pays two
  O(assets × owners-per-asset) membership scans plus K `asset-retained` event emits. The
  census work scales with total registry size, not with the departing/arriving sector.
- Fix sketch: sector-membership index — `Map<sectorId, Set<entry>>` maintained on
  owner-metadata mutations (retain/release/releaseOwner/evict), so both seams become
  O(sector keys + retains). Alternative (`prepareSectorExitSteps` as leg 0 of the fused
  iterator) is *riskier*: the warm retain must land before boundary teardown releases the
  departing owners, or coverage is lost and assets re-decode = the pop-in this lane hunts.
  Index is the correct fix; the K retain emits are the documented W16 deferred class.
- Effort **M**, magic-frame impact **M**, risk: index maintenance must cover every owner-set
  mutation including `evictIfUnowned` and `setEvictionCorridor`-adjacent metadata writes —
  moderate but contained.

### F2 — `canonicalDiagnostics` re-mint lands inside the seam emits

- Evidence: `_publishAssetResidencyDiagnostics` `renderer.js:23243-23251` →
  `canonicalDiagnostics()` `assetResidency.js:1358-1367`. Epoch-memoized, but the seam's own
  mass retains (`prepareSectorExit` K emits, `rotateSector` retains) bump `diagnosticsEpoch`
  (every `emit()` + explicit bumps at `:940`, `:963`), so the publish calls at
  `renderer.js:19368`, `19629`, `19670` re-mint **inside the same emit** — O(assets) frozen
  rows, each building roles/tiers/sectors Sets over owner records (O(assets × owners)).
- Measured: **1.6 ms median** per re-mint at the fixture; pays once at exit and once at
  enter ≈ 3.2 ms of the seam lump, immediately after F1's censuses.
- Mechanism: diagnostic-only snapshot frozen rows on the seam task; consumers poll
  `state.render.assetResidency`, nothing blocks on it synchronously.
- Fix sketch: arm the publish on the paced continuation (`armCallbackAfterPresent` /
  next `serviceRenderMeshResidency` beat) instead of inline — one-beat-stale diagnostics
  at a boundary is invisible to debug consumers; or suppress the re-mint when the epoch
  moved only by retain/release-class events the snapshot doesn't need to be fresh for.
- Effort **S**, impact **M**, risk: confirm no probe/assertion consumes the snapshot
  synchronously after the emit (the wave tests read it eventually-consistently).

### F3 — pendingKeys memo thrashes on cancel bursts (O(K × P) re-mints)

- Evidence: `request.cancel` `assetResidency.js:401-405` → `finishRequest` bumps
  `pendingRequestsVersion` (`:418`) then `evictIfUnowned` consults `activePendingKeySet()`
  (`:80-86`, `:1091`) which re-mints O(P) because the version just moved. `releaseOwner`
  cancels all its requests first (`:443-448`), so a K-pending owner teardown — or mass
  decode aborts at sector exit — pays O(K × P) where P is the live pending count.
- Measured: 400 cancels = **2.1 ms** total on the fixture (vs O(1) achievable).
- Mechanism: W120's P1 memo fixed repeated *read-side* cost but left every mutation
  invalidating the whole set; mass-cancel paths (a seam-adjacent burst) multiply it back.
- Fix sketch: maintain the set incrementally — `beginRequest` adds `key` when minted active,
  `finishRequest` deletes it. All `active` transitions already funnel through those two
  sites; the version counter can remain as a cheap consistency guard or be dropped.
- Effort **S**, impact **S-M** (bounded by pending count; 2 ms is real but once per
  boundary-class burst), risk: low — the set is consulted by `hasActiveRequestForEntry`,
  `evictIfUnowned`, `governorEntry`, both enforce variants; same membership, no shape change.

### F4 — Census family is still O(assets × owners × resources + pending) *total* per drain

- Evidence: pacing moved cost off the emit but didn't reduce it — the scoreboard's own
  `worstRemainingBottlenecks` row already names this. Per `enforceBudget` drive
  (`assetResidency.js:1457-1547`):
  - `governorEntry` `:1382-1416` mints per entry an `ownerRecords` spread + role/tier dedup
    Sets + memoryUnit identity-dedup Set — O(owners × resources) + allocations *per call per
    entry*, even when nothing changed.
  - `budgetTotals` `:1081-1087` walks assets (cpuPackageBytes) + resources (unaccounted) +
    memoryUnits (bytes) — three full maps.
  - census 256/batch, `budgetTotals` ×4, `blockedBreakdown` `:1418-1455` another
    O(afterEntries × owners × units) walk.
- Measured: `enforceBudget('gpu')` full drive **9.3 ms median** total under-ceiling at the
  fixture (paced into ~4 ms slices, but ~9.3 ms of work exists per drain; real hardware pays
  the same main-thread JS).
- Fix sketch (independent, ranked):
  1. **Running byte ledger** — gpu/cpu totals +=/-= at register/finalize/evict instead of
     re-walking (`budgetTotals`, `totalGpuResidentBytes` → O(1)). Mutation sites are
     contained: `registerAsset`, `finalizeResource` (unit leaves when `resources.size===0`),
     `evictIfUnowned`. M/S.
  2. **Per-entry governorEntry row memo** keyed on a per-entry `ownersVersion` +
     `pendingRequestsVersion` + `kind` — unchanged entries share frozen rows; kills the
     dominant term (row mint + allocs). Needs the ownersVersion to exist (bump on owner
     add/remove/metadata write — same sites F1's index needs). M.
  3. **Soft-class index** (`strictSoftKeys`/`softOnlyKeys` maintained on owner-set +
     pending-active + visibility mutations) → `enforceSoftResidencyBudgets` `:702-772` and
     `releaseUnreferencedCacheOwners(Steps)` `:938-979/:988-1069` consult O(S) candidates,
     not O(A) census, per sweep — also serves F1-adjacent membership. M.
  4. Fold `blockedBreakdown` into the census walk (saves one O(A′) pass + filter array). S.
- Effort **M-L** (ledger first — highest leverage/effort ratio), impact **M-H** on drain
  total (per-frame already paced), risk: totals must exactly reproduce `budgetTotals`
  semantics (unaccounted-bytes edge, memory-unit sharing across resources) — golden-hash +
  accounting tests cover it.

### F5 — Fused-iterator fault drops leg 3 (enforce)

- Evidence: pump `renderer.js:3197-3234` — `catch` re-mints **only** the post-dispatch
  `releaseUnreferencedCacheOwnersSteps` leg (`:3213-3223`); a fault inside leg 1/leg 2
  silently forfeits `enforceBudgetSteps('gpu')` for that exit.
- Mechanism: enforce is idempotent and re-runs at the next exit/decay sweep, so this is a
  bounded recovery gap, not a leak — but a faulted exit leaves the over-ceiling state
  unenforced until the next seam.
- Fix sketch: chain `yield* enforceBudgetSteps('gpu')` after the re-minted post leg in the
  catch path.
- Effort **S**, impact **S**, risk: none — same generator composition as the clean path.

## Hunt summaries

- **(a) P2 fold** — landed (`:1515-1517`, `:1603-1605`: `plan.evict.length === 0 ? entries :
  entries.filter(row => assets.has(row.key))`). Residual: in the *Steps* twin a foreign
  mutation during census yields can leave surviving rows' minted `ownerRecords` stale for
  `blockedBreakdown` — diagnostics-only, eviction verdicts re-check `assets.has` live.
  Residual enumerated: nothing further — the fold is exact within the loop's own mutations.
- **(b) P5/P6 per-callsite residual** — `handoffWarmOwnerWhenCovered` consult is O(1) via
  `warmCoverage` (`:94`, `:346-379`); its *first mint* per warm owner is O(warmAssets ×
  owners) once — acceptable one-time. `warmEntryCovered` remains O(entry.owners) per
  `noteWarmCoverageEntryMutation` call site (retain `:308`, releaseOwner `:441`, release
  `:547`, evictIfUnowned `:1094`) — O(owners) per mutation, fine. `evictIfUnowned` consult
  is O(1) (`:1091`). Remaining: F3's re-mint thrash.
- **(c) sublinear structures** — enumerated as F4 items 1-4; the running ledger is the
  highest-leverage single change.
- **(d) admission-path work without stride bounds** — F1 (two inline seam censuses, K
  retain emits each), F2 (diagnostics re-mint ×2 per seam), F3 (cancel-burst thrash),
  `disposeAll` (boot-only, skips). `noteOwnerVisibility` `renderer.js:26492-26494` runs
  O(owner.assets) per entity row per presented pass and `advanceVisibilityHysteresis`
  `renderer.js:26736` is O(holds) per pass — both bounded by visibility-set sizes, left as
  watch items rather than findings. Per-entry emits inside mass retain/release are the
  adjudicated W16 deferred class — not re-reported.

## Regression notes on landed waves

**W120 popin machinery — all verified present and semantically correct:**

- **P4 enforceBudgetSteps** — `assetResidency.js:1552-1634` preserves `enforceBudget`'s
  plan/evict/receipt semantics exactly (same plan call `:1570`, same evict loop paced per
  256 `:1580-1630`, same receipt fields). `applySectorExitResidency` honors
  `options.deferBudgetEnforce` (`:1716-1719`); `driveCacheCleanup` fuses legs
  releaseUnreferenced(primary) → releaseUnreferenced(postDispatch) → enforceBudgetSteps
  (`:1687-1714`), minted with `deferBudgetEnforce: true` at `renderer.js:19333-19352` and
  drained ≤ `PACED_FRAME_BUDGET_MS` per pass at `:3197-3234`. No-Steps fallback drives the
  sync twin. Residual: F5.
- **P3 softBudgetArmSuppressed** — `:90` wraps both `evictOldestSoftEntries` (:875-877) and
  `evictOldestSoftEntriesSteps` (:902-904) owner-release loops; nested `release()` at
  `:560-561` cannot re-arm `softBudgetPending` under suppression (inline <128 path remains
  depth-guarded by `packageCacheBudgetDepth`). `releaseOwner`'s arm is likewise gated
  (`:460`). ✓
- **P1 pendingKeys memo** — `:75-86` version-keyed; bumped at beginRequest `:408` and
  finishRequest `:418`; all census consults share it (`:572`, `:1091`, `:1383`, `:1464`,
  `:1555`). Residual: F3.
- **P2 afterEntries fold** — ✓ landed at `:1515-1517`/`:1603-1605`; see hunt (a).
- **P5 warmCoverage ledger** — minted once per warm owner `warmCoverageComplete` (`:346-379`),
  mutation-maintained via `noteWarmCoverageEntryMutation` at `:308`, `:441`, `:547`, `:1094`;
  `handoffWarmOwnerWhenCovered` O(1). ✓
- **P6 evictIfUnowned O(1)** — `:1089-1113`. ✓

**Cross-lane spot checks (sibling lanes own these):** `src/core/backgroundPost.js` exists and
is wired at `main.js:1359,1383`, `uiRoot.js:167`, `programBinaryCache.js:216`,
`partsLibrary.js:9471,11197` (re-exported via compilePresentSlice); warn-dedup lanes live in
`src/core/warnDedup.js` with 162 `noteLaneFault`/`laneWarn`-class call sites across
main/renderer/ui; bus fault index machinery present in `src/core/eventBus.js:32-163`
(bounded per-listener index, verbatim budget, suppressed counters, diagnostics top-N).
`visibilityHolds`/`loadingHideOwners` present in assetResidency.js (7 sites).

## Golden hash

Audit-only — no tracked file touched; `sf-sim.mjs` determinism untouched by this wave's report.
