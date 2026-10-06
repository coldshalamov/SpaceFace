# Wave-101 perf audit — lane: boot-loading (frozen/stalled loading screens)

Branch `devin/1791064509-perf-w60`, HEAD `73b275a07` (audits W100 commit `047bc1de8`).
Audit-only: no code written, no app run. SwiftShader caveat observed (no GPU-cost claims from wall time).

## saturated: false

Legal contract-preserving improvements remain — including a real W100 regression (F1) and dead W100 machinery (F2), both pure defects rather than tradeoffs.

## W100 regression notes (the 7 machinery items, per the lettered sub-checks)

1. **Stepped collectors** (`collectStartupGeometryDrawablesSteps` startupGpuResidency.js:214-250, `collectUnresidentInstancedDrawablesSteps` :276-303, `collectStartupTexturesSteps` :134-158) — **VERIFIED**. Explicit-stack DFS with reversed child push = identical pre-order to `traverse`; seen-dedupe + `drawableHasWork` + quality-tier facade mint preserved. Every drive carries its own leg's pace fn (pool-seal under `sealPace`/`notePacedFrameSpend` renderer.js:13177-13214, seal collect under `yieldLiveSectorGpu` :15566-15576, startup residency under `yieldToBrowser` startupGpuResidency.js:523+, 666+) plus `cookStale()` bail with `iter.return()`. Sync fallbacks only behind `typeof …Steps !== 'function'` guards. Also verified the fused census twins in latePipelineAdmission.js (collectUncompiledSceneDrawablesSteps, collectLateAdmittedCompileRootsSteps, collectInstancePoolCompileRootsSteps).

2. **`drawableHideSession` / `touchSubjectOnExactTarget` 6th param + 4 touchMany sites** — **VERIFIED as machinery** (but see F1/F2 — it never actually runs correctly). Session mints `drawables` once via `scene.traverse` (openingGpuAdmission.js:455-463); `keep` unions across batches with `!keep.has(p)` ancestor break (:474-477); non-session path byte-identical (:486-492); stale/detached entries hide+restore harmlessly (per-entry saved restore in `finally`, :493-497). Retry semantics verified: keep-union is a superset, so a retried batch's subjects remain un-hidden and still draw.

3. **notedWalk in `recountShadowReceiversSteps`** — **VERIFIED** (shadowReceiverTally.js). `noteAdded` records `{delta,seq}` only while `pendingRecount` live (:119-122); `noteRemoved` records nothing — absorbed-by-construction (:126-133); positive `noteDelta` → `loose`, negative → `dirtySeq+=1` (:137-143); stamp = `max(0, walked + Σ unabsorbed(visitSeq undefined or ≤ note.seq) + loose)` (:192-198); `resetNotedWalk` demotes `note.seq→0` (:89-99).

4. **`freezeHiddenSubtreeMatrices`/`unfreezeHiddenSubtreeMatrices`** — **VERIFIED** (staticChildMatrices.js:155-196 + vendored skip). `sfCullFrozen` stamped only on pass-frozen nodes; `shouldFreezeStaticChild` gate preserved (:17-24); pre-frozen `matrixAutoUpdate===false` nodes skipped without stamping; unfreeze restores stamped subtrees, clears ancestor `sfMatrixFrozen`, sets `matrixWorldNeedsUpdate`. Vendored `updateMatrixWorld` skips frozen subtrees only under `!force` (vendor/three.module.js:139-140) and `add`/`attach` unfreeze ancestors (:151-169). Mint sites: renderer.js:21014-21022 (bind), :23059-23065 (doomed), :23118-23124 (hidden); unbind/visible re-entry unfreezes :21137-21140, :23160-23163.

5. **Radii gating in presentationWorld** — **VERIFIED**. Write only on `Number.isFinite(visualRadius)` (:543); `allocateRecord` seeds `entity.radius` directly with raise-max + prevWasMax dirty bookkeeping (:652-661); apply/record paths (`applyTransform` :773, `applyVisual` :785, `refreshVisibleEntity` :855 fallback stamped-to-stamped) never restamp; `exactVisible` tests `world.radii[slot]` including in the visCache key (presentationQueries.js:149,163-193).

6. **`packPresentationWorldToFenceSteps` mintedSlots + appendedSlots** — **VERIFIED** with one corner (F7). Mint freezes `activeSlots.slice(0,active)` (:460); appended sweep covers post-mint rows (`slice(active, getDiagnostics().active)` :469-474); retire swap-remove cannot drop a minted slot — iteration is by frozen slot identity, not position; `packRow` re-checks `alive` so retired-mid-park slots skip correctly.

7. **`compileSubjectColorAndDepth` / `touchExactTargetSubjects` async under admissionPaceYield** — **FAILED at call sites**:
   - (a) `touchExactTargetSubject` stays sync — ✓ (renderer.js:10713).
   - (b) async twins pace under `admissionPaceYield` — ✓ (:10710, :10724, :10730) — BUT `drawableSession` is dropped on the always-taken bloom branch → F2.
   - (c) every `touchMany` call site treats the async twin as synchronous → F1.
   - The file's own contract documents the requirement F1 violates: *"Reveal-ordered touch callers keep the sync form: their draw must be issued inside the same task as the reveal/restore dance."* (renderer.js:10692-10693)

## Ranked findings

### F1 — Async group touch draws after the reveal window closes (W100 regression) — impact H, effort S–M
`touchExactTargetSubjects` is `async` (renderer.js:10721): its first `await stampSubjectEnvAsync(subject)` suspends on `admissionPaceYield()` for at least a task. All four `touchMany` sites mint reveals and restore them in a **synchronous** `finally`:
- pool seal: renderer.js:13331-13338 (`revealSubjectForCompile` + `finally`)
- rock pools: :14962-14969 (same)
- late admit: :15982-15987 (`whileRevealedGroup`, sync LIFO restores :15944-15961)
- rescan: :16143-16148 (`whileRevealedGroup`)

…and `admitOpeningUnitsAcrossSlices` never awaits the result: `touched = touchMany(group)` at openingGpuAdmission.js:874 (same for `touchOne`, :890, though `touchOne` is harmless because its twin stayed sync).

Mechanism: `touchMany(group)` returns a pending Promise → the `finally` restores `visible`/`frustumCulled`/`count` → the deferred `renderer.render` inside `touchSubjectOnExactTarget` runs later on re-hidden subjects. For the hidden/parked warm cohort — exactly the units the reveal machinery exists to draw — `render()` skips invisible roots, so the batch touch **draws nothing**. Their link/buffer uploads then land in the first presented frame: the precise hitch the admission exists to absorb (the 15979-81 comment cites ~6 ms/touch × thousands on Crucible). Second-order damage: the deferred render still pays a full hide→render→restore pass on an (almost) empty scene per batch; async rejections float as unhandled rejections (the `try/catch` at :873 only sees sync throws); and `results` rows store the pending Promise as `touched`, so any downstream `.skipped`/`.drawn` read misclassifies.

Fix sketch: keep the reveal→draw window synchronous — hoist the env-stamp pre-pass out of `touchExactTargetSubjects` (e.g. a paced `stampSubjectsEnvAsync` pre-pass driven in `admitOpeningUnitsAcrossSlices` before each batch, like `reattachDetachedAdmissionTextures` at :850), so the remaining touch is a sync `withOnlySubjectsDrawable`+render and `touched` is again a real result. Alternative: make `whileRevealedGroup`/the manual `finally` sites `await run()` and `await touchMany(group)` in the admit loop — same semantic, more plumbing. Risk: low — no sim effect; ordering-only change. Watch: `compileSubjectColorAndDepth` being async is fine — `renderer.compile`/`compileAsync` is visibility-independent.

### F2 — `drawableSession` dropped on the always-taken bloom branch — impact M, effort S
`touchExactTargetSubjects` routes to `this.bloom.touchScenePipelines(list, cam.obj, scene)` (renderer.js:10725-10726) whenever bloom exists (it always does on WebGL). `touchScenePipelines` calls `touchSubjectOnExactTarget(renderer, rtScene, subject, camera, lightingScene)` with **no options** (bloom.js:2194-2196) → `options.drawableSession` is undefined → every batch falls back to the non-session path: a whole-scene `traverse` + fresh keep mint per ~24-subject batch (openingGpuAdmission.js:486-492). All four minted sessions (13334, 14965, 15984, 16145) are dead on the real path — W100's headline boot-load win never engages.

Fix sketch: add an `options`/`drawableSession` param to `touchScenePipelines` and forward it. Risk: low.

### F3 — Mass-cull `freezeHiddenSubtreeMatrices` mint inside the atomic visibility sweep — impact M, effort M
Each newly-hidden root mints an O(subtree) freeze (renderer.js:23060-23065 doomed leg, :23118-23124 hidden leg, :21014-21022 bind leg) inside `syncEntityViews`, which is a per-frame atomic pass by design. Worst case is a cull storm — the opening picture's `syncEntityViews(1)` (:23940) or a sector transition — where O(Σ culled subtrees) ≈ a whole-scene walk lands in one presented pass. It amortizes (frozen subtrees are skipped forever after), but the mint frame is the new worst single stretch on a dense scene.

Fix sketch: amortize the mint — e.g. cap frozen nodes per pass with a cursor, or freeze a root only on its second consecutive culled frame (freeze is benefit-only, so deferral is correctness-safe; an unfrozen culled subtree just keeps paying `updateMatrixWorld` skips it would have paid anyway). Risk: low-moderate — must not skip the unfreeze on re-entry.

### F4 — Sync `collectStartupTextures` inside the admit path — impact M, effort S
`reattachDetachedAdmissionTextures` (openingGpuAdmission.js:33-36) calls the **sync** `collectStartupTextures(ordered)` at :759 and :850 — O(Σ cohort subtrees) atomic per admit call, inside the paced sliced loop. A Steps twin already exists and is used by the parallel `detachedSubjectUploadsPendingAsync` (renderer.js:10744) — just unused here.

Fix sketch: drive `collectStartupTexturesSteps` inside `reattachDetachedAdmissionTextures` under the `yieldToMain` it already receives. Risk: trivial.

### F5 — `drawableHideSession` mint is an atomic O(scene) traverse ×4 per cook — impact L–M, effort S
Each leg mints its own session (one whole-scene traverse each; ~10-13k nodes). Options: share one session across the four legs per cook (the session contract already tolerates stale/detached entries and scene churn between legs is bounded), or mint via a Steps twin under the leg's pace fn. Risk: low — sharing needs care that a mount mid-cook only widens under-hiding (safe per the session contract).

### F6 — Session keep-union amplifies later batch draws — impact L–M, effort M
`session.keep` accumulates across batches (openingGpuAdmission.js:466-477): every previously-touched *naturally visible* subject stays un-hidden and re-draws in each subsequent batch's render. For thousand-unit cohorts the tail batches re-draw ~the whole prior cohort — absorbed (non-presented) passes, so cost lands as longer cook rather than a presented hitch, but it grows quadratically-ish vs the intended one-draw-per-subject.

Fix sketch: scope `keep` to the current batch (keep the session's `drawables` enumeration memoized but re-mint keep per call), or accept and cap. Risk: low-moderate — re-hiding prior keep members must restore the under-hiding contract for ancestors shared across batches.

### F7 — Fence pack retire→realloc can double-pack a slot — impact L, effort S
`packPresentationWorldToFenceSteps` packs by frozen slot identity; a minted slot retired and re-allocated during the appended window appears in `mintedSlots` and `appendedSlots` → two rows for the same entityId (snapshotFence.js:460-474). `indexByEntityId` points at the last write; the orphaned row only inflates bytes/count. Bounded and rare (world churn during the ~frame-length park window). Fix: track visited slots (or check `packDirty`-style marker) in the appended sweep.

### F8 — `captureOpeningAdmissionIdentity` sync fallbacks — impact L, effort S
Atomic whole-scene traverse on a presented frame at renderer.js:25008 and :25077 — only when the Steps iterator wasn't armed or returned no result. Rare, diagnostics-only. Could always arm the iterator (already armed at :24644) and clamp the sync rerun to a bounded drain like :25000-25005.

## Residual-hunt verdicts (the four mandated items)

- **(a) Mid-collect staleness** — **CLEAN**. Every Steps generator keeps partial results in locals and publishes only via the `done` value; stale legs abandon iterators (sealCensus calls `iter.return()` at :13203); a parked-then-abandoned fence pack leaves an unsealed write buffer that the next `beginPack` resets via `beginFrame` (no corrupt publish — `latest` keeps pointing at the last good pack). The one residual corner is F7.
- **(b) `drawableHideSession` under a throwing batch** — **CLEAN**. Keep-union is a superset across retries: a retried batch's subjects are already `keep` members → stay un-hidden → still drawn; `saved` restore is per-call in `finally` (:493-497).
- **(c) Async twin call-site parity** — **FAILED** → F1 + F2. `touchOne`/singular twin stayed sync by design (documented :10692-10693); only the plural twin broke the contract.
- **(d) Remaining atomic boot stretches** (ranked by worst-case node count): F2's per-batch whole-scene traverse on the bloom route (~O(scene)×Nbatches) → F3's mass-cull freeze mint (~O(scene) worst case) → F5's session mints (O(scene)×4) → F4's cohort texture collect (O(cohort subtrees)) → F8's identity fallback (O(scene), rare). Excluded as already adjudicated: multi-MB `JSON.parse`/checksum/`structuredClone` on the no-worker save lane (BOOT-F7 deferral — worker lane is the intended path, yielded fallback documented at saveSystem.js:4091-4095); loading-artwork GL pause; compile-tail serialization.

## Not re-reported

Per the deferred list: BatchedMesh specimen gap, loading artwork GL pause, ambient compile-tail serialization, BOOT-F7 emit slicing/structured-clone copies, F4/F5/F9 tick-paced emit slicing, F6 combat:damage payload intern, saveAsync slot txn, optic spatial-hash query, T→F collides stale-presence caveat, and the preexisting test-failure list. All still hold — no new mechanism evidence found for any.
