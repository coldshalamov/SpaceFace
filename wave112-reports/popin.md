# W112 audit — popin-admission lane

`saturated: false`

audit head: `811b92586` on `devin/1791416524-perf-w110`
W111 landed: `51e35a3ca` (lod + popin + boot machinery), `e3a2e5753` (hitches)

Four new contract-preserving findings, all with concrete fix paths. The headline is P1: the W111
null-sig park back-fill works as designed but clobbers the mint-time epoch stamp, which silences the
drift-release clause it was meant to feed. P2 is the asymmetry the brief's item (b) predicts: five
other `shouldStartHeavyAdmissionEventually` consumers still honor a forced start with no wallet
consult.

---

## Findings (ranked)

### P1 — Parked-entry back-fill overwrites `lightSigEpoch`, masking a real census flip inside the unsigned window

Evidence: `src/render/renderer.js:28584-28589` (back-fill writes `parkedEntry.lightSigEpoch =
shadowCensusEpoch()` unconditionally) vs mint sites `renderer.js:29557-29576` and `29692-29714`
(both stamp `lightSigEpoch: shadowCensusEpoch()` at mint even when `lightSig` comes back null —
the unsigned window) vs the release compare at `renderer.js:28594-28601`
(`lightSigEpoch !== shadowCensusEpoch()` prefilter + sig compare -> `parkedReleaseOnDrift`).

Mechanism: mint at epoch E0 with `lightSig == null` (census unsigned — memo pending or mint parked).
A real light mount/teardown flips E0 -> E1 while the entry sits parked. The next eval back-fill
writes `lightSig = S1` **and** `lightSigEpoch = E1`, erasing the mint-time stamp. The release
compare then reads `E1 !== E1` -> false -> the park survives a signature flip its withheld-caster
set was never evaluated under. Stale withholds persist until the recheck cadence finds them
(`parkedReleaseOnDrift` is unreachable for this class; only `dirtySeq`/cycle-backoff re-collect
recovers — up to ~768 evals ≈ tens of seconds for a chronic park). Player-facing: withheld casters
stay dark past a real lighting change; direction is cold-not-wrong, so it reads as delayed shadow
admission, not a pop.

What W111 got right (do not re-report): a release is clean — `parkedMap.delete(root)` +
`_withheldDepthCasters.delete(root)` opens the collect gate via `parkedRelease`, and the re-park
re-mints a fresh entry with fresh sig+epoch. The defect is only that the back-fill chooses re-key
when release was correct.

Fix sketch: in the back-fill block, compare `parkedEntry.lightSigEpoch !== shadowCensusEpoch()`
*before* writing — if the unsigned window spanned a real mutation, take the existing
`parkedReleaseOnDrift` path (release + re-collect under the live census) instead of re-keying.
The mint-time epoch is already stamped; this is one condition plus reuse of the release machinery.

Effort: **S** · Impact: **M** (bounded stall, not a wedge) · Risk: **L**

---

### P2 — Five sibling `shouldStartHeavyAdmissionEventually` consumers honor forced starts with no wallet consult

Evidence:

| Site | What a forced `gate.start` pays |
|---|---|
| `src/render/deepSkyPlates.js:224-226` | `renderer.initTexture(texture)` — whole-plate GPU upload inside the present (`pump()`, commits `this.lateSkips = gate.skippedCount` unconditionally at 225) |
| `src/render/spaceBackground.js:1872-1874` | `_ensureNebulaBake('L1'|'L2')` — full-res render-target bake + first `NEBULA_FRAG` program link + mip chain |
| `src/render/spaceBackground.js:2801-2807` | wormhole spawn: inline L1 promote before `createWormholePipelineMesh`; on `!gate.start` defers via `_deferredWormhole` — but a forced start pays the bake unconditionally |
| `src/render/partsLibrary.js:13608-13617` | `drivePoolAdmissionIfUnclaimed`: `prepareRenderPackagePoolAdmission` + `activateRenderPackagePoolAdmission` — a compile+touch pass; additionally the gate consult and the spend are separated by `await yieldToNextPresent()` + `await prepare…`, so the measured `lastPresentDtMs` may describe a different frame than the one paying the prepare |
| `src/render/partsLibrary.js:7409-7415` | upgrade pick: `state.jobs.sort` + admit; already carries the right precedent — the on-glass-job carve-out at 7416-7422 (`entityIsOnReadableGlass` lets a glass-visible hole through `!gate.start`) |

Mechanism: W111's mesh-build gates (`renderer.js:24633-24645` fresh, `24743-24751` resumed) added
`forcedFrameSpend() < FORCED_FRAME_BUDGET_MS` so a forced start after 8 skips cannot land a build on
an already-spent frame. Every other consumer of the shared gate still treats `gate.start` as a
license. On a degraded-present stretch each counter rolls over independently and the heavy unit
lands on whatever frame it lands on — same un-budgeted-admission class W111 closed for builds, now
measured on bakes/uploads/compiles. Note the correct sub-shape already exists in-repo: the upgrade
pick's glass carve-out is exactly the deadline-glass analog (`deadlineGlassOnly`) the drain uses.

Fix sketch: mirror the W111 consult at each site —
`allowed = !gate.start || forcedFrameSpend() < FORCED_FRAME_BUDGET_MS`; commit `skippedCount` only
on a real start; on forced-but-broke, defer (plates: `return false`; bakes/wormhole: re-pend;
pool lane: it already re-arms itself via `drivePoolAdmissionIfUnclaimed` recursion, so just
`return` without committing). Keep the glass carve-outs intact.

Effort: **M** (five sites, mechanical; each needs its own defer-shape) · Impact: **H** for the two
bakes + pool admission (full-res RT bake / program link / upload on an arbitrary frame is the
canonical magic-frame violation), **M** for plate upload and pick · Risk: **L-M** (worst case is
more deferral during heavy churn — the same skip-loop these lanes already run)

---

### P3 — `driveHoldExemptDegrade`'s once-per-epoch sync-twin rescue pays an unmetered `collectMeshPresentationEntities`

Evidence: `src/render/renderer.js:3670-3697`. The ≥3-fault rescue consults
`forcedFrameSpend() < FORCED_FRAME_BUDGET_MS` at 3671, then — before `twinStart = clock()` at 3683 —
runs `collectMeshPresentationEntities(state, entities)` at 3682 on a `state.entityList.slice()`.
The debit at 3696-3697 (`noteForcedFrameSpend(twinElapsed)`) covers only the
`enqueueMissingMeshBuilds` + `kickDecodeRunwayAssetsSteps` twin body. The rescue returns at 3698,
*above* the driver's `finally` debit at 3737-3738, so the collect lands in no ledger at all.

Mechanism: `collectMeshPresentationEntities` is the sync original whose chunked twin
(`collectMeshPresentationEntitiesChunked`) exists precisely because the sweep is the dominant
collect cost on big worlds. The forced-wallet consult at 3671 therefore gates a spend it does not
include: the verdict is computed against ≥0 ms and the frame immediately pays the full sweep +
entity-slice allocation. Fires once per service epoch per hold, by construction on the frame that
is already worst (≥3 prior faults).

Fix sketch: hoist `twinStart` above the `entities` slice at 3681 (one line — the collect, evaluator
mint at 3675-3676, and enqueue all share the debit), or debit the collect under the paced ledger
via a pre-return `notePacedFrameSpend`. No behavior change either way.

Effort: **S** · Impact: **M** (rare but adversarial timing) · Risk: **L**

---

### P4 — `reattachResidentGpuMeshesSteps` strides by row count only; each row is a `_bindPresentationMesh` subtree walk

Evidence: `src/render/renderer.js:1978-1991` — `for (const [id, mesh] of owner._meshes)` with
`if ((++scanned % 64) === 0) yield;` and no elapsed term; the row body is
`resolveWorldPresentationEntity` + `_bindPresentationMesh` (which itself traverses the subtree for
stamps + cull radius — the same per-row cost W111 stride-bounded in
`_rebindPresentationMeshesSteps` at `23619-23633` and `_bindPublishedPresentationMeshesSteps` at
`23679+` via `%256 || ≥2 ms`) + `reattachAuthoredReadmission`.

Mechanism: the W111 stride fix recognized that "64 rows" and "64 subtree walks" are different
units; this generator predates that shape and kept the count-only stride. A restore under the
loading shell re-binding a fat cohort can run a whole 64-bind stride inside one paced leg —
worst case tens of ms — exactly while presents are expected (the sweep runs under the loading
shell's own ticks, and the first flight frame can overlap the tail of it).

Fix sketch: same pattern W111 shipped — capture `legStarted`, yield when
`(++scanned % 64) === 0 || now() - legStarted >= 2`, reset on yield. Behavior-preserving.

Effort: **S** · Impact: **M** (restore path only, but it is the seam the first presented frames
ride through) · Risk: **L**

---

### P5 — Minor under-count: throws outside `enqueueHoldExemptMeshBuildsSliced`'s four instrumented catches escape the paced debit

Evidence: `src/render/renderer.js:3788-3841` — `const started = now()` is per-invocation at ~3813;
the four `.next()` catch exits (~3854, ~3889, ~3965, ~3988) each `notePacedFrameSpend(now() -
started)`. But `abandonHoldExemptCollect`/`abandonHoldExemptCommit` (~3805-3810, ~3817),
`makeHoldExemptScanContext`, and the evaluator/iterator mints run inside the same unprotected
span — a throw there propagates with no debit and no `noteLaneFault`.

Mechanism: direction is *permissive* (a faulted beat records ~0 spend, letting the next beat start
from a fuller wallet than it earned) — it cannot cause a hitch by itself; it weakens fault
accounting and the lane's fault stamp. Worth one `try/finally` at the function level to match the
driver shape W111 used in `driveHoldExemptDegrade` (3737-3739).

Effort: **S** · Impact: **L** · Risk: **L**

---

## Lane hunts

**(a) Park-entry back-fill correctness** — race confirmed and reported as P1. Re-park cleanliness
after a real release: verified — `parkedMap.delete(root)` + `_withheldDepthCasters.delete(root)` at
the release site, `queued` re-derived with `!parkedRelease` at ~28680, and the re-park mints a
fresh entry at the 29557/29692 sites with fresh sig+epoch. The third `parkedMap.set` (~31373) is
the shadow-policy iterator park (different mechanism — `sig`/`carriedDelta`, `notePolicyRootFault`,
`laneWarn('shadowPolicyRoot')`), not the lightSig lane; its drive-failure path already drops the
parked slot before re-mint.

**(b) `lateStartAllowed` symmetry** — mesh-build start gates enumerated: fresh drain gate at
`renderer.js:24633-24645` and resumed gate at `24743-24751`, both
`allowed = !gate.start || forcedFrameSpend() < FORCED_FRAME_BUDGET_MS`, `skippedCount` committed
only on a real start, forced-but-broke -> `driveHoist` + `deadlineGlassOnly` (on-glass deadline
rows still build). In-drain row continue + hoist arms consult the paced ledger via
`shouldContinueAdmissionSlice`/`usePacedLedger` (~24776-24795). Every other
`shouldStartHeavyAdmissionEventually` consumer (5 sites, P2) consults nothing. One deliberate
tightening worth noting, not a defect: `!gate.start || forced < 8` also gates a *non*-late frame
whose forced wallet is already spent — conservative and within contract (deadline-glass carve-out
still applies).

**(c) `holdExemptStepped` debit accuracy** — verified correct where instrumented: `started` is
per-invocation (`renderer.js:~3813`), so suspended iters never leak a stale clock into a later
beat; each call debits exactly once (tail at ~4039 or a catch exit); the callers at
`renderer.js:2842` and `2992` call it bare — no double-debit. Residual under-count edge reported
as P5. `driveHoldExemptDegrade` verified: per-call `started` + `finally` debit at 3737-3738; the
rescue return path's gap is P3.

**(d) Remaining un-budgeted admission-path walks, ranked** —
1. `drivePoolAdmissionIfUnclaimed` prepare+activate (folds into P2; worst of the class — whole
   compile+touch pass, microtask-separated from the consult).
2. Nebula L1/L2 `_ensureNebulaBake` + wormhole L1 promote (P2).
3. `collectMeshPresentationEntities` inside the hold-exempt rescue (P3).
4. `reattachResidentGpuMeshesSteps` bind stride (P4).
5. `deepSkyPlates.pump` upload + upgrade-pick sort (P2).
Checked and clear: `driveCompileShadowDepthPipelines` (renderer.js:~580) has the Steps twin plus a
paced `collectPotentialShadowCastSubjectsSteps` pre-collect; `warmNearbyLedgerRows` sync calls at
13795/16856 are the Steps-absent else-branches (unreachable when the twin exists);
`collectInstancePoolCompileRootsAndSubjectsSteps` yields per-node with O(1) row cost — a count
stride is correct there (the row *is* the walk node, not a nested traverse);
`drivePublishFirstPicture`'s settle path rides the degrade memo (below); `disposeObjectSteps`
yields per-128-node during the walk itself.

---

## W111 regression verification — all 9 items PASS

1. **Shared lightSig mint (lod F1)** — PASS. `_depthCollectLightSig` (`renderer.js:29308-29326`):
   memo consult -> per-`_viewSyncSeq` cache -> null-gate (`!scene || paceEpochNow() >= 0 ||
   forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS`) -> `noteForcedFrameSpend(mintElapsed)`. Every
   `lightSigFor` call site routes through it; `lightSigOverride` is plumbed into
   `collectUnstagedShadowCasters`/`markCastersDepthStaged` (`shadowDepthAdmission.js:541,563`) and
   `reusableSession` at `shadowDepthAdmission.js:674` correctly requires `lightSigOverride !== null`.
2. **Storm re-arm (lod F2)** — PASS. `_shadowCensusForFrame` (`renderer.js:29148-29297`): stepped
   mint per pass keyed on `lastDrainSeq`; pin at `superseded >= 4` -> `stormEpoch = epoch,
   stormRetryAt = now + 1000`; re-arm `stormNow >= stormRetryAt` resets `stormEpoch = -1` and
   `superseded = 0` before retrying the mint. Pin cannot survive a real epoch flip (compare is
   `stormEpoch === epoch`). Sync fallback bounded to once per pass (`sigFallbackSeq`,
   `sigFaults >= 3` parks). Residual noted not reported: while pinned and before `retryAt`, a
   non-presented caller pays a once-per-pass whole-scene sync mint instead of serving unsigned.
3. **Wallet debits on exempt/reconcile lanes (lod F3/F4 + popin F3)** — PASS.
   `driveHoldExemptDegrade` `finally` debit at `renderer.js:3737-3739`; all four
   `enqueueHoldExemptMeshBuildsSliced` catch exits debit + `noteLaneFault('holdExemptStepped',
   true)`; keepGpu reconcile mint debits `noteForcedFrameSpend(reconcileMintElapsed)` at
   ~2741-2749 with `_reconcileFaultRetries`/`_reconcileRetryAt`/`noteLaneFault('residencyReconcile',
   retries >= 3)` and `keepGpuReconcileParked` honoring both fault-epoch and retryAt parking.
   Edges: P3 (unmetered rescue prefix) and P5 (non-catch throw paths).
4. **Null lightSig park release (popin F1)** — PASS with defect P1. Back-fill at
   `renderer.js:28584-28589` runs once per eval per null-sig park, cheap (memo-bounded); release
   compare at 28594-28601 uses the epoch prefilter + sig compare; re-park path verified clean.
5. **Doomed-row rebind skip (popin F2)** — PASS. `_rebindPresentationMeshesSteps` at
   `renderer.js:23643-23669` resolves `world.handleForEntityId(id, this._presentationHandleScratch)`
   and skips `alive[slot] !== 1 || doomed[slot] === 1`; spawned-bind leg carries the same
   conjunction at `renderer.js:23702`. Scratch-handle use is synchronous per row (no cross-yield
   aliasing). No row class legitimately needs a rebind stamp while doomed — skipped stamps are the
   conservative direction (doom hides via `hiddenSlots`; an un-doomed row is picked up on the next
   pass).
6. **9-late-frame forced start gate (popin F4)** — PASS. Fresh gate `renderer.js:24633-24645`,
   resumed gate `24743-24751`; identical shape; `skippedCount` committed only when allowed;
   forced-but-broke -> `driveHoist` + `deadlineGlassOnly`. See (b) for the sibling-site asymmetry.
7. **Stride wall-clock yields (boot F1)** — PASS. All four generators carry
   `%N || elapsed >= 2ms`: `collectOpeningSubmissionLeaves` (~1033-1041),
   `_openingFirstPictureUpgradePromisesSteps` (~26745-26753), `_rebindPresentationMeshesSteps`
   (~23619-23633), `_bindPublishedPresentationMeshesSteps` (~23679+). Residual generator with
   subtree-walk rows and a count-only stride reported as P4. Per-node O(1) walks
   (`collectInstancePoolCompileRootsAndSubjectsSteps` 256-stride, `disposeObjectSteps` 128-stride)
   are correctly count-bounded — the walk node is the unit of work.
8. **Publish degrade memo (boot F2)** — PASS. `drivePublishFirstPicture` (~26702-26870):
   `_openingPublishDegradeEpoch === serviceFaultEpoch(state)` serves `_openingPublishDegradeVerdict`
   without re-driving; memo arms only on the attempt-1 sync-twin degrade; epoch flip misses the
   compare so the memo "resets" by keying. `noteLaneFault('openingFirstPicture', attempt > 0)` +
   `laneWarn('openingPublish')` present. Masking question answered: once armed, later legs never
   re-run within the epoch, so a *new* leg fault can't be masked by mis-serving — it simply can't
   occur; the memo also can't observe a leg that would newly fail until the epoch flips. Bounded to
   one epoch; legs are idempotent. No action.
9. **Depth-leg fault park (hitches F1)** — PASS with one nuance. `_noteDepthStageArmFault`
   (~29893-29909) counts per `serviceFaultEpoch`, parks at ≥3; head gate at `29423-29428`
   (`_depthStageArmFaultEpoch === armServiceEpoch && faults >= 3` -> `_depthStageScheduled =
   false`, pending stays queued, re-arms on epoch flip). Wired from the leg-drive `.catch`
   (~29644-29652), leg-setup catch (~29724), and outer arm catch (~29847). **Nuance:** the
   enable-stage tail catch (~30045) stamps `laneWarn('depthStageArm')` + `noteLaneFault` but does
   NOT call `_noteDepthStageArmFault` — enable-stage faults therefore never count toward the park.
   If deliberate (the tail is a different failure class) it wants a comment; if not, one-line fix.
   Reporting as a nit inside the regression block, not a numbered finding.

---

## Other checks
- Steps-twins mirror their sync originals' early-outs: verified on the rebind/spawned-bind legs
  (same eligibility conjunction both places, 23643-23708) and `disposeObject`/`disposeObjectSteps`
  (31455-31495: same detach-then-traverse grammar, same `heldLight` mutation note).
- Awaited bodies for synchronous prefixes: the pool-admission pump's `await
  yieldToNextPresent()` correctly precedes the gate consult (P2 covers the residual).
- Parked generators and liveness on resume: `_openingPublishDegrade*`/`_holdExempt*`/
  `_depthStageArm*` all key `serviceFaultEpoch`/`enterSerial` and abandon on mismatch — consistent.
- No code changed, no PR opened, nothing executed beyond git reads.
