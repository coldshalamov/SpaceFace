# wave145 render-verify report

- Lane: render (presented-frame pipeline) — read-only audit, no code/PR/app-run.
- Audited tip: `devin/1791504143-perf-w120` @ `e06e39dc2` (fetched + rev-parse pinned 2026-10-11; re-fetched before writing — no drift during audit; the in-flight heap lane had not landed on this branch at pin time).
- Prior pin: `e4c409d32` (wave144 → saturated). Delta pin↔tip = `d775bf662`, `70a655d8a`, `34d824293`, reconcile merge `2af112763`, `73f4c0901`, `e06e39dc2`; the prompt's `9093c6959` sits below the pin and is re-verified here as one mechanism with the two new fixes.
- Headline: `vendor/three.module.js`, `src/render/post/spaceRenderGraph.js`, `src/render/bloom.js`, `src/render/presentPath.js`, `src/render/renderer.js`, `src/render/presentationWorld.js` are **byte-identical pin↔tip**. Among presented-adjacent files only `src/render/snapshotFence.js` (+64/−29 region) and `src/render/vfx.js` (+41) moved — both are named-commit targets. The wave143/144 replay-prelude floor table holds verbatim.

saturated: true — third consecutive saturate on this lane (wave143 + wave144 + wave145); per the lane's stop criterion this closes render-verify.

## VERIFY — new commits vs the presented path

### V-1 steps-twin consume + live-mask restore + finally (`9093c6959` + `73f4c0901` + `e06e39dc2`) — MECHANISM_VERIFIED, no residual stale-pose path

Fast block at snapshotFence.js :615–672 (`packPresentationWorldToFenceSteps`); `consumedDirty`/`fastCommitted` minted :630–631, try opens :632, scan :633–644, counters gate :645–650, commit :651–654, finally :657–669, classic fallthrough :670–672 → `beginPack` :674.

1. **"Finally can't run on the commit path" — precise form verified.** A `return` inside `try` still executes `finally`, so the finally runs on every exit including commit — but the restore inside is inert there: `fastCommitted = true` is set at :653, between `fence.notePackMembership(postDiagnostics)` (:652) and `return fastSnapshot.count` (:654), and the restore is gated `if (!fastCommitted)` (:667). The flag is written only on the commit path — no other exit can set it, and no commit exit can observe it false. Net effect identical to "the restore cannot run on commit."
   - Ordering bonus: a `commit()`/`notePackMembership` throw keeps the flag false → marks restored → safe repack next pack. A post-commit throw restores marks onto an already-valid snapshot — re-pack direction only, never stale.
2. **"Restore loop bounded by `consumedDirty.length` ≤ `scan`" — verified.** `consumedDirty.push(slot)` (:637) fires at most once per scan iteration, only after `dirty[slot] === 0` consume (:636); the bail `break` at :642 stops pushes immediately. On every exit (bail, counters-mismatch, throw, `.return()`) `consumedDirty.length` ≤ #marks ≤ `scan` (`Math.min(dirty.length, slotRows.length)` :623). The restore (:668) is O(#marks) typed-array writes, synchronous inside the finally — bounded, and #dirty marks ≪ capacity in practice.
3. **Residual stale-pose paths — enumerated, none found:**
   - Commit: no restore; consumed marks stay cleared — their rows were rewritten into the committed snapshot. ✓
   - Bail at :642 / counters-mismatch at :648–650 / falsy `postDiagnostics`: restore → classic walk repacks every live row, clearing marks as it packs. ✓
   - Throw or `.throw()` mid-scan/mid-rewrite: finally restores → propagates to driver (`closeCookStepsIter` renderer.js :2156–2157, or the pack's own fault path). The wave144 "same-epoch throw strands consumed marks" residual is **closed**. ✓
   - `.return()` supersede (driver calls `pendingPack.iter.return()` renderer.js ~:28126): generator runs finally → marks survive → next pack repacks. Also **closed**. The driver's supersede site additionally wraps `iter.return()` in try/catch — even a pathological finally can't break the paced leg. ✓
   - Live-mask (`73f4c0901`): restore writes `world.packDirty[slot]`, not the captured `dirty` alias. A mid-park `growTyped` (presentationWorld.js :263) reallocates the mask and copies post-consume zeros — restoring into the old array would be a dead write; the live array is always the target. `packDirty` is never nulled (init `new Uint8Array(0)` :201; only grown :263) → the restore can't throw, and every consumed index < `scan` ≤ pre-grow length ≤ post-grow length stays in bounds. ✓
   - Mid-park marks on already-scanned slots: consume-per-slot only clears slots it processes — a mark landing behind the scan cursor survives to the next pack (the W143-BG-1 self-heal, unchanged). Marks on post-grow slots go to the live array while the scan reads the stale alias — never cleared, picked up next pack; and the grow bumps `diagnostics.allocations`, which the counters gate turns into the non-commit/classic path anyway. ✓
   - Premise holds: `fastPackPrevious` (:416–429) requires `world.packDirty`/`entityIds`/`slotGenerations`/`alive` plus counters equal to the last `notePackMembership` stamp plus `poseEpoch` match — worlds lacking the mask take the classic walk, and `dirty` (:622) cannot be undefined inside the block.
4. Capture contract unchanged: the pack remains a stepped leg parked under the 4 ms wall bound (driver block renderer.js :28119–28210, `pacedFrameSpend` consulted before mint :28135–28137, `packFaulted` 3-strike latch :28131–28133); writes only the fence buffer, never the scene; cannot interleave between `renderAndCaptureList`/`renderCapturedList` (one synchronous call in spaceRenderGraph.js). New per-present cost vs pin: one boolean flag + try/finally on commit, or one O(#marks) restore burst inside the same paced call on non-commit — nothing queued to later frames.

### V-2 `8c9daef8d` packageDetachSerial + works consult re-collect — carries verbatim (re-verified)

`src/render/imageSourceDedupe.js`, `src/render/packageCpuDetach.js`, `src/ui/asteroid/asteroidRenderer3d.js` are **byte-identical pin↔tip** — the wave144 V-2 verdict stands: O(1) counter bump on CPU-payload releases only; the re-collect lives in the works-screen `webglcontextrestored` consult, async, event-gated, bounded `CONTEXT_RESTORE_RECOLLECT_MAX = 4`; separate canvas from the presented loop.

### V-3 vfx volume-payload latches (`70a655d8a` deferral + `e06e39dc2` gates) — per-frame cost = two boolean checks, CONFIRMED

- Module eval: `VFX_VOLUME_PAYLOAD_READY = Promise.all([GAS_VOLUME_PAYLOAD_READY, DENSITY_VOLUME_PAYLOAD_READY])` vfx.js :336 — one promise alloc at eval.
- `init()` browser arm: `_volumePoolsPending = true` (:1694); READY continuation owns `_initPools()` (:1695–1698) guarded by `_destroyed === true || !this.state` (:1697); error arm sets `_volumePoolsFailed` + logs + `_scene = null` (:1700–1704). Node path keeps synchronous `_initPools()` (:1688–1689) — no scene, same early-out as before.
- `update(frameDt)` (:12356): the reattach lane is gated `!this._volumePoolsPending && !this._volumePoolsFailed` (:12368) — exactly two boolean reads, and only inside `if (!this._scene)`; once pools attach the branch isn't entered, so steady-state cost is zero. Failure mode = two booleans + falsy `_scene` → early `return` — O(1)/frame, never rethrows.
- Race/idempotency: `_volumePoolsPending` stays true until the READY continuation's microtask runs, so `update()` can never call `_initPools` while a payload is in flight or double-init after arrival (previously a mid-window call threw inside `packed()` and each retry orphaned a partial pool set — the F1 defect this closes). `_initPools` was already repeat-callable via the old per-tick retry lane. `_volumePoolsFailed` is sticky by design — degraded pools, never a mid-frame throw.

### V-4 payload splits (`d775bf662` ruckus + `70a655d8a` volumes) — dynamic import only; none inside a presented-frame task

- Every `import()` is a module-eval kick, none inside a frame task or rAF: gasVolumeData.js :21–25 (`density.js` + `motion.js`), densityVolumeData.js :11–13 (`rle.js`), ruckusModel.js `ruckusWarmReady` IIFE :216–221 (`ruckusMeshData/{body0,body1,body2,core}.js`).
- Decode consumers are structurally gated, not timing-gated: `packed()` throws in a browser before arrival (gasVolumeData.js :29–41, densityVolumeData.js :16–28 — "unreachable" by contract); the only real callers are `_initPools` (READY-deferred) and the precompile salvo (`await Promise.all([GAS_VOLUME_PAYLOAD_READY, DENSITY_VOLUME_PAYLOAD_READY])` precompile.js :384 before `createVfxPrecompileSalvo`). `transientVfxMaterials.js :8` / `gasVolumeMaterial.js :63` memoize — post-warm hits are one falsy check, spawn-rate not frame-rate.
- Ruckus: `templateSteps` reads `meshData.get(key) || coldEntry(key)` (:52–53); `coldEntry` resolves via Node `createRequire` only and throws a descriptive error in a browser (:26–38) — unreachable in production because both title→flight gates await `ruckusWarmReady` (main.js :239 restore path, :708 before `bootstrapScene`); RU-7 entities only spawn inside a run. The warm keeps the W142 pacing contract (one template sub-step per `setTimeout(0)` :226–230); a mid-warm `template()` still pumps the shared pending iterator synchronously. Added per-call cost: one `Map.get` + a 4-element `includes()` at templateSteps head — spawn-rate.
- Failure-semantics note (not a defect): a payload-import failure now rejects `ruckusWarmReady` → the title→flight gates reject with a logged error rather than faulting a later frame — same failure class, earlier surface.
- `index.html`: +7 `modulepreload fetchpriority="low"` hints for the payload modules plus a registry resync of pre-existing modules — fetch hints only, no code.

### V-5 `34d824293` test repin — test-only

`test/ui-frame-references/budgets.json` (uiSourceDigest hash) + `source-manifest.json` regen; zero `src/` changes — consistent with the `sync-modulepreload` regen that produced the index.html resync.

### V-6 merge `2af112763` — zero machinery additions

Reconcile merge of the same branch; the net pin↔tip `git diff --stat` contains no file beyond the named commits' — verified above.

## FLOOR TABLE — re-verify at `e06e39dc2`

`renderer.js`, `spaceRenderGraph.js`, `three.module.js` byte-identical ⇒ the wave143/144 table holds verbatim: replay copy + instanced filter; `projectObject`/`finish`/`sort`/`addToRenderList` inside the non-replay else; depth-gated shell capture; `info.render.frame`/`setupLights` falsy guards; `shadowMap.render` empty-`shadowsArray` early-out; capturedList predicates falsy-normalized. Residual O(>1) on a replay call remains the O(N) shell copy + O(N) draws — the floor itself.

## HUNT (fresh — per-frame/per-present additions anywhere in the delta)

- **H-A finally-restore burst placement** — runs inside the generator's own frame (driver `.return()`/natural completion, same paced call); O(#marks) ≤ O(scan); nothing deferred to later frames.
- **H-B module-eval arms** — the three READY consts + `ruckusWarmReady` IIFE kick at module eval and resolve via fetch/macrotask; the warm's per-step `setTimeout` is the only new timer in the whole delta and preserves W142 pacing — no rAF coupling.
- **H-C deferred `_initPools` attach** — runs inside a `.then` microtask/task drain between frames, never inside a presented pass; resolves in the boot window before title→flight. Worst case it is one bounded attach — the same class the old update()-lane retry performed.
- **H-D delta-wide sweep** — every `+` line across `src/**` grepped for `requestAnimationFrame|setInterval|onBeforeRender|onAfterRender|updateMatrixWorld|.render(` additions: only the warm's `setTimeout` matches. No new presentation-loop subscriptions, no new scene-graph calls; the sole `update()` delta is the two booleans.

## STANDING LEDGER

- **CLOSED this wave:** snapshotFence same-epoch throw/`.return()` mark-strand (wave144 watch item) — finally + live-mask restore covers it; restore also unreachable-throw-safe (`packDirty` never null after init).
- F1 pre-existing edge (thrown render leaves `renderListStack` non-empty → later captures silently dead) — unchanged, carried.
- `consumedDirty` per-mint array + two 3-element literals in the replay copy — micro-allocs, off steady path when the fast pack wins; carried.
- Nits (non-blocking): `_volumePoolsFailed` sticky degraded mode (intended); payload-import failure hard-blocks title→flight with a logged error (earlier surface, same failure class); `notePackMembership` post-commit throw → marks restored on a valid snapshot → harmless repack.
- Debug assert residual; PR #260 — carried.
