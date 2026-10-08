# W111 audit — popin-admission

- **Target:** `coldshalamov/SpaceFace` @ `74cb6ef6508493a158e7dedcdd156d5dee61083c` (master FETCH_HEAD)
- **Verdict:** findings
- **Saturated:** no

## Hunt items

### (a) consult-debit asymmetry leftovers — mostly clean, one live residue

All 15 `consultForcedFrameWallet` sites in `src/render/renderer.js` and the 4 in `src/render/sectorArrivalCook.js` follow consult → run → `debitForcedFrameWallet` correctly. The keepGpu reconcile stepped mint (`renderer.js:~2749`) is consult-then-mint-paced — sound. `drainHoldExemptCookBeat` consults `pacedFrameSpend()` pre-scan and again per-step inside each phase loop, and `drainDeferredEnterSlice` (`src/core/sectorEnterDefer.js:~130`) checks `now() < deadline && pacedFrameSpend() < PACED_FRAME_BUDGET_MS` per iteration — both use the real ledger, not replaced-by-own-timer fallbacks. Residue:

- **F4 — forced admission start ignores both wallets (low–medium).** `shouldStartHeavyAdmissionEventually` (`renderer.js:6680`) returns true on the 9th consecutive late frame and the call site runs one mesh build without consulting `pacedFrameSpend()` or `forcedFrameSpend()`. This is the starvation floor for pending builds; every other forced lane consults the wallet before forcing work. Bounded to one build per drain pass (~4 ms worst-case), so it self-limits — but the consult is free to add and would defer the forced start by at most a frame when the wallet is spent. Effort S; risk low (starvation bound stretches by a frame on an already-late lane).

### (b) unsigned-census consult sites — direction verified, one real bug

- **`collectUnstagedShadowCastersFlag` (28594) + arm-collect (29273) + per-row mark checks (29465, 29536):** null consult reads "not mark-current" → withhold/re-stage direction. Conservative, and re-staging under a real-but-different sig is also correct. No issue.
- **Census `sigFallback` (29143):** presented gate `(a)` reject + `(b)` merge-spawned sweep + `(c)` route `will`/`might` to the *absent* arm branch under null — all present and correct.
- **F1 — null `lightSig` stamp permanently disarms depth-park drift-release (medium).** `parkedEntry.lightSig` is stamped once at mint from `state.render.shadowLightCensus` — a synchronous read that races the memoized chunked census and can stamp `null` (sites: `renderer.js:28481`, and the parked-mints at ~29351 and ~29484). The parked loop's drift-release clause (`renderer.js:~28515`, `parkedEntry.lightSig != null && census && census.sig !== ...`) then reads dead for the *entire life of the parked entry* — the null is latched, not re-read per pass. A parked caster whose un-withhold condition is a light-census mutation never gets the prompt release; it waits out the depth-park recheck backstop, which escalates through the doubling idle window up to ~768+ syncs (~12 s at 60 fps) before a forced recheck. Fix: re-consult `readShadowLightCensusMemo(state.render)` in the parked loop when `lightSig == null` (or re-stamp on each idle wake). Effort S; risk low — bounded staleness in a correctness lane, worst case a delayed shadow admission.

### (c) `_openingSpawnedBindPending` dedupe masking — dedupe sound, one sibling-leg gap

The Set-dedupe / null-check design is verified: pending entries store slot ids and the spawned leg re-resolves `feed.slotToEntity → entities.get → _meshes` at visit time, so a re-announced slot binds its *current* occupant — no stale-entity masking. Rows skipped for `world.alive[slot] !== 1` re-mint correctly because the pending-list identity check fails. The pending list clears only on leg completion (26475), rebind-completion (26946), or a fresh open mint (26926) — in all three cases the old list is dead. Worst-case masking is a bounded one-pass deferral, not a lost row.

- **F2 — whole-set rebind leg binds doomed/not-alive slots the spawned leg refuses (medium).** `_rebindPresentationMeshesSteps` (`renderer.js:~2900`, used by both `_rebindPresentationMeshes` and `_rebindPresentationMeshSnapshot`) applies only the entity-side conjunction (`entity && entity.alive !== false && entity.mesh === mesh && view.root === mesh`) — it never consults `world.alive[slot]` or `world.doomed[slot]` the way `_bindOpeningSpawnedMeshesSteps` does at `renderer.js:3199`. `bindMesh` clears `world.doomed[slot] = 0` (3259), so an armed remap/rebuilt+delta rebind un-dooms a doomed-but-retained row and draws it — a ghost pop-in for frames until the resident sweep re-dooms it. Compounding: on rebind completion the site nulls the pending list on the claim "a whole-set rebind covers every announced spawned row" (26946) — true for mesh presence (Map iteration is live + late builds bind at the build site), but the coverage claim is only exact if the conjunctions match, and they don't. Fix: in the rebind leg, resolve the slot via `feed.handleForEntityId(id)`/feed walks and apply the same `alive[slot] !== 1 || doomed[slot] === 1` skip before binding. Effort S; risk low–medium (per-row slot lookup cost on a bounded loop; verify the feed is non-null in the `_bindOpeningSpawnedMeshRow === null` rebind callers, which push `null` feed).

### (d) remaining un-budgeted admission-path walks — clean

- `drainDeferredEnterSlice` is wallet-consulted and per-step deadline-bounded, including the hold-end call with `budgetMs = 4`.
- `settleRebuildBridges` caps 32 rows/pass with a `visitBound` so an all-parked map can't burn the cap re-checking rotated rows; faulting rows get one tail-retry then drop with `releaseRebuildBridge` cover — per-row bounded.
- `liveGeometryAdmissions` (`src/render/liveGeometryAdmission.js`) drains sliced: merged residency ~8 roots/pass, urgent on-glass set in one deadline pass, past-budget latch reopens on cooldown — all bounded.
- `drainDeferredEnterMaterializers` (the *inline* whole-queue drain) is unbudgeted, but both call sites (`renderer.js:16377`, `16381`) are non-presented bail paths in `prepareLiveSectorAfterJump` (`not-flight`, `no-sector-shell`). Not a presented-beat walk; flag only if a future caller moves it inside a pass.

## W110 regression verification

All 11 checks hold at the base commit:

1. **Rebind + pack post-step wallet floors:** present at ~27045 and ~27130; post-step consult per iteration, ≥1 step guaranteed, belt on the drive loops.
2. **keepGpu reattach-mint gate:** `mintResidentReattachSweep` (1938) closes the in-flight iterator before re-minting; the pump mints only under `!_residentReattachIter` and `faultEpoch` mismatch (2621); remap-identity re-mint at 2633 also closes first. No overlap or leak.
3. **Forced-wallet consult→debit:** all 15 sites verified; no run-without-debit, no consult-only, no double-debit.
4. **Publish-tail `tryPresentedCall`:** 30+ sites (activity-frame, camera-follow, opening-vfx, contact-shadow-pool, ship-aux, shield-shell, shadow-*, authored-instances, asteroid-instances, frame-membrane, adaptive-quality, residency-service, ship-pitch, sector-post/palette, backdrop…); yields between band calls pace through the stepped driver's `yieldToBrowser` (not rAF-bound — a suspended pass can't deadlock the veil lift).
5. **`_openingSpawnedBindPending`:** `_openingSpawnedBindActive` set at mint, cleared in `finally`; Set-dedupe applied at *both* concat sites (26465, 26930). No unconditional-clear path found.
6. **Census `sigFallback` presented gate:** verified — `(a)`/`(b)`/`(c)` all correct.
7. **`laneWarn` `warnDedup`:** cleared on epoch flip; 8 verbatim warnings + 1 epoch summary; non-render emissions unconditional.
8. **`laneFaults` completeness:** `fencePack` (27133), `holdExempt` (3686), both census catches (29063, 29113) stamped — **except F3 below.**
9. **`prepareFrame` head belts:** `frame-membrane` + `adaptive-quality` wrapped; `_publishSnapshotFenceStats` carries the belt *inside* the method (25395) so every call site is covered. All post-publish bodies commute without touching presented state.
10. **`arrivalReserve` composite epoch:** `serviceFaultEpoch` (`renderer.js:~3060`) = `enterSerial || faultState.epoch || faultStamp` — clears on epoch change or stamp mint.
11. **`drainDeferredEnterSlice` epoch-bounded:** `holdEpoch` param gates steps (an old hold can't step a newer enter's live entries); dead-epoch pre-drop closes held iterators; clock/tick pinning saved+restored per provider.

**F3 — keepGpu `_reconcileIter` drive catch missing lane contract (low–medium).** The keepGpu-window drive at `renderer.js:~2765` catches a reconcile step fault and parks, but (i) never calls `noteLaneFault`/`laneWarn` so `state.render.laneFaults` misses it, and (ii) has none of the bounded in-epoch retry machinery (`_reconcileFaultRetries`/`_reconcileRetryAt`) the identical sibling drive carries at ~3215–3265 — a transient fault there retries next pass; here it parks the whole reconcile for the rest of the enter. Hot enter with a flapping entity lookup leaves the lane silently starved. Fix: mirror the sibling's `noteLaneFault` + `slot.faults`-style bounded retry. Effort S.

## Remaining hits not yet audited

- The two `_openingSpawnedBindPending === null` rebind callers (3514, 3690, 3803) push `feed: null` — F2's fix must tolerate a null feed (fall back to bind or skip per caller intent; 3514–3519 already calls `guardOpeningSpawnedBindMasked` first).
- `recordSpawnedBindCoverage`/`recordRebindBindCoverage`/`markOpeningSpawnedBindLeg` run *after* `_meshes` mints the entry (27007) — telemetry-only, no correctness gate reads them before they're stamped; left un-audited for stat drift.
- `pendingIndex` reuse across legs (spawned leg leaving `_openingSpawnedBindIndex` mid-list while a rebind parks mid-walk) — no evidence of a lost row, but the shared cursor's interaction with two interleaved legs deserves a follow-up if a dropped-bind report ever surfaces.

## Residual risk

The admission machinery is now nearly fully walleted and fault-instrumented; what remains is a small class of **correctness-adjacent residuals**: latched census reads (F1), conjunction skew between sibling bind legs (F2), and one un-instrumented fault park (F3) — each bounded, each cheap, none blocking. F4 is borderline-by-design.

**Saturated: no** — 4 findings (2 medium, 1 low–medium, 1 low), all Effort S.
