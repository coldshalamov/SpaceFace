# render-verify — wave-141 adversarial re-audit

**Tip audited:** `39e905b2d8e53f15cdb65cd6cb8686e773b5dab0` (`devin/1791504143-perf-w120`)
**In scope:** F-A renderQuadPass (`d5efd9fbb`), F-B `_sfCapturedShell` + F-C instanced walk drop + D1 arm-seq (`b854032ba`), F2 stageHull 30Hz (`5dfe99249`), G1a packDirty clear-on-commit (`5cd02c8f3`), over wave-139 F1 replay + F3 transform memo.
**Method:** static trace on FETCH_HEAD (`git show`/`git grep`); no app launch, no edits.

## Q1 — renderQuadPass state hygiene: MECHANISM_VERIFIED

`renderQuadPass` (vendor/three.module.js:18120-18276) keeps every mutable the main render observes:

- **Stacks:** `renderStates.get`/`renderLists.get` + `init` + `renderStateStack`/`renderListStack` push verbatim (18154-18167); pops restore `currentRenderState`/`currentRenderList` (18260-18271). `currentRenderState.state.textureUnits` saved at entry, `textures.setTextureUnits` restored on nested pop — identical to `render()` (17848-18076).
- **Draw tail hygiene:** `bindingStates.resetDefaultState()`, `_currentMaterialId = -1`, `_currentCamera = null` (18251-18253) — byte-identical placement to `render()` (18042-18044). Depth/color-mask + `setPolygonOffset(false)` tail replicates `renderScene`'s (18216-18220 vs 18454-18458).
- **Skipped-and-proven-dead:** `_projScreenMatrix`/`_frustum` (closure scope, 16545) are only read inside `projectObject` (18344/18367/18388) and are recomputed at every `render()` top (17855-17856) before any read — stale-but-never-read after a quad pass. shadowMap uses its own file-scope copies (9303/9309/9612). `shadowMap.render` early-outs `lights.length === 0` (9370); the quad renderState's `lightsArray` is empty post-`init`. `setupLights`/`setupLightsView` write only `lights.state` consumed via `materialNeedsLights` — unlit quad materials never consult it; state is per-scene-per-depth (WeakMap, 9243-9306), so quad skips cannot contaminate the main scene's renderState.
- **autoClear:** preserved — the clear lives inside `background.render` (1578-1586), which renderQuadPass still calls under the same gate (18178).
- **`info.render.frame`:** minted once per call (18174) — the exact sequence the replaced `render()` calls produced; replay still skips its mint (17951). All three frame-keyed dedups (`WebGLObjects.update` 4910, `updateVideoTexture` 13664, UBO 15843) observe identical progression. `info.reset` under `autoReset` sits in the same slot (18176); `autoReset=false` consumers (diagnostics.js:69, drawhist renderer.js:11903) unaffected.
- **Output pipeline:** `output.begin` early-outs on `_isCompositing` (5128) — `output.end`→`renderQuadPass` (5220) cannot recurse; `_savedRenderTarget`/`_savedToneMapping` flow unchanged.
- **`_renderBackground`:** quad uses a local (18169) — strictly safer than a nested `render()`, which still clobbers the module flag (upstream behavior, pre-existing).
- **Capture interaction:** a quad pass nested inside a capture window pushes `renderListStack` to depth ≥2 and contains no capture branch — `_sfCapturedList`/`_sfCaptureRenderList` untouched. A nested `render()` inside a quad pass also lands at depth ≥2 → outer gate holds. Verified literally against 17925.
- **renderQuadObject** (18645-18682) replays `renderObjects`' per-item gates exactly: visible, Mesh/Line/Points/Sprite, instanced `count<=0`, `layers.test`, `objects.update`, group/multi-material + `material.visible`, `allowOverride` resolution → `renderObject` → `renderBufferDirect`. Program/uniform/binding path identical by construction.

Contract (documented at 18116-18118, honored at all four call sites): flat top-level drawables only — `FullscreenQuad.scene` (spaceRenderGraph.js:825-841), bloom `quadScene` (bloom.js:1648-1660, `frustumCulled=false` + frozen matrices), vendored output composite mesh (5220), bloom admission draw (2317). No recursion into Groups, no sort, no frustum test — all moot for 1-drawable scenes today.

## Q2 — F-B shell consumed-before-next-capture: MECHANISM_VERIFIED

- `_sfCapturedList` is written only inside the armed `render()` at `renderListStack.length === 1` (17925-17939); `_sfCaptureRenderList` is armed/disarmed only by `renderAndCaptureList` (18284-18297, `try/finally` — disarms even on throw).
- Sole call site: spaceRenderGraph.js:427 → consumed at :432 in the same JS turn. Between capture and consume there is only `overrideMaterial` assignment + `setRenderTarget`/`clear` — no reentry surface.
- Nested `render()` sources inside a captured pass (PMREMGenerator 3291/3358/3367/3492, CubeCamera 3237/3241) can only fire during the draw phase (getProgram→environments.get) — depth ≥2 → gate holds; they cannot clobber the shell. A nested `render()` inside the outer's `scene.onBeforeRender` would sit at depth 1 and *could* pass the gate, but its write is then overwritten by the outer's own fill — outer list wins; no path leaves a stale shell.
- Shell arrays are `length=0`-cleared then refilled per capture (17930-17938) — the arrays handed to the replay are consumed before the next `renderAndCaptureList` runs.
- Residual (pre-existing F1, not F-B): if `render()` early-returns (context lost / bad camera) or throws before the gate, `_sfCapturedList` stays `null` → `renderCapturedList(…, null)` renders normally but skips the frame mint. Reachable only on context loss where nothing draws.

## Q3 — F-C instanced `count<=0` walk drop: MECHANISM_VERIFIED

- Downstream of a pushed item: `renderObjects` → `renderObject` (`onBeforeRender`, `material.onBeforeRender`, `renderBufferDirect`) + `objects.update` at push. For a drained InstancedMesh the draw produces `primcount 0` — the skipped work was pure cost.
- Only instanced `onBeforeRender` hooks in src/: `gasVolumeField` (mesh is `visible = count > 0` at :177 — already invisible while drained, so unreachable either way) and `instancedSpritePool` volume buckets (:163 — writes `uWorldToClip`/`uObjectToWorld`, consumed only by that mesh's own draw; stale-but-unread at count 0, refires when count > 0).
- `objects.update` deferral is safe: geometry/instance uploads are version/frame-gated and run on the first walk where `count > 0`, before any draw of that mesh.
- Shadow pass does not read render items — it walks the `eachShadowCaster` registry (9815-9824); a drained caster still submits a count-0 instanced draw there, identical to before.
- Replay drop (17891) remains as belt-and-braces for count mutating between capture and replay; dynamic-buffer commits land via `scene.onBeforeRender` *before* `projectObject` in the same call — count is final at walk time.
- Edge (contractual, not a defect): count going 0→N between capture and replay means the item was never captured and won't draw in pass 2 — already excluded by the F1 "no scene mutation between capture and replay" contract.

## Secondary items

- **F2 stageHull 30Hz (5dfe99249): VERIFIED.** `pendingRad` accumulates `dt × DRIFT_RAD_PER_S`, flushed at ≥33.3 ms — identical total yaw rate; first tick renders immediately (`lastRender == null`); visibility guards, `release()`, reduced-motion path untouched.
- **G1a packDirty (5cd02c8f3): VERIFIED.** `dirty.fill(0,0,scan)` moved inside `if (!bail)` post-commit in both the atomic leg (snapshotFence.js:489-510) and the stepped generator (625-645); on bail every bit stays set so the classic walk re-packs — closes the cleared-but-unwritten slot hole.
- **D1 arm-seq (b854032ba): VERIFIED.** `uploadAuditSeq` increments at both arm sites (shipPreviewMount.js:827, :1334); the rehydrate `finally` sets `uploadAuditArmed = uploadAuditSeq !== armedSeq` — a mid-flight arm keeps the flag and the next `renderNow` re-scans.
- **F3 memo intact:** signature clean/store (vendor 118-138) + `updateMatrixWorld` override (140-186) + unfreeze on `add`/`attach`.

## Q4 — fresh-eyes renderNow/frame path post-F-A

- Per presented frame (graph route): 1 capture `render()` (the walk — required) + 1 replay `render()` + producer scenes (real scenes — legitimately full path) + ~9 quad passes now at reduced prelude. Bloom route: 1 scene `render()` + quad blits + producer scenes. Native: 1 `render()`.
- Remaining dead work in the replay pass (small, correct): `_projScreenMatrix`/`_frustum` recompute (no `projectObject` runs), and `setupLights()` on the freshly-init'd empty `lightsArray` flips the light hash → `state.version` bump → every lit material misses its `lightsStateVersion` early-out on the replay pass → `needsLights` recompute + light-uniform rewire per material. Sole override in use (`normalMaterial`) is unlit → no visual effect; it is residual cost only.
- Heap-defect lane context only (per prompt, PRE-state noted, not re-reported): `shipPreviewMount`'s `collectStartupTextures/Geometries` + `detachedTextureUploadPending` gate feeds the audit-arm block at 1064-1085 — the ledger-moving work is expected to touch this area.

## Residual candidates (non-blocking)

1. Replay pass could skip the frustum/projScreen recompute and the empty-lights `setupLights` version bump (a `capturedList`-aware branch) — small per-frame saving on the AO-on route.
2. `renderQuadPass` contract is silently lossy outside its contract (Group children, multi-drawable ordering, lit materials, sprites with culling) — acceptable while all call sites are generated 1-quad scenes; worth a debug assert rather than code.
3. `renderAndCaptureList` returning `null` on context-loss/throw silently degrades the replay to a full walk with no frame mint — pre-existing F1 edge.

**saturated: false** — the verified mechanisms are sound, but item 1 (replay-prelude tightening) is real remaining cost on the AO path.
