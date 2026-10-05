# Wave 97 audit — lane: popin-admission

Audit head: `devin/1791064509-perf-w60` @ `7290dc233118f71ffd27bd7699a1b4281852c210` (W96).
Lane question: can anything that should be on-glass still appear late (or something that should be gone stay visible) under the live admission machinery, without quality degradation and without touching sim hash `892f88c9...`?

**saturated: false**

One real ordering defect remains (finding 1) plus one low-cost follow-on in the same rebuild frame (finding 2). Everything else examined either paces correctly, is already documented/adjudicated, or is dead code.

---

## Findings (ranked)

### 1. Dead-resident retire drops the hiddenIds VISIBILITY mark in the same updateFromEntities pass — corpse stays on-glass for the unbind-drain window
- **Impact: M** — under kill bursts during a stepped journal rebuild, a destroyed entity's bound mesh stays `visible=true` on-glass until the `entity:destroyed` unbind drains (8/frame presentation queue, droppable at the 64-cap overflow) or the ~250 ms `_reconcileMeshResidencySteps` poll self-heals it.
- **Effort: S** — a three-line reorder.
- **Risk: low** — dead+doomed rows keep their marks and retire one feed later via the absent sweep; dead+undoomed rows (the leak the sweep was added to fix) retire exactly as today.
- **Evidence / mechanism:**
  - `src/render/presentationPublisher.js` — suppressed destroys replay via `rebuildSuppressedDestroyIds` (presentationJournal.js:182,270,711; runner :893-895) → `fallbackFromState` calls `world.updateFromEntities(sample, null, {retire:false, hiddenIds})` (:129-135).
  - `src/render/presentationWorld.js:990-1006` — hiddenIds leg: a suppressed-destroy row fails the `resident.alive !== false` continue (:996-997, resident is dead) → `world.doomed[slot]=1; world.visible[slot]=0; markDirtyBits(slot, VISIBILITY)` (:1002-1004). The hide mark is minted correctly.
  - `src/render/presentationWorld.js:1032-1054` — same-pass retireSuppressed sweep checks `resident.alive === false` (:1037) **before** `doomed[slot] === 1` (:1045). A just-doomed dead resident → `deadResidents.push(slot)` → `retireSlot(slot)` (:1054) → `writeDirtyMask(slot, NONE)` (:720), `meshRefs[slot]=null` (:723), `alive=0`, `doomed=0`.
  - Consumers that lose the mark: the hiddenSlots loop `src/render/renderer.js:22734-22763` requires `world.alive[slot]===1` (:22737), `meshRefs[slot]` (:22738), `entityRefs[slot]` (:22742), `doomed[slot]===1` (:22743) — retireSlot clears all four. The `applyEntityMeshVisibility(mesh,false)` hide (:22750), `_persistentSubmitLanes.markDirty(entityId,'visibility')` (:22751), `syncResolvingMarker` (:22749), and `asteroidInstanceViewCulled` (:22753) never run; the matrix-freeze leg (:22757-22761) is skipped too.
  - Remaining hiders: `entity:destroyed` presentation-tier handler (renderer.js:16274-16317 — queued 8/frame drain via eventBus.js:158-201, droppable under the 64-cap overflow during kill bursts) and the `_reconcileMeshResidencySteps` ~250 ms residency poll (:21595 `!entity` → unbind + `scene.remove`). The intended same-frame hide path is the only one that was actually cut.
- **Fix sketch:** in the sweep at presentationWorld.js:1032-1054, hoist `if (doomed[slot] === 1) continue;` above `if (resident.alive === false)`. Doomed dead rows keep their VISIBILITY mark, hide through hiddenSlots this frame, and retire at the next completed feed's absent sweep (:1060-1074). Dead residents that were never doomed still collect into `deadResidents` and retire in-pass — the comment's leak fix (:1038-1041) is preserved verbatim.

### 2. `_rebindPresentationMeshes` rebuild sweep is un-chunked inside the presented prepareFrame
- **Impact: M→L** — a journal rebuild pays one O(live `_meshes`) `_bindPresentationMesh` sweep inside the same presented frame that already carries the documented `updateFromEntities` tail. Per-row cost is O(1)-ish after the memo guards (canonicalize flag :20772-20775 and `sfSharedTexturesNoted` :9030-9036 both early-out on rebind; `entityVisualCullRadius` memoized), so the constant is small — but it adds to the ~9 ms rebuild-tail bound the wave already documents, and the sweep is not inside that estimate.
- **Effort: M** — chunk the sweep like its siblings (`_bindPublishedPresentationMeshes` is already per-publication bounded; a Steps twin or residency-poll handoff matches house style).
- **Risk: low-medium** — bind order affects `lanes.reserve`/`bindMesh` ordering; keep it sequential per row.
- **Evidence:** `src/render/renderer.js:23936-23938` — `publication.rebuilt` → `this._rebindPresentationMeshes()` inside `prepareFrame` (presented path); same call in the Steps twin `_publishOpeningFirstPictureSteps` at :23591 (loading path, paced — fine). Sweep body :21150-21156 — `for (const [id, mesh] of this._meshes) _bindPresentationMesh(entity, mesh)` with no yield. Trigger frequency = per journal rebuild (same gate as the documented tail), so it is bounded — it just isn't part of the bound.
- **Fix sketch:** drive the rebind through a `*Steps` generator yielded at ~256 binds per leg and feed it into the existing paced rebuild path (or fold it into the same bounded leg that runs the documented update tail), so a worst-case rebuild frame stays inside the documented cap.

### 3. (hygiene) `collectNeverLinkedSceneRoots` sync twin is dead code
- **Impact: L** — no behavior; misleading inventory of "still-atomic walks".
- **Effort: S** — delete ~20 lines.
- **Risk: none.**
- **Evidence:** `src/render/renderer.js:8221-8247` defines the sync collector; the only call site is the chunked `collectNeverLinkedSceneRootsSteps` at :13545. No sync callers exist.
- **Fix sketch:** delete the sync twin (or keep as a `typeof` fallback like `collectCompileSubjectsPaced` does — but nothing calls it, so deletion is honest).

---

## Regression notes — W96 machinery (all verified at audit head `7290dc233`)

1. **`_shadowCensusForFrame` memo across `_viewSyncSeq`** — PASS. Memo `{scene, sig, epoch}` keyed on `shadowCensusEpoch()` recomputed fresh per call (renderer.js:25515-25525); consumed at the depthOpts mint (:585-586 `lightSigOverride = depthOpts.lightSigFor()`); `lightSigFor` minted at all 7 arm sites (:9610, :9868, :11733, :13276, :13645, :14843, :25820); out-of-band mounts bump `noteShadowCensusLightMutation` (flightOverheadPresentation.js:32, weaponLights.js:41). Census cannot stale across a view sync.
2. **`boundaryDisposeMeasure` receiver accuracy** — PASS. `measure.receivers++` counts `receiveShadow===true` pre-teardown (renderer.js:27477, :27503); `settled=true` only on a completed walk (:10450 sync path, :10466 Steps-done); abandoned walks → `_markShadowReceiversDirty()` (:10492-10496); context-loss re-checked after each yield (:10478-10481). `disposeObjectNode` clears `castShadow` only (:27422 region) — receiver counts survive teardowns.
3. **Starvation fairness rotation** — PASS. `_policyMintStarvedClasses` per-class Set re-armed on each fresh collectSeq (renderer.js:25384-25387); class `extra.framePass===true?'f':'c'` (:25388); `_policyMintStarveFair` Map rotation — previous winner `blocked=true` skips exactly one grant then re-claims (:25401-25408). The map intentionally persists across seqs.
4. **Recheck re-arms stay stamped/staggered** — PASS. Both park legs (renderer.js:25095-25102 re-mint branch, :25174-25181 re-key branch) re-derive `(96 + _parkedRecheckStamp%32) * min(8, 1<<(cycles-1)) * (glassAdj?0.5:1)` with live `shadowCastAxisDistance` glass evaluation and `sfDepthUndrawableCycles`; stagger via `_parkedRecheckStamp++`. No static backoffs.
5. **`maxRadiusDirty`** — PASS. `retireSlot` flags when `maxRadius>0 && retiredRadius===maxRadius` (presentationWorld.js:714); shrink flags :550-551; getter recomputes once on read (:327-336); raise branch clears (:235-237); `clear()` resets (:157, :869-870). No repeated max scans after a max-holder retires.
6. **`castBand` park stamp + release ordering** — PASS. Both park-mint literals stamp `castBand: shadowCasterBand(root)` (renderer.js:25145-25152, :25747, :25876); re-key re-stamps (:25163); release clause at :25145 is a plain `parkedRelease=true` (not the `onDrift` variant), ordered after the denied clause (:25137-25144); `castBand != null` guard skips legacy entries.
7. **Zombie dressing rows** — PASS. `row.alive=false` lands BEFORE `table.rows.splice` in both `dropDressingRow` (dressingTable.js:113-114) and `dropDressingSector` (:132-133); snapshot readers gate on `pushAlive`/`forEachDressingRow` (:158) so a mid-splice snapshot sees the row as dead.
8. **Dead-resident retire** — PASS structurally, with the ordering defect above (finding 1). `resident.alive===false` → `deadResidents.push` with `byId.get(world.entityIds[slot])===slot` id-recycle guard (presentationWorld.js:1042), `continue` before the doomed check (:1043-1045), `retireSlot` after the loop (:1054).
9. **Cook census + lateRoots** — PASS. `collectInstancePoolCompileRootsAndSubjectsSteps` driven under `paceCookStretch()` with per-iter `cookStale()` check (renderer.js:14007-14019); `cookLateAdmittedRoots` rebuilt via `meshRootSet`/`enclosingMemo`/`lateRootSet` in `_meshes` order (:14024-14057); the lateRoots literal prefers the cache with `collectLateAdmittedCompileRoots` fallback (:14076-14077).
10. **`collectCompileSubjectsSteps` + paced driver** — PASS. Generator yields per 256 visited, DFS order identical to `traverse` (compilePresentSlice.js:24-42); `collectCompileSubjectsPaced` awaits `pace()` per yield with sync fallback (renderer.js:537-548); all 7 sites wired — sealSubjects x2 (:13210, :13219), shadowSensitiveLeftovers (:14091), lateSubjects (:14112), cookCompileSubjects (:14694), fallbackOut (:15599), out bucket (:15635).
11. **`uniqueAdmissionUnits` windows** — PASS. `listStart`/`listEnd` clamps via `Number.isInteger` (openingGpuAdmission.js:415-416; negative start → 0, end → list.length; NaN/absent → old whole-list behavior); chunk sites pass `{start:i, end:i+1024}` with shared seen sets instead of slicing — :10120, :11800, :13237, :14120, :14719, :15654.
12. **Roster splice in `finally`** — PASS. `_rosterPrewarmRoots.splice(rosterIdx, 1)` for `asteroidLeafWarmRoot` lands inside the `finally` (renderer.js:14877-14879) — early `return cookSuperseded`/returns still detach the root from the warm roster.

No regressions found in the W96 machinery.

---

## Residual hunt (lane-specific, a–e)

- **(a) Dead-resident retire vs doomed-row marks** — **REAL DEFECT → finding 1.** The sweep's `alive===false` check precedes the `doomed===1` check, so a suppressed-destroy row that was just doomed+marked by the hiddenIds leg gets retired in the same pass, wiping the mark and the refs the hiddenSlots consume requires. Chain verified end to end (publisher → hiddenIds leg → sweep → retireSlot → four guarded consumers at renderer.js:22734-22763).
- **(b) `row.alive=false` dressing-drop readers** — **CLEAN.** Snapshot readers (`collectJournalPresentationEntitiesChunked` slice → `pushAlive` gate, presentationSources.js:127→:109) can't see spliced rows; `seen` is identity-keyed so recycled-id newcomers still collect; byId readers (`getDressingRow` :92-93, `markDressingRowPoseDirty` :98, pose gates renderer.js:23466, :23508) miss deleted rows by design; `resolveWorldPresentationEntity`→null → reconcile unbind (renderer.js:21595); `insertDressingRow` always mints a fresh literal (:61-75), no external `table.rows`/`byId` mutation. Residue: dropped ids linger in `dirtyPoseIds` until the gate drains — harmless.
- **(c) `exactVisible` memo stale-verdict inputs** — **CLEAN.** The memo key (presentationQueries.js:151-160) covers every input `exactVisibleCompute` (:176-194) reads: doomed, alive, bound, entityId, flags, entity identity, posBad, x, z, radius, bounds x/z/halfX/halfZ, origin x/z, playerId. Entity fields absent from the key are never read by the verdict. `posBad` covers finiteness flips; finite→finite writes are verdict-neutral. Persisted `visCache` across frames is safe.
- **(d) `updateFromEntities` ~9 ms tail bound** — **DOCUMENTED**, bound still holds structurally. Deferred at `design/perf/PR194-WAVE-LOG.md:1693` under the completed-tick gate. The sync call (presentationWorld.js:906-1077) is still O(N_feed + activeCount + |hiddenIds| + |skippedIds|) run inside the presented publish; the constant grew since the estimate (eligibility recheck :936-941, unchanged-skip compare :821-858, hiddenIds/skippedIds legs :984-1021, dead-resident sweep :1023-1055, boundEntityRefs compare :996) — estimate ~1.2-1.5× stale but the stepped twin remains the real cap. Finding 2's rebind sweep is an additional leg in the same frame not covered by that estimate.
- **(e) Remaining un-budgeted popin-path walks, ranked by worst-case node count:**
  1. `_rebindPresentationMeshes` O(all `_meshes`) rebuild sweep inside presented prepareFrame — finding 2.
  2. `shadowReceiverTally.recount` whole-scene traverse (shadowReceiverTally.js:53-55) via `resolve` at renderer.js:26239 — designed dirty fallback; fires once per dirty event (abandoned dispose :10496, policy rewrite without measured delta :80/:88), rare, O(scene ≈16k) ≈ ~1-2 ms. Bounded; the tally-absent sync fallback at :26246-26250 only fires if `createShadowReceiverTally` (:9925) never ran — pre-init edge only.
  3. `withOnlySubjectsDrawable` scene.traverse per subject-touch (openingGpuAdmission.js:457, :624) — documented known cost (renderer.js:20230-20235), amortized to the group form at :15771/:15928; singular `touchOne` sites still pay a whole-scene hide+restore per subject **but inside their own paced slice leg**. Adjudicated-adjacent; not re-reported.
  4. `collectPresentationTextures` per fresh bind (renderer.js:8995-8996, :9038) — O(mesh subtree) once per mesh (`sfSharedTexturesNoted` memo :9030), inside the paced `_drainPendingMeshBuilds` queue. Bounded per mesh.
  5. `collectNeverLinkedSceneRoots` sync twin — dead code, finding 3.
  6. Memoized/bounded remainder: `socketWorldPos` per-(mesh,socket) traverse memoized in `__socketCache` (:26462-26468); `getPooledNavLightSources` per-root traverse memoized (:7056); `describeOpeningInstancedPbrLeaves` `traverseVisible` diagnostics-only (:797); draw-histogram scene walk armed only by `?drawhist` (:10659-10666); settings-toggle budget walk under `SHADOW_DEPTH_PASS_NODE_CAP` + over-cover queue (:26067-26095); envRebind `rebindTree` stepped per 256 (:27274-27289); material-settle stack walk chunked per 512 (:12797-12806); `applyEntityMeshVisibility` O(1) root flag (entityMeshVisibility.js:67-73); despawn disposes queued through `_despawnDisposeQueue` + `disposeObjectSteps` (:2028, :16308-16313, :21133).

## Contract check
- Zero visible quality degradation: the only behavioral change proposed (finding 1) makes a suppressed corpse *less* visible sooner — no visual gain is removed. Finding 2 reorders work within the same rebuild frame. Both preserve all rendered output.
- Sim hash: all proposed sites are presentation/render-tier only — `presentationWorld.js`, `renderer.js` — no sim writes.
