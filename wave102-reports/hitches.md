# Wave 102 — in-flight-hitches audit

Audited `devin/1791064509-perf-w60` @ `52c74cd89` (W102 popin `4617baee6` + lod `52c74cd89` already landed on top of W101 `230b88e42`). Read-only audit; no code changed, no app run.

`saturated: false` — two reachable mechanism-level defects remain with clear contract-preserving fixes.

## Findings (ranked)

### F1 — notedWalk: remove-notes under-count in every order the detached-set doesn't already cover

**Evidence:**
- `src/render/shadowReceiverTally.js:139-164` — `noteRemoved` unconditionally writes a `{delta:-δ, seq}` note when the root carries no prior note (159-161). The `{+δ → −δ}` upgrade at 153-158 and the unvisited-add delete at 149-152 are correct; the **no-note branch is not gated on `visits`**.
- `src/render/shadowReceiverTally.js:56-65` — the pop-time liveness check skips a `detached` subtree before the visit stamp (71-74): a removed root pushed pre-removal is popped post-removal, contributes `0` to `walked`, and gets **no** `visits` entry.
- `src/render/shadowReceiverTally.js:225-228` — stamp rule: `visitSeq === undefined || visitSeq <= note.seq → stamped += note.delta`. An unvisited root's `−δ` note always applies.
- `src/render/shadowReceiverTally.js:130-138` — `noteAdded` never clears `notedWalk.detached`; membership survives until `clearNotedWalk`/`resetNotedWalk`.
- `src/render/renderer.js:24180-24193` — `_shadowReceiverCount > 0` gates `scheduleRealtimeShadowRefresh` (the `|| dirty` flags only help while a walk is still pending) and `Math.max(1, count)` scales `prepareActiveShadowCamera`.

**Mechanism (lane (a) enumeration — the landed negative-delta machinery errs the wrong direction in two orders):**

1. *Remove of a never-visited root.* Root R (δ receivers) is live at mint but still on the walk's stack — or under an already-visited parent that pushed it — when `noteRemoved(R)` lands mid-walk. The ghost check pops R post-removal → skipped → `walked` already excludes R. The unconditional `{−δ}` note then applies at stamp (`visits.get(R) === undefined`) → **stamped = correct-fresh-count − δ → under-count δ.** The `−δ` write is only sound when the walk already counted R (`visits.get(root) !== undefined`); for an unvisited root the detached-skip has already settled the removal and no note is needed.
2. *Remove → re-add inside one pending walk.* `noteRemoved` marks R `detached`; `noteAdded(R, +δ′)` nets the note to `−δ+δ′` (≈0 for an unchanged subtree) but leaves R in `detached` → the re-attached **live** subtree stays a ghost: skipped at pop, zero contribution to `walked`, and the ≈0 note adds nothing → **under-count δ′.**

A third, contract-boundary edge: `noteRemoved` on a root never under `scene` (a staging/warm subtree reported removed without ever landing) writes the same unabsorbed `−δ` — the tally contract assumes notes are scene-scoped but nothing enforces it.

The consumers make under-count the bad direction: `shadowMapActive` drops false at count 0 → `scheduleRealtimeShadowRefresh` stalls the realtime depth pass while receivers exist (frozen stale map + skipped asteroid instance submissions, renderer.js:24195), and `prepareActiveShadowCamera` reads an under-scaled receiver count → fringes lose shadows. Once a seq-matched walk stamps the bad count, `dirty` clears and the wrong value persists until the next dirty signal — notes don't bump `dirtySeq`, so in a quiet stretch the stall is sticky (same persistence profile as W101-F4). Boolean flapping is bounded: only completion frames stamp.

**Fix sketch:** in `noteRemoved`'s no-note branch, write the `−δ` note only when `notedWalk.visits.get(root) !== undefined` (the walk counted it — retract); otherwise the detached-skip already excludes it and no note is needed. In `noteAdded`, `notedWalk.detached.delete(root)` — the pop check walks real parentage, so a re-add under a dead ancestor still skips correctly, while a re-add under live content is counted again. Optional hardening: ignore root-scoped notes whose root can't reach `scene` at note time. Effort **S**. Magic-frame impact **M** (no brick; a real visible-quality regression direction the conservative-on contract was designed to never take). Risk **low** — write-path and stamp math only; add/remove bookkeeping unchanged.

### F2 — paced retire bursts retire minted-but-stale slots/ids with no re-validation at retire time

**Evidence:**
- `src/render/presentationWorld.js:1306-1335` — `updateFromEntitiesSteps` (`retireSuppressed` arm) mints `deadResidents` as raw **slot numbers** under pacing (`byId.get(...)===slot` checked *at mint*, 1316), then the burst calls `retireSlot(slot)` (1332-1335) which re-validates nothing (`722-745`: `byId.delete`, `removeActive`, `alive=0` unconditionally).
- `src/render/presentationWorld.js:1341-1353` — the `absent` burst mints entity ids (`1345-1346`) and calls `retire(entityId)` (1350-1353) → `byId.get` re-resolves at call (749) but carries **no** generation, so the `sourceGenerations` guard at 751 never engages.
- `src/render/presentationWorld.js:633-637` — `allocateRecord` recycles `freeSlots` and bumps `slotGenerations`; a retired slot re-mints for a new live entity inside the same suspension window.
- `src/render/presentationPublisher.js:72-77, 208-242` — the apply parks per consume under a 4 ms bound (`pendingApplyIter` survives arbitrarily many presents on a dense world); `applyRecord` DESTROY/SPAWN (`282-289, 291-296`) runs `world.retire`/`allocateRecord` from the *journal* path, which a later consume can drive while the fallback apply is still parked — the genuine interleave.

**Mechanism (lane (c) enumeration):** the burst lists are snapshots taken under suspension; the retires execute against a world that moved on. For `deadResidents`: slot S is minted (dead resident), the generator yields, a destroy record retires S (`removeActive` swap-move, `alive=0`, `freeSlots.push(S)`), a spawn record re-allocates S for live entity E — then the stale burst resumes and `retireSlot(S)` kills E's live row: `byId.delete(E_id)`, grid/active removal, `packDirty` cleared — E pops out for ≥1 feed (re-alloc + rebind on the next apply) and its bound mesh briefly orphans. For `absent`: the id-keyed path shrinks the window to a *same-id* resurrection mid-burst (pooled id reuse or a replayed spawn of the same entity id) — `retire(entityId)` finds the fresh row and kills it with no generation check. Trigger windows are exactly the churn frames these bursts exist to amortize (journal invalid → stepped rebuild → parked fallback apply + interleaved destroy/spawn records).

**Fix sketch:** make the bursts self-validating — `deadResidents` mints `{slot, gen: world.slotGenerations[slot], resident}` and the retire loop re-checks `world.alive[slot]===1 && world.slotGenerations[slot]===gen && world.entityRefs[slot]===resident && resident.alive===false` before `retireSlot`; `absent` mints `{id, gen: world.sourceGenerations[slot]}` and calls `retire(id, gen)` so a recycled or re-stamped row is skipped (the journal DESTROY path already uses the identical generation contract at `applyRecord` → `world.retire(record.entityId, record.generation)`). Effort **S**. Magic-frame impact **M** (a rare but real pop-out — the precise defect class the bar names). Risk **low**.

## W101 machinery verification (concrete)

| Item | Verdict | Evidence |
|---|---|---|
| compile-reveal invariant restore | **Sound** | All 6 `compileOne` sites stamp env *before* the reveal: `renderer.js:11902→11903`, `12958→12959`, `13386→13387`, `15016→15017`, `16064→16065`, `16232→16233`. `renderer.compile()` runs synchronously inside the `compilePipelinesContextSafe` Promise executor (`bloom.js:627-662`), reached sync via `_compilePostRoute` → `compileScenePipelinesForRenderTarget` (`bloom.js:364-377`) — the `traverseVisible` census lands inside `whileRevealed`. `whileRevealedGroup` awaits `run()` (16044) so reveals hold across suspension; every sync `whileRevealed` wraps only sync work (`touchExactTargetSubject` sync; the compile call's sync prefix). `admitOpeningUnitsAcrossSlices` awaits `touchMany(group)` (`openingGpuAdmission.js:908`). |
| `touchScenePipelines` drawableSession forward + scopedPendingWindow | **Sound** | `renderer.js:10753` passes `{ drawableSession }` on the bloom branch (fallback 10755 identical) → `bloom.js:2203-2204` forwards `options` → `withOnlySubjectsDrawable(..., options.drawableSession)` (`openingGpuAdmission.js:693`). `scopedPendingWindow = pendingOnlyWindow \|\| unreadyProgramsPending === true` (`bloom.js:1283`); `UNREADY_PENDING_SWEEP_FRAMES = 30` failsafe sweeps at `bloom.js:1147, 1294-1296`. Single-subject `touchOne` mints no session — consistent. |
| packedSlotGens generation-keyed dedup | **Sound** | `snapshotFence.js:414-470` — `packRow` guard reads `world.slotGenerations[slot]` (`entityIds` fallback) and skips only same-identity rows; `allocateRecord` bumps `slotGenerations` (`presentationWorld.js:637`) so retire+realloc defeats the skip. W102 superseded the positional appended sweep with `liveSlotValues()` = `byId.values()` (1482) gated on `worldChurned` (494-505) — `byId`/`activeSlots` mutate only inside `allocateRecord`/`retireSlot`, which always bump `diagnostics.allocations`/`retirements` (676, 743), so the gate is exact. |
| notedWalk detached-set + negative-delta notes | **Sound + residual (F1)** | Liveness check stops ghost absorption (58-65); `{−δ}` bookkeeping for note-bearing roots correct (149-161); `resetNotedWalk` demotes `note.seq→0` and clears `detached` (99-111). Residual hole in the no-note remove branch and missing `detached.delete` on re-add — F1. |
| unfreezeHiddenSubtreeMatrices re-mark | **Sound** | `staticChildMatrices.js:177-201` — restore clears `sfCullFrozen`/`sfMatrixFrozen` only on stamped nodes; `markStaticMatrixSubtrees(root)` re-marks only where `matrixAutoUpdate===false` with all children marked — a restored-live descendant defeats ancestor marks but never carries `sfMatrixFrozen` itself. |
| describeOpeningInstancedPbrLeaves deferred reads | **Sound** | `renderer.js:25398-25408, 25554-25564` — both O(scene) reads inside `_rendererLifecycle`-guarded `setTimeout(0)` (unguarded fallback only when lifecycle absent); `armedPlanForPbr` staleness guard drops the stamp on plan rotation; single assignment → readers see absent-or-complete. |
| _queueHiddenSubtreeFreeze/_drainHiddenFreezeQueue | **Sound** | All three mint legs enqueue (`renderer.js:21222` bind, `23270` doomed, `23322` hidden); drain mints ≤`HIDDEN_FREEZE_MINT_ROOTS_PER_PASS`(6) + ≤256 scans (889-893), preserves compose-then-freeze (21117-21120); stale entries drop on unbind-clear/`sfHiddenFrozen`/`matrixAutoUpdate!==true`/`visible===true`/`!parent` (21101-21114); `sfHiddenUnfreezeQueued`/`sfHiddenFreezeQueued` cleared at unbind (21339-21340). W102 added the symmetric bounded unfreeze drain (21142-21167, call site 23729) + flap hysteresis (21105-21109, `HIDDEN_FREEZE_FLAP_DWELL=3` vs `sfHiddenFreezeLastShowSeq` 23375). Deferred mint = benefit-only either way. |
| paced admit collects | **Sound** | `reattachDetachedAdmissionTextures` drives `collectStartupTexturesSteps` under `yieldToMain` (`openingGpuAdmission.js:33-48`, awaited at 793); `drawableHideSessionSteps` pre-order-identical (483-497); all 4 mint sites mint the session BEFORE the reveal (`renderer.js:13404` seal, `15037` rock, `16074` late, `16239` rescan); sync fallbacks behind `typeof` guards (`10761-10771`). |

## Lane residuals

**(b) `_pendingHiddenFreeze` drain coverage — SAFE, benefit-only.** The freeze/unfreeze queues drain only inside `syncEntityViews` (`renderer.js:23331, 23729`), which runs every `prepareFrame` (24673) plus the `prepareOpeningFirstPicture` seam (24157) — i.e. every presented frame in every mode. Windows that queue roots without a same-frame drain: `_contextLost` early-return (24612), the `holdOpeningPicture` gate (24657-24671, bounded by `OPENING_PICTURE_HOLD_FAILSAFE_MS`), and bind-time queueing during loading cooks before the picture pass. A starved entry just keeps paying the unfrozen compose it always paid — deferral is benefit-only in both directions (unfreeze defers only the interior `sfCullFrozen` restore; the root resumes at 23374 and `matrixWorldNeedsUpdate` force-descends marked subtrees). No starvation defect.

**(d) remaining presented-frame walks, ranked by worst-case node count:**

1. `scene.updateMatrixWorld()` — O(live-unfrozen scene) every presented frame (`renderer.js:27491`) — irreducible floor; `sfMatrixFrozen`/`sfHiddenFrozen` prune culled hulls.
2. `syncEntityViews` — `presentationQueries.query` classify O(active) + hidden/visible row loops O(hidden+visible) of O(1) work (23248-23724); retain-cache skips the spatial collect on quiet frames (`presentationQueries.js:9-13`).
3. `scanPresentedDrawables(scene)` — O(visible-scene) but now only every 30th pending frame (scoped window) or on uninstrumented growth (`bloom.js:1284-1296`).
4. `lightCensusSignatureSteps` re-mint — O(scene) amortized ≤4 ms/invocation while the stale sig serves (`renderer.js:26386-26409`); storm-pinned after 4 supersedes.
5. Program readiness poll — O(programs ~hundreds)/frame while `unreadyProgramsPending` (`bloom.js:1256-1263`).
6. notedWalk recount — ≤4 ms/resolve (`shadowReceiverTally.js:195-248`); bounded.
7. Hidden freeze/unfreeze drains — ≤6 roots × O(subtree≤~200) + ≤256 scans each (`renderer.js:21083-21167`).
8. `_rebindPresentationMeshesSteps` / `packPresentationWorldToFenceSteps` / `updateFromEntitiesSteps` — parked iterators ≤4 ms/frame (`renderer.js:24514-24607`; `presentationPublisher.js:208-242`); the fence's O(active) membership sweep is churn-gated.
9. `endRenderEntityFrame` ≤256 evictions/frame; `advanceVisibilityHysteresis` O(held keys); `syncSceneStateFromFrame` O(records+owners); `applyInstanceChunkPolicies`+`consolidateOpaqueInstanceChunks` O(pools×chunks) 32-recompute budget; `syncPoolBucket` O(bucket); `updateShipPitchPresentation` O(ship candidates); `syncResolvingMarker`/`updateHulkEmber` O(1)/row; `syncContactShadowPool`/`syncShipAuxPools`/`tickShieldShellClock`/`updateCameraOccluders` O(frame records).
10. Bloom brick diagnostics (`describeUnstampedVisibleGeometries` et al.) — O(scene) but only on frames that already blew the brick threshold, by design (`bloom.js:1816-1929`).

Everything heavier — residency reconcile/reattach/lease/hold-exempt drains, admission legs, emits, cooks — rides stepped iterators under 4 ms or pacedFrameSpend bounds. No remaining legal O(scene)-per-presented-frame walk outside the bounded failsafes.

## Prior-wave adjudication notes

- Lane (a): both add→remove over-count orders from W101-F4 are closed by the landed detached-set + negative-delta notes; the *remove* direction now under-counts in two orders — F1.
- Lane (b): enumerated above — benefit-only, safe.
- Lane (c): the `absent` burst's id-keying covers slot recycling; `deadResidents`' slot-keying covers nothing — F2. `world.clearSteps`' entity-id retire contract (publisher comment 79-81) confirms id-keyed retires are the intended stale-safe shape.
- Sim determinism untouched — all findings are render-side bookkeeping; nothing requires entity/sim mutation.
