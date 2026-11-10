# Wave-4 Lane Report — Transparent-Pass Sort + Alpha-to-Coverage Audit

Lane question: *are there large alpha-blended surfaces sorted per frame that could use
alpha-to-coverage (MSAA), pre-sorted static ordering, or alphaTest/discard instead of
blending?*

Branch: `devin/1790668596-w4-transparents` off `origin/master` (d79929ac2).

## Verdict

**DOCUMENTED — no code change.** The transparent pass is measured cold on the live flight
route and is not hot: ~37 list items sorted per frame at a p50 wall cost of **~5 µs**
(~0.03 % of a 16.6 ms frame). No alpha-blended surface in the census is a binary-alpha
cutout (alphaTest/discard candidates: zero), and alpha-to-coverage is structurally
unavailable on the default present route — both draw targets it could write coverage into
are deliberately single-sampled. The lane's remaining levers are already landed in-repo:
static `renderOrder` laddering for the backdrop layers, `forceSinglePass` for
DoubleSide/additive transparents, canopy transmission→alpha-glass conversion, and
visibility gating that leaves ~⅓ of sampled frames with **zero** transparent draws.

## Measurement technique

Probe `scripts/probe-transparent-sort.mjs` (added on this branch — instrumentation only,
mutates nothing in the game's runtime config):

- Playwright Chromium, headless, 1280×720, `?perfmonitor=1&seed=47`, `game:new` → flight,
  **1079 main-scene frames sampled over 45 s** (box GL is ANGLE software — CPU-side costs
  like list sort are representative; GPU fill is not).
- `renderer.setTransparentSort(...)`: installed an exact replica of three r184's
  `reversePainterSortStable` so each `Array.prototype.sort` call on a transparent or
  transmissive render list is intercepted — exact list length, comparator invocations, and
  wall time per sort.
- `renderer.renderBufferDirect` wrapper: per-draw material census plus draw-call and
  triangle deltas read straight off `renderer.info.render` (which three updates inside
  `renderBufferDirect`), split opaque / `transparent:true` / `transmission>0`.
- `renderer.setRenderTarget` tap + opaque-item re-draw detection: catches three's
  transmission pass (it re-renders the whole opaque list into a dedicated target).
- Overdraw proxy: per transparent draw, the projected bounding-sphere disc's fraction of
  NDC area (`π·r_ndc²/4`, clamped), summed per frame. This is an upper-bound *coverage
  index*, not a fragment count — discs overestimate for sparse geometry and double-count
  near-fullscreen layers even when their alpha is ~0. Ground-truth overdraw tooling exists
  in-repo and was deliberately not needed here: `spectorjs` is a devDependency and
  `scripts/capture-spector-frame.mjs` captures full frames for per-draw inspection;
  RenderDoc's quad-overdraw overlay / `EXT_disjoint_timer_query` per-pass timing are the
  vendor-grade alternatives.

## three.js r184 ordering contract (citations)

- A render item lands in `transparent` iff `material.transparent === true && transmission <= 0`;
  `transmission > 0` lands in `transmissive` (`vendor/three.module.js:8415-8431`).
- `currentRenderList.sort` runs per `renderer.render` when `renderer.sortObjects` (default
  `true`, l.16397): `transparent.sort(reversePainterSortStable)` for both the transparent
  and transmissive lists (l.8455-8461); comparator key order is **groupOrder → renderOrder
  → view-space z descending → object id** (l.8324-8344).
- The per-item `z` is computed in `projectObject` *every frame for every visible item* —
  `boundingSphere.center → matrixWorld → projScreenMatrix` (l.18038-18056; sprites
  l.18013-18018) — even when the comparator resolves on `renderOrder` first.
- Custom hooks exist: `setOpaqueSort` / `setTransparentSort` (l.17027-17045).
- `SAMPLE_ALPHA_TO_COVERAGE` is toggled per-material from `material.alphaToCoverage`
  (l.10631-10633) and has no effect without a multisampled draw target.
- **Transmission is the heavyweight neighbour**: when `transmissive.length > 0`,
  `renderTransmissionPass` (l.17901, 18121-18220) allocates a viewport-sized
  `transmissionRenderTarget` at `transmissionResolutionScale = 1.0` (l.16445) with
  `samples: Math.max(4, capabilities.samples)` (l.18139), re-renders the **entire opaque
  list** into it (l.18193), then pays a multisample resolve + full mip chain + a DoubleSide
  back-face pre-pass with `material.needsUpdate` churn (l.18202-18220).

## Measured counts (seed-47 flight, 1079 frames)

| Metric | Value |
| --- | --- |
| Main-pass draws / frame | avg 91.8 (opaque 76.2, transparent 15.5, transmissive 0) |
| Main-pass triangles / frame | avg 82,224 — transparent share ≈ 12.9 % |
| Frames issuing ≥1 transparent draw | 727 / 1079 (67 %); 352 frames drew none (visibility gating) |
| Transparent draws on active frames | avg 23.0 |
| Transparent sort runs | 650 (skipped when list ≤ 1) |
| Sort list length | p50 **37**, p95 38, max 40 items |
| Sort comparator calls | avg 134 / run |
| **Sort wall time** | **p50 5 µs, p95 10 µs, max 425 µs** (single cold first run) |
| Post/aux `render()` calls / frame | 2.15 (bloom downsample/composite quads, residency batches) |
| Coverage index (bounding-disc screen areas, active frames) | p50 ≈ **7.96** |
| Transmissive items | **0** — transmission pass never fired; 0 opaque re-draws |
| Blending split (transparent-side draws/frame) | additive ≈10.7, normal ≈10.7, custom ≈0.6 |

Coverage is dominated by the authored backdrop: `DeepField_PaintedStellarLight`
(≈0.58 screens/frame), the `helios-ecliptic-dust` / `outer-shepherd` / `left-drift`
parallax plates (~0.4 each), `L3_stars` / `DeepField_ResolvedStellarFormation` Points,
`SF_WeaponRibbons` / `SF_RibbonTrail` trails, and a planet `SpriteMaterial` flare. All are
smooth-gradient alpha surfaces — the blending is the artwork.

## Answers to the lane's three levers

1. **Alpha-to-coverage (MSAA) — not viable here.** A2C writes coverage into MSAA samples;
   both possible targets are single-sampled *by design*: the bloom scene target
   (`rtScene.samples = 0`, `BALANCED_BLOOM_MSAA_SAMPLES = 0` — `src/render/bloom.js:46,1243,1273`,
   comment: "Keep the offscreen target single-sampled … a costly resolve before the
   downsample/composite chain"), and the canvas itself (`antialias:false` on the default
   bloom/graph routes, `src/render/presentPath.js:19-25`). Enabling MSAA would add a
   full-res HDR resolve per frame — a pipeline change, not a free win — and A2C only
   approximates *cutout* coverage anyway; it does not replace translucency.
2. **alphaTest/discard instead of blending — no eligible surfaces.** The normal-blend
   transparent census contains soft gradients (planet sprite flare, nebula plates) and
   uniform-opacity ghost structures (DeepFieldStructure derelict-hauler/relay-mast at
   `opacity 0.9`, no alpha texture). No binary-alpha textured surface exists to convert;
   forcing `alphaTest` on gradient alpha would be a visible quality change.
3. **Pre-sorted static ordering — already shipped.** The backdrop carries an explicit
   renderOrder ladder (`spaceBackground.js` −95 → −50, `parallaxLayers.js` −9/−6/+2,
   trails 4/5/11, `SF_WeaponRibbons` 20), which makes the comparator exit at its second
   key. The residual cost is the TimSort pass itself over ≤40 items — measured 5 µs — and
   the per-item `z` projection inside `projectObject` (~40 matrix multiplies, sub-µs
   each). `sortObjects = false` would also skip that `z` compute, but it must not be set:
   traversal order is not a documented depth order for the dynamic transparents that share
   renderOrder 0 (trails, beams, decals vs. each other) — wrong back-to-front order on
   normal-blended items is exactly the visible regression this lane forbids.

## Latent cost worth naming (documented, not patched)

`renderTransmissionPass` never fired in this window — `configureRealtimeCanopyMaterials`
(`src/render/canopyMaterialPolicy.js`) already converts ship canopies to alpha glass
("Physical transmission forces a second opaque scene render" — the codebase knows), and
`precompile.js:909` / `partsLibrary.js:5754` / `shadowCasterPolicy.js:238` apply it on every
authored root. But real `transmission > 0` materials still exist on **non-canopy**
surfaces: `visualFactory.js` ice asteroids (`0.78`, l.2329) and gas hulls (`0.88`, l.2448),
`opticCellPresentation.js` diamond (`0.85`, l.183) and spent (`0.26`, l.207) cells. The
first framed ice/diamond object re-renders the entire opaque list into a forced-4×-MSAA
full-viewport target **every frame it stays visible**. Extending the canopy conversion to
these kinds (or dropping `renderer.transmissionResolutionScale`) is a candidate for a
*content-verified* follow-up lane — it changes the look of an authored material, so it is
outside this lane's zero-visible-change contract.

## Metrics / A-B evidence

- **Golden 47a** (`run --seed 47 --ticks 720 --hash --repeat 20 --reload-at 600`):
  `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`,
  `deterministic: true`, exit 0 — run on this branch; only a probe script and this report
  were added, no sim- or draw-path edit exists to A/B.
- **Transparency-pass cost A/B is intrinsic**: baseline behaviour == instrumented behaviour
  for every number above except the two wall-time fields (sort tap + render timing), which
  measure, not alter, the pass. Instrumented sort p50 5 µs / p95 10 µs is the measured
  cost ceiling; uninstrumented cost is strictly lower.
- No `KEEP` patch was attempted: every identified lever is either already landed, a visible
  change, or a pipeline-level change — all excluded by the lane contract.
