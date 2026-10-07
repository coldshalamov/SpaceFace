# W108 audit — popin-admission

Audited `devin/1791064509-perf-w60` @ `46e3ccf39` (W107 log atop `30b0fedcd`), read-only.
Scope: everything that admits, mounts, or tears down presented content late — residency pump,
dispose lanes, drawn-cull remeasure machinery, roster-prewarm cohort splice, rebuild bridges,
release flush — plus the W107 regression block. Golden sim hash contract
`0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1` — nothing below touches sim.

## saturated: false

One concrete mechanism-level defect remains in this wave's own machinery (F1: the dispose
escalator's headroom arm is dead code on the live lane — the doc's "can't sum past ~one frame
wallet" claim is wrong for it), one un-budgeted presented-frame walk survives (F2), and two
small residuals sit in the drawn-cull memo path (F3, F4). F1 is worth the wave's effort; F2–F4
are cheap pick-ups. All respects the two hard contracts.

## Ranked findings

### F1 — Live-lane dispose escalation is headroom-blind: `Math.max(budgetMs*2, min(BASE, headroom))` always mints 4 ms regardless of paced spend

- **Evidence**: `src/render/renderer.js:2118-2120` —
  `const headroom = Math.max(budgetMs, PACED_FRAME_BUDGET_MS - pacedFrameSpend());`
  `budgetMs = Math.max(budgetMs * 2, Math.min(DESPAWN_DISPOSE_BUDGET_MS, headroom));`
  For the live lane `budgetMs = DESPAWN_DISPOSE_BUDGET_MS = 2`, so `headroom ≥ 2` always and
  `Math.min(2, headroom) = 2` always — the W107 headroom term can never bind.
  `Math.max(4, 2) = 4` on every `backlog > 32` pass, spent wallet or not. The block comment
  (`:2114-2118`) claims "on a spent wallet it drops to this lane's own base share, so live
  escalation + warm floor can't sum past ~one frame wallet" — accurate only for the warm lane.
- **Mechanism**: the ledger-skip gate at `:2127-2131` gives at most `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS = 2`
  skipped passes, then a forced pass runs regardless of wallet. Under a sustained despawn storm
  on hot frames, each lane's forced pass fires on the *same* presented frame (per-lane counters,
  no cross-lane sequencing): live escalated 4 ms + warm floored pass (≥1 corpse slice; ~0 on a
  fully spent wallet) + `drainSceneEnvRebindQueue` forced 4 ms ≈ **8–12 ms of paced-lane work on
  a frame that already spent its 4 ms wallet**. Convergence is fine (live escalated drain
  quarters the backlog per pass via `limit = max(8, ceil(backlog/4))`; warm converges at ≥1
  corpse per forced pass), so the defect is bounded summed spend, not non-convergence — exactly
  the window W106's floor meant to govern and W107's headroom arm meant to fix.
- **Fix sketch**: replace the floor with the intended clamp —
  `budgetMs = Math.min(budgetMs * 2, Math.max(DESPAWN_DISPOSE_BUDGET_MS, headroom))`
  for the live lane (escalates to 4 with headroom, stays at 2 on a spent wallet — headroom
  still ≥ budgetMs so `max(BASE, headroom) ≥ 2`, then `min(4, …)` does the capping). Optional
  second arm: stagger forced passes so a frame pays at most one paced lane's force
  (single shared `lastForcedLaneSerial` stamp; the loser defers one frame).
- **Effort**: S · **magic-frame impact**: M (worse exactly during mass-despawn waves — the frames
  the magic-frame bar most needs to protect) · **risk**: L (pure budget arithmetic; the skip gate
  and min-1 progress floors are untouched).

### F2 — `_flushMeshReleasePending` is the last un-budgeted walk in `serviceRenderMeshResidency`

- **Evidence**: `src/render/renderer.js:2378` call site inside the presented-frame residency
  service; body at `:22500-22520` — iterates all 5 motion registries
  (`globalShipMicroMotion`, `globalAsteroidMotion`, `globalInfrastructureMotion`,
  `globalForgeCrown`, `globalLawArenaDressing`) calling `releaseMeshSet(pending)` on the full
  accumulated set. No deadline, no `pacedFrameSpend()` consult, no `notePacedFrameSpend` debit —
  every sibling lane in the same service (despawn dispose `:2127`, env rebind `:29667+`, rebuild
  bridges cap-32 `:2322`) carries one or both gates.
- **Mechanism**: cost is O(5 × |pending|) map ops per presented frame while unbinds accumulate
  (verified `releaseMeshSet` bodies — `asteroidMotionPresentation.js:744`, `forgeRegentCrown.js:298`
  — are map-get + field clears per row). Small per row, but it stacks on exactly the storm frames
  the dispose lanes are pacing for, and it contributes nothing to the ledger the sibling lanes
  consult — so their skip decisions can't see its spend.
- **Fix sketch**: cheapest correct = `notePacedFrameSpend(elapsed)` after the flush so sibling
  lanes see it; a paced-skip gate (`pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` → defer to next
  frame, releases are idempotent) matches the sibling contract. Rows accumulate safely — the set
  is a `Set`, dedup is free.
- **Effort**: S · **magic-frame impact**: L-M (bounded per frame, but unbounded across the storm
  and invisible to the ledger) · **risk**: L.

### F3 — FIFO drain rewrites the record under the CURRENT key without stashing the outgoing key to the LRU

- **Evidence**: `src/render/visualCullRadius.js:104-135` — `resetDrawnCullPassBudget`'s drain
  writes `rec = data.drawnCullRadius || {}` in place under the mesh's *current* key fields
  (`assetState/compositionId/lodLevel/childCount` at `:120-125`). The consult-time stash
  (`:166-170` — outgoing rec pushed to `data.drawnCullRadiusLru` before the consult) only exists
  on the `keyMoved` consult path, not on the drain path.
- **Mechanism**: mesh key-moves K1→K2 while queued (compositionId flip mid-storm), drain fires
  before any consult observes the move → rec is overwritten under K2 and K1's radius never
  enters the LRU. A later flip back to K1 misses the LRU and pays a fresh walk. Harmless for
  correctness (measurement is always live truth); the residual is one lost remembered envelope
  per queue-straddling key churn — i.e., extra re-measures precisely under the churn the FIFO
  exists to bound.
- **Fix sketch**: before rewriting `rec` in the drain, if `rec`'s stored key differs from the
  fields about to be written and `rec.radius > 0`, push it into `data.drawnCullRadiusLru` under
  its stored key (same stash grammar as the consult path, capped at `DRAWN_CULL_LRU_SIZE`).
- **Effort**: S · **magic-frame impact**: L (a small number of extra `setFromObject` walks,
  only under flip-flop key churn across a queued drain) · **risk**: L.

### F4 — Character-family roots mint `authoredAssetState='authored'` with no `visualBounds` and no `primeDrawnCullStamps` → first cull consult pays an inline walk

- **Evidence**: `src/render/characters/{bracketModel.js:263, morrowModel.js:274,
  ravelModel.js:202, rubricModel.js:479, solsticeModel.js:380, vesperModel.js:197,257}` all stamp
  `authoredAssetState='authored'`; none stamps `visualBounds`. The factory stamp
  (`visualFactory.js:5920 stampBuiltVisual`) primes canonical program keys but not drawn-cull.
  `entityVisualCullRadius` (`visualCullRadius.js:316-340`) — authored rows without envelope
  bounds fall to `drawnCullRadiusForMesh`; `primeDrawnCullStamps` only covers the four
  partsLibrary commit tails (`partsLibrary.js:3376,4310,9107,9507`).
- **Mechanism**: every vesper/morrow drone and ravel/bracket/solstice/rubric/ruckus part that
  becomes a top-level entity mesh (`visualFactory.js:5940-5952`) reaches its first
  `entityVisualCullRadius` consult (admission grading `authoredAdmissionPolicy.js:120`,
  upgrade grading `authoredUpgradePolicy.js:149/195/238`, view-sync consults) unprimed →
  inline `Box3.setFromObject` inside the presented pass — once per mesh, small trees, but
  un-budgeted and exactly the class `primeDrawnCullStamps` exists to pre-pay.
- **Fix sketch**: call `primeDrawnCullStamps(root)` (or set `userData.visualBounds` if the
  builder knows its envelope) inside `stampBuiltVisual` — one line at the shared mint site
  moves the walk to build time, which already runs inside paced residency/admission lanes.
- **Effort**: S · **magic-frame impact**: L (bounded once-per-mesh walk on small trees;
  character families are small) · **risk**: L.

### Note — the `survivalArena:rosterPrewarm` gate's own unblock precondition is now met (stale comment, not a defect)

`survivalArena.js:972-997` keeps `_emitRosterPrewarm` deliberately unwired, gated on
"`cook.rockPools` stops being O(roots) at ~100 ms each". `PQ-210.00-REPORT.md`'s own 2026-09-22
evening addendum closed that precondition (110.9 s → 7.7 s; launch 165-168 s → 50-63 s; wired
acceptance: 0 links, 0 uploads, 0 frames >100 ms). The comment and the commented subscription
pre-date the closure and ~60 waves of pacing machinery since (paced drain, batched shadow
notes, sliced mounts, coverage dedupe). The whole emit→specQueue→splice→drain chain I audited
this wave only ever fires for `onboarding:rosterPrewarm` (two specs, once). This is a
DOCUMENTED decision whose stated gate has since been satisfied — flagging for a deliberate
re-decision, not claiming a bug. Effort to re-wire: S; risk is the launch-seconds trade the
close-out priced at ~5-10 s for zero mid-fight links.

## W107 regression verification

All seven items verified landed and sound at `46e3ccf39`:

1. **`drainMeshBuildsBehindShell` latch** (`:12521-12595`): `drainFallbackAlive` is local per
   invocation and trips only when `runCookSyncTwin` returns -1 (Steps drive threw). A later
   numeric `_drainMeshBuildQueue(1)` row still mints the arm; `drainStep.done` re-mints
   `_drainMeshBuildQueueSteps(Infinity)` for early-returning drains. Steps-less path unchanged
   (`_drainMeshBuildQueue:23801` wraps the Steps twin inline; its own catch returns
   `Math.max(0, headDelta)`, always numeric). ✓
2. **`_drawnCullForceRemeasure` FIFO** (`visualCullRadius.js:104-135`): rows past the jittered
   cap queue and drain `≤DRAWN_CULL_REMEASURE_PER_PASS` per pass under CURRENT keys; inline
   walks (`:263`) and LRU hits clear `drawnCullForceQueued`; dead/unparented rows dequeue free.
   One residual in that drop path — `drawnCullForceQueued` not cleared on the unparented drop →
   permanent stale-serve on re-mount — **reported by the lod lane as wave108-reports/lod.md F1;
   cited here, not re-reported.** ✓ (with citation)
3. **Dispose headroom floor** (`:2118-2120`): landed as specified; warm lane inherits the live
   lane's leftover via `Math.max(0, DESPAWN_DISPOSE_BUDGET_MS - liveLaneElapsed)` at `:2373`.
   The residual is F1 above — the arm is dead code for the live lane, so live escalation +
   warm floor + env-rebind force can sum past the wallet on forced frames. ✓ (with F1)
4. **Clearance memo translate + admission slice + travel-pad gate**: position-only drift
   translates the cached box and rebuilds layout with `_clearanceBoxEpoch++` (`:4017-4027`);
   urgent `prepareBatch` slices at 8-root chunks (`liveGeometryAdmission.js:214`); 
   `primeMotionTravelPad` gates on `data.drawnCullRadius != null` (`visualCullRadius.js:59-62`,
   invoked at `authoredMotion.js:153`). ✓
5. **Foundry drain + env-source stamp order**: `_foundryEnvPending` arms for ANY non-loading
   mode (`:23055`); drains at `enterLoadingMode` head (`main.js:1195`), both cook seams
   (`:12501`, `:15847`), `preparePostOpeningPipelines` head (`:17038`); idempotent.
   `_envMapSource` stamps after `queueSceneEnvMapRebind`/`deferredEnvDispose` commits
   (`:23151`); bake and foundry rejections warn. ✓
6. **13 tight-try drives**: `iter.next()` is the only expression under `try`; awaits live
   outside; `runCookSyncTwin` degrades to the sync twin on throw; `cookSuperseded` sentinels
   propagate (incl. `driveEnvBindSteps` prepareFlight triple at `:14615-14620`). ✓
7. **`syncEntityViewsSteps` + fault parks**: counted-loop yields at 128-row strides only
   (`:24598`, `:24703`), byte-identical output; `drainSceneEnvRebindQueue` drops torn heads
   like done heads incl. `disposeTarget` (`:29685-29692`); `_protectedFirstFlightFaultEpoch`
   (`:2247`), `_residentReattachFaultEpoch` (`:2445`), `_reconcileFaultEpoch` (`:2472`, with
   `_meshReconcileDirty` re-dirty), `_residencyPollFaultEpoch` (`:2901`) park within
   `enterSerial` and re-arm on next; `_flushMeshReleasePending` re-pends on registry throw
   (`:22519`); all 7 combined-census degrades run `collectInstancePoolCompileRootsAndSubjects`
   with real subjects (fault path returns `{roots:[],subjects:[]}` shaped fallback, handled by
   `subjectsForCompileRoots`'s per-root paced collect). ✓
   One defect in this family belongs to the lod lane's report (epoch keys don't advance on
   context restore / same-sector recook — their F2); cited, not re-reported.

## Fresh-hunt verification notes

- **(a) stamped-key check / re-queue cap**: NOT needed. Drain measures the mesh's *current* key
  — always live truth, so a stamped-key skip would only defer measurement. `drawnCullForceQueued`
  is the re-queue cap (≤1 queued entry per mesh); re-queue after drain requires another full
  jittered defer streak — inherently bounded. Verified sound; the one residual is F3 (outgoing
  key not stashed to LRU at drain).
- **(b) headroom floor**: F1 — confirmed real for the live lane; warm lane behaves as documented.
  Warm teardown debt converges (≥1 corpse/forced pass) but slowly: a deep warm backlog on a spent
  wallet drains ~1/3 corpse per frame; the feed is rare (park/release events), so non-convergent
  accumulation is not reachable — the bound needed is on summed forced spend, not consecutive
  floored passes.
- **(c) splice-time spec identity**: verified sound. `_rosterPrewarmSpecQueue` is a FIFO `Map`
  keyed on `spec.id`; same-tick emits preserve arrival order. Covered rows `specs.push` into the
  weapon pass only (the queue row exists for them exactly when they own a never-warmed weapon id
  — `:19056-19060`). Spliced rows insert at `ei+1` and mount ahead of the first emit's tail —
  documented intent ("warms inside this drain instead of serial-waiting"), ordering-only since all
  mounts are hidden. `row.exemplarSpecs`/`row.compilePipelines` are dropped at splice consume:
  safe — every emit synthesizes the identical 3-family concat (`:19017-19023`) so the dropped
  carry is coverage-deduped, and `compilePipelines` is the same closure mint per emit. Later
  splices at the moving cursor let a still-later emit jump ahead of unvisited prior spliced rows
  — hidden mounts, ordering-only, noted. `_releaseSurvivalRosterPrewarm` wipes the queue and
  clears `_rosterPrewarmIds`/`_rosterPrewarmWeaponIds` consistently (`:21636-21650`); its only
  callers are `run_ended` (`:18289`) and `renderer-destroyed` (`:8935`) — no intra-run release —
  and `survivalArena._rosterPrewarmEmitted` clears on the same `run:ended`, so consumed-but-
  unmounted specs are re-emitted next run. No coverage-loss window.
- **(d) remaining un-budgeted walks, ranked** (beyond F2–F4): `cameraClearanceFloorWalk` on a
  retain miss is O(structural × cell) bounded and cell-memoized — fine. `settleRebuildBridges`
  cap-32 + visitBound rotation — bounded. `_parkBoundedWarmRoots` debits the paced ledger per
  root with a spent-ledger macrotask continuation — bounded. `syncEntityViewsSteps` counted
  loops sliced — bounded. The 28581 sync `scene.traverse` recount is the fixture-owner fallback
  only (`_shadowReceiverTally` absent); live hosts pace through `tally.resolve` — not a live-path
  defect.

## Cross-lane dedup

- `drawnCullForceQueued` drop-stamp defect — **wave108-reports/lod.md F1**.
- `_*FaultEpoch` lanes keyed on `enterSerial` not advancing through context restore/recook —
  **wave108-reports/lod.md F2**.
- Character-root unprimed consults (F4) is adjacent to the lod lane's drawn-cull work but is a
  distinct mint-path defect (`stampBuiltVisual` never primes); reported here as popin-admission
  because the consult fires in admission/upgrade grading paths.
