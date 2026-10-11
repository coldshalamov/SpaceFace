# wave-139 render-verify

**Audited commit:** `63516afffd9102613580a510531ac109960d4c9b` — `perf(wave138): captured render-list replay + transform-signature memo + dead decode-class read` (tip of `origin/devin/1791504143-perf-w120`, 7 files, +219/-41).
**Local HEAD:** `47d01bbecb2b3ab28b6dd39ac0bb399b1f43359f` on `master` — the working tree does not contain F1/F3. Audited the dispatched commit read-only via `git show <sha>:<path>`; no checkout performed. All `file:line` refs are to the audited tree.

**Scope:** per-frame render submission path — `vendor/three.module.js` render internals, `src/render/post/spaceRenderGraph.js`, and everything that re-walks or re-sorts the scene per presented frame.

---

## F1 — captured render-list replay: VERIFIED

`renderer.render(scene, camera, capturedList)` gained a third arg (vendor/three.module.js:17805). `SpaceRenderGraph.render` captures pass 1 via `renderAndCaptureList` and replays pass 2 under `scene.overrideMaterial = normalMaterial` via `renderCapturedList` (src/render/post/spaceRenderGraph.js:425,432). The old `hideInactiveInstancedMeshes`/`restoreInactiveInstancedMeshes` traverseVisible + layers-mask mutation is deleted.

### (a) Replay skips ONLY the intended steps — VERIFIED

Replay branch (vendor/three.module.js:17874-17899) pushes captured items into the fresh render list and drops `object.isInstancedMesh === true && object.count <= 0` items. Skipped on replay:

- `projectObject` / `finish` / `sort` / `background.addToRenderList` (the entire else-branch, 17905-17931)
- `info.render.frame ++` (gated `capturedList === undefined`, 17938)
- XR depth-sensing `projectObject` (`capturedList === undefined && xr.enabled && isPresenting`, ~17864) — its items are already in the captured arrays

Every other prelude step still runs identically: camera/context checks, `_nodesHandler.renderStart`, `scene.updateMatrixWorld` (no-op — `scene.matrixWorldAutoUpdate = false`, src/render/renderer.js:10360), `camera.updateMatrixWorld`, XR camera swap, `scene.onBeforeRender`, `renderStates.get`+`init`, `_projScreenMatrix`/`_frustum` build, `clipping.init`, `renderLists.get`+`init`, `renderListStack`/`renderStateStack` push, `info.reset`, `setupLights`, `shadowMap.render`, transmission-pass gate, `background.render`, `renderScene`, `output.end`, `scene.onAfterRender`, `bindingStates.resetDefaultState`, stack pops, `_nodesHandler.renderEnd`.

**Necessary consequence, not a bug:** `pushLight`/`pushShadow`/`pushLightProbeGrid`/`objects.update` all live inside `projectObject` (18117-18155), so pass 2's renderState has empty `lightsArray`/`shadowsArray`. `shadowMap.render` early-outs on the empty array (free); `setupLights`/`setupLightsView` iterate zero items. Safe for the AO pass because every replayed item draws either `MeshNormalMaterial` (unlit, via override) or one of the two `allowOverride === false` background ShaderMaterials (1611/1689) — also unlit, so the empty light state is never observed. A future caller that replays a captured list for a *lit* pass would draw with zero lights — an API contract caveat.

### (b) Injected arrays are post-finish/post-sort/post-background — VERIFIED

Capture executes inside the else-branch after `finish()`, `sort()`, and `background.addToRenderList` (~17931-17936): `opaque/transmissive/transparent.slice()`. Background items enter via `renderList.unshift` (WebGLBackground.addToRenderList, 1672/1737) so they sit at the head of `opaque` — captured and replayed in identical order. `dst.push(item)` preserves renderItem identity: same pooled objects, same `id/object/geometry/material/materialVariant/groupOrder/renderOrder/z/group` — including the background boxMesh/planeMesh items. Material bucketing (`transmission > 0` → transmissive) was decided at pass-1 push time and is preserved by identity; under the no-mutation contract the buckets are still correct on replay. `slice()` copies the array before `init()` truncates — no aliasing hazard.

### (c) "No scene mutation between capture and replay" — VERIFIED

Between the two calls (spaceRenderGraph.js:425-436) the only mutations are: `scene.overrideMaterial = this.normalMaterial`, `setRenderTarget(normalTarget)` + `clear`, and `renderWithoutAutoClear`'s `renderer.autoClear` toggle (803-815). None touch visibility/layers/material/geometry. Draw path consumes the override per item: `if (material.allowOverride === true && overrideMaterial !== null) material = overrideMaterial` (18367-18378). The only `allowOverride === false` materials in the codebase are the background box/plane ShaderMaterials → identical normalTarget semantics to the pre-F1 second `render()` call. `scene.onBeforeRender` (dynamicBufferRanges `publishSceneOwners`) is bookkeeping-only — no visible/layers/matrix/material mutation — so it does not violate the contract and behaves identically on both passes.

### (d) `info.render.frame` not minted on replay — VERIFIED safe

Frame-keyed dedups: `WebGLObjects.updateMap` WeakMap (~4906-4969), `updateVideoTexture` (~13663), uniformsGroups UBO `updateList` (~15842). Pass 2 makes zero `objects.update` calls (that only runs inside `projectObject`, 18140/18155), so the non-mint is belt-and-suspenders — correct either way. External consumer: `src/ui/screens/mainMenu.js:837-838` reads `info.render.frame` as a monotonic "a frame presented" counter — still ticks once per presented frame, semantics preserved.

### (e) XR / transmission — VERIFIED unaffected

XR: depth-mesh projectObject is gated to the capture pass (its items replay); `xr.updateCamera`/`getCamera` swap runs identically on both passes. Transmission: `renderTransmissionPass` early-outs `if (overrideMaterial !== null)` (~18241-18247) — zero transmission cost on the AO pass. No nested-render capture exists today; see C1 for the residual edge.

### F1 caveats (mechanism-verified; not bugs in current usage)

- **C1 — global capture flag can be clobbered by a nested render** (MECHANISM_VERIFIED mechanism; UNVERIFIED reachability): `_sfCaptureRenderList`/`_sfCapturedList` are renderer-global, not renderListStack-depth-scoped (18071-18072). `renderAndCaptureList` disarms the flag in `finally` (18074-18087), so post-pass renders (AO quads, bloom, `_renderDistortion` producers at spaceRenderGraph.js:783, composite) never capture. The hole is a render() nested *inside* pass 1 — e.g. a first-time CubeUV env conversion during material prep — which would re-capture its own scene's list and overwrite `_sfCapturedList` → replay draws the inner scene's items into normalTarget → one-frame wrong AO. SpaceFace's `_bakeEnv` call sites (renderer.js:11236/13621/15586/17041) are all outside the pass window and envs are pre-baked, so reachability is unverified/low. Cheap hardening: capture only when `renderListStack.length` equals the outer depth, or save/restore `_sfCapturedList` around the call.
- **C2 — empty light/shadow state on replay** — covered under (a): safe only because every material drawn on pass 2 is unlit. Worth a comment or an assert, not a change.

---

## F3 — transform-signature memo: VERIFIED

`updateMatrixWorld` override (vendor/three.module.js:~143): `if (this.matrixAutoUpdate && (this.matrixWorldNeedsUpdate || !sfTransformSignatureClean(this))) { this.updateMatrix(); sfTransformSignatureStore(this); }`. Sig = 13 floats: pos xyz / quat xyzw / scale xyz / pivot xyz (0s when `pivot` null) cached on `object.userData.sfTransformSig` (~118-141).

### (a) No write path escapes the sig — VERIFIED

`updateMatrix()` (three.core.js:12821-12837) reads exactly position/quaternion/scale/pivot (pivot terms 12827-12833) — the sig covers all four inputs.

- position/rotation/quaternion/scale are `Object.defineProperties` **value** descriptors — the object refs can't be swapped (three.core.js:~11848-11890). `rotation` writes funnel through onChange → `quaternion.setFromEuler` → caught via quat terms. `pivot` is a plain property but re-read per check (`v ? v.x : 0` handles swap/removal); default `pivot = null` in this build (~12076).
- `applyMatrix4`/`matrix.decompose` write back into the sig'd fields → caught.
- Direct `matrix`/`matrixWorld` writes in `src/` exist **only** on `matrixAutoUpdate = false` objects (fleetLook.js:98, objectHoverFeedback.js:119-120, partsLibrary.js:5255/5472, staticChildMatrices.js:328-329) or decompose-back-into-fields paths — the `matrixAutoUpdate` short-circuit exempts them correctly.
- Manual `object.updateMatrix()` callers (borrowedVoiceVisuals.js:59, cameraOccluders.js:221/229, partsLibrary.js:5465, character models) recompose but don't store a sig → next walk pays one redundant compose — conservative, never stale.
- Wholesale `userData = {}` replacement (asteroidInstancePool.js:985) drops the sig → conservative dirty → recompose + re-store. Shallow `{...userData}` spreads (GLTFLoader.js:277, assetLoader.js:1835/1849) can share the sig array between userData objects — self-consistent: a node is "clean" iff its fields equal the shared array, which then equals compose(fields).
- Residual principle-level deltas vs upstream: (i) a direct `object.matrix`/`matrixWorld` write on a `matrixAutoUpdate=true` object would now persist instead of being stomped — no src caller does this; (ii) a mutate→revert between walks leaves a stale local matrix — no src write pattern does this. Both MECHANISM_VERIFIED absent.

### (b) `Object3D.copy` deep-copies `userData` — VERIFIED

`copy()` (three.core.js:~13275-13308) copies position/rotation.order/quaternion/scale/pivot/matrix/matrixWorld/matrixWorldNeedsUpdate **and** `this.userData = JSON.parse(JSON.stringify(source.userData))` → the clone's sig equals compose(its own copied fields) → correct clean verdict, no stale-sig inheritance. `toJSON` emits userData (~7838) so `sfTransformSig` lands in serialized objects (bloat only); `ObjectLoader` restores it alongside matching transform fields (~49331-49354) → consistent. Only shallow `userData` copy in the codebase is `BufferGeometry.copy` (~19550) — geometry has no sig.

### (c) `matrixWorldNeedsUpdate` + stomp semantics — VERIFIED preserved

`mWNU || !clean` still forces compose+store; explicit `mWNU` stomps minted by `updateMatrix()` still propagate. Force-descent unchanged: a clean node skips compose but still recomputes `matrixWorld` when `force` is set and mints `force=true` for children (PERF-138 test pins the moved-parent case). PERF-59 `sfMatrixFrozen` interplay unchanged: frozen check (~179-184) runs in the child loop independent of the sig gate; `matrixAutoUpdate=false` nodes never touch the sig. `updateWorldMatrix` (~12880-12915) deliberately unpatched — still composes unconditionally, i.e. conservative.

---

## Re-audit — remaining per-presented-frame waste in scope

Context: live scene `matrixWorldAutoUpdate=false` (renderer.js:10360); one `scene.updateMatrixWorld()` hoisted per frame in `_renderPostRoute` (~31956-32002) wrapped in the unready-drawable guard — the F3 memo applies to exactly that walk. Graph route: 1 `projectObject` (capture) + replay; bloom route: 1 walk (bloom.js:~2066, `createUnreadyDrawableGuard` early-outs steady-state at 1118+); native: 1 walk. Shadow map: per-light `autoUpdate=false` via `scheduleRealtimeShadowRefresh` (shadowPresentCadence.js:~21) + empty `shadowsArray` on replay. `_renderDistortion` producers render their own small dedicated scenes (spaceRenderGraph.js:781-785, gated `liveCount === 0`) — no main-scene re-walk. Remaining traverses in renderer.js are non-hot: `describeOpeningInstancedPbrLeaves` (873, opening diagnostic) and the receiver tally (31595, `forcedFrameSpend` budget + dirty-flag gated).

- **R1 — replay prelude recomputes camera/frustum/bookkeeping the contract makes redundant** (MECHANISM_VERIFIED, small): `camera.updateMatrixWorld` (parentless camera walks itself both passes), `_projScreenMatrix.multiplyMatrices` + `_frustum.setFromProjectionMatrix` (same camera → identical result), `clipping.init`, `renderStates`/`renderLists` `get`+`init`, `setupLights`/`setupLightsView` on empty arrays, `info.reset`, `background.render`/`getBackground` — each individually trivial, together the only remaining per-pass prelude work. Sub-µs payoff; not material unless the camera grows a real subtree.
- **R2 — per-frame micro-allocations in capture/replay** (MECHANISM_VERIFIED, micro): `_sfCapturedList` object + 3 `.slice()` arrays (~17931-17936) + `capturedLists`/`replayLists` tuple arrays (17886-17888) ≈ 6 short-lived allocations per presented frame; when `options.ao` is off the captured slices are allocated and discarded unused. Persistent double-buffered arrays would make it alloc-free.
- **R3 — visible `count<=0` InstancedMesh pays full per-item draw prep in pass 1** (MECHANISM_VERIFIED, marginal): pushed by projectObject → layers.test → modelView/normalMatrix → `material.onBeforeRender` → `setProgram` until `renderInstances` early-outs on `primcount === 0` (~2490). A `count <= 0 → return` guard in projectObject's mesh branch would drop them at walk time, mirroring the replay filter. Pools self-hide drained buckets via `visible=false` (asteroidInstancePool.js:731-732, 820-821, 865-866, 961-962) so the residual is transient drain-frames only.
- **R4 — per-item `object.layers.test(camera.layers)` in `renderObjects`** (MECHANISM_VERIFIED, micro): membership already proven at projectObject/unshift; ~1 bitmask op per item per pass. Upstream-required for late-masked/unshift'd items — not worth touching.
- **R5 — direct `updateWorldMatrix(true,false)`/`updateMatrix()` callers bypass the sig** (mechanism MECHANISM_VERIFIED; cost UNVERIFIED): `updateWorldMatrix` composes unconditionally (three.core.js:~12905-12915). Per-frame callers outside the render walk — contactShadowReceivers.js:70/113 (per receiver row), actionVfx.js:216/226 (socket reads), cameraOccluders.js:221/229 — pay full compose+multiply per call, same as pre-F3. Bounded lists, not scene-wide walks; the residual transform lane if a profiler flags it.

## Rejected levers (quality-degrading or already-free)

- Skip `scene.updateMatrixWorld` inside `render()` on replay — already a no-op (`matrixWorldAutoUpdate=false` on the live scene).
- Skip `shadowMap.render`/`renderTransmissionPass` on replay — already free (empty `shadowsArray`; override early-out).
- Re-sort or re-dedup captured items on replay — capture is already post-sort; re-sorting would re-add the cost F1 removed.
- Restore per-pass layers-mask hiding of `count<=0` instanced items — that was the deleted approach; the O(items) replay drop is strictly better and mutation-free.
- Strip the empty-light-state caveat by pushing lights on replay — would re-pay the projectObject light walk for zero visual delta on an unlit pass.
- Remove `renderObjects`' per-item layers.test — ~1 op per item; breaks late-masked item safety.

## Verdict

With F1+F3 landed, every whole-scene walk in the render submission path is paid once per presented frame: one `updateMatrixWorld` (hoisted, sig-gated), one `projectObject` (capture), zero on replay. What remains is mandatory draw-path work (the AO pass's purpose), sub-µs prelude recomputes (R1/R2), marginal per-item costs (R3/R4), and non-render-walk `updateWorldMatrix` calls outside scope-adjacent paths (R5). No unaddressed MATERIAL evidence-supported optimization remains in scope.

`saturated: true`
