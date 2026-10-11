# wave-140 render-verify

**Audited commit:** `db13694cf64015e6599a7f7dd50a95cd7834622d` — tip of `origin/devin/1791504143-perf-w120` (merge of heap-floor F2/N2 + wave139-N1/G2 + boot B1-B4 over wave-139's audited `63516aff`).
**Method:** read-only `git show <sha>:<path>` / `git grep` against the pushed tree; no checkout, no app run. All `file:line` refs are to the audited tree.
**Scope:** per-presented-frame render-path cost — vendor render internals, `spaceRenderGraph.js`, `bloom.js` post path, `renderer.js` frame entry, and the new N2/F2 secondary-renderer gates.

---

## Landed hardenings — all VERIFIED at `db13694cf`

| Mechanism | Verdict | Evidence |
|---|---|---|
| `capturedList` third arg on `render()` | MECHANISM_VERIFIED | vendor/three.module.js:17805 `this.render = function (scene, camera, capturedList)`; replay branch :17879 |
| `renderAndCaptureList` / `renderCapturedList` pair | MECHANISM_VERIFIED | vendor/three.module.js:18079/18096; flag armed :18082, disarmed in `finally` :18089 |
| capture gated `renderListStack.length === 1` (wave139-N1, C1 fix) | MECHANISM_VERIFIED | vendor/three.module.js:17924 `if (_sfCaptureRenderList === true && renderListStack.length === 1)` — a render nested inside pass 1 can no longer overwrite `_sfCapturedList`; its own capture attempt at stack depth ≥2 skips silently and its captured items never replay |
| AO-off branch calls plain `renderer.render()` | MECHANISM_VERIFIED | src/render/post/spaceRenderGraph.js:426-438 — `if (this.options.ao) { renderAndCaptureList … renderCapturedList … } else { renderWithoutAutoClear(renderer, () => renderer.render(scene, camera)) }`; both paths render into `this.sceneTarget` (setRenderTarget :415) — zero capture allocations when AO off |
| 13-float `updateMatrixWorld` signature memo | MECHANISM_VERIFIED | vendor/three.module.js:116-126 `sfTransformSignatureClean` (pos×3/quat×4/scale×3/pivot×3, pivot null→0), :128-138 `sfTransformSignatureStore` (13-element array), :142 gate `matrixAutoUpdate && (matrixWorldNeedsUpdate \|\| !clean)` → compose+store |
| frame-tick gate `if (capturedList === undefined) this.info.render.frame++` | MECHANISM_VERIFIED | vendor/three.module.js:17941 — replay keeps pass-1's frame number, so the `WebGLObjects.update` frame-keyed WeakMap dedup (:4927-4933) hits on replay and geometry updates run once per presented frame, not twice |
| instanced `count<=0` drop in replay | MECHANISM_VERIFIED | vendor/three.module.js:17896 `if (object.isInstancedMesh === true && object.count <= 0) continue` inside the capture→replay splice |

Carried-over wave-139 verifications re-checked and still true: replay pushes items post-`finish`/post-`sort`/post-`background` (:17926-17931 slices inside the else-branch after sort at :17905+); `dst.push(item)` preserves renderItem identity incl. background unshift head; `renderTransmissionPass` early-outs under override; XR depth-mesh `projectObject` gated `capturedList === undefined` (:17865); replay skips `info.render.frame` mint, `background.addToRenderList`, `projectObject`, `finish`, `sort`.

## New since last audit

### heap-floor N2 (`0a4fe0b9b`) + F2 (`8bc62d76b`) — gate call sites: cheap/early-out VERIFIED, one arm-loss defect

Per-frame consult analysis for `detachedTextureUploadPending` / `detachedGeometryUploadPending` call sites:

- **src/ui/shipPreviewMount.js:1060-1081 (`renderNow`)** — the only consult inside a per-frame path. Steady state pays a single boolean read (`uploadAuditArmed`); the two scene traverses (`collectStartupTextures` :1061 + `collectStartupGeometries` :1063) run **once per arm**, then the gate either disarms (`pending.length === 0 && pendingGeometries.length === 0` :1065) or goes `uploadAuditInFlight` and re-draws via the continuation (:1077). While in-flight subsequent `renderNow`s early-return (:1061). PERFORMANCE_VERIFIED cheap in steady state.
- **src/ui/shipPreviewMount.js:885-890 (texture upload loop)** — admission path, one `filter` over the bounded `textures` set before `initTexture`. Not per-frame.
- **src/ui/asteroid/asteroidRenderer3d.js:1400-1406 (`queueWorksPipelines`)** — admission-serial async (`pipelineTail.then`), one `collectStartupTextures(subject)` per admitted subject. Not per-frame.
- **src/ui/orrery/pipSpannerPreview.js:177-183** — one-time init path after `compile`. Not per-frame.
- Consult cost itself: `detachedTextureUploadPending` (packageCpuDetach.js:447-455) early-outs on `!isPackageTextureDetached` (a `userData` mark + Map lookup, :242-248) then 4 cheap field checks + `properties.get` — O(1), zero alloc. `detachedGeometryUploadPending` (:401-409) is `geometryManifestEntry` + ≤attrs-per-geometry `detachedVersions` iteration — O(attrs), only on detached candidates.
- `renderer.js` F2 additions (`reattachDetachedSubjectGeometries` :12065-12093, call sites :12526, :12692, :13471, :16255) all sit in admission/rehearsal/cook-touch async paths — none inside `_renderPostRoute`. Confirmed no new per-presented-frame cost on the main loop.

**D1 — `uploadAuditArmed` re-arm clobbered by the in-flight `finally` (MECHANISM_VERIFIED mechanism; UNVERIFIED reachability):** shipPreviewMount.js:1075-1078 — `.finally(() => { uploadAuditInFlight = false; uploadAuditArmed = false; if (!disposed) renderNow(); })`. Content arriving mid-rehydrate (`scene.add(dockRoot)` :817 or `scene.add(mesh)` :1312 → `uploadAuditArmed = true`) is folded into the already-true flag, but its detached payloads were not in the `pending`/`pendingGeometries` arrays collected at arm time — the in-flight `finally` then disarms and the same-tick `renderNow()` draws the new subtree. If that subtree's detached textures/geometries live in a *different* package manifest than the in-flight rehydrate's, they re-enter three's uploader on emptied payloads — the exact N2 hole the gate exists to close (same-manifest payloads are covered because `rehydrateManifest` restores every detached entry in the manifest, packageCpuDetach.js:490-520). Narrow race (requires a content swap inside a `yieldToBrowser`-paced await), but the fix is small — e.g. re-arm instead of clearing when an arm was recorded during flight, or one re-scan consult after the continuation. Effort: S. Risk: low.

### boot B1-B4 (`38faa79ca`) — out of scope, verified no render-path impact

index.html head-only: `fetchpriority="low"` on ~1,927 modulepreloads, `fetchpriority="high"` on `bootEntry.js`, five station `as=style` preloads inside the title window, latin-ext font preload dropped. Load-path only; touches nothing on the presented-frame path.

### wave139-N1/G2 (`1564773c4`, `50818229c`, `5e9efb499`)

- AO-off capture skip + depth gate: verified above.
- `freedPayloads` Set→WeakSet (packageCpuDetach.js:513-514 re-mints on rehydrate — WeakSet has no `.clear`, correctly handled) — heap-floor scope, mechanism sound.
- G2 lazy slot fill + `loadAsync` generation recheck — popin/admission scope, not on the presented-frame path.

## Re-audit — remaining per-presented-frame waste

Route census at `db13694cf`: **GRAPH** (opt-in `settings.video.renderGraph`) = hoisted `scene.updateMatrixWorld` (sig-gated) + capture `render()` + replay `render()` + ~8 fullscreen-quad `render()` calls (3 AO + 4 bloom + 1 composite, +1 photo grade when enabled, +per-live-distortion-producer renders). **BLOOM** = 1 scene `render()` + ~4-6 quad `render()` calls (downsample levels + composite + CAS). **NATIVE** = 1 `render()`.

- **F-A — every fullscreen quad pass pays a whole `renderer.render()` prelude (MECHANISM_VERIFIED mechanism; UNVERIFIED magnitude):** `FullscreenQuad.render` (spaceRenderGraph.js:828-834) and bloom's `blit` (bloom.js:1745) both call `renderer.render(quadScene, quadCam)`. Each call re-pays the entire prelude: `renderStates.get`+`init` (WeakMap + state reset, vendor :17848), `renderLists.get`+`init` (:17860), `camera.updateMatrixWorld`, `_projScreenMatrix`/`_frustum` recompute, `clipping.init`, `info.reset`, `setupLights`/`setupLightsView` on empty arrays, `shadowMap.render` early-out, `background.render`, `bindingStates.resetDefaultState`, `info.render.frame++` mint — for a fixed 1-mesh scene. ~8-10 such calls/presented frame on the graph route, ~5-7 on the bloom route. A vendored minimal quad-draw helper (setProgram + attributes.bind + uniform upload + drawElements, bypassing the scene-graph prelude — the quads are static, unlit, `frustumCulled=false`) would collapse this to ~a µs of GL work per pass. **Quality-neutral** — same programs, same draws. Estimated ~0.1-0.3 ms CPU/frame (needs a profile to confirm; per-pass prelude is dozens of small fixed-cost calls). Effort: M (the renderState/bindingState hygiene must be replicated or proven skippable). Impact: small-moderate, and *graph-route-only for most of it* (bloom route pays ~5). Risk: M — the passes currently ride upstream state bookkeeping; a bypass must not leave stale binding/program/renderList state the next main pass observes.
- **F-B — capture allocations on the AO-on graph path, ~6/frame (MECHANISM_VERIFIED, micro):** `_sfCapturedList` literal + 3 `.slice()` arrays (:17926-17931) + `capturedLists`/`replayLists` tuples (:17887-17888). AO-off now pays zero (the wave139 fix); AO-on is the graph-route default (`ao: options.ao !== false`, spaceRenderGraph.js:271). Persistent double-buffered arrays would make it alloc-free; the captured arrays are consumed before the next capture so aliasing is controllable. Effort S, impact micro.
- **F-C — pass-1 per-item draw prep for `count<=0` InstancedMesh (MECHANISM_VERIFIED, marginal):** no early-out in `projectObject`'s mesh branch (vendor :18146+); drained-bucket items still pay frustum test → `objects.update` → layers.test → `renderObject` → `setProgram` until `renderInstances` returns on `primcount === 0` (:2488). A `count <= 0 → return` in `projectObject` would mirror the replay filter at walk time. Pools self-hide drained buckets (`visible=false`), so this is transient drain-frames only. Effort S, impact marginal.
- **F-D — micro-tier residuals (MECHANISM_VERIFIED, sub-µs each):** `tryPresentedCall` template-key concat + `Date.now()` ≈7+/frame (renderer.js:2303-2306; `serviceFaultEpoch` already memoized, warnDedup.js:67-78); `publishSceneOwners` runs once per `render()` on the armed scene → 2×/frame on the graph route (capture + replay), each paying `ownerEligibility` parent-chain walks for unpublished owners (dynamicBufferRanges.js:344-392); `renderWithoutAutoClear` arrow closures ~8-9/frame (spaceRenderGraph.js:807-815); per-item `getProgram` allocates `parameters` + `getProgramCacheKey` string per draw call (vendor :18424-18428) — upstream-inherent, a memo fights parameter-object-dependence (skinned/instanced/morph flags); `releaseBloomSceneSamplers` 16-unit `activeTexture`/`unbindTexture` walk ×2/frame (bloom.js:1766-1775) — deliberate ANGLE TDR workaround, do not touch.
- Re-checked, still bounded: direct `updateWorldMatrix`/`updateMatrix` callers (141 sites; hot ones are per-row/per-socket, e.g. contactShadowReceivers.js:70/113, actionVfx.js:216/226); `_sampleDrawHistogram` armed only by `?drawhist` debug flag (renderer.js:28981); unready-drawable guard steady-state early-out confirmed (bloom.js:1243-1248 — `unreadyProgramsPending !== true && programs.length === count && tail` + scene-children length/tail unchanged → return, ~10 reads/frame); shadow map per-frame refresh still cadence-gated (`scheduleRealtimeShadowRefresh` sets `shadow.autoUpdate = false` + `needsUpdate` only when the cadence says refresh, shadowPresentCadence.js:16-26; dirty-tally gate renderer.js:28363-28378); `beginAuthoredInstanceMeshDisposeRegistrationProbe`/`postTelemetry` early-outs (partsLibrary.js:446-450, postTelemetry.js:28-45).

## Rejected levers (quality-degrading, already-free, or upstream-required)

- Skip `scene.updateMatrixWorld`/`shadowMap.render` on replay — already a no-op (`matrixWorldAutoUpdate=false`) / early-out (empty `shadowsArray`).
- Re-sort or re-dedup replayed arrays — capture is post-sort by construction.
- Skip the quad-pass prelude via caching the renderState/renderList — that IS F-A, but the stateful bookkeeping is what keeps the next pass's WeakMap invariants; only a clean minimal-draw bypass is safe.
- Remove the bloom sampler-release unit walk — documented Intel/ANGLE TDR fix.
- Per-material `getProgram` memo — upstream parameters object carries per-object flags; a cache key would re-derive most of its cost.
- Fold `count<=0` filtering earlier than `projectObject` — pools already self-hide; the residual is transient and the walk-time early-out is F-C (kept as a candidate, not rejected).

## Verdict

The wave-139 capture/replay suite, the AO-off skip, and the depth gate all hold at `db13694cf`. The N2/F2 pending-gates are correctly cheap in steady state (one boolean per `renderNow`; consults once per arm or on admission paths only) — but **D1** (the in-flight `finally` clobbering a mid-flight re-arm) is a real, if narrow, mechanism defect worth one small fix. On cost: everything remaining above the micro tier reduces to **F-A** — the repeated full `renderer.render()` prelude per fullscreen-quad pass — a quality-neutral but moderate-effort consolidation worth one exploration decision; F-B/F-C are micro-to-marginal. No other material, quality-preserving lever was found in the render-submission path.

`saturated: false`
