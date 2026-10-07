# W105 audit — lane: in-flight-hitches

Target: `devin/1791064509-perf-w60` @ `34f771bfc` (wave 105 tip — `e551a8167` "bound unfreeze restore tier, commit-tail cull stamp, spec-map emits" + `34f771bfc` "ring-emit rock promote, clocked freeze drain, late-emit rescan" on top of `3ed6f56a3`). Golden sim hash contract `0b33dde18752ca52ee6b6be25ded38ab6e86899dc6444a7e47842a2bb785b2d1` — nothing below touches sim; all findings are presentation-side.

## saturated: false

Nine contract-preserving residuals remain. The W105 deltas all verify clean at HEAD — the ring-emit cook, the wallet-debited freeze drain, the bound unfreeze tier, the spec-map emits, and the gap-seed resume pass all work as designed — but the audit still finds: one uncapped burst class inside a single sim tick (optic promote/demote), one settled-state correctness residual in the new gap-seed (below-cursor inserts still under-count), the mounted-gate asymmetry that leaves fat warm roots paying atomic O(subtree) teardown inside emits, unguarded async dispose drives, the unfreeze drain's missing wallet gate, a stale-serve under-cull direction, the shared flap epoch ping-pong, an unbudgeted resume pass, and a drive-stamp clobber race. Ranked by worst-case presented-frame cost and magic-frame reach.

---

## Ranked findings

### F1 — Optic-lattice promote/demote loops run uncapped inside one sim tick

**Evidence:** `src/world/asteroidField.js:581-591` (promote loop) and `:597-606` (demote loop) inside `tickOpticFieldRocks` (`:541-623`), called every sim tick from `src/systems/world.js:4390`. Each `promoteAsteroidFieldRock` (`:404-460`) pays `catchUp` + `resolveAdmitOverlap` (a 3-pass ship scan, `:376-397`) + `spawnEntity` + a synchronous `entity:spawned` emit fan (~24 listeners including the Rapier body mint — the cook's own pacing comment cites this fan at `renderer.js:12574-12575`). Each `demoteOpticAsteroidToField` (`:463-491`) pays `removeEntity(id, {immediate:true})` — a removal emit fan + entity-index update + `insertAsteroidFieldRock`.

**Mechanism.** Crossing the decode disc on a dense optic pocket (`opticTableRadii` `:493-499`, quiet latch `:558-574` covers only the no-interest case) promotes every in-disc record in ONE tick — dozens of spawn transactions + emit fans + physics-body mints inside a single sim step — and a symmetric burst of demotes on exit. The cook path paces exactly this same promote call to 4-per-yield (`renderer.js:12576-12579`) and the far-actor restore loop respects `budget.request` (`farActorTable.js:671-675`) — the optic lattice is the one promote path with no cap at all. This is the lane's title class: a long frame during flight, at a visible boundary crossing, caused by a burst of spawn work the shell cannot absorb.

**Fix sketch.** Per-tick cap on both loops (4–8, matching the cook's pacing constant): drain candidates into a small pending list, promote/demote the first N per tick, leave the rest field-resident (invisible, lightweight sim) until their tick — the same contract the far-actor table already runs. Records arriving a tick or two late are indistinguishable from slightly-later boundary entry.

**Effort:** S. **Impact:** H — biggest remaining single-tick burst in flight; every optic-pocket entry/exit hits it. **Risk:** low — membership/ordering unchanged, only pacing; sim reads stay identical (field records simulate the same as live rocks), hash safe.

### F2 — Gap-seed misses below-cursor inserts → a settled wrong-0 drops the shadow map

**Evidence:** `src/render/shadowReceiverTally.js:124-148` — the W105 insert-before-cursor seed covers `children[idx..shifted)` only. Real below-cursor mutation sites exist: `partsLibrary.js:5097-5098` (`children.splice(i,1)` + `unshift` — lands at index 0, below any nonzero cursor), `bloom.js:806-807` (splice-out + splice-in at `previousIndex`), `openingGpuAdmission.js:651` / `:720-721` (`host.children.splice(at, 0, ...)`), `renderer.js:6060-6061` (reorder helper). Consumers gate on the settled count: `shadowMapActive = _shadowSettingOn && (count > 0 || tally.dirty || receiversDirty)` at `renderer.js:25327-25330` / `:24786-24789`; false → `_activeShadowCamera = null` (`:25348`) → `_syncAsteroidInstanceSubmission(null)` (`:25359`) and no shadow refresh at all.

**Mechanism.** A `children.splice(p, 0, x)` with `p < parentFrame.idx` puts the inserted node strictly below the gap-seed's `from` — it is never walked, so the recount finishes *low*. The W105 commit fixed the `[idx, shifted)` window precisely because under-count is the illegal direction (its own message: "re-walk the skipped gap (bounded over-count) instead of under-counting receivers") — the residual is the symmetric window below the cursor. The in-flight stale-0 window is already defended (`:24792-24795` comment: the gate's own conservative-on verdict covers a recount in progress) — but a *settled* wrong 0 clears `dirty`, so `shadowMapActive` reads false and the shadow map deactivates / asteroid submissions skip until the next note or mutation event. Visible effect: shadows drop mid-flight.

**Fix sketch.** Stamp `parentFrame.kidCount = children.length` at push. On a resume-splice where the array grew, the consumed prefix is membership-suspect: either scan `children[0..idx)` for nodes neither visited nor in `openSet` and seed those (O(idx) per splice, rare — cheaper than re-minting), or kill the walk via `deadAt` and let the supersede-capped re-mint restart it. Both keep the count conservative-on while making the miss unreachable.

**Effort:** M. **Impact:** M-H — narrow window (suspended recount + below-cursor ancestor splice) but it produces a settled state the conservative-on defenses explicitly do not cover. **Risk:** low.

### F3 — Never-mounted warm roots pay atomic `disposeObject` O(subtree) inside release emits

**Evidence:** mounted→paced-lane gate at `renderer.js:19160-19183`, `:19719-19733`, `:21002-21056` — `wasMounted` roots push to `_warmDisposeQueue`; never-mounted roots take `disposeObject(root)` inline at `:19178`, `:19731`, `:21015`, `:21052`. `disposeObject` (`:29040-29057`) is the synchronous whole-subtree teardown.

**Mechanism.** The gate's rationale skips the receiver note (a never-mounted root has no settled shadow state to settle — correct), but the *cost* asymmetry is the residual: a fat composed warm tree released before it ever mounts (crucible discard, roster release before attach) pays the full O(subtree) geometry/material/texture walk atomically inside the `run:ended`/discard emit chain — the exact presented-frame-adjacent work the warm lane exists to pace. A release burst of K never-mounted roots stacks K atomic teardowns in one frame.

**Fix sketch.** Push never-mounted roots to `_warmDisposeQueue` too, with `sfDespawnNoted = true` pre-stamped so the drain skips the nets-to-nothing receiver note. Same paced lane, no note divergence, and the burst inherits `DESPAWN_DISPOSE_BUDGET_MS` + backlog doubling automatically.

**Effort:** S. **Impact:** M — turns the last atomic warm-teardown class into paced work. **Risk:** low.

### F4 — Unguarded `.next()` in async dispose drives: a hook throw aborts the whole sweep, no flag, no settle

**Evidence:** `renderer.js:10571-10577` (`disposeBoundaryObject` drive — plus its contextLost abandon at `:10592` dropping a parked iterator mid-teardown), `:12940-12942` (`leftoverDispose`), `:15744-15746` (`departDispose`), `:2058` (`flushDisposeQueueLane`). Compare the despawn lane (`:2169`): step-throw is caught, stamps `sfDespawnPartialTeardown`, settles a dirty note, advances the head — consumed by `_syncShadowCasterPolicyChecked` at `:26354-26361`.

**Mechanism.** These async drives call `disposeIter.next()` bare inside their loops: a throwing disposer hook (or a `disposePreparedAuthoredBoundary` throw inside the walk — reachable at the release sites `:19173`/`:19726`/`:21010`/`:21047`) propagates out of the drive, abandons every queued corpse behind the current one, skips the measured receiver-note settle (dirty-only recovery — conservative but the tear is invisible to the partial-teardown path), and propagates up through whatever cook/provider pass was driving. The despawn lane's contract — tear is flagged, settle is cheap, queue survives — is the template these never got.

**Fix sketch.** Wrap each drive's `iter.next()` in the same per-step try/catch: on throw, stamp `sfDespawnPartialTeardown`, note dirty (skip the measured settle), advance past the corpse, log, continue. Mechanical replication of an existing pattern.

**Effort:** S-M. **Impact:** M — converts a sweep-killing throw into a per-corpse cost; protects the exact settle the shadow tally depends on. **Risk:** low.

### F5 — `_drainHiddenUnfreezeQueue` mints + restores unclocked inside `syncEntityViews` — the freeze drain's wallet gate never got a twin

**Evidence:** `renderer.js:21640-21737` — up to `HIDDEN_FREEZE_MINT_ROOTS_PER_PASS=6` mints, `NODE_BUDGET_PER_PASS=4096` node-steps, plus the W105 bound-restore tier (`UNBIND_HIDDEN_RESTORE_INLINE_PER_PASS=2`, `:916`, `:21686-21697`) — with no `notePacedFrameSpend` debit and no `pacedFrameSpend` park. Called unconditionally at the tail of `syncEntityViews` (`:24335`). The freeze drain got the W105 debit+park treatment (`:21605-21614`); the unfreeze twin didn't.

**Mechanism.** A mass re-show — roster re-mount, unbind storm, sector flip — mints ≤6 unfreeze roots + ≤4096 node-steps + ≤2 owed restores every sync pass regardless of the frame's remaining wallet. The freeze direction measures itself against `flightMode` spend and parks its tail; the unfreeze direction stacks the same magnitude of work on an already-over frame for free. Symmetric queues, asymmetric metering.

**Fix sketch.** Same contract as the freeze drain: debit `notePacedFrameSpend` after each minted root, park the tail when the wallet is spent, guarantee the first row. Accounting + park only — queue semantics unchanged.

**Effort:** S. **Impact:** M — mass re-show is a real flight event (sector re-enter, roster re-warm); the burst lands inside presented frames today. **Risk:** low — worst case re-shows spread over a few more passes, which is the dwell's existing behavior.

### F6 — Stale-serve under-cull: a promote-storm composition can exceed the ×1.15 envelope and cull real content

**Evidence:** `src/render/visualCullRadius.js:144-160` — over-budget key-moved misses serve `max-over-LRU × DRAWN_CULL_STALE_SERVE_BIAS` (`:144-154`); cadence-expiry defers via `cached.calls -= 8` (`:157-160`) with no bound on consecutive defers; the honest never-measured path pays the Box3 walk (`:161-175`).

**Mechanism.** The serve is safe for *shrinking* compositions and for stable ones, but the legal direction is over-draw, not under-cull: a hull whose new composition grew >15% beyond every radius still in the LRU (mass-admission storm minting a bigger family than any measured key — exactly the F1/optic burst window, or a lod family swap mid-storm) serves a stale envelope until a measured pass lands. Result: `drawnCullRadiusForMesh` returns a radius below the true envelope → the culler rejects meshes inside the real bounds → content pops *out* at the frame edge — the magic-frame violation this lane hunts (things must not pop). The deferred `calls -= 8` retry is bounded per defer but unbounded in sequence — a sustained over-budget stretch keeps serving stale indefinitely.

**Fix sketch.** Direction-check the stale serve: when `radius×bias` would flip the verdict to *cull* (candidate inside stale-envelope×bias but the mesh's own measured bounds hint larger), pay the walk anyway — under-draw is legal, under-cull is not. Alternatively exempt promote-direction key-moves (incoming key with no measured history for the *newer* composition) from the stale serve. Cap consecutive cadence defers (e.g. 3) then force the walk.

**Effort:** S-M. **Impact:** M — rare window, but it is the wrong-direction failure (visible pop-out) rather than a perf cost. **Risk:** low — worst case pays a few extra Box3 walks during storms.

### F7 — Shared flap epoch: a ping-pong row still mints + restores every ~8 passes

**Evidence:** freeze dwell stamps `sfHiddenFreezeDwl` per-direction (`renderer.js:21546-21551`, `FLAP_DWELL=3` `:908`); unfreeze dwell likewise (`:21671`). Each queue lane only sees its own stamp.

**Mechanism.** The ping-pong sequence the dwells were built to kill still runs: row culls → freeze queued (dwl = seq) → re-shows 4 passes later → unfreeze queued (dwl = seq′) → mints restore at seq′+3 → re-culls → freeze queued (dwl = seq″) → mints freeze at seq″+3. A row oscillating with period ≥ ~8 passes (a HUD-scale subtree flapping near the cull boundary, an entityView toggling `visible` on a modest cadence) pays a full freeze mint + bound restore every cycle — ~2 subtree walks per row per ~8 passes, forever, at steady state. Both dwells pass because each measures only *its own* direction's age.

**Fix sketch.** One shared `sfHiddenFlapSeq` stamped by BOTH queue pushes; both drains dwell on `seq - lastFlap >= FLAP_DWELL`. A row that changes direction inside the dwell window never mints — flap churn collapses to zero mints; a stably-hidden row mints after 3 passes exactly as today.

**Effort:** S-M. **Impact:** M — eliminates a steady-state per-cycle subtree-walk pair for oscillating rows. **Risk:** low — worst case a perpetually-flapping row keeps its matrices live (pre-W100 behavior), strictly better than paying mints that get thrown away.

### F8 — Recount resume pass runs unbudgeted inside the slice

**Evidence:** `shadowReceiverTally.js:93-155` — the once-per-yield resume pass (detached-suffix kill, ancestry probe, per-frame `indexOf` re-index, gap-seed pushes) runs atomically inside the segment before the walk resumes; its work doesn't count toward `sinceYield`/`RECOUNT_NODES_PER_SLICE` (512) or the slice clock.

**Mechanism.** Pathological shape: a parent with K children takes a splice mid-suspend → the resume pushes K frames in one segment (K unbounded — a scene root splice seeds every root); per-frame `indexOf` is O(siblings) × depth — a deep chain over fat parents pays depth×siblings atomic. Both are bounded by structure (depth ≤ tree height, K ≤ children) but "structure" here is a full subtree fan-out — the same scale the 512-node slice exists to amortize.

**Fix sketch.** Charge chain frames and gap-seed pushes to the same per-slice budget the walk uses; cap gap seeds per resume (the unvisited remainder re-seeds on the next resume — walk order unaffected). Pairs naturally with F2's fix (the prefix-scan alternative is already O(idx) — charge it the same way).

**Effort:** M. **Impact:** L-M — needs a splice landing mid-suspend AND a fat ancestor; bounded overrun inside one presented frame when it hits. **Risk:** low.

### F9 — Stale cohort drain clears a newer drive's stamp → concurrent drives

**Evidence:** `renderer.js:18520` `this._rosterPrewarmCohortDrain = null` runs unconditionally at the end of the drive IIFE; mint stamps at `:18522`. Release bumps `_rosterPrewarmRunSeq` (`:20995-20997`) but does not cancel the in-flight drive — a stale drive's settle still executes the clear after a newer drive minted.

**Mechanism.** Window: release lands mid-drive → emit arrives → mints drive2, stamps it → drive1 resumes to its tail and nulls the stamp → next emit sees null and mints drive3 → two live drives both draining `_rosterPrewarmEmitQueue`. The spec-map dedupe (`_rosterPrewarmIds`/needsWork) prevents double *work*; the cost is double pending entries in `_rosterPrewarmPending` and duplicated drive bookkeeping — a shell-hold wait can observe and wait on a stale drive's drain.

**Fix sketch.** Identity-guard the clear: capture the drive reference and `if (this._rosterPrewarmCohortDrain === self) this._rosterPrewarmCohortDrain = null` — one-line change; the run-epoch machinery already retires the stale drive's *work*.

**Effort:** S. **Impact:** L — narrow window, dedupe absorbs the work; residual is pending-set pollution. **Risk:** trivial.

---

## Fresh-hunt axes — enumerated bounds

**(a) Resume-pass depth bound vs `nodesPerSlice`:** enumerated at F8 — the pass's atomic cost is O(depth) frames + O(siblings) per `indexOf` + O(gap) seeded pushes; the pathological input is a batch splice on a fat ancestor (K children → K frame pushes in one segment) or a deep open chain over fat parents (depth×siblings product). Yes — chain frames and seeded pushes should count toward `nodesPerSlice`; the below-cursor *correctness* residual of the same pass is F2.

**(b) Dead-frame laziness/leaks:** verified clean. `deadAt` short-circuits the walk (`:93-102`); dead frames still resident in the stack pop through the normal path (`:166`) with `openSet.delete` — no leak (frame objects die with the stack, openSet drains on pops), and the lazy-pop cost equals the eager version's. `notedWalkRootFinished` stays false until a real pop — conservative-on, correct direction. No finding.

**(c) Shared flap epoch:** the ping-pong sequence is queue(freeze)→dwell→show→queue(unfreeze)→dwell→mint-restore→re-cull→queue(freeze)→mint-freeze — enumerated at F7; one shared `lastFlap` stamp kills the per-cycle mint pair.

**(d) `sfDespawnPartialTeardown` coverage gaps, ranked:** (1) async drives' unguarded `iter.next()` — `disposeBoundaryObject` `:10577`, `leftoverDispose` `:12942`, `departDispose` `:15746` — a hook throw aborts the sweep with no flag and no settle (F4); (2) the `disposeBoundaryObject` contextLost abandon at `:10592` drops a parked iterator mid-teardown — torn boundary, no flag; (3) `disposePreparedAuthoredBoundary` throws at the release sites `:19173`/`:19726`/`:21010`/`:21047` — same shape, inside emits; (4) sync `disposeObject` at the never-mounted sites `:19178`/`:19731`/`:21015`/`:21052` — flag is moot on a terminal root but the throw still propagates (F3's sites); (5) `flushDisposeQueueLane` `:2058` — terminal-path severity. The despawn lane's own coverage is correct: mint-fail can't have torn anything, so no flag there is right (`:2140-2150`).

**(e) Mounted-gate asymmetry:** F3 — never-mounted warm roots take atomic inline `disposeObject`; the paced lane + pre-stamped `sfDespawnNoted` covers them.

**(f) Remaining presented-frame walks, ranked by worst-case node count:**
1. `scene.updateMatrixWorld` unforced per frame (`renderer.js:28162` + opening stepped twin `:24769-24809`) — O(dirty subtrees), the engine baseline; already unforced/stepped, not a finding.
2. Never-mounted `disposeObject` inline ×K roots (F3).
3. Unfreeze drain mints + bound tier, ≤6+4096 nodes+2 restores unclocked (F5).
4. Sync `unfreezeHiddenSubtreeMatrices` ≤3/unbind-pass — O(subtree) each, bounded count.
5. `countShadowReceivers` sync on ≤2 unmeasured notes/pass — O(subtree) each, capped.
6. `drawnCullRadiusForMesh` Box3 walks ≤4/pass + never-measured extras — O(subtree) each, capped (F6 covers the serve direction).
7. Recount resume pass O(depth + gap) per yield (F8).
8. Stepped recount walk — 4 ms / 512-node bound, paced.
9. `_pendingHiddenFreeze` compaction O(queue) per invoke (`:21536-21544`).
10. `settleRebuildBridges` ≤32/pass.
11. Tally paced resolve — O(notes).

---

## W104 regression verification — all 8 items confirmed present at `34f771bfc`

1. **Unmeasured-note pass budget** — `UNMEASURED_SHADOW_NOTE_EXACT_PER_PASS = 2` at `renderer.js:2027`; `_noteShadowMeshAdded :27729-27751` / `_noteShadowMeshRemoved :27753-27770` gate exact measures; `_unmeasuredShadowNotePass :27776-27785` keyed on `_viewSyncSeq` (bumped at `:23775`). ✓
2. **drawnCullRadiusMax + stale-serve** — `visualCullRadius.js`: `DRAWN_CULL_STALE_SERVE_BIAS = 1.15 :82`, LRU 8 + stash-before-consult `:93-117`, hit restore + max-ever `:118-134`, over-budget max-over-LRU×bias serve `:144-154` (W105 refinement — a lod0-era envelope decays through key-move storms), cadence defer `:157-160`, Box3 walk `:161-175`, max-ever `:183`, `primeDrawnCullStamps :197-224`. ✓ (residual direction: F6)
3. **Stepped freeze/unfreeze mints + flag-keep dwell** — `NODE_BUDGET_PER_PASS=4096 :904`, `FLAP_DWELL=3 :908`, `VISIT_PER_PASS=1024 :898`, `MINT_ROOTS_PER_PASS=6 :891`; freeze drain `:21505-21616` (dwell `:21546-21551`, parked-iter checks `:21577-21584`, W105 wallet debit `:21605-21614`); unfreeze drain `:21640-21737` (dwell `:21671`, W105 bound tier `:21686-21697`, `sfHiddenFrozen` deleted `:21698`); kept-flag queue-time cancel `:21478-21494`; unbind clears queued/seq stamps + `iter.return` kills `:21908-21960`. ✓ (residual: F5, F7)
4. **Frame-stack recount** — `shadowReceiverTally.js:65-196`: stack IS the open ancestor chain, once-per-resume O(depth) verify `:93-155` (detached-suffix kill, ancestry probe, splice re-index, W105 gapSeed `:124-148`), visits cap `NOTED_WALK_VISITS_CAP=4096 :201`; sync `recount()` mints steps twin with `notedWalk=null :326-341`. ✓ (residuals: F2, F8)
5. **Warm dispose lane** — `drainWarmDisposeQueue :2044-2047` shares `drainDisposeQueueLane`; live-then-warm ordering + leftover budget `:2301-2311` (W105: warm inherits live lane's remaining wall budget on forced drains); pushes at the wasMounted gates `:19160-19183`/`:19719-19733`/`:21002-21056`; flushes `:18238`/`:22290`; init `:10307`. ✓ (residual: F3)
6. **Ring-ascending field walk** — `queryAsteroidFieldNearestSteps :251-294` emits Chebyshev rings with per-ring yields `:288-291` and `maxRadius` early-break `:281`; cook consumes it paced at `renderer.js:12555-12584` with 4-promotes-per-yield (W105). ✓
7. **Roster re-emit machinery** — `_admitSurvivalRosterPrewarm :18392-18540`: spec-map dedupe + merged exemplar union (W105, replaces the FIFO), `_rosterPrewarmRunSeq` epoch guard (W105 retires mid-drive releases per-spec), queued emits `:18429+`, stamp clear `:18520` (F9 residual), late-emit `_postOpeningRescanRequested :18536` (W105); release `:20983-21060`. ✓
8. **`sfDespawnPartialTeardown`** — remount-abandon `:2118`, step-throw catch `:2169`, mint-fail head-advance without flag `:2140-2150` (correct complement — nothing torn yet), consumed by `_syncShadowCasterPolicyChecked :26354-26361`. ✓ (residual coverage gaps: F4)

**W105 deltas verified:** ring-emit rock promote paced (`:12550-12584`); freeze drain wallet-debited (`:21605-21614`); bound unfreeze restore tier (`:21686-21697`, `UNBIND_HIDDEN_RESTORE_INLINE_PER_PASS=2 :916`); commit-tail `primeDrawnCullStamps` at authored publish tails + LOD family install (`:197-224` + call sites); spec-map emit coalescing + run-epoch guard (`:18392-18540`); late-emit rescan (`:18536`); gap-seed re-walk (`shadowReceiverTally.js:124-148`). All behave as committed; residuals are enumerated above, not regressions.

No test failures were investigated (audit lane is read-only; suite not run).
