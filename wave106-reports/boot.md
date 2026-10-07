# W106 audit — boot-loading

Audited `devin/1791064509-perf-w60` @ `0fc3ff53c` (W105 tip `4cfe079e1` + the W106 lod/popin
fixup that landed mid-audit). AUDIT-ONLY. All line refs are at `0fc3ff53c`; W105-verify notes
cite the pre-fixup numbers where the delta moved them.

saturated: false

## Findings (ranked)

### F1 — `_drainHiddenUnfreezeQueue` never rides a cook yield seam: the mass re-show backlog retires only inside presented passes while the freeze twin melts at every seam

- **Evidence**: `renderer.js:12310`/`:15389` (both `yieldLiveSectorGpu` seam helpers call
  `this._drainHiddenFreezeQueue?.()` — the freeze drain rides every cook seam in the opening
  and jump cooks), `:24021` (freeze drain's third call inside `syncEntityViews`),
  `:24421` (`_drainHiddenUnfreezeQueue`'s ONLY call site — the per-pass tail inside
  `syncEntityViews`). Queue feeds: `:24045` (frozen root re-shows inside the visible sweep)
  plus bound pushes at `:22032-22035`/`:22048-22052`.
- **Mechanism**: the unfreeze drain carries the identical metering (caps
  `HIDDEN_FREEZE_MINT_ROOTS_PER_PASS`/`SCAN`/`VISIT`/`NODE_BUDGET` = 6/256/1024/4096 at
  `:891-904`, wallet park, honest debit — `:21705-21720`) and its comment at `:21708` says it
  mints "inside the same seams" — but no seam invokes it. During an in-flight jump cook the
  freeze drain gets a fresh-wallet full-cap slot at every seam (the seam's rAF flips
  `paceFrameEpoch` before the drain consults `pacedFrameSpend()`), while a mass re-show — the
  depart sweep hiding the old sector while the new sector's roots re-show under the camera,
  or the keepGpu recook's bound-restore wave at `:22032` — queues unfreeze rows that retire
  only at the per-pass call: ≤6 mints/frame on a quiet frame, ~1 visited row/frame while the
  paced wallet is spent by the cook legs. A ~200-row re-show window is ~33 presented passes
  best case, ~200 under sustained pressure — every unminted re-shown subtree keeps paying the
  unfrozen force-descend compose the freeze was installed to remove (correctness holds by
  design; the compose savings lag seconds behind).
- **Fix sketch**: add `this._drainHiddenUnfreezeQueue?.()` beside the freeze call in both
  seam helpers (`:12310`, `:15389`) — same metering, same wallet honesty; at a seam the epoch
  has just flipped so the slot is free.
- **Effort** S · **magic-frame impact** M (no pop/hitch — delayed compose-savings retirement
  across recook windows; measurable only as sustained frame cost) · **Risk** L — mirror of
  the freeze drain's existing contract.

### F2 — `syncEntityViews(1)` is one atomic ~560-line leg inside every settle pass — the opening settle's largest remaining unsliced span

- **Evidence**: `renderer.js:24849` — `this.syncEntityViews(1)` is a direct synchronous call
  inside `*_publishOpeningFirstPictureSteps`; the driver `drivePublishFirstPicture` at
  `:25011-25017` only yields BETWEEN generator legs, and the settle loop runs the whole pass
  up to 8 times (`:25019`) plus a re-publish leg (`:25039`) per authored cohort. Inside
  `syncEntityViews` (`:23840-24421`): unbounded hidden sweep (`:23920-23996`, per-slot pose
  write + visibility classification + freeze queue push), the bounded freeze drain
  (`:24021`), then the unbounded visible sweep through `:24421` — no internal yield.
- **Mechanism**: every settle pass pays O(slots) pose/visibility/micro-motion/shadow-policy
  work in one task while the loading shell's rAF is the only visible surface — the bar
  freezes for the leg's whole duration, ~9+ times per open, scaling with scene density (the
  Continue-into-a-busy-sector case). Everything else in the pass is stepped
  (`packPresentationWorldToFenceSteps`, `updateMatrixWorldSteps` ×2, the upgrade-promises
  census) — this is the one leg that can't suspend.
- **Fix sketch**: split, don't fully Steps-ify: break the pass at its two natural seams —
  hidden sweep → `yield` → freeze drain → `yield` → visible sweep → `yield` → unfreeze drain
  — as `syncEntityViewsSteps` legs driven by the settle loop only (the presented-flight call
  site at `:25383` stays synchronous, preserving frame-atomic visibility for real frames).
  Each sub-leg is a bounded slot-range walk; the drains already re-check every row's stamps.
  Hazard to manage: slot/generation churn mid-pass — the hidden sweep already guards with
  `world.alive[slot]`/`slotGenerations` at `:23923`, the visible sweep needs the same recheck
  discipline it already has.
- **Effort** L (ordering surgery inside the one function — the piecewise legs are
  straightforward but the contract surface is wide) · **magic-frame impact** H on this lane
  (directly a frozen-loading-screen stretch, repeated per pass) · **Risk** M — a bind/unbind
  landing between slices must re-dirty rather than be skipped.

### F3 — The settle pass's pool/shadow band is a second unsliced leg (10 sync calls, no yield)

- **Evidence**: `renderer.js:24859-24887` — between the `:24858` yield and the `:24888` yield
  sit `syncContactShadowPool`, `ensureShipAuxPoolCapacityForFrame`, `tickShieldShellClock`,
  `syncShipAuxPools`, `liveShadowCastRadius`, `_syncAuthoredInstanceSubmission`,
  `_syncShadowMapEnabled`, `_syncKeyLightShadowFrustum`, `_updateShadowFollow`,
  `prepareActiveShadowCamera`, `_syncAsteroidInstanceSubmission` — one atomic chain per
  settle pass, ×8.
- **Mechanism**: same frozen-bar class as F2 — the authored-instance submission and the
  asteroid-instance submission walk their pools unbounded; on a dense scene this band is the
  second-largest single leg in the pass.
- **Fix sketch**: interleave `yield` between the independent calls (they are sequential
  writes to disjoint pools — a yield can't corrupt ordering), or give the two
  `*InstanceSubmission` walks per-64-row yields like `_openingFirstPictureUpgradePromisesSteps`
  uses at `:24928`.
- **Effort** S-M · **magic-frame impact** M · **Risk** L.

### F4 — Late foundry HDRI arrival re-bakes the PMREM env synchronously inside a presented frame

- **Evidence**: `renderer.js:22427-22435` — `_loadFoundryIbl`'s `.then` calls
  `this._bakeEnv()` unconditionally when the texture lands; `_bakeEnv` at `:22438` is a fully
  synchronous `PMREMGenerator.fromScene` (cubemap render + mip chain + program compile). The
  only guards: `_openingEnvFrozen === true` (`:22438` — set at `:25112`, cleared at
  `:18194`) and the same-source early-out (`:22453-22455`). Force-bake sites are all
  `!scene.environment`-gated (`:12391`, `:14188`, `:15409`, `:18201`).
- **Mechanism**: post-W4 the HDRI is a baked Float32 artifact (~50 ms decode) and usually
  lands inside the menu window — but a slow fetch/decode landing after the opening unfreeze
  runs the whole convolve inside a presented flight frame: one tens-of-ms brick, the exact
  first-flight hitch class. During the frozen opening the guard banks it (the `:18197`
  promote-on-restore path is loading-mode). During flight there is no guard at all.
- **Fix sketch**: arm, don't bake — on arrival after `_openingEnvFrozen` clears, set a
  `foundryEnvPending` flag and run `_bakeEnv()` at the head of the next `yieldLiveSectorGpu`
  seam (or the next `preparePostOpeningPipelines` pass), where the paced ledger already
  tolerates the spend; identical pixels, moved off the presented frame.
- **Effort** S · **magic-frame impact** M (single-brick class, low probability — needs the
  fetch to outlive the whole boot) · **Risk** L.

### F5 — `drainDeferredEnterMaterializers` can still land the whole cohort atomically — but never during the opening settle

- **Evidence**: `src/core/sectorEnterDefer.js:85-120` (iterates every live-epoch entry to
  `done`, no clock/wallet — the documented safety valve) and its only call sites
  `renderer.js:15354` (`state.mode !== 'flight'`) / `:15358` (`sectorShellAdmission !==
  true`), inside `prepareLiveSectorAfterJump`, reached solely via `compileSectorPipelines`
  at `:17750`.
- **Mechanism** (the axis asked whether a full cohort can land inside a presented frame
  during the opening settle): enumerated exhaustively — it cannot. In loading mode the
  emit-side gates `sectorEnterCookWillRun`/`sectorEnterSeamDeferWillRun` (`:15321`/`:15332`)
  require `mode === 'flight'`, so no deferred cohort can exist during boot; and the
  sector:enter listener takes the loading skip at `:17872` before ever reaching
  `compileSectorPipelines`, so the bail itself is unreachable during the settle. Reachable
  windows (all in-flight, all bounded by the ~20-system cohort): (i) a deferred cohort minted
  in flight, then the emit tail delivers after a transition to loading/menu
  (`setEmitSliceSuspended` flushes slices whole at `eventBus.js:287-311`) → the `:15354` bail
  drains every provider in one task inside a presented loading/menu frame; (ii) a live hard
  enter that reaches the listener without an arm — a sector-id-less payload skips `:17851`,
  or an arm released early by the stale-enter clear at `:17769`/recook-keep `:17804`/throw
  path `:17866`/context-loss `:18180`/`:18206` → the `:15358` bail drains whole inside a
  presented flight frame. Bounded (~20 providers × their iterator cost), correctness
  required (the cohort must not interleave a newer enter), but contract-atomic: a paced
  bail is possible in principle.
- **Fix sketch**: route the bail through `drainDeferredEnterSlice` semantics — min-1-step +
  deadline + `pacedFrameSpend` check — with the remainder handed to the seam slice driver
  (`_seamDeferredDrain`/`drainDeferredEnterSlice` owners at `:2495`/`:2597`) or a chained
  `setTimeout(0)` continuation; entries already carry `epoch`/`clock`/`tick` and the splice
  at `:15482` shows how re-driving under the census works. The bail must keep its
  before-mint position (it's the supersession guard) — pace the drain but keep the bail
  verdict synchronous.
- **Effort** M · **magic-frame impact** M (rare window; whole-cohort brick when it fires —
  the biggest single-task cohort in the lane) · **Risk** M — iterator ownership + clock
  pinning must survive the re-arm.

### F6 — Bounded nits

- `queryAsteroidFieldSteps` oversize-disc `keys.sort` (`src/world/asteroidField.js:222`) —
  inside the generator, atomic between yields, but O(filtered cells log n): a tens-of-ms
  worst case only on a giant field with a degenerate radius box. Could emit keys in numeric
  cell order by iterating `minC..maxC` rows against a Set — L.
- `collectFirstFlightCookEntitiesSteps` tail `asteroids.sort`
  (`src/render/partsLibrary.js:1129`) — sorts ALL collected records inside the generator's
  last step (one atomic step between the final yield and `done`); ~ms-scale on dense fields.
  A counting/bucket pass by distance band would slice it — L.
- `collectFirstFlightCookEntities` sync fallback (`renderer.js:14173`, same shape at
  `:12704`) — `typeof collectFirstFlightCookEntitiesSteps === 'function'` guards a static
  import: dead in production (test-mock path only). Not a cost; noted so a future lane
  doesn't hunt it.

## W105 regression verification — all nine items verified concretely

Verified at `4cfe079e1`, then re-verified at HEAD `0fc3ff53c` (the W106 fixup touched items
5, 6, and the unbind tail of 3/9 — noted per item).

1. **Optic per-tick budgets** — `asteroidField.js:518-519`
   (`OPTIC_PROMOTE_PER_TICK = OPTIC_DEMOTE_PER_TICK = 4`), promote cap `:600`, demote cap
   `:619`. (a) the cap only `continue`s — deferred records stay field-resident and re-enter
   the same iteration next tick, no drop/reorder ✓. (b) `opticInterest = true` at `:596`
   precedes the promote cap at `:600` — a fully-deferred pocket still latches ✓. (c) the
   demote loop iterates `index.asteroids`/`entityList` each tick (`:608-619`); a record past
   the cap resumes at the same scan next tick — can't strand live ✓.
2. **Ring-emit rock promote** — `queryAsteroidFieldNearestSteps` `:251-294`. (a) `yield`
   every `batch` scanned `:273`, every `batch` emitted `:288`, AND between rings `:291` ✓.
   (b) early-exit `(ring-1)*CELL > radiusCap + CELL` `:281` — ring k's records sit
   ≥(k-1)·CELL away, so the break fires one ring PAST the cap; per-record reach check at the
   consumer (`renderer.js:12592-12593` / `:15439`) drops the over-selected tail — never
   under-emits, never wrongly promotes ✓. (c) both cook sites stream-consume under
   `FIRST_FLIGHT_ROCK_COOK_CAP` with a yield every 4 promotes (`:12585-12608`,
   `:15428-15457`) ✓. (d) the only materialized-array reader is the sync fallback path —
   dead (F6) ✓.
3. **Clocked freeze drain + unfreeze twin** — `_drainHiddenFreezeQueue` `:21568-21678`,
   `_drainHiddenUnfreezeQueue` `:21705-21817`. (a) both wrap in try/finally →
   `notePacedFrameSpend(drainNow()-drainStarted)` gated on `mode === 'flight'` ✓. (b) park
   clause `(flightMode && visited > 0 && pacedFrameSpend() >= PACED_FRAME_BUDGET_MS)`
   `:21592`/`:21727` — admits exactly one row before consulting the wallet, min-1 progress
   guaranteed ✓. (c) unbound unfreeze drops on `mesh.visible !== true`/detached `:21751-21758`
   — hide-in-place rows can't mint ✓. (d) bound tier (`sfHiddenUnfreezeBound`, `:21750`/`:21771`)
   skips dwell/detach/invisible abandons; only a re-frozen row (`sfHiddenFrozen === true`)
   drops ✓. Delta at `0fc3ff53c`: the unbind tail (`:22045-22052`) now re-queues an
   owed-bound row instead of paying `unfreezeHiddenSubtreeMatrices` inline — the bound row
   is pushed with `sfHiddenFrozen` already cleared (`:22025`), so the bound tier mints it
   normally; no stamp leaks, drain finalizes before reuse ✓.
4. **Shared flap epoch** — `sfHiddenFlapSeq` stamped at freeze push `:21563` and unfreeze
   push `:21701`; dwell reads `Math.max(lastShow, queuedSeq, flapSeq)` `:21613-21614` /
   `Math.max(unfreezeQueuedSeq, flapSeq)` `:21748`; cleared in the unbind stamp-clear
   (`:21998`). (a) a freeze queued after a cancelled unfreeze re-stamps `sfHiddenFlapSeq` to
   the new queue epoch — dwells on fresh, not dead ✓. (b) `_queueHiddenSubtreeFreeze`
   early-outs while `sfHiddenFreezeQueued` (`:21523`) — the queue seq never re-stamps
   mid-queue, so a permanently-culled row's dwell expires on schedule ✓. (c) unbind deletes
   every stamp incl. `sfHiddenFlapSeq` — pooled reuse inherits nothing ✓.
5. **Recount prefix rescan + charged resume** — `shadowReceiverTally.js` `recountShadowReceiversSteps`
   `:70-240`, resolve `:410-426`. Re-verified post-`0fc3ff53c`: `kidCount` stamping is GONE
   by design — the shifted block now seeds the consumed prefix `[0, min(shifted, idx))` on
   EVERY detected `indexOf` shift (`:141-149`), not just array growth — strictly stronger
   (a same-length splice-reorder is now covered, previously a blind spot). Seed pushes stay
   openSet-filtered (`:186`) → bounded over-count, never under ✓. `sinceYield` still charges
   `indexOf` (`:137`) and seeded pushes (`:183`); mid-seed yield `:188-191` + `!node`
   shrunken-array guard `:185` retained ✓. NEW: cumulative `seededTotal > every*4` self-
   abandons (`:175-181`) → resolve treats it as a supersede under `RECOUNT_SUPERSEDE_CAP=4`
   (`:413-419`) — churned suspends can't pay O(resumes×width×subtree) unboundedly, and the
   capped stale settle still keeps `dirty` conservative-on ✓.
6. **Stale-serve bias + defer cap** — `visualCullRadius.js:145-171`. Re-verified: the defer
   cap is now JITTERED `defers <= (2 + (mesh.id & 3))` = 2..5 at `:158`/`:165` — the popin
   lane's F1 storm-cliff fix landed here; under-cull still can't persist past a bounded
   per-row streak, and burst-minted streaks exhaust across passes instead of one cliff ✓.
   Cadence branch still halves `cached.calls -= 8` ✓. Counter resets on LRU hit `:129`,
   record write `:193`, prime `:233` ✓. The vestigial `drawnCullRadiusMax` writes the
   sibling flagged are removed at `:133`/`:195`/`:236` ✓.
7. **Spec-map emits + run-epoch + identity guard + rescan arm** — `_admitSurvivalRosterPrewarm`
   `:18455-18605`. (a) queued re-emits fold into `_rosterPrewarmSpecQueue` deduped by spec id
   at push (`:18517`) and the drive consumes the map as ONE merged emit per burst
   (`:18557-18578`) ✓. (b) `runSeq` pinned `:18539`, rechecked per emit `:18552` and per spec
   `staleRun()` `:18626-18629`; release bumps `_rosterPrewarmRunSeq` `:21062` — stale drives
   bail before minting into the new run ✓. (c) stamp clear identity-guarded
   `this._rosterPrewarmCohortDrain === drive` `:18586` ✓. (d) mints landing between
   settle-exit and released-stamp arm `_postOpeningRescanRequested` `:18602-18604`; consumed
   by the ≤3-pass rescan loop `:16424-16500` which withholds the released stamp while armed
   `:16505-16509` ✓. Delta at `0fc3ff53c`: merged consume now hoists `mergedSpecs` ahead of
   filtered exemplars (`:18578-18590`) — the sibling lane's payload-hoist fix; coverage and
   dedupe unchanged ✓.
8. **Guarded dispose drives** — `disposeBoundaryObject` `:10583-10621` (throw →
   `sfDespawnPartialTeardown` + consume; `measure.settled` stays false → null recount;
   context-loss abandon stamps the flag `:10628`), leftover sweep `:12966-12991`, depart
   sweep `:15780-15802`, `flushDisposeQueueLane` `:2061-2071`, `drainDisposeQueueLane`
   `:2114-2194` (iter `_corpse` identity check `:2139`, catch → `iter._measure = null` +
   flag `:2174-2178`, `sfDespawnNoted` settle `:2189-2191`) ✓. Delta at `0fc3ff53c`:
   backlog escalation floored at the lane base budget (`:2091-2094`) so an inherited ~0
   leftover still escalates — the popin lane's warm-lane-floor fix ✓.
9. **Never-mounted warm roots** — `teardownWarm` `:19225-19236`, `_discardEarlyCrucibleWarm`
   `:19771-19788`, `_releaseSurvivalRosterPrewarm` catalog `:21063-21065` + roots
   `:21095-21101`: all push `_warmDisposeQueue` and stamp `sfDespawnNoted = true` only when
   `!wasMounted` ✓; the pre-stamp is consumed at drain settle (`:2189-2191` /
   `:2069-2070`) so never-counted rows aren't re-noted ✓.

## Axis dispositions

- **(a) wallet-starved drain**: the freeze drain cannot starve at seams. Each
  `yieldLiveSectorGpu` awaits rAF → `paceFrameEpoch` flips before the drain consults
  `pacedFrameSpend()` → every seam is a fresh-wallet full-cap slot (≤6 mints/≤1024 visits/
  ≤4096 nodes). The opening cook exposes ~17 direct seam sites (`:12432-13448`) plus dynamic
  fires: provider-census per-8ms slices (`:12643`,`:12678`), promote-per-4 (`:12602`),
  enqueue/build/env-bind sliced yields, leftover+depart per-corpse yields — dozens of slots
  per cook; in loading mode the wallet never gates at all (`flightMode=false`), so backlog
  dies behind the veil. Survivors past first-playable are bounded to tail-pass queues +
  dwell-deferred flappers, retiring ≥1 row/call under pressure — correctness-safe (unminted
  subtrees pay the compose they always paid). The residual is the asymmetry, filed as F1.
- **(b) ring-emit membership drift**: benign. `FIRST_FLIGHT_ROCK_COOK_CAP = 25` equals the
  whole canonical key space (5 typeIds × 5 variants) — the cap can only bind on
  key-collision repeats, so every reachable type+variant promotes regardless of order.
  Within a ring, cell order (grid Map iteration order) — not exact distance — picks each
  key's exemplar record; the picked rock can be a same-ring record ≤~1 cell farther than the
  exact nearest. Both are real models (unpicked records render as instanced field geometry —
  no stand-in appears); drift is position-only and bounded. Documented, no action.
- **(c) bail drain**: enumerated at F5 — unreachable during the opening settle (deferral
  gates and the cook invocation are both flight-gated); reachable in-flight only through
  (i) post-transition flush of a queued emit tail and (ii) arm-less/admission-released hard
  enters. Whole-cohort atomic by design; a paced variant exists as an improvement, not a
  defect.
- **(d) biggest remaining atomic stretches, ranked**: (1) `syncEntityViews(1)` per settle
  pass — F2; (2) the pool/shadow band `:24859-24887` — F3; (3) `_bakeEnv` PMREM —
  behind-the-veil once per boot (`:12391`, gated `!scene.environment`) plus the
  late-foundry in-flight path — F4; (4) `keys.sort` / census-tail `asteroids.sort` — F6
  bounded; (5) `collectFirstFlightCookEntities` sync fallback — dead code, F6 note.

## Contract check

All findings are scheduling/ordering changes inside render-side queues, drains, and settle
legs — no authored visuals removed, no defaults lowered, no sim writes reordered (the
materializer clock-pinning contract is preserved as-called). F5's paced variant keeps the
bail verdict synchronous and changes only the drain's pacing. Sim determinism untouched —
none of the proposals enter `world`/sim code.
