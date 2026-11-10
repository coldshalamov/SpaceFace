# W4 — POSTFX CHAIN CONSOLIDATION — REPORT

**Branch:** `devin/1790663494-w4-postfx` (off `origin/master` @ `f35d15203`)
**Verdict:** **KEEP**
**Golden 47a:** `cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885` — bit-identical, `deterministic: true`
(`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600`)

---

## 1. Audit — the pass chain as shipped

Three presentation routes exist; `renderer.js:_selectPostRoute` picks one per session.

### BLOOM route (default) — `src/render/bloom.js`

| # | Pass | Writes | Reads |
|---|------|--------|-------|
| 1 | scene raster | `rtScene` (W×H RGBA16F + depth) | world |
| 2 | bright+downsample quad | `down[0]` (½) | `rtScene` |
| 3 | downsample quad | `down[1]` (¼) | `down[0]` |
| 4 | **composite quad** | screen (or `rtPost`) | `rtScene`+`down[0]`+`down[1]`+`rtDistortion` |
| 5 | CAS quad (only when dyn-res buffer < display) | screen | `rtPost` |

Plus, when distortion producers report `hasLive`: producer scene renders into `rtDistortion` (½-res LDR).

The composite is **already a fused uber-pass** — one fullscreen quad performs ACES tonemap + exposure + teal/amber grade + toe + vignette + grain + in-shader unsharp (`uSharpen`) + distortion warp + multi-scale bloom gather (2 pyramid taps, weight `BLOOM_COARSE_WEIGHT`). There is **no** separate copy, gamma, color-grade, or FXAA pass anywhere in the codebase (grep-verified). Every pass in the presented-frame schedule produces output consumed in the same frame — the chain was already at minimum cardinality.

### GRAPH route (opt-in `video.renderGraph`) — `src/render/post/spaceRenderGraph.js`

| # | Pass | Writes |
|---|------|--------|
| 1 | scene raster | `sceneTarget` (HDR + depth, MSAA×4 on WebGL2) |
| 2 | normal pre-pass (`MeshNormalMaterial` override) | `normalTarget` |
| 3–5 | AO → bilateral H → bilateral V | `aoTarget`/`aoBlurTarget` |
| 6–9 | bloom downsample ×4 | `bloomTargets[0..3]` |
| 10 | distortion producers (conditional) | `distortionTarget` |
| 11 | **composite quad** | `outputTarget` |

Again one fused composite consumes 6 source textures; the only redundancy the audit found was **allocation state**, not passes — see §3.

### Dev-only reference path — `src/render/asteroidInteriorPreview.js`

`?dev=astlab` builds a stock `EffectComposer(RenderPass → UnrealBloomPass → OutputPass)` — 13+ fullscreen quads and ~13 RTs by construction (see §5 citations). Deliberately left alone: it is a debug bench, not a presentation path.

---

## 2. Measurement method

`.devshots/w4-postfx-census.mjs` (gitignored scratch): instantiates `createBloom()` / `SpaceRenderGraph` against vendored `three.module.js` with a mock `WebGLRenderer` that records every `render()` / `setRenderTarget()` / `clear()` call, then diffs `postTelemetry.renderTargetAllocationsTotal` and `diagnostics().renderTargetCount`. Deterministic, no GL context needed — "fullscreen draw calls" are exactly the `renderer.render()` calls issued to the chain's private quad scenes. Numbers match the live-flight census the sibling framegraph lane published on `origin/devin/1790650280-w4-integrate` (`aa6e6be97`), which measured `bloom: scene=1 quad=3 rt=5 clr=1` / `graph: scene=1 normal=1 quad=8 rt=11 clr=20→2` against a real GL context.

## 3. What changed

The only remaining legal consolidation was **conditional allocation of the bloom pyramid** — passes were already minimal, but the render *targets* stayed allocated even when the option was hard-disabled. The `options.ao` gate in `_allocate()` was the existing in-repo precedent; this patch extends the same treatment to both bloom pyramids.

**`src/render/bloom.js`**
- `createRenderTargets`/`setSize`: `newLevels = enabled === false ? 0 : levelCountForSize(W,H)` — pyramid levels are no longer created/resized while disabled.
- New `syncPyramidAllocation()`: disposes `down[]` on `enabled → false`, regrows it on `enabled → true`. Called from `setOptions()` and the `enabled` setter so both the settings-plumbing path (`video.bloom`) and direct API toggles are covered.
- Hoisted the two per-call `new THREE.Vector4()` in `blit()` (dyn-res sub-rect path) to closure scratch — removes 2 heap allocations per sub-rect blit.

**`src/render/post/spaceRenderGraph.js`**
- `_allocate()`: bloom pyramid creation now gated on `this.options.bloom !== false` (was unconditional — 4 HDR targets).
- `setOptions()`: disposes `bloomTargets` on `bloom → false` and rebuilds them (targeted, not a full `_allocate`) on `bloom → true`.

### Why this is provably zero-visible-change

- **BLOOM:** with `enabled === false`, `bloomActive` is false every frame; `renderCompositePass` then binds `rtScene.texture` into `tBloom0/tBloom1` and zeroes `uBloomW0/uBloomW1/uStrength` — the pyramid textures are never sampled (bloom.js:1853–1862). Freeing `down[]` changes no shader input.
- **GRAPH:** `_bloomActive()` is false when `options.bloom === false`; `_renderBloom` is skipped and `_renderComposite` binds `blackBloomTexture` to all four `tBloom*` samplers with `uBloomStrength = 0` (spaceRenderGraph.js:557–578). Same guarantee.
- Strength `0` keeps the pyramid on both routes: the strength slider is a live mid-flight control, and the per-frame cost of keeping it is memory only — no passes run while inactive.
- `distortionTarget` eager allocation is contract-pinned by `test/weapon-vfx-techniques.test.mjs:115` and `test/render-target-pipeline-warmup.test.mjs:422` — deliberately untouched.

## 4. A/B metrics

Mock-renderer census, 1280×720 buffer, full tables in `.devshots/w4-postfx-census-{BEFORE,AFTER}.txt`.

| Scenario | renders/frame | live RTs (before → after) | pyramid levels |
|---|---|---|---|
| bloom: default | 4 → 4 | 3 → 3 | 2 → 2 |
| bloom: `enabled=false` | 2 → 2 | **3 → 1** | 2 → 0 |
| bloom: strength 0 | 2 → 2 | 3 → 3 | 2 → 2 |
| bloom: dyn-res+CAS | 5 → 5 | 4 → 4 | 2 → 2 |
| bloom: distortion live | 5 → 5 | 4 → 4 | 2 → 2 |
| graph: default | 10 → 10 | 9 → 9 | 4 → 4 |
| graph: `bloom=false` | 6 → 6 | **9 → 5** | 4 → 0 |
| graph: `ao=false,bloom=false` | 2 → 2 | **6 → 2** | 4 → 0 |
| graph: toggled off via `setOptions` | 6 → 6 | **9 → 5** | 4 → 0 |
| graph: toggled off→on | 10 → 10 | 9 → 9 | 4 → 4 |
| graph: distortion live | 3 → 3 | **6 → 2** | 4 → 0 |

**Net:** −2 live targets on the bloom route when bloom is disabled (−67%: rtScene only remains); −4 on the graph route (−44% default config, −67% with AO also off). At 1280×720 the pyramids are RGBA16F: ≈2.3 MB freed on the bloom route (½+¼ res), ≈2.4 MB on the graph route (½+¼+⅛+1/16); ≈5.2–5.3 MB at 1920×1080. Per-frame pass counts, fullscreen draw calls, rtBinds and clears are **byte-identical** in every scenario — the win is dead GPU memory reclaimed, and −2 Vector4 allocs per dyn-res blit. `frameRtAllocs` stays 0 — no allocation inside `render()` (the "never inside render()" rule holds).

## 5. Fusion candidates evaluated and rejected

| Candidate | Verdict | Why |
|---|---|---|
| Copy/gamma/color-grade/FXAA merge | **already done** | One fused composite shader on both routes (ACES+exposure+grade+toe+vignette+grain+unsharp+distortion+bloom-gather). No separate stages exist to merge. |
| CAS into composite | reject | composite runs 5× the ALU of a CAS blit per pixel; at dyn-res CAS reads the *unsharpened* source, so fusing would either change output or force a second full-res composite shader — bandwidth loss, not gain. |
| Flatten pyramid into one RT (atlas) | reject | `renderDownsamplePass` feeds `down[i]` back as `down[i+1]`'s source — same-texture read/write is undefined; needs 2 RTs minimum per level direction anyway. |
| AO blur single-pass | reject | separable H/V bilateral is the quality-correct structure; a single fused gather with the same kernel is N² taps → output change or higher cost. |
| Lazy `distortionTarget` | reject | pinned by contract tests (eager alloc before producer attach). |
| MRT normals / depth-shared normal target | reject | MeshNormalMaterial override sees transparent draws differently than a depth-shared approach; MRT needs invasive shader edits — both change output. |
| Drop `renderer.clear` inside `FullscreenQuad.render` | reject **here** | sibling lane `aa6e6be97` (`w4-framegraph`, on `devin/1790650280-w4-integrate`) already lands the 18 dead-clear elimination for this file — not duplicated. |

## 6. Citations

- **EffectComposer ping-pong** — `vendor/addons/postprocessing/EffectComposer.js:41-59,125-145`: `writeBuffer`/`readBuffer` swap per `needsSwap`, last enabled pass gets `renderToScreen`, explicit `copyPass` when needed. SpaceFace instead writes composite straight to the canvas — one quad fewer than the composer's minimum `RenderPass→ShaderPass→(swap)` topology for a single effect.
- **Stock bloom reference** — `vendor/addons/postprocessing/UnrealBloomPass.js:88-138`: 5 mip levels × separable H/V blur (10 quads) + high-pass + composite + `blendMaterial` copy ≈ 13 fullscreen quads / 13 RTs — vs SpaceFace's 3 quads / 3 targets for equivalent multi-scale bloom. `Pass.js:17-24` (`needsSwap`/`clear`/`renderToScreen` flags) is the pass-contract the graph's `FullscreenQuad` mirrors.
- **Pass fusion literature** — the standard guidance (GPU Gems 3 ch. 28 "Practical Post-Process Depth of Field" gather-fusion discussion; Sousa & Gortz, "CryENGINE 3 Graphics Gems"; Unity URP's single `UberPost` uber-shader) is that postfx chains fuse *additive/gather* stages into one uber-shader exactly as COMPOSITE_FRAG already does, and collapse targets only when no pass consumes them. Both remaining legal moves were allocations, not passes — which is what this patch consolidates.
- **Sibling lane** — `aa6e6be97 perf(w4-framegraph): eliminate 18 dead clears/frame on render-graph route` (not on master; on `devin/1790650280-w4-integrate`) — complementary; this lane owns allocation-state consolidation, not clears.

## 7. Reproduce

```
node .devshots/w4-postfx-census.mjs          # prints the scenario census table
node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 \
  --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json \
  --hash --repeat 20 --reload-at 600         # sha256 must equal cc94…a4e885
```

Scoped unit tests (`node --test`): `bloom-distortion`, `bloom-pass-timing-scratch`, `bloom-unready-draw-guard`, `cas-sharpen`, `dynres-target-pool`, `performance-scene-metrics`, `post-processing-restraint`, `render-target-pipeline-warmup`, `sector-visual-profiles`, `vfx-well-distortion`, `weapon-vfx-techniques` — identical pass/fail set before and after the patch (4 failures pre-existing on master: missing npm deps `three.quarks` et al. in this dep-less Node environment; unaffected by the change).
