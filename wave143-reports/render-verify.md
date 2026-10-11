# wave143 render-verify report

- Lane: render (presented-frame pipeline) — read-only audit, no code/PR/app-run.
- Audited tip: `devin/1791504143-perf-w120` @ `e1e9cc24c` (branch advanced 3 commits past brief pin `3148c56cd`; pin is an ancestor. `vendor/three.module.js` and `src/render/post/spaceRenderGraph.js` are byte-identical pin↔tip — the delta is localization/modelTruth/ruckus warm-decode slicing + a snapshotFence commit fix, all outside the presented-frame prelude; noted for completeness).
- Scope commit verified: `3148c56cd` "perf(wave142): replay updateMatrixWorld skip + predicate normalization".

saturated: true

## VERIFY block — W142 F-A + F-B

### V-FA — `scene.updateMatrixWorld` replay skip: MECHANISM_VERIFIED

- Guard landed at :17836 — `if ( !capturedList && scene.matrixWorldAutoUpdate === true ) scene.updateMatrixWorld()` — falsy predicate (F-B-consistent) wrapped around the preserved upstream `matrixWorldAutoUpdate` predicate.
- Camera kept unconditional at :17840 — `camera.updateMatrixWorld()` resolves through `Camera.updateMatrixWorld` (three.core.js :45695–45709): `super.updateMatrixWorld(force)` lands on the patched `Object3D.prototype.updateMatrixWorld` (three.module.js :140 — the frozen-prune + signature-memo version, since the patch assigns the shared prototype), then ALWAYS rebuilds `matrixWorldInverse` (decompose/invert, excluding scale for glTF conformance). Replay-side `camera.matrixWorldInverse` is therefore always fresh — verified; the stale-vs-fresh asymmetry between camera and scene is intentional and documented at :17831–17835.
- Contract documented twice: the new W142 comment at :17831–17835 and the replay-branch contract at :17896–17898 ("no scene mutation between capture and replay — only the override material changes"), mirrored at the call site (spaceRenderGraph.js :424–431).

Matrix-reader audit — every replay-side consumer of state only `updateMatrixWorld` refreshes:

| Reader | Line | Status on replay |
|---|---|---|
| `_frustum.intersectsObject` bounding-sphere cull | :18383 | inside `projectObject` — skipped |
| `object.computeBoundingSphere` / `geometry.boundingSphere` | :18392–18403 | inside `projectObject` — skipped |
| `_vector4` sprite / sort-z matrixWorld applies | :18359, :18403 | inside `projectObject` — skipped |
| `skeleton.update()` (boneMatrices from bone.matrixWorld) | :4951–4955 | frame-deduped: `updateMap.get(skeleton) !== info.render.frame` — replay mints no frame (:17962 skipped), so it never re-runs on pass 2; bone matrixWorlds are contract-frozen regardless |
| `SkinnedMesh.updateMatrixWorld` → `bindMatrixInverse` | three.core.js :23757–23767 | runs inside the scene walk — skipped; bind uniforms hold pass-1 values under contract |
| `object.modelViewMatrix` (matrixWorldInverse × matrixWorld) | :18628 | reads pass-1 `object.matrixWorld` BY DESIGN — identical under contract; camera side fresh |
| `object.normalMatrix` | :18630 | derived from modelViewMatrix — same class |
| `modelMatrix` uniform | :19315 | reads pass-1 matrixWorld — same class |
| `frontFaceCW` determinant | :17385 | same class |
| `objectPosition` | :18865 | same class |
| light/shadow matrices (`lights.state`, shadowMap) | — | lightsArray/shadowsArray stay empty on replay (init-cleared, `pushShadow`/`pushLight` only inside `projectObject`, `setupLights` skipped) — no reads |
| `boxMesh.onBeforeRender` (background skybox) | :1620 | copies `camera.matrixWorld` — unconditionally refreshed — not a scene-matrix reader |
| `objects.update` morph/instance attributes | :4907–4955 | attributes, not matrices; frame-deduped as above |

→ Replay draws with stale `matrixWorld` ONLY under contract violation — exactly the stated contract. No reachable stale-read exists outside it. Skinned + bounding-sphere paths specifically verified: both readers are either skipped outright or frame-deduped into not running on pass 2.

### V-FB — predicate normalization: VERIFIED_TOTAL

- Full-file grep: every `capturedList` predicate is falsy `!capturedList` (:17836, :17862, :17877, :17962, :17990) or the truthy replay branch `if ( capturedList )` (:17891). **Zero `capturedList === undefined` remains.**
- The partition is now total: falsy → complete normal path (updateMatrixWorld, frustum/projScreen, projectObject, finish+sort, addToRenderList, frame++, setupLights); truthy → replay copy. `undefined`, `null`, `0`, `false`, `''` all walk the full prelude — the W142 half-guard hole (skip frustum, then projectObject on the stale pair) cannot open.
- Null-walk verified end to end: `renderAndCaptureList` returns `_sfCapturedList` = `null` whenever capture didn't run (pre-render reset :18302; flag cleared in `finally` :18308–18310; depth-gate miss :17936; thrown pass-1). `spaceRenderGraph` passes it straight to `renderCapturedList` (:432) → `render(scene, camera, null)` → every `!capturedList` guard fires → full render under the AO override — the normal target still gets produced. Graceful degradation, not a silent miss.
- The only strict `===` left in the region is `_sfCaptureRenderList === true && renderListStack.length === 1` (:17936) — the capture-depth gate, intentionally strict, inside the non-replay else.
- Test pin tracks the normalization: `test/scene-graph-freeze.test.mjs` now pins `if ( !capturedList ) this.info.render.frame ++` (updated in the same commit).

## ACCOUNT — replay-prelude residue vs theoretical floor

Floor for a replay call = O(N) list copy + O(N) draws + O(1) bookkeeping. Walked the whole `render()` body at `e1e9cc24c`:

| Step | Line | Replay cost |
|---|---|---|
| camera/context checks, `_nodesHandler.renderStart` | :17808–17820 | O(1) (nodes handler null) |
| `useOutput`/`output.begin` | :17824 | O(1) — short-circuits: `_currentRenderTarget` is normalTarget |
| `scene.updateMatrixWorld` | :17836 | **skipped (F-A)** |
| `camera.updateMatrixWorld` | :17840 | O(1), unconditional (verified above) |
| XR camera block | :17842–17846 | `xr.enabled` false → O(1) |
| `scene.onBeforeRender` | :17850 | O(1) hook, parity |
| `renderStates.get` + `init` | :17852–17853 | O(1) WeakMap + 3 length-writes |
| `textures.getTextureUnits` + state push | :17855–17856 | O(1) |
| `_projScreenMatrix`/`_frustum` | :17862–17866 | skipped (W141) |
| `clipping.init` | :17868–17869 | O(1) — reads planes.length + booleans, no iteration (:2686–2699) |
| `renderLists.get` + `init` + push | :17871–17875 | O(1) |
| XR depth-sensing `projectObject` | :17877 | skipped (falsy guard) |
| `_renderBackground` flag | :17884 | O(1) |
| **replay copy (3 arrays + instanced `count<=0` filter)** | :17891–17909 | **O(N) — floor** |
| `projectObject`/`finish`/`sort`/`addToRenderList` | :17911–17930 | skipped |
| capture block | :17936 | inside else — skipped |
| `info.render.frame++` | :17962 | skipped (W141) — load-bearing: powers `objects.update` dedup |
| `clipping.begin/endShadows` | :17964/:17968 | `_clippingEnabled` false → O(1) |
| `shadowMap.render` | :17966 | `lights.length===0` early-out (:9368) → O(1) |
| `info.reset` | :17972 | O(1), upstream parity |
| `setupLights` | :17990 | skipped (W141) |
| `camera.isArrayCamera` branch | :17992 | O(1) |
| `renderTransmissionPass` (if transmissive captured) | :18014 → :18476 | early-out `overrideMaterial !== null` → O(1) |
| `background.render` | :18017 | O(1) + ≤1 skybox draw — parity |
| **`renderScene` → draws** | :18019 → :18449 | **O(N) — floor** (setupLightsView iterates empty lightsArray → O(1); per-item `objects.update` WeakMap-get + `allowOverride` + modelView/normalMatrix = draw bookkeeping) |
| multisample/mipmap tails | :18023–18029 | normalTarget.samples===0, Linear minFilter → early-out O(1) |
| `output.end`, `onAfterRender`, `bindingStates.resetDefaultState`, material/camera clears, stack pops + textureUnits restore | :18031–18077 | O(1) |

**Residual O(>1) on a replay call: the copy and the draws — the floor itself.** Every other op is O(1) or skipped. The replay is AT the theoretical floor; the last O(scene)-shaped re-pay (updateMatrixWorld) is gone.

Optional micro beyond floor (documented per A/B-catalogue rule, **not material**): draw the captured shell directly — `renderScene` destructures `{opaque, transmissive, transparent}` at :18451, shape-compatible with the shell — and relocate the `count<=0` filter to capture-time (shell fill already iterates N — same cost). Saves the second O(N) restack (~N pointer writes/frame, ~5–20µs class). Not a 1-liner: the isArrayCamera/transmission reads at :17992–18016 take `currentRenderList` locals and would need the captured list plumbed through; `renderLists.get`+push must stay for stack-depth parity (the :17936 capture gate reads `renderListStack.length`).

## HUNT

- **BG-5 producer-scene full-prelude renders — still bounded-only-while-distortion, confirmed at tip.** `_renderDistortion` (spaceRenderGraph.js :765–795) counts `producer.hasLive && producer.scene`, returns at liveCount 0; `DistortionField.hasLive` is honest `live > 0` (distortionField.js :153). Same gate on the bloom compositor route (bloom.js :1616–1637). Producer set is `[distortion, wellDistortion]` (presenter.js :167) — ≤2 live full `renderer.render()` calls/frame while distortion lives; each producer scene is a single instanced mesh so its walk+project+lights are O(1)-shaped anyway (full prelude ≈ ~15 O(1) ops + one-mesh draw). Ledgered bound confirmed; nothing new to list.
- **New per-frame O(N)/allocs:** none found. The pass-1 capture copy into the persistent shell is the only wave-added O(N) (by design — it replaced a second O(scene) `projectObject` + traverseVisible on the old two-pass route). Only new allocations remain the two 3-element literals in the replay copy (:17899–17900) — carried nit; hoisting to module consts is optional.
- **`renderQuadPass`** (:18136–18280): O(1) bookkeeping + O(children=1–3) flat draw via `renderQuadObject`; contains **no `setupLights` call at all** — quad passes cannot bump the lights version (the W141 doctrine holds trivially here). `scene.updateMatrixWorld` (:18157) walks the 1-mesh quad scene — O(1).
- **Transform memo** (:117–187): `sfTransformSignatureClean` 13-float compare + `sfMatrixFrozen` prune + add/attach unfreeze — unchanged; its only presented-path consumer is the now-skipped-on-replay walk; pass-1 behavior identical to W142.
- **lights/shadow/background on replay:** lightsArray/shadowsArray stay empty (init-cleared, populated only inside `projectObject`) → `setupLightsView` O(1), `shadowMap.render` early-out, `background.render` parity O(1) — all verified.

## Contract-violation surface introduced by these guards

- None reachable. A truthy non-shell `capturedList` (malformed opaque/transmissive/transparent) would `TypeError` at :17999 mid-render leaving the render stacks non-empty — the carried F1 residual class (upstream lacks try/finally on `render()`); unreachable through the only caller, which passes shell or null.
- `_sfCapturedList` is initialized to `_sfCapturedShell` (:18298) — a `renderCapturedList` issued before any `renderAndCaptureList` would replay empty arrays (zero draws). Every caller pairs the calls in the same tick; non-reachable through `spaceRenderGraph`.

## STANDING LEDGER (carried)

- F1 pre-existing edge (thrown render leaves `renderListStack` non-empty → later captures silently dead) — unchanged by this wave.
- Debug assert residual — carried.
- PR #260 — carried.
