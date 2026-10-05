# Wave 77 audit — lane: lod-in-frame

**Head audited:** `devin/1791064509-perf-w60` @ `275668d3d` (post-W76).
**Bar:** the presented frame almost never shows LOD stand-ins; nothing pops in late; no hitching; nothing loads except what the visible frame needs.

## Verdict

`saturated: false`

Two contract-preserving improvements with concrete implementation paths remain (F1, F2). Neither requires touching sim code; both are ordering/budgeting fixes inside machinery that already exists.

## Ranked findings

### F1 — Shared collect budget + break-on-abort starves the depth-stage queue tail

**Evidence:** `src/render/renderer.js:22182-22204` — `collectNodeBudget` is ONE `{remaining}` wallet for the whole slice (`SHADOW_DEPTH_PASS_NODE_CAP * headScale`); `collectUnstagedShadowCasters` debits every visited node across every root in arm order; an `UNSTAGED_COLLECT_OVER_COVER` return escalates only the aborting root's `entry.depthNodeScale` (`×2`, cap 8) and `break`s, requeuing `slice[collected..]`. `headScale` reads `slice[0]`'s scale only (22183), so an escalated root's enlarged allowance applies **only when it sits at slice head**.

**Mechanism:** Entries drain nearest-first by `shadowCastAxisDistance` — order is stable while the player holds position. A fat subtree sitting mid-slice aborts at the same position every arm: the shared wallet is spent by the roots ahead of it before its own (never-applied) scale is reached. Every root behind it never collects → their meshes stay withheld → permanently dark shadows for the tail cohort while the fat root lives in pending. The stall is bounded by prefix length when the head completes — but an escalated root whose true size exceeds the cap (`>32k` visited nodes at scale 8) at head position aborts at `collected === 0` **every arm**: the whole pending queue wedges behind it until the root leaves the ortho and parks. Each abort also re-walks up to the cap worth of nodes — 4k–32k userData checks per arm spent on zero progress. Player-visible class: missing shadows on an entire approaching cohort while docked near a fat authored structure.

**Fix sketch:** give each root its own budget — `const perRootBudget = { remaining: SHADOW_DEPTH_PASS_NODE_CAP * (entry.depthNodeScale || 1) }` per iteration. The arm is already bounded by `collectDeadline` for aggregate cost; per-root caps bound each subtree and delete the ordering dependency entirely (a mid-slice escalated root's scale then actually functions). Optionally cap escalation arms and park a permanently-oversized root like undrawable leftovers (`allOffered`-style) so it stops paying a re-walk per arm.

**Effort:** S-M. **Magic-frame impact:** M (starved shadows are dark inside the frame; in the >32k pathology the fix is the difference between staged and never). **Risk:** low — same collect/mark/restore machinery; ordering only.

### F2 — Urgent geometry burst pays ONE unSliced merged residency pass, unbounded in batch size

**Evidence:** `src/render/liveGeometryAdmission.js:176-228` — `drainUrgentLane` sweeps *every* pending urgent root into `collectBatch()`; `runUrgentBatch` runs `prepareBatch(roots, { unSliced: true })`. Wiring at `src/render/renderer.js:9939-9954`: `unSliced` sets `yieldSlice = null`, so the per-item `yieldToMain` degrades to the `isActive` check — zero present-gap yields for the entire merged pass.

**Mechanism:** "One bounded upload burst" is bounded only by burst size, which is unbounded: a mass on-glass pending arrival (F9 remat crossing the glass, a held live-build cohort turning visible at once) serializes ALL of its texture+geometry uploads into a single between-presents task. The task runs on the main thread and delays the next present by its whole duration — a hitch landing exactly when the screen is fullest. Per-root ambient entries that cross on-glass mid-compile bail to the same `unSliced` prepare (`liveGeometryAdmission.js:139-141`), so a single root is fine — the defect is batch-size-proportional.

**Fix sketch:** thread the paced ledger into the merged pass. The machinery already exists — the sliced path at `renderer.js:9942-9954` consults `pacedFrameSpend() >= PACED_FRAME_BUDGET_MS` and debits per slice; give `unSliced` batches a per-upload ledger check (yield between uploads once spent) while keeping "one chain link" semantics. Pending roots that spill stay latched/hidden (already true), so the trade is burst-tail latency vs a guaranteed hitch — the bar prefers the former for large bursts; keeping `unSliced` below a small root/upload count preserves the current fast path for the common 1-2 root case.

**Effort:** M. **Magic-frame impact:** M (presented-frame gap proportional to burst size). **Risk:** deliberate original trade; lengthens time-to-visible for the tail of a big burst.

### F3 — `isUrgent` rebuilds the live frustum + `liveCam.updateMatrixWorld()` per pending entry

**Evidence:** `src/render/renderer.js:10419-10438` — each call does `_entityViewCullBounds()` + `entityVisualCullRadius` + `updateMatrixWorld()` + `_liveViewProjView.multiplyMatrices` + `setFromProjectionMatrix`. Called once per pending entry per `pickNextWhere` scan (`liveGeometryAdmission.js:87-103`) and once per entry per `stats()` call (410) — and `stats()` is invoked every frame by render diagnostics.

**Mechanism:** the camera cannot move between entries in one scan — every per-entry rebuild recomputes an identical frustum. Burn is small per call (~µs×N) but happens every frame for every pending root, and N is exactly what grows during the bursts this lane exists to serve.

**Fix sketch:** memoize the frustum per drain/frame — key on `_viewSyncSeq` (the same generation the shadow census memo uses) or stamp it once at `drain()` entry and reuse inside `isUrgent`.

**Effort:** S. **Impact:** L. **Risk:** none — verdicts identical, strictly fresher-or-equal data.

### F4 — `parkedRelease` leaves a stale `_withheldDepthCasters` set

**Evidence:** `src/render/renderer.js:21896-21900` — `parkedMap.delete(root)` fires *before* `const parked = parkedMap.has(root)`, so on the parkedRelease path `parked === false` and the release block at 21973-21979 (`parked && unstaged !== null && unstaged.length === 0` → `parkedMap.delete` + `_withheldDepthCasters.delete`) is unreachable — it can only fire via the parked-recheck path where `parked` is still true.

**Mechanism:** a parked root that unparks on dirtySeq/lightSig/ortho drift and then collects empty keeps its stale withheld Set in `_withheldDepthCasters` — mesh references retained under a root key that is no longer withheld. Flags still restore correctly (the full `syncShadowCasterPolicy` traverse covers the whole subtree, not just the Set), so this is a bounded reference leak + dead cache, not a visual defect.

**Fix sketch:** `if (this._withheldDepthCasters) this._withheldDepthCasters.delete(root);` inside the `if (parkedRelease)` block — the same cleanup the detach sweep already performs.

**Effort:** S. **Impact:** L. **Risk:** none.

### F5 — Fresh-literal requeues silently drop `entry.depthNodeScale`

**Evidence:** `src/render/renderer.js:22348` — partial-leftover requeue writes `pending.set(root, { lodLevel, entity })` (new object); `src/render/renderer.js:22068` — `_queueShadowDepthStage` unconditionally `pending.set(root, { lodLevel, entity })`, overwriting an existing entry on a re-dirty-while-pending.

**Mechanism:** escalation survives arm-internal requeues (`pending.set(root, entry)` at 22203 preserves the object) but is discarded at both fresh-literal sites — an escalated root re-collects at scale 1 next arm, paying another atomic fat-root traverse + abort arm before re-escalating. Compounds F1 (each wasted arm still walks up to the cap).

**Fix sketch:** requeue the same entry object (as the collect path already does), or merge: `pending.set(root, { ...(pending.get(root) || {}), lodLevel, entity })`.

**Effort:** S. **Impact:** L. **Risk:** none — matches the arm's own requeue semantics.

### F6 — `_depthVariantCache` prefix-only bit compare (latent)

**Evidence:** `src/render/shadowDepthAdmission.js:364-392` — `cached.bits.every((bit, i) => bit === bits[i])` iterates the *cached* array's length.

**Mechanism:** correct today (10 bits both sides). Adding an 11th discriminant later makes old cached entries pass on the 10-bit prefix → a mutated material silently reuses a stale depth variant → wrong program in the shadow pass, no error.

**Fix sketch:** compare `cached.bits.length === bits.length` (or `every` over the new array).

**Effort:** S. **Impact:** L (latent hazard). **Risk:** none.

### F7 — `appearanceChanged` rebuild latches `geometryPending` without enqueueing to the live-admission lane

**Evidence:** `src/render/renderer.js:19577-19581` sets `geometryPending = true` but skips the direct `this._liveGeometryAdmissions.enqueue(e, m)` the build path has at `19445-19447`. The bound-roots sync loop (`20057-20060`) re-enqueues it next frame — self-heals with one extra frame of hidden time for bound entities; unbound rebuilds are invisible anyway.

**Fix sketch:** mirror the build path's direct enqueue under the same `firstPlayableFrameAt` guard.

**Effort:** S. **Impact:** L. **Risk:** none.

### F8 — Hold-exempt kick pump can take 0 steps under the shared `commitSteps` wallet

**Evidence:** `src/render/renderer.js:2503-2664` — commit pumps gate on `commitBounded && commitSteps > 0 && (over commitSliceMs || ledger)`; the enqueue pump consumes the shared `commitSteps`, so a spent beat leaves the kick pump's `> 0` check false → zero kick steps that beat. The iterator persists (nothing is dropped), so the nit is pacing fidelity, not correctness — the comment's "≥1 step/beat for both pumps" overpromises.

**Fix sketch:** per-pump step counters, or evaluate the kick pump before the enqueue pump consumes the wallet.

**Effort:** S. **Impact:** L. **Risk:** none.

### F9 — `drainDeferredEnterSlice` dead-epoch purge runs undebited

**Evidence:** `src/core/sectorEnterDefer.js:138-148` — the stale-epoch sweep runs before `startsAt` is captured, so its cost lands in neither the private slice clock nor the paced ledger. Bounded by pending-map size (small); an accounting gap only.

**Fix sketch:** capture `startsAt` before the sweep or debit `now() - sweepStart` after it.

**Effort:** S. **Impact:** L. **Risk:** none.

## Regression notes — W67+ machinery verified concretely at `275668d3d`

### Deadline-bounded arm (`_armDepthStage`, renderer.js:22080-22436)

- **(a) Min-progress is real:** collect deadline breaks only after `collected >= 2` (22199: `collected < sliceRoots.length && collected >= 2 && armNow() >= collectDeadline`); restore deadline breaks only after `restored >= 1` (22398). A 32-fat-root slice cannot starve the drain *by wall clock*. Two honest caveats: the deadline only gates **between** roots (the first root's traverse is atomic and can overshoot the 4 ms wall — accounted by the whole-arm ledger debit), and `UNSTAGED_COLLECT_OVER_COVER` breaks at any `collected` including 0 (F1 — a second, earlier break axis the min-2 gate does not cover).
- **(b) Mid-slice requeue keeps withheld flags, re-collects fresh:** `slice.splice(collected)` → `pending.set(root, entry)` pushes back the same entry objects (22201-22204); withheld meshes' `castShadow=false` survive (the withhold was never undone); `legSet`/`unstagedByRoot` are arm-local and discarded.
- **(c) `{lodLevel, entity}` preserved:** same-object requeue — except the two fresh-literal sites that drop `depthNodeScale` (F5).
- **(d) Whole-arm debit:** `notePacedFrameSpend(armNow() - armStartedAt)` in `finally` (22423) covers census mint, session slice render, restores, and sweeps — throw or not. Re-arm lives in `finally` too (22427-22433): a mid-slice throw cannot wedge `_depthStageScheduled`.

### `_parkedDepthStageRoots` undrawable parking

- **(a) Parked counts as queued:** `queued = pending.has(root) || parked` (21901); `band !== 1 && queued` → `syncOpts.allowCast = false` keeps flags withheld (21986-21987). The cached re-stamp branch (21988-22001) keeps dirty set so the arm's restore re-runs.
- **(b) dirtySeq bump unparks into the normal collect:** `dirtySeq > parkedEntry.seq` → `parkedMap.delete` (21887-21897) BEFORE the queued gate → non-empty collect withholds again (union at 22010-22020) — **but the empty-collect release (21973-21979) is unreachable on the parkedRelease path** since `parked` reads false post-delete; see F4. Via the parked-recheck path (`parkedEntry.recheck` expiry, 21911-21923) `parked` stays true and the release does fire.
- **(c) Empty collect releases park and restores flags:** verified for the recheck flow; the stale-Set residue is F4.
- **(d) Detached sweeps:** pending sweep 22121-22131 and parked sweep 22135-22146 drop `!root.parent` roots and clear `STAGE_SELF_DIRTY_KEY`/`_withheldDepthCasters`; the restore loop drops slice members detached mid-arm (22292-22301).
- **(e) Partial leftover never parks:** `allOffered` requires every leftover mesh ∈ `legSet` (22313-22317); else `pending.set` requeues (22348).

### Paced-ledger routing — every enumerated site checked

- Reconcile + poll pumps (2109-2185): post-step `>= 4 ms || pacedFrameSpend() >= BUDGET` break → ≥1 step/frame; unconditional debit (2138, 2184).
- Hold-exempt collect/commit/kick/remint (2503-2664): post-step `commitBounded && commitSteps > 0 && …` gates — F8 nit on the shared wallet; whole-beat debit at 2662.
- `drainDeferredEnterSlice` (`src/core/sectorEnterDefer.js:163`): `steps === 0 ||` preserves min-1; debit at 189; purge nit F9.
- `drainEmitSlice`/`drainPresentationTail` (`src/core/eventBus.js:321-420`): `performance.now() >= deadline || pacedFrameSpend() >= BUDGET` is post-listener → min-1; `ran > 0` debit; queued restart threads remaining window.
- `_drainMeshBuildQueue` (19316-19324): `usePacedLedger: true`; in `shouldContinueAdmissionSlice` the ledger check sits after `itemsDone < minItems` (`admissionSliceBudget.js:37-38`) → min-1 preserved; whole-drain debit 19527.
- `drainDespawnDisposeQueue` (1808-1849): entry-gate `pacedFrameSpend() >= BUDGET && ledgerSkips < 2 → return 0` — defers wholesale but never drops; the ≤2-skip cap forces a drain every third frame. Verified as the ONE wholesale-skip site.
- Arm collect min-2 / restore min-1 above; `_parkBoundedWarmRoots` `roots >= 1` (17955); `_mintDeferredPaletteSubjects` + deferred build legs yield at top-of-iteration, never drop items.
- 8 ms window semantics (`decodeTaskBudget.js:40-169`): rAF-epoch ledger when the pump is fresh (`PACE_EPOCH_STALE_MS` 250), else the `paceFrameStartedAt` wall window — long frames cannot under-report (spend is tagged to the same rAF epoch; later slicers in the frame see it).

### Flag-only OFF→ON collect

- **`_stageShadowDepthOnSettingEnable` (22448-22553)** uses `collectUnstagedShadowCastersFlag` per top-level child — mark-aware, so already-staged meshes are excluded from the withheld set by construction.
- **(a)** Already-staged mesh re-collected-unstaged-empty in its arm: `unstagedByRoot` gets no entry → no leftover → plain restore loop → `syncShadowCasterPolicy` with live opts restores flags + `_withheldDepthCasters.delete(root)` (22363). Over-withhold self-heals in one arm.
- **(b)** Same path — withheld set resolving is the arm's empty-collect → leftover-less restore. Verified.
- **(c) Exclusion parity holds by construction:** both collectors funnel through `collectPotentialShadowCastSubjects` — `spacefaceNoShadow`, `sharedContactShadow`, `authoredReadableFallbackLayer`, geometry-null, visible≠false/!transparent/depthWrite/opacity all identical (`shadowDepthAdmission.js:178-211`).
- Ordering verified: `settings:changed` runs `_syncShadowMapEnabled()` (which flips `_keyLight.castShadow`) BEFORE `_stageShadowDepthOnSettingEnable()` (14359-14364), so the OFF→ON census mints under the ON-era light set — ON-era marks stay current.

### `reset:true` prepare defer (physics.js:352-455)

- **(a)** Post-sleep `_disableSg02DynamicAuthority` in `!_sg02Init && !_sg02` is a true no-op: token bump is gated `if (this._sg02 || this._sg02Init)` (772) → no bump, no dispose, only `_diag` field writes.
- **(b)** A caller abandoning the wait still mints: the async continuation proceeds to `_updateSg02DynamicAuthority` → mints `_sg02Init` → owner installs on resolve for the next click.
- **(c)** Concurrent deferred prepares can't interleave mints: every mint is token-bumped (`++this._sg02Token` at 575), the defer detects the bump and adopts the winner's `_sg02Init` (388-406) on the *init's remaining* envelope (`sg02InitJoinMs`, 371-375); two sleepers both passing the token check funnel through `if (reset) { await this._sg02Init settle; _disable; }` → last click wins, stale tails cut at 440 (`sg02TokenAtPrepare !== this._sg02Token → return false`).

### `_depthVariantCache` variant interning (shadowDepthAdmission.js:364-392)

- **(a)** `alphaTest` 0→1 flips bits[0] → re-mint + overwrite. Bits are recomputed from the material each call → `needsUpdate`-safe.
- **(b)** `side`/`shadowSide` feed verbatim (`== null ? 0 : material.side`) — 0/1/2 distinct.
- **(c)** No stale variant today; the prefix-only `every` compare is a latent hazard for the next bit added (F6).

## Lane residual enumeration (prompt a-d)

**(a) `entry.depthNodeScale` — every writer/reader:** writer is ONLY 22193 (`×2`, cap 8) on the aborting entry; reader is ONLY 22183 (`headScale` = slice[0]'s scale). Scale rides the entry object: survives arm-internal requeues (22203, 22411); dropped by fresh-literal requeues (22348, 22068) and dies with the entry when the root stages out (scale resets organically on next unstaging — no session-lifetime inflation). Head-scale inflation is per-head-tenure: a queued over-covered root inflates its siblings' slices only while it occupies slice[0]; when it drops, the new head's own scale applies. The harmful ordering is the reverse — escalated scale sitting mid-slice never reaches the shared wallet (F1).

**(b) `_unbindPresentationMesh` callers passing `entityId = null`:** **none.** All 12 call sites pass real entity ids: 1760 (rekey sweep, `oldId`), 7305/7348 (rollback boundary `id`), 7853 (dispose-loop `id`), 11467/13539 (leftover/F9 clears), 14208/14229 (keep-GPU remat, entity-destroyed), 18654/18831/18964 (clear/reconcile/residency evicts), 19547 (appearanceChanged). The `entityId == null` arm (release under mark owner + delete marks) is latent "unbind-regardless" semantics — correct for whole-mesh depart, currently unexercised. `world.handleForEntityId(null)` returns null → world unbind no-ops; the mark-release still runs before that gate — consistent.

**(c) Every `collectUnstagedShadowCasters[Flag]` call site vs the sentinel:** budgeted sites all check `=== UNSTAGED_COLLECT_OVER_COVER`: 21950 (sync-gate flag collect → `overCovered`), 22190 (arm signature collect → escalate+break), 22477 (OFF→ON flag collect → queueOverCover). Unbudgeted sites cannot produce it (`nodeBudget` null → `debitNode` no-ops): 13804 (post-opening main leg), 13889 (rescan delta), plus `compileShadowDepthPipelines`'s internal `collectPotentialShadowCastSubjects` (496). No site treats the sentinel as an empty/mixed list.

**(d) Over-cover atomicity + requeue fidelity:** the sentinel is returned in place of a list (abort mid-traverse throws before any array is returned) → the root is skipped whole, never partially staged; its withheld flags persist. `pending.set(root, entry)` requeues preserve `{lodLevel, entity}` — plus `depthNodeScale` on same-object paths (exception: F5's two fresh-literal sites).

## Verified-clean lane surfaces (checked, no defect)

- `WHOLE_SHIP_LOD_RUNTIME_DEMOTION = false` (`wholeShipLodPolicy.js:14`): live ships keep their admission body; `resolveLiveWholeShipLodTransition` maps `load` → `keep` so no second file admits on-glass. `selectPrewarmLodLevel` pins `lod0` while demotion is off; prewarm warms `lod2` only (stand-in borrow). In-file LOD toggles (`applyProjectedDetailLod`, composed `updateLod` chains) flip visibility only — no compile/upload inside the swap.
- `syncResolvingMarker` (3420-3474): marker draws only while authored status is pending, banks with the hull, hides the frame real siblings appear (`3473`), retires to the sanctioned procedural fallback after the retry cap — no permanent marker, no pop-overlap.
- `entityMeshVisibility.js:14-61`: `geometryPending`/`pipelinesPending`/`authoredPending` gates hide unready roots; `resolvingMarker` exemption only lets the already-linked stand-in draw; `onLiveGlass` boolean is the measured verdict (stale tier can't force-submit).
- Urgent-lane parity: `isUrgent` (`renderer.js:10419-10438`) mirrors the on-glass pending gauge's test (`rootOnLiveGlass`, same bounds/frustum/origin; gauge radius ≥ urgent radius) — every pending-on-glass entry tests urgent.
- LOD resolver hysteresis (`lod.js:75-85`) + `adopt()` seeding on swap prevents visible-lod thrashing; `SYNC_ENTITY_LOD_RETAIN` elides no-op `updateLod` traverses; `farSpeck` skips runtime closures for lod2 specks but keeps damage updates.

## Out of scope / previously adjudicated

Not re-reported per contract: BatchedMesh specimen gap; loading artwork GL pause; ambient compile-tail serialization; LOD-F2/F3/F5 markers; LOD-N4 deadline-class depth over-inclusion; world-store.js/slotMap machinery; BOOT-F3(a)/F7; F4/F5/F9 emit slicing; F6 payload intern; next-wave-nxb-059 stale scan. Preexisting clean-master test failures left untouched.
