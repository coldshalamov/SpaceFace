# NOCTURNE atmosphere: reproducible validation

The [atmosphere check](../../../scripts/nocturne-atmosphere-check.mjs) exercises the production
[atmospheric pass](../../../src/render/nocturne/atmosphere.js) and
[bloom compositor](../../../src/render/bloom.js) with real WebGL and the repository's vendored
Three.js. `--route=graph` exercises the optional render graph with AO enabled and its existing
multisampled scene depth attachment. It uses an isolated diagnostic scene, an oblique perspective camera and an ephemeral
canonical game server without a player-save store. This is a focused rendering check; gameplay
coverage and target-hardware performance require their own captures.

## Run it

From the repository root, with the repository's Playwright and `pngjs` dependencies available:

```sh
node scripts/nocturne-atmosphere-check.mjs
node scripts/nocturne-atmosphere-check.mjs --route=graph
```

The default output is `.devshots/nocturne-atmosphere/` for bloom and
`.devshots/nocturne-atmosphere-graph/` for the render graph. Playwright uses its normal installed browser
discovery. `PLAYWRIGHT_BROWSERS_PATH` selects an existing browser cache;
`SF_BROWSER_EXECUTABLE` or `CHROMIUM_EXECUTABLE_PATH` selects an explicit Chromium executable.
The script derives the repository root from its own location, so it does not depend on a fixed
checkout directory. It closes the browser and server on success or failure.

The retained capture was produced with this exact command in the review environment:

```sh
PLAYWRIGHT_BROWSERS_PATH=/tmp/spaceface-lighting-browsers \
SF_GL=swiftshader \
node scripts/nocturne-atmosphere-check.mjs \
  --out=docs/visual-assets/nocturne/atmosphere-evidence --samples=16

PLAYWRIGHT_BROWSERS_PATH=/tmp/spaceface-lighting-browsers \
SF_GL=swiftshader \
node scripts/nocturne-atmosphere-check.mjs --route=graph \
  --out=docs/visual-assets/nocturne/atmosphere-graph-evidence --samples=16
```

`SF_GL=swiftshader` explicitly requests software rendering. Leave it unset for a hardware run and
check the renderer identity in the JSON report. Other controls are `--width=1280`, `--height=720`,
`--samples=16` and `--headed`. Each run writes its own JSON report, Markdown report and six PNGs.
Use a distinct output directory for a different candidate, browser, hardware class or viewport.

For focused CPU and compositor regression checks:

```sh
node --test test/nocturne-atmosphere.test.mjs \
  test/nocturne-atmosphere-graph.test.mjs \
  test/bloom-distortion.test.mjs test/bloom-packed-hdr.test.mjs \
  test/bloom-contrast-lut.test.mjs test/bloom-pass-timing-scratch.test.mjs
```

## Retained evidence

See the [rendered report and matched images](atmosphere-evidence/atmosphere-report.md) and
[raw report](atmosphere-evidence/atmosphere-report.json). The raw report records the parent commit,
SHA-256 hashes of the working source and vendored renderer, camera transform, viewport, runtime,
capabilities, raw timing samples, pixel differences and browser errors.
Source hashes must remain unchanged from the beginning to the end of capture; a concurrent source
edit fails the check instead of producing an ambiguous receipt.

One cleanup-only follow-up occurred after both retained captures: `attachAtmosphere` gained a
`disposeGpu` option for lost-context detachment and now clears its atmospheric sampler references
immediately when the attachment changes. The [follow-up receipt](atmosphere-lifecycle-followup.json)
records captured and later bloom source hashes plus the passing ownership regression. No shader,
transport, target-size or steady render logic changed, but the retained PNGs and GPU timings are
from the preceding captured hashes; they are not relabeled as final-source measurements.

The render-graph counterpart has a [matched report and six images](atmosphere-graph-evidence/atmosphere-report.md)
and a [raw report](atmosphere-graph-evidence/atmosphere-report.json). It uses the same scene and
camera, enables the graph's AO pass, and keeps its four-sample scene target. That run also passed
with no browser errors and exact vacuum/off equality. The on/off/vacuum program count remained
9/9/9; activating atmosphere added one draw, from 18 to 19. The graph image retains the warm
shaft, blocker shadow and blue scattering; the integrated and restored-context images were also
opened and inspected. Software GPU medians were 185.796 ms off and 388.979 ms on, so this route
likewise has no hardware-budget acceptance.

| Capture identity | Recorded value |
| --- | --- |
| Three.js | Vendored revision 184 |
| Browser | Chromium 134.0.6998.35, headless |
| Graphics backend | ANGLE / Vulkan 1.3.0 / SwiftShader Device (Subzero) |
| Capabilities | WebGL2, `EXT_color_buffer_float`, `EXT_disjoint_timer_query_webgl2` |
| Render size | 1280 × 720, device pixel ratio 1 |
| Camera | Perspective, 48° FOV, position (0, 125, 160), looking at the origin |
| Presentation | Bloom off, exposure 1.5 |
| Medium | One bounded dust ellipsoid, density 0.012 |
| Direct lights | One warm spotlight and one blue point light |
| Source occlusion | One 512² native depth-comparison spotlight shadow map |

All six retained PNGs were opened and inspected. The dust image contains a warm shaft and blue
scattering around actual surface lighting. The tall blocker produces a dark interruption in the
warm illumination; the unshadowed comparison shows light returning into that region. The clear
vacuum image retains surface illumination without a visible beam. The quarter-resolution image
retains the same composition with visible sample noise nearest the concentrated emitter. The
post-restoration image reproduces the intended lighting after an actual WebGL context loss.

The automated image comparisons exclude the top 60 pixels containing the changing diagnostic
label. Below that region:

- Vacuum and atmosphere-disabled images match exactly: zero differing pixels.
- Enabling dust changes 343,974 pixels, with a mean RGB byte difference of 9.3702.
- Disabling the spotlight's shadow changes 169,480 pixels. This comparison changes the direct
  surface shadow as well as the atmospheric source occlusion; it does not isolate a volumetric-only
  shadow metric.
- On/off/vacuum modes retain six shader programs. The separate deliberate shadow toggle is outside
  that shader-count assertion.
- The browser reports no JavaScript or WebGL console errors. The pass remains active after actual
  context loss and restoration.

The native shadow format is a substantive integration check: the vendored revision uses a
comparison depth texture, while older or separately installed Three.js distributions can expose
packed RGBA shadow depth. The pass handles packed RGBA, raw depth and native comparison depth;
the retained browser run exercises the vendored comparison path.

## Performance interpretation

The fixture records 16 interleaved samples for each on/off condition after warm-up. The static
spotlight's shadow map is held during the timing interval. CPU time measures synchronous command
submission. GPU time comes from elapsed-time queries, with asynchronous availability checks and
disjoint-result rejection.

| Metric | Atmosphere off | Atmosphere on |
| --- | ---: | ---: |
| CPU submission median | 0.500 ms | 0.600 ms |
| CPU submission p95 | 0.700 ms | 0.800 ms |
| GPU query median | 88.835 ms | 293.841 ms |
| GPU query p95 | 112.804 ms | 325.369 ms |
| Draw calls per frame | 8 | 9 |

The approximately 205.006 ms difference is measured on a **software renderer**. It does not meet
the proposed hardware budget and does not predict integrated or discrete GPU performance. The
fixture establishes shader execution and bounded resource use; target-hardware GPU acceptance
remains unmeasured. The JSON report explicitly records `hardwareAcceptance: false`.

The balanced tier adds one 640 × 360 draw and two history render targets with two RGBA16F
attachments each: 7,372,800 bytes of color/depth-history storage, plus the compositor's full-size
scene depth attachment. The integrated tier uses 320 × 180 targets and 12 ray steps; balanced
uses 18 steps; high uses the same half-resolution size with 28 steps. The shader itself is shared
across tiers. Output with no eligible medium skips the atmospheric draw entirely.

For budget calibration, rerun on the target GPU and pair this diagnostic with representative game
scenes, ordinary player zoom, populated source pools, dynamic shadows and the actual quality
settings. The isolated fixture cannot establish combat, station or worst-density frame pacing.

## Runtime contract and remaining limits

The pass retains reused arrays of up to four authored ellipsoid media and real resident Three.js
light objects. Each medium has a stable `id`, render-space `center`, positive `radii`, `density`,
linear albedo `color`, `anisotropy`, and optional `extinction`, `noise` and `enabled` fields. Media
and lights remain owned by the caller; the pass does not mutate those objects or traverse the
world scene.

At most six lights enter scattering. A ready shadowed spotlight is pinned first; the other slots
select the strongest projected contributions with incumbent hysteresis, including strong events
late in the resident array. Selection uses preallocated scratch storage. `setMedia`, `setLights`,
`setEnabled`, `setQuality` and `invalidateHistory` are the content/runtime controls. Resource
preparation, resize, rebuild, diagnostics and disposal follow the compositor lifecycle.
`dispose({ disposeGpu: false })` clears CPU references during lost-context teardown without
dispatching GPU resource disposal events.
Bloom's matching `attachAtmosphere(null, { disposeGpu: false })` releases its CPU depth/sampler
references without disposing the scene target during that teardown.

Both post routes accept `attachAtmosphere(pass)` and retain the same runtime-owned pass. The graph
reuses its existing scene depth instead of adding a depth prepass. It applies atmospheric transport
after AO has modulated the surfaces and before tone mapping. Each active route reconciles the pass
size with its own scene target, which is a no-op in steady play. Switching depth source or target
size rejects temporal history. Detaching or disposing a compositor does not dispose the shared
atmosphere. Both routes expose its resources and shader for opening preparation and context-loss
cleanup.

This is single scattering with Beer–Lambert extinction, temporal reprojection, depth/sky rejection,
source-change rejection, camera-cut rejection and depth-aware reconstruction. Exactly one ready
spotlight supplies source-to-medium shadow occlusion; other source contributions are unshadowed.
Depth termination prevents scattering behind the visible surface from being overlaid on it, but
it does not give those other lights source occlusion. Atmospheric radiance enters the linear HDR
composite before tone mapping; it does not feed the separate bloom bright-extraction pyramid.
Dense media near concentrated sources can reveal low-sample noise, especially at the integrated
tier. Vacuum has no authored medium and remains optically clear.
