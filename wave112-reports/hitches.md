# W112 audit — in-flight-hitches

saturated: false

Audited `devin/1791416524-perf-w110` at HEAD `7112d3f8e` (brief pin `811b92586` or later — HEAD carries the two already-landed W112 batches, lod `1cc691dd9` + popin `7112d3f8e`).

## Regression notes — W111 (hitches F1: depth-leg fault park)

PASS. Verified concretely on the audit HEAD:

- `_noteDepthStageArmFault` (renderer.js:29986-29994) keys on `serviceFaultEpoch` (`enterSerial|contextRestoreSeq`, renderer.js:2418-2422), resets per epoch, increments, and stamps `noteLaneFault(this.state, 'depthStageArm', faults >= 3)` — the laneFaults rollup sees the park boundary.
- Called from all three catches the brief names: leg-drive `.catch` (29727-29731), synchronous leg-setup catch (29810-29813), outer arm catch (29935-29937). All three ride `laneWarn(this, 'depthStageArm', ...)`; the enable-stage tail (30134-30137) rides `laneWarn` + `noteLaneFault` — consistent with the W111 commit claim.
- Head gate (29485-29490): `_depthStageArmFaultEpoch === serviceFaultEpoch && _depthStageArmFaults >= 3` → `_depthStageScheduled = false; return;` — pending entries stay queued (the return is before the `try`, so the `finally` re-arm at 29964 does not fire; see H1).
- Enable-stage tail joined the lane correctly (30135).

Spot-verified the shared mint while hunting (d): `_depthCollectLightSig` (29365-29388) is `{seq: _viewSyncSeq, epoch: shadowCensusEpoch}`-keyed — one mint per pass per census epoch — serves the `_shadowCensusForFrame` memo first, is null-gated on `paceEpochNow() >= 0 || forcedFrameSpend() >= FORCED_FRAME_BUDGET_MS`, and debits `noteForcedFrameSpend(mintElapsed)` (29383). The memo's own sync fallback (29325-29351) is gated identically + `sigFallbackSeq` once-per-pass + `sigFaults >= 3` park. No unconditional O(scene) walk re-entered via the W111 mints.

## Fresh findings (ranked)

### H1 — Depth-stage arm fault-park lacks the sibling lanes' in-epoch retry/rescue (M)

file: `src/render/renderer.js:29485-29490` (gate), `29986-29994` (counter), `2440-2447` (sibling contract)

Mechanism: sibling fault-parked lanes (protected-first-flight at 2436-2438, reconcile/poll/arrival-reserve per W109) park only at `retries >= 3 || now < retryAt` — i.e. ≥3 bounded retries spaced ≥1 s heal a transient burst — and then pay one forced-wallet sync-twin rescue per epoch. The depth-stage arm parks HARD at 3 faults in an epoch: the gate returns before the `try`, so the `finally` re-arm never runs; `_depthStageScheduled` stays false until a fresh enqueue (`_queueShadowDepthStage` 29404-29406, or the enable-stage tail 30130-30132). Each fresh enqueue does schedule one arm attempt — which re-parks at the gate immediately. Faults never decay within an epoch (`_depthStageArmFaults` only resets on `serviceFaultEpoch` flip = next sector enter / context restore). Net: three transient faults hours apart — or one raced unmount storm — parks staged-depth for the rest of the sector: pending roots' already-withheld casters (`_withheldDepthCasters`, castShadow=false) stay dark for the whole enter, a strictly worse park semantics than siblings (they serve last state for one frame, this loses real shadows for minutes). Post-flip recovery is organic — an enter's dirty flood re-enqueues — but nothing drains surviving pending roots on the flip itself; a pending root outliving an epoch boundary waits for the next unrelated shadow dirty.

Fix sketch: give the gate the sibling shape — keep the ≥3 park, but let `faultRetryAt` (set on each fault, +1 s) gate one retry arm while `faults < 3` after the first, and/or pay one forced-wallet sync-twin restore for the withheld set once per epoch; reset `_depthStageArmFaults` on a clean arm completion so sparse faults can't accumulate into a park. Optionally drain pending into a cheap `castShadow` restore pass on epoch flip (the withheld flags survive a sector swap — `_pendingDepthStageRoots` is only reaped on detach).

Effort S · Impact M (lost shadows for a sector after a transient burst; no recovery path below the epoch boundary) · Risk L-M (a genuinely-faulting arm re-arms ~1/s — the ceremony is bounded per arm, same trade siblings accepted).

### H2 — `[GPU brick]` warn: unbounded per-frame console + O(scene) diag payload inside the presented pass (H)

file: `src/render/bloom.js:2017-2048` (`BRICK_WARN_MS = 200` at :52; helpers :1825-1927)

Mechanism: `brick = elapsedMs > 200` is evaluated on every bloomScene pass with no throttle, dedup, or epoch budget — a sustained slow stretch (weak GPU, driver hiccup, heavy sector) fires it EVERY FRAME. The payload is self-amplifying: `describeNewProgramOwners`, `describeNewGeometryOwners`, `describeUnstampedVisibleGeometries` each run a full `scene.traverse`, plus `exactNewProgramKeys` + `JSON.stringify` of the whole report — multiple O(scene) walks + a large serialization inside the presented render pass of an already-bricking frame. (DevTools-open cost compounds it further.) `rememberBloomGeometries` runs per brick too (2048).

Fix sketch: ride `laneWarn`-style dedup — first brick + heartbeat every N frames (e.g. `brickSeq % 120`) or ≥1 s cadence, with the O(scene) describe payload only on the sampled fires (a cheap `{ms, programsAfter}` summary otherwise). Effort S · Impact M-H (worst-case volume is per-frame-unbounded and the diag itself worsens the frame) · Risk L (telemetry-only change; probe collectors that grep for `[GPU brick]` still see the event).

### H3 — eventBus handler-error catches: raw `console.error` per faulting-listener×emit (H)

file: `src/core/eventBus.js:35` (inline `dispatchRange`), `:297` + `:346` (sliced drains), `:414` (presentation drain)

Mechanism: every handler throw pays `console.error('[bus] handler error for "X":', err)` — Error object + stack serialization — with zero dedup. A persistently-throwing listener on a hot event (entity:spawned bursts, physics:impact / combat:damage in a fight, the per-frame sliced and presentation drains) storms the console at emit rate for the rest of the session — each error costs more than most of the work the emit was pacing. Volume is `faulting-listeners × emit-rate`: worst case per-frame-unbounded during combat.

Fix sketch: per-(event,listener-index) or per-event epoch dedup (same 8-then-summarize shape as `laneWarn`; the bus has no `state`/`serviceFaultEpoch`, so key on a monotonically bumped epoch counter or a wall-clock bucket). Keep the first N verbatim + one summary line. Effort S-M (small dedup table + tests for emit semantics) · Impact M · Risk L.

### H4 — `[loop] ui stage error` / `ui stage prewarm error`: raw `console.error` per frame (M)

file: `src/core/renderUpdatePhase.js:51`, `:82`

Mechanism: `tickUiStagePrewarm` runs EVERY flight frame (the `state.mode === 'flight'` branch at :80) and `presentUiStage` runs every frozen-submit frame (:41-51) — both catches are bare `console.error` with no cap. A persistently-faulting stage (resident UI stage whose presenter throws) errors every presented frame indefinitely. (`vfxErrorLogCount` at :141 is already capped — same pattern needed here.)

Fix sketch: same epoch/counter dedup as H3, or reuse the `VFX_ERROR_LOG_CAP` pattern (first 20 verbatim, one suppression line). Effort S · Impact M · Risk L.

### H5 — authoredMotion controller-reject warns fire per gameplay event (M)

file: `src/render/authoredMotion.js:249` (dispatch), plus per-call-site twins at :370, :448, :475, :494, :543, :631, :752, :791, :858, :889

Mechanism: `dispatch` warns per rejecting controller per event. The event sources are gameplay-tick rate — `mining:yield` on every yield tick, `cruise:dropped`/`beam:denied`/`scan:pulse`/tether/pool events — so one controller whose `handleEvent` persistently throws (missing clip, torn rig state) warns per event for the session: unbounded during the corresponding activity.

Fix sketch: per-`(type, entityId)` dedup (first reject verbatim + suppressed count on interval), or a per-controller fault stamp parking the verb like the row-fault quarantine. Effort S · Impact L-M · Risk L.

### H6 — Long tail of raw warns on flight-adjacent fault paths (L-M)

file: `src/render/renderer.js:31377` (env-rebind torn head — per torn queue entry; a poisoned material getter tears every queued entry in the epoch), plus per-fault-per-invocation sites at `:9032` (authored upgrade request), `:11832` (flight depth admission), `:12170`/`:12181`/`:12208` (admission touch + JSON.stringify diag), `:12499` (live geometry onError), `:14854`, `:22307`, `:23239`; `src/render/partsLibrary.js:3399/3408/4358/4373` (per swap-publish fault); `src/render/assetLoader.js:2774` (generic helper).

Mechanism: each fires once per faulted invocation — bounded per call but unbounded across call rate; a persistently-faulting entity/asset retries into the same warn every admission/teardown/swap. Below H2-H5 in worst-case volume but same class: route through `laneWarn` (the render-side ones already have `owner.state`) so a storm costs one summary line, not N serializations. The `12208` diag additionally walks the subject + `JSON.stringify`s per failure — sampling it would also trim the payload.

Fix sketch: route the render-owned sites through `laneWarn(owner, '<lane>', ...)`; give partsLibrary/assetLoader helpers a per-`(site, key)` dedup. Effort S-M · Impact L-M · Risk L.

### H7 — Arm per-fire scratch residue (hygiene)

file: `src/render/renderer.js:29519-29834`

What remains per fire after `_depthStageEntriesScratch` hoisted: `slice`, `sliceRoots` (`slice.map`), `legSet`, `unstaged`, `unstagedByRoot`, `entryByRoot = new Map(slice)` minted inside the `.finally` (29753), `leftoverByRoot`, plus `restoreOut` + `{..._shadowPolicyOptions()}` spreads per restored root (29899-29903). Most are async-captured across the leg drive's `.finally` — which resolves presents later while a subsequent arm could run — so shared hoists would race; justified, not a defect. Cheap legal wins: build `entryByRoot` once at slice-build time (same lifetime, saves an O(slice) mint per fire inside the callback), pool `restoreOut`, memoize `_shadowPolicyOptions` per `(entity, root)` pair — all sub-microsecond; lowest rank on this list.

## Enumeration answers for the lane questions

- (a) Sites ranked above (H2 > H3 > H4 > H5 > H6); everything else in the 182-site renderer census is either epoch-latched (`syncEntityViews` :25628, `tryPresentedCall` :2201-2214, refusal heartbeats :27731/:27887 cadence 1 + every-120), parked per epoch, or once-per-boot/boot-adjacent.
- (b) Covered in H1: parked pending entries are re-armed ONLY by a fresh `_queueShadowDepthStage`/`_stageShadowDepthOnSettingEnable` enqueue (each then re-parks at the gate); nothing drains pending on epoch flip; `serviceFaultEpoch` = `enterSerial|contextRestoreSeq`, so in-flight the park survives the whole sector.
- (c) H7.
- (d) Presented-path traverse census: renderer.js has 7 traverse sites — 30255 (whole-scene receiver recount) is dirty-flag + forced-wallet gated for tally-less envs; 7913/9851/25297/30481/31552 are per-root/per-mesh memoized or per-event. Other files: `latePipelineAdmission` traverses run inside cook/opening census (Steps twins exist); `openingGpuAdmission` ×5, `assetLoader` ×3, `imageSourceDedupe` ×1 are per-admission/per-load; `graphicsLab` one-time. No unconditional O(scene) walk re-entered via the W111 mints (verified `_depthCollectLightSig` + memo fallback gates). The one unbounded O(scene)-per-frame site found is the H2 brick payload itself.

## Saturation verdict

Not saturated: H1, H2, H3 each have conceivable contract-preserving implementations (dedup cadence, retry shape mirroring sibling lanes) that touch pacing/telemetry only — no quality or determinism trade required.
