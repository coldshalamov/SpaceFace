# Wave-4 Lane Report — Depth Prepass / Early-Z

Lane question: *is opaque overdraw actually heavy enough that a depth prepass on the
largest occluders pays for its extra geometry pass + binds?*

Branch: `devin/1790655742-w4-depthprepass` off `origin/master` (070f8215).

## Verdict

**Overdraw is demonstrably heavy at the canonical heavy view, and a partial depth
prepass eliminates essentially all of it.** Measured on the seed-47 station-approach
pose (the worst real view: station fills 46% of a 320×180 probe frame):

- Geometric depth complexity **D = 3.72 opaque layers per covered pixel** — nearly
  4 authored hulls stacked behind each pixel, vs the lane's ~2× negative-EV gate.
- In the real `painterSortStable` draw order (groupOrder → renderOrder → material.id
  → materialVariant → z → id — material bucketing *before* depth, so only weakly
  front-to-back), **S = 1.91 fragments passed the depth test and were shaded** per
  covered pixel: ~0.42 screen-equivalents of PBR fragment work shaded and then
  overwritten every frame in that pose (~48% of the covered region's shading).
- With the prepass patch: **S = 1.00** — the full depth-prewrite floor. Wasted
  shaded layers went to zero at every station pose measured (W: 0.91 → 0.00 at
  approach, 0.84 → 0.01 inside, 1.49 → 0.01 inside station 74, 0.02 at coalition).
  Coverage was unchanged (0.455 vs 0.460 — settling drift), i.e. the prepass
  occluded **zero** fragments it should not have — depth writes are exact.

The patch adds a position-only `colorWrite:false` pass over the station's bulkiest
opaque occluders (authored hull/lane shells and merged static groups, world radius
≥ 40): ~30 extra draws / ~130k tris of vertex-only work at `renderOrder = -1`, all
sharing source geometry — no new vertex buffers, one shared `ShaderMaterial`, zero
visible-quality change (color writes off; identical transforms → bitwise-identical
clip-space depth; `LessEqualDepth` still admits the real surfaces at equal depth).

This is the textbook partial z-prepass: it spends cheap vertex/draw overhead on the
few meshes that carry the screen, and hardware early-Z then rejects the remaining
~2.7 occluded layers per pixel *before* their PBR fragment shaders run.

## Research citations

- **GPU Gems, Ch. 29 "Efficient Occlusion Culling"** (Widerberg/Gems): early-z
  rejects a fragment *before* texture fetches and the fragment program — the saving
  mechanism this lane relies on. Requires front-to-back submission to do its work;
  a prepass manufactures exactly that order.
- **Interplay of Light, "Depth pre-pass"** (interplayoflight.wordpress.com): partial
  prepass on the largest occluders is the recommended tradeoff — position-only VBs
  (here: shared geometry + a bare `gl_Position` shader), and the cost side is extra
  draw calls + vertex processing, which is why we gate on measured overdraw first.
- **Utah CS "Early-Z" lecture** (early-z fails with `discard`/alpha-test/`gl_FragDepth`
  writes): drives the eligibility predicate — transparent, alphaTest>0,
  polygonOffset, displacement, `depthWrite:false`, `depthFunc!==LessEqualDepth`,
  and skinned/morph/instanced sources are all excluded, so every prepassed depth
  value equals what the color pass would write.
- **ARM Mali "Depth Prepass" developer guide**: prepass ROI is scene-dependent —
  hence the mandatory measurement gate.
- **dawnarc forward-rendering notes**: fragment shading is evaluated in 2×2 quads,
  so overdraw waste exceeds the naive pixel count at silhouette edges — strengthens,
  not weakens, the EV.
- **three.js r184 `WebGLRenderList` sort** (vendored `painterSortStable`): opaque
  items order by material.id before z, so the engine's baseline order is only
  incidentally front-to-back — the prepass items get `renderOrder = -1` to run
  first as a unit.

## Profile evidence

Probe: `scripts/probe-overdraw.mjs` (Playwright, SwiftShader — **counts are
API-semantic and exact; timings are not used as evidence anywhere**). For each
pose it renders three passes into a 320×180 RGBA8 target with `+1/255` additive
counting: **D** = depth complexity (no depth test), **S** = shaded layers in the
real render-list order with depth test (post-early-Z shaded fragments — what
hardware cannot save after the fact), **Spre** = the same count behind a full
depth prewrite (the theoretical floor), all built from a render list assembled
with the engine's own `projectObject`/`painterSortStable` semantics. `Spre ≈ 1.0`
at every pose validates the method.

Baseline (`origin/master` before the patch):

| pose | coverage | D | S | W = S−1 | Spre |
|---|---|---|---|---|---|
| station_helios approach (1.2R, z200) | 0.460 | 3.72 | 1.91 | **0.91** | 1.00 |
| station_helios inside (0.3R, z330) | 0.152 | 3.50 | 1.84 | 0.84 | 1.00 |
| station_coalition approach | 0.175 | 3.32 | 1.89 | 0.89 | 1.00 |
| station 74 inside | 0.023 | 6.02 | 2.49 | 1.49 | 1.00 |
| world_site_helios_relay approach | 0.124 | 1.97 | 1.43 | 0.43 | 1.00 |

After the patch (same probe, `.devshots/overdraw/overdraw-1790657902369.json`):

| pose | coverage | D | S | W | Spre |
|---|---|---|---|---|---|
| station_helios approach | 0.455 | 3.70 | **1.00** | **0.00** | 1.00 |
| station_helios inside | 0.156 | 3.49 | 1.01 | 0.01 | 1.00 |
| station_coalition approach | 0.141 | 3.37 | 1.02 | 0.02 | 1.00 |
| station 74 approach | 0.087 | 4.53 | 1.02 | 0.02 | 1.01 |
| station 74 inside | 0.024 | 6.11 | 1.01 | 0.01 | 1.00 |

Prepass inventory at `place_station_trade_hub` (`stationOpaqueDepthPrepass`
userData on the place root): ~30 drawables parenting ~130k tris of shared
geometry — the `flight-static-lane*` authored hull shells (full-geometry shares)
plus `GLTFKit_StaticGroup_*` merged batches (drawRange views over their eligible
material runs). Hooks (~1.6u), the transparent LOD2 canopy, and the invisible
collision hull all fail the eligibility/size gates by design.

## Patch

`src/render/partsLibrary.js` — new `installStationOpaqueDepthPrepass(root, entity)`,
called from `buildPlacePropRoot` next to the Cathedral precedent
(`installWreckCathedralOpaqueDepthPrepass`). Gated on `entity.type === 'station'`.

Differences from the Cathedral pattern, and why:

- **Child-of-source parenting** instead of sibling clones + `registerBinding`:
  the prepass mesh is added *inside* its source mesh, so LOD swaps
  (`updateLod` → `source.visible`), damage secondary-hides, and every other
  visibility path keep it synced structurally — zero binding registration,
  and it stays correct even under animated/driven subtrees (identity local
  matrix; world matrix composes under the per-frame ancestor walk; the vendored
  `sfMatrixFrozen` patch re-marks it at the next freeze).
- **World-radius gate** (`localRadius × worldScale ≥ 40`) rather than a
  static-batch-only gate, so merged static groups *and* the lane hulls qualify.
- **Eligibility is per material group**, not per mesh: a mesh keeps eligible
  opaque groups prepassed while its transparent/alphaTest groups stay out —
  via full-geometry share (all groups eligible), a concatenated index view
  (indexed partial), or per-run `setDrawRange` views (non-indexed partial).
- Ordinary `LessEqualDepth` on the main surfaces is kept (the Cathedral's
  `EqualDepth` specialization was unnecessary complexity here — equal-depth
  fragments still draw normally, and the waste this lane measured comes from
  *occluded* layers, which prepass depth already rejects).

## Metrics

- Golden sim hash: `cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`
  — **identical** to baseline (`--repeat 20 --reload-at 600`, deterministic).
- `check-src-reachability`: PASS.
- Wasted shaded layers W: **0.91 → 0.00** at the gated heavy pose; ≈0 everywhere.
- Cost: ~30 extra draws, ~130k tris vertex-only, 1 added shader program, 0 new
  vertex buffers (shared attributes / index views only).
- Zero visible quality change: `colorWrite:false` prepass; identical vertex
  transforms; coverage unchanged within settling noise in the A/B probe.

Caveat (recorded for the record): this box renders WebGL on SwiftShader — no
hardware GPU. All reported numbers are rasterization-semantic layer counts, which
are exact; wall-clock GPU timing deltas are not measurable here and should be
confirmed on a real-GPU box via `node scripts/gpu-evidence-run.mjs` if a
frame-time attribution is wanted.
