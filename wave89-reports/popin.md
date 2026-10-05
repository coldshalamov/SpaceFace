# Wave 89 — popin-admission lane audit

- **Lane:** popin-admission (things popping into existence late)
- **Audited HEAD:** `780d91fbf` on `devin/1791064509-perf-w60` (W88 commit)
- **Contracts honored:** zero visible quality degradation; sim determinism bit-identical (golden `892f88c9`, sf-sim.mjs 47a). All proposals below are presentation/ledger-layer only — no sim write order, no visual output changes.

## saturated: false

Two more wait-in-ledger sites of the exact class W88 fixed remain in adjacent commit continuations (findings 1–2), the paced dispose drives charge their whole multi-present span as one debit (finding 3), and the fallback's synchronous whole-entityList collect still runs inside presented frames whenever a stepped rebuild's collect leg is mid-flight (finding 4). Legal contract-preserving implementations exist for all.

## Ranked findings

### 1. `attachPackagedBody` mount-tail debit charges the compile + publication waits — partsLibrary-class ledger residual — visualFactory.js:4451

**Evidence:** `legStarted` is last restamped at visualFactory.js:4326 (or inside the last `driveLeg` resume at :4271) — before `await prepareAuthoredVisualPipelines(packaged, …)` at :4390 and `await publicationWait` at :4424. The trailing `notePacedFrameSpend(legNow() - legStarted)` at :4451 therefore debits `elapsed = compile span + publication gate + atomic mount tail`. The identical continuation in the scenario-prop twin restamps correctly: `legStarted = legNow()` sits after the `publicationWait` await at visualOverrides.js:1251 before its :1285 tail debit.

**Mechanism (popin-admission):** a packaged-body commit's compile (`prepareAuthoredVisualPipelines` — real GL program/texture span) plus the `waitForOpeningGraphPublicationRelease` gate can span several presents. That whole wait posts as one inflated paced debit in the mount frame, so `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` and every sibling paced lane that consults the wallet (glTF compile drain, census, residency pump, journal collect/publish legs, despawn drain) stands down for that frame. Admission work slips ≥1 present per packaged commit — directly delaying when the next on-stage content mounts.

**Fix sketch:** restamp `legStarted = legNow()` after the `await publicationWait` (and equivalently after the `:4390` prepare await) so the :4451 debit covers only the mount tail — mirror visualOverrides.js:1251.

**Effort:** S · **Impact:** M–H · **Risk:** L (pure accounting; no ordering or output change)

### 2. Place-commit freeze loop restamps before the await — between-presents wait charged per slice — partsLibrary.js:4234–4239

**Evidence:**
```js
const freezeIter = freezeStaticChildMatricesSteps(authored.root);
for (;;) {
  const freezeStep = freezeIter.next();
  notePacedFrameSpend(monotonicNow() - commitLegStarted); // :4236
  commitLegStarted = monotonicNow();                       // :4237 — restamp BEFORE await
  if (freezeStep.done) break;
  await waitForAuthoredAdmission(options.yieldToNextPresent(), options); // :4239
}
```
Iteration k's debit at :4236 charges slice k **plus** iteration k−1's inter-present `yieldToNextPresent()` wait (the restamp runs before the wait). The other two freeze-Steps call sites ride `driveLeg` (visualFactory.js:4378, visualOverrides.js:1183) which debits → awaits → restamps correctly; this loop hand-rolls the drive and inverts the order.

**Mechanism:** each 1024-stride freeze slice costs a whole present's wait on the ledger. For a large place record (~3k+ nodes → 3+ slices), ~50–100ms of pure waiting posts as ledger spend across the commit's frames — the shared wallet reads as permanently spent, so *all* other paced lanes (journal rebuild legs, census, warm builds, compile drains) stall for the freeze's duration. On the boundary this makes adjacent admissions mount later — pop-in stall by wallet starvation, not by real work.

**Fix sketch:** restamp after the wait — `debit → done-check → await → commitLegStarted = monotonicNow()` — the same shape `driveLeg` uses (debit at :4269, restamp at :4271 post-resume). One-line move.

**Effort:** S · **Impact:** M · **Risk:** L

### 3. Paced dispose drives mint one ledger stamp for a multi-present loop — whole-span wall time lands as a single debit; legs mint independently — partsLibrary.js:4297–4309 / 9380–9392

**Evidence:** both authored-commit dispose drives mint `commitLegStarted = monotonicNow()` once inside the `finally` (:4297, :9380 — the W88 fix, correct for the *first* yield), then loop `disposeIter.next()` with `await waitForAuthoredAdmission(options.yieldToNextPresent(), …)` per 128-visit stride (:4304, :9387) with **no per-resume restamp** — the single trailing `notePacedFrameSpend(monotonicNow() - commitLegStarted)` at :4309 / :9392 charges the entire loop duration including every inter-present wait. Separately, each leg's first `iter.next()` runs unconditionally at mint, and legs never consult `pacedFrameSpend()` — K concurrent authored-swap commits drive K slices per presented beat regardless of wallet state.

**Mechanism:** (i) a dispose spanning k presents posts ~(k−1)×16.7ms+real as one debit in its final frame — a phantom spike that stands down every wallet-checking lane that frame, and during an authored-swap burst these spikes repeat per leg; (ii) because legs mint independently and never gate on the ledger, a burst of commits stacks first-slices (≤128 nodes each) in the minting frame plus one slice per leg per present thereafter — the wallet records but does not throttle them. Both effects delay the lanes that feed on-stage mounts (compile drain, census, journal publish) — pop-in-adjacent.

**Fix sketch:** per-slice debit + post-resume restamp inside the drive loop (again the `driveLeg` shape); optionally skip the slice when `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` with an aging bound like `DESPAWN_DISPOSE_LEDGER_MAX_SKIPS` (renderer.js:1916–1932) so a forever-spent stretch can't starve GL reclaim.

**Effort:** S–M · **Impact:** M · **Risk:** L–M (touch only the two drive loops; the Steps iterators are unchanged)

### 4. Fallback re-collects the whole entityList synchronously on every tick-advanced present while the stepped collect leg is mid-flight — presentationPublisher.js:109 / presentationRunner.js:870–873

**Evidence:** `fallbackFromState` picks `sharedCollect` only when `presentationFrame.rebuildCollectedEntities` is set — the runner populates it *only after* `job.publishIter` exists, i.e., after `collectIter` completes (runner :870–873; publisher :105–109 comments acknowledge the gap: "a still-walking one falls back to the sync collect (a partial world would read as dropped entities)"). While a large world's collect leg is still pacing (budgeted `JOURNAL_REBUILD_COLLECT_MS = 4`ms/present, runner :724/:771–774), each tick-advanced present pays the full synchronous `aliveEntities(state)` walk (`collectJournalPresentationEntities` — whole entityList + dressing rows + disturbed-position sweep, publisher :13/:109) inside the presented frame. The same unbounded sync collect also covers every journal-invalid present without a stepped rebuild (range-gap/range-not-retained/apply-failure paths at :197/:221/:228/:243 — rarer, but same drain).

**Mechanism:** during the collect-leg window the fallback is the *only* thing mirroring live sim to the world (journal is invalid). On a dense sector (entityList ≈ several thousand + dressing), each suspended present pays a multi-ms synchronous collect — the exact drain the chunked twin exists to split — hitching the presents that immediately precede a rebuild commit, i.e., right when a burst of mounts is about to land. Player-visible: a hitch cluster during journal-loss recovery, precisely on the frames where spawns are being re-admitted.

**Fix sketch:** feed `updateFromEntities` a `retire:false`/`partial` mode driven by the in-flight collect's accumulating prefix — retained rows refresh each present, not-yet-collected ids simply hold last pose (strictly less churn than today; the retire sweep is what makes a partial sample dangerous, and it's exactly what the flag suppresses). Alternative: a dedicated paced fallback-collect lane duplicating the iterator — same result, more work. First option needs a one-flag variant of `updateFromEntities` (skip the `[...byId.keys()]` retire tail); no contract impact — the partial mirror is presentation-only and strictly fresher than the current alternative (sync collect, same data, worse timing).

**Effort:** M · **Impact:** M–H · **Risk:** M (new API surface on updateFromEntities; must never retire on a partial sample — the flag does that by construction)

### 5. Per-corpse `disposeObject` is atomic inside `drainDespawnDisposeQueue`'s deadline — renderer.js:1944–1951

**Evidence:** the drain bounds spend by `DESPAWN_DISPOSE_BUDGET_MS = 2`ms deadline + `DESPAWN_DISPOSE_DRAIN_MAX = 8` count + backlog-scaled `ceil(remaining/4)` limit (:1911–1942) — but the deadline is checked **between** corpses only: `if (m && m.parent == null) disposeObject(m)` at :1949 runs the full whole-subtree traverse+dispose (renderer.js:26512–26566: per-node material/geometry dispose, prepared-boundary hooks, motion detach, instance-pool release) atomically.

**Mechanism:** a kill-burst containing one fat corpse — a packaged ship or authored boundary hull (~1–3k nodes, dozens of materials) — overshoots the 2ms budget by that corpse's whole drain inside one presented beat. The ledger debit at :1953 records it after the fact; nothing suspends mid-corpse. This is the residual atomic unit inside an otherwise well-paced lane.

**Fix sketch:** hold a per-corpse `disposeDetachedObjectSteps` iterator (already exported, partsLibrary.js:15742, yields per 128 nodes) on the owner; drive it within the drain's deadline, suspending mid-corpse and resuming next drain. Dispose order within a corpse is already unordered (a stack walk); partial-tree disposal across presents is safe since the corpse is detached (`parent == null` guard already asserts that).

**Effort:** S–M · **Impact:** M · **Risk:** L–M (must keep the `parent == null` recheck semantics — a remounted corpse abandons its iterator)

### 6. `traverseDeferred && overCovered`: withhold minted but never applied — whole-subtree castShadow stays true until the queued arm — renderer.js:~24736–24789

**Evidence:** when the sync pass defers the traverse (`count >= SHADOW_ROOT_SYNC_PASS_CAP`, :24736–24737) while `overCovered` is set, the code mints `syncOpts.allowCast = false` bookkeeping/withhold state but skips the traverse that would apply `castShadow = false` to the subtree's meshes. The withheld-caster map entry is recorded, yet the meshes' live `castShadow` flags remain stale-true until the queued `_armDepthStage`'s own collect + withhold legs run — which is bounded but a present or more later.

**Mechanism:** an unstaged subtree's casters can present one refresh with stale `castShadow = true` — they draw into the depth pass and can trigger an inline depth-variant link on a program not yet staged (the cold-link class W88's unconditional withhold tails were meant to close). Rare conjunction (deferred pass ∧ over-cover) but real.

**Fix sketch:** when `traverseDeferred && overCovered`, either (i) mint the withheld set from the over-cover boundary itself (the meshes the sync already visited/enumerated for the cap decision) — cheap, bounded by the same collect — or (ii) flag the root `castShadow = false` at the root level for the deferral window and let the arm restore it (root-level flip is O(1) and hides the subtree from the shadow pass wholesale; restore on arm via the existing `syncShadowCasterPolicy` restore path).

**Effort:** S · **Impact:** L–M · **Risk:** M (option ii changes draw eligibility for the window — conservative but must be reversible in the same bookkeeping)

### 7. `updateFromEntities` residual: unconditional retire sweep + `seen` Set alloc per suspended present — presentationWorld.js:834–868

**Evidence:** per call: `new Set()` with N adds (:834–841), N `byId.get` (:845), 3 stamp writes per retained row (:854–858), and — always — `[...byId.keys()]` snapshot + N `seen.has` lookups (:864–867). The per-row unchanged short-circuit already exists (`PRESENTATION_WORLD_UNCHANGED_REFRESH_SKIP`, :748–778): 16-field compare (x/y/z, prevX/Y/Z, rot/bank/pitch, prevRot/Bank/Pitch, typeCode, flags, radius) gated on `entityRefs[slot] === entity` — the compare-then-write is already minimal; nothing else to squeeze there without touching the visualRevisions contract (the stamp at :857–860 must still run so `nextVisual !== previousVisual` → VISUAL dirty is observed even for identical-pose rows).

**Mechanism:** inside a multi-present suspension the retire sweep allocates an N-array and re-walks N ids even when every live row was re-seen — the dominant residual is two N-sized structures per suspended present, not the row compares.

**Fix sketch:** count retained hits in the entity loop; if `hits === byId.size`, skip the snapshot+sweep entirely (every key was seen → nothing to retire). Keeps the dedupe contract, drops the second N-alloc + N-walk on the common all-retained path.

**Effort:** S · **Impact:** L–M · **Risk:** L

### 8. Nit — `settleRebuildBridges` tail rotation re-visits rotated rows within one capped pass — renderer.js:2051–2057

**Evidence:** the cap is 32/pass (:2034–2037) and unreleased rows rotate `bridges.delete(id); bridges.set(id, slot)` — Map insertion order appends, so the same iterator later reaches the rotated entry again *within the same pass*; small all-unreleased maps burn the 32-visit cap on re-evaluations of the same rows and inflate `slot.frames` up to ~3×.

**Mechanism:** pure bookkeeping inflation — release timing unchanged; on all-parked maps the cap is spent re-checking rows it already parked this pass.

**Fix sketch:** record the iteration's start keys (or a `visitedThisPass` mark) and break when a rotated id is re-encountered.

**Effort:** S · **Impact:** L · **Risk:** L

## Lane-hunt dispositions (a)–(e)

- **(a) diff-apply residual cost:** enumerated — the per-row unchanged short-circuit already exists (presentationWorld.js:748–778, 16 scalars + typeCode + flags + radius under `entityRefs[slot] === entity`). Largest remaining compare surface is the 12-scalar pose chain + `presentationFlags`/`typeCode`/`radius`; the write path `writeEntityPose` + `refreshMetadata` runs only on actual change. The visualRevisions stamp (:857–860) must keep running on retained rows (it detects `presentationVisualRevision` changes → VISUAL dirty) — cannot be skipped under the contract. Residual = finding 7 (retire sweep + Set alloc). Latent nit worth noting: `updateFromEntities` skips `entityId === 0` (:838) where `rebuildFromEntities` would throw via `allocateRecord` (:569) — tolerant, divergent behavior; and `allocateEntity` keys `byId` on `entity.id` (:614) while lookups key on `sourceEntityId` which *prefers* `entity.entityId` (:74–80) — a row carrying a differing `entityId` field would miss every lookup and then throw `already active` on re-alloc; today no collected row mints a differing pair (all `entityId:` producers alias `entity.id`).
- **(b) new-id allocates inside a suspended window:** closed — by design. A mid-window spawn's write is suppressed under `rebuildInProgress` → `rebuildInvalidatedDuringSteps` → stepped attempt discards and re-collects (journal :566–575, :614–635; runner :781–799); meanwhile the fallback's diff mounts the spawn promptly (allocateEntity → DIRTY.ALL — earlier than the old clear+realloc ever showed it). At commit, `world.clear()` (publisher :205) + SPAWN replay re-claims slots and `_bindPublishedPresentationMeshes` (renderer.js:20703–20713) rebinds inside the same `consume` — no presented gap; the mesh object itself never leaves the scene. Slot identity is presentation-internal. Mount order sound.
- **(c) ledger-debit residual:** enumerated all 88 `notePacedFrameSpend` call sites across 7 files (renderer 60, partsLibrary 12, visualFactory 5, visualOverrides 4, eventBus 3, sectorEnterDefer 2, decodeTaskBudget 2). Await-adjacent sites examined individually; the correct shape is `debit → await → restamp` (e.g. `driveLeg` visualFactory:4269–4271; eventBus drains and pump loops are sync). Two residual sites — findings 1 and 2 — plus the dispose-loop span at finding 3.
- **(d) synchronous whole-entityList drains in presented frames:** finding 4 (fallback sync collect per suspended present). `clearAllMeshes` (renderer.js:20716–20745) is a whole-scene sync teardown but has no live call sites inside presented frames (sector change reconciles via `reconcileMeshes`/`_reconcileMeshesSteps`, :2151/:2509). `collectJournalPresentationEntities` at runner :747 is the doom-loop escalation tail — bounded to `JOURNAL_REBUILD_INVALIDATED_MAX = 3` failed attempts (:795/:833).
- **(e) paced dispose drives:** despawn path is genuinely paced (`drainDespawnDisposeQueue`, :1918–1959 — 2ms budget, 8/drain floor, backlog-scaled, 2-frame ledger skip). Residuals: authored-commit dispose legs mint independently and never consult the wallet (finding 3); per-corpse dispose is atomic inside the drain's deadline (finding 5).

## Regression notes — W88 (`780d91fbf`) verification

All 12 items verified concretely against the checked-out tree; none regress.

1. **updateFromEntities diff-apply** — presentationWorld.js:831–870 + publisher.js:114–117. (a) `seen`-Set dedupe counts `duplicateIdRejects` (:839–842) ✓; (b) retained rows via `byId.get` + `refreshVisibleEntity` (:847–853) with the 16-field unchanged-skip (:748–778) ✓; (c) `sourceGenerations`/`revisions`/`visualRevisions` stamps at :854–861, VISUAL mark only on revision change ✓; (d) retire via `[...byId.keys()]` snapshot honoring mid-iteration `byId` mutation (:864–867) ✓; (e) `diagnostics.rebuilds++` (:868) ✓; (f) publisher routes `world.updateFromEntities(sample)` with `rebuildFromEntities` fallback (:114–117), `generationForEntity` absent → stamps 0, matching `rebuildFromEntities`' mint ✓.
2. **commitLegStarted inside finally** — partsLibrary.js:4292–4297 / 9375–9380. (a) restamp runs inside `finally` after `await waitForAuthoredAdmission(yieldToNextPresent())`, never before an await ✓; (b) the between-presents hold is off the ledger ✓; (c) paced dispose drives run after the restamp — but see finding 3 for the residual.
3. **bindAuthoredMotion stepped** — contracts/motionBank.js:601–617 collect yields per 512 visited; `bindAuthoredMotionSteps` :641–645 delegates collect to the Steps twin then runs the shared `finishAuthoredMotionBind` tail (:647+, identical to sync :631–635); authoredMotion.js:1020–1022 `bindInstanceMotionSteps` delegates ✓.
4. **mintResidentReattachSweep** — renderer.js:1793–1799 `.return()` closes an in-flight sweep before remint; reattachResidentGpuMeshesSteps :1806–1888 yields per 64 scanned; all 4 call sites route through the sweep ✓.
5. **_armDepthStage unconditional deferred drive** — renderer.js:25027–25054. (a) no `session.slice`/`createShadowDepthStagingSession` on the path — always `driveCompileShadowDepthPipelines({stagingName:'SF_ShadowPromoteDepthAdmission'})` ✓; (b) `legDeferred = true` (:25035) + `deferredMark` populated (:25036–25042) ✓; (c) `.catch` warn-only (:25055–57), `.finally` cleans deferredRoots (:25057–63) ✓; (d) the arm's direct `syncShadowCasterPolicy` restore is bounded by `SHADOW_DEPTH_ARM_RESTORE_MS` deadline (:25094, checked :25225) with leftover requeue into `pending` → re-arm (:25234–25255) ✓.
6. **SHADOW_ROOT_SYNC_PASS_CAP** — :6642 constants; `_shadowRootSyncPassCount` resets with `_depthCollectPassSeq` (:24643–24647); `traverseDeferred` counts only unscoped traverses (:24736–24737); withheldMeshes/overCovered tails run unconditionally (:24752–24789) ✓. Residual: finding 6.
7. **settleRebuildBridges cap+rotation** — :2034–2037 cap 32; unreleased tail rotation :2051–2057; `releaseRebuildBridge` identical on release (:2059–2060); `REBUILD_BRIDGE_MAX_SYNCS = 300` (:2001) ✓. Nit: finding 8.
8. **freezeStaticTransformRootMarked** — staticChildMatrices.js:130–145. (a) O(degree): reads only direct-children `sfMatrixFrozen` (:134–139) ✓; (b) `matrixAutoUpdate = false` + `updateMatrix()` + `remarkStaticMatrixAncestors` (:132–144) identical to the original ✓; (c) original `freezeStaticTransformRoot` still exported (:118) ✓; (d) all three call sites (partsLibrary.js:3744, :3906, :4246) run immediately after a `freezeStaticChildMatrices[Steps]` pass on the same root — the children's stamps are current at call time, satisfying the marked-variant contract ✓.
9. **Registry side indexes (5)** — shipMicroMotion `mountIndex` :420/:1135–1136, `releaseMesh[Set]` :2294–2305 resolve O(1)/O(pending), `clearRecordMeshRefs` deletes before nulling (:2273–2275) ✓; asteroidMotionPresentation `boundaryIndex` :281, stamp per update :488–491, `dropBoundaryIndex` before null :477–480, prune drops before delete (:723–724) ✓; infrastructureMotion `boundaryIndex` :168, `noteBoundaryRoot` on every update's mesh root (:299/:370/:520), `releaseMesh[Set]` via index :576–586, prune drop-before-delete (:594–595) ✓; forgeRegentCrown `boundIndex` :180, `detachCrown` deletes before null (:185), re-stamp on `boundMesh !== mesh` (:220), prune via `detachCrown` ✓; lawArenaDressing `boundIndex` :842, `detachBoss` deletes before null (:1016), re-stamp (:1058), prune via `disposeBoss → detachBoss` (:1124–1131) ✓. `nodeInsideTree`/`nodeInsideAnyOf` gone from src/ — dead code removed ✓.
10. **Non-throw packaged-exit disposes** — visualOverrides.js: (a) `disposeDetachedPackagedGroup(packaged)` on `!packaged.children.length` (:1166), `prepareAuthoredVisualPipelines` catch (:1200), and both `!root.parent` exits (:1224, :1235) ✓; (b) the serialized-upgrade `.finally` tail (releaseSerialSlotAfterPipelineStaging / lifecycle settle at partsLibrary.js:7517–7527) unchanged — no `.finally` exists in visualOverrides.js; the prompt's `afterBrowserPaint`/`carveout`/`pendingCurrentSlot` identifiers are shorthand for that scheduling tail, which is intact; (c) `detachedCommitGroup` hoist at :1113 backs the `.catch` belt at :1288–1290 ✓.
11. **Reattach feed versions** — renderer.js:2091–2103: entityIndex.version (flag-guarded, `.size` fallback), asteroidField.version, dressing.version, farActors.version (both `.byId.size` fallback), sessionEntityIdRemap.size, enterSerial, entityList.length — a count-equal member swap on a versioned table mints a stamp; unversioned tables fall back to count ✓.
12. **upgradeMintPass rejection swallow** — renderer.js:17182 `.catch(() => {})` on the floating chunked IIFE (per-32 `await yieldToBrowser()` at :17167–17182) ✓.

## Adjacency to prior adjudication

- `PRESENTATION_WORLD_UNCHANGED_REFRESH_SKIP` (default-on) already implements the per-row 'unchanged' short-circuit this lane was asked to evaluate — residual is the *call-level* alloc/sweep (finding 7), not the row compares.
- Findings 1–3 are fresh instances of the W88 ledger-debit class (restamp-inside-finally fixed the *entry* wait at :4297/:9380; the *loop* waits at :4234–4239 and inside the dispose drives were not in that diff).
- Deliberately-atomic items from the adjudication log (merged residency prepareBatch burst, shadow-depth private render, `vf.build` single-row units, urgent whole-batch compile) not re-reported.
