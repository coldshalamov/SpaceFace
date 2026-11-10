# Wave-4 Lane Report — Render Pass Scheduler / Frame-Graph

Lane question: *which passes actually run per frame, and is any pass's output provably
unused so the pass — or its setup — can be eliminated or reordered without changing the
picture?*

Branch: `devin/1790652741-w4-framegraph` off `origin/master` (9a30ffc00).

## Verdict

The presented-frame schedule is already minimal. On the shipped BLOOM route a steady
flight frame is exactly **1 scene pass + 3 fullscreen blits + 1 clear** with the shadow
map gated to zero draws (census: `scene=1 quad=3 shadow=4(d0) rt=5 clr=1`, 99.4% of
sampled frames). Every remaining pass's output is consumed by the composite the same
frame — no dead pass exists to cull.

The one real frame-graph-class defect found was on the **render-graph route**
(`settings.video.renderGraph`, Quality preset): `autoClear=true` made every
`renderer.render` clear its target, *and* `FullscreenQuad.render` cleared explicitly
again — **20 clears per presented frame**, 18 of them provably dead (explicit clear +
autoClear, then a fullscreen NoBlending quad that overwrites every texel). Patch removes
all 18; measured `clr 20 → 2` on the live route (the two kept clears are the scene and
normal targets — partial coverage, genuinely needed).

## Research citations

- **Frostbite FrameGraph** — Yuriy O'Donnell, GDC 2017
  (<https://www.gdcvault.com/play/1024612/FrameGraph->): passes declare reads/writes in a
  *setup* phase; the *compile* phase culls passes whose outputs are unreferenced and
  picks per-target load ops — a pass that writes every texel of a target needs no clear
  (the API-level analogue of `LOAD_OP_DONT_CARE`). The patch here is exactly that compile
  rule applied by hand: fullscreen NoBlending quad ⇒ clear is dead.
- **three.js render-pass model** (`vendor/three.module.js` ~17850-18243): one
  `renderer.render(scene, camera)` is the pass unit. Inside it: `projectObject` builds
  opaque/`transmissive`/`transparent` lists; `shadowMap.render` runs when any shadow
  light permits it; `material.transmission > 0` objects trigger
  `renderTransmissionPass` — a **second full opaque-scene raster** into a dedicated
  multisampled mipmapped RT — before the scene's own lists draw.
- **EffectComposer pass costs** (threejs.org `EffectComposer` / `RenderPass` /
  `ShaderPass` docs): an ordered `Pass` chain where each enabled pass = target bind +
  fullscreen draw + program/state switch; `pass.enabled` gates work per frame and the
  last enabled pass gets `renderToScreen`. The codebase's own routes implement the same
  contract: `bloomActive` gates the bloom chain, the distortion live-count gates the
  distortion pass, `shadow.needsUpdate` gates the shadow pass — the `Pass.enabled` idea
  already internalized, which is why little was left to take.

## Pass inventory + measured costs

Instrumented with `.devshots/w4-framegraph-census.mjs` (gitignored probe): wraps
`renderer.render`, `shadowMap.render`, `setRenderTarget`, `clear` on a live Playwright
flight (seed 47, SwiftShader — directional, not owner-GPU numbers).

**BLOOM route (shipped default, 830/835 frames identical):**
`scene=1 quad=3 shadow=4(d0) rt=5 clr=1`

| Pass | Runs when | Output consumed by | Verdict |
| --- | --- | --- | --- |
| shadow map | `needsUpdate` && dirty && receivers && cadence | scene materials' shadow samplers | gated to 0 draws in steady flight — **does not re-render when nothing moved** (shadowcast lane already landed the registry + refresh gate) |
| scene → rtScene | every frame | downsample + composite | required |
| bloom downsample ×2 | `bloomActive` (energy gate) | composite uniforms | correctly gated |
| distortion | live producers only (0 in seed-47 flight) | composite | correctly skipped |
| composite | every frame | screen | required |
| scissor clear | once | rtScene uncovered pixels | required |

**GRAPH route (Quality preset, `renderGraph:true`):**
steady `scene=1 normal=1 quad=8 shadow=10(d0) rt=11 clr=20` → **`clr=2` after patch**

| Pass | Runs when | Output consumed by | Verdict |
| --- | --- | --- | --- |
| scene → sceneTarget | every frame | AO (depth) + composite | required |
| normal pass (MeshNormalMaterial override) | `options.ao` (default on this route) | AO 12-tap | second full scene raster — **by design**; eliminating it means MRT normals (requires touching every material's shader) or depth-derived normals (different output) — both fail the zero-quality-change contract |
| AO + 2× bilateral blur | `options.ao` | composite | required |
| bloom chain ×4 | `bloomActive` | composite | correctly gated |
| distortion | live producers only | composite | correctly skipped |
| composite | every frame | screen/outputTarget | required |
| 20 clears/frame | — | nothing (18 dead) | **patched → 2** |

**Cross-route findings:**

- **Transmission pass (three internals):** fires iff `transmissiveObjects.length > 0`.
  Live `transmission > 0` materials exist in code (`buildOpticDiamondMaterial` 0.85,
  `buildOpticSpentMaterial` 0.26, ice-variant asteroids 0.78, parts-library variants
  0.6) — the canopy policy only neutralizes canopy-tagged/named ones — but the census
  found **zero live transmissive meshes** in seed-47 flight. It is a latent ~2× scene
  cost that only appears when those entities are in-frame. Elimination options all fail
  the contract: converting the materials to alpha-glass (canopy-style) changes their
  look; replacing the re-render with a blit of the scene color target is not bit-equal
  (transmission RT is 4×MSAA + mip chain; clear-color edge and resolve differ);
  `transmissionResolutionScale` reduction changes refraction sharpness. Documented, not
  patched.
- **Periodic multi-bind spikes** (~5% of frames, `rt=17..176`, extra `scene`/`other`
  renders): identified as `SF_StartupGeometryResidencyBatch` mini-scene renders —
  deferred one-time GPU-admission warmups trickling ~20 s+ into flight, by design
  (the admission system already amortizes them across presents). Not scheduling waste.
- **HUD:** no GL pass — DOM-side. **sweep/recook:** conditional one-offs only.
- **`releaseBloomSceneSamplers`** (16-unit unbind ×2/frame): documented Intel-TDR armor
  — kept.

## Patch

`src/render/post/spaceRenderGraph.js` — dead-clear elimination on the graph route:

```diff
+// Runs one render() with autoClear suppressed: callers clear their target explicitly
+// (or write every texel of it), so the renderer's own clear would only re-clear.
+function renderWithoutAutoClear(renderer, draw) { ... }
```

- `FullscreenQuad.render`: drop the explicit `clear(true,false,false)` and suppress
  `autoClear` around the quad's `renderer.render`.
- Scene and normal passes: suppress `autoClear` around `renderer.render(scene)` (the
  explicit `clear(true,true,true)` immediately before each already covers them).
- Ambient `autoClear` inside `render()` stays `true` — `vfx-well-distortion` tests pin
  that contract, and the distortion pass still manages its own clear explicitly.

Same-output invariant (proof, not measurement): every pass routed through
`FullscreenQuad.render` draws a `PlaneGeometry(2,2)` under
`OrthographicCamera(-1,1,1,-1,0,1)` — full-viewport coverage — through materials built
by `shaderMaterial()` (`NoBlending`, `depthTest:false`, `depthWrite:false`) with no
`discard` in `AO_FRAG`/`BILATERAL_FRAG`/`BLOOM_DOWN_FRAG`/`COMPOSITE_FRAG`. Every texel
of the bound target is unconditionally overwritten ⇒ no prior clear is observable.
Scene/normal renders keep their explicit clears because geometry coverage is partial.

## Verification

- **Golden 47a** (`run --seed 47 --ticks 720 --hash --repeat 20 --reload-at 600`):
  `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`. Identical by construction — GL-path-only edit.
- **Census A/B** (the direct evidence): graph route `clr 20 → 2`; every other bucket
  unchanged (`scene=1 normal=1 quad=8 shadow=10(d0) rt=11`).
- **Probe A/B** (`probe-frame-solid --headless`, baseline `2026-09-29T03-58-11` vs
  patched `2026-09-29T04-00-11` and `2026-09-29T04-16-25`, same seed/flight):
  blinks/rootSwaps/regressions 0 across all runs; missing/stuck 409/359 baseline vs
  286/177 and 290/180 patched; in-flight links 14/6 vs 16/7 vs 15/6 — all within the
  documented within-box noise class (admission/link counters migrate run to run; a
  clear-count reduction cannot produce shader links or missing draws; the same
  `uploadTexture` page error appears in every run including baseline).
- **Unit tests**: `vfx-well-distortion` + `render-target-pipeline-warmup` +
  `context-resource-lifecycle` + `post-processing-restraint` + `pq-165-00-presets` +
  `igpu60-preset` + `renderer-resource-disposal` + `bloom-distortion` — pass, except
  `renderer routes authored pipeline/GPU residency blocking slices` in
  `render-target-pipeline-warmup`, which fails identically on clean master
  (verified by stash — preexisting, unrelated).

## Residuals / next candidates

- **Transmission pass**: the only remaining "hidden" second scene raster. Legal kills
  need either (a) transmission-material conversion to the canopy policy — a real visual
  change, contract-illegal — or (b) scene-color blit into the transmission RT at equal
  MSAA/mips — needs a vendored-three patch plus a pixel-diff gate; flagged as follow-up
  alongside the PQ-111-style pixel harness.
- **Blit `Vector4` scratch**: `bloom.js blit()` allocates 2 Vector4 per sub-rect call
  (~4/frame) — GC-hygiene micro, left for a sweep pass rather than this lane.
- **Normal-pass render-list reuse** (graph route): re-walks the whole scene per frame
  for AO; a shared render-list across the two scene traversals lives inside three
  internals — not provable by inspection.
- **`hideInactiveInstancedMeshes` traverse** (graph route): full scene walk per frame
  to hide zero-count instanced meshes — CPU-side, small.
