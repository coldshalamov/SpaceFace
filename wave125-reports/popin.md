# Wave-125 Audit Report — lane: popin-admission

- **Repo**: coldshalamov/SpaceFace
- **Audited commit**: `664985df7` (branch `devin/1791504143-perf-w120`, PR #257 open — waves 120–124)
- **W124 commits under audit**: `ece6d36d5` (popin), `aec85e97d` (boot), `db49720e7` (hitches)
- **Hardware**: Windows Server 2022 + SwiftShader. No GPU present; GPU-cost conclusions are hardware-unverified. CPU-side counters only.
- **Mode**: read-only audit. No code written, no PRs, no app launches. Node used only for micro-benchmarks (none needed this wave — all findings are mechanism-verified from source).

## Verdict

`saturated: false` — four evidence-supported findings remain in-lane, ranked below.

## Findings (ranked by evidence × materiality)

### F1 — Sector→entity membership is now buildable; declining it leaves a per-enter O(entities) roster walk plus already-latent cache staleness

**Evidence (MECHANISM_VERIFIED)**

- `src/render/renderer.js:~23215` — `*_publishArrivalRosterSteps(exactSectorId)` calls `buildArrivalRosterSteps(entities, rosterOpts, batchRows)`, a full `state.entityList` walk on every sector:enter (paced, but total work is O(all entities)).
- `src/core/coreSystem.js` — the index already owns every post-append restamp primitive a `bySectorId` lane needs: `appendEntityIndex` bumps `index.version++`; `_wrIndexStamp`/`byWorldRecordId` mints stamped membership with first-holder-wins + survivor remap; `indexSlotMember`/`syncEntityActivitySlotMembership` maintains `byActivityObjectSlotId`/`byActivityActorSlotId`; `syncEntityTypeLaneMembership` is the precedent for post-append membership mutation.
- **New defect evidence the decline review did not cite**: `src/systems/precursorMachines.js:~970-985`, `src/systems/alienEcology.js:~490-510,795-815` — `machinesCache`, `faunaCache`, `sorterTargetCache` are `(laneVersion|entityIndexVersion, sectorId)`-latched sector-membership scans filtered by `e.homeSectorId === sectorId`. A bare post-append `e.homeSectorId = X` does not bump `index.version`, so these caches serve stale sector membership until the next unrelated append — i.e. unfunneled restamps are *already* producing wrong answers today, not just blocking the index.
- Restamp census (entity-bearing, post-append): `aftermathWrecks.js:1856`; `ambientPredation.js:749,1002` (`ai.sectorId`); `encounterDirector.js:993,1083,1335,1393`; `factionPresence.js:342-344`; `heistFacilities.js:536,541,2636,2911,2925,3223`; `missions.js:9196`; `mothlight.js:58`; `palletJack.js:152,155,326`; `traffic.js:2468-2470,2611-2613,4815,4905`; `uniqueWrecks.js:1465`; `world.js:807,2314,7376`; `worldSiteRuntime.js:499-500`; `velocityLanguage.js:398,413`; `asteroidSites.js:1420`. (~16 sites; spawn-literal sites are covered free at append time.)

**Mechanism**: a `syncEntitySectorMembership(entity, sectorId, source)` helper on coreSystem, mirroring `syncEntityTypeLaneMembership`, stamps `data.sectorId`/`homeSectorId`/`data.homeSectorId` and bumps a `sectorMemberships` lane version only on effective change. Feeds `bySectorId: Map<sectorId, Set<entity>>` for the roster builder and fixes the latch-staleness above as a side effect.

**Fix sketch**: add lane + helper; convert the ~9 genuinely post-append re-home sites (predation, encounter, aftermath, traffic, factionPresence, palletJack, mothlight, worldSiteRuntime) — spec-literal and snapshot-restore sites get membership free at append; source-pin allowlist test like the existing restamp pins. Narrower coverable subset if full conversion is rejected: the ~9 live-entity re-home sites only.

**Effort**: M | **Magic-frame impact**: M (kills O(N) roster walk per enter + repairs latent under-count in sector caches → fewer under-warmed sectors) | **Risk**: M (membership divergence is the named failure mode; mitigated by source-pin test)

### F2 — Governor census remains O(assets) per enforce even under budget; funnels for a sublinear structure already exist

**Evidence (MECHANISM_VERIFIED)**

- `src/render/resourceGovernor.js:305-360` — `selectEvictions` still maps the full entry list (per-row `numericBytes` eval + stamp check), walks `blockedSource` tallying `governorEntryBlockReasons` per blocked row, and early-returns under budget — the O(A log A) sort is already behind the early return (`:341`), so the residual per-call cost is the O(A) projection + O(B)·reasons + the caller-side census rebuild (`entryList`/`iterTwoSets` + `governorRow` consults + `activePendingKeys` snapshot).
- Sublinear structures, in order of leverage:
  1. **Global membership-version memo** — `noteOwnerMembershipIndexed`/`noteOwnerMembershipUnindexed` (assetResidency.js:~685-713) are already the single funnel mutating owner sets. A counter bumped there (+ register/evict) lets `enforceBudget` skip row re-derivation when the version is unchanged since the last plan: governorRow's `validatedUnits` memo (W124) already proves the pattern.
  2. **Persistent unit-owner index** — `resources.set` at register + `finalizeResource` shrink are the only asset-mutation funnels; `entryUnitIds`/`memoryUnitOwners` could be maintained incrementally there instead of rebuilt per enforce (O(U+E) → O(1) amortized).
  3. **Not viable**: filter-to-evictable before sort — `blockedBytesByRole`/`blockedBytesByReason` accumulate during the selection walk up to the budget break, so dropping non-evictable rows changes receipt fields. Rejected on the byte-identical-receipts contract.

**Fix sketch**: mint `ownerMembershipVersion` in the two note* funnels + register/evict paths; `enforceBudget` memos `(assetsVersion, ownerMembershipVersion)` and short-circuits to `lastPlan` when both unchanged and no active-pending delta.

**Effort**: S-M | **Magic-frame impact**: M (every under-budget residency poll and sector:exit enforce pays O(assets) today) | **Risk**: L-M (memo invalidation; the funnel inventory is small and enumerable)

### F3 — Warm-mint coverage gap: retains without `metadata.sectorId` silently opt out of sector-exit warming

**Evidence (MECHANISM_VERIFIED mechanism, UNVERIFIED incidence)**

- `src/render/assetResidency.js:1825` — the exit mint retains `rows[i]` from `sectorOwnerIndex.get(previousSectorId)` where `row.nonPlayer > 0`; `sectorOwnerIndex` membership requires `metadata.sectorId != null` at retain time (`:685-686`, `:1041-1042`, `:1138-1139`).
- Consequence: any boundary retain whose owner metadata omits `sectorId` (deliberately scopeless roles like runtime/decode caches are fine; the gap is *entity-adjacent* retains minted without it) is invisible to the warm mint → evictable under pressure → re-crossing pops.
- Deferred-enter coverage (the other named gap class) is mostly closed: 24 provider families defer via `deferSectorEnterMaterialization` and drain under the cook's slice clock with identical FIFO order; their packages ride envelope stubs/roster covers. Residual = dynamic cohorts whose entity set isn't enumerable until the provider runs (mission/encounter-driven spawns) — no pre-spawn warm exists for these by construction.

**Fix sketch**: default `sectorId` at retain time from the call-site sector when the owner role is entity-scoped; or emit a one-line diagnostic listing sectorId-less retains touching sector entries to size the incidence before building.

**Effort**: S | **Magic-frame impact**: L-M | **Risk**: L

### F4 — Queued-but-never-started rotation mints leave `appliedRotateSeq` lagging (diagnostics-only residual)

**Evidence (MECHANISM_VERIFIED, low materiality)**

- `src/render/assetResidency.js:~130-141,1868` — a superseded mint that started repoints only while `rotateSeq > appliedRotateSeq` and clears its own pending marker; repin consumes all queued seqs. A mint killed by the fused iterator's `.return()` *before starting* never repoints and never clears — `currentSectorId`/`appliedRotateSeq` lag while `pendingSectorTarget`/`hasPendingRotate` still encode the newest REQUESTED sector, which is what `effectiveCurrentSectorId()` and all call-time decisions read.
- Consumer check: `sector-rotated`/`sector-exit-warmed` emits have no subscribers; corridor feed is `updatePredictedSectorPrewarm` (target-driven, not `currentSectorId`-driven). Raw `currentSectorId` has no production reader outside the rotate machinery — the residual is wasted drain work of a dead mint's retain pass (drains to completion mid-supersede), not corruption.

**Fix sketch**: none required for correctness; if desired, an abandonment hook on iterator `.return()` could fast-forward `appliedRotateSeq` and skip the dead mint's remaining retain legs.

**Effort**: S | **Magic-frame impact**: L (bounded wasted work per supersede, not a visible defect) | **Risk**: L

## Regression verification — W124 machinery (all concretely verified)

| Item | Verdict |
|---|---|
| **popin F2 incremental plan** (`ece6d36d5`) | VERIFIED — `resourceGovernor.js:310-313` skips re-stamping rows already carrying `kind`+`bytes` (`governorRow` memos); `unitIdsByIndex = options.entryUnitIds || entryUnitIdentities(list, kind)` threads the caller census; `unitRemaining` decrement frees a unit exactly at its last selected owner (== old allSelected rescan); decorated sort `(b.priority-a.priority, bb-ba, localeCompare)` ≡ `compareEvictionOrder` since stamped `bytes === numericBytes(entry,kind)` → evict order and receipts byte-identical; `summedEntryBytes` computed lazily in the else-arm only. `validatedUnits` ≡ `memoryUnitList(row)` because governorEntry dedupes unit identities and every `unit.bytes` producer normalizes to `Number`. |
| **popin F1 rotate sequencing** | VERIFIED — `assetResidency.js:~130-141` — `effectiveCurrentSectorId()` returns `pendingSectorTarget` while `hasPendingRotate` (newest REQUESTED); `rotateSector`/`rotateSectorDeferred` mint `++latestRotateSeq`; deferred tail repoints only while `rotateSeq > appliedRotateSeq` (newest APPLIED); `finally` clears `hasPendingRotate` only when `pendingSectorTarget === exactNext` (abandoned mint clears its own marker); repin at `~L1868` consumes all queued seqs. |
| **boot F1 delta mirror** (`aec85e97d`) | VERIFIED — `_writeSlot` returns `mirrorPatch {primaryKey:json, recoveryKey:previousRaw\|null, INDEX_KEY:indexJson}` with `recoveryGone` set at both quota-sacrifice `removeItem` sites; `_publishSaveResult` → `_queueSharedStoreMirror(write.mirrorPatch)`; no-patch arm defers to `_collectSharedStoreKeysChunked` (generation-bracketed via `_saveStoreGeneration`); `_evictForQuotaPressure` emits `{key:null}` tombstones; `deleteSlot` emits the same patch shape. |
| **boot F2 worker encode** | VERIFIED — `_encodeEnvelopeViaWorker` posts `encode_begin`/`encode_part`/`encode_player_begin`/`encode_bag_begin` + `encode_finish` under `AUTOSAVE_TARGET_SLICE_MS` drives; `_postSaveEncodeEntry` is the single post arm for autosave AND rpc; named bound verdicts pass verbatim; infra reasons (`no_worker`/`save_worker_failed`/`save_worker_timeout`/`post_failed`) degrade to the sync checksum+stringify legs with identical samples; `runEpoch` staleness aborts as `superseded`. |
| **hitches F1 frame tail** (`db49720e7`) | VERIFIED — `presentationRunner.js` `frame()`'s finally tail guards `perf.recordFrameCallback` + tier1 samplers behind try/catch (20-cap `[loop] frame tail error:` ledger); the post-finally `checkGraphicsRecovery`→restore→schedule segment sits in its own try so `schedule()` is unconditional. |
| **boot F3 async export** | VERIFIED — `_finishExportJsonAsync` runs `_serializeDataFrozenAsync` + envelope mint only when `!json`, then delegates to `_finishExportJson`; `exportSlot` calls the sync path unchanged. |
| W123 spot-check | Unaffected by W124 commits — corpse latch+probe at `lifetimeSweep` (`LIFETIME_CORPSE_SWEEP_PERIOD_TICKS`, `_lifetimeCorpseProbeCursor`), paced save chain, and lane-version machinery untouched. |

## Lane-hunt summary

- **(a) F3 sector→entity index**: now feasible — precedent machinery exists (`_wrIndexStamp`, `syncEntityActivitySlotMembership`, `syncEntityTypeLaneMembership`); ~16 restamp sites enumerated; ~9 need the funnel. Also repairs already-live staleness in `(laneVersion, sectorId)`-latched caches. → Finding F1.
- **(b) Census total work**: sort is behind the under-budget early return; residual per-call O(assets) is projection + blocked tally + caller census. Next sublinear step is a membership-version memo + persistent unit-owner index, not another filter. → Finding F2.
- **(c) Warm-mint gaps**: scopeless retains (no `metadata.sectorId`) are invisible to the exit mint; deferred-enter cohorts are cook-covered except non-enumerable dynamic spawns. → Finding F3.
- **(d) Stranded rotations**: verified — every drop path `.return()`s first; only never-started mints leave a diagnostics-only lag. → Finding F4 (informational).

## Explicitly not re-reported

Adjudicated KEEP/DOCUMENTED/REJECTED/GATED items from `design/perf/PERF_W4_CLOSURE_2026-09-29.md` and `HILLCLIMB-LOG.md` were read and are excluded per the audit contract.
