# Wave 139 — Blind Global Audit

Lane: `blind-global` | Audited SHA: `5e9efb499eb6e1405fd0c40b5d1453cf9c0b2fc4` (`perf(wave139): unconditional loadAsync gen recheck + boot-video fetch priority`) — pinned tip of `origin/devin/1791504143-perf-w120` via `git rev-parse FETCH_HEAD`; matches the expected tip exactly.

Method: read-only audit via `git show`/`git grep` at the pinned tree. No checkout, no edits, no PRs, no app launch. Findings cite (file, line, mechanism, presented-frame/accretion cost). Levels: MECHANISM_VERIFIED / PERFORMANCE_VERIFIED / UNVERIFIED.

---

## Prior-ledger closure verification

### B1 — whole-scene double traversal under GRAPH route: CLOSED, VERIFIED

The wave-138 captured render-list replay is live and removes the second traversal:

- `src/render/post/spaceRenderGraph.js` ~:424 `renderer.renderAndCaptureList(scene, camera)` runs pass 1 once and stashes the compiled render list; ~:433 `renderer.renderCapturedList(...)` replays it under `scene.overrideMaterial = this.normalMaterial`. `hideInactiveInstancedMeshes`/`restoreInactiveInstancedMeshes` (the deleted workaround) are gone from the tree (`git grep` returns no hits). The replay path filters `isInstancedMesh && count <= 0` items, matching the old mask's semantic.
- Reintroduced-cost check (the assigned question): `scene.onBeforeRender` fires on BOTH passes (the replay is a real `renderer.render` call), so `publishSceneOwners` (`src/render/dynamicBufferRanges.js`:510 → :392) runs twice per presented frame — but `publishOwner` early-outs on `owner.publishedEpoch === epoch` (:350), making the second pass an O(owners) early-out loop, not a re-pay. The epoch-gated publish is what makes the replay cheap. Residual pass-2 cost = prelude + empty-light/shadow-state loops + draw submission only.
- Render-verify's R1–R5 residuals (sub-µs prelude recompute, ~6 micro-allocs/frame) confirmed non-material.
- Carried caveat (from wave-139 render-verify, still standing): the capture flag is renderer-global, not renderListStack-depth-scoped — a nested `render()` inside pass 1's capture window would clobber the captured list and produce a one-frame-wrong AO. Reachability UNVERIFIED (all `_bakeEnv` sites are outside the window). One-line hardening suggestion stands; not a current defect.

Verdict: mechanism closed, cost not reintroduced elsewhere.

### B2 — owner-visibility memo: closed (carried). The fence-pack→sync→mesh pose topology is reclassified as finding W139-G1 below.

### B3/B4 — sim-on-presented-thread: PR #260 remains the right lever

Verified at `5e9efb499`: `registry.step` (`src/core/registry.js`:906) still runs `core.preStep → input.update → publishInputCommand → postInputPartitions systems → core.lifetimeSweep` inside the presented rAF (`presentationRunner.js` frame → `simulationRunner.advance` → `stepSimulation` → `registry.step`). `coreSystem.lifetimeSweep` itself walks `state.entityList` per tick collecting `DIRTY.MEMBERSHIP|DIRTY.POSE` ids (`coreSystem.js` ~:520-560, with `recordTransformIfChanged` published per dirty movable at ~:541/:547) — an O(entityList) sweep plus system updates, atomic on the presented thread.

PR #260 (`devin/s1-sim-worker-spike` @ `875e103fcc54`) is open, actively developed (last commit 2026-10-09), 45 commits ahead / **166 commits behind** origin/master (merge-base `38368f739`). Wave-138's scoreboard note that it "merged" is wrong — that merge was master INTO the spike branch; the spike is not landed.

Assessment of "does something else now beat it": no. The paced-emit/drain machinery bounds the blast radius of listener tails but cannot move the atomic unit — `registry.step` itself — off the presented thread. The determinism contract (golden hash `0b33dde1…`) blocks mid-tick system slicing; the only alternative (deferred F4/F5/F9 listener-classification surgery) is strictly harder and touches the same blast radius. B1's closure freed presented-frame CPU, which reduces the contention but leaves a multi-ms atomic sim frame able to blow the frame budget on its own. The 166-commit drift is a landing cost, not a reason to switch levers: it should be driven to merge, not replaced. UNVERIFIED → MECHANISM_VERIFIED (the cost is verified; the drift is the risk).

### B5 — shader-link/program consolidation (~36 links / ~26 programs): does NOT merit a lane

Adjudicated at wave-138 render-diet F5 and re-checked here: the ~26/frame floor is dominated by required-distinct programs (route permutation × lit material families × object axes + post set + depth variants). Merging them is quality-illegal. Residual splits into: (a) draw-time misses = residency-coverage misses (decode-later ships/stations) — owned by boot/popin lanes, not a consolidation problem; (b) one UNVERIFIED class — double-side transparent non-forceSinglePass duplicates — likely ≈0 today but enumerable only with an owner-side census.

Concrete cheap ask (unchanged from render-diet): commit the per-run DRAW-TIME-MISS owner dump as a scoreboard artifact so the 36-item list is enumerable without re-running probes. Tooling item, not a lane.

### B9 adjunct — heap mechanisms OUTSIDE geometry/texture

Audited the retained-heap classes the heap-floor lane's F2/F3/F4 detach spec does not cover. All bounded:

- `presentationJournal` pooled record ring: 16384 records × ~20 numeric metadata fields (Uint32/Float64 arrays sized to entityCapacity 65537) ≈ ~2.6MB — bounded, pooled, no per-frame alloc. (`src/core/presentationJournal.js`)
- `presentationWorld` dense slot arrays: ~15 typed arrays at entityCapacity ≈ ~2-3MB retained.
- `presentationQueries` mark arrays: 5 × Uint32(capacity) ≈ ~1.3MB.
- `simulationRunner` completed-tick ring + `inputCommandSnapshots` ring: bounded records, small.
- KTX2 decode: worker-pool (`configureCspSafeKtx2Loader`, `assetLoader.js` ~:368-470; min(8, cores−2) workers, `sharedDecodeTaskBudget` cross-decoder budget) — the large WASM heaps live in workers off the main heap; the loader retains `transcoderBinary` (~1-2MB).
- `MeshoptDecoder` main-thread instance (`gltf.setMeshoptDecoder`): WASM heap only grows on a sync-decode fallback; the `startMeshoptWorkerPool` path (`renderPackageLoader.js`:1167+, ≤4 workers) makes main-thread decodes rare. Conditional, bounded by decode size.
- `canvasTextures` pooled Float32Array scratch ~29MB: KEPT tradeoff — experiment 6 (pooling cut real allocation 74MB→29MB); freeing it re-churns. Texture-adjacent anyway.
- Secondary `WebGLRenderer` sites (4: `graphicsLab.js`:465, `asteroidRenderer3d.js`:1358, `pipSpannerPreview.js`:106, `shipPreviewMount.js`:492+main renderer at `renderer.js`:10261): each holds a full renderer + GL context state while its screen is mounted — bounded count, plus heap-floor's already-claimed N2 upload-gate hole.
- Audio decoded buffers: `decodeAudioData` runs off the main thread (`audioSystem.js`:3265); voice/bank-retained buffers bounded by the SFX set. UNVERIFIED magnitude, bounded class.
- `manifests.freedPayloads` strong-Set phantom-detach defect (N1) and authoredReadableFallbackLayer payloads (N3): already claimed by the heap-floor lane.

Verdict: no unowned heap mechanism of material scale outside the geometry/texture class. The remaining mass is F2/F3/F4 package detach (~334MB package geo + ~101MB embedded images) plus N1 phantom-detach — heap-floor owned — plus ~333MB live world data (sim-authoritative; the "off-stage stays lightweight sim" mandate already bounds it).

### G2 (wave-138 global finding) — `peekSaveCardData` multi-MB clone per lazy row fill: PERSISTS, narrowed

`saveSystem.js`:5171 still posts `{raw}` — the full multi-MB envelope — into the save worker per `_slotDataMemo`-miss lazy fill. The `cardEnvs[slot]` projection exists (`:2543`, `:2574`, populated by already-landed validation verdicts) but `fillSlotDataLazy` (`saveLoad.js` ~:851-868) does not consult it before dispatching the peek. Bounded by the `_slotDataMemo` LRU + consult-time cardEnv short-circuit; fires only for uncovered rows — scroll-through worst case = one structured clone per row, with the JSON.parse correctly off-thread. M-impact on the save/load screen only; not on the presented flight path. Fix sketch unchanged: consult `cardEnvs[slot]` inside `fillSlotDataLazy` before posting `raw`. MECHANISM_VERIFIED.

---

## New findings (between lane scopes)

### W139-G1 — pose pipeline is a 4-hop mirror chain; one hop is eliminable — MECHANISM_VERIFIED, M-effort, M/H-impact

Per presented frame, a moving entity's pose crosses four hops:

1. sim dirty-write: `coreSystem.lifetimeSweep` publishes `recordTransformIfChanged` per dirty movable (`coreSystem.js` ~:541/:547),
2. journal apply: `presentationPublisher.consume` `visitRange` → presentationWorld dense slot arrays (`presentationPublisher.js`:322+),
3. fence pack: `packPresentationWorldToFence(Steps)` copies world→fence O(active) with dirty-column elision (`renderer.js`:27430-27438, :28075-28153),
4. mesh apply: `applySnapshotPoseToMesh` reads fence → `mesh.position/rotation` O(visible) inside `syncEntityViewsSteps` (`renderer.js`:26331, `snapshotFence.js`:267).

Each hop is a separate O(N) pass where N = journaled / active / visible entities. B2's landed work (dirty-column elision) made hop 3 cheap for clean columns but left the chain topology intact. A journal→fence direct pack (skip world-slot materialization for the fence leg) or a fence→mesh direct bind keyed on the same slot index removes one whole O(N) pass per presented frame.

Why the named lanes can't see it: popin owns admission, render-diet owns the render submission path post-fence, heap-floor owns retained bytes — the pose-copy chain is the transport *between* their scopes.

Caveat: the fence exists to decouple sim-tick rate from present rate and carries the prev/cur lerp pair — any consolidation must preserve interpolation semantics. Magnitude is owner-hardware-dependent (per-entity µs-class writes; ms-class at hundreds of visible entities). Fix sketch: consolidate hop 3 into hop 4 first (fence→mesh direct apply keyed on slot index) — the fence is already a packed view of world, so applying it to the mesh without re-walking slots is the smallest semantic change. Effort M, impact M–H, risk M.

### W139-G2 — `drainAfterPresentCompile` steady-state path is clean — CLOSED-class (no finding)

Checked the one unconditional per-present-frame hook that could hide a steady-state cost (`renderer.js`:12766): `flushOneAfterPresent` early-outs on queue-empty; `pickNextContactCompileSubject` (`nextContactWarm.js`:4) early-outs on `pendingSubjects.size === 0` and only walks `entityIndex.shipLike` when pending candidates exist — gated, not per-frame O(meshes). No defect.

---

## Cleared per-frame machinery (verified, don't re-report)

Every unconditional leg in `presentationRunner.frame()` → `presentLastCompletedSnapshot` → `runRenderUpdatePhase` → `prepareFrame`/`drawPreparedFrame` → `_renderPostRoute` is already paced (4ms `PACED_FRAME_BUDGET_MS` + `forcedFrameSpend`), tick-latched, or early-out cheap: `getActivityFrame` tick-latch (`worldActivityManager.js`:21 — reads `runtime.frame` memo, no rescan); `captureWitness` 1Hz-gated; `checkGraphicsRecovery` 2-field early-out; `beginAuthoredInstanceMeshDisposeRegistrationProbe` 2-map-lookup early-out after first registration (`partsLibrary.js`:446); `presentationPublisher.consume` idempotent frames (`frameEnd <= lastAppliedSequence` → return); `drainEmitSlice`/`drainPresentationTail` bounded+empty-cheap; `_openingAdmissionPendingCount` WeakSet — deliberately leak-free. The one hoisted `scene.updateMatrixWorld()` at `renderer.js`:31968 is the single canonical walk per presented frame (was the B1 target).

---

## Regression notes

- Wave-138 global's claim that PR #260 merged: false — open, 45 ahead/166 behind.
- No new regressions found at `5e9efb499`; wave-139 reports (boot-verify, popin-verify, render-verify) all verified their mechanisms at the parent commit `63516afff` and this SHA differs only by the boot/save commit, which touches none of the audited paths.
- C1 caveat on the replay's global capture flag (render-verify) remains the one latent edge: a nested `render()` inside pass 1's window would clobber the captured list. Reachability unverified; cheap to harden.

## Rejected levers (quality/perf-illegal)

- Re-running lights/shadows on the replay pass (re-pays a projectObject-class light walk for zero visual delta — the replay draws only unlit-normal material).
- Re-sorting the captured list (re-adds exactly the F1 cost that was removed).
- Freeing `canvasTextures` pooled scratch (re-churns 74→29MB pooled allocation — experiment 6 KEPT).
- Merging required-distinct shader programs (quality-illegal).
- Mid-tick sim slicing (determinism-illegal without listener-classification surgery — strictly harder than landing #260).
- Freeing journal/presentationWorld ring arrays (bounded small; re-mint cost worse than retention).

---

## Verdict

**saturated: false**

Two items remain unaddressed outside named-lane scope:

1. **W139-G1** (pose-pipeline 4-hop consolidation): the one architectural lever the incremental lanes can't see. Mechanism verified; impact M–H on the presented thread; not owned by any named lane.
2. **W139-G2/G2-residual** (`fillSlotDataLazy` not consulting `cardEnvs[slot]` before posting `raw`): verified mechanism, M-impact, bounded to the save/load screen. Small fix; belongs to whichever lane next touches saveSystem.

Everything else audited is either closed (B1), correctly owned (B3/B4 by PR #260 — the lever is right, drive it to merge; B9 geo/texture classes by heap-floor F2/F3/F4 + N1/N3), adjudicated sub-material (B5), or verified bounded (the new-class sweep).
