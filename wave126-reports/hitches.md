# Wave 126 — in-flight-hitches audit report

**Lane:** in-flight-hitches (long frames during flight)
**Audit head:** `61ca3532c` on `devin/1791504143-perf-w120` (floor `767089340` satisfied)
**saturated: true** — no unaddressed, MATERIAL, evidence-supported optimization remains in scope. The W125 shelved-discovery lane verified healthy (measured), the B3 atomic-burst enumeration has zero delta since W125's exhausted retag sweep, and every other enumerated surface is either paced or adjudicated-deferred. The only open avenues carry explicitly documented preconditions (kill funnel) or sit at deferred boundaries (listener-classification surgery).

---

## Ranked findings

None material. One low-impact residual is recorded under Lane results (e) for completeness — it fails the materiality bar on this box's CPU evidence.

---

## Lane results

### (a) shelvedDiscovery lane costs — verified healthy, measured

**Machinery confirmed** (`src/world/activityRuntime.js:868-1044`): partition-0 members (shelved tiers + unstamped gap entities, `entity._physicsPartition !== 1 && !== 2` at :994) sit in `runtime.shelvedDiscovery.cells` — `Map<cellKey, Set<entity>>` at `CLASSIFY_DISCOVERY_CELL_WU = 2048` keyed on build-time pos (:986-987). Quiet passes compute `pad = discover + shelved.maxPresence` and walk the `[cx0..cx1]×[cz0..cz1]` cell band, envelope-testing candidates with LIVE pos (:1019-1043). `walks`/`queries` counters on the lane object (:967-976, :983, :1015) make it observable. The full walk remains the cold build plus the `pass % CLASSIFY_DISCOVERY_AUDIT_EVERY` (=8) audit (:981). Tests: `test/classify-shelved-discovery.test.mjs` — 4/4 green at HEAD.

**Micro-benchmark** (this box, node 24, `scratch-w126-shelved-bench.mjs` — synthetic fat sector, N=2000 entities, 1916 partition-0 members, 206 cells, latches disarmed):

| Pass kind | n | p50 | p95 | max |
|---|---|---|---|---|
| fresh (cells query) | 70 | **0.17 ms** | 1.17 ms | 2.47 ms |
| stale (walk + rebuild, audit/membership) | 10 | **0.73 ms** | 3.06 ms | 3.06 ms |
| churn (index.version bumped every tick → every pass stale) | 20 | **1.07 ms** | 3.10 ms | 3.10 ms |

- **Rebuild frequency under churn:** staleness keys on the GLOBAL `index.version` (every sanctioned append/remove/sector-sync/collision-sync bumps it — `coreSystem.js:922,1102,1264,1361` etc.) and `PHYSICS_PARTITION_EPOCH` (every partition byte flip — `activityRuntime.js:2161-2180` plus `admitSameTickProjectiles` :856). I initially suspected over-invalidation (lane-subsettable), but it is correct-by-necessity: **any** spawned entity is a partition-0 member during its gap window until stamped/admitted, and only partition-0 members need cells — projectile/pickup churn therefore legitimately invalidates. Under sustained churn every pass pays walk+rebuild (~1.07 ms p50 at 2K scale) — vs the W124 baseline's plain walk, the added cost is the O(partition-0) Set/Map build, ≤ ~0.3 ms at this scale. Never worse than the status quo it replaced in any meaningful way.
- **2048wu cell fan-out on large-presence members:** `pad = discover + maxPresence` where `maxPresence` is the LARGEST `entityPresenceRadius` among ALL partition-0 members sector-wide — one huge member (station-grade presence) inflates every query's cell band (`pad/2048` squared ≈ cells touched). Candidates are still envelope-tested individually, so correctness holds; the cost is extra bucket scans. At fixture maxPresence=39 the band is ~1-2 cells/axis; a 2000wu presence bumps pad into the ~4-9 cells/axis range — bounded, and discover dominates anyway once it exceeds a cell. Not a defect; the alternative (per-candidate pad expansion) loses the cell coverage the map exists to provide.
- **Every-8th audit is the right cadence:** the only sanctioned silent mover on a shelved member's pos is `catchUpEntity`'s ballisticDrift write (`activityRuntime.js:316-332`), and it runs **inside** `applyStamp`'s tier-flip transition (:483) which refreshes the partition byte (:498-500) → epoch bump → immediate rebuild. The `worldCatchup.js` drifts at :183/:187/:277 operate on world *records*, not entityList members. So the audit only covers UNSANCTIONED pos writes (there are none sanctioned today) — a safety net that bounds a hypothetical silent mover's rediscovery stall to 8 incremental passes (~0.13 s at classify cadence) for 12.5% of quiet passes paying the full walk. Raising it (e.g. 32) buys ~0.3 ms/quiet-pass at a ~0.5 s worst stall — marginal either way; 8 is defensible and I do not recommend changing it.
- **Residual observation (not a finding):** the W125 commit dropped the `poseTableDiscoveryScan` fast path — stale passes now always pay the object walk rather than the columnar scan. At measured cost (~0.7-1 ms p50 on 2K entities) re-introducing it is not worth the dual-path complexity. Also `shelved.pass` never resets — the %8 phase drifts harmlessly across the runtime's life.
- **Evidence level:** PERFORMANCE_VERIFIED on CPU-side counters for the fresh-vs-stale split (matched workload, same box); the absolute magnitude on a real sector composition is hardware-unverified (SwiftShader box — see H1).

### (b) B3 sim-atomic-burst — zero delta since W125's exhausted enumeration

`git grep` at `664985df7` (W125 audit head) vs `61ca3532c` (this head): **identical file set (138 files) and identical registration count (104 inline `on('entity:killed'|'entity:destroyed')` registrations)**; `git diff` between the revs shows `src/core/eventBus.js`, `src/render/presentationRunner.js`, `src/core/physics.js` all untouched. W125's result stands verbatim: every remaining inline listener is sim-authority (ledger writes, sim-mutating responders, same-flush ordering couplings — killReplay's journal, lawSecurity's truth handoff, lootShards' pod spawn); zero provable presentation-pure listeners remain; the ~20K inline invocations on K-corpse ticks are sim-contracted under current design. The only remaining lever is dispatch-gate/needs-declaration machinery = the listener-classification surgery adjudicated-deferred (F4/F5/F9 tick-paced emit slicing — crossing sim ticks changes when sim writes land). **No new mechanism evidence → not re-listed as a finding.**

### (c) `_emitSg02ContactImpacts` pile-up — unchanged since W125

`src/core/physics.js` has no delta between `664985df7` and HEAD (confirmed by `git diff --stat`). W125's enumeration holds: 7 presentation-tier consumers already drain paced (audioSystem, asteroidMotionPresentation, feel, shipMicroMotion, gamepad, barkDirector, hud cue — pooled payloads snapshot-cloned at emit); ~20 inline remain, all sim-authority (damage/impulse/records). No new presentation-only consumer entered the fan-out. **No finding.**

### (d) deferred-enter materialization drain under burst — pacing intact, no delta

`src/core/sectorEnterDefer.js` untouched since `664985df7`. The renderer delta in this range is the W126-F1 roster pool (see Regression notes) — the drain call sites (`renderer.js` seam exempt-collect beat `HOLD_EXEMPT_COLLECT_SECONDS` → `drainDeferredEnterSlice(..., 4ms, holdEpoch)`; hold-end `_seamDeferredDrain` 4 ms/frame tail under the 2 s `_seamDeferredExtendS` budget; hard-enter census splice under `SECTOR_ENTER_LISTENER_BUDGET` with all providers `*Steps()` generators) verified present and unchanged. The atomic `drainDeferredEnterMaterializers` still fires only on non-flight/non-shell-admission paths. **No finding; watch item stands: a future provider returning a non-generator body would brick a slice under the min-1-step guarantee.**

### (e) remaining O(entityList)/O(assets) walks on presented paths — one documented residual

Swept `state.entityList` / `entities.values()` consumers across `src/{render,systems,combat,ai,core,world}`. What remains falls into three buckets:

1. **Behind-veil cooks (fine):** `renderer.js:1233-1241` pass-split ship/other scans, `:13915` covered-key census, `:14029` cook-seen walk, `:16511` variant-count walk, `:21898` launch-hull keep-set — all inside survival/first-flight cook paths with `pacedFrameSpend()`/`PACED_FRAME_BUDGET_MS` yields or shell-gated; `_publishArrivalRosterSteps` (`:23266`) intentionally reverted to full-list pooling in W126-F1 and runs once per sector enter inside a stepped generator.
2. **Early-exit finds / rare-event walks (fine):** `barkDirector.js:2387` station-pos fallback (index-hit short-circuit first), `lawSecurity.js:4733` surrender stand-down (rare accepted-surrender event), `alienEcology.js:1960/:2000` claim-crew proxy binds (encounter-scoped, `proxyEntityId` memo'd), `choirReliefBerth.js:107`, `memorialThief.js:40`, etc.
3. **The documented residual — unconditional corpse collect** (`coreSystem.js`, reverted-in by `2a5fbebd6`): the per-tick `alive===false` collect walks O(entityList) unconditionally because ~168 `alive=false` write sites lack a `DIRTY.MEMBERSHIP` funnel — deferred discovery broke same-tick corpse visibility (Ceres pocket-tender stall, bisected). The avenue the revert names: **a kill funnel — route all `alive=false` writes through markDirty (or a `killEntity`/`markDead` helper), then re-land deferred corpse compaction.** Effort **L** (~168 write sites + the funnel), magic-frame impact **L** on this box's evidence (the scan is measured cheap; the revert itself calls the win "cosmetic" — the expensive removal legs already only ran on corpse ticks). Evidence level: MECHANISM_VERIFIED for the avenue's existence (revert commit documents the blocker) / UNVERIFIED for benefit magnitude. **Fails the materiality bar — recorded for completeness, not counted against saturation.**

---

## Regression notes (wave-125 machinery at `61ca3532c`)

All verified PASS; one prompt item is superseded by a landed W126 change (noted, not a regression).

1. **Sector lane (popin F1) — PASS.** `entitySectorIndexKey` = `e.homeSectorId || (data && (data.homeSectorId || data.sectorId)) || null` — the canonical chain, no current-sector default (`coreSystem.js:1114-1118`). `appendEntityIndex` stamps `e._indexSectorKey` + `indexSlotMember` (:917-918); `removeEntityIndex` unindexes on the stamp (:1066-1070); `removeEntitiesFromIndex` batch twin unindexes + bumps (:1447-1449); `syncEntitySectorMembership` re-keys on effective change (:1306-1316). `laneVersions.sectorMemberships` bumps on append (:919), remove (:1069), sync (:1315), batch (:1449) — every membership move.
2. **Restamp funnel (popin F2) — PASS.** `scripts/lib/sectorMembershipGuard.mjs` scans 5 owner dirs against a 13-file allowlist (+1 caller-synced `worldRecords.js`); test `the real tree has zero unfunneled sector restamps` + `every allowlisted restamp file is still present` both green — `sector-membership-index.test.mjs` 9/9 PASS. `alienEcology.js:503-509/:818` and `precursorMachines.js:984-992/:1031-1040` read `bySectorId.get(sectorId)` as pre-filters with the SAME per-member `homeSectorId` predicates (bucket coverage is exact because homeSectorId heads the chain). **Superseded note:** `renderer._publishArrivalRosterSteps` no longer reads buckets — W126-F1 (`3f98caa1a`) restored full-entityList pooling because the roster census has NO sector predicate and foreign-stamped entrants went invisible to the warm mint. Deliberate, documented, correct — the roster now pools `entityList` directly (`renderer.js:23259-23266`).
3. **Under-veil NG+ (boot CONTAMINATED-1) — PASS.** `resolveNewGamePlusOverlay` is async (`main.js:866`), awaited inside `prepareRun` AFTER `enterLoadingMode` (`main.js:592,597`) — no multi-MB sync `_prepareNewGamePlusSlot` on the click frame. It prefers `prepareNewGamePlusAsync` (saveSystem.js:2580 → `_prepareNewGamePlusSlotAsync` :2551, worker-sliced `_prepareEnvelopeStringAsync`) with the sync `prepareNewGamePlus` as fallback (:870-874). Failure throws `GameStartReadinessError` → `runNewGameStartTransition` catch → `discardRun` (`newGameStartTransition.js:145-152`, `main.js:712` discardPreparedNewGameScene).
4. **Mirror deltas (boot) — PASS.** Both recovery-promotion sites emit `{[LS_PREFIX+slot]:backupRaw, INDEX_KEY:indexJson}` through `_queueSharedStoreMirror` — sync lane `saveSystem.js:4349-4351`, async lane `:4463-4465` (indexJson-conditional fallback preserved). Worker-encode settle forwards `limit`/`actual` (:3434-3439). `bumpSaveStoreGeneration` covers `sf.settings.*` alongside LS_PREFIX/RECOVERY_PREFIX (:110-146).
5. **Shelved discovery (hitches F1) — PASS + measured.** Cells keyed on build-time pos; quiet queries pad by `discover + maxPresence`; walk = cold build + every-8th audit; `PHYSICS_PARTITION_EPOCH`/`entityIndexVersion` movement forces rebuild; `walks`/`queries` counters present; 4/4 lane tests + benchmark numbers in Lane (a).
6. **W124 spot-checks (touched-by-W125 subset) — PASS.** W125/W126 touched `saveSystem.js` and `assetResidency.js`, so: (i) `mirrorPatch` shape at `_writeSlot`/`deleteSlot` preserved (verified alongside item 4); (ii) seq-guarded rotate repoint intact — `appliedRotateSeq`/`pendingSectorTarget`/`hasPendingRotate` + `repin()` consuming `latestRotateSeq` (`assetResidency.js:1695-1728,1835-1938`); (iii) **new** `enforcePlanMemo` (W125, `:2216-2226/:2383-2393` + twin) keys on `residencyMutationSeq` + `pendingRequestSeq` + byte ledgers + cap — mutation funnels verified at register :362, owner index :714, unindex :743, evict :1623, pending 0↔1 :100/:113; the evict path still re-checks `isGovernorEntryEvictable` + per-owner + `visibilityHeld` against live state before releasing (:2304-2322) — a memoized plan cannot skip live evictions. `presentationRunner` frame-tail quarantine untouched in range — not re-verified per prompt rule.

## Hardware-unverified queue

- **H1:** real-sector classify-pass cost of the shelved lane (fat sectors, real `entityPresenceRadius` mix, genuine churn rate driving stale-pass frequency). Owner repro: `SPACEFACE_WITNESS_MS=60000 npm run probe:runtime-witness -- --no-sample-shots` and `npm run probe:smooth-flight` from `design/perf/scoreboard.json`; `runtime.shelvedDiscovery.{walks,queries}` counters distinguish stale vs fresh pass mix live.

## Bench artifact

`scratch-w126-shelved-bench.mjs` in the audit worktree (uncommitted, per audit-only contract) — synthetic 2000-entity sector, drives `ensureActivityClassified` headlessly, prints fresh/stale/churn pass percentiles and the lane's own counters.
