# W113 audit — in-flight-hitches

saturated: false

Audited `devin/1791416524-perf-w110` at HEAD `8dda7f22f` (brief pin `e83550298` or later — HEAD carries both landed W113 batches, `946b62781` verdict-epoch gate + `8dda7f22f` forced-wallet debits/mark-currency guard). Golden sim hash contract untouched: audit-only, no code run, no writes to `src/`.

## Regression notes — W112 items (brief §33-51)

### H1 — depth-stage arm retry + rescue — PASS, plus W113 hardening verified

- The arm gate (renderer.js:29571-29581) now has the sibling shape: `faults >= 3` parks into `_depthStageArmDegradedEpoch` but `_depthStageArmRetryAt = +1000 ms` re-arms one bounded retry per second — pending entries keep draining instead of freezing for the sector.
- The rescue pass (29584-29665) runs inside the arm's `finally`: sweeps `_sweepDetachedDepthStageRoots`, then walks pending roots, restores `castShadow` on meshes whose `sfDepthMark` is mark-current against `rescueSig`, and clears the withheld bookkeeping. Restores are gated per-mesh by `casterDepthMarkCurrent` — the safe direction (dark) is preserved on every `continue`.
- W113 `946b62781` verified: the verdict consult at 29952-29956 compares the memo's `epoch` against `shadowCensusEpoch()` and treats a stale serve as unsigned (`verdictStale`) — the deny path can no longer ship a verdict minted under the previous light set.
- W113 `946b62781` parked-rescue restore verified: the rescue re-drives `driveShadowPolicySteps` on parked roots and the sig-keyed consume/abandon (31640-31657) carries `receiverDelta` across a remint — no double-apply.
- W113 `8dda7f22f` verified: the 7 census consult sites debit the forced wallet (`noteForcedFrameSpend`/`pacedFrameSpend` checks before stepping), and the rescue's mark-currency consult at 29605 reads the memo instead of minting a fresh signature.

### H2 — `[GPU brick]` dedup — PASS (one residual walk, see H10)

bloom.js:2020-2073: `brickSeq` sampled fires (`=== 1 || % 120 === 0`) plus ≥1 s heartbeat summaries; `brickSuppressed` counted; the O(scene) `describeNew*` payload + `JSON.stringify` only run on sampled fires. Volume per brick-storm epoch is now O(seconds), not O(frames).

### H3 — bus handler-error dedup — PASS (key granularity note, see H12)

eventBus.js:25-84: `BUS_ERROR_VERBATIM = 8`, per-event-name Map, 8 verbatim + ≥1 s suppressed heartbeat, called from all four dispatch sites (`dispatchRange` :66, sliced drains :328/:377, presentation drain :445). Bounded.

### H4-H6 — warn routing (uiStage caps, authoredMotion dedup, laneWarn) — PASS

- renderUpdatePhase.js:15-64: `UI_STAGE_ERROR_LOG_CAP = 20` + one suppression line for both `[loop] ui stage error` and `ui stage prewarm error`; `VFX_ERROR_LOG_CAP = 20` same shape.
- authoredMotion.js:20-80: `noteAuthoredWarn` — per-key Map, 8 verbatim, 512-key clear, ≥1 s suppressed heartbeat. All ten call sites (:370…:889) route through it.
- laneWarn (renderer.js:2193-2250): epoch-keyed rollup on `state.render.laneWarns`, 8 verbatim/lane/epoch then one summary; all arm/census/entityViewSync faults ride it. (See H9 for the one gap.)

## (a) Remaining raw console sites — census

Re-enumerated: 329 raw `console.warn/error/info` sites across `src/render` + `src/core` (188 in renderer.js). After classifying every site by reachability, **no uncapped per-frame or per-emit fire site remains**. The surviving sites decompose into:

- **Latched once-per-epoch/entity/instance**: `syncEntityViews` drive fault (25693, `_entityViewSyncFaultWarned` per `serviceFaultEpoch`), `mesh build failed permanently` (24941, once per entity after 3 strikes + `_noMesh` latch), `SpaceRenderGraph unavailable` (31087, once ever), `uiStage stage draw failed` (uiStage.js:414 — `releaseUiStage` tears the stage down, so the same draw cannot repeat), touchFailDiag 4/epoch sampling (12225-12274).
- **Catch paths bounded by failure-event count** — every site in partsLibrary/uiStage/shipShot/shipPreview/presentationRunner is inside a `catch` on a discrete async unit (asset publish, stage build, capture); worst case is one warn per failed asset, never per frame.
- **Deliberate bounded telemetry**: `[drawhist]` (30933) once per `_drawHistogramWindow` frames; `first-flight build` info (24969) bounded by entity count inside the first 3 sim-seconds — documented at 24965-24967 as release-evidence telemetry.

## (b) Dedup-correctness findings

See H9, H12 below. stormWarn (8 verbatim + ≥1 s suppressed heartbeat + 256-key clear) and noteBusHandlerError/noteAuthoredWarn (same shape) were walked for key-explosion bounds and heartbeat drift: all bounded; the clear() re-arm burst is documented and capped. Heartbeat drift: `lastWarnAt` is only stamped on emitted summaries, so a warn burst straddling the 1 s boundary emits at most 9 lines/epoch-second — fine.

## (c) Arm-rescue × live-state findings

See H8 (the material one), plus the enumerated sub-cases:

- **Rescue-parked walk collision**: `driveShadowPolicySteps` keys `_policyStepsParked` by root and discriminates by sig `allowCast|walkRoot===root` (31648). A rescue-driven re-drive on a parked withhold-sync walk either resumes it (same sig — correct, `receiverDelta` carried) or abandons and remints (31650-31657) with the applied-prefix delta folded into `carriedDelta` — no double-apply, no lost delta.
- **Withheld-set divergence**: meshes the rescue skips (deferred-owned, non-current mark, null rescueSig) stay `castShadow=false` in `_pendingDepthStageRoots`; recovery is the next arm re-arm. Fail-closed; worst case is a caster staying dark until the next epoch flip, never an unproven release.
- **Double-restore**: a mesh restored by the rescue and then re-collected by the re-armed withhold gets castShadow flipped true→false→true across passes — flag flips only, no recompile (depth material is separate). Cheap convergence.

## (d) Presented-frame walks — census

No unconditional O(scene) walk re-entered via W112 machinery:

- Census memo: stepped mint, 4 ms/pass wallet, once-per-pass `lastDrainSeq` serve, supersede-cap→storm pin→1 s bounded retry (29276-29375).
- Coverage collect: stepped + parked under `_coverageCollectParked`, supersede-cap 4, forced-slice fairness via mint-starvation rotation class `v` (28993-29079).
- Policy walks: stepped, sig-keyed park/resume (31640+).
- `_sweepDetachedDepthStageRoots`: O(pending) per arm drive — see H11.
- `rememberBloomGeometries(scene)`: O(scene) Set fill per bricking frame — see H10.

## Fresh findings (ranked)

### H8 — rescue's mark-currency guard rides the census memo's stale serve (H)

file: `src/render/renderer.js:29605` (`rescueSig = this._shadowCensusForFrame()`), `29283-29351` (stale-serve memo), `29952-29956` (the W113 gate this consult is missing)

Mechanism: `_shadowCensusForFrame()` deliberately serves the **previous-epoch** signature while a stepped re-mint is in flight (`lastDrainSeq` serve at 29348-29351; the epoch compare at 29283 only short-circuits when `memo.epoch === epoch && !memo.pendingIter`). That conservative direction is correct for every consult that *withholds* — a stale sig only ever keeps more casters dark. But the rescue's restore consult runs it in the opposite direction: `casterDepthMarkCurrent(mesh, rescueSig)` restoring `castShadow=true` on meshes whose `sfDepthMark.l` equals the **stale** sig means "this caster was observed drawing under the *previous* light set". Under the live census those variants are unproven — restoring them releases casters whose depth variants were never staged, which cold-links inside the next presented `shadowMap` refresh — the exact in-flight hitch the whole withhold/deferred-leg machinery exists to prevent. W113's own verdict gate (verdictStale at 29952) fixed precisely this asymmetry for the deny path; the rescue's restore path was left without the same epoch guard. The reverse direction (live-sig marks read as non-current against a stale rescueSig → skip → stay withheld) is fail-closed and self-heals on the next arm, but the stale→restore direction is fail-open for one shadow refresh per rescued root.

Window: any presented pass where (i) the census is mid-remint (light mutation landed, pendingIter not drained — a multi-frame window on a fat scene since the mint is capped at 4 ms/pass), AND (ii) the arm's rescue leg runs, AND (iii) a pending root's meshes still carry marks minted under the pre-mutation sig. All three coincide on exactly the frames a sector's light set changes mid-flight — planetrise, checkpoint light shifts, authored light sequences — i.e. when hitches hurt most.

Fix sketch: epoch-gate the restore consult the way the verdict consult is gated — capture `const censusEpoch = shadowCensusEpoch()` once, require `this._shadowCensusMemo.epoch === censusEpoch && !this._shadowCensusMemo.pendingIter` before trusting marks for restore; when stale, run the bookkeeping half of the rescue (sweep + fault stamp) and leave restores for the next pass, or serve `rescueSig = null` so every mesh takes the `continue` (fail-closed). Both directions then agree with the withhold contract: no restore without a live-epoch signature. ~15 lines.

Effort S · Impact H (cold depth-variant link inside the presented shadow refresh — one unbounded compile per rescued root on light-drift frames) · Risk L (fail-closed on both sides; worst case is a caster restored one pass later).

### H9 — `laneWarn` suppressed counts starve after the rollup summary (M-diag)

file: `src/render/renderer.js:2193-2250` vs stormWarn heartbeat (`_stormWarnLog` ~2180s)

Mechanism: laneWarn emits 8 verbatim per lane per epoch, then one summary at warn #9, then silence — `row.suppressed` accumulates invisibly for the rest of the epoch. Every sibling dedup (stormWarn, noteBusHandlerError, noteAuthoredWarn) re-emits a ≥1 s suppressed-count heartbeat; laneWarn is the only one that doesn't. The lanes riding it are precisely the ones that name hitches — `depthStageArm`, `admissionTouch`, `shadowCensus`, `entityViewSync`, `shadowPolicyRoot` — so a sustained fault's true volume is unobservable from logs after the ninth warn, which biases future audits toward "fixed" when it's merely muted. No frame cost (suppression is the feature); this is a blindness gap.

Fix sketch: stamp `row.lastWarnAt` on each emitted line; on suppress, if `now - lastWarnAt >= 1000` emit `${lane} suppressed ${row.suppressed} more` and reset the counter — the stormWarn shape verbatim. Effort S · Impact M (diagnostic) / L (frame) · Risk L.

### H10 — `rememberBloomGeometries` still pays an O(scene) traverse per bricking frame (L-M)

file: `src/render/bloom.js:2073` (`if (brick || grewGeometries) rememberBloomGeometries(scene)`)

Mechanism: W112 H2 sampled the expensive part (describe payloads + stringify) but the bookkeeping Set fill still runs a full `scene.traverse` on every bricking frame — the frames already >200 ms. On a fat scene that's ~1-3 ms of added presented-frame cost inside the worst frames, once per frame for as long as the brick persists. It can't be gated on the sample (the diff needs the previous geometry set to stay current or the next sampled fire reports garbage), but it can be amortized — fill incrementally across frames, or only re-fill when `sceneGraphVersion`/object-add counters moved.

Fix sketch: version-gate the refill (`scene.version`/children-dirty counter) or run it as a N-node-per-frame stepped walk parked between bricks. Effort M · Impact L-M (bounded per-frame addition during brick storms only) · Risk L-M (must keep diff fidelity or H2's diagnostics regress).

### H11 — degraded-arm retries pay `_sweepDetachedDepthStageRoots` per retry tick (L)

file: `src/render/renderer.js:29584+` (sweep inside the arm's per-drive rescue preamble)

Mechanism: during a degraded epoch (`faults >= 3`) the arm re-arms every ~1 s via `_depthStageArmRetryAt`, and each drive iterates the whole pending map sweeping detached roots — O(pending) per tick though detached-root arrivals are rare mid-storm. Bounded and small, but it's the only per-retry-tick O(map) cost that isn't event-driven.

Fix sketch: cadence the sweep (once per epoch-second, or only when `_pendingDepthStageRoots` size changed since last sweep). Effort S · Impact L · Risk L.

### H12 — bus-error verbatim budget is per-event, not per-listener (L-diag)

file: `src/core/eventBus.js:37-84`

Mechanism: `noteBusHandlerError` keys the dedup row on event name alone — all faulting listeners on one event share the 8-verbatim budget. A second distinct faulting listener's first error is suppressed; its identity (`listener.toString()`/index) never appears verbatim. Diagnostics-only; the volume cap is correct.

Fix sketch: key on `${event}:${listenerIndex}` (the dispatch loop already knows the index) or hash the handler ref. Effort S · Impact L (diagnostic) · Risk L.

## Summary

W112's hitches batch (arm rescue, brick/bus/authored dedup, warn routing) verified intact at `8dda7f22f`, and W113's own verdict-epoch gate + mark-currency guard landed — with one asymmetric gap left: the rescue's *restore* consult trusts the memo's deliberately-stale signature serve, the one direction where stale is fail-open instead of fail-closed (H8). The remaining raw-console census is clean — no uncapped per-frame fire sites survive — and the dedup machinery is correct except laneWarn's starving suppressed counts (H9). Five findings, one high-impact; not saturated.
