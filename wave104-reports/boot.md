# W104 audit — lane: boot-loading

Branch audited: `devin/1791064509-perf-w60` @ `00fb8e62d` (W103 tip; includes 4262aa519 + a4c068205).

saturated: false

## W103 regression verification — all items hold

1. **Dirty-window shadow notes** (`renderer.js:27328-27356`): (a) non-finite measure + dirty tally → `markDirty()` only (:27336-27337, :27350-27351), no inline `countShadowReceivers`; (b) finite measures route to `noteAdded`/`noteRemoved` regardless of dirty state; (c) quiet tally + unmeasured → `noteAdded(root, null)` → inline count fallback (`shadowReceiverTally.js:154/167`) — settle-path contract unchanged.
2. **Dispose-bound unbind** (`_unbindPresentationMesh` :21464-21564): (a) `disposeBound !== true` gates `unfreezeHiddenSubtreeMatrices` at :21554 while flag + `matrixAutoUpdate` restore still run at :21549-21550; (b) `sfHiddenFreezeQueued`/`QueuedSeq`/`LastShowSeq`/`sfHiddenUnfreezeQueued`/`sfDespawnNoted` all deleted unconditionally :21540-21546; (c) the six `true` call sites are all corpse-bound — F9 leftover :12818, departing sweep :15624, entity:destroyed :16684, mass teardown :21919, residency/dead-class evicts :22146/:22319. Residual note: two teardown-adjacent sites (`disposeRendererMeshRoots` :8668, `disposePreparedSectorBoundary`'s unbind wrapper :10473) omit the flag — root never re-joins `_meshes` on those paths so the only cost is the ~2x unfreeze walk on still-frozen corpses; tracked by popin lane F4.
3. **Universal lastShowSeq stamp** (:23585): sits outside the `sfHiddenFrozen` branch (:23572-23582) — every visible row stamps `_viewSyncSeq`, so never-frozen roots hit the flap dwell on their first hidden pass.
4. **Queue-age dwell + dead-entry exemptions + VISIT bound** (`_drainHiddenFreezeQueue` :21270-21320, `_drainHiddenUnfreezeQueue` :21330-21368): (a) `dwellBase = Math.max(lastShow||0, QueuedSeq||0)` :21300 keeps fresh entries parked until `viewSeq - dwellBase >= FLAP_DWELL(3)`; (b) flag-cleared entries `continue` at :21291/:21356 before `scanned += 1` — dead entries consume `visited` only; (c) `HIDDEN_FREEZE_VISIT_PER_PASS = 1024` (:896) bounds `visited`, MINT_ROOTS 6, SCAN 256 (:889-896).
5. **sfDespawnPartialTeardown** (mint :2059-2063, consume :25953-25960): (a) stamped only when `abandonedIter._corpse === m`; (b) consume deletes flag then `invalidateShadowCasterPolicy` — dirtySeq early-outs can't skip a torn prefix; (c) unflagged roots keep memoized early-outs. Residual hole verified but narrow: a corpse orphaned between queue-park and next drain on a queue-reset path (:2073 re-mints on identity mismatch) stays unflagged — only reachable if a remount path bypasses `_meshes`; every observed remount re-joins the map first. Observation only, not a finding.
6. **notedWalkRootFinished + armed visits** (`shadowReceiverTally.js:58-141`): detached-skip pop check :58-65; `seq`/`lastPopped`/`visits` stamps :71-83 (visits arm-gated on `notes.size > 0 || detached.size > 0`); `notedWalkRootFinished` ancestry probe :136-141 (DFS pops subtrees contiguously); retraction at :180-197 gated on visited+finished.
7. **drawnCullRadius stash + re-measure budget** (`visualCullRadius.js:73-136`): outgoing-key LRU stash :108-113 lands before `lru.get` :114; `DRAWN_CULL_LRU_SIZE = 8`; `REMEASURE_CALLS = 600`, `REMEASURE_PER_PASS = 4`; over-budget serves stale with `calls -= 8` :133-136. (Cold-key miss gap → lod lane L2.)
8. **Warm/catalog teardown contract** (`teardownWarm` :18951-18986, `_discardEarlyCrucibleWarm` :19496-19538, `_releaseSurvivalRosterPrewarm` :20785-20843): `wasMounted`/`catalogMounted` captured before `parent.remove`; contextLost → inline note + `sfDespawnNoted` on the discard/release paths; mounted → `disposePreparedAuthoredBoundary` else `_despawnDisposeQueue`, never bare `disposeObject`. Asymmetry verified: `teardownWarm`'s contextLost branch (:18967-18969) lacks the `sfDespawnNoted` stamp its siblings carry — harmless today (context-lost roots never queue) but inconsistent with the stated contract; tracked by popin lane F3.
9. **Corpse-row hoist** (leftover :12811-12865, departing :15619-15651): unbind+`scene.remove`+`_meshes.delete`+`_meshesVersion += 1`+`clearEntityMeshReference` all land before the first `await` in each dispose loop; `noteShadowMeshRemoved` stays post-dispose (:12851/:15643). Both W103-F1 races closed.
10. **Opening scan pacing + post-sort seam** (:12345-12362, :12466-12509): four collects paced at `(++openingScanSinceYield % 256) === 0` → `cookStale()` + `yieldLiveSectorGpu()`; F9-side rock collect paced via `queryAsteroidFieldSteps`, post-sort yield seam :12487-12491 lands before the `seenRockKeys` promote loop.
11. **Cook-tail freeze drains** (:12848, :15640): `this._drainHiddenFreezeQueue()` runs inside both sweep yield seams — W103-F3 machinery landed.

## Ranked findings

### B1 — Whole-field `filter().sort()` + coveredKeys collect: the biggest remaining atomic cook leg is inside the survival widen, not the census

**Evidence:** `renderer.js:12634-12651` — `coveredKeys` collect walks `state.entityList` O(E) unclocked, then `(field.rocks || []).filter(...).sort(distance comparator)` runs **over the entire asteroid field**, not a radius query. The slice clock (`survivalSliceStart`) starts at :12631 but the first check happens inside the promote loop at :12656 — the collect, filter, and O(R·log R) sort all land before any pacing point. Contrast with the F9/jump-side rock queries, which bound H via `firstFlightRockCookRadiusWu` (`queryAsteroidFieldSteps`); here R is the whole field — dense sectors carry 5k-20k rock records, so this is plausibly the single largest unclocked stretch left in the cook.

**Mechanism:** wall-clock only — the loading shell's task list stalls for the sort span (ms-scale on dense fields, never a presented frame), pushing veil-lift later; `promoteAsteroidFieldRock` then paces properly per record. The ordering contract is promotion priority only (no cap on this loop — unlike the jump-side `FIRST_FLIGHT_ROCK_COOK_CAP`), so the sort exists purely to promote nearest-first.

**Fix sketch:** the field is bucket-indexed — iterate buckets nearest-first via the existing stepped query (`queryAsteroidFieldSteps` at expanding radius, or direct bucket-order traversal) instead of materializing+sorting `reach`; ordering is identical modulo ties since every record is visited and cap-free. The coveredKeys collect is chunkable under the same `survivalSlice` clock (its set is consumed only inside the promote loop). Both are collect-only changes, no ordering contract beyond nearest-first preference.

**Effort M · magic-frame impact M · risk low** — larger effort than a seam because the field-wide walk needs the bucket path, but it removes the largest cook stretch outright rather than yielding inside it.

### B2 — Jump-side `rockHits.sort` never got the W103 post-sort yield seam (asymmetry with the F9 cook)

**Evidence:** `renderer.js:15289-15295` — `rockHits.sort(...)` runs atomically, then the `seenRockKeys` promote loop paces only on `++rockPromotesSinceYield % 4` (:15306). The F9 twin acquired exactly this seam in W103 (`// Yield seam between the sort and the seenRockKeys dedupe loop` :12487-12491). The query collect above (:15279-15286) yields per step; the promote loop yields per 4; the sort between them does neither.

**Mechanism:** same class as W103-F2 — O(H·log H), H radius-capped so small, but the seam was the documented fix and only one cook path received it. A jump into a dense sector stretches the loading shell's task list right before the deterministic-population arm.

**Fix sketch:** one-line parity — `if (cookStale()) return cookSuperseded; await yieldLiveSectorGpu();` between :15295 and :15296, matching :12487-12491.

**Effort S · impact L-M · risk none** — the identical seam is already proven on the F9 side.

### B3 — Freeze-queue drains ride outside the sweep slice clock, and only 2 of ~12 cook yield seams offer them

**Evidence:** `renderer.js:12848` and `:15640` call `_drainHiddenFreezeQueue()` inside the sweep yield seams, i.e. *after* `await yieldLiveSectorGpu()` and after `survivalSliceStart`/equivalent resets — the drain's own per-call cost (≤6 minted roots + ≤256 scans + ≤1024 visited) is never debited into the sweep's 8 ms slice accounting. Meanwhile the other cook yield points — census legs :12604/:12705/:12748/:12767/:12795, promote yields :12505/:15308, warm-ledger drive :12748, provider drives, enqueue yields — run `yieldLiveSectorGpu()` without draining. Queued entries therefore keep accruing between the two sweeps (every `_queueHiddenSubtreeFreeze` during a long cook lands there — syncEntityViews runs under the veil) and each armed seam pays `slice + full drain call` unmeasured.

**Mechanism:** contention is bounded (drain per-call caps hold regardless) but the shape under-spends cook time and over-spends at exactly two points — the backlog W103-F3 meant to melt inside the cook still partially lands on first-flight passes, where the same drain's per-mint O(subtree) cost (lod lane L3) lands inside presented frames.

**Fix sketch:** hoist the drain into the shared sliced-yield helper (`createSlicedYield` wrapper or `yieldLiveSectorGpu` itself for cook contexts) — it is already idempotent, dwell-gated, and self-bounding, so every existing yield seam offers a bounded drain pass at zero clock ambiguity. Alternatively debit `openingProviderNow() - drainStart` back into the slice clock at the two existing sites (cheaper, keeps coverage sparse).

**Effort S · impact L-M · risk low** — re-entrancy already required; the only new behavior is drain frequency during cook.

## Hunt verdicts (a)–(d)

- **(a) atomic spans inside a single source leg / fat subtree / per-source cadence** → the census legs are all O(1) predicates at the 256-node cadence (verified: `isOpeningStoryActor` O(1) at `tabletopPolicy.js:616-625`, `isInitialAuthoredCompositionEntity` family O(1) at `partsLibrary.js:890-965`) — no per-source adaptive cadence needed. The real fat spans are B1's collect+filter+sort prologue. The per-mint O(subtree) freeze/unfreeze cost inside the drain is lod lane L3 (Steps twin is its fix); boot angle: mints land inside cook seams too, which B3's shared-clock fix makes explicit.
- **(b) VISIT bound vs sweep yield cadence contention** → B3: the drain rides outside the slice clocks and covers only 2 seams.
- **(c) cook-time `_despawnDisposeQueue` growth / post-boot despawn latency** → healthy. `serviceRenderMeshResidency` → `drainDespawnDisposeQueue` runs every render pass including loading (:24852 → :2240); per-call caps hold (≤8 corpses or ¼ backlog, ≤2 ms ×2 past 32 backlog, mid-corpse iterator suspension :2059-2063). During `mode === 'loading'` `pacedFrameSpend()` is never debited (every `debitGate` is `state.mode === 'flight'`), so the drain never hits the `LEDGER_MAX_SKIPS` gate — boot corpses melt continuously rather than parking for first flight. Post-boot latency for a cook-time corpse is bounded by the same caps. The FIFO-share concern (warm-teardown corpses delaying live despawns) is popin lane F2.
- **(d) biggest remaining atomic boot stretch, ranked by worst-case node count** → (1) B1 `field.rocks.filter().sort()` — O(R log R), whole field; (2) B2 jump-side `rockHits.sort` — O(H log H), radius-capped; (3) B1 `coveredKeys` — O(E); (4) cross-lane: cold-key `Box3.setFromObject` burst on the first `syncEntityViews` pass (lod L2) and per-mint subtree walks (lod L3); (5) deferred ledger, not re-opened: `enterSector` generator split (BOOT-F3a), `save:restoring`/`save:loaded` emit slicing (BOOT-F7 / F4-F5), `buildWorldRecordIndex` wholesale trust (W26 deferred), combat:damage payload intern (F6).

## Not re-reported (per brief + sibling lanes)

KNOWN-DEFERRED/WONTFIX ledger (BatchedMesh specimen gap; loading-artwork GL pause; ambient compile-tail serialization; BOOT-F3a enterSector split; BOOT-F7 emit slicing; F4/F5/F9 tick-paced emits; F6 payload intern; nxb-059 stale source-scan) and the preexisting test-failure list all honored. W104 sibling-lane items verified but owned elsewhere: lod.md L2 (drawnCullRadius key-miss), lod.md L3 (node-unbounded mint), popin.md F1 (over-budget stale serve), F2 (warm/corpse FIFO share), F3 (teardownWarm `sfDespawnNoted`), F4 (dispose-adjacent `disposeBound` omissions). W103-F1/F2/F3 confirmed implemented rather than residual — except the B2 asymmetry, which is W103-F2's fix applied to only one of two call sites.

## Instrument deltas needed

- None required for B1/B2 — `recordOpeningCookStep` already emits per-leg durations; the sort legs are the gaps between existing step boundaries.
- For B3, if adopted via the shared helper: a `drainedHiddenFreeze` count on the cook-step record would show backlog melting per seam instead of arriving as a lump at the sweep seams.
