# W113 audit — popin-admission lane

`saturated: false`

audit head: `e83550298` on `devin/1791416524-perf-w110`
W112 landed: `a3edd9849` (in-flight-hitches), `e83550298` (wave-112 log; the popin machinery
rides the same tree)

Three new contract-preserving findings, all with concrete fix paths. The headline is P1: W112
put `forcedFrameSpend() < FORCED_FRAME_BUDGET_MS` consults in front of every forced-start gate
(seven sites now), but not one of them *debits* the wallet it consulted — sibling lanes all read
the same spent-free snapshot, so after a degraded-present stretch every skip-cap lane can
forced-start on the same presented frame. P2 is the residual the brief's item (d) predicts:
the rescue's deferred-ownership carve-out only covers the arm's own depth leg.

---

## Findings (ranked)

### P1 — Every forced-start consult site reads `forcedFrameSpend()` and none of them debits it

Evidence — consult sites that only consult:

| Site | Forced-start releases | Released work metered? |
|---|---|---|
| `src/render/deepSkyPlates.js:228-232` | `pump()` commits `initTexture(texture)` — whole-plate GPU upload in the present | No — `deepSkyPlates.js` has zero `noteForcedFrameSpend`/`notePacedFrameSpend` calls; `lastUploadMs` is stats-only |
| `src/render/spaceBackground.js:1874-1881` | `_ensureNebulaBake('L1'|'L2')` — full-res RT bake + first `NEBULA_FRAG` link + mip chain | No — `spaceBackground.js` has zero debits on either ledger |
| `src/render/spaceBackground.js:2810-2816` | wormhole `_ensureNebulaBake('L1')` + `createWormholePipelineMesh` | No |
| `src/render/partsLibrary.js:13622-13629` | `prepareRenderPackagePoolAdmission` + `activateRenderPackagePoolAdmission` — compile+touch pass + slot commits | The compile batches ride their own pacing internally; the consult that released them lands no forced debt |
| `src/render/partsLibrary.js:7413-7429` | upgrade pick: `state.jobs.sort` (memoized verdicts) + admit | No — sort is sync on the consulted frame |
| `src/render/renderer.js:24732-24746` | mesh-build resumed-row release | Released builds debit *paced* per segment (not forced) |
| `src/render/renderer.js:24840-24856` | mesh-build completed-row release | Same — paced only |

Contrast the reactive forced lanes, which all do `consult → work → noteForcedFrameSpend(elapsed)`:
mint rescue (`renderer.js:29777`), staged-rescue + aborted-park + denied-park mints
(`29939`, `30666`, `30677`), degrade twin (`3727`), holdExempt generator (`29911`/`29917`).
The wallet's own comment states the intent — "forced units carry real debt". These seven sites
carry none.

Mechanism: every skip counter saturates during the same sustained-late stretch (8 skipped
presents). On the first frame any consult passes, `forcedFrameSpend()` still reads ~0 because
nothing since the consults has debited — so all seven lanes pass their consult and the wallet
only accumulates whatever *reactive* forced units already ran. A plate `initTexture` + an L1
RT bake + a wormhole promote + a pool compile+touch + an upgrade sort + two build-gate
releases can all land on one presented frame — the canonical magic-frame shape, now with seven
concurrent providers instead of one.

The two build gates are the milder clause: their released work is at least paced-metered, so
the frame cost lands in a ledger — just not the forced account the consult honored. The five
W112 sites release work metered nowhere.

Fix sketch: post-unit capped debit at each site —
`noteForcedFrameSpend(min(elapsed, FORCED_FRAME_BUDGET_MS))` right after the released unit
returns (plates: after `initTexture`; bakes: after `_ensureNebulaBake`; wormhole: after the
promote+mesh create; pool lane: at `prepare…` settle; pick: after the sort; build gates:
optional — their released work is paced-metered, so debiting the consult release itself or
leaving them consult-only are both defensible). The cap keeps one oversized unit from
poisoning more than its own frame; the skip streak stays armed either way, so deferred
siblings fire on the next frame with room. Behavior-preserving: worst case is more deferral
during churn — the skip loop these lanes already run.

Effort: **M** (five sites need the debit + `now()` capture; each site's defer shape already
exists) · Impact: **H** — the all-consults-same-frame case is the realistic one after any
8-late-frame stretch (sector arrival is exactly that) · Risk: **L**

---

### P2 — The unparked-roots rescue's deferred-ownership carve-out only covers the arm's own compile leg

Evidence: `src/render/renderer.js:30242-30272`. The rescue's restore loop correctly skips
`this._deferredDepthStageRoots.has(root)` (30244) — "its marks are still landing; the settle
owns restore" — and deletes `pending`/`_withheldDepthCasters` together (30268-30269). But
`_deferredDepthStageRoots` is populated only by the arm's own depth leg (`pendingDepthRoots`
at ~29131-29137 → `add` at the compile sites ~29375/29414/29500, `.finally` cleanup at
29636-29642). The *other* in-flight `driveCompileShadowDepthPipelines` call sites —
enable-stage ~14654/15052/16444, opening ~12806, admission compiles ~10493/10761/17586 —
do not stamp their subjects into any ownership set.

Mechanism: a root sitting in `pending` whose withheld casters are co-subjects of a foreign
in-flight compile (e.g. an enable-stage scene-wide unstaged collect that swept the same
subtrees) is invisible to the carve-out. On a ≥3-fault epoch the rescue calls
`driveShadowPolicySteps` on it, restores `castShadow`, and deletes the withheld Set — while
the foreign compile's marks are still landing async. If those marks commit *after* the
restore, the linker sees casters as already-present; the un-withhold-before-link window the
withhold contract exists to close re-opens.

Reachability is narrow — it needs a pending root to be a co-subject of an unrelated in-flight
compile *and* a faulted epoch concurrent with that compile's mark-land window — but the fix is
mechanical and the failure is the exact cold-link class this lane has spent three waves
killing.

Fix sketch: route every deferred-compile subject set through the same ownership Set (mint the
subject list → `_deferredDepthStageRoots.add(root)` at compile start, `.finally` remove),
or — cheaper — have the rescue check mark currency per withheld mesh
(`casterDepthMarkCurrent(mesh, lightSig)`) before restoring: marks-landing meshes stay
withheld; mark-current meshes restore immediately. The second option doesn't need to know
which compile owns the work.

Effort: **M** (either five call-site stamps or one per-mesh currency check in the loop) ·
Impact: **M-L** (narrow window, but the failure mode is the contract violation itself) ·
Risk: **L-M**

---

### P3 — `pipelineReadiness`'s skip-then-force resume consults no wallet

Evidence: `src/render/pipelineReadiness.js:421-423` —
`const gate = shouldStartHeavyAdmissionEventually(lastPresentDtMs, this._resumeSkipStreak);`
then `if (!gate.start) {…park…}` else fall through to `this._pipelines.runPipelines('resumed')`
→ `flushQueuedThrough('resumed', this._resumeBatchSize || 1)` which arms an
`enqueueLink`/`enqueueProgramLink` batch.

Mechanism: this is the same consumer class as the W112 five — `gate.start` is treated as a
license. Bounded by `resumeBatchSize` (default 1 batch) and the link work is async, so the
unit is smaller than P1's — but the flush still arms a program-link batch on a frame the
forced wallet may already have spent, on a lane (pipeline readiness) whose whole point is
bounded in-flight work per present. Now that W112 established the consult shape for the
sibling lanes, this is the remaining skip-cap consumer with no `forcedFrameSpend()` check.

Fix sketch: `if (!gate.start) park; else if (forcedFrameSpend() < FORCED_FRAME_BUDGET_MS)
runPipelines` — on forced-but-broke, park with the streak uncommitted (same shape as the
W112 sites: `_resumeSkipStreak` only commits on a real start). One condition + reuse of the
existing park path.

Effort: **S** · Impact: **L-M** (small unit, but it fires on worst-case frames) · Risk: **L**

---

## Lane hunts

**(a) consult → debit gap** — reported as P1. Additional edge worth noting inside the same
class: for the *async* pool lane the consult measures frame F's `lastPresentDtMs` but the
`await prepareRenderPackagePoolAdmission` spend spreads across F+1… — consult-at-start is the
only sensible shape for async units (documented, not a defect; the settle-time debit in the
fix sketch is the honest accounting). The whole-lane ordering verified: no consult site is
double-armed, `skippedCount` commits only on real starts, forced-but-broke keeps the pending
flag + streak (plates `return false`; bakes/wormhole re-pend; pool lane relies on
`drivePoolAdmissionIfUnclaimed` re-arm; pick keeps the job queued).

**(b) release vs re-collect vs re-park** — verified fail-closed end-to-end. Release clauses at
`renderer.js:28794`: the union is `{epoch drift, sig drift (re-collect sig !== mint sig),
scale drift, denied + allowCast flip}` — every clause deletes `parkedMap` +
`_withheldDepthCasters` and re-queues the entry, so the root re-collects under the *live*
census (`collectGate` opens via `parkedRelease || parkedReleaseOnDrift ||
parkedReleaseScaled`). The only keep-and-rekey is `denied === true && allowCast === false`
(28684) — a census-independent verdict (proven unmarkable), so preserving the withheld Set is
correct. Drift never releases a root whose marks are still landing — deferred roots live in
`pending`/restore re-queue, not in parks (`_deferredDepthStageRoots` requeue at 29131-29137;
the restore loop `pending.set` them before the verdict consult). The W112 back-fill drift
guard is exactly what this clause needed: `lightSigEpoch !== shadowCensusEpoch()` compared
*before* re-key, mismatch → the drift clause fires → live re-collect.

**(c) remaining un-budgeted work on consulted frames, ranked** —
1. The seven consult sites' released units (P1 — plates/bakes/wormhole/pool/sort).
2. `pipelineReadiness` forced resume (P3).
3. `admitNextUpgradeJob`'s post-consult `state.jobs.sort` — O(n log n) memoized-verdict
   compares on the consulted frame; bounded by job count, folds into P1's post-unit debit.
4. `activatePackageSlotsTransaction` per-slot matrix commits — sync per live-slot work after
   the pool consult; folds into P1.
Checked and clear: the rescue loop itself is wall-bounded (`rescueDeadline = +8 ms`,
`shouldContinueAdmissionSlice`-guarded between roots — min-1 is a single restore, acceptable);
`hoistDeadlineGlassMeshBuildsSteps`/`_openFirstImageCaptureSteps`/`_syncPresentedGlassHotRenderSteps`
count-stride with O(1) row bodies (a flag flip / trap set — the row *is* the unit);
`pickDecodeRunwayCandidatesSteps`/`runDecodeRunwaySteps` run `SHADOW_DEPTH_LEDGER_ROW_BUDGET`
legs under their own driver slice clocks; `reattachResidentGpuMeshesSteps` now strides
`%64 || ≥2 ms elapsed` (W112 F4 verified at `renderer.js:1987-1996`).

**(d) pending-delete vs deferred-ownership pairing** — verified: `pending` is deleted only
inside the rescue; the deferred-owned skip (`_deferredDepthStageRoots.has(root) → continue`)
never deletes, so deferred roots survive the rescue unparked and get restored by their own
compile's settle — pairing correct. `pending ∩ deferred` is non-empty *by design* during a
deferral (restore re-queues them at 29131) and the carve-out holds. Residual reported as P2:
ownership covers only the arm's own leg — foreign compiles' subjects are invisible. One more
edge checked and mostly covered: the detached-root path (`!root.parent → pending.delete`)
leaves `_withheldDepthCasters`/stamps behind, but the unbind seam already cleans all five
depth-stage structures per owner (`renderer.js:23376-23385`, `23666-23675`) and the arm-time
`_sweepDetachedDepthStageRoots` sweeps both pending and parked — a root detached *without*
unbind (raw `scene.remove`) would retain a withheld Set until queue/key churn, same exposure
the pending sweep already carries; nit, not a finding.

---

## W112 popin regression verification — all items PASS

1. **P1 — back-fill drift guard before re-key** — PASS. `renderer.js:28627-28642`:
   `parkedEntry.lightSigEpoch !== shadowCensusEpoch()` is compared *before* the re-key
   assignment; mismatch sets `parkedRelease = parkedReleaseOnDrift = parkedReleaseScaled =
   true` → the release union at ~28794 deletes `parkedMap` + `_withheldDepthCasters` →
   re-collect under the live census via the `collectGate` disjuncts at 28741. The
   `allowCast === false` keep-and-rekey clause (28684) still preserves the withheld Set for
   census-independent denials — the correct asymmetry.
2. **P2 — forced-wallet consults at all five skip-cap sites** — PASS.
   `deepSkyPlates.js:228-232`, `spaceBackground.js:1874-1881` (nebula) + `2810-2816`
   (wormhole), `partsLibrary.js:13622-13629` (pool) + `7413-7429` (upgrade pick — the
   glass carve-out `entityIsOnReadableGlass`/`deadlineGlassOnly` at 7416-7422 intact).
   `skippedCount` commits only on a real start; forced-but-broke keeps the pending flag and
   the streak uncommitted — exactly the shape the brief asked for. (Whether the consult is
   *honored* is this wave's P1 — a consult that never debits is half the machinery.)
3. **P3 — degrade rescue debit hoist** — PASS. `renderer.js:3705`: `twinStart = clock()`
   sits above the evaluator mint, `entityList.slice()`, AND `collectMeshPresentationEntities`
   (~3707-3711); the single `noteForcedFrameSpend(twinElapsed)` at ~3727 covers the whole
   rescued span. The collect is inside the wallet window it gates.
4. **P5 — envelope catch at function level** — PASS. `renderer.js:~3859-4070`: the
   `for(;;)` loop is wrapped in `try {…} catch (err) {…}`; the catch mirrors the
   instrumented exits — `park-for-epoch` + `noteLaneFault('holdExemptStepped', true)` +
   `console.warn` + `notePacedFrameSpend(now() - started)` + `return 0`. Throws in
   `abandonHoldExempt*`/evaluator mint now land in the ledger and the fault lane.

Shared-lane item verified alongside (the lod lane's F2 — unsigned collect gates): the two
post-opening 512-chunk collect sites both break unsigned —
`renderer.js:17660` (`chunkSig == null → break`) and `17747-17749` (`rescanSig == null →
break`) — routed through `freshDepthLightSig` → `_depthCollectLightSig`, which carries the
memo → per-`_viewSyncSeq` cache → null-gate → `noteForcedFrameSpend(mintElapsed)` shape
(`29308-29326`). And the mark compares that must answer the live sig re-consult the memo when
their arm-time `lightSig` was null: `markSig` (29696), `verdictSig` (29890), `leftoverSig`
(29966) all use `lightSig != null ? lightSig : this._shadowCensusForFrame()`; an unsigned
verdict (`verdictSig == null`) skips the park and leaves the roots queued — correct.

---

## Other checks
- Detached-root bookkeeping across the three leak seams (unbind `23376+`, dead-owner
  `23666+`, teardown `23815+`): all five depth-stage structures (`_pendingDepthStageRoots`,
  `_parkedDepthStageRoots`, `_withheldDepthCasters`, `_deferredDepthStageRoots`,
  `_policyStepsParked` + `_coverageCollectParked` iter teardown) are cleaned per owner —
  the rescue's detached-path gap is covered by the same seam.
- `SHADOW_DEPTH_LEDGER_MAX_SKIPS` (the arm's ledger skip cap, `renderer.js:29547`): the
  arm only forces past a spent paced ledger when `skips >= 2` AND `forced < 8` — the
  consult shape is already correct there (arm-level forced consult present since W111).
- Forced wallet import sites confirmed live on all three files
  (`performanceNow`/`forcedFrameSpend`/`FORCED_FRAME_BUDGET_MS` imported into
  `deepSkyPlates.js`, `spaceBackground.js`, `partsLibrary.js`, `pipelineReadiness.js`).
- No code changed, no PR opened, nothing executed beyond git reads.
