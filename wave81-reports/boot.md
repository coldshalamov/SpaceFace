# Wave-81 audit — boot-loading lane (frozen/stalled loading screens)

Audited `devin/1791064509-perf-w60` @ `8b9bd6663` (post-W80). Read-only; no code changed, no app run.

`saturated: false`

## Findings (ranked)

### F1 — Post-opening admission legs re-walk the whole scene 4–6× with no slice clock; rescan straddles the shell→flight boundary

Evidence:
- `src/render/renderer.js:14209` `collectLateAdmittedCompileRoots(this._meshes, openingSubjects)` — sync mesh-registry scan
- `src/render/renderer.js:14222` `collectInstancePoolCompileRoots(scene)` — sync full scene traverse
- `src/render/renderer.js:14230` `collectUncompiledSceneDrawables(scene, openingSubjects)` — sync full scene traverse #2
- `src/render/renderer.js:14293-14294` `lateCompileRoots.flatMap(collectCompileSubjects)` + `uniqueAdmissionUnits(...)` — per-root DFS + atomic dedupe
- `src/render/renderer.js:14330` `collectUnstagedShadowCasters(renderer, depthSubjects, scene)` — another census walk
- `src/render/renderer.js:14353-14370` rescan loop re-runs *all* of the above per pass (cap 3), with only a single `await yieldToBrowser()` hop at `:14363`

Mechanism: `runPostOpeningPipelines` pays ~4 whole-scene traverses + subtree collects + dedupe as one contiguous synchronous block before the sliced `admitOpeningUnitsAcrossSlices` begins. The pass normally starts behind the loading shell, but `preparePostOpeningPipelines` joiners arm `_postOpeningRescanRequested` (`:14453-14460`) — a rescan leg armed by a flight-mode joiner runs the same traverse set inside a presented frame. On a ~21k-node scene that is 4×21k+ node visits unyielded, per pass, up to 3 passes. This is the largest remaining un-sliced run of collect work reachable from the boot/jump machinery.

Fix sketch: fuse the collects into ONE chunked scene walk — the exact `collectInstancePoolCompileRootsAndSubjectsSteps` pattern already proven in this codebase (`latePipelineAdmission.js:242`, adopted by the cook census in W77/W79) — returning roots+subjects+unstaged-caster rows from a single generator-driven traversal, driven on the same sliced `yieldToBrowser`/`yieldLiveSectorGpu` clock the admit uses. Rescan legs inherit the same drive.

Effort: M · Magic-frame impact: M (worst case a multi-hundred-ms block; usually behind the shell, but flight-straddling via joiner rescan) · Risk: L–M (each collect carries its own filter/options — the fuse must preserve `seenLate` dedupe order and each collect's domain; the re-arm contract must keep catching mid-pass attachers).

### F2 — `jump.meshBuilds` drain loop consults the paced ledger but never posts spend

Evidence:
- `src/render/renderer.js:14096-14101` — `while (queueHead < queue.length) { jumpBuilt += this._drainMeshBuildQueue(RUNTIME_MESH_BUILD_BUDGET) || 0; ...; await yieldLiveSectorGpu(); }`
- `src/render/renderer.js:20251-20263` — the drain's `shouldContinueAdmissionSlice({ usePacedLedger: true, ... })` only *reads* `pacedFrameSpend()` (`admissionSliceBudget.js:38`); nothing in the leg calls `notePacedFrameSpend`
- Contrast: `providerYield` at `:13854-13861` debits before every yield — this leg does not ride it at all

Mechanism: inside a flight-mode cook (`providerSliceModeArmed` at `:13848` exists for exactly that mode) each drain pass spends up to ~3 ms (`ADMISSION_SLICE_TARGET_MS`) + ≥1 guaranteed item of unrecorded work. Sibling paced lanes (compile slices, residency sweeps, despawn drains) sampling the wallet in the same presented frame see underreported spend and stack their own slices on top — per-frame overshoot of ~one extra slice per interleaved lane. Bounded — the leg still yields per pass — but the wallet the contract uses to bound presented-frame spend is inaccurate on this leg.

Fix sketch: ride the provider slice clock — `providerSliceDue()`/`providerYield()` in the loop head, like the teardown (`:14068`) and enqueue (`:14079`) legs directly above it — or debit `notePacedFrameSpend(providerNow() - legStarted)` per pass gated on `providerSliceModeArmed`.

Effort: S · Magic-frame impact: M–L (an accounting gap that lets frames overshoot, not a freeze) · Risk: L.

### F3 — `live.poolProgramSeal` collect preamble is one atomic span (survival cook)

Evidence: `src/render/renderer.js:12215-12238` — `collectInstancePoolCompileRoots(scene)` full traverse + `latePoolRoots.flatMap(collectCompileSubjects)` per-root DFS + `uniqueAdmissionUnits` dedupe, all synchronous, before the sliced `admitOpeningUnitsAcrossSlices` at `:12240`.

Mechanism: on a survival cook, the seal's preamble re-walks the scene + every pool subtree + dedupes the whole subject list unyielded; the admit that follows is sliced, the collect is not. The comment at `:12202-12208` says the seal exists exactly for the cohorts the earlier steps produced — i.e. this runs when the cohort is largest.

Fix sketch: drive `collectInstancePoolCompileRootsAndSubjectsSteps` (the fused chunked twin already written for the cook census) on a sliced clock — it returns `{roots, subjects}` in one walk, replacing both the traverse and the flatMap. Caveat: verify its drawable-subject predicate covers `collectCompileSubjects`' domain for pool roots (superset is fine — `skipReadyMaterial` still filters); chunk `uniqueAdmissionUnits` on the shared seen sets exactly as `:13488-13496` already does.

Effort: S–M · Magic-frame impact: M–L (survival launches only, behind the shell) · Risk: L.

### F4 — Widen warm drive checks `cookStale()` only at slice boundaries (up to ~8 ms of dead refill work inside a presented frame)

Evidence: `src/render/renderer.js:11710-11726` — the widen drive runs `warmIterator.next()` and only consults `cookStale()` inside the slice-due branch; the jump twin at `:13985-13999` checks `cookStale()` before *every* `next()`.

Mechanism: a cook superseded mid-refill keeps pumping the suspended warm iterator until the current ~8 ms slice expires, then exits. Dead work inside a presented frame on a flight-mode cook; correctness is preserved (`return()` still fires, so the publish+stamp stays unreachable) — only bounded latency is wasted.

Fix sketch: hoist `if (cookStale()) { warmIterator.return(); return cookSuperseded; }` to the top of the loop, matching `:13986-13988` verbatim — a boolean compare per step, zero behavior change on the live path.

Effort: S · Magic-frame impact: L · Risk: L.

### F5 — `collectFirstFlightCookEntities` runs an unyielded O(entityList)+sort census at all 3 cook call sites

Evidence: `src/render/partsLibrary.js:1048-1080` (entity scan, radius filter, asteroid distance sort); call sites `src/render/renderer.js:11586` (opening), `:12721` (re-entry), `:13961` (jump).

Mechanism: one atomic pass over `entityList` plus a sort of the radius-filtered asteroid subset, sitting directly ahead of the provider census stretch on the jump path. Bounded by entity count but unsliced — on a dense sector this is the next-visible seam after F1/F3.

Fix sketch: chunked twin — row-chunk the entity scan under the existing slice clocks (jump path already holds `providerSliceDue`/`providerYield`); keep the sort whole (its input is the radius-filtered subset, capped by `FIRST_FLIGHT_ROCK_COOK_CAP` admits).

Effort: S · Magic-frame impact: L–M · Risk: L.

### Honorable mention (not re-reported — already adjudicated)

- `createOpeningSubmissionReceipt` + `buildOpeningSubmissionPlan` mint and recapture (`:14676`, `:12641-12657`) — deferred under boot F3 (validity-key memo); measured 1 ms on a 67-subject run. Not re-reported.
- `live.survivalDepthSweep` (`:12588-12604`) — one synchronous scene-wide staging render via `compileShadowDepthPipelines`; deadline-gated and signature-deduped; same class as the documented residual bounded atomic spans (hitches F5).
- `jump.instancePoolSeal` `collectUnresidentInstancedDrawables(scene)` (`:14126`) — one traverse; small.
- `syncVisiblePointLightBudget` (`:14177`), `warmAsteroidInstanceVariants/Keys` (`:14214-14218`) — small bounded walks inside the same F1 pass; fold into the fused census.

## Regression notes — W79 machinery verified concretely at 8b9bd6663

**1. `warmNearbyLedgerRowsSteps`** (`src/world/presentationSources.js:640-686`):
- (a) Plan verdicts identical to sync warm — `_nearbyLedgerWalkPlan` (`:349-465`) mints toleration/rides/radii/buckets/versions once and the stepped path consumes them verbatim, same as `_nearbyLedgerRowsContext` (`:470-536`). A stale plan resumes an honest disc: `rememberMeshFarKey` (`:309-335`) stamps the walk's *own* `walkX/walkZ/walkRadius` + `far.collectDisc = {x:walkX, z:walkZ, r:collectRadius}` — the committed memo describes the disc actually walked, so a post-plan drift invalidates via the ordinary key-mismatch path on next collect, not via a lying stamp.
- (b) `batchRows=Infinity` identical to pre-W79 sync — `queryFarActorsSteps` (`farActorTable.js:595-635`) / `queryAsteroidFieldSteps` (`asteroidField.js:184-238`) compute `batch = Number.isFinite(batchRows) ? max(1, batchRows|0) : Infinity`; the `(i+1)%batch===0` boundary never fires under Infinity, and `queryFarActors`/`queryAsteroidField` drain with Infinity. Nuance flagged (harmless): both grid paths `yield` unconditionally per cx column (`:632`, `:235`), so stepped drivers get column-granular steps regardless of batch — no double-visit, no skip; just coarser-than-batch steps.
- (c) Memo commit ordering — `rememberMeshFarKey`/`rememberMeshRockKey` run inside the generator only after their `yield*` walk completes and after `_meshFarScratch`/`_meshRockScratch` are republished in the same step (`:665-680`); a `return()` mid-walk propagates through `yield*` and abandons the walk — no publish, no stamp.
- (d) Mid-refill membership bump — the publish+stamp is one atomic step (clear scratch → push staged → remember*Key), so no reader ever observes a half-filled disc through the shared scratches; a `far.version`/`field.version` bump can only invalidate the just-committed stamp on the next `matches` check. Interleaved collect writing `_meshWalkOrigin` can't corrupt an in-flight walk: the inner generator captured `x/z/r` as locals at first `next()`.

**2. `_holdExemptWarmIter` drive** (`renderer.js:2559-2766`):
- (a) `abandonHoldExemptCollect` (`:2470-2485`) returns the warm iterator and nulls `_holdExemptWarmIter`/`_holdExemptWarmToleration`/`_holdExemptWarmEpoch` plus the collect iter/out/epoch; epoch guards at `:2566/:2570/:2579` reject stale iters — a stale warm cannot mint a collect under the wrong epoch.
- (b) Warm completing mid-beat mints collect with the stored toleration verbatim — the toleration map at `:2624-2630` carries `'covered'` exactly (no true-vs-covered flip on the deferred mint).
- (c) Collect+commit unreachable while warm parked — mint guard at `:2582` requires `!iterator && !warmIter && !commitList`.
- (d) Remint `continue` re-enters the warm phase same beat (`:2749-2757`, `tolerateMiss:true`); a warm finishing inside a spent beat defers collect mint to next beat without losing the commit epoch.

**3. Stepped sweep twins** (`_pruneMotionTrackerRecordsSteps :19280`, `_releaseDetachedBoundaryOwnersSteps :19344`, `_drainMeshBuildQueueSteps :20141`):
- (a) Sync drivers (`_drainMeshBuildQueue :20128-20133`, `_pruneMotionTrackerRecords :19269`, `_releaseDetachedBoundaryOwners :19334`) exhaust the generator inline and return `step.value` — identical row order/verdicts/return shape at every call site.
- (b) `active`/`claimed` census sets are fully minted (add-only) before any prune/release — chunking cannot drop or reorder membership.
- (c) Drain prologue (gate + `firstFlightIds` census + `drainScan` mint) sits inside the first `next()`s with per-row `yield` in the while (`:20216-20217`) — no per-iteration work moved outside. Test fixtures stub only the *sync* name (`test/render-residency-poll.test.mjs:69,151,299,361`); generators fall back via `typeof this._drainMeshBuildQueueSteps === 'function'` — sync-driver contract holds.

**4. `_residencySweepBeatStamp`** (`:2114/:2167/:2210` pumps; refresh in sweeps `:19648/:19831`):
- (a) Bump is per pump invocation, not per step — verified at `:2157` and `:2210`.
- (b) `refreshReconcileEnv`/`refreshResidencyEnv` re-derive every consumed term (`simNow`, camera/env/scan, `tGlass` memo + `glassVerdictMemo` clears at `:20223-20230`) — no minted term survives stale into a post-beat row.
- (c) `liveShellLatched` is evaluated per row (`:19675`, `:19850`), and a latch releasing mid-sweep resumes evicting immediately — but every departing dispose routes through the bounded `_despawnDisposeQueue` (evict loop `:19678-19709`, `:19853-19893`), so the release direction cannot run an unsliced dispose storm inside a presented frame. Both directions traced clean.

**5. `debitGate` + slice-mode armed flags** (`pipelineReadiness.js:133-156`; `providerSliceModeArmed :13848`; `openingSliceArmed :11522`, `survivalSliceArmed :11606`, `widenSliceArmed :11703`, `leftoverSliceArmed :11786`):
- (a) `debitArmed` samples at slice mint (`:142`) and re-arms at slice re-mint (`:151`) — a mid-slice mode flip debits under the mode the slice started in; posted spend can't be forfeited.
- (b) A loading-mode-minted armed slice firing on the 8 ms leg posts into the flight wallet — over-debit-safe, not a starve vector: the spend genuinely occurred inside the presented window (its tail ran post-flip), the wallet is conservative, and `minItems` in `shouldContinueAdmissionSlice` guarantees progress regardless.
- (c) Remaining un-debited flight-reachable private-clock seams: **the `jump.meshBuilds` drain loop (finding F2)**; the post-opening rescan legs (folded into F1 — traverses unclocked between single `yieldToBrowser` hops); swarm deferred-warm build tails (`:18273/:18335`) debit only on yield — a bounded sub-4 ms tail un-posted, minor. Context-restore awaits (`:8970/:8994/:9010`) and vfx waits (`:9385/:9432`) are idle waits, not spend — correctly un-debited.

**6. Cook warm drives** (`:11708` widen + `:13984` jump-cook):
- `warmIterator.return()` paths on `cookStale()`: jump drive closes the iterator both at the per-step check (`:13986-13988`) and inside the yield branch (`:13994-13996`); widen closes it at `:11721-11723`. `return()` propagates through the `yield*` delegation into `queryFarActorsSteps`/`queryAsteroidFieldSteps`, abandoning the inner walk — publish+stamp unreachable, no memo stamp on a suspended refill.
- A cook whose warm suspends keeps `_meshWalkOrigin`/`_meshFarScratch`/`_meshRockScratch` unobserved by interleaved readers: scratches republish atomically at commit; `_meshWalkOrigin` is captured as `x/z` locals by the inner generator at first `next()`, so an interleaved sync collect overwriting it mid-walk can't corrupt the in-flight stepped walk.
- Cook-lifetime contracts: cook drives hold the warm iterator in a **local** variable (not `_holdExemptWarmIter` — that's the flight-side path) and must reach `warmStep.done` before consuming — nothing asserts synchronous completion, and a superseded cook's suspended warm leaks neither the iterator (closed via `return()`) nor its plan/staged scratches (die with the generator frame). Asymmetry noted as finding F4 (widen checks stale only at slice boundaries).

## Lane hunt answers (a–d)

- **(a) Census resume boundary**: safe. `collectInstancePoolCompileRootsAndSubjectsSteps` (`latePipelineAdmission.js:242-276`) keeps `stack`/`seen`/`sinceYield` entirely generator-local; `seen` is object-identity add-only → no double-process; suspends resume at the exact stack cursor → no skip. Only exposure is live-scene mutation mid-walk (new node under an already-visited parent = under-collection; reparented node = visits at old position but buckets via live parent chain at `:13438-13450`) — both covered by the rescan/straggler legs. Cross-chunk dedupe at `:13488-13496` carries `unitSeenMaterials`/`unitSeenGeometries` across slices as monotonic add-only sets → identical to one monolithic call.
- **(b) Defer-to-issue probe**: bounded. The issue loop (`openingGpuAdmission.js:638-658`) yields per unit; each step = a `materialList(subject)` probe + at most one `compileSubjectColorAndDepth` — the compile covers the subject's whole material set in one call, and `issueKeyFor` signature dedupe collapses palette-clone subjects. N evicted-ready materials → still ONE compile issue per step; N evicted subjects → N bounded steps. compileOne's own slicing is the per-unit step — no way to get N link calls inside one step.
- **(c) Next unsliced boot legs**: F1 (post-opening collect run — largest), F3 (pool-seal preamble), F5 (first-flight entity census), F2 (drain ledger gap). Receipt mint ×2 already deferred (boot F3); teardown pass is sliced (`:11787` leftover clock); survival depth sweep is deadline-gated + signature-deduped.
- **(d) Cook warm lifetime**: enumerated above under regression item 6 — local iterators, `return()` on stale, no leaks, no sync-completion assertions, scratches unobservable until atomic commit.
