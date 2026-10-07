# W106 audit — in-flight-hitches lane

Audited `devin/1791064509-perf-w60` @ `0fc3ff53c` (W105 hitches = e551a8167 + 34f771bfc + 0fe9001be + fixup 4cfe079e1). Static analysis only — no app runs (SwiftShader host), no code changes.

## saturated: false

Five legal contract-preserving improvements with implementation paths remain, all in the residual classes W105 introduced or left adjacent: unguarded generator drives inside the cook, the unguarded reveal-restore inside a `finally`, the tally's private-clock slice inside presented frames, the inline first-K subtree measure, and presented-frame pump lanes that rethrow deterministically into the render loop.

## Ranked findings

### 1. Unguarded `.next()` drives inside the cook silently abandon the whole cook tail — H impact, M effort, low risk

**Evidence:** ~30 `for(;;){ iter.next(); ... await yield }` drives inside `prepareLiveSectorAfterJump` and the opening/recook/post-load admission bodies, whose outer `try` has a `finally` but **no catch**: renderer.js:15403-15908 (jump cook finally at :15908), :14048/:14078 (settled plan/receipt), :15664 (first-flight entities), :15702 (warm ledger), :15726 (collect census), :15877 (pool census), :12589/:15438 (rockEmit), :12875/:12894 (warm/collect twins), :13461/:13472 (seal), :13860/:13907/:14408/:14484/:16021-16057 (sweep/stragglers/census/late/uncompiled), :16594/:16757 (plan/receipt), and boot/admission legs :9933, :10206/:10219, :10890/:10921.

**Mechanism:** a throwing generator step propagates through the finally (admission released, ledger printed) → `compileSectorPipelines`/`prepareLiveSectorAfterJump` rejects → the emit's `.finally` releases the shell latch (:17892) → the rejection lands on `pipelinePrecompileReady` muted by `.catch(()=>{})` (:17936). Everything after the throwing section — deferred-provider splice, entity census, mesh-build enqueues, instance-pool seal, departure sweep — is skipped **with no log**. The arriving sector loads meshless; the reconcile pump then rebuilds the whole working set across presented frames — exactly the in-flight brick class the cook exists to prevent. W105 put per-step catches on the four *dispose* drives (verified landed); the *census/warm/collect* drives that mint the same frames' work are still bare.

**Fix sketch:** wrap each drive's `.next()` in the same contract the dispose drives carry — per-step catch → stamp/log the step → close the iterator → skip or abandon only its section with a `recordOpeningCookStep(..., 'error')` — and replace the silent `pipelinePrecompile.catch(()=>{})` with a one-line `console.warn` on rejection so the failure is diagnosable. Mechanical but wide; a shared `driveStepsCapped(iter, yieldFn, {onStepError, stale})` helper would compress ~30 sites.

### 2. `restoreRevealSteps` drive inside a `finally` — a throw masks the original error and strands half the reveal — H impact, S effort, low risk

**Evidence:** renderer.js:14316-14320 — inside the compile-block `finally`, `restoreRevealSteps.next()` loops unguarded; contrast the mint drive :14255-14273 which catches and only rethrows non-superseded errors.

**Mechanism:** an exception inside the finally (a) replaces any in-flight error, and (b) abandons the reveal-restore partway — the scene is left half-unhidden (minted reveal partially restored). Downstream the cook continues to a stale-check and returns a result object while subtrees are visibility-mismatched → pop-in/out artifacts or whole-batch exposure of the deferred set. Highest-severity single site in the class: it corrupts *visual state*, not just work.

**Fix sketch:** `try/catch` the step; on error log and keep driving (restore rows are idempotent bookkeeping — skipping is the dangerous direction), or fall back to the sync `restoreReveal()` tail if the iter is dead.

### 3. Tally recount slice burns a private 4 ms inside every presented frame during dirty storms — M impact, S effort, low risk

**Evidence:** shadowReceiverTally.js:395-450 (`resolve` loops on `tallyNow()` to `RECOUNT_SLICE_MS=4`), driven from `_syncShadowMapEnabled` → `this._shadowReceiverTally.resolve(this.scene)` at renderer.js:27902, called per presented frame at :25407. No `pacedFrameSpend()` consult, no `notePacedFrameSpend` debit — every other sliced lane (reattach :2405, reconcile :2817, poll, roster :2749, cacheLease :2723, hidden freeze/unfreeze drains :21678/:21816, warm-root park :21026) is wallet-debited; the tally is the lone private clock.

**Mechanism:** under the systematic-disposer-fault case in axis (b) — every corpse's teardown hook throws → `noteRemoved`/`markDirty` every frame — `resolve` pays up to 4 ms *on top of* a wallet the pump lanes already spent, for the whole storm duration → sustained +4 ms/frame presented-frame tax = the hitch class. Storm bounding itself is verified sound: `supersededRecounts` persists across resolves (not reset on early return :447/:450), cap 4 (:400), capped stale settle keeps `dirty` and arms `recountCooldown=RECOUNT_STORM_QUIET_RESOLVES=8` (:424-440) → 8 quiet resolves skip minting; a paused storm self-heals to a clean settle. The residual is wallet isolation + per-visit `notedWalk.visits` Map churn under storms (FIFO-capped 4096 — bounded but storm-duration-long).

**Fix sketch:** pass a budget hook into `resolve` (or have it consult the shared wallet at slice start — park without stepping when `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS`, debit `notePacedFrameSpend(tallyNow()-start)` on exit) — the `_parkBoundedWarmRoots` pattern at :20993-21030 verbatim.

### 4. First-K unmeasured shadow notes pay `O(subtree)` inline inside presented passes — M-L impact, S effort, low risk

**Evidence:** renderer.js:27823-27834 / :27845-27853 — `UNMEASURED_SHADOW_NOTE_EXACT_PER_PASS = 2` (:2027): the first two unmeasured add/remove notes per view-sync pass run `countShadowReceivers(root)` synchronously (shadowReceiverTally.js:313/:326 — full subtree traverse) inside the presented frame.

**Mechanism:** the gate defers correctly past K=2 and while dirty — but a *spaced* trickle of large-subtree removals (one torn hulk every few hundred ms, each carrying its own unmeasured note) never trips the dirty gate and pays two unbounded subtree walks per pass indefinitely. Worst case ~O(corpse subtree) × 2 per frame — hundreds of nodes on a dressed hulk.

**Fix sketch:** bound the inline measure — `countShadowReceivers` already accepts a `measure` out-param counting nodes; flip to `markDirty` past a node bound (e.g. measure.nodes > 128), letting the paced recount absorb big subtrees.

### 5. Presented-frame pump lanes rethrow into the render path — a deterministic step fault is a soft-crash loop — M impact, M effort, medium risk

**Evidence:** renderer.js:2393-2405 (resident reattach), :2439-2444/:2793-2799 (reconcile), :2736-2741 (arrival roster), :2847-2851 (residency poll) — all catch → abandon parked iterator → `throw err` up through `serviceRenderMeshResidency` (:25335), called unguarded inside `render()`; presentationRunner.js:943 try/**finally** → frame() catch :1185 → `[loop] frame error` per frame; `PRESENTATION_STALL_FRAMES` consecutive → `presentationStalled` + frozen canvas with live HUD (:1203-1242).

**Mechanism:** transient faults self-heal next frame — fine. A *deterministic* fault (a persistently corrupt row, e.g. a torn corpse whose subtree throws on every fresh mint) abandons → re-mints → throws every frame → the canvas freezes loudly after ~0.5 s while the loop lives on. The current contract guarantees cleanup but not forward progress.

**Fix sketch:** quarantine the faulting row/iterator key (count consecutive identical-step failures per lane) and degrade to skip-with-repair or the atomic path instead of rethrowing — the tally's capped-stale-settle is the model. Needs per-lane care on what "degraded" means; medium risk accordingly.

## Axis verdicts

- **(a) optic cap ↔ quiet latch — RESOLVED, no residual.** `opticInterest` sets on any in-band optic rec (:596) or live optic entity (:613) *before* the cap check, and the latch only arms on `promoted===0 && shelved===0 && !opticInterest` (:623) — a draining backlog keeps interest true, so the 30-tick rescan cannot outrun it. Hysteresis is real: `exit = enter + (140-80) = +60 WU` (:497), so no boundary ping-pong at the 4+4/tick budgets. Half-promoted pockets read identically: field records pose through `poseRow`→`this._meshes` (:24680) and mint through the same `buildAsteroid`→`opticCellKindOf` path (visualFactory.js:5948, :2431-2443) with shared cached geometries/materials.
- **(b) torn-corpse recount storms — machinery VERIFIED; residuals are findings 3-4.** Supersede cap 4 is persistent-across-resolves (not per-call) → after 4 discards the next walk always completes → capped stale settle → 8-resolve cooldown → bounded. `noteRemoved`'s mid-descent add-note retention (:339-355) keeps over-count direction; visits-map writes are gated on notes/detached presence (:213) and FIFO-capped. `resolve` is never invoked with `force:true` in flight (only call site :27902, no options).
- **(c) mid-seed yield ordering — VERIFIED.** Resume re-verifies the whole open chain before consuming `gapSeed` (:103-157); a dead frame anywhere breaks to `deadAt` marking and the seed is dropped (`else if` :160). Seeded pushes re-read `children[j]` live with a `!node` + `openSet` guard (:170-171) and self-check `detached` (:175). A parent detaching *during* a mid-seed yield: rows pushed after it carry `dead:0`, but at the next yield the stack-wide verification's ancestry probe (:114-117 — seeded rows sit flat on the stack so `f.node.parent !== parentFrame.node` triggers the probe) dead-marks them; the window is ≤`every` stale visits, all over-count (legal direction, per the tally contract). `seededTotal > every*4` self-abandon (:180-186) bounds pathological re-seed churn.
- **(d) remaining unguarded iteration sites — findings 1-2 + 5.** ~60 `.next()` sites total in renderer.js; the five presented-frame service pumps are guarded (abandon+rethrow — residual is the rethrow semantics, finding 5); ~30 cook/boot/admission drives are bare (finding 1); restoreRevealSteps is the worst single site (finding 2). The `_protectedFirstFlightDrainIter` (:2229) correctly nulls and rethrows.
- **(e) presented-frame walks ranked by worst-case node count:** `syncEntityViews` O(visible candidates) — irreducible presentation work, already farSpeck/culled-skipped; `ensureActivityClassified` O(entities) once per sim tick — tick-gated single authority (:25329-25331); `syncAuthoredInstancePools` O(authored records) per frame — draw prep; tally `resolve` O(scene) sliced 4 ms — finding 3; `_noteShadowMesh*` O(subtree)×2/pass — finding 4; `_parkBoundedWarmRoots` O(subtree)/root — wallet-debited + deferred continuation (the exemplar, :20993-21030); `drawnCullRadiusForMesh` O(verts) — 4-measure cadence + stale-serve bias; `_syncWorldPresentationTableMeshes` O(field.rocks+rows) — version/seq/count gated (:24669-24678).

## W105 regression verification

All nine bullets verified concretely on `0fc3ff53c`:

1. **Optic budgets** — promote cap `promoted >= 4 → continue` leaves the record field-resident (:597-601; comment :515-517 "simulates identically"); `opticInterest` sets regardless of cap (:596); demote loop re-scans every tick so capped exits requeue naturally (:609-620).
2. **Ring-emit** — yields every `batchRows` records (:288) and between rings (:291); the maxRadius break `(ring-1)*CELL > radiusCap + CELL` (:281) can't skip in-cap records (record radius ≤ CELL bound); both cook sites consume with the 25-key cap (:12599-12611, :15438-15460); no sorted-array consumer remains.
3. **Freeze/unfreeze drains** — `notePacedFrameSpend` debited in `finally` (:21678, :21816); spent-wallet park clause guarantees ≥1 row per call; unfreeze `mesh.visible` gate drops hide-in-place rows; bound tier (:21764-21775) skips dwell/detach.
4. **Shared flap epoch** — stamped at freeze push (:21563) and unfreeze push (:21687); dwell reads the fresh stamp; cleared on unbind (:21989-22010) so pooled reuse can't inherit it.
5. **Recount prefix rescan** — the brief's `kidCount` symbol no longer exists: W106 superseded it with the indexOf+prefix-rescan machinery (:110-153). Verified equivalently: `sinceYield` charges indexOf (:124) and seeded pushes (:179); growth during suspend seeds `[0, min(shifted,idx))` openSet-filtered (:143-152) — over-count only.
6. **Stale-serve bias** — defer cap is `defers <= 2 + (mesh.id & 3)` (jittered 2-5, not 3 — constant drifted since the brief; mechanism verified): over-budget key-moved misses serve `max-over-LRU × 1.15` only under the cap (:144-163), cadence-expiry branch same cap (:166-173), every record write resets.
7. **Spec-map emits** — runSeq bump on release (:21050-21063), identity guard, stale-run bail (:18627-18628), post-opening rescan arm present.
8. **Dispose drives** — all four carry per-step catch → `sfDespawnPartialTeardown` + log + treat-as-consumed; torn corpses settle via null-measure dirty path; contextLost stamps the flag too.
9. **Never-mounted warm roots** — pushed to `_warmDisposeQueue` pre-stamped `sfDespawnNoted=true`; stamp consumed at drain settle so never-counted rows aren't re-noted.

No W105 regressions found. Residuals are adjacency-class (unguarded non-dispose drives, unbudgeted tally slice, rethrow determinism) rather than defects in the landed machinery.
