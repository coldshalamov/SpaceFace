# Wave-121 audit — lane: lod-in-frame

Branch `devin/1791504143-perf-w120`, HEAD `31352a672` (PR #257, contains wave-120 boot/popin/hitches; wave-120-lod on PR #247). Read-only audit; no code run.

`saturated: true` — after the W120-lod machinery verified clean, no unaddressed **material**, evidence-supported optimization remains in this lane. What remains is enumerated below: all L-class, bounded, and fail-closed.

## Regression verification — W120 machinery

### lod (PR #247, `ec2c91b93`)

- **Bolus rig intensity-gating**: VERIFIED. `bolusView.js` — shaft lights live on a separate `lightGroup` permanently mounted at `renderer.scene` (`:152`); `view.group.visible = inside` flips only the mesh group (`:29`). Lights gate on intensity (`:35` = 0 outside, `:97` restores); no `.visible` write exists on `lightGroup` or lights. `noteShadowCensusLightMutation` at mount (`:153`) and dispose (`:161-163`).
- **Marrow spot**: VERIFIED. `marrowCone.js` — spot mounted at `renderer.scene` (`:53-54`), `spot.intensity = inside ? 14 : 0` (`:32`), never visible-flipped; palette rig `ambient/key/rim/fill` dim by intensity only (`:19-22`); `spaceBg.group.visible` flip (`:26`) is visual-only — rig lights mount at scene level (`renderer.js:32230-32244`), not inside spaceBg. Census notes at `:55`/`:66`.
- **Leftover witness freshness gate**: VERIFIED. `renderer.js:30839-30852` — `leftoverLiveSig` requires `memo.epoch === shadowCensusEpoch() && !memo.pendingIter`; `leftoverSig = lightSig != null ? lightSig : leftoverLiveSig` — an unsigned arm under a stale/pending memo gets `leftoverSigs = []` → every mesh counts leftover → requeue (fail-closed). Comment at `:843-846` documents AnyCurrent deliberately not consulted.
- **Any-band collect epoch stamp**: VERIFIED. `renderer.js:29384-29389` — `STAGE_COLLECT_EPOCH_KEY` stamped on ANY completed unscoped collect; `STAGE_SELF_DIRTY_KEY` stays band-1-only (correct: a band<1 collect gated on `!queued` never consulted the dirtySeq compare).
- **Bulk re-stage**: VERIFIED. `renderer.js:30395-30430` — `sliceRoots.length >= 4` + `bulkSet` minus `deferredRoots`; `bulkSig = lightSig ?? _depthCollectLightSig(scene)` (fresh-or-null; null → per-root fallback); driven under `armNow() < collectDeadline`; `iter.return()` on abandon; `completedRoots` trusted wholesale, partial → per-root. `collectUnstagedShadowCastersBulkSteps` (`shadowDepthAdmission.js:635`) prunes nested roots to a topmost forest and attributes each caster to EVERY pending ancestor via the climb (`:695-704`), verdict chain identical to the per-root variant (`:673-694`).

### hitches (PR #257, `20bb78011`)

- **H1-H5 background seams**: VERIFIED. `src/core/backgroundPost.js` exists, zero imports — render-free twin (`scheduler.postTask({priority:'background'})` + bounded `setTimeout`). `main.js:24` imports it, used at `:1359`/`:1383` (nextFrame/nextPaint). `uiRoot.js:23` imports it, used at `:167` (yieldPresentationFrame). `programBinaryCache.js:216` and `partsLibrary.js:9471` dispatch drains via `postTaskAtBackgroundPriorityBounded` (correctly importing the render-layer twin from `compilePresentSlice.js`). `pipelineReadiness.js:258-263` — both quietTimer and maxTimer dispatch `armCallbackAfterPresent(flushQueued, {idleBoundMs:48})` → `postTaskAtBackgroundPriorityBounded`; no inline resolve inside a timer callback.
- **H6-H10 dedup sweep**: VERIFIED. Every converted site carries a static site key; dynamic data (entity.id, url, role, label) rides message args — no per-ID parameterized keys (the W116 defect class is absent). Sites confirmed against the diff: partsLibrary ×4 (`authored-geology-unavailable`, `authored-place-admission`, `authored-composition`, `pooled-chunk-admission`), vfx ×6 `dedupError`, uiStage ×5, input ×4 `dedupError`, openingGpuAdmission ×2, killcamStage, deepSkyPlates, asteroidInstancePool variant-retire, materialLibrary unknown-role, uiRoot ×3 (prewarm/paintWarm/warm-cycle), pipelineReadiness `onRejected` default.
- **B1+B2 bus fault LRU**: VERIFIED. `eventBus.js` — `noteBusHandlerError` does `busErrorIndex.delete(entry); busErrorIndex.add(entry)` per fault (true LRU refresh — a storming row can't age out mid-storm); `rowsForBusListener` evict deletes the evicted key's rows from `busErrorIndex` (no orphaned double-count).

### popin (PR #257, `241b5be05`)

- **P1 pendingKeys memo**: VERIFIED. `assetResidency.js:78-86` — `activePendingKeySet()` caches on `pendingRequestsVersion`; bumps at `beginRequest` (`:408`) and `finishRequest` (`:418`); consults share the minted Set (`:572,1091,1385,1464,1555`).
- **P3 soft-budget arm suppression**: VERIFIED. `softBudgetArmSuppressed++/--` wraps `release()` inside BOTH evict loops — sync `evictOldestSoftEntries` (`:875-877`) and Steps twin (`:902-904`); try/finally scope never crosses a yield. Arm sites `release()` (`:561`) and `releaseOwner` (`:460`) gate on `=== 0` — a nested release under suppression cannot re-arm `softBudgetPending`. (`retain()`'s arm at `:330` is correctly ungated — outside the release-suppression contract.)
- **P4 enforceBudgetSteps / sector:exit fused leg**: VERIFIED. `enforceBudgetSteps` (`:1552+`) mirrors `enforceBudget` exactly — same `budgetTotals`, `activePendingKeySet` snapshot, `governorEntry` census (paced 256-stride), same under-ceiling synthetic-plan early-out, same `governor.plan`, same evict-loop live re-checks (`isGovernorEntryEvictable`/`everyOwnerEvictable`/`visibilityHeld`), same `afterEntries` reuse when `plan.evict.length===0`, identical frozen receipt. `applySectorExitResidency` honors `options.deferBudgetEnforce` (`:1707` — inline enforce skipped). `renderer.js:19321-19351` — `driveCacheCleanup` builds the fused iterator: leg1 `releaseUnreferencedCacheOwnersSteps(primary)`, leg2 postDispatch leg (after `_sectorExitCleanupPendingPost=false`), leg3 `enforceBudgetSteps('gpu')` — chained AFTER postDispatch per contract; no-Steps fallback drives sync twins then iterator-or-sync enforce.

### boot (PR #257, `ca626ba4a`) — **MESSAGE↔DIFF MISMATCH**

The commit message and `PR194-WAVE-LOG.md` wave-120 entry advertise 8 items: `buildBank` Steps yields, `decryptArchive` seal-assert move, audit verdict asserts (`PENDING-GATE-LEAK`/`PENDING-NO-DRAIN`) under `cooperativeSlice`, 8192-stride `recordLedger` sweep, sg02 publish pacing >128 rows, prewarm-eviction + nearest-wreck cooperative slice, `bus.subscribeVector` unsubscribe pacing, combat drained-shield pacing cell.

**None of those identifiers exist anywhere on HEAD** (`git grep` over `src/` for `buildBank`, `decryptArchive`, `subscribeVector`, `cooperativeSlice`, `PENDING-GATE`, `recordLedger`, `nearestWreck`, `drainedShield`, `shardComplete` — zero hits; `buildBankPlate` in lawArenaDressing.js is a prop builder). Either the findings' names were fictional, or the described work never landed. The wave-121 boot verification block therefore CANNOT be verified as written.

What `ca626ba4a` ACTUALLY implements (all verified-good):
- `restoreCombatStateSteps` (persistence.js) + save epilogue yields (saveSystem.js:5064-5084 — per-`afterContinue` yields, `yield*` combat/physics legs)
- `physics.completeRestoreSteps` + `_finishNativeRestoreSteps` (physics.js:392-447) with `Sg02DynamicBodyOwner.syncFromEntitiesSteps`/`rebuildWorldFromEntitiesSteps` (16-mint stride, atomic `_commitNativeOwner`)
- `bus.setEmitSliceBudget('sector:exit', 8)` scoped to the restore session (saveSystem.js:4802-4807 + eventBus.js:384-387)
- `restoreSeq` guards on autosave prime (`:2618-2647`) and stale-finalizer `save:error` (`:5347-5357`)
- Epoch guards on three `setActiveRoot`/`setActiveVisualRoot` closures (partsLibrary.js:3135, 3828, 4007 — mirroring `installPreparedBoundaryPublisher`)
- `_restoreFrameYield` itself dispatches via `postRestoreTaskAtBackgroundPriorityBounded` with rAF+48ms bound and starved-downgrade (saveSystem.js:4747-4775)

**Owner action needed**: adjudicate whether the advertised B1-B8 items were (i) hallucinated into the wave log (the audit findings reference nonexistent functions — if so the wave-120 boot log entry is fiction and needs a correction note), or (ii) implemented on a branch that never merged. I found no branch containing the identifiers.

## Residual enumeration (the lane's four questions)

**(a) Census-churn sources — CLOSED.** Sig = `fogKind | type:layersMask:castShadow × count` over visible-subtree lights (`shadowDepthAdmission.js:457-480`). Every remaining census-affecting site is pooled-permanent or epoch-noted: sector rig (mount-once, `renderer.js:10241-46`), vfx event pool (always-visible, `vfx.js:15143-170`), weapon pool (always-visible, `weaponLights.js:22-41`), nozzle light (always-visible, `flightOverheadPresentation.js:19-32`), precompile stand-ins (deliberate 2-note compile census, `precompile.js:198,237,257`), teardown `heldLight` (`renderer.js:32583,32690,32713`), keyLight `castShadow` (change-gated + noted, setting-toggle only, `:31277,31323,31400`), authored assets (lights REJECTED — `renderPackageLoader.js:655`, `assetLoader.js:1562`), fog kind (stable — palette lerp mutates color/density only, `:32307-32325`), light `layers.mask` (no writes), offscreen-preview scenes irrelevant. No unwitnessed/un-pooled source remains.

**(b) 1-3 pending-root case.** Per root: `unstagedCache` consult (membership re-prove + dual-sig mark re-prove, no walk — `:30485-30520`) else bounded `collectUnstagedShadowCasters` (cap×depthNodeScale, `:30524-30535`) else defer on `collectSig==null` (`:30521`). Residual: **nested pending roots (B ⊂ A) pay overlapping per-root walks** — the bulk path's forest-prune dedup only engages at ≥4. Small: requires two pending roots in an ancestor relation at one arm.

**(c) Dead-serve witnesses — CLOSED.** Every memo consult is freshness-gated or documented fail-closed: parked prefilter (`:29149-29226`, epoch-stamped honest), collectServeLive (`:29354-29362`), cov serve (`:29584-29591`), markSig (`:30375` — raw serve OK: marks under a dead sig fail every live-sig compare → counted unstaged → re-staged; wasted work only, never a cold link), collectSigs dual (`:30474-30480`), leftoverSigs (fixed), rescue (`:30153-30158` requires live epoch + `!pendingIter`), `_depthCollectLightSig` (`:29960-29992` — memo only when epoch live; null inside presented frame/spent wallet → unsigned arm), bulkSig (`:30406` same serve).

**(d) Remaining pop-out/cold-link classes — all L-class, fail-closed:**

1. **Unsigned-arm dead-mark churn** (`:30375`): arm fired while `forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS` or inside a presented window mints marks under `markSig = _shadowCensusForFrame()` — a dead serve while `pendingIter` runs → marks dead-on-arrival → next arm re-collects + re-stages those meshes. Bounded ~1 arm cadence (~48-100ms) per affected root; requires the spend+pendingIter conjunction.
2. **`collectSig == null` defer inside presented frames** (`:30521`): the collect leg breaks, unvisited roots stay withheld → blink extends one arm. Pacing-inherent.
3. **Nested pending roots < 4** (per (b)): overlapping subtree walks.
4. **Bulk-clean roots leave `entry.unstagedCache = null`** (`:30447`): a completed-with-zero-unstaged root that re-queues (later flip) pays a fresh full collect instead of a cache consult. Rare — requires the root to stay/re-enter pending.
5. **Stand-in upgrade retry floor** (`visualOverrides.js:190` `STAND_IN_RETRY_MS = 200`): a substrate whose record lands mid-window holds the fallback marker up to 200ms past residency. Deliberate throttle protecting N-pending resolver scans; swap itself is atomic (`:686-694` remove+add same step — no blank gap).

## Ranked findings

None material. The enumeration above is the honest tail of this lane: every residual is bounded, fail-closed, and buys little. If the owner wants the list anyway, ordered by expected value:

### R1 — Forest-prune / shared-walk dedup for the <4 pending-root case
- **Evidence**: `renderer.js:30395` (`sliceRoots.length >= 4` gate) vs `shadowDepthAdmission.js:648-656` (forest pruning exists only in the bulk twin); per-root path `:30524-30535` walks each root independently.
- **Mechanism**: two pending roots in an ancestor relation at one arm → the outer root's collect walks the inner root's subtree, then the inner root re-walks it. Bounded once per arm per nesting level.
- **Fix sketch**: drop the threshold to `>= 2` (the bulk twin already returns partial→per-root fallback) or skip a pending root provably inside another pending root (one ancestor check per slice root).
- **Effort S · Impact L · Risk low** — the ≥4 gate may exist to keep the small case on the cheaper per-root consult; verify the break-even on real pending sets before moving it.

### R2 — Suppress mark minting when the serve is known-dead
- **Evidence**: `renderer.js:30375` `markSig = lightSig != null ? lightSig : this._shadowCensusForFrame()` — an unsigned arm under `pendingIter` mints marks keyed to the dead serve (`_shadowCensusForFrame` deliberately serves the previous epoch while re-mint pends, `:29790-29920`).
- **Mechanism**: those marks can never satisfy a live-sig compare → the arm's stage work re-runs next arm. Fail-closed, bounded; only fires when `forcedFrameSpend >= 8ms` or a presented-window arm coincides with a live `pendingIter`.
- **Fix sketch**: when `lightSig == null` and the memo is stale/pending, skip mark mints this arm (leave meshes withheld; requeue) — same fail-closed posture minus the wasted ceremony.
- **Effort S · Impact L · Risk low**.

### R3 — Record empty-set proof on bulk-cleaned roots
- **Evidence**: `renderer.js:30444-30448` — `entry.unstagedCache = bulkFound.length > 0 ? {...} : null`.
- **Mechanism**: a bulk-completed clean root that re-queues (next flip while entry survives) pays a full collect instead of a `seq`-keyed cache consult; the per-root path retains `cache.meshes = live` for exactly this.
- **Fix sketch**: write `{seq, epoch: armSigEpoch, meshes: []}` (or the full walked set, matching the per-root shape) instead of null.
- **Effort XS · Impact L · Risk low**.

## Deferred / not re-reported

- Mass shadow blink on a census flip remains inherent to epoch-keyed marks — the bulk path shrinks the bookkeeping; the new-census variants must still link before draw. (W120 F3's residual.)
- `STAND_IN_RETRY_MS` floor is a throttle trade-off, not a defect — flagged only as the remaining stand-in dwell bound.
- W120-boot message↔diff mismatch is reported as a regression note (cross-lane), not a lod finding.
- All KNOWN DEFERRED/WONTFIX and preexisting-failure lists honored.
