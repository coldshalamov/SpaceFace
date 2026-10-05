# Wave 96 audit — popin-admission lane

Audited `devin/1791064509-perf-w60` at `4f6df8366` (waves 1–69 on master at `9431f548f`; W60–W95 on PR #220). Contract: zero visible quality degradation; optimize algorithms/allocation/batching/cadence/culling/residency/frame pacing only; sim determinism bit-identical. Lane: fresh residuals after W95's boundEntityRefs doom keying, live-row-only collect-abort narrow, and paced disposeBoundaryObject.

## saturated: false

A legal contract-preserving fix remains with a concrete implementation path: `dropDressingRow`/`dropDressingSector` never stamp `alive = false`, so a dressing row dropped during a suspended journal collect commits as a zombie spawn — removed content pops IN after its removal (F1, one-line-each fix).

## Findings (ranked)

### F1 — Dressing rows dropped mid-collect commit as zombie spawns; removed content pops back in

**Evidence**
- `src/world/dressingTable.js:105-116` — `dropDressingRow` splices the row out of `rows`, `byId.delete`s it, calls `clearEntityRuntime` — never sets `row.alive = false`, never emits `recordDestroy`.
- `src/world/dressingTable.js:119-135` — `dropDressingSector` is the same shape for every dropped sector row.
- `src/core/entity.js:127-137` — `clearEntityRuntime` clears only `mesh`/`view`; `alive` survives.
- `src/world/presentationSources.js:122-130` — `collectJournalPresentationEntitiesChunked` snapshots `dressing.rows.slice()` at mint; `pushAlive` filters only `row.alive === false`.
- `src/world/presentationSources.js:149-161` — the disturbed-position sweep is add-only; it cannot un-push a snapshot row that left the live table.
- `src/core/presentationJournal.js:596-610` — `rebuildFromSteps`' publish loop skips only `entity.alive === false`; a never-flipped dropped row publishes a real spawn into the committed journal.
- `src/systems/automation.js:1306-1310` — existing comment acknowledges the same phantom shape ("dropDressingRow splices + byId.delete but never stamps alive").
- Drop callers: heist scene teardown `src/systems/heistFacilities.js:903,909,990,996`; outpost release `src/systems/automation.js:1390,1409`; sector prop sweep `src/systems/world.js:1659,2181` — all legal mid-flight.

**Mechanism** — A stepped journal rebuild's collect suspends across presents; a dressing row dropped inside that window stays `alive:true` in the collect snapshot. It lands in `collectOut`, `journalEntities`, and `sourceIds`; at commit, `publishSpawn`'s only dead-filter is `alive === false`, which never fires. The world mirror allocates a slot, the spawn admission builds and mounts the landmark/outpost/heist-prop mesh — the player watches removed content pop IN after it was dropped. It then sits at last pose until the next `_meshes` reconcile resolves the row dead (`resolveWorldPresentationEntity` → null → dead-class evict, `renderer.js:21452-21480`), and the world slot leaks unbound until the next full rebuild. Because drops also mint no `recordDestroy`, `suppressedDestroyIds`/`hiddenIds` never name the id — the collect-abort narrow's doom machinery cannot see it.

**Fix sketch** — `row.alive = false` before splice in `dropDressingRow` and in `dropDressingSector`'s loop (one line each). Every downstream gate already keys on the flag — `pushAlive` (visit-time), `forEachDressingRow` (:153), `publishSpawn` (publish-time), the doom leg's `resident.alive` — so stale snapshot/prefix refs skip uniformly and the publish loop drops the spawn even if the row was collected earlier in the window. Optionally mint a suppressed-safe `recordDestroy` for dressing drops to retire the world row immediately — not required to close the visual bug.

**Effort** S · **Magic-frame impact** H — a dead landmark/outpost visibly popping into the frame after removal is the purest popin failure this lane exists to kill. · **Risk** low: flag write only; rows are already out of the table; every consumer honors `alive === false` today.

### F2 — Fallback feed `updateFromEntities` is a full unyielded whole-sample walk per completed tick during rebuild suspension

**Evidence**
- `src/render/presentationPublisher.js:107-141` — `fallbackFromState` calls `world.updateFromEntities(sample, …)` synchronously whenever `completedTickCount > 0` or the lifecycle generation changed, i.e. once per sim tick inside presented frames while a stepped rebuild holds `needsRebuild`.
- `src/render/presentationWorld.js:895-1056` — `updateFromEntities` iterates the whole sample (push rows, refreshMetadata, dirty marks) plus the absent-retire sweep plus the retireSuppressed sweep — all synchronous, no chunking.

**Mechanism** — The stepped collect paces itself across presents precisely in the dense sectors where the row count is worst; each tick that lands inside that window pays one O(sample + world rows) synchronous diff-apply in the presented frame. Multi-thousand-row sectors turn every tick in the rebuild window into a multi-ms unyielded block — a hitching residency tax at exactly the moment the frame budget is thinnest.

**Fix sketch** — Steps twin for `updateFromEntities` (or an index-resumable chunked pass) yielding per N rows like the collect does; retire sweep must run only after the push pass completes (or carry an in-flight "do not retire" prefix flag the same way `collectPrefix` suppresses it today).

**Effort** M · **Impact** M · **Risk** medium — ordering of push/retire/mark phases must be preserved across slices; the hiddenIds semantics are subtle.

### F3 — `_shadowCensusForFrame` mints one unyielded whole-scene traverse inside a presented frame

**Evidence** — `src/render/renderer.js:25326-25347`: the epoch latches per `_viewSyncSeq`, but a memo miss runs `lightCensusSignature(scene)` (`src/render/shadowDepthAdmission.js:401`) — a full scene traverse — synchronously inside the pass.

**Mechanism** — While withheld or parked depth-stage roots evaluate, every presented frame pays one whole-scene traverse. All sibling censuses grew Steps twins this wave; this is the last un-budgeted whole-scene walk on the presented-frame popin path. Its cost scales with live scene node count, not with work needed.

**Fix sketch** — `lightCensusSignatureSteps` resumable across presents (count-map carries across yields), or reuse the chunked pool census's rendered-light terms where coverage permits; keep the per-`_viewSyncSeq` epoch latch identical.

**Effort** M · **Impact** M/L · **Risk** low-mid — signature string must be byte-identical or staged marks churn.

### F4 — Paced `disposeBoundaryObject` keeps driving the generic teardown through a mid-iterator context loss

**Evidence** — `src/render/renderer.js:10415-10438`: the dead-context guards (`!rendererGenerationIsActive() || this._contextLost === true || recordContextGeneration !== currentContextGeneration()`) run only at entry. Inside the `for(;;)` drive loop (:10430-10438) only slice timing is checked after `await yieldToNextPresent()` — a context loss while parked resumes the generic `disposeObjectSteps` walk on dead-context resources.

**Mechanism** — The entry comment says the generic Object3D walk "is reserved for a live-context teardown"; a loss mid-walk violates that own rule for everything after the yield boundary. Dispose events then fire for resources the loss/recovery already abandoned — benign per-node (three.js dispose is idempotent) but it's work the design deliberately refuses to start, running during the highest-pressure recovery frames.

**Fix sketch** — re-check `this._contextLost !== true && recordContextGeneration === currentContextGeneration()` after each yield; bail `return false` to preserve the entry guard's abandon semantics.

**Effort** S · **Impact** L · **Risk** low.

### F5 — `disposeObjectSteps` slice granularity is per-128-nodes; the wall check runs only between `next()`s

**Evidence** — `src/render/renderer.js:27296+` (Steps twin yields per 128 visited); `:10430-10437` (the >4ms / ledger-spent check runs once per `next()`, i.e. per 128-node unit).

**Mechanism** — A single `next()` can exceed the 4ms slice bound on an authored subtree with fat material/texture arrays before the pacing check ever runs — the bound is structural, not wall-clock. Worst-case slice lands inside the presented frame it was designed to protect.

**Fix sketch** — let the Steps twin consult a `now()` injector (or halve the per-slice node cap while `pacedFrameSpend` is armed) so the yield fires inside the 128-node unit.

**Effort** M · **Impact** L · **Risk** low-mid.

### F6 — Suppressed-destroy world rows leak a slot when commit lands in the same tick as the destroy

**Evidence** — `src/core/presentationJournal.js:267-294`: a suppressed destroy mints no record, so the committed journal carries no DESTROY for it; `src/render/presentationWorld.js:1038-1053`: the absent-retire sweep runs only on full fallback feeds — none runs if no tick lands inside the suspension window before commit.

**Mechanism** — Invisible slot leak: the dead entity's mesh evicts via `entity:destroyed` → `_unbindPresentationMesh`, so the row is unbound and invisible, but it stays allocated (stale `entityRefs`) until the next full rebuild. Bounded, tiny — noted for completeness; the "later real replay hits destroy-without-spawn" variant from the prompt does NOT occur (suppressed destroys are one-shot — dropped at `prepareRecord`, never replayed).

**Fix sketch** — mint a synthetic DESTROY record for suppressed ids at publish time, or run the retire sweep once at commit.

**Effort** S/M · **Impact** L · **Risk** low-mid (must not resurrect the recycled-id over-doom shape).

### F7 — Cook/seal dedupe chunk slices allocate a fresh 1024-entry array per pace tick

**Evidence** — `src/render/renderer.js:13994-14001` (`cohortSubjects.slice(i, i+1024)`), `:13178-13186` (same for `sealSubjects`), `:15520-15530` (`dedupeLateSubjects`).

**Mechanism** — pure allocation churn inside the paced dedupe: one Array per chunk per tick; GC pressure mid-cook. Cosmetic.

**Fix sketch** — pass `(subjects, i, end)` range args into `uniqueAdmissionUnits`, or a reusable scratch window.

**Effort** S · **Impact** L · **Risk** low.

## Regression notes — W95 machinery verified at 4f6df8366

All twelve items verified concretely; none regressed.

1. **boundEntityRefs doom keying** — `presentationWorld.js:984-986` hiddenIds doom requires `resident === boundEntityRefs[slot] && resident.alive !== false`; `:990-993` wasVisible → VISIBILITY mark; retireSuppressed sweep `:1017-1033` uses `_noMesh`/projectile-skip keys unchanged. Under-doom is unreachable for `recordDestroy`-bearing entities: `_removeEntityAtIndex`/`_removeEntitiesAtIndices` write `alive = false` before publishing (`coreSystem.js:347,389`), and `survivorPod.disposeEntity`'s non-canonical fallback flips it too (`survivorPod.js:305`) — production destroys always carry the flag. The only alive-stale object is a dropped dressing row (F1), which mints no destroy and so can never be named by hiddenIds — the gate itself is correct.
2. **Collect-abort narrow** — suppressed destroys for never-collected ids do not doom: the doom leg fires only when `collectedLiveIds.has(id)`, i.e. id present and `alive !== false` at doom-check (`presentationRunner.js:786-807`). For real entities the leg is unreachable (destroy flips alive first → excluded) — harmless over-provisioning. Commit-without-abort is correct: the publish loop skips `alive === false` (`presentationJournal.js:597`), a never-collected id never spawns, and stale world rows retire via full feeds or sit unbound/invisible.
3. **Suppressed destroys are one-shot** — dropped at `prepareRecord` (`presentationJournal.js:267-294`); no record minted, no later replay, no destroy-without-spawn. Recycled-id over-doom is bounded to one suspension window and is conservative.
4. **Stepped collect** — snapshots `entityList.slice()`/`dressing.rows.slice()` at mint (`presentationSources.js:122,127`), re-checks `alive !== false` per row at push, newcomer sweeps `:136-161` are add-only (this asymmetry is F1's vehicle for drops).
5. **Paced publish** — `%64` invalidated bail inside the publish loop (`:596-610`), stale-published TRANSFORM+VISUAL replay `:614-636`, invalidated → `requestRebuild('rebuild-mid-write')` `:645-649`.
6. **`rebuildSuppressedDestroyIds`** feeds `hiddenIds` only while `!publishIter` (`presentationRunner.js:893-895`) — the doom snapshot cannot drift mid-publish.
7. **`_parkedDepthStageRoots` mints** carry `lightSigEpoch`, `recheck`, `oqX/oqZ`, `depthNodeScale` at both sites — over-cap abort `renderer.js:25560-25574`, denied `:25687-25705`.
8. **`driveShadowPolicySteps`** — parked iterator per root, `stampShadowCasterPolicyLodLevel` on done (`renderer.js:27192-27235`); sig = allowCast|walkRoot===root.
9. **Paced disposeBoundaryObject** — (a) flight-mode + `disposeObjectSteps` drives the paced loop yielding past 4ms or a spent ledger (`:10426-10438`); (b) non-flight or missing Steps fn → sync `disposeObject` (`:10420-10421`); (c) dead-context guards run first (`:10418-10419`). Residual: F4.
10. **Cook cohort mint** — (a) `cookPoolCompileRoots` one lazy census memo shared by both lateRoots tails and the buffer-roots leg (`:13890-13894`, `:13946`, `:13953`, `:14245`); (b) `cohortSubjects` chunks 1024 through `uniqueAdmissionUnits` sharing `unitSeenMaterials`/`unitSeenGeometries` (`:13990-14001`); (c) `cookStale()` bails `cookSuperseded` inside every bucket leg (`:13099-13102`, `:13148`, `:13159`, `:13195`, `:13206`, `:13219`, `:13224`, `:14511`, `:14552`, `:14562`); (d) unbucketed fallback awaits `sealPace` per root (`:13150-13152`); (e) `_shadowCensusForFrame` latches epoch per `_viewSyncSeq` (`:25326-25347`).
11. **precollectedCasting** — (a) `compileShadowDepthPipelinesSteps` consumes `options.precollectedCasting` and skips its own census yield (`shadowDepthAdmission.js:607-608`); (b) `driveCompileShadowDepthPipelines` (`renderer.js:542-551`) and the `driveDepthCompile` leg (`:15694-15705`) precollect once before the retry loop; (c) drift retries do NOT re-collect — the option persists on `depthOpts` across attempts (`:552-568`, `:15706-15722`).
12. **postPace superseded** — (a) `postPace()` returns `passEpoch !== live enterSerial` (`:15367-15385`); (b) `collectLateAdmissionCensus` (`:15407`, `:15413`, `:15434`, `:15445`), `subjectsForCompileRoots` (`:15465`, `:15487`, `:15501`), `dedupeLateSubjects` (`:15528`), the unstaged collect (`:15738`), and `driveDepthCompile` (`:15700`, `:15716`) all bail `superseded:true` / `epoch-superseded`; (c) the pass tail returns `postSupersededResult()` = `{skipped:true, superseded:true, queued, sector, lateRoots:0, depth:{skipped,'epoch-superseded'}}` (`:15369-15376`, invoked `:15552`, `:15620`, `:15762`, `:15784`, `:15815`).

No re-reported adjudicated items; no preexisting-test-failure noise.
