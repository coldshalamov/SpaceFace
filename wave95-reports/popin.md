# Wave 95 audit — popin-admission lane

- Repo: `coldshalamov/SpaceFace`
- Audited HEAD: `332e07670` on `devin/1791064509-perf-w60` (W94 landed as `ed45878d0`)
- Contract: real models only on the visible frame; nothing pops late; no hitching; no frozen loading screens; only the visible frame's needs get heavy work — everything else stays lightweight sim.

**saturated: false**

## W94 regression verification

All ten pins land as described; no regressions found.

1. **Spent-wallet mint gate** — renderer.js:25069-25083. `if (!hadParkedWalk && policyNow() >= policyDeadlineAt)` parks the unpaid walk; the paid branch calls `driveShadowPolicySteps` + `notePacedFrameSpend`. `receiverOut` minted `{receiverDelta:0}` before the gate so the withheld accounting below still runs.
2. **Verdict cap traversal** — renderer.js:25047-25061. `traverseDeferred = !scopedSync && !skipTraverseOnDrift && !hadParkedWalk && !needsAtomicOut && _shadowRootSyncPassCount >= SHADOW_ROOT_SYNC_PASS_CAP`; `_shadowRootSyncPassCount` increments on every non-deferred traverse; per-pass reset at :24936-24944 with `_policyPassDeadlineAt = now + SHADOW_POLICY_PASS_MS`.
3. **`needsAtomicOut`** — renderer.js:25051 (`!!(extra && extra.preCountRoot)`, hoisted above the wallet gate) + the producer `onAuthoredAssetSwap` at :9256-9268 passing `{ preCountRoot: root }` into `_syncShadowCasterPolicyChecked`.
4. **Env drain done-head** — renderer.js:26988-27006. `drainSceneEnvRebindQueue` disposes the completed head, then falls through to `if (now() >= deadline || pacedFrameSpend() >= PACED_FRAME_BUDGET_MS) break;`; `notePacedFrameSpend(elapsed)` after the loop.
5. **lightSig piggyback** — renderer.js:24828-24844 (`parked` + `parkedRecheck` decremented before the release chain; re-arm `96 + stamp%32`), :24863 (lightSig clause gated on parkedRecheck), :24865 oqX else-if, :24890 keep-verdict re-key `parkedEntry.lightSig = this._shadowCensusForFrame()`.
6. **Drift-aborted shapes** — renderer.js:529-558 (`driveCompileShadowDepthPipelines`: retry keys `step.value.stale===true`, 4 attempts, exhaustion `{skipped:true, reason:'light-census-drifted-repeatedly', subjects:0, aborted:true}`); :15565-15608 (`driveDepthCompile`: `stale || reason==='session-closed-mid-drive'`, `lastRetryResult` preserved on session-closed, aborted:true shape otherwise); :25485 `legAborted` gates the denied-park block.
7. **Unbucketed pacing** — renderer.js:14429 `paceCookStretch` async; :14489-14495 unbucketed cook roots `await paceCookStretch()` per root; :15397-15404 `subjectsForCompileRoots` async rescan fallback `await postPace()` per root; awaited by callers at :15525/:15666.
8. **`isUnstagedCollectOverCover`** — shadowDepthAdmission.js:367-373 sentinel const + export; consumers at renderer.js:10681, :15619, :15695, :24964, :25369, :25720; test pin test/shadow-depth-admission.test.mjs:663-673 asserts true on both producers' sentinels, false on array returns.
9. **`_policyStepsParked` sweep** — renderer.js:25212-25233 `_sweepDetachedDepthStageRoots`: both branches delete the root on `!root || !root.parent`; third reap at :25576.
10. **Row-resident doom** — presentationWorld.js:964-1000 (hiddenIds leg :975-976 `resident && resident.alive !== false → continue`, else `world.doomed[slot]=1; world.visible[slot]=0; wasVisible → markDirtyBits(VISIBILITY)`; skippedIds leg identical minus the resident check); dense sweep :1005-1021 dooms `_noMesh`/verdict-skip residents; consumer presentationQueries.js:128-140 (`doomed===1 → false` before all bypasses); publisher retirement at :130-135.

## Enumerated residuals (brief items a–d)

**(a) hiddenIds resident liveness check — direction of failure:** under-dooms only; no reachable over-doom. `world.entityRefs[slot]` is written by `refreshMetadata` (presentationWorld.js:511), which runs on every feed push via `refreshVisibleEntity` (called at :938) and at `bindMesh` (:783) — it tracks the last *pushed* sim object, not the bound mesh's owner. A dead or absent resident (`null` or `alive===false`) dooms the row, which is correct: all canonical destroys flag `alive=false` before `entities.delete` (coreSystem.js:347, :389; industrialBeam.js:254-256). If a respawn is pushed later the feed stamp clears `doomed` (:936/:943) and `bindMesh` re-admits — any false doom is transient and self-healing. The under-doom direction is a real defect → finding 2.

**(b) skippedIds unconditional doom — transient eligibility:** safe within the call. `updateFromEntities` is synchronous between the skip mint (:913-918) and the doom leg (:988-996); nothing can rebind `entityRefs` mid-call, and a same-feed push of the skipped id stamps `lastSeenSeq=seq` which gates the leg anyway. The cross-feed residual is verdict staleness: `projectileSkipsVisualFactoryMesh` memoizes per `entity.data` object (recipes.js:757-773) and the renderer latch `_noMeshByRenderer` clears only at `clearRendererMeshLatches` on a new world context (:1025). A projectile whose `data.weaponId` is mutated **in place** on the same data object keeps the stale `ENERGY_CARD` verdict → skipped every feed → its real mesh dooms each feed → flicker across binds. No producer found mutating `weaponId` in place (data records are minted per fire); documented residual, no fix proposed.

**(c) dense sweep blind spots:** intentional division of labor. The sweep (:1005-1021) skips `!resident || resident.alive===false` because dead-resident rows are exclusively the hiddenIds leg's domain. The actual coverage gap is tombstone *mint* scope: `suppressedDestroyIds` is populated only while `rebuildRequired` and only for records suppressed during collect (presentationJournal.js:182, :270); it is cleared at collect start (presentationRunner.js:762) and at collect completion (:803), and the frame only receives it while `!steppedJournalRebuild.publishIter` (:890). So destroys landing post-collect/pre-commit rely on the publish retire — by design. Non-canonical unflagged drops exist only in the survivorPod test harness; canonical producers all flag `alive=false`. Documented residual; the remaining exposure is the collision-abort class → finding 1.

**(d) same-feed respawn `lastSeenSeq!==seq` gate:** clean. The respawn's own push stamps `lastSeenSeq=seq` and `doomed=0` (:935-943) before either doom leg runs, so both legs and the dense sweep skip it. Enumeration of every `world.doomed[slot] = 1` site — :981 (hiddenIds), :995 (skippedIds), :1018 (sweep) — all sit behind `lastSeenSeq !== seq`. No other minter exists. The residual on that row is the inherited stale `meshRefs` under finding 2.

## Findings (ranked)

### 1. Suppressed-destroy × collected-id collision aborts the whole stepped journal collect; three aborts escalate to a synchronous whole-set rebuild inside a presented frame

**Evidence:** src/core/presentationRunner.js:783-802 (collect-done check: any `suppressedDestroys` id in `collectedIds` → `steppedJournalRebuild = null`, `++journalRebuildInvalidations >= JOURNAL_REBUILD_INVALIDATED_MAX` → `syncJournalRebuildEscalation`), :725-727 (`JOURNAL_REBUILD_INVALIDATED_MAX = 3`; counter resets only on `requestJournalRebuild` at :739), :743-754 (`syncJournalRebuildEscalation` = `collectJournalPresentationEntities(state)` — the **non-chunked** whole-map collect — followed by `presentationJournal.rebuildFrom(entities, tick)`, all inside the presented frame). A second abort site fires on publish result `'invalidated'` at :835-836.

**Mechanism:** `suppressedDestroyIds` accumulates every destroy suppressed during the paced collect window (journal :270). `state.freeIds` recycles ids LIFO (`_removeEntityAtIndex`, coreSystem.js:343-372), so in combat a destroyed id is routinely re-spawned inside the same window — and the respawn is live in `state.entities`, so it lands in `collectOut`. One tombstoned id colliding with the collect aborts the whole stepped rebuild: all paced collect work is discarded, `needsRebuild` stays set, and the next present re-collects from scratch against a state that is still churning. Three collisions inside one rebuild episode run the atomic `collectJournalPresentationEntities` + `rebuildFrom` on the presented frame — exactly the frozen-frame brick the stepped machinery was built to eliminate (the in-code comment at :785-791 names this escalation as the motivating defect). The collision is order-dependent, not rare-event-dependent: each collect window only needs one destroy-then-recycle among thousands of entities, repeated across episodes in a long fight.

**Fix sketch:** stop treating collect-collision as collect-fatal. The collect is already authoritative live state for the collided id — publish the row normally (respawn data, correct pose) and reconcile the *record stream* surgically: replay the suppressed spawn/destroy records for colliding ids immediately after publish commit (the journal knows exactly which records were suppressed; they can be re-emitted against the new generation), or mark the collided rows doomed + force their own spawn record into the next consume so slot state stays consistent without discarding the collect. Keeps the zombie guarantee (no spawn commits without a replayed record) while removing the abort → churn → escalation chain. Requires care that replay order respects destroy→spawn sequencing per id.

**Effort:** M. **Magic-frame impact:** H (the escalation is the largest single presented-frame synchronous walk in the journal path; reached precisely under sustained combat churn, the bar's worst case). **Risk:** M — journal record-stream semantics; a botched replay resurrects zombies, so the fix needs the suppressed-record list and a focused test on destroy→recycle→respawn inside one collect window.

### 2. hiddenIds resident check under-dooms a pushed-but-unbound respawn: the corpse's bound mesh keeps drawing on the row

**Evidence:** src/render/presentationWorld.js:975-976 (`const resident = world.entityRefs[slot]; if (resident && resident.alive !== false) continue;`), :511 (`refreshMetadata` writes `entityRefs[slot] = entity`), :801-836 (`refreshVisibleEntity` calls `refreshMetadata` on every feed push — invoked at :938), :929-943 (retained branch: respawn reuses the corpse's slot, inherits `meshRefs`).

**Mechanism:** the skip assumes a live `entityRefs` entry means the row's *bound mesh* belongs to a real occupant (the :967 comment). But `entityRefs` is refreshed by any push, bound or not. Sequence: entity destroyed mid-collect → tombstone in `suppressedDestroyIds`, slot's corpse mesh still bound (`meshRefs` intact — the presentation-tier `entity:destroyed` emit drains sliced, so `unbindMesh` lags); id recycled into a respawn pushed in an earlier feed → `entityRefs` = the live respawn → doom leg's `alive !== false` skip fires → the corpse's mesh keeps drawing for the whole window until either the respawn's own `bindMesh` (frame-serial authored-upgrade lane — can be hundreds of frames) or the lagged unbind lands. Reachable producers: `freeIds` LIFO recycling + any in-window respawn whose bind is queued behind the emit/admission backlog — routine in dense fights.

**Fix sketch:** key the skip on the *bound owner*, not the last pusher: add `world.boundEntityRefs[slot]` written in `bindMesh` beside `meshRefs` (cleared at `unbindMesh`/retire/alloc), and skip only when `resident === boundEntityRefs[slot] && resident.alive !== false`. A pushed-but-unbound respawn then dooms (corpse hides immediately); a genuinely bound respawn still skips (W94's flicker fix preserved); the respawn's own bind clears doom and re-admits.

**Effort:** S. **Magic-frame impact:** M (dead-body model persists on-stage — a stale-visible defect in the exact class doom machinery exists to hide). **Risk:** M — must key on the bind owner exactly; keying on any pushed object re-opens the under-doom, and keying on anything broader re-opens W94's over-doom flicker.

### 3. `cookLiveSceneGpu` opening-compile cohort collect is atomic: whole-cohort `flatMap(collectCompileSubjects)` with zero pacing

**Evidence:** src/render/renderer.js:13920 (`lateRoots.flatMap((root) => collectCompileSubjects(root))` inside `uniqueAdmissionUnits`), :13904 (`firstFlightRoots.flatMap(collectCompileSubjects)` for `shadowSensitiveLeftovers` in the `holdLeftoverFx` non-warm shape), compilePresentSlice.js:6-17 (`collectCompileSubjects` = atomic `root.traverse`), :13654 (`state.render.cookLiveSceneGpu` enclosing function). `lateRoots` = openingRoots + firstFlightRoots + preparedRoots + `collectLateAdmittedCompileRoots` + `collectInstancePoolCompileRoots` (:13880-13884) — effectively the whole sector cohort.

**Mechanism:** the admit that consumes `units` is sliced, but building the cohort costs one atomic `Object3D.traverse` per root — sum ≈ a whole-scene mesh-node walk (~tens of thousands of nodes plus the intermediate subject arrays) in a single synchronous leg inside the cook. This is the same gap shape W94 closed for the seal preamble and the pool-bucketed collects (:14489-14495 `paceCookStretch`, :15397-15404 `postPace` per unbucketed root) — the comments at :13045 describe the parallel seal preamble as "the largest unyielded block" before it was paced. Worst case stalls a shell beat / delays veil lift; the `holdLeftoverFx` non-warm variant runs flight-adjacent.

**Fix sketch:** pace the collect per root — `await` a paced yield between roots in a plain for-of (same pattern as :15404), or reuse the per-root census bucketing the later cook leg already builds (`perRootSubjects` at :14489) so only census-missed roots traverse at all.

**Effort:** S–M. **Magic-frame impact:** M (atomic block on the sector-enter path; mostly behind the shell but it delays the veil lift and the hold variants touch presented flight). **Risk:** L — collect order is list order, pacing preserves it.

### 4. `disposeBoundaryObject` still runs the sync whole-subtree `disposeObject` on live-context teardown

**Evidence:** src/render/renderer.js:10401-10407 (`disposeBoundaryObject` → `return disposeObject(boundary)` — explicitly reserved for live-context teardown), :27114 (`disposeObject` = atomic `obj.traverse(c => disposeObjectNode(c))` — every node gets GL teardown synchronously), vs stepped twin `disposeObjectSteps` :27127 used only at :1993/:20883. Boundary teardown is reachable on presented frames (authored-boundary swap / sector-leave teardown via :8059 `options.disposeBoundaryObject`).

**Mechanism:** a fat authored boundary subtree (place/station dressing — thousands of nodes, each with geometry/material/texture release) tears down in one synchronous walk inside a presented frame. The stepped twin exists and preserves order; this site (and the other live-reachable sync callers — :23061 hazard visuals, the mesh-clear loops where they aren't inside the already-paced sweeps) just never adopted it.

**Fix sketch:** route the boundary-dispose path through `disposeObjectSteps` under the paced drain the same way the despawn queue does, preserving the `disposeObjectNode` hook grammar. Where a synchronous contract is required (caller needs `true` returned), drive the iterator to completion under a deadline and fall back to the sync call only past it.

**Effort:** M. **Magic-frame impact:** M (single-call subtree teardown on a presented frame — a hitch of the exact class W89's corpse-drain machinery bounds elsewhere). **Risk:** M — teardown ordering and installed per-node hooks must behave identically across yields.

### 5. Seal-subject fallback collects still run without `await sealPace()`

**Evidence:** src/render/renderer.js:13113-13126 — inside the paced `for (const root of latePoolRoots)` loop, `bucket === undefined` falls back to `sealSubjects.push(...collectCompileSubjects(root))` with no `await sealPace()`; the `sealCensus.subjects === null` branch (:13124-13126) flatMaps **all** `latePoolRoots` unpaced.

**Mechanism:** mirror image of the gaps W94 closed at :14495 and :15404 — the bucketed branch is paced per root, the fallback branches are not. `sealSliceArmed = state.mode === 'flight'` means in-flight reachability is designed-in; unbucketed roots are census-missed/detached roots (rare, but each pays an atomic subtree traverse), and the null-census branch is a defensive fallback for missing `collectInstancePoolCompileRootsAndSubjectsSteps`.

**Fix sketch:** `await sealPace()` before each unbucketed `collectCompileSubjects(root)`; for the null-census branch, run the same paced per-root loop with an empty `perRootSubjects` so every root takes the fallback path under the budget.

**Effort:** S. **Magic-frame impact:** L (rare trigger — only census-missed roots pay; but the unbudgeted shape is identical to what W94 fixed). **Risk:** L.

### 6. `_shadowReceiversDirty` fallback still pays a whole-scene recount inside a presented frame

**Evidence:** src/render/renderer.js:25886 (`this.scene.traverse((o) => { if (o && o.receiveShadow) receivers++; })` gated on `_shadowReceiversDirty`).

**Mechanism:** when the incremental receiver tally can't settle (any unaccounted `receiveShadow` flip), the next presented frame walks the entire scene graph (~21k nodes by the updateMatrixWorld comment's own census) just to recount. Rare, but it is an unbounded sync walk on the presented path.

**Fix sketch:** amortize the recount through a steps twin across presents (the flag can carry a cursor — the tally is only consumed by the shadow-band gate), or extend incremental-tally coverage so the flag can't fire.

**Effort:** M. **Magic-frame impact:** L (rare flag; when it fires it's a whole-scene walk). **Risk:** M — tally bookkeeping is subtle; a broadened increment could corrupt the band gate.

### 7. (e) remainder — enumerated and closed

`updateMatrixWorld` sync call sites are all targeted single-root/light/camera walks or already on `updateMatrixWorldSteps` (:23375, :23406); `getPooledNavLightSources` (:7021) and the socket find (:26105) are memoized per root; `collectNeverLinkedSceneRoots` sync version (:8186) appears superseded by its Steps twin (:8218, called at :13449). The mass mesh-dispose sweeps at :12601/:15129 are paced (8 ms slices + `pacedFrameSpend` ledger + `cookStale`). Nothing else un-budgeted on the popin path exceeds the findings above.
