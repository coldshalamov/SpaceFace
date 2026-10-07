# W104 popin-admission audit

Branch audited: `devin/1791064509-perf-w60` @ `00fb8e62d` (audited in worktree `sf-w60`).

## 1. `saturated: false`

No blocker-grade mechanism survives — the pop-in lane is already deadline-ordered,
two-lane, and paced end to end — but several contract-preserving improvements with
real implementation paths remain (findings below), so this lane is not saturated.

## 2. Ranked findings

### F1 — Over-budget cull-radius memo serves stale value un-slackened: grown hulls pop in late (lane item a)

**Evidence:** `src/render/visualCullRadius.js`
- `:65-78` — `DRAWN_CULL_REMEASURE_CALLS = 600` per-key cadence, `DRAWN_CULL_REMEASURE_PER_PASS = 4` per-pass re-measure budget.
- `:108-113` — LRU stash happens **before** the read; :114-129 hit path restores with `calls = CALLS >> 1`.
- `:130-136` — over-budget cadence defer: `if (this._passRemeasureCount >= DRAWN_CULL_REMEASURE_PER_PASS) { cached.calls -= 8; return cached.radius; }` — the **stale radius is served verbatim**; `calls -= 8` means the denied row retries ~every 7 calls.

**Mechanism.** The memo only refreshes on key change (`assetState`/`compositionId`/`lodLevel`/`childCount`) or cadence expiry. An interior graft that moves none of the keys — a same-count subtree swap (mount/dressing/wreck attachment) — can grow the drawn envelope inside the 600-call window. When >4 keys expire in one sync pass, excess rows serve the stale radius while FIFO drains them at ~N/4 passes. Error directions are asymmetric: **stale-SMALL short-culls a hull whose true envelope intersects the frustum → late pop-in / edge pop-out**; stale-large only over-draws (harmless). The widened-error window is `up-to-600 stale calls × N/4 drain passes`; prioritized retry ordering is marginal (FIFO already self-drains: each served row's `calls` reset drops it from competition, and `calls -= 8` gives denied rows a bounded retry cadence) — the defect is the *direction* of the stale service, not the ordering.

**Fix sketch.** On the defer path only, serve `Math.max(cached.radius * STALE_GROWTH_SLACK, worldRadiiHint)` (slack ~1.15, or union with the live `world.radii[slot]` cell) so deferred rows err toward over-draw, never under-cull. Optionally bias denied rows to retry ahead of fresh expiries by leaving `calls` at the threshold rather than `-8` — but the ordering change alone is not worth it.

**Effort:** S (one guarded multiply + constant). **Impact:** M (converts a rare but real pop-out/late-pop into bounded over-draw; only fires on the deferred tail). **Risk:** low — presentation-only radius; over-draw slightly widens the visible set for deferred rows; no sim/determinism surface.

### F2 — Warm/catalog teardown corpses share the live FIFO despawn-dispose queue (lane item b)

**Evidence:** `src/render/renderer.js`
- `:2011` `drainDespawnDisposeQueue` — single FIFO queue `_despawnDisposeQueue`; per-corpse `disposeObjectSteps` iterators parked across drains (`:2058-2062`); `budgetMs` escalates ×2 only when backlog > 32 (`:2041`); `pacedFrameSpend`/`DESPAWN_DISPOSE_LEDGER_MAX_SKIPS` gate.
- Warm/catalog pushes: `:19531` (`_releaseSurvivalRosterPrewarm`), `:20816` (catalog release), `:20841` (roots sweep) — all push into the same queue as live corpses (`:1480s`, `:2134`).

**Mechanism.** A parked fat catalog/warm iterator (roster catalogs run thousands of nodes; mounted ones take the `disposePreparedAuthoredBoundary` heavy path) monopolizes each drain's ms deadline until it finishes — every live corpse queued behind it defers GL reclaim and receiver-note settle by ~the fat corpse's whole teardown duration spread over drains. Nothing visibly pops; the cost is memory pressure and dispose work landing on later frames. The queue treats guaranteed-hidden teardown (safe to defer indefinitely) identically to player-visible kill corpses.

**Fix sketch.** Split a second drain class `_warmDisposeQueue`: live corpses drain first each pass; warm/catalog iterators drain only from the drain's leftover budget (or interleave parked iterators round-robin). The `sfDespawnNoted` stamp contract already exists at every push site, so classification at enqueue is free.

**Effort:** S-M (second array + drain order + stats). **Impact:** L-M (queueing order only — no visible defect today; protects corpse-reclaim latency under catalog bursts). **Risk:** low — ordering-only; shadow receiver notes stay conservative-on regardless of timing.

### F3 — `teardownWarm` context-lost branch skips the `sfDespawnNoted` stamp every sibling applies

**Evidence:** `src/render/renderer.js`
- `:18967-18969` — `teardownWarm`: `if (contextLost) { this._noteShadowMeshRemoved?.(root); return; }` — returns **without** `root.userData.sfDespawnNoted = true`.
- Sibling sites all stamp before queue push: `:19524-19525` (`_discardEarlyCrucibleWarm`/`_releaseSurvivalRosterPrewarm`), `:20803` (catalog release), `:20828` (roots sweep). Skip check: `:2120-2121`.

**Mechanism.** The stamp is the "already noted" contract that keeps a queued corpse from being double-noted by the drain vs other note paths. Today a context-lost warm root is unreachable after teardown so nothing re-queues it — pure contract drift, no live defect. A future path that pushes such a root (or a teardown variant) into `_despawnDisposeQueue` would double-note it.

**Fix sketch.** Stamp unconditionally on exit (apply before the context-lost early-return, matching the sibling shape).

**Effort:** S. **Impact:** L (hygiene; prevents a future double-note). **Risk:** trivial.

### F4 — Two dispose-adjacent unbind sites omit `disposeBound` → wasted unfreeze walk on doomed roots

**Evidence:** `src/render/renderer.js`
- Flag contract: `_unbindPresentationMesh` `:21554` — `if (disposeBound !== true) unfreezeHiddenSubtreeMatrices(mesh)`; freeze markers cleared on every unbind `:21539-21546`.
- Correct `true` sites: `:12818`, `:15624`, `:16684`, `:21919`, `:22146`, `:22319`. Correctly-omitted live sites: `:1960` (rekey), `:23115` (`rebuildShipMesh` — outgoing hull can bridge/re-draw).
- **Misses:** `:8668` `disposeRendererMeshRoots` unbinds then `disposeRendererObject`s the same root; the port at `:10472` (`bindPresentationMesh`/unbind port used by `disposePreparedSectorBoundary`, `:8146` region) unbinds without the flag before the boundary is disposed.

**Mechanism.** A hidden-frozen root going through either path pays the ~2×-subtree matrix-restore walk even though its nodes are unreachable immediately after — dead work inside a teardown frame. Rare trigger: prepared boundaries seldom carry `sfHiddenFrozen`, and the destroy path is one-time.

**Fix sketch.** Pass `disposeBound = true` at both sites (the port needs the option threaded or a dispose variant).

**Effort:** S. **Impact:** L. **Risk:** trivial-to-low — the flag also clears freeze-queue markers, which is correct for disposal; just verify no caller of the `:10472` port ever re-shows the boundary (by inspection, prepared boundaries are rebuilt, not re-shown).

## 3. Lane items closed as non-findings

- **(c) flag-cleared zombies holding slots until next drain** — `_pendingHiddenFreeze`/`_pendingHiddenUnfreeze` have **no readers between mints and drains** (refs only at push `:21266-21267`, drains `:21271`/`:21335`). Dead entries cost one `visited` tick each inside the 1024-visit cap; a dead-prefix backlog defers live entries at most N/1024 passes, and dead-entry exemption is already free (flag check precedes `scanned++`, `:21291-21293`). Bounded and rare — not a finding.
- **(d) `{scene,drawables}` session consumers expecting `keep`** — every consumer mints `keep` per call inside `withOnlySubjectsDrawable` (`openingGpuAdmission.js:507`) or reads only `session.drawables` (`:519`); `mintTouchDrawableSession` (renderer `:10778-10802`) likewise returns `{scene,drawables}` with no surviving `keep` reader. No silent-undefined path — non-finding.
- **(e) un-budgeted presented-frame walks** — ranked candidates inspected:
  - *Journal escalation* — already 4ms-paced on every leg: `pendingCollectIter` (`collectJournalPresentationEntitiesChunked`), `pendingClearIter` (`world.clearSteps`), `pendingApplyIter` (`updateFromEntitiesSteps`), `pendingVisit` (`journal.visitRangeSteps`) in `presentationPublisher.js:110-494`. Closed.
  - *`candidateSlots.sort(compareEntityId)`* (`presentationQueries.js:371`) — required for the documented "deterministic by stable entity ID" result contract (`:2`); only runs on the full-walk path, gated behind zero-dirty retain (`:256`) and pose-dirty retain (`:327`); the result feeds the same-frame `syncEntityViews` so it cannot be deferred, only made cheaper — and sorting by slot would change the ordering contract. Closed.
  - *`syncAsteroidInstancePool`* — `canReuseStaticSubmission` early-outs clean pools (`asteroidInstancePool.js:486-543`); residual per-record work IS the draw. Closed.
  - Also inspected and found paced/bounded: residency poll (`:2746-2787`, stepped 4ms), `hoistDeadlineGlassMeshBuildsSteps` (`:3529`, 256-row slices), `_rebindPresentationMeshesSteps`/`_bindPublishedPresentationMeshesSteps` (`:21806`/`:21855`, 256-row yields, visible-first pass), `pickNextContactCompileSubject` (empty-pending early-out), `serviceRenderMeshResidency` ('full'/'poll'/'drain'/'idle' lanes all bounded), live geometry admission (`liveGeometryAdmission.js` — ambient 1/present deadline-ordered + urgent batch lane; compile-before-show bails to residency on going-on-glass `:136`; retry budget + 4s cooldown `:36-43`).
  - Top fixable residual ⇒ F2.

## 4. Regression notes on landed waves — W103 machinery verified concretely

| # | Mechanism | Verdict |
|---|-----------|---------|
| 1 | Dirty-window shadow notes — `_noteShadowMeshAdded`/`Removed` (`:27328`/`:27344`) fall back to `markDirty()` only when `measuredReceivers` is non-finite **and** tally is dirty; else `noteAdded`/`noteRemoved` with measured value | ✓ holds |
| 2 | Dispose-bound unbind clears freeze flags + skips unfreeze walk — flags deleted every unbind (`:21539-21546`), `unfreezeHiddenSubtreeMatrices` gated on `disposeBound !== true` (`:21554`); six dispose-bound sites verified passing `true`; two rekey/rebuild sites correctly omit | ✓ holds — peripheral misses ⇒ F4 |
| 3 | Universal `lastShowSeq` stamp — `userData.sfHiddenFreezeLastShowSeq = this._viewSyncSeq || 0` at `:23585`, **outside** the `sfHiddenFrozen` re-show branch (`:23572-23582`) | ✓ holds |
| 4 | Queue-age dwell + free dead-entry exemption — `sfHiddenFreezeQueuedSeq` stamped at mint (`:21265`); `dwellBase = Math.max(lastShow, queuedSeq)` vs `HIDDEN_FREEZE_FLAP_DWELL=3` (`:21300`, `:900`); dead-entry `continue` precedes `scanned++` (`:21291-21293`); budgets `MINT=6`/`SCAN=256`/`VISIT=1024` (`:889-896`) | ✓ holds |
| 5 | `sfDespawnPartialTeardown` — stamped only when the parked iterator's corpse matches (`abandonedIter._corpse === m`, `:2060-2062`); cleared + `invalidateShadowCasterPolicy` at top of `_syncShadowCasterPolicyChecked` before dirtySeq early-outs (`:25957-25960`) | ✓ holds |
| 6 | `notedWalk` armed visits + finish-probe — `visits.set` arm-gated on notes/detached non-empty (`shadowReceiverTally.js:81-83`) while `seq`/`lastPopped` unconditional (`:72-76`); `notedWalkRootFinished` probes lastPopped ancestry so -delta retractions land only after whole-subtree DFS finish (`:136-141`); `noteRemoved` unvisited-pair delete / mid-descent conservative-on / visited `{delta:-delta}` (`:166-201`); resolve paces 4ms slices, supersede cap 4, storm quiet 8 | ✓ holds |
| 7 | drawnCullRadius stash + re-measure budget — LRU stash before read (`:108-113`), hit restores `calls = CALLS>>1`, key-moved pays `Box3.setFromObject` immediately (`:130-132`), over-budget defers with `calls -= 8` (`:133-136`), per-sync budget reset at `:23379` | ✓ holds — deferred-path error direction ⇒ F1 |
| 8 | Warm/catalog teardown contract — three sites stamp `sfDespawnNoted` and route mounted→`disposePreparedAuthoredBoundary` / unmounted→inline `disposeObject` (`:19524-19533`, `:20803-20817`, `:20828-20842`) | ✓ holds — `teardownWarm` contextLost asymmetry ⇒ F3 |
| 9 | Corpse-row hoist — `this._meshes.delete(id)` + `clearEntityMeshReference` **before** `disposeObjectSteps` in both the leftover sweep (`:12825-12827`) and departing sweep (`:15630-15632`); `_drainHiddenFreezeQueue()` inside yield seams (`:12848`, `:15640`); `noteShadowMeshRemoved` post-dispose (`:12851`, `:15643`) | ✓ holds |
| 10 | Opening scan pacing — `openingScanSources` (indexedShipLike + stations + wrecks + payloads) driven in one loop yielding per 256 (`:12345-12362`); post-sort `yieldLiveSectorGpu` seam (`:12488-12491`); promote burst paced per-4 (`:12502-12505`) | ✓ holds |

**Earlier-wave spot-check:** warm-lease soft-eviction ordering verified — `sortSoftEvictionCandidates` evicts oldest `lastWarmClaimAtMs` first within the weight-1 warm class (`assetResidency.js:589-591`), matching the demand-recency claim.

**Bottom line:** the W103 machinery is all present and correctly wired; the remaining popin-admission surface is error-*direction* (F1) and drain-*ordering* (F2) polish plus two contract-hygiene misses (F3, F4). All are S-effort; none blocks on missing infrastructure.
