# Wave 94 — popin-admission audit

- head: `33e18718a` (`devin/1791064509-perf-w60`)
- lane: popin-admission
- `saturated: false`

One real mechanism-level residual remains: W93's recycled-id doom guard compares against
`world.entityRefs[slot]`, but `bindMesh` refreshes `entityRefs` — so the guard protects the
wrong case on both legs (a)/(b) and re-dooms the bound respawn it was written to save. The
rest of the lane is near-saturated: (c) closes clean, (d) leaves one defensive gap, (e) is
bookkeeping-bound.

## W93 regression verification (12 blocks — all landed at `33e18718a`)

1. **Pass-scoped policy wallet.** VERIFIED. (a) `_policyPassDeadlineAt` mints once per pass at
   the `_depthCollectPassSeq !== collectSeq` roll — the same seam that resets
   `_shadowRootSyncPassCount = 0` (renderer.js:24917-24928). (b) The stepped lane passes
   `policyDeadlineAt = this._policyPassDeadlineAt ?? (policyNow() + SHADOW_POLICY_PASS_MS)`
   into `driveShadowPolicySteps` (renderer.js:25045-25063), so every drive in the pass shares
   the wallet. (c) Spent roots stay parked under `_policyStepsParked` and resume next pass;
   `iter.next()` at renderer.js:27010 runs before the deadline check at :27024, so each call
   still advances ≥1 slice.
2. **needsAtomicOut.** VERIFIED. `needsAtomicOut = !!(extra && extra.preCountRoot)` at
   renderer.js:25045-25047 routes `onAuthoredAssetSwap`-class callers to the atomic
   `syncShadowCasterPolicy` branch (25070-25089), never the stepped lane; the atomic branch
   folds `carriedDelta` from a deleted parked slot into `receiverOut.receiverDelta`.
3. **carriedDelta accumulation.** VERIFIED. (a) Sig is `allowCast|walkRoot===root`, lodLevel
   dropped (renderer.js:26989). (b) Sig-mismatch abandon chains
   `carriedDelta = (slot.carriedDelta|0) + (slot.out ? slot.out.receiverDelta|0 : 0)` (:26994);
   done/atomic branches chain identically. (c) `noteReceiver` writes
   `options.out.receiverDelta` incrementally per node
   (shadowCasterPolicy.js:270-278, `preCountRoot` prefix counting at :290-296). (d) Done
   branch calls `stampShadowCasterPolicyLodLevel(root, lodLevel)` (renderer.js:27015). (e)
   `opts.out.receiverDelta = slot.out.receiverDelta + slot.carriedDelta` with the
   `preReceiverCount` copy (:27017-27020).
4. **Presented-leg paced debit.** VERIFIED. `notePacedFrameSpend(policyNow() -
   policyStartedAt)` debits after every `driveShadowPolicySteps` drive
   (renderer.js:25063).
5. **Rescan collect wallet.** VERIFIED. `{remaining: SHADOW_DEPTH_PASS_NODE_CAP}` mints per
   rescan pass (renderer.js:15681-15685; the main collect's `unstagedCollectBudget` at
   :15605); `=== UNSTAGED_COLLECT_OVER_COVER` is a string-identity break against the
   `'sfUnstagedCollectOverCover'` sentinel (shadowDepthAdmission.js:367).
6. **session-closed-mid-drive retry.** VERIFIED. `driveDepthCompile`
   (renderer.js:15580-15598): bounded 4 attempts, `lastRetryResult` preserved, retry iff
   `stale === true || reason === 'session-closed-mid-drive'`; exhaustion returns
   `lastRetryResult` when the reason matches, else
   `{skipped:true, reason:'light-census-drifted-repeatedly'}`.
7. **OVER_COVER test pin.** VERIFIED. test/shadow-depth-admission.test.mjs:654-667 asserts a
   `{remaining:0}` collect returns the string sentinel (`!Array.isArray`) and
   `{remaining:64}` returns an array.
8. **Env-drain ledger.** VERIFIED. `drainSceneEnvRebindQueue` (renderer.js:26947-26974):
   `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS && _envRebindLedgerSkips < 2` → `skips++` and
   return without stepping; the aging floor resets `skips=0` and drains anyway;
   `notePacedFrameSpend(now() - startedAt)` debits whenever `elapsed > 0`.
9. **Doom-mark mint guards.** VERIFIED. Both mint sites read
   `const wasVisible = world.visible[slot] === 1` BEFORE writing `visible=0`
   (presentationWorld.js:985-988 doom loop, :1008-1011 resident sweep);
   `markDirtyBits(VISIBILITY)` only when `wasVisible`; `doomed=1`/`visible=0` mint
   unconditionally.
10. **Recycled-id doom guard.** MECHANISM PRESENT, VERDICT INVERTED — see F1. The code is
    verbatim as specified (`liveOccupant !== undefined && liveOccupant !==
    world.entityRefs[slot] → continue`, presentationWorld.js:979-981; publisher passes
    `state && state.entities` at presentationPublisher.js:129-139; skippedIds share the loop
    at :970), but the guard's premise — refs staying stale for a bound respawn — is violated
    by `bindMesh`'s own `refreshMetadata` write (see F1 evidence).
11. **solstice `_syncSteps`.** VERIFIED. `_sync()` drains `_syncSteps()` inline
    (solstice.js:191-193); `_cookProvider = () => this._syncSteps()` returns the generator
    (:122) so `drainDeferredEnterSlice` steps it under the FIFO clock; the scan yields per 32
    visited rows (:219); early-outs intact (`_restoring` :200, `!_adventure`/`destroyed`
    :202, `!_streamed` :207); spawn order scan → core → prisms 0..2 → wisp → `_publish`
    preserved; sector:enter defers at :119, save:loaded still syncs inline at :117.
12. **Env-walk mid-drain re-collect.** VERIFIED. `walkedPreparedRoots` Set dedups across
    re-collect passes (renderer.js:26908-26919); `collectPreparedAuthoredCompileRoots`
    re-runs until a pass walks nothing new (`pending === false`);
    `material.envMap !== previousEnvMap` at :26878 makes re-visits no-ops.

## Findings (ranked)

### F1 — The doom guard's identity compare is inverted by bindMesh's own refs write: bound respawns re-doom, never-bound corpses draw (residuals (a) + (b)) (M)

Evidence:

- `handleForEntityId(entityId)` resolves through `byId.get` (presentationWorld.js:689-690),
  so a respawn recycling a dead id binds onto the dead body's still-alive row.
- `bindMesh` calls `refreshMetadata(slot, entity)` at presentationWorld.js:783, and
  `refreshMetadata` writes `world.entityRefs[slot] = entity` unconditionally (:511). A
  mid-window respawn bind therefore rewrites `refs` to the live occupant. The bind also
  happens through the ordinary residency sweep — renderer.js:21211-21225 resolves
  `resolveWorldPresentationEntity(state, id)` (returns the LIVE occupant R for the recycled
  id), checks `entity.alive !== false` (:21215), and calls `_bindPresentationMesh(R, mesh)`
  (:21223) — R can re-bind the dead body's existing `_meshes` entry without any new build.
- The guard at presentationWorld.js:981 skips doom iff `liveOccupant !== undefined &&
  liveOccupant !== world.entityRefs[slot]`.
- **Direction 1 (F1-class respawn still broken):** sequence — X destroyed mid-window →
  `suppressedDestroyIds` carries X (presentationJournal.js:267-277, every suppressed destroy
  lands regardless of collect membership) → R spawns with recycled id X → R binds →
  `refs = R` → next prefix feed names X in `hiddenIds` → `liveOccupant = R === refs` → guard
  does not fire → `doomed=1` mints → R's bound mesh hides for the remainder of the suspended
  collect (suppressedDestroyIds persists until collect completion, presentationRunner.js:
  783-803). The lastSeenSeq stamp can't save it — R never pushed, so `lastSeenSeq[slot] !==
  seq` (:974) holds the whole window. This is verbatim the W93-F1 symptom the guard was
  added to kill.
- **Direction 2 (under-doom, the (a)/(b) residuals):** the guard only fires when
  `liveOccupant !== refs` — i.e., when the live occupant has NOT bound and `refs` still names
  the dead occupant — exactly the case where the row still shows the corpse's mesh. Two
  reachable producers:
  - (a) post-collect occupant: R minted after the collect snapshot (or after its index's
    chunk) → R absent from collectOut → never pushed, never bound → `hiddenIds` names X →
    `liveOccupant = R ≠ refs = dead-D` → doom skipped → corpse draws all window. The row
    can't even be reclaimed: `byId` maps the id to the dead row and `allocateRecord` refuses
    `byId.has` collisions, so no fresh row mints for R until the publish-leg retire frees it.
    A `promoteFarActor` mid-window is a concrete producer — it creates a NEW entity object
    under the reserved `rec.id` (farActorTable.js:645-733) via `spawn(spec)` →
    `state.entities.set` (coreSystem.js:140-146) — re-objecting an id whose row still shows
    a prior occupant.
  - (b) eligibility-fail recycle: R is live and IN the feed but fails the push predicate
    (`_noMesh` latched or energy-card projectile via
    `projectileSkipsVisualFactoryMesh`, presentationWorld.js:921-927) → id lands in
    `skippedIds` → same doom loop, same guard → `liveOccupant = R ≠ refs` → doom skipped.
    But an eligibility-fail occupant can never push or legitimately bind — the corpse has no
    self-heal path. The dense resident sweep can't catch it either:
    `resident.alive === false → continue` at :1005 skips dead-refs rows entirely. Combat
    churn is the standing producer (dead ship id recycled to an energy-card projectile).
- `world.doomed` write/clear topology confirms nothing else rescues these rows: clears only
  at allocateRecord (:631), retireSlot (:705), bindMesh (:776-781), unbindMesh (:794), and
  feed stamps (:941/:948); mints only at :986 and :1009.

Mechanism: two inverse pop-in symptoms on the same row class. Direction 1 hides a live,
bound entity for up to a full suspended-collect window (the stepped rebuild can span many
presented frames on fat sectors) — the W93-F1 bug unfixed at HEAD. Direction 2 draws a dead
body's stale mesh under a recycled id while the real occupant waits for the publish retire —
corpse-draw plus late pop-in in one row. Both need destroy + id-recycle inside one suspended
window; combat churn against fat sectors is the reachable producer.

Fix sketch: gate doom on the ROW's occupant liveness, not on an id-map identity compare —
the signal that distinguishes "respawn owns this row" from "dead body owns this row" is
whether `refs[slot]` is live (bind/push already refreshed it), not whether some live entity
occupies the id. Concretely: for the `hiddenIds` leg,
`const resident = world.entityRefs[slot]; if (resident && resident.alive !== false)
continue;` — a bound respawn's refs are alive → skip (keeps drawing; bindMesh already
cleared doom); a dead-or-null resident → doom (corpse hides; a later bindMesh re-admits the
real occupant, since the clear at :776-781 runs on any bind). For the `skippedIds` leg, doom
unconditionally — the feed entity is eligibility-fail by construction and can never
legitimately reclaim the row, so no occupant verdict is needed. (If a per-leg flag is
wanted, iterate the two lists separately rather than tagging ids.)

Effort: S (one predicate change + leg split; no schema or plumbing changes). Impact: M —
closes the still-live W93-F1 window-hide AND the corpse-draw hole; both bounded by the
suspended window but reachable every combat-heavy fat-sector rebuild. Risk: L-M — the
`hiddenIds` arm can only *over*-doom a row whose stored occupant is stale-live (re-objected
without a bind — a boundary that self-heals on the occupant's next push or bind); the
`skippedIds` arm restores the W90 intent verbatim.

### F2 — `bindMesh` clears `doomed` on any bind without consulting occupant liveness (residual (d)) (L)

Evidence:

- `bindMesh` clears `world.doomed[slot]` and re-marks `VISIBILITY` for ANY bind
  (presentationWorld.js:776-781) — "a bound mesh is the freshest liveness evidence"
  assumes the bound entity is live. Every resolve-then-bind callsite alive-guards today
  (renderer.js:1838, :1874, :20895, :20908, :21215), but the clear lives one caller away
  from a dead-occupant bind: a queued mesh build whose entity was destroyed mid-flight, or
  the live-mount path (renderer.js:22008) binding an id whose row was doomed by a prior
  feed's hiddenIds while the mount entity is a same-id respawn that hasn't pushed yet —
  the bind un-dooms the row, the next feed's guard (F1 direction 1) re-dooms it → one-frame
  corpse/respawn flicker per bind-vs-feed interleave.
- Other writers checked and closed: `applyTransform`/`applyVisual` do NOT clear doomed
  (:740-763) — fine in practice because journal records are suppressed during the window
  and doomed rows retire at the publish leg before post-commit records land;
  `unbindMesh` clears doomed (:794) but also writes `visible=0` and `meshRefs=null` — inert;
  `setVisibility` writes `visible[slot]` without touching doomed — inert (authority read is
  `exactVisible`, which fails doomed first at presentationQueries.js:133); pooled handles
  are rejected by `slotForHandle`'s generation check (:596+); `clear()` retires wholesale
  (:843-857); no test writes `world.doomed` directly (grep-verified — the `doomed` hits in
  test/ are unrelated locals).

Fix sketch: make the bind-time clear conditional on the bound entity being live —
`if (world.doomed[slot] === 1 && entity && entity.alive !== false)` — or on the row's
resident (`world.entityRefs[slot]`) liveness after `refreshMetadata`. Pairs naturally with
F1's resident-liveness gate.

Effort: S. Impact: L — a ~one-feed corpse flicker, narrow window, no confirmed producer
today. Risk: L — pure narrowing of a clear; a live occupant's bind always reaches
`refreshMetadata`/`markDirtyBits` regardless.

### Residuals (c) and (e) — closed / enumerated

- **(c) liveEntities coverage — closed.** `updateFromEntities` has exactly one caller:
  presentationPublisher.js:129-139. The `retire:false` collectPrefix path passes
  `liveEntities: state && state.entities`; completed feeds pass `undefined` (no
  `retireSuppressed`, so the doom loop never runs). Coverage is complete for the only
  domain that needs it: every destroy-recordable entity lives in `state.entities`
  (recordDestroy fires from removeEntity on spawned entities, coreSystem.js:349/391);
  dressing/rock/far-actor occupants never produce destroy records, so their absence from
  `liveEntities` is unreachable in hiddenIds. For skippedIds, a dressing row resolves
  `liveOccupant === undefined` → doom proceeds — correct, since dressing rows have no
  live-occupant semantics.
- **(e) remaining non-deferred sector:enter listeners — bookkeeping-bound, lane
  saturated.** All ~20 heavy materializers defer via `deferSectorEnterMaterialization`
  (solstice, ravel, rubric, ruckus, weapons, aceMemory, aftermathWrecks, asteroidSites,
  automation, factionPresence, heistFacilities, intervention, missions, morrow,
  recoveryEncounter, salvage, traffic, wingmen, survivorPod, vesper — several gate inside
  `_onSectorEnter` rather than at the `bus.on` site). The remaining sync bodies, heaviest
  first: `economy.populateSector` (economy.js:2021-2034 — memoized `ensureMarket` per
  station; first-enter market mint is COMMODITIES×stations equilibrium math, bounded and
  idempotent — largest candidate, still light), `npcJobsRuntime._onSectorEnter`
  (:5764 — O(jobs-in-sector) relink loop of map lookups + bounded ambiguity checks),
  `bracket._sync` (:101-115 — guarded entity scan + `_removeAll` + ≤8 `spawnEntity`),
  `encounterDirector._onSectorEnter` (:495 — pressure reseed + plan), `claims` (×2, ~:380 —
  POI labels + station growth stamps), `sectorSim._onSectorEnter` (:669 — recipe projection
  + emits), `nemesis._sectorChanged` (finish/cancel pending), `story`/`lossInvestigation`
  `_onSectorEnter` (checkpoint/promotion lookups), `achievements` (:1098 — sector stamp +
  odometer baseline), `audioSystem` (:2523 — encounter set clear, session reset, theme
  matrix), `presentationOrchestrator` (mining-runtime reset + travel cue emits),
  `aiEncounter`/`combatOutcome`/`difficultyDirector` wake flags, audio loop stops, and the
  trivial dockingCorridor/mining/survivalArena/travelLanes/UI resets. Nothing here rises to
  a wave item; watch `economy.populateSector` only if commodity/station counts grow
  materially.
