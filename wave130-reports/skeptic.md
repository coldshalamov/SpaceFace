# W130 skeptic — disprove-the-gains audit

Lane: wave-130 skeptical review. Audited `devin/1791504143-perf-w120` at `5a020b909` (post-c19a717f8 floor). Range reviewed: `db49720e7..5a020b909` (12 code commits, W125-W130 + one revert). Read-only audit; no app runs. Prior coverage: W125 skeptic through `db49720e7` (its F1/F2 were re-checked here — F1 is fixed, F2's patch was superseded by the gen-bracketed collect design).

## Verdict

clean: false

One confirmed correctness/attribution defect (M), two bounded completeness/timing defects (L). No verified quality subtraction on the visual path — the one real coverage narrowing found in-range (W125 roster bucketing) was caught and reverted by the lane itself in 3f98caa1a before shipping harm. Causality of the major claimed wins is sound on inspection; GPU/frame-time claims remain SwiftShader-unverified as flagged in the brief.

---

## Findings (ranked)

### F1 — Deferred rollback capture snapshots a partially-wiped world (M)

- **Class:** correctness defect + attribution failure
- **Commit:** `e057d80b7` ("W128 boot — deferred rollback capture + async slot scans")
- **Where:** `src/save/saveSystem.js` — `_restore` ~5485-5497 and `_restoreAsync` ~5541-5553: `const s = this._openRestoreSession(...)` runs *first*, then `marker.resolved = this._captureRollbackSnapshot()` / `await this._captureRollbackSnapshotAsync(...)`.
- **What:** `loadAsync`/`load` on the live-sim Continue path mint `rollbackSnapshot = { deferred: true }` (~4690, ~5338) and resolve it inside the opened session — but `_openRestoreSession` (~5630) synchronously emits `save:restoring`, which runs ~53 listeners that mutate serialized live state *before* the capture walks it:
  - `src/systems/tensionDirector.js:~180` — `save:restoring` sets `this._engine.state.policy = null`; `_serializeDataSteps` bakes `data.tensionDirector = clonePlain(state.tensionDirector)` (`saveSystem.js:~947`) → rollback bytes carry `policy: null` even though pre-wipe state had one.
  - `src/systems/encounterDirector.js:~4127` — `clearAllPredationBindings` on `save:restoring` writes `data.ai.passive/predationStatus`, deletes `predationTargetId/Objective` on live entities; `plainEntity` serializes `data` via `clonePlain` → persistent entities restore pre-wipe with predation cleared.
  - `src/systems/automation.js:~552` — `save:restoring` → `_releaseOutpostEntity` → `helpers.removeEntity` frees ids → serialized `freeIds`/`nextEntityId` ordering differs from pre-wipe.
  - `state.sessionEntityIdRemap`/`restoreEnvelopeRecordIds`/`enterSerial` stamps also land before capture (not directly serialized, but feed entity-remap consumers).
- **Attribution failure:** the commit message's correctness claim — "capture bytes are identical since world.serialize() reads none of the session-stamped fields" — is only true for `world.serialize()` itself; the snapshot also serializes `tensionDirector` and every `plainEntity`, which the listeners do touch.
- **Minimal repro reasoning:** on a live flight session with `state.tensionDirector.policy != null` (or any entity carrying `data.ai.predationTargetId`), trigger a failing Continue-load of a newer slot → `_handleLoadFailure`/`_deferredCaptureFailure` consumes `rollbackSnapshot` whose bytes encode the *post-wipe* tensionDirector/AI state → the world the player is returned to is not the world they left: policy-less director and cleared predation bindings persist into the "restored" sim.
- **Severity:** M — the divergence is real and persistent, but it only manifests on the restore-failure path (a successful restore discards the snapshot). Not a ship-blocker; a fidelity regression on the safety net.

### F2 — `_sharedStoreCollectCache` stamps post-apply generation over an interleaved write (L)

- **Class:** correctness/timing (bounded)
- **Commits:** `2d7e46565` (chunked apply) + `5a1238be9` (cache reuse)
- **Where:** `src/save/saveSystem.js:~545` — after `applySharedStoreKeysChunked(merged, …)` returns, `this._sharedStoreCollectCache = { gen: _saveStoreGeneration, raws: new Map(Object.entries(merged)) }` captures the generation *after* a pass that yields the task queue every 8 entries.
- **What:** a tracked write (cross-tab `storage` event or a local `setItem` through the wrapped store) landing inside the apply's yield window bumps `_saveStoreGeneration` *and* can be overwritten by the apply's later `setItem` for the same key. The cache then claims the post-write generation while `merged` lacks that write: one `_slotStoreSignature[Async]` consult serves bytes under a "current" gen that do not reflect the landed write, and `_slotIndexCache` can publish `authoritative: true` under it until the next bump.
- **Minimal repro reasoning:** requires a concurrent writer during boot sync — plausible only via a second tab's storage event; single-tab the window is empty because all writers are on the same task queue the apply yields to. Bounded to one signature consult + one index publish.
- **Severity:** L — narrow window, self-healing on next bump; the pre-existing synchronous apply had the same race at zero width, so the regression is window-size, not kind.

### F3 — Shelved-member cell map stalls rediscovery up to 8 passes on silent pos writes (L)

- **Class:** completeness regression (bounded, documented)
- **Commit:** `b3b142e24` ("W125 hitches — shelved-member discovery cell map")
- **Where:** `src/world/activityRuntime.js:~878` — `runtime.shelvedDiscovery` cell map buckets partition-0 members by pos *at build time*; rebuilds on `indexVersion`/`PHYSICS_PARTITION_EPOCH` change or every `CLASSIFY_DISCOVERY_AUDIT_EVERY = 8` passes.
- **What:** the replaced O(list) walk re-read `entity.pos` every pass — zero staleness. A shelved member whose pos is written without an index-version bump (the comment itself names this: "a silent pos write on a shelved member") stays in its stale cell and is invisible to the cell-band query until the audit pass — up to 8 classify passes of rediscovery delay the walk never had. The per-candidate envelope test uses live pos, but only over cells the query visits.
- **Minimal repro reasoning:** `ballisticDrift`/worldCatchup or a sim write that repositions a dormant/partition-0 entity mid-window → player re-approaching its new position within 8 passes sees it un-stamped (pop-in/late discovery) where the walk caught it same-pass.
- **Severity:** L — audit-bounded and disclosed in-code; the claim "same coverage the walk produced" is eventually-true, not pass-equal. Frame cost of the finding is bounded by the 8-pass audit.

---

## Verified clean / non-findings

- **`e6e0e8b6e` warm-latch re-arm + `46ef3e012` latch deletion (W129/W130 popin):** `world:residency` payload shape verified at `src/systems/world.js:1265/1308/2202` (`{sectorId, tier, epoch}` rows); `clearSectorWarmLatchKeys` key prefixes (`sectorId` bare, `${sectorId}|` wing keys) match their Sets; the `_modularPoolWarmSectors` clear in it is dead-but-harmless (Set no longer exists post-delete). Per-poll re-post of warm requests is bounded by the ~43-file authored pool + `admitAuthoredAssetTask` dedupe + `beginRequest`/`cancel` lease re-pin, all inside the 4ms sliced residency iterator. No removal of dedupe semantics — the latch was redundant state, its delete is not a coverage cut.
- **W125-skeptic F1 (rotate-marker leak) — fixed:** `mintIterator.onAbandoned` (`src/render/assetResidency.js:~1899`) finalizes the rotation (`currentSectorId = exactNext`, `appliedRotateSeq = rotateSeq`) and clears `hasPendingRotate` only when the marker still belongs to that mint (`pendingSectorTarget === exactNext`); guarded no-op on already-completed mints, correct ordering when newer rotates superseded. All abandon call sites wired: `driveCacheCleanup` (`renderer.js:~19362`), fault path (~3224), fused `queueWarmMint` chains (~19572, ~19799).
- **`enforcePlanMemo` version-key soundness:** keyed on `(kind, residencyMutationSeq, pendingRequestSeq, cpuPackageBytes, gpuResidentBytes, unaccountedResources, governorCapBytes)`; byte ledgers are part of the key so a byte mutation without a seq bump still forces recompute. Owner-membership, pending-request, and eviction funnels all bump a seq; stepped twin re-validates at first `.next()`. No invalidation hole found on the census inputs.
- **`_slotIndexWithFallbackAsync` recursion** (`e057d80b7`): on `fresh.sig !== sig` it recurses after `Object.assign`-refreshing the burst — converges rather than looping; bounded by generation movement.
- **`_scanStoredSlotsAsync`/`_scanRecoverySlotsAsync` parallelism** (`5a1238be9`): `Promise.all` slices of 4 write disjoint `out[slot]` keys; `_prepareEnvelopeMetaAsync` is read-only per slot. No ordering change observable to callers.
- **`9e72466b4` NG+ under veil:** `resolveNewGamePlusOverlay` awaits inside the transition callback before the roster clear — failure lands in the transition's own discard path; ordering equivalent, no pre-veil mutation now happens post-veil-except-intended.
- **`745166697`:** `pushSharedPlayerStore` encoder gated on `keepalive === true` is a pure dead-work cut (`byteLength` only fed `carriesKeepalive`); `syncFreezeCards` bucket conversion keeps the per-member `data.bolus`/`pos`/`alive` predicates, and bolus organs always mint `homeSectorId: sector.id` (`theBolus.js:79`). Pre-push yield is semantics-neutral.
- **`2d7e46565` delta re-queue:** filtering the re-collect's rows by `_sharedStorePatch` keys is a correctness *fix* (fresher writer delta stays dominant), not a regression.
- **`3f98caa1a`:** note for the record — the W125 roster bucketing it reverted WAS a real coverage subtraction (foreign-claimed visitors invisible to the warm mint); the lane caught it in the same range and restored full `entityList` census. F2/F3 conversions keep per-member predicates that re-check the claim chain — verified verdict-identical (`authoredPrewarmRequestsForEntities` requires `String(homeSectorId || data.homeSectorId || data.sectorId || '') === exactSectorId`, exactly the bucket key chain).
- **`2a5fbebd6` revert:** restores unconditional corpse collect after a bisected sector-identity regression; the F2 diagnostics quarantine it keeps is explicitly retained. Golden bit-identical claim noted, hardware-unverified here.

## Sweep notes

- Subtraction scan over `origin/master..5a020b909` found no lowered quality defaults, removed effects/drawable coverage, weakened assertions, or "defer past benchmark" iterators beyond the items above. The `Steps` iterator inventory shows no abandoned mid-run legs that skip completion work.
- Causality: the popin lane's win claims (latch-free warm arms, sector buckets, chunked apply/signature) are attributable to real deleted work, not to moved measurement boundaries. Boot lane's deferred-capture win is real but bought at the F1 fidelity cost above. Frame-time magnitudes are unverifiable on this box (SwiftShader) as the brief warns.
