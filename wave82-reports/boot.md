# wave82-boot

head: 2b3e8e99c

## 1. saturated: false

Legal contract-preserving improvements with conceivable implementation paths remain —
most significantly the 3-4×-per-boot atomic `buildOpeningSubmissionPlan()` census block,
plus a same-class family of unsliced one-shot censuses and one resume-boundary hazard in
the chunked cook census. All are fixable inside the no-visible-degradation contract and
the bit-identical sim contract (read-only collect machinery, no sim fields touched).

## 2. Ranked findings

### F1. `buildOpeningSubmissionPlan()` runs 3-4 full atomic census blocks per boot — the largest remaining unyielded leg in the lane

- Evidence: `src/render/renderer.js:10936-11113` — synchronous block:
  `scene.updateMatrixWorld(true)` (:10940), `collectOpeningEntityRootCandidates`
  full `_meshes`+entities census (:10991), `collectOpeningShadowCasterRootCandidates`
  second census (:11005), per-parallax/per-pool-root `collectOpeningSubmissionLeaves`
  walks (:10977, :11027, :11042), `collectAuthoredInstancePoolRoots(scene)` scene walk
  (:11023), `collectFirstFlightLayerDrawables` subtree walk (:11060), per-candidate
  `createOpeningProducerCensus` (:11069), `combineOpeningProducerCensuses` (:11081),
  `createOpeningSubmissionPlan` (:11090). Zero yields. Invocation sites:
  `captureOpeningSubmissionPlan` (:11214, driven from `pipelineReadiness.js:820`),
  the settled recapture **inside the live cook** (:12969-12971), `cookPicturePlan`
  inside `cookLiveSceneGpu` when `options.present===true` (:13191 — New Game passes
  `present:true` at :12087), and the `prepareOpeningGpuResources` fallback (:15056).
- Mechanism: each call is a synchronous multi-walk — one full `updateMatrixWorld`
  plus ~6 independent censuses and N subtree leaf walks. On a dense scene this is
  tens of milliseconds of unyielded JS per invocation, and two of the invocations
  (:12969, :13191) run inside the live cook where every yield is what keeps the
  loading shell presenting. The recapture at :12969 additionally runs immediately
  after the boundary settle — i.e., right before release, the worst place in the
  lane to donate an atomic window. A fat scene pays this block 3-4 times per boot.
- Fix sketch: (a) stage the collect side under a chunked iterator on the union clock —
  every census inside is a pure read whose output is publish-atomic (same shape as
  `collectInstancePoolCompileRootsAndSubjectsSteps`, already proven in this cook at
  :12470-12488); and/or (b) memoize the per-candidate producer census across the
  capture/recapture/picture invocations keyed on an authored-commit version — honest
  staleness in the same style as the ledger memo keys (a commit landing between
  capture and recapture must re-enter the census; a version bump makes that cheap).
  `updateMatrixWorld(true)` cannot be mid-census stale — either keep it atomic or
  memoize the whole plan build.
- Effort: M-L. Magic-frame impact: H (biggest single unyielded block left; paid
  3-4×/boot, twice inside the shell window). Risk: medium — the plan is the
  first-draw contract object; any memoization must be honestly stale on authored
  commits, and a staged walk must tolerate mid-walk attach/detach (the chunked
  twins already own that contract via stack+seen).

### F2. Stragglers never-linked census driven at one whole frame per 256 nodes

- Evidence: drive at `src/render/renderer.js:12836-12848` —
  `while (!stragglersDone) { step = stragglersIter.next(); ... else await
  yieldAndFlushLiveSectorGpu(); }`; iterator `collectNeverLinkedSceneRootsSteps`
  at :7828-7872 yields every `nodesPerSlice=256` visited nodes;
  `yieldAndFlushLiveSectorGpu` = `flushPipelinesBehindShell()` + full
  `requestAnimationFrame` (+48ms unstick) + `yieldToBrowser` (:11561-11579,
  :11426-11454). `flushPipelinesBehindShell` early-outs on
  `pipelineAdmissions.pendingCount === 0` (:11562) — a no-op during this sweep
  since the gate already requires `pendingCount === 0` (:12824).
- Mechanism: ~21k-node scene → ~82 iterator steps → ~82 full rAF frames
  (~1.4-4 s wall at 60/30 fps) per sweep, up to `neverLinkedSweeps` cap of 4.
  Every sibling iterator drive in this cook uses the slice clock (4-8 ms segments
  sharing a frame — widen :11955, sealPace :12462, drain :20828) and would finish
  the same census in ~3-8 frames. This is the only drive still paying a frame per
  step — the W80 chunked twin was added (:12832 comment) but kept on the old
  cadence. Extends the settle — the last gate before release — behind the shell.
- Fix sketch: mint a private slice clock in the drive loop (the widen/sealPace
  pattern: `step()` until `now-start >= 4ms || pacedFrameSpend() >= BUDGET`,
  then `debit` armed + `yieldLiveSectorGpu()`). Same yields, same census output,
  ~10-20× less wall time.
- Effort: S. Magic-frame impact: M (pure loading duration — seconds per sweep;
  not a freeze). Risk: low.

### F3. `createOpeningSubmissionReceipt` — atomic leaf walk + per-material bindings + deep freeze, ×2 per boot

- Evidence: `src/render/openingSubmissionPlan.js:1141-1236` —
  `currentPlanResourceIdentitySets(plan)` (:1165) calls
  `collectOpeningSubmissionLeaves(plan.scene, {live:true})` — a live full-scene
  leaf walk; `requiredProgramBindings` (:1184) runs `renderer.properties.get` for
  every material on every plan compileSubject (:429+, `receiptProgramMaterials`
  :410-427); `freeze` (:181-192, invoked :1235) walks the receipt object graph.
  Called at `renderer.js:15202` (initial freeze) and :12980 (in-cook settled
  recapture — immediately after `buildOpeningSubmissionPlan` at :12969).
- Mechanism: one more synchronous full-scene walk plus an O(subjects×materials)
  property census per invocation; the :12980 site sits inside the live cook's
  tail. The deep `freeze` is already bounded — `liveReferences` skip-set (:1227-1234)
  keeps the plan/subject objects unfrozen — so the residual cost is the walk and
  the bindings census themselves.
- Fix sketch: same chunked-census treatment as F1 — the leaf walk is a pure read
  that can stage on the union clock and publish whole. Shares machinery with F1;
  likely free once the plan census is chunked.
- Effort: S-M. Magic-frame impact: M (one more atomic ~10ms+ window, ×2/boot).
  Risk: low-medium — receipt identity sets are a validation contract; order and
  contents must stay identical to the atomic twin.

### F4. `live.materialSettle` stale-material census — atomic `scene.traverse` + `properties.get` per material

- Evidence: `src/render/renderer.js:12134-12163` — a single synchronous
  `scene.traverse` (~21k nodes) probing every drawable's materials against
  `renderer.properties.get` + version compare, per non-recook cook.
- Mechanism: ~5-15 ms atomic inside the cook between two yields — a one-frame
  (or two) gap in the shell's yield cadence plus that much dead time per cook.
  The same traversal size is exactly what :7824-7827 cites as unaffordable atomic.
- Fix sketch: chunked twin (stack+seen walk, staged array, atomic publish) driven
  on the existing settle/cook slice clock — or fold into the F1/F3 staged census
  since it walks the same graph.
- Effort: S. Magic-frame impact: M. Risk: low — private collect, whole-array publish.

### F5. `collectFirstFlightCookEntitiesSteps` iterates live `state.entityList` across suspension — mid-walk splice can skip a cook row

- Evidence: `src/render/partsLibrary.js:1086-1109` — `for (const entity of list)`
  where `list` is the live `state.entityList` reference (:1087), suspending every
  `rowsPerSlice` (:1105-1108). Mutations: `state.entityList.splice(idx, 1)` at
  `src/combat/industrialBeam.js:259`, `src/systems/survivorPod.js:312`;
  `.push(e)` at `src/core/coreSystem.js:141`, `industrialBeam.js:216`.
  Consumers: boot census drive `renderer.js:11800-11820`; cook fallback census
  `renderer.js:13051-13075` (runs when `liveSectorFirstFlightIds` is absent —
  all id-resolved-empty cases plus any caller that didn't stamp ids; both
  stamped sites :12017/:14425 currently precede their cooks).
- Mechanism: an array for..of holds an index cursor — a `splice` at or behind the
  cursor during suspension shifts every later row down one, so exactly one row is
  skipped per removal (no seen-set: the row is never revisited). A removed visited
  row swap-popped to tail could also be re-visited (double-push — benign,
  `cookSeen`/enqueue dedupe downstream). A skipped authored entity misses
  `firstFlightEntities` → never enqueued/compiled → its mesh builds and links
  inside the fight — the exact class this cook exists to kill. Exposure window:
  the jump cook under `mode==='flight'` (despawns mid-walk are routine); the boot
  census under `mode==='loading'` sees mostly append traffic (extra coverage,
  benign).
- Fix sketch: `.slice()` at mint + live-tail rescan before return — verbatim the
  sibling pattern `collectMeshPresentationEntitiesChunked` already uses
  (renderer.js :20783-20825 `.slice()` snapshot + newcomer tail rescan). The
  atomic twin needs no equivalent (no suspension window).
- Effort: S. Magic-frame impact: M (low probability per yield, consequence = the
  eliminated defect class). Risk: low.

### F6. `sweepBoundarySettle` + survival pre-drain kick — atomic `_meshes` sweeps inside the settle loop

- Evidence: `src/render/renderer.js:12760-12797` — a full `for (const [entityId,
  mesh] of this._meshes)` walk + `requestAuthoredUpgrade` kicks, invoked once per
  outer settle iteration (:12807) while the queue drains; plus the same-shape
  once-per-cook kick loop at :12365-12379.
- Mechanism: each settle iteration pays an O(#meshes) synchronous sweep before
  its 4 s idle wait — on an arena-scale mesh map this is a multi-ms atomic block
  repeated per drain round. Bounded by mesh count; kicks are idempotent.
- Fix sketch: yield on the settle's own clock inside the sweep (it already runs
  inside a deadline-bounded wait loop) or hoist the still-awaiting census into a
  per-iteration incremental diff.
- Effort: S. Magic-frame impact: L-M (survival path only). Risk: low.

## 3. Regression notes on landed waves — W79 machinery verified concretely at 2b3e8e99c

**(a) `warmNearbyLedgerRowsSteps` — VERIFIED.**
`src/world/presentationSources.js:716-763`: both sync `warmNearbyLedgerRows` (:700)
and the Steps twin mint the shared `_nearbyLedgerWalkPlan` (:349-468) with
identical inputs — plan verdicts (origin quantization, `collectOverlap` =
2 cell-diagonals :381-382, `rides` coverage, version capture at mint :415-442)
cannot diverge. `batchRows=Infinity` produces zero yields on both batch-boundary
paths (`(i+1) % batch === 0` never true under Infinity — farActorTable.js:614-621,
asteroidField.js:210-227); all Steps callers pass default `batchRows=1024`.
Private `staged` array + atomic publish (`scratch.length=0; push; remember*Key`)
inside one step (:578-595, :740-760) → a mid-walk suspension never leaves a
half-filled disc observable, and a membership bump during suspension leaves the
memo stamp honestly stale (version sampled at mint — :279-341 comments).

**(b) `_holdExemptWarmIter` drive — VERIFIED.**
`abandonHoldExemptCollect` (:2562-2577) clears iter+toleration+epoch+collect fields;
all six callers enumerated (:2156 hold-release, :2663, :2672, :2708, :2741, :2768 —
commit-epoch mismatch path). Epoch minted per invocation (:2657) and checked before
driving (:2658). Toleration stored verbatim on the owner (:2723 re-wraps
`'covered'` vs `true` exactly). Mint guard `!iterator && !owner._holdExemptWarmIter
&& !owner._holdExemptCommitList` (:2674) prevents a second warm while one is parked.
Remint path (:2857-2874) re-enters the warm drive the same beat with a bounded
streak (4th remint forced to `'covered'`).

**(c) Stepped sweep twins — VERIFIED.** `_pruneMotionTrackerRecords` sync driver
:19795-19802 exhausts `Steps(Infinity)` inline and returns `step.value`; Steps
:19808-19854 mints the `active` set fully before `registry.prune` (:19836).
`_releaseDetachedBoundaryOwners` sync :19863-19873; Steps :19875-20007 — `claimed`
census completes :19887-19912 before any releaseProbe; W80's `isClaimed`/
`isClaimedSteps` live re-walk fallback (:19913-19974) closes the mid-census bind
hole; `isDetached` re-evaluates live ancestry at :19978-19982.
`_drainMeshBuildQueue` sync :20703-20712 returns `step.value` (= `built`,
returned :21080); Steps prologue (:20743-20825) sits inside the generator —
late-present gate + `yield*` hoist + firstFlightIds `.slice()` + live-tail rescan
all run on first `next()`. Test fixtures stub only the sync name
(test/render-residency-poll.test.mjs :69/:151/:299/:361) — production falls back
correctly where `typeof …Steps === 'function'` guards exist.

**(d) `_residencySweepBeatStamp` — VERIFIED, with one gap carried to findings.**
Stamp bumps once per pump invocation (:2249 reconcile, :2302 poll), and iterator
non-null on entry guarantees ≥1 step is consumed. Hoisted-term census: every row
reader re-derives `reconcileSpeed/Cam/Evict*/env`/`tGlassMemo` via
`refreshReconcileEnv`/`refreshResidencyEnv`/`refreshOnNewerSweepBeat`
(:20190-20224, :20390-20401); `keepResidentSet`/`buildBudget` are call options,
correctly fixed. `liveShellLatched` per-row release direction safe both ways
(bounded `_despawnDisposeQueue` :20258-20263 absorbs release-direction disposes).
**GAP → defect in landed machinery:** `_reconcileMeshResidencySteps` rehoist loop
:20597-20605 yields per 256 rows but calls `refreshOnNewerSweepBeat` only once at
:20585 — rows resumed after a suspension consume stale `env`/`reconcileScanOpts`,
so rehoist verdicts post-suspension compute against a departed camera/speed
(over- or under-enqueue direction; sibling loops refresh per row at :20203-20206,
:20303, :20414, :20514). Sizing: rehoist is the tail list — post-suspension rows
are the tail's tail; wrong-direction rows still land on the correctly-gated
enqueue/defense paths. Contract-safe to fix by hoisting the refresh into the loop.

**(e) debitGate + slice-mode armed flags — VERIFIED.**
`createSlicedYield` (pipelineReadiness.js:133-156): `debitArmed` sampled at mint
(:142) and re-armed per yield (:151); `debit(tick - sliceStarted)` posts before
`await yieldFn()` (:148-149) → each segment debits under its start-mode flag — a
loading-minted slice can never debit against the flight wallet, a flight-minted
one debits honestly. `*SliceArmed` flags on the private clocks (`widenSliceArmed`,
`leftoverSliceArmed`, `sealSliceArmed`, `censusSliceArmed`,
`providerSliceModeArmed`) all sample `state.mode === 'flight'` per segment — same
correctness. Census of all named `*SliceStart`/`providerNow() -` seams in the
cook (opening providers :11734-11792, census :11802-11820/:13054-13071, survival
:11843-11920, widen :11940-12010, leftover :12023-12043, sealPace :12460-12469,
provider jump cook :14200-14216, postPace :14590-14602, pumps :2193/:2250/:2303)
— every named seam debits armed-gated. Nit (DOCUMENTED-class, not a finding):
unposted tail — a drive finishing mid-segment leaves ≤sliceMs unposted per
consult site (under-count direction, conservative).

**(f) Cook warm drives — VERIFIED.** Widen drive :11946-11967 and jump-cook drive
:14356-14375 both check `cookStale()` per iteration and call
`warmIterator.return()` (try/catch, cleanup-only) before returning superseded;
`providerYield()`'s own superseded path also returns the iterator (:14368-14369).
`return()` propagates through `yield*` delegation into
`queryFarActorsSteps`/`queryAsteroidFieldSteps` (spec-mandated delegation —
inner `.return()` is invoked) → an abandoned warm mints no memo stamp. A
suspended warm's shared scratches hold the last committed disc until the
publish step — interleaved readers observe a consistent (key,disc) pair because
publish+stamp are atomic inside one step.

**Fresh hunts — resolved:**

(a) Chunked census resume boundaries: `collectFirstFlightCookEntitiesSteps` uses a
live-array for..of cursor with no snapshot — real skip/double hazard (→ F5).
`collectInstancePoolCompileRootsAndSubjectsSteps` and
`collectNeverLinkedSceneRootsSteps` are stack+`seen`/`visited` based: a detached
subtree is still visited (over-collect — benign); a node attached under an
already-visited parent is missed — capped because the settle re-runs the census
next iteration and an attach with queue work re-opens the gate; an attach with
zero queue work under a visited parent stays missed this sweep (bounded, narrow).
`collectFirstFlightCookEntitiesSteps`' own sets (`asteroids`, `seenKeys`) are
per-iterator — no shared-seen double-process.

(b) Defer-to-issue ready probe — bounded. `compileOne` re-probes per subject
inside the already-yielded issue loop (openingGpuAdmission.js:638-657 — one
`yieldToMain` per index through the sliced yield; renderer.js:13903-13914):
a material evicted since census pays one `compileSubjectColorAndDepth` kick
inside its own loop iteration, so N evicted-ready subjects → N compile kicks
spread across N slice-bounded steps, never N links inside one step.
`issueKeyFor` signature dedupe (:642-652) skips covered subjects before the
re-probe. `materialList(subject)` per subject is O(materials-per-object) small
reads — compileOne needs no internal slicing.

(c) Next unsliced boot legs — enumerated and ranked → F1 (plan build ×3-4), F3
(receipt ×2), F4 (materialSettle traverse), F6 (settle sweeps), plus smaller
one-shot walks: `collectPreparedAuthoredCompileRoots(scene)` (:13104) and
`collectFirstFlightEffectRoots(scene)` (:13101) inside `cookLiveSceneGpu`, and
the `considerOpening` index scans (:11589-11594, bounded by entity counts).

(d) Suspended warm inside cook paths — safe by construction. The cook's warm is a
local iterator (never parked on owner fields); the drive always completes it or
`return()`s it on `cookStale` — a superseded cook leaks neither iterator nor plan
(both frame-local, GC'd). No cook-lifetime contract asserts synchronous warm
completion: `widenScan`/`jumpWidenScan` are minted *after* the warm completes
(:11968, :14376), and the union walks consume only post-warm state. The one
multi-warm interleave (reconcile-pump warm vs jump-cook warm under flight mode —
the pump can mint `_reconcileIter` while the cook's warm is suspended) is handled
by the machinery: each warm mints its own plan + staged array and publishes
(scratch, key) atomically, so two live warms oscillate the stored disc between
origins — subsequent mints never short-circuit a mismatched memo (re-walk cost
only), and coverage checks degrade to the flat path but never answer wrong.
