# Wave 134 — popin-admission audit report

Audited: `devin/1791504143-perf-w120` @ `807e2024502dbb9d23a115b9f834d791155413e5` (tip verified == pinned HEAD). Read-only via `git show`/`git grep` at SHA.

`saturated: false` — one verified (small) consult-ordering defect and one verified bounded-growth item remain inside lane scope.

## Findings

### P1 — reclaimWarm's resident early-return bypasses the in-flight consult

**Evidence:** `src/render/assetResidency.js:480-510` @ 807e20245 — the resident branch returns `false` on `!existingMetadata` *before* the `state.requests` scan runs:

```
if (entry && entry.state === 'resident') {
  const existingMetadata = entry.owners.get(owner);
  if (!existingMetadata) return false;      // <-- in-flight scan unreachable here
  unionOwnerSector(...); return true;
}
for (const request of state.requests) { ... union into request.metadata.sectorIds ... }
```

**Status:** MECHANISM_VERIFIED.

**Mechanism:** the seam the in-flight consult exists to cover is still open on one side. Sequence: owner O (the shared session warm owner) has an in-flight request for key K posted by arm A (sector X). K completes under a *different* owner first — decode task registry dedupes, so K can go `resident` under owner P while O's row is still pending. Arm B now consults `reclaimWarm(K, O, sectorY)` (assetLoader.js:721) inside the in-flight window: entry is resident, `entry.owners.get(O)` misses → early `return false` → caller mints a *second* request for K under O (`beginRequest` at assetLoader.js:724) instead of unioning sectorY onto the pending row. The extra row rides through `finishRequest` → `commit()` → `retain()`, which hits the existing-owner path and unions idempotently — so no ledger corruption, but the poll pays a duplicate `beginRequest`/`emit('request-begun')`/`commit`/`retain` cycle per poll leg while the window stays open (K resident-under-P + O's row pending = as long as O's in-flight row lives, i.e. until its own commit lands — typically one poll). Player-visible cost is nil; the cost is bounded ledger churn inside the paced residency poll.

**Fix sketch:** in the resident branch, when `!existingMetadata`, fall through to the `state.requests` scan instead of returning — union `sectorId` into a matching active request's `metadata.sectorIds` (the code that already exists below) and return true. ~4-line reorder; the in-flight arm is already written.

**Effort:** S. **Magic-frame impact:** L. **Risk:** low — same consult semantics, just reachable from both branches; verifyLedgerConsistency already re-derives `request.metadata` unions.

### P2 — sectorIds union is append-only for the life of an owner row (no age-out)

**Evidence:** `src/render/assetResidency.js:785-810` (`unionOwnerSector` adds only; `metadata.sectorIds` members leave the index only through `noteOwnerMembershipUnindexed` at owner release, 811-865). No claim-timestamp or corridor-membership prune exists anywhere `ownerSectorIds` is read (776-780 consumers: `entryCorridorRank` 943-952, diagnostics 2089, verify walk 1197+, sector sweeps ~1790-1990).

**Status:** MECHANISM_VERIFIED (growth); UNVERIFIED (performance effect — bounded).

**Mechanism:** a long-lived session owner (e.g. the shared warm owner) accumulates one `sectorIds` member per sector it was ever armed from — O(#sectors ever touched) per row, ~dozens on this game, never pruned. Two consequences: (a) `entryCorridorRank` iterates the full union per entry inside every soft-budget eviction sort — the sort already rides a memo/plan funnel, so this stays bounded; (b) the mirrored-F1 surface: a stale membership under sector X keeps `sectorOwnerIndex.get(X)` counting this entry, so X's `prepareSectorExit`/rotate sweep (which retains every row with `nonPlayer > 0`) carries the entry into an exit-warm cohort it no longer belongs to — one extra warm lease per stale row per sector exit, i.e. bytes stay warm for a sector whose real claim lapsed. Semantically defensible (the file *was* armed for X and X is being exited deliberately), but it's the same defect class as landed F1 — claim outlives its arming context — at lower stakes: the union keeps the entry warm rather than wrongly evictable.

**Fix sketch:** stamp `lastClaimAtMs` per union member (a `Map<sectorId, ms>` alongside `sectorIds`, or pairs in the Set) and have `entryCorridorRank`/`prepareSectorExit` readers skip memberships older than the corridor horizon — or simpler, prune members whose sector left the corridor in `setEvictionCorridor` (one sweep per corridor change, already rare). Either is a localized reader-side filter, no contract change.

**Effort:** M. **Magic-frame impact:** L (bounded memory + marginal over-warm on exits; worst case is deferred eviction of stale-warmed bytes under pressure). **Risk:** low-medium — any prune changes which claims rank in-corridor; must keep the resident-owner claim authoritative for live consumers.

## Regression notes — landed-wave verification

**W133 sector-union machinery (the wave's own commit, `e83b71af1`-era src/render/assetResidency.js) — PASS on every enumerated surface:**

- `retain()` mint path seeds `ownerMetadata.sectorIds` from `ownerSectorIds`+scalar and backfills scalar from a lone set; existing-owner path unions scalar + every `sectorIds` entry into `existingMetadata`; `sectorlessOwnerRetains` ledger counts only truly sectorless mints (checked post-seed, correct).
- `reclaimWarm` unions `sectorId` into `request.metadata.sectorIds` for a matching in-flight row (seeding the Set from scalar first) and into `existingMetadata` for a held resident — verified live (see P1 for the one branch-ordering gap).
- `unionOwnerSector` early-outs on null/dup, bumps `ownersVersion` + `residencyMutationSeq`, maintains `sectorOwnerIndex` `{total, nonPlayer}` with `entry.sectorOwnerRefs`; unindex removes every membership in the union and deletes empty `sectorMap`s.
- All union readers converted: `entryCorridorRank` iterates `ownerSectorIds` vs `evictionCorridorRanks`; `release`/`releaseOwner` unindex the whole union; `verifyLedgerConsistency` + `enforceSoftResidencyBudgetsSteps` re-derive from the union; `diagnostics().sectors` flat-maps `ownerSectorIds`; `rotateSector`/`prepareSectorExit`(+Deferred) read union-maintained `sectorOwnerIndex` rows and filter `nonPlayer > 0`.
- **nonPlayer role-stability (hunt ground a, sub-case):** `metadata.role` mints at retain from `presentationTier`/explicit role and is never mutated on a live owner row — the in-place metadata merge only touches `decodeWarm`/`decodeServed` flags. `row.nonPlayer` cannot drift from a mid-life role change. Clean.
- **commit→retain seam (hunt ground b):** `commit()` runs `finishRequest` (synchronous `emit('request-finished')`) before `retain` — a theoretical consult gap. Verified the emit feeds only the internal `events` ring + `options.onEvent`, and `getAssetResidency` never wires `onEvent` anywhere in `src/` (renderer.js ~10821-10826 passes only byte ceilings) — so no consult consumer can observe the gap, and commit→retain is synchronous on one thread. PASS, not a finding.
- **Union bypassers (hunt ground c):** surveyed every warm-arm call site in renderer.js — `warmEnemyRosterDecode`, nemesis pending/squad, `collectEncounterWarmChannels`/`warmAuthoredEncounterFiles`, encounter-pending runway, `kickSpawnedEntityDecode` family, packaged-decode-runway, combat-spawn, kill-hulk, save-envelope, `_routeDeepSectorWarm`/`_predictedSectorWarm`, both sector-prepared boundary arms, sector-prewarm additions, heist-payload, `mission:targetsProjected` → roster warm, survival/crucible roster prewarms, `_startDeferredWarmDecodes`, `warmPackageResidency.instanceOptions` — all thread `sectorId` through to loader/residency metadata (assetLoader.js:721/724/862, partsLibrary retain ~10577, renderPackage retain ~1474, `createAuthoredAssetLease` 560-578). The `'asset-retained'` emit still carries scalar `sectorId` — documented back-compat diagnostic, not a defect. PASS.
- **Per-poll warm-set spend (hunt ground d):** all ~18 warm arms ride the stepped residency poll at renderer.js:24964+ with `yield` between arm groups (3-4 arms per leg); `authoredPreloadPlanKey` builds are WeakMap-memoized per entity (partsLibrary.js:1184-1216); `hasActiveRequestForEntry` is O(1) off the refcounted `activePendingKeys` set (assetResidency.js:85-127); the `state.requests` scan inside `reclaimWarm` is bounded by the owner's in-flight count (≈decode concurrency, tens). No single poll leg is worth re-batching. PASS, no finding.
- **Once-fired/demote-keyed warms (hunt ground e):** no surviving post-latches outside the enumerated arms — gate-wing keeps only a *verdict* memo keyed on `(sectorId|to|day|faction|security|wanted)` and `clearSectorWarmLatchKeys` strips demoted-sector keys at renderer.js:18549-18552; `warmSeededModularPool` is explicitly latch-free (comment at 5995-5997, re-posts every poll, dedupes on the task registry); every poll-driven arm re-posts and relies on loader/residency dedupe. PASS.

**W132 spot-check (same-file re-verify, required because W133 touched saveSystem/saveLoad):** `SPEC_ARM_DEBOUNCE_MS = 200` present; `coveringSpeculativePrepare` is slot + `'gen:'+_saveStoreGeneration` keyed; `disarmSpeculativePrepare` wired at saveLoad.js:1668 and 1701-1702; `saveImportByteLength` byte-length band gate intact (length > MAX fails fast, `3*length <= MAX` fast-passes, walk only inside the band); sync consume reads `spec.readRaw()`, async path does `specByteHit` + `spec.dispatch()` flush. PASS.

## Hardware-unverified items

None this wave — all lane surfaces are CPU-side counters/paths; no GPU or frame-time claims made.
