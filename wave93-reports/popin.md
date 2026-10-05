# Wave 93 — popin-admission audit

- head: `6ac962d51` (`devin/1791064509-perf-w60`)
- lane: popin-admission
- `saturated: false`

Two real contract-preserving residuals remain — a recycled-id doom hole (F1) and the last
un-chunked deferred-enter provider (F2) — plus one narrow env-rebind coverage gap (F3) and one
doctrine-bounded atomic traverse (F4). The lane is close but not saturated.

## W92 regression verification (10 blocks — all landed at `6ac962d51`)

1. **Hidden-loop doomed fast path.** VERIFIED. (a) renderer.js:22470-22491 — the doomed check
   runs AFTER the generation guard (`alive!==1 || slotGenerations!==generation → continue`),
   the mesh null-check, and the entityId/packedFlags/entity reads, and BEFORE
   `refreshVisibleEntity`/`_applyPresentationPose`/`shouldSubmitEntityMesh` classify — so the
   protected bypasses (playerId/FORCE_RENDER/NEVER_CULL inside shouldSubmitEntityMesh) can never
   re-submit a doomed root. The fast path calls `syncResolvingMarker(mesh)` →
   `applyEntityMeshVisibility(mesh,false)` → `_persistentSubmitLanes.markDirty(entityId,
   'visibility')` → `asteroidInstanceViewCulled=true` → `world.clearDirty(slot)` →
   `matrixAutoUpdate===true → false + updateMatrix() + sfHiddenFrozen=true` → `transformed++`
   → `continue`. (b) Ordering as required — no dead reads skipped. (c) `git show 695cde670`
   confirms the block is a pure insertion; non-doomed rows take the byte-identical
   classify/refresh pipeline. (d) A respawned id clears doom at bindMesh
   (presentationWorld.js:776-783) or at either feed stamp (:936 allocate path / :943
   existing-row push) and re-enters the normal path.
2. **bindMesh doom clear.** VERIFIED. presentationWorld.js:776-783 — `doomed[slot]===1 →
   doomed[slot]=0 + markDirtyBits(VISIBILITY)` inside bindMesh, after the meshRefs write. The
   same-mesh rebind arm mints no BINDING/TRANSFORM marks, so the clear stamps its own
   VISIBILITY mark exactly as designed; a rebind onto a previously-doomed slot re-admits on the
   next query (draws immediately).
3. **Dense eligibility + absent sweeps.** VERIFIED. (a) Both sweeps iterate
   `world.activeSlots[0..activeCount)` (eligibility at :981-995, absent-retire at :1003-1014) —
   the swap-compacted dense set, not a capacity walk. (b) The eligibility predicate is verbatim
   `resident._noMesh===true || (resident.type==='projectile' &&
   projectileSkipsVisualFactoryMesh(resident))` — identical to the push predicate at :916-920.
   (c) Matches mint `doomed=1 + visible=0 + markDirtyBits(VISIBILITY)` (:989-993).
4. **Projectile verdict memo.** VERIFIED. weapons/recipes.js:755-774 —
   `projectileMeshSkipVerdicts` is a WeakMap; object arg → `key = data || entityOrWeaponId`,
   memo consulted only when `typeof key === 'object'`; primitive weaponId strings fall through
   unmemoized (no throw, identical verdict). Verdict reads `resolveWeaponRecipe(data &&
   data.weaponId, data).flight.mode === FLIGHT_MODE.ENERGY_CARD`.
5. **syncShadowCasterPolicySteps + driveShadowPolicySteps.** VERIFIED. (a)
   makeShadowPolicyWalker (shadowCasterPolicy.js) is shared verbatim by the sync traverse
   (:351 `root.traverse(walker.visit)` + `walker.finish`) and the stepped twin (stack-DFS,
   children pushed reversed → identical preorder, yield per 256 visited). (b) `finish()` writes
   `state.dirty = shadowCasterPolicyDirtySeq(root) > seqAtMint` — a foreign invalidate mid-walk
   keeps dirty=true. (c) The presented sync routes whole-root castable verdicts through
   driveShadowPolicySteps under `policyDeadlineAt = policyNow()+4`
   (renderer.js:25011-25042); withhold (`syncOpts.allowCast===false`) and scoped
   (`syncScope`) verdicts take the atomic `syncShadowCasterPolicy` branch (:25040-25052).
   (d) `hadParkedWalk` exempts a parked walk from the traverse cap AND the drift-defer
   (:25015-25025); a withhold verdict deletes the parked iter (:25040). (e) The arm restore
   drives the same parked lane under `armNow()+SHADOW_DEPTH_ARM_RESTORE_MS`
   (:25497-25575); `driveShadowPolicySteps ===null → pending.set(root,entry); continue`
   requeues and resumes next arm. (f) `_policyStepsParked` is deleted at all four seams —
   unbind :20626, detached-owner :20851, clearAllMeshes :20916, mid-arm detach :25511.
   (g) opts-signature `${allowCast?}|${lodLevel}|${walkRoot===root}` mismatch → delete+remint.
6. **queueSceneEnvMapRebind / drainSceneEnvRebindQueue.** VERIFIED. (a)
   replaceSceneEnvMapSteps (:26836+) is a per-node idempotent generator (yield/256 visited:
   scene → collectPreparedAuthoredCompileRoots → per-boundary wholeShipLodRoots);
   queueSceneEnvMapRebind pushes `{iter, disposeTarget}` (:26883);
   drainSceneEnvRebindQueue (:26891) steps only the FIFO head under `now()+4` +
   `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS`, called from serviceRenderMeshResidency
   (~:2144). (b) `head.disposeTarget.dispose()` runs only on `step.done` — unvisited materials
   keep a live texture. (c) `_syncShadowMapEnabled` bumps noteShadowCensusLightMutation on both
   the disable flip AND the re-enable restore (:25800-25837), and the depth census warm
   deliberately renders its census with `shadowMap.enabled=false` BEFORE slices
   (shadowDepthAdmission.js:864-871) — the map-disabled early-return can't starve the warm.
7. **aborted markers.** VERIFIED. shadowDepthAdmission.js — all four early-outs return
   `aborted:true` (compiler-unavailable :590, directional-shadows-inactive :595,
   no-casting-subjects :604 — fires even under forceEnable since it's before the staging
   ceremony, staging-unavailable :728). runSlice :885 returns
   `{skipped:true, reason:'session-closed-mid-drive', subjects:0, aborted:true}`; :895 mints
   the NEW shadow-map-disabled early-out `(!sliceOpts||forceEnable!==true) && (!shadowMap ||
   enabled!==true) → aborted:true`; sliceSteps :1017 same on closed. Compile propagates
   `...(sliced.aborted===true ? {aborted:true} : {})` (:748). Empty casting returns
   `{skipped:false, subjects:0}` (:888,:1020) — load-bearing non-skipped shape.
8. **Drive .finally verdict gate.** VERIFIED. renderer.js:25388-25450 — `legResult` is
   captured in `.then` before `.catch` sets `legDriveFailed`; `.finally` computes
   `legAborted = !!(legResult && legResult.aborted===true)`; the park-minting verdict block is
   gated on `legDriveFailed!==true && legAborted!==true` — an aborted leg mints no
   undrawable-forever park and no failure marks.
9. **Post-opening collect budget.** VERIFIED. renderer.js:15587-15601 —
   `unstagedCollectBudget = {remaining: SHADOW_DEPTH_PASS_NODE_CAP}` is passed as the 5th arg
   to collectUnstagedShadowCasters inside the paced 512-subject chunk loop;
   `=== UNSTAGED_COLLECT_OVER_COVER → break` (partial set untrusted; over-cover subtrees never
   mint marks and re-collect as unstaged next admission).
10. **Denied-park release + census-epoch notes.** VERIFIED. renderer.js:24832-24856 —
    `parkedEntry.denied===true && opts.allowCast===true → parkedRelease` (plain release, not
    onDrift — the collect re-verifies under the live census); the keep branch re-keys
    seq/lightSig/oqX/oqZ AND stamps `denied=true` unconditionally; over-cap mints at
    :25320-25334 carry NO denied field. precompile.js — noteShadowCensusLightMutation() runs
    after each castShadow flip AND its restore at ~:876/:880 (closure site) and ~:911/:918
    (try+finally in prepareDirectionalShadowPipelineVariant), so the memo never serves a
    pre-flip signature.

One nuance worth a sentence, not a defect: a parked castable walk under `skipTraverseOnDrift`
skips the whole drive block for that pass (`!traverseDeferred && !skipTraverseOnDrift` gates
both the mint and the drive) — the parked iter survives intact (finish() never ran, the dirty
latch holds) and resumes on the next non-drift sync. Bounded stall on census-drift churn, no
correctness hole.

## Findings (ranked)

### F1 — A respawned (recycled) entity id gets doomed by the dead occupant's suppressed destroy (M)

Evidence:

- Entity ids recycle: `allocateEntityId` draws from `state.freeIds` and `spec.id` reservations
  (coreSystem.js:135-140 — "A reserved id and a freeIds recycle are both a new occupant of that
  number", stamped via `stampOccupantGeneration`); removal pushes ids back at
  coreSystem.js:369 and :407.
- `suppressedDestroyIds` carries **bare ids only** (presentationJournal.js:270 —
  `suppressedDestroyIds.add(entityId)`), and the publisher consults the SAME live set on every
  prefix feed for the whole suspended window (presentationRunner.js:888-890 —
  `rebuildSuppressedDestroyIds` gates on `steppedJournalRebuild && !publishIter`; cleared only
  at collect completion, runner.js:803).
- The doom loop (presentationWorld.js:964-976) mints doom on `byId.get(hiddenId)` when the row
  is alive, `lastSeenSeq !== seq`, `doomed !== 1` — with no check that the slot's occupant is
  still the destroyed entity.
- The respawn scenario: entity X destroyed mid-window → id X into suppressedDestroyIds → X
  recycled to a respawn (freeIds/spec.id) → the respawn binds a mesh onto X's still-alive old
  row (`byId.get(X)` — the row retires only at the publish leg's complete feed) → bindMesh
  clears doom once (correct) → the NEXT partial feed's hiddenIds re-names X → the row is
  doomed again (`lastSeenSeq` still < seq — the respawn is pending in the collect tail or was
  minted after the snapshot) → the respawn's freshly bound mesh hides for the remainder of the
  suspended collect window, flickering once per feed if bind/doom interleave.
- Mechanism: an entity the player should see is hidden for up to a whole suspended collect
  (the stepped rebuild can span many presented frames on fat sectors) — the inverse-popin
  class this lane owns: not late materialization but active suppression of a live body.
- `world.entityRefs[slot]` stays the DEAD entity until the respawn's first push, so a
  refs-vs-live-map compare (`state.entities.get(id) !== entityRefs[slot]`) is exactly the
  "new occupant" distinguisher the loop lacks.

Fix sketch: keep doom limited to rows whose occupant is still the suppressed entity. Cheap
version: the publisher already has `state` — pass `hiddenIds` filtered to ids whose live-map
occupant still matches the row's stored refs (or mark `reoccupiedIds` and let the doom loop
skip them). A respawned id then survives to its first push (where the stamp at :943 clears
doom and refreshMetadata installs the new refs) instead of being re-hidden every feed. The
journal could alternatively record the destroyed occupant's generation alongside the id —
`slotGenerations` already stores the journal generation per row — but the identity compare on
the live map is simpler and needs no journal schema change.

Effort: S-M (the filter lives at the publisher call site; no world-schema change). Impact: M —
whole-window hide of a live entity when reachable; reachability needs destroy→recycle→bind
inside one suspended window (combat churn during a fat-sector rebuild), so narrow but real.
Risk: L — narrowing doom conditions can only UNDER-hide (worst case a dead occupant's stale
row draws until the publish retire); never wrongly hides a pushed row.

### F2 — `solstice._cookProvider` returns `_sync()`'s non-iterator result: the whole pass runs inside one FIFO step (L)

Evidence:

- solstice.js:119-123 — the sector:enter listener defers to `_cookProvider`, which is
  `() => this._sync()`. `_sync` (:191-232) is fully synchronous: walks
  `(this.state.entityList || []).slice()` (:207 — a full copy + O(N) scan), up to 5
  `helpers.spawnEntity` calls (:219-227) plus `helpers.removeEntity` culls, then `_publish()`.
- drainDeferredEnterSlice (sectorEnterDefer.js:162-170): `entry.iterator = entry.provider(sector)`
  — a non-iterator return means the provider body already ran to completion inside that single
  head-step; lines 167-170 then null it and mark `done` — the `budgetMs`/`pacedFrameSpend` slice
  clock cannot cut a sync body. Same in the inline `drainDeferredEnterMaterializers` fallback
  (:100-115).
- Every other registered provider (16 systems, all converted across W41-W57) returns a chunked
  `*_Steps` generator — aceMemory `_sectorEnterSteps`, aftermathWrecks `_enterSteps`,
  automation `_syncOutpostPresenceSteps`, factionPresence `_onSectorEnterSteps`,
  heistFacilities `_materializeForSectorSteps`, intervention `_materializePendingsSteps`,
  missions `_onSectorEnterSteps`, morrow `_syncEntitySteps`, ravel/rubric/vesper `_syncSteps`,
  recoveryEncounter `_rebindSectorSteps`, salvage `_planForSectorSteps`, survivorPod
  `_enterSteps`, traffic/uniqueWrecks `_onSectorEnterSteps`, wingmen `_spawnWingmenSteps`.
  Solstice is the sole holdout.

Mechanism: inside the solstice sector, one presented frame of the census splice pays an
O(entityList) copy + scan + up to five spawnEntity bodies atomically — exactly the emit-tail
class W48's FIFO was built to pace. Outside its sector the `_adventure()`/`_streamed()`
early-outs fire before the walk, so the cost is confined to its home-sector enters.

Fix sketch: mint `_syncSteps` — the W56 pattern: snapshot `entityList.slice()` at mint, yield
per ~32 visited rows, run the spawn/remove legs between yields, keep public `_sync()` draining
the twin inline for byte-identical sync semantics, and swap `_cookProvider` to return the
iterator. Spawn order inside the pass is already linear (core → prisms 0..2 → wisp) so a
chunked twin preserves mint order.

Effort: S. Impact: L-M — bounded single pass, in-sector only, but it is the last un-paced arm
on the deferred-enter FIFO. Risk: L — the conversion recipe is proven 16 times over.

### F3 — env-rebind walks snapshot `preparedAuthoredRoots` once per entry; a root registering mid-drain of a chained entry keeps the disposed env (L)

Evidence:

- replaceSceneEnvMapSteps (renderer.js:26836+) evaluates
  `collectPreparedAuthoredCompileRoots(scene)` exactly once, lazily, when its generator first
  reaches the prepared-roots phase (:26864-26866 — after the whole scene walk, before the
  wholeShipLodRoots phase). The returned list is snapshotted by the for..of for the rest of
  the drain.
- Prepared authored roots register at PREPARE time, not mount —
  `registerPreparedAuthoredAdmission` is called inside the admission legs themselves
  (partsLibrary.js:3212 cargo capsule, :4079 place, :8662 packaged), pinning prepared-but-
  unpublished trees so an env re-bake can rebind them. Registration timing is therefore correct
  for roots prepared BEFORE a walk reaches that phase, but a root registered during a LATER
  entry's drain window is missed.
- The chain: `_bakeEnv` (renderer.js:21036) queues entry e1 = prev→envA; a second bake during
  e1's drain queues e2 = envA→envB behind it. An authored admission whose `buildAuthored*Root`
  bound materials under envA but whose `registerPreparedAuthoredAdmission` lands after e2's
  collect call (async prep settling mid-drain — the prepared-roots + LOD phases can span
  several drained frames on a fat scene) is visited by neither: e1 already passed collect, e2
  snapshotted without it. Result: that root's materials hold envMap=A — disposed at e2's
  `step.done` — and the parked body mounts dead reflections.
- Sole producer is `_bakeEnv`; queue depth in practice is ≤2-3 entries (foundry promotion
  :17391, boot/source-moved :10019, context-restore :9477, the `!scene.environment` sites at
  :12079/:13730/:14755 which never queue since previousEnvMap is null). FIFO head-only stepping
  + prev→next predicate chaining keeps N-queued ordering/disposal correct — the hole is purely
  the once-per-entry collect snapshot.

Mechanism: dead reflections (a disposed envMap texture) on one late-mounting authored body —
quality degradation, bounded to the narrow window between a chained entry's collect call and
its drain completion, until the next env change.

Fix sketch: make the collect phase re-entrant — version `preparedAuthoredRoots` (bump in
register/unregister) and have the generator re-collect when the version moved since its
snapshot, or simply re-run `collectPreparedAuthoredCompileRoots` on each drain-slice resume
(it is a Set-flatten; the per-node `envMap !== previousEnvMap` guard makes re-visits free).
Cheaper still: keep a "pending registrations" latch so an entry about to finish re-walks only
roots added after its collect.

Effort: S. Impact: L — reflections only, no missing geometry, narrow window. Risk: L — the
walk is already per-node idempotent, so re-collection cannot corrupt state.

### F4 — withhold verdicts pay one atomic whole-subtree traverse on presented contact (L — doctrine-bounded, enumerated)

Evidence:

- renderer.js:24959-24983 — `overCovered` (collectUnstagedShadowCasters hit
  UNSTAGED_COLLECT_OVER_COVER) and the queued/catch-all withhold verdicts rewrite
  `syncOpts = {...opts, allowCast:false}` and take the ATOMIC `syncShadowCasterPolicy` branch
  (:25040-25052), while only whole-root `allowCast` verdicts ride the stepped lane.
- The exemption is deliberate and load-bearing: "its traverse carries the subtree-wide
  castShadow=false the cold-link doctrine needs applied now" (:25000-25005) — over-covered
  roots mint no `withheldMeshes` list (the collect gave up with no mesh set), so the atomic
  traverse IS the mask for unstaged casters deeper than the collect cap.
- Per-pass count is bounded by the collect cap, but each traverse is whole-subtree sized — on
  a fat over-covered authored root this is a single un-paced O(subtree) walk on a presented
  frame.

Mechanism: a withheld fat subtree pays one atomic castShadow=false traverse on first presented
contact — the exact shape the stepped lane removes for castable verdicts. Pacing it would need
a depth-draw-side "variant staged" guard (or per-node staged-ness in the walker) so a
half-masked subtree can't draw unlinked depth programs mid-walk — a redesign of the cold-link
doctrine, not a wave item.

Fix sketch: none recommended today — the per-mesh withhold fast path already covers the
bounded-collect case; the atomic traverse only fires when the collect itself gave up. Watch:
if ortho-cell storms or giant authored roots make over-covered withholds frequent, the fix is a
depth-side guard (`casterDepthMarkCurrent`-style verification at draw submit) rather than a
paced mask.

Effort: M-L if ever pursued. Impact: L. Risk: H to pace — parked as enumeration.

## Other residuals checked and closed

- **(a) eligibility flips inside the active prefix feed — coverage is complete.** Committed
  rows re-evaluate at every push (push predicate :916-920 reads live fields through the
  collect's own entity objects); pending rows are covered by the dense eligibility sweep
  (lastSeenSeq≠seq → predicate on `entityRefs[slot]`, which IS the live object for in-place
  mutations — `_noMesh` latches at renderer.js:21940 write in place); rows in the current feed
  that fail the predicate mint skippedIds → doomed (they were never pushed, so lastSeenSeq≠seq
  holds). The only latent dodge: an entity-object identity SWAP on a resident id
  (`state.entities.set(id, newObj)`) while refs still names the old object — the sweep reads
  the stale object's predicate. No producer swaps live entity objects mid-window today
  (`entities.set` runs at spawn/restore contexts, coreSystem.js:140), so this is a coverage
  boundary note, not a bug. Reverse flips (`clearRendererMeshLatches` at renderer.js:1019-1028
  unlatches `_noMesh` on new world context) heal through the same channels: feed stamps + the
  bindMesh clear.
- **(b) doomed-clear asymmetry — clear set is total.** doomed=0 writes at allocateRecord :631,
  retireSlot :705, bindMesh :776-783, unbindMesh :794, feed stamps :936/:943, and `clear()`
  :843-857 retires every active slot wholesale. No writer outside presentationWorld touches
  the column (grep-verified; the only other `doomed` tokens are unrelated locals in
  programBinaryCache/presentationRunner). `setVisibility` (:1084) writes `visible[slot]` on a
  doomed row without clearing doomed — inert: `world.visible` is bookkeeping (its only
  authority read is exactVisible, which fails doomed first at presentationQueries.js:133).
  Slot pooling cannot leak: retireSlot clears and allocateRecord re-clears. The one real gap in
  this family is the recycled-id doom — F1.
- **(c) verdict memo stale-hit surface — verified safe, latent hazard only.** Every write to a
  verdict-relevant field (`id, tracking, damageType, dmgType, continuous, projSpeed, mount,
  impulsePerHit, intercepts, emergentPrimitive, impulseProvenance` — read by
  classifyWeaponFamily at data/vfxProfiles.js:125 + pictureForWeapon) is either a repoint
  (uniqueLootAbilities.js:296 `projectile.data = nestbreakerData(...)` → new key), a pre-spawn
  mutation on a fresh object (opticField.js:430 `{...parent.data}` spread; weapons.js:1539
  `data.projSpeed` inside missile spawn prep), or touches non-verdict fields
  (bindOpticReflectTravel/refreshFlightAfterBounce write spawnPos/maxDistance/bounceRefreshes/
  flightDistance). `data.weaponId=` writes land on damage packets, emergent-primitive pooled
  slots, and beam entries — never a memoized entity.data. Keep-the-contract note for future
  writers: any in-place mutation of a verdict field on an already-memoized data object returns
  the stale verdict for the rest of the session (WeakMap has no versioning).
- **(d) remaining un-paced arms — one holdout + one doctrine-bound.** solstice (F2) is the last
  non-chunked cook provider. The over-covered withhold traverse (F4) is deliberately atomic.
  Elsewhere the enumerations closed clean: all warm legs post decode work through the paced
  lanes (`warmPackagedEntityDecode`/`warmLiveSectorFullExtras`/`kickSpawnedEntityDecode` only
  enqueue `loadAuthoredPart`/`preloadAuthoredAssetsForEntity` — never synchronous work);
  `admitNextUpgradeJob` is a frame-serial pick with the pickVerdicts memo
  (partsLibrary.js:7298+); non-deferred sector:enter listener bodies are atomic but cheap
  planners (`economy.populateSector` markets, `encounterDirector._planSector`,
  `livingPoiBehaviors.planSector` — sim-side, no mesh work, and the emit slice budget at
  presentationRunner.js:200 paces listener sequencing); `drainDeferredEnterMaterializers`'s
  inline flush is the documented safety-valve path.
- **(e) env-rebind queue depth — ordering and disposal verified correct.** Sole producer
  `_bakeEnv` (:21036) — the `!scene.environment` call sites at :12079/:13730/:14755 mint
  `previousEnvMap===null` and never queue; queueing producers are the foundry promotion
  (:17391, force:true gated), boot source-moved (:10019), context-restore (:9477), and the
  foundry-load tail (:20953). Head-only FIFO stepping + per-entry prev→next predicate chaining
  make N stacked entries serialize correctly; dispose lands only at an entry's own `step.done`
  so a released target frees only once nothing still samples it. The residual hole is the
  once-per-entry prepared-roots snapshot — F3.
