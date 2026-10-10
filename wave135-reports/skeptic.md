# Wave 135 skeptic — disprove-the-gains review

Audited `coldshalamov/SpaceFace` @ `devin/1791504143-perf-w120` HEAD **`dee9cf774`** (verified).
Scope: W131–W134 commits (W130 coverage through `5a020b909`), emphasis on `1ec5546d2`,
`e83b71af1`, `5ed97cda5`, `d7e03df63`; W130 remediation `d7470cc4a` re-verified.
No code written, no app run; line cites are against `dee9cf774`.

## Verdict: clean: false — 3 medium findings, 1 low

Wave 134's claim-stamp machinery is internally consistent, but its consumers are not:
the dominant exit sweep never got the gate, live-boundary claims are stamped once and
never refreshed so they always lapse, and the W134 boot fill leaves a dead-end when the
spec emit is suppressed. All three are real regressions/attribution gaps, not nits.

## F1 — Live-boundary claims lapse at +120 s while their consumers still live (M)
**Class:** completeness regression · **Commits:** `5ed97cda5` (stamps minted once),
`e83b71af1`, `1ec5546d2` (sweeps that now read them)

- `sectorClaimStampIfMissing` stamps **only if undefined** (`assetResidency.js:889`).
  Live-boundary / `'player'` / `'current-sector'` owner rows are indexed once at mint
  (`retain()` ~`assetResidency.js:409-460`) and **never re-stamped**: the existing-owner
  retain path returns `false` early after refreshing `lastWarmClaimAtMs` — it does not
  call `unionOwnerSector` (~`assetResidency.js:402-407`), so no union ever re-runs for
  them. Warm-armed claims stay fresh only because `reclaimWarm` unions the posted
  sector each poll (~`assetResidency.js:494-505`); nothing posts for live owners
  (`partsLibrary.js:7251, 10580` retain once at mount).
- Consequence: after `SECTOR_CLAIM_STALE_MS` (120 s, `assetResidency.js:795`) every
  live claim is stale (`sectorClaimFresh` false) while the asset is still mounted and
  presented. Consumers now reading lapsed claims:
  1. `prepareSectorExit(includePlayer:true)` (`assetResidency.js:1919-1944`) — the
     save/restore teardown hold, its flagship use (`renderer.js:18814`). On any scene
     dwelt >120 s the hold retains ~nothing → during the destroy→rehydrate gap live
     files are soft-only → eviction pressure pops them → post-restore re-decode
     pop-in. The gap the hold exists to cover is unprotected exactly when the save
     matters (mature world).
  2. `entryCorridorRank` (`assetResidency.js:997-1008`) — mounted live files fall to
     the `-1` evict-first corridor cohort.
  3. Lapsed members are prunable out of `sectorOwnerIndex` by unrelated
     `unionOwnerSector` adds (`assetResidency.js:846-860`), so the index drifts away
     from real demand.
- **Minimal repro:** mint a live-boundary owner on a mounted GLB, advance wall time
  past 120 s without warm re-posts (ordinary play), then save→load same-sector or run
  a soft-eviction pass. Pre-`5ed97cda5` the hold carried these rows via
  `row.nonPlayer > 0`; now it skips them.
- **Fix direction:** refresh live-owner stamps on a poll (unionOwnerSector for
  role `'live-boundary'`-family rows in the residency pass, or gate
  `hasLiveSectorClaim` on claim OR live-owner role), or exempt live rows from lapse.

## F2 — Rotation exit sweeps never got the claim gate (M)
**Class:** attribution gap (mechanism absent on the dominant path) · **Commit:** `5ed97cda5`

- The commit message claims members lapsed past the staleness window "are skipped by
  the exit sweeps". True only for `prepareSectorExit` (`:1922`) and
  `prepareSectorExitDeferred` (`:1968`). The rotation sweep — the exit path that runs
  on every sector change — filters `row.nonPlayer > 0` only, in both twins:
  `rotateSector` (`assetResidency.js:1873-1880`) and `rotateSectorDeferred`
  (`assetResidency.js:2024-2025`).
- Consequence: a member whose claim lapsed >120 s still rides the
  `'warm-previous-sector'` cohort on every rotate — retained under the warm owner and
  held until the next rotate or owner release. Exactly the "session history, not live
  demand" P2 set out to fix, still present on the dominant path. In soft-budget
  pressure these dead-sector bytes crowd the budget and can evict files the arrival
  sector needs (indirect pop-in amplifier).
- **Minimal repro:** let an armed warm claim lapse (no re-posts >120 s), then rotate
  sectors — the lapsed entry still acquires `warm-previous-sector` ownership; compare
  with `prepareSectorExitDeferred` under identical lapse, which drops it.
- **Fix direction:** apply the same `hasLiveSectorClaim(entry, sid, includePlayer, nowMs)`
  filter to both rotate sweeps; the snapshot iterator already exists for the deferred
  twin.

## F3 — `fillSlotData` spec fallback dead-ends on ok-but-suppressed prepares (M)
**Class:** completeness regression (deferred-then-never-completed work) · **Commit:** `d7e03df63`

- `fillSlotData` (`saveLoad.js:819-840`) latches `entry.attempted`, then on
  `prepared.ok === true` returns early — assuming the `save:envelopeSpecPrepared` emit
  fills `entry.data`. The emit has three extra gates (`saveSystem.js:2567-2577`): arm
  identity (`this._speculativeContinuePrepare !== spec`), `spec.sig === 'gen:'+gen`,
  and menu/frozen mode. When any of them suppress the emit on an ok prepare, nothing
  fills `entry.data` — and `fillSlotData`'s own early-return prevents the lazy tail;
  `fillSlotDataLazy` is additionally guarded by `!entry.data`/`attempted` so it never
  retries. The "disjoint" claim in the commit message is false: `ok===true` vs `!ok`
  is not exhaustive — "ok but emit-suppressed" fills nothing.
- Consequence: the memo entry for that slot stays `data:null` for the whole
  generation — blank portrait/stats on the presented Save/Load stage. Two reachable
  triggers: (a) re-pick inside the worker window replaces the arm → emit suppressed →
  re-picking the abandoned row shows blank portrait indefinitely (no gen bump to
  re-mint); (b) a mid-resolve store write (autosave/settings — the W131-F3 dwell
  scenario) bumps the gen → emit suppressed → the *settled* row blanks until the next
  render after the sig change re-mints the entry.
- **Minimal repro:** pick row A → pick row B within the worker roundtrip → pick A back
  in a quiet menu (no writes): A's portrait stays blank. Same result letting an
  autosave land between dispatch and resolve on the settled row.
- **Fix direction:** mirror the emit's fill on suppression — i.e., in the `.then`,
  run `fillSlotDataLazy` whenever the emit will not have fired (check the same three
  gates), not only when `ok !== true`; or have the suppressed emit still write
  `entry.data` for `refs.selected === slot`.

## F4 — Lapsed members are never pruned under stable arms (L)
**Class:** complexity debt · **Commit:** `e83b71af1`

- `unionOwnerSector` returns early on `has(sid)` (`assetResidency.js:843-845`) —
  stamping fresh but skipping the lapsed-prune loop that only runs on new-member adds
  (`:846-860`). Under a stable arm (same sectors re-posted every poll — the common
  steady state), dead members accumulate in `entry.metadata.sectorIds` and
  `sectorOwnerIndex` until owner release.
- Consequence: the index keeps stale demand alive — the two ungated rotate sweeps
  (F2) then carry it; diagnostics `sectors` rows (`:2162`) report sectors nobody
  armed in hours. Self-bounding (bounded by warm-owner lifetime) but contrary to the
  set's stated purpose of tracking live demand.
- **Fix direction:** run the prune loop before the `has()` early return, or prune
  during the periodic residency pass rather than only on adds.

## Verified clean (subtraction / attribution / debt hunts)

- **spec envelope consume (`d7e03df63`):** `spec.prepared` shape identical to the sync
  chain (`_prepareEnvelopeStringAsync` → same `{ok, env|data, version}`; migrate +
  `normalizeRestorableData` pure on bytes; gzip path unchanged; non-ok falls through
  to `_prepareEnvelopeStringAsync` preserving reason surface). Sync consume reads
  `.ok`/`.data` only (`saveSystem.js:4749-4756, 5278`); `acceptSeq`/destructive-commit
  guards unchanged. `specByteHit` tautology is safe — unmaterialized thunk ≡ current
  bytes read in the same task (`:4859`); materialized `spec.raw` goes through real
  string equality.
- **Generation signature airtight:** install-before-read at every consult; wrapped
  `setItem`/`removeItem`/`clear` + storage events all bump; `_saveStoreApplySilenced`
  carve-out correct (foreign writes arrive outside the flag); post-apply cache stamp
  gated on unchanged gen.
- **sectorIds union (`1ec5546d2`):** index deltas mirror `sectorOwnerIndex`, unindex
  covers unions, `ownersVersion`/ledger bookkeeping intact; `verifyLedgerConsistency`
  recomputes the same side, no false drift. `request.metadata` is a fresh unfrozen
  object per `beginRequest` (`:578`) — the in-flight union can write it safely;
  `commit()`→`retain()` re-union is idempotent.
- **`authoredPreloadPlanMemo` key coverage complete** (`partsLibrary.js:1187-1215`):
  every whole-ship predicate input verified keyed — `entity.id/factionId/team/radius`,
  all `data.*` fields read by `wholeShipVisualForEntity`/
  `requiresProductionWholeShipForEntity`/faction kits/`visibleFittingsForEntity`
  (`data.fittings`, `data.defId`), per-weapon `defId:facing:size`, options tuple.
  WeakMap — no leak.
- **W130 remediation (`d7470cc4a`):** F1 `deferRestoringEmit` ordering correct
  (capture → emit → first chunk; close-without-emit on capture failure consistent);
  F2 silenced facade correct; F3 `shelvedDiscoveryMoved` envelope test + rebuild
  clear correct.
- **W131 latch removals:** every re-post arm still gated by its own arm condition
  (dueAt/spawnAt runway, row state) — no unconditional per-frame work; re-post cost
  bounded by request coalescing + `reclaimWarm` Map lookup. `disarmSpeculativePrepare`
  wired on `onHide`/`dispose`; timer + emit both re-check mode.
- **Steps/iterator safety:** `rotateSectorDeferred` abandon-safe (`onAbandoned`
  finalizes the marker; `committed` flag; `finally` releases partial mint);
  `prepareSectorExitDeferred` mutates nothing before first `.next()` —
  abandon-safe by construction; `finally` releases the partial `mintIterator`.
- **Boot lane:** `deleteSlot` direct index write + merged-cache splice consistent;
  `saveImportByteLength` band gate verdict-identical (per-unit walk only inside the
  band); `_attachProfileToExport` splice semantically identical for produced shapes
  (documented `"profile"`-substring over-trip falls to the correct parse path);
  value-riding re-arm + 200 ms parked dispatch sound; LRU memo bounded at 6.
- **No drawable/LOD/resolution/shadow/effects subtraction** in W131–W134 diffs;
  warm coverage only increased (latch deletions re-post rather than strand cold).
  Sim is untouched — golden `0b33dde` claim consistent with the diff surface
  (save UI, residency ledger, warm polls only).
- Spec fan-in mint bypassing LRU trim and the retained `raw` on memo entries:
  documented nits, bounded (6 entries), not findings.

## Notes for next waves

- SwiftShader host: all frame-time claims remain hardware-unverified (per-lane
  disclaimers acknowledged); findings above are load/coverage-path defects that do
  not depend on GPU timing.
- The claim-stamp design needs a decision: either live owners periodically re-claim
  (F1 fix), or the lapse concept applies to warm arms only and live rows are
  exempted everywhere (`hasLiveSectorClaim` OR live-role). Today's split —
  live rows stamped once, judged by the lapse window — is the worst of both.
