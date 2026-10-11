# wave142 render-verify report

- Lane: render (presented-frame pipeline) — read-only audit, no code/PR/app-run.
- Audited tip: `devin/1791504143-perf-w120` @ `c01b8e2d5` (branch advanced one commit past the brief pin `7c123f256`; pin is an ancestor. The extra commit touches `asteroidRenderer3d`/`shipPreviewMount` — outside the presented-frame prelude; noted for completeness.)
- Scope commit verified: `7c123f256` "replay-prelude tightening" — the W141 residual item.

saturated: false

## VERIFY block (W141 residual — MECHANISM_VERIFIED)

### V1 — `_projScreenMatrix`/`_frustum` replay skip: MECHANISM_VERIFIED

The pair is a `WebGLRenderer` closure local (decl vendor/three.module.js:16536/16545). Sole write site is the guarded block at :17857–17863. Every read site audited:

- :18350 `_frustum.intersectsSprite` — inside `projectObject`.
- :18355 `_vector4...applyMatrix4(_projScreenMatrix)` — inside `projectObject` (sprite sort-z).
- :18378 `_frustum.intersectsObject` — inside `projectObject` (mesh/line/points cull).
- :18399 `_vector4...applyMatrix4(_projScreenMatrix)` — inside `projectObject` (bounding-sphere sort-z).

`projectObject` is reachable only via (a) the `else` branch at :17911 — unreachable when `capturedList` is truthy, and (b) the XR depth-sensing projection at :17872–17884 — already predicated `capturedList === undefined`. No other consumer exists on the replay path:

- `shadowMap.render` (:17960) reads its OWN `_frustum`/`_projScreenMatrix` (decl :9303/:9309, per-light writes :9612–9613, read :9824), never the renderer pair — and early-outs `lights.length === 0` (:9368); replay's `shadowsArray` is always empty (filled only by `currentRenderState.pushShadow` inside `projectObject` :18344).
- `WebGLBackground` (:1523–1800) reads neither.
- `clipping`, `renderQuadObject`, `renderObject`, `renderTransmissionPass` read neither.
- Fail-soft: even if `projectObject` somehow ran on replay, the stale pair holds pass-1's values for the same scene+camera — culling stays correct by accident.

### V2 — `setupLights` replay skip: MECHANISM_VERIFIED

- `WebGLRenderState.init` (:9177–9185) clears `lightsArray`/`shadowsArray`/`lightProbeGridArray` and rewrites `state.camera` only — it does NOT touch `lights` (the `WebGLLights` instance). `renderStates.get(scene, renderCallDepth)` (:9247–9272) keys per scene+depth, so capture pass and replay (both depth 0, same scene) share the same renderState → `lights.state` persists untouched between them. Documented contract confirmed: init leaves capture-pass `lights.state` intact.
- `setupLights()` → `lights.setup(lightsArray)` → `state.version = nextVersion++` (:9071) — an unconditional bump per call. Read sites: `lightsStateVersion` snapshot :18704, program early-out `currentProgram === program && lightsStateVersion === lightsStateVersion` :18737, store :18778, `needsLights` rewire gate :18932.
- Pre-guard behavior quantified: the old replay `setupLights` ran `lights.setup([])` — resetting `lights.state` light arrays to empty AND bumping version. Any lit material drawn on replay with `allowOverride === false` (the only materials that can draw non-override on the normal pass, :18598–18604) would have wired empty light state — a latent correctness bug the guard also removes — and every material's stored version went stale for the next same-scene draw.
- Staleness analysis (required): a *needed* rewire can only arise when lights actually change, which is always accompanied by a render that assembles a real `lightsArray` — every non-replay render calls `setupLights` unconditionally (:17985 guard fires only when `capturedList !== undefined`). The only window where `lights.state.version` is consumed without a fresh `setupLights` is a capturedList replay, where `lights.state` still holds the capture pass's same-frame values. → No stale-version path can skip a needed rewire. Lit materials' `lightsStateVersion` now matches across the replay boundary, so the :18737 early-out hits for every replay draw (previously missed).
- `setupLightsView` (:18448 renderScene / :18536 transmissionPass) still runs unconditionally on the replay's empty `lightsArray` — iterates zero lights, writes nothing, O(1). Safe.
- In-code contract note (:17980–17984): "a future lit override must reintroduce setupLights here" — conservative but correct doctrine (a lit override drawn today would actually still see valid pass-1 light state, since both version and arrays persist).

### V3 — other unconditional prelude work still re-paid on replay

| Item | Line | Replay cost | Verdict |
|---|---|---|---|
| `scene.updateMatrixWorld()` | :17832 | O(unfrozen-subtree) walk: `sfMatrixFrozen` prune (:181–182) + 13-float `sfTransformSignatureClean` compares (:117–129) per unfrozen node; `updateMatrix()`/compose elided on clean sigs | **Residual — see F-A** |
| `camera.updateMatrixWorld()` | :17836 | O(1) | same contract class; fold with F-A |
| `renderStates.get` + `init` | :17848–17850 | O(1) WeakMap + 3 array length-writes | needed (this is what preserves `lights.state`) |
| `textures.getTextureUnits` | :17852 | O(1) scalar | needed for stack-pop restore parity |
| `clipping.init` | :17867 | O(clippingPlanes=0) | trivial; feeds `_clippingEnabled` gating used later |
| `renderLists.get` + `init` + push | :17869–17872 | O(1) amortized | needed — replay fills `currentRenderList` |
| XR branches | :17826–17834, :17872 | `xr.enabled===false` short-circuits; depth-mesh projection already `capturedList === undefined` | verified |
| `scene.onBeforeRender` | :17844 | user hook, O(1) | parity required |
| replay list copy | :17886–17908 | O(N captured items), `isInstancedMesh && count<=0` drop | by design; only new alloc = two 3-element literals (:17894–17895), negligible (nit) |
| `info.render.frame++` | :17957 | skipped on replay → `objects.update` frame-keyed dedup (:4917) dedupes all geometry/instanced/skinned uploads | verified load-bearing |
| `clipping.beginShadows/endShadows` | :17959/:17963 | only if `_clippingEnabled` | O(1) |
| `shadowMap.render` | :17960 | `lights.length===0` early-out | O(1) verified |
| `info.reset` | :17965 | upstream per-render parity | O(1) |
| `background.render(scene)` | :18013/:18017 | `getBackground` + setClear/clear | O(1); required for target clear semantics — skybox draw items arrive via the captured list, parity with old pass-2 render |
| `background.addToRenderList` | :17924 | inside `else` — skipped on replay | verified covered |
| `renderTransmissionPass` | :18010/:18017 | early-outs `scene.overrideMaterial !== null` (:18472–18476) — dead work auto-avoided on the AO replay (override always set) | verified, no finding |
| `updateMultisampleRenderTarget` / `updateRenderTargetMipmap` | :18023–18029 | `normalTarget.samples===0` → early-out; texture minFilter Linear → `textureNeedsGenerateMipmaps` false | O(1) verified |
| `output.begin/end` | :17824/:18032 | short-circuited — `_currentRenderTarget !== null` on AO route | O(1) |
| stack pops + `bindingStates.resetDefaultState` + `_currentMaterialId`/`_currentCamera` clears | :18040–18075 | O(1) | parity required |

## SYSTEM COHERENCE (re-verified)

- `renderAndCaptureList` (:18295–18310): `_sfCapturedList=null` pre-render + `try/finally` flag reset — a thrown pass-1 leaves the flag clean; stale shells can't leak between unpaired calls.
- F1 guard `renderListStack.length === 1` (:17927): the outermost render always sees depth 1 at the capture point; nested renders (PMREM gen inside `environments.get`, distortion producers, shadow-depth private renders) run depth ≥2 and cannot clobber. Replay never captures — `_sfCaptureRenderList` is false during `renderCapturedList`.
- Persistent shell `_sfCapturedShell` (:18286–18290): arrays refilled per capture (~6 allocs/frame saved); consumed synchronously in `spaceRenderGraph.render` (:427–434) before any subsequent capture — contract holds.
- Replay vs walk parity: replay drops `isInstancedMesh && count<=0` (:17899–17902); `projectObject` drops the same class at walk time (:18374–18377). Children of drained instanced roots still project on the walk — replay can't reintroduce them (they never entered the captured list).
- `renderQuadPass` (:18136–18280): mutable bookkeeping kept verbatim — renderStates/renderLists get+push+pop, textureUnits save/restore, `clipping.init`, `info.render.frame++` mint (frame-keyed dedup parity), `info.reset`, `output.begin/end`, multisample/mipmap tails, `onBefore/AfterRender`, `bindingStates.resetDefaultState`, material-id/camera clears, and the renderScene depth/color-mask tail (:18213–18218). Draw path `renderQuadObject` (:18656) mirrors the projectObject→renderObjects gates: visible, drawable-type, instanced count, layers, `objects.update`, material.visible, array-material groups, `allowOverride` override resolution. Contract (flat drawable-only quad scenes) honored by `FullscreenQuad` (spaceRenderGraph.js:824–838: one PlaneGeometry mesh, `frustumCulled=false`, NoBlending/depthTest:false/depthWrite:false).
- Call-site routing: `renderQuadScene` helper (spaceRenderGraph.js:820–822, bloom.js:843–845) sends every fullscreen pass through `renderQuadPass` when vendored — AO×3, bloom×4, composite, photo-grade, bloom internals. Fallback to `render()` retained for mock renderers.
- Transform memo (:118–187): `sfTransformSignatureClean` 13-float check + `sfTransformSignatureStore`; `sfMatrixFrozen` prune under `!force`; `add`/`attach` unfreeze ancestors (:188–200). Replay walk output is bit-identical to pass 1 under the no-mutation contract — see F-A.

## Per-frame cost accounting — AO route vs single-pass

Pass 1 `renderAndCaptureList` (sceneTarget, MSAA×4 on webgl2): full render — `updateMatrixWorld` walk, projScreen/frustum, `projectObject` O(scene), sort, `addToRenderList`, capture copy O(N) into persistent shell (the only AO-route-specific add: ~2 array allocs + N pushes), `setupLights`, `renderScene` O(N draws), MSAA resolve.
Pass 2 `renderCapturedList` (normalTarget, samples 0): prelude minus projScreen/frustum, `projectObject`, `addToRenderList`, `frame++`, `setupLights` — keeps O(1) bookkeeping, O(N) list copy with instanced filter, O(N) draws (modelView+normalMatrix per item — required), `objects.update` deduped by un-bumped frame, stable lights version → per-item `setProgram` early-out hits, transmission/shadow/background dead paths early-out.
Fullscreen passes (AO×3, bloom×4, composite, grade 0–1): ~12 O(1) prelude ops + 1–2 `objects.update`→`renderBufferDirect` each via `renderQuadPass`.
Net: scene-graph traversal replaced by a memcpy + instanced filter; remaining per-pass re-pays are O(1) bookkeeping plus F-A below.

## FINDINGS

- F-A (residual, quality-preserving): `scene.updateMatrixWorld()` runs unconditionally on replay (:17832). Under the capture contract ("nothing mutates the scene between capture and replay", :17888–17892) the second walk is bit-identical dead work — same class of guard as W141's two. Guard `if (capturedList === undefined) scene.updateMatrixWorld()` (and symmetrically `camera.updateMatrixWorld` for tidiness, though it's O(1)). Savings = the `sfMatrixFrozen`-pruned walk + signature compares over every unfrozen node — small but real on entity-dense scenes; exactly the last O(scene)-shaped re-pay on the replay path. Effort: 1 line + contract comment. Risk: same caveat as the setupLights note — any future inter-pass mutator must re-enable it.
- F-B (contract hygiene, low): guards use strict `capturedList === undefined` while the replay branch uses truthy `if (capturedList)`. A `null`/`0` value would half-guard — skip frustum+setupLights, then run `projectObject` on the stale pair. Not reachable today (`renderAndCaptureList` can only return null after a thrown render, which already corrupts upstream's un-finally'd renderListStack), but normalize the predicate or assert non-null in `renderCapturedList` to keep the contract total.
- F-C (hunt): no new per-frame O(N) or material alloc found on the presented path. Only new allocations are the two 3-element literal arrays in the replay copy (:17894–17895) — negligible; hoisting to module consts is optional nit. Upstream `getParameters`/`getProgramCacheKey` per-item allocs unchanged by this wave.
- Contract violations introduced by the newest guards: none found.

## STANDING LEDGER (carried)

- F1 pre-existing edge: capture first-pass nested render overwrites — guarded by `renderListStack.length === 1` (:17927); verified above. Residual noted: a render() exception leaves the stack non-empty (upstream lacks try/finally), which would silently kill later captures rather than error — pre-existing upstream fragility, unchanged.
- Debug assert residual — carried.
- PR #260 — carried.
