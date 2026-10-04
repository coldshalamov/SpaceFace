# WAVE-74 AUDIT — lane: in-flight-hitches

Repo: coldshalamov/SpaceFace · branch `devin/1791064509-perf-w60` · HEAD `308c205ca` (W73 tip)
Audit-only: no code touched, no PRs, app not run. All evidence below is line-verified source reads.

---

## 1. Saturated

**`saturated: false`** — a contract-preserving defect with a concrete fix path remains (finding F1: the warm-root park flag can wedge and leave ~14k hidden nodes mounted, ~11 ms/frame, for the whole run).

---

## 2. Ranked findings

### F1 — Stranded mounted warm root: `userData.warmBuilding` never clears on two reachable paths → permanent ~11 ms/frame tax

**Evidence:** flag set `renderer.js:16189` (launch begin) and `:17276` (deferred warm); cleared ONLY at `:16557` (begin catch), `:16901` (`settleWarmBuilding` inside finish), `:17356`/`:17498` (deferred teardown/settle); `_parkBoundedWarmRoots` skips `warmBuilding===true` roots (`:17607`) and is the only detach path (`:11959`, `:12277` backstop).

**Mechanism — two vectors, same wedge:**

- **(a) Cook over-budget:** `finish()` is gated `if (crucibleWarm && !cookOverBudget())` at `:12948`. On exactly the contended hosts this machinery exists for, the cook over-budgets → finish skipped → flag stays true → every park sweep skips the root → the mounted hidden exemplar subtree (13,845 nodes ≈ ~11 ms/frame `updateMatrixWorld` per comment `:17586-89`) rides EVERY presented frame for the rest of the run. `warm.building` also stays true → `isResidencyOwnerActive` (`:16337`, `:16724`) pins its decode leases as live.
- **(b) Never-settling attachment:** `settleWarmBuilding` (`:16895-16904`) is a bare `Promise.allSettled(warm.pendingAttachments)` re-armed on growth — no deadline. One `requestAuthoredUpgrade` promise that never settles (hung decode/lease — the design itself notes "kicks still in flight past the deadline" `:16810`) wedges the flag identically. The deferred warm has the same bare `allSettled` at `:17441` → additionally wedges `state.render.swarmDeferredWarm.pending === true` → every later "Keep current loadout" click pays the 10 s draft-gate stall (`crucibleDraft.js:775-78`) and its fresh rows lie covered forever (blocked coverage → first live spawn pays in-round compose anyway).

**Fix sketch:** bound the settle — race `allSettled` vs a deadline (e.g. 30 s); on expiry clear `userData.warmBuilding` (late-settling attaches then fail `boundaryBelongsToScene` and drop silently — the documented trade, confined to the pathological hang) and let `_parkBoundedWarmRoots` take the mount. For vector (a), arm a settle-only finish (skip decodes, still arm the flag clear) or clear+detach on the over-budget path.

**Effort:** M · **Magic-frame impact:** H (rare trigger, catastrophic tail: eliminates a permanent per-frame tax class — the exact hitch this lane hunts) · **Risk:** M (early flag-clear can silently drop in-flight boundary jobs; acceptable under the established parked-root drop semantics).

### F2 — Deferred-warm build prefix is one synchronous block inside an un-sliced bus emit during flight

**Evidence:** `emit()` → `emitAll` synchronous; only `sector:enter`/`save:loaded` have slice budgets (`eventBus.js:275-81`). `run:transitioned` → `_warmSwarmDeferredRoster` at `renderer.js:15070`; `run:wavePlanned` fallback at `:15076`. The sync prefix (spec enum → 2×witness `vf.build` per spec → `hulkExemplarSpecsForShips` builds → kick dispatches) runs unbounded at `:17257-17436`.

**Mechanism:** fresh cohort ≈ 1-4 archetypes + boss packages → ~10-16 `vf.build`s + spec/dedupe in one main-thread block (~5-15 ms scale). The cleanup/draft emit lands in armory dwell (cheap), but the wavePlanned path exists precisely for the draft-resolved-early case (`:15063-64`) — it can land inside the round's first presented frames, and it is not paced-ledger-debited so sibling slicers don't see the spend.

**Fix sketch:** drive the per-exemplar loop off the paced slicer pattern (yield per exemplar / `armCallbackAfterPresent`) and `notePacedFrameSpend` the prefix.

**Effort:** M · **Impact:** M · **Risk:** L.

### F3 — `_mintDeferredPaletteSubjects` scans the entire decoded-parts registry synchronously in a flight microtask

**Evidence:** `renderer.js:17520-80` — iterates every `listDecodedAuthoredParts` record with per-record `split('::')` + regex `normalizeFile`, no yields, not ledger-debited; invoked in the deferred settle chain (`:17473`) during flight.

**Mechanism:** ms-scale today, scales with authored-library growth; lands inside a presented frame as one block after the paced compile/residency legs did their polite part.

**Fix sketch:** chunked iterator on the paced slicer, or fold the scan into the compile leg's paced queue.

**Effort:** S · **Impact:** L · **Risk:** L.

### F4 — Successful launch re-kick keeps its `_swarmWarmReKickClaims` mark → guaranteed redundant warm next dwell

**Evidence:** claims minted `:16846-48`; `releaseClaim` (`:16818-27`) decrements both maps but runs ONLY on non-claiming settle (`:16858`) or non-thenable kick (`:16852`) — never on `completed`; deferred fresh filter `covered <= claims` (`:17241-43`).

**Mechanism:** a re-kick that settles `completed` leaves covered=1, claims=1 → `1 <= 1` → the row is admitted as fresh → the deferred warm rebuilds that archetype's 2×witness ship + hulk exemplars and re-runs compile on it at the next armory dwell — pure duplicate work per successfully re-kicked row. (The comment at `:17234-38` justifies taking claim-held rows only for the still-outstanding/strike-2 case — a claimed settle is neither.)

**Fix sketch:** decrement `claims` on EVERY settle; release `covered` only on retriable (split `releaseClaim` into coverage-release vs claim-release).

**Effort:** S · **Impact:** L (bounded: exactly one redundant warm per row) · **Risk:** L (claims only inflates freshness — a wrong decrement re-warms, never misses coverage).

---

## 3. W73 lane questions (direct answers)

**(a) `collectReKicks` blocking a presented frame?** NO — it runs inside `finish()` inside the loading cook (awaited at `:12950`), bounded by `reKickBudget`/`tailBudget` races (`:16866-79`). The deferred-side analog (`releasedRetries` loop `:17466-71`) IS a synchronous microtask in flight, but bounded at one retry per row — small. The real un-bounded block in this machinery is the F1(b) wait, not the collect loop.

**(b) `retryReleasedCounts` under-release via shared enemyId rows?** NO DEFECT — netting verified exact. `mine = (unmarked?0:1) + retryMint − retryReleased` (`:17310-17`) releases precisely this warm's outstanding mints: the ship+hulk pair sharing one enemyId row charges 1 on first `unmarkEnemy`, delta-only on the second; `count > mine` subtraction can never eat the launch re-kick's foreign +1. Retriable settle → `retryReleasedCounts`++ (`:17343`) → later `unmark()` nets it out. No phantom +1 reachable.

**(c) Tail re-kick claim lifecycle:** the release rides the kick's own `.then` (`:16855-59`) on the captured `warm.coveredMap` — it dies with the promise, still fires after `warm.building` flips, and post-`run:ended` writes into the dead captured map (harmless). No third collect pass exists (`:16864`, `:16873` only) and none is needed for coverage: the never-settled re-kick leaves covered+1 AND claims+1 pinned → `covered <= claims` → the row reads fresh next dwell and re-warms — self-healing. The actual gaps are the wedged `warmBuilding` flag (F1) and the stale claims mark on success (F4). Also confirmed: `requestAuthoredUpgrade` catches sync throws → `collectReKicks` cannot abort mid-pass (`renderer.js:7401-04`).

---

## 4. W67 regression notes — all six areas verified working (no regressions found)

1. **Deadline-bounded arm (`:21716-22060`):** min-1 progress is real — collect breaks only `collected>=2 && past deadline` (`:21824`), restore only `restored>=1 && past deadline` (`:22023`). Mid-slice requeues keep withheld flags (no restore ran) and re-collect fresh next arm (`:21819`); `legSet` is per-arm (no stale membership). Pending-Map requeues preserve `{lodLevel,entity}` verbatim (`:21828`, `:21973`, `:22036`). `notePacedFrameSpend(armNow() - armStartedAt)` in `finally` (`:22048`) debits the WHOLE arm — pending sweep, sort, collects, census signature, `session.slice` private render, restores — since `armStartedAt` mints at callback top (`:21722`).

2. **Undrawable parking (`_parkedDepthStageRoots`):** parked roots count as `queued` (`:21540`) so `band!==1&&queued` keeps the whole-subtree withhold (`:21625-26`) and the cached re-stamp path (`:21627-40`) can't un-withhold. Genuine dirtySeq bump, lightSig drift, or ortho-cell drift all unpark via `parkedRelease` (`:21525-38`) → normal collect → withhold-or-restore; park entry deleted in BOTH flows (`:21536`, `:21616`). Empty parked recollect unparks + deletes the withheld set + restores live flags (`:21612-18`). Arm-time sweep drops detached parked roots with bookkeeping (`:21771-81`). Leftover roots with meshes beyond the leg requeue to pending, never park (`:21938-74`). Geometric recheck backoff via `sfDepthUndrawableCycles` (`:21951-60`) verified.

3. **Paced-ledger routing:** every consulted site checks POST-step/post-item (≥1 progress guaranteed): reconcile `:2131`, poll `:2178`, holdExempt collect `:2555`/commit `:2602`/kick `:2621`/remint `:2638`+`:2652`, deferred-enter `steps===0` (`sectorEnterDefer.js:154`), emitSlice (`eventBus.js:349`), presentationTail (`eventBus.js:416`), `_drainMeshBuildQueue` via `itemsDone<minItems` (`admissionSliceBudget.js:37-38`), depth arm `:21739`. Despawn drain's entry gate (`:1815-19`) is the ONLY wholesale-skip site — queue survives, aging cap 2 (`:1804`). Every site debits measured spend (`:1841`, `:2136`, `:2182`, `:2660`, `:17629`, `:19166`, `:22048`, `eventBus.js:351`+`418`, `sectorEnterDefer.js:189`). The epoch wallet (rAF-pump keyed, `decodeTaskBudget.js:65-107`) can't under-report on long frames — spend accumulates under one epoch for the whole frame. CAVEAT (not a finding): in the wall-clock fallback (headless/hidden-tab, pump stale >250 ms) a debit landing ≥8 ms after the previous resets `paceFrameStartedAt` and erases earlier same-frame spend (`:94-99`) — under-report possible only when there are no presents anyway.

4. **Flag-only OFF→ON collect (`_stageShadowDepthOnSettingEnable` `:22073-78`):** exclusions identical by construction — both collectors enumerate via `collectPotentialShadowCastSubjects` (`:178`) then discriminate via `casterDepthMarkCurrent` vs signatures. Already-staged casters are mark-current → never withheld → cast stays live. Node-budget abort → `UNSTAGED_COLLECT_OVER_COVER` → the in-flight root + all unvisited siblings queue whole-subtree (`:22102-16`) and the arm's per-root collect re-derives real sets. Withhold → invalidate → stamp → queue identical to the promotion path (`:22150-73`).

5. **`reset:true` prepare defer (`physics.js`):** in `!_sg02Init && !_sg02` the reset's `_disableSg02DynamicAuthority` is a token-silent no-op (`:772` — bump only when an owner/init exists), so waiting out a backoff residual ≤ the init envelope is safe (`:383-89`). A caller abandoning its 20 s race still mints the backend — the async body continues and the init is adopted by the next `prepareBackend` (comment `:76-83`, mint `:574-621`). Concurrent deferred mints serialize: `sg02TokenAtDefer` compare (`:388`) catches the concurrent `++this._sg02Token` at `:575` and adopts the winner's `_sg02Init` instead of double-minting; the reset path joins a pending init on the shared envelope before disabling (`:416-24`).

6. **Variant interning (`_depthVariantCache` WeakMap, `shadowDepthAdmission.js:352-79`):** 10 bits incl. vertexColors; alphaTest 0→1 flips bits[0-2] → re-mints; side/shadowSide feed bits verbatim; in-place material mutation recomputes and compares all bits → no stale variant after a needsUpdate-style reuse. Per-material WeakMap — no cross-material leak.

---

## Bottom line

The machinery is largely sound — the one fixable tail defect with real magic-frame weight is F1 (wedgeable `warmBuilding` flag → permanently mounted hidden subtree); F2/F3 are single-block synchronous work during flight worth slicing when a wave has slack; F4 is a one-line bookkeeping fix. No code changed, no PRs opened — report only, per lane rules.
