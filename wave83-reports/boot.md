# Wave-83 audit — lane: boot-loading

Audited HEAD: `devin/1791064509-perf-w60` @ `2348ae3ed` (W82 merge tip on PR #220).

## 1. `saturated: false`

Contract-preserving mechanism-level wins remain — the post-opening depth ceremony is still a multi-census atomic leg (finding 1), the W82 chunked twins opened a torn-commit window their guards never closed (finding 2), and two bounded boot legs plus a merge casualty remain (findings 3-7).

## 2. Ranked findings

### F1 — `compileShadowDepthPipelines` is the last big atomic block inside the boot cook

- Evidence: `src/render/shadowDepthAdmission.js:477-680` — one synchronous ceremony: `collectPotentialShadowCastSubjects(subjects)` subtree census (498), `lightingScene.traverse` staged-lights census (512-516), `lightCensusSignature(lightingScene)` (522, second full-scene traverse — the caller already computed the same signature at renderer.js:15065 but no `lightSigOverride` is passed), reparent-home captures (540, 543-549), `revealSubjectForCompile` per caster (555), `castShadow` force loop (559-564), `staging.updateMatrixWorld(true)` twice (624, 645) over the reparented caster forest, `renderer.render(staging)` twice (637 lights-warm + 648 real shadow pass — each an atomic GL submit), `markCastersDepthStaged` whole-casting loop (649), and the finally restore loops (667-679). Call sites: renderer.js:12727 (`SF_SurvivalPoolSealShadowDepth`), 15073 (`SF_PostOpeningShadowDepthAdmission`), 15159 (`SF_PostOpeningRescanShadowDepth`).
- Mechanism: every census leg W79 sliced was fed into this unsliced ceremony. The rescan call site (15159) is the one that lands in presented frames: `_postOpeningRescanRequested` joins arrive mid-pass in flight (the code comments at 15087-15104 describe exactly this flight-mode joiner), and the capped 3-pass loop can run the whole ceremony — census over every caster subtree (~21k-node class), two full-scene light traverses, reparent/reveal/restore loops, two GL renders — inside one task. That is a frozen-frame window during a live join, i.e. precisely the hitch the boot cook was sliced to eliminate.
- Fix sketch: a `compileShadowDepthPipelinesSteps` twin is legal — the casting census, stagedLights census, reparent/reveal/restore and mark loops all carry per-row structure (the codebase already has `createShadowDepthStagingSession` at shadowDepthAdmission.js:708 showing a multi-use staging session is a supported shape). The two `renderer.render` calls cannot be split, but they are single driver submits, not per-caster work — pacing the walks leaves only two bounded GL calls. Passing `lightSigOverride: depthLightSig` from renderer.js:15073/15159 would also remove the duplicate 21k traverse at line 522 (needs a light-set-stability check across the intervening awaits — the signature governs which programs get marked staged, so this dedupe must not mark under a sig that drifted).
- Effort: M. Magic-frame impact: H. Risk: M — the staging ceremony is deliberately subtle (program-key honesty via the live light census; the warm render ordering for `lights.state`).

### F2 — W82 chunked twins widened a torn-commit window: `openingSubmissionPlan`/`openingAdmissionCohort`/`openingSubmissionReceipt` commit without a generation check

- Evidence: `state.render.openingSubmissionPlan = plan` + `openingCohort.capture(identities)` + `state.render.openingAdmissionCohort = openingCohort.snapshot()` inside the generator at renderer.js:11336-11344 (`captureOpeningSubmissionPlanSteps`); the async drive at `src/render/pipelineReadiness.js:864-876` steps it with zero stale/generation checks; the receipt drive at renderer.js:15430-15439 commits `state.render.openingSubmissionReceipt` on `done` with no epoch check on any of its minting legs; `state.render.openingSubmissionPlan` is read back at 15257 (prepare path consumes whatever was published) and 14802-14803 (`openingSubjects` exclusion set + `depthSubjects` in `runPostOpeningPipelines`), 23207-23549 (presented-frame admission verification).
- Mechanism: pre-W82 the plan build/receipt mint was atomic — a `runTransitionGuard.begin` flip (sector hop, New Game, F9 recook) could not land inside it. Now the census legs span `await yieldToBrowser()` hops — hundreds of ms on a slow host — while the warmup drive at main.js:747/1040 is `void` fire-and-forget overlapping the whole transition window. A flip inside the window commits one torn plan: census rows from two epochs, `openingCohort` polluted with departed-world identity strings (`entity:${id}` collides across worlds → new-world meshes can be stamped admitted that never compiled). The receipt minted from that plan (or read at 15257) inherits the tear; `openingSubjects` then wrongly excludes new-world subjects at 14802 → they compile cold inside the first presented flight frames. Every other drive is guarded — settledPlan/settledReceipt re-check `cookStale()` per step and commit in the same sync stretch (13148-13187), cookPicturePlan (13393-13407) likewise, planIter's result stays local (15273-15281). These two commits are the gap.
- Fix sketch: mint `enterSerial` (or `runTransitionGuard` generation) at generator start in `captureOpeningSubmissionPlanSteps`; re-check before the three commits at 11338/11341/11342 and before the receipt commit at 15439 — abandon like the guarded drives do. Add the same per-step stale check in the pipelineReadiness.js:869-876 loop.
- Effort: S. Magic-frame impact: M (narrow trigger window — a transition inside a capture — but the failure mode is exactly the cold-link-in-first-frames class these waves exist to kill). Risk: L.

### F3 — `planetDetailLibraryReady` is a merge casualty: the planet-detail decode is hostage to the rock-reskin continuation

- Evidence: renderer.js:9419-9420 — `this.planetDetailLibraryReady = preloadPlanetDetailLibrary(renderer);` sits physically inside the `this.rockSurfaceLibraryReady.then(async () => { … })` callback (9384-9486), splitting the comment at 9417-9421 mid-sentence. `git blame` attributes it to upstream commit `8772a6a38` (landed via master merge; pre-dates W82 — not a W82 regression).
- Mechanism: the planet-detail preload starts only after the rock library resolves AND the reskin loop (9393-9403, per-32 yields), parallax compile loop (9406-9409, per-group yields) and `warmAsteroidInstanceVariants` complete — arbitrarily many presented frames late on a slow host — instead of alongside the other three libraries (9371-9377). On the early return at 9386 (torn-down renderer) it never starts at all. `prepareOpeningGpuResources` races `this.planetDetailLibraryReady` at 15263: while unassigned it reads `undefined` and skips the wait entirely, so planet-site bodies can present their plain baked fallback well past first picture — a visible stand-in on a visible body, the boot lane's exact failure shape.
- Fix sketch: hoist lines 9419-9420 out of the callback to sit beside the other `preload*Library` calls (after `this.creatureSkinLibraryReady` at 9377 or after `}).catch(() => {});` at 9486) — restores the authored "decodes alongside" ordering.
- Effort: S. Magic-frame impact: M (planet-site openings only). Risk: L — decode starts earlier and unconditionally; matches the sibling libraries' contract.

### F4 — `rockSurfaceLibraryReady.then` continuation guard is evaluated once at entry; mid-continuation teardown acts on the dead scene

- Evidence: renderer.js:9386 `if (!this._meshes || this.scene !== liveScene) return;` runs once before the reskin loop; the body then spans `await yieldToBrowser()` at 9395, 9402, 9408, 9426, 9446, 9453. A teardown mid-continuation leaves the reskin loops mutating GC-bound meshes, `compileObjectPipelines` compiling detached roots (9407, 9425, 9452), `collectInstancePoolCompileRootsAndSubjectsSteps(liveScene)` paying a dead-scene census (9439), `compileShadowDepthPipelines` running with possibly-nulled `this._keyLight`/`this.cam.obj` (9470-9481, try-wrapped → degrades to skip), and the `count` log reporting a dead reskin (9485).
- Mechanism: pre-W82 the continuation was one microtask — teardown could not interleave. Now a renderer dispose during any yield leaves the remaining legs acting on the dead scene: no corruption (objects are GC-bound, mutating them is wasted work), but a presented frame can still pay the dead-scene census + compiles.
- Fix sketch: re-check the entry guard after each await (or wrap each leg in the same predicate) — cheap early-outs; the `.catch(() => {})` already tolerates abandonment.
- Effort: S. Magic-frame impact: L-M (rare interleave; bounded wasted work inside live frames). Risk: L.

### F5 — `collectLateAdmissionCensus`'s `_meshes` map walks are still atomic

- Evidence: renderer.js:14843 (`meshRootSet` build over `this._meshes.values()`), 14868-14871 (`lateEntities` `_meshes` order walk). No `postPace()` inside either loop; the surrounding census and bucketing are paced.
- Mechanism: O(#meshes) per invocation, and the census is re-run per rescan pass (15105, up to 3×) — an O(meshes)-class atomic block inside an otherwise-paced drive, on flight-mode joiner passes in presented frames. Small vs the 21k scene census but the same failure class.
- Fix sketch: pace both loops with `await postPace()` per N rows (the enclosing function is already async and paced).
- Effort: S. Magic-frame impact: M-L. Risk: L.

### F6 — `_openingFirstPictureUpgradePromises` re-walks the whole `_meshes` map + shadow-caster census synchronously, up to ~10 passes

- Evidence: renderer.js:22574-22630 (`collectOpeningShadowCasterRootCandidates` sync call at 22579 — its per-candidate leaf walk at 888-927 — plus the full `_meshes` scan at 22591+), invoked per pass at 22675 and again at 22683 inside the boundary-settle loop (up to 8 passes, 22671).
- Mechanism: behind the loading shell, not a presented-frame stall — but each settle pass pays O(meshes × leaf walk) atomically, so a slow host's last loading stretch reads as frozen between presenter beats. It is one of the two remaining sync call sites of the candidate-collect names (the other being the deliberate receipt re-verifies at 23223/23375).
- Fix sketch: drive `collectOpeningShadowCasterRootCandidatesSteps` + a chunked `_meshes` scan under the loop's own yield cadence (identical rows/verdicts — the Steps twin already exists).
- Effort: S-M. Magic-frame impact: L-M. Risk: L.

### F7 — `collectOpeningSubmissionLeaves(scene, {includeOffscreen: true})` is an atomic scene leaf census in the first-present admission

- Evidence: renderer.js:9699 — single sync whole-scene DFS inside the first-present GPU admission block (9674-9745).
- Mechanism: bounded one-shot behind the shell; on a big composed scene the leaf walk is a multi-ms atomic block inside the admission task, sandwiched between paced legs. A chunked twin (`walkOpeningLeavesSteps` at openingSubmissionPlan.js:312-324 already yields per-512 nodes for its own walk) is a straight port.
- Fix sketch: drive a stepped leaf collect under the enclosing async block's yield cadence.
- Effort: S. Magic-frame impact: L. Risk: L.

### F8 — dead code: `buildOpeningSubmissionPlan` sync closure never called

- Evidence: renderer.js:11038-11043 defines the inline-drain twin; `grep` finds zero call sites (the only live sync drains of these names are `captureOpeningSubmissionPlan` at 11345-11349, `collectOpeningShadowCasterRootCandidates` at 22579, and the sync `createOpeningSubmissionReceipt` at 23223/23375).
- Mechanism: hygiene — an unused name implies a sync fallback that does not exist for `buildOpeningSubmissionPlanSteps` callers (each drive inlines its own `for(;;)` drain). Harmless but misleading.
- Fix sketch: delete the closure, or export it as the documented sync fallback if any future sync site wants the atomic build.
- Effort: S. Magic-frame impact: L (hygiene). Risk: L.

## 3. Regression notes — W82 machinery verification

### buildOpeningSubmissionPlanSteps / createOpeningSubmissionReceiptSteps (renderer.js 11038-11344, openingSubmissionPlan.js 312-324/1155-1262)

- (a) Sync drivers drain inline returning `step.value`, identical contents: `collectOpeningEntityRootCandidates`/`collectOpeningShadowCasterRootCandidates` (840-927) are inline drains of their Steps twins (same iteration, same dedupe — order/verdicts trivially identical). `captureOpeningSubmissionPlan` (11345-11349) drains `captureOpeningSubmissionPlanSteps` inline. Live sync call sites enumerated: `collectOpeningShadowCasterRootCandidates` at 22579 (first-picture upgrade loop — see F6), `createOpeningSubmissionReceipt` at 23223/23375 (presented-frame receipt re-verifies — deliberate bounded sync, per the W82 design note), `collectOpeningSubmissionLeaves` at 9699 (see F7). The `buildOpeningSubmissionPlan` closure at 11038 is dead code (F8) — no production caller depends on a sync plan build.
- (b) async drives across cookStale/epoch flips: settledPlan/settledReceipt (13144-13187) re-check `cookStale()` per step and commit in the same sync stretch — supersession abandons without committing. cookPicturePlanIter (13393-13407) same shape. planIter (15273-15281) has no stale check but its plan is never committed to state. **Gap: receiptIter (15430-15439) and the pipelineReadiness capture drive (864-876) — see F2.**
- (c) `scene.updateMatrixWorld(true)` at 11052 runs inside the plan generator before the first `yield` at 11103 — a suspended plan cannot observe half-updated matrices. ✓
- (d) per-32 yields preserve order/dedupe: yields sit between legs and inside the per-32 mesh-map loops; being a generator, resumption continues the same loop index — identical row sequence and dedupe to the sync drain. ✓

### hoistDeadlineGlassMeshBuildsSteps rewrite anchor (renderer.js 3131-3207)

- (a) write-back re-anchors at `liveHead = owner._meshBuildQueueHead` (3185) — rows consumed mid-suspension are below `liveHead` and never rewritten. ✓
- (b) rows beyond the scanned range (appended during suspension) hit `v === 2` and get `entityIsOnDeadlineGlassScan` evaluated inline (3194-3196) — appended on-glass rows still hoist. ✓
- (c) `queued.has(id)` filter at 3191 drops rows whose `_meshBuildQueuedIds` stamp was deleted — a consumed row cannot be repacked. ✓
- (d) `scanned = i - head` indexes `verdicts` (minted at scan-time head); queue positions do not move (consumption is head-advance only; the drain's compaction `slice()` replaces the array reference, so the suspended scan's write-back then mutates a dead array — wasted work, never corruption). `queue.length = liveHead` truncation + hoisted/remainder pushes rebuild exactly the live segment. ✓

### driveHoist debit protocol (renderer.js 20961-21340)

- (a) `driveHoist` (20999-21008) posts `notePacedFrameSpend(now() - segStartedAtMs)` per suspended segment and re-mints; three call sites: prologue gate (21016), mid-drain deadline hoist (21122 — pre-check before post-scan), urgent-scan hoist (21141). Segment debits sum to the inline-drained total modulo one bounded residual: a refused-start or early `break` skips the epilogue at 21336-21338, so the final (empty-scan) leg is unposted — sub-ms. ✓
- (b) `segStartedAtMs = now()` after each hoist yield — next row segment debits only its own span. ✓
- (c) clocks minted above the gate (20984-20995); a refused-start drain still `return 0` with identical gate semantics — the only difference is it now debits the prologue hoist segment, which is the intended fix. ✓

### releaseUnreferencedCacheOwnersSteps pump drive (assetResidency.js 397-445, 792-812, 870-951 + renderer.js 2202-2248)

- (a) parked `_cacheLeaseIter` completes across pump invocations (2227-2248: break on 4 ms/paced-budget, iterator persists; cleared on done at 2241 and on throw at 2237). Epoch handling: the sweep is **sector-agnostic by design** — it walks the residency registry's live `assets` map with per-row verdicts (`entry.state`, `hasActiveRequestForEntry`, `assets.has` rechecked at visit time), and cache-only/idle verdicts are independent of sector membership, so a sector flip mid-sweep cannot commit stale verdicts — departed-world cache rows remain legitimately reclaimable. The minted `nowMs` at iterator creation drifts by at most the sweep duration (≪ the 10 s idle gate — conservative direction, releases marginally early).
- (b) sync fallback (2215-2222 → `releaseUnreferencedCacheOwners` → `releaseUnreferencedCacheOwnersPass` → inline Steps drain) fires the whole sweep atomically. ✓
- (c) `evictOldestSoftEntriesSteps` (792-812) iterates a pre-collected `candidates` array and snapshots `entry.owners` per entry — `release()` mutations are re-entrant-safe. ✓
- (d) isClaimed triad: the chunked live re-walk lives ONLY in `isClaimedSteps` (20166-20189, consumed at assetResidency.js:436). `releaseDetachedBoundaryOwners/Steps` callers enumerated: renderer.js:20201-20203 (inside `_releaseDetachedBoundaryOwnersSteps`), itself driven only from the sweep section at 20083-20088 (stepped or sync-drained via `_releaseDetachedBoundaryOwners` at 20098-20105). Under a sync drain the `claimed` set is built complete+fresh in the same atomic call — a triad-miss owner is genuinely unclaimed at that instant, and the call cannot be preempted, so release is safe. ✓

### rockSurfaceLibraryReady.then pacing (renderer.js 9382-9487)

- (a) every leg runs exactly once in original order: mesh reskin → prewarm-root reskin → `seatReadyRockSurfaceTextures` → parallax group compiles → `warmAsteroidInstanceVariants` → roster compile (count>0) → chunked pool census → pool recompile → depth-subject compile → count log. ✓ (per-leg `await yieldToBrowser()` matches the replaced sync ordering)
- (b) `poolCompileRoots` minted once (9433-9449) and reused for the depth-subject list (9466-9467, falling back to the sync collect only if never minted) — identical subject set to the two collects it replaced. ✓
- (c) **Gap: the torn-down-renderer guard runs once at entry, not per leg — see F4.**
- (d) `count` accumulates in a closure `let` across awaits — no loss. ✓

### lod queue-integrity machinery (renderer.js 20756-20845 rehoist; 21089-21100 drainBeat; 20198-20220 teardown)

- (a) rehoist stamp filter (20826) cannot skip a row whose stamp was re-added mid-suspension: the scan iterates the captured `pendingBuilds` array — consumption only advances `_meshBuildQueueHead`, so a still-present row is re-collected wherever its stamp survives; the live-tail rescan (20833-20834) covers rows appended during the suspension. Residual: a consumed-then-re-added row can be collected twice (old + new positions both pass the stamp check) → a benign duplicate queue row; and `queue` compaction replaces the array reference, so the write-back lands on a dead array (wasted work). ✓ bounded
- (b) `startedAtMs = now()` re-mint inside the drainBeat block (21089-21100) — a resumed drain abandons per its fresh span, not forever. ✓
- (c) teardown `releaseProbe.isDetached(owner)` re-check at 20210 runs BEFORE pin-sever (20214-20217) and before dispose (20219) — a re-attached boundary is skipped per turn. ✓

## Lane hunts (verbatim items resolved)

- (a) Chunked census twin resume boundary: `collectInstancePoolCompileRootsAndSubjectsSteps` (latePipelineAdmission.js:242-275) carries its cursor entirely in generator locals — `stack`, `seen`, `sinceYield` — a yield suspends after a node's children are pushed, so no row can double-process or skip on resume. The `seen` set is per-invocation (not shared). Residual hazards are the documented bounded-late kind: nodes added mid-walk are unvisited (parents already processed), removed nodes are still visited (harmless compile of a detached node).
- (b) Defer-to-issue ready probe: `beginScenePipelineReadinessBatch` (bloom.js:500+) is a pure-JS batch — the batched route at openingGpuAdmission.js:608-676 is taken on every host, so the non-batch path (586-605) is unreachable. Worst-case composition inside one step: the issue loop awaits `paceQueue()`/`yieldToMain` per unit, so an evicted-ready material costs at most ~1 link per task hop; issue is `overBudget()`-gated per unit; `batch.drain` pools all waits under a remaining-budget `timeoutMs`; the touch leg is deliberately ungated for issued subjects (bounded by `issued.length`, itself deadline-bounded). Signature dedupe (`issueKeyFor`/`seenIssueKeys`) collapses evicted-ready siblings sharing a program to one link + `Promise.resolve({skipped})` placeholders. No N-links-inside-one-step case exists; compileOne's per-unit granularity is the right slicing.
- (c) Next unsliced boot legs, ranked by row count: (1) `compileShadowDepthPipelines` — casting subtree census + 2 whole-scene light traverses + reparent/reveal/restore/mark loops + 2 atomic renders (F1); (2) `lightCensusSignature` full-scene traverse — run at 15065 and again inside the ceremony at 522 (fold into F1's override or share); (3) `_meshes` map walks in `collectLateAdmissionCensus` (F5); (4) `_openingFirstPictureUpgradePromises` sync census ×~10 passes (F6); (5) `collectOpeningSubmissionLeaves` at 9699 (F7). Receipt mint and plan capture are already Steps-paced; the seal phase (survival pool seal 12595-12748) is sliced census→bucket→dedupe→admit but still ends in the unsliced depth ceremony at 12727.
- (d) `warmNearbyLedgerRowsSteps` cook-lifetime contracts: both cook drives (12075-12096, 14572-14591) hold LOCAL iterators, re-check `cookStale()` per step, and `.return()` the iterator on supersession — no sync-completion assertion exists anywhere, and none is needed (`tolerateMiss` covers partial refill by design). The owner-parked `_holdExemptWarmIter` (2622-2788) is epoch-stamped and abandoned via `abandonHoldExemptCollect` on sector flip (2724-2734), hold release (2180-2181), or iterator throw (2770, 2803, 2830). Commit atomicity holds: each memo key stamps inside the same step that publishes its staged scratch (presentationSources.js:743-745, 757-759) — a suspended/abandoned warm leaves either the last committed disc or the new complete one, never a partial fill; a superseded cook's warm discards only its private `staged` array (bounded wasted refill work), and the plan state dies with the generator.
