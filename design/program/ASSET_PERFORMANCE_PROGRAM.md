<!-- LIFETIME: DURABLE -->
# The asset layer and performance: what it costs, what was wrong, what to do next

**2026-10-27.** Written after a full sweep of the shipped asset tree, the render-package
pipeline, and the live frame numbers on the owner's laptop (Intel Core Ultra 7 155U, Intel
iGPU via ANGLE/D3D11, 1920x1080 at 125 %).

Read this before starting any "the assets are slow" or "the models look cheap" job. The short
version: **the asset layer was wasting a third of the retail payload and had no ceiling or
census at all, and that is now fixed and gated. The asset layer is not where the frame time
goes.** Both halves matter: fix the payload, then stop looking here for smoothness.

## 1. What the shipped tree actually costs

`npm run perf:assets` (writes `.devshots/asset-census/`). Measured 2026-10-27 over all 831
readable GLBs under `assets/ships/release`:

| | Value |
|---|---|
| Files | 831 (414 render packages, 417 authored parts) |
| Geometry | 15,342,498 triangles, 24,303 primitives |
| Materials | 6,734 slots, of which **4,623 (68.7 %) are tint-only duplicates** of another slot's texture set |
| Decoded texture VRAM, if everything were resident | 3,529.7 MB |
| On-disk | 546.9 MB (was 681.5 MB before the fix in §2) |
| Retail payload after `render-package-sources-v1` omission | **328.9 MB** (was 470.9 MB) |

The 3.5 GB figure is a ceiling, not a bill: a live Helios session measured **71.5 MB** of
resident texture and **118 textures / 2287 geometries / 149 programs**, drawing **130 calls and
22 instanced calls per frame**. The asset tree is lazy and already culls well. Do not quote
3.5 GB as a runtime cost.

## 2. What was actually broken (fixed 2026-10-27)

### 2.1 Render packages shipped lossless

`scripts/lib/renderPackageCompiler.mjs` read a quantized + meshopt-compressed release GLB,
decoded it to float, baked immutable node transforms, welded - and wrote it back with **no
encode profile**. Every package came out ~1.75x the source it replaces. Because the retail
projection *omits* a source GLB whenever a package exists, the package did not replace 269 MB
of parts - it replaced it with **439 MB**, so the payload grew by 170 MB while the sources it
"replaced" were removed.

Fix: re-apply the shared release profile after the bake, in glTF-Transform's documented order
(`quantize -> reorder -> meshopt`). Same triangles, same primitives, same materials; bounds move
by <2e-7.

| | Before | After |
|---|---|---|
| `render-packages/` | 439.3 MB | 307.1 MB |
| Retail payload | 470.9 MB | 338.6 MB (-28 %) |
| Package bytes vs the sources they replace | 1.75x | 0.998x |

Guard: `npm run check:render-package-encoding` fails if a package loses its source geometry
compression or outgrows its source.

### 2.2 Nothing could see the problem

`scripts/audit-gltf-assets.mjs` never registered the meshopt decoder, so **796 of 814 shipped
GLBs read as errors** and it scored only the 18 uncompressed stragglers. A tool that reports
"18 models audited" against a 831-file tree is worse than no tool.

Replaced by `scripts/asset-census.mjs` (reads the real tree: meshopt + KTX2, per-file
tris/prims/materials/texture sets/decoded VRAM) and `scripts/asset-material-census.mjs`
(tint-only duplicate material slots). The old audit keeps its per-file role but now decodes.

### 2.3 Dead weight in the retail copy

`wholeships/pelican.glb` and `wholeships/wasp.glb` - 9.7 MB of blocked legacy originals
superseded by `*_production_v1` - were still shipped. Nothing loads them and they were absent
from `release_manifest.json`; a release build writes files but never deletes one a later
blocking decision retired. Deleted, and `check-asset-census` now fails on any GLB under
`assets/ships/release` that the release manifest does not declare.

## 3. Why the asset layer is not the frame-time pole

The live numbers say it plainly.

- A frame at the start of flight costs **~4.5 ms of an available 16.7 ms with ~60 draw calls**
  ([`PERF_TOP10_AND_BACKLOG_2026-09-13.md`](../perf/PERF_TOP10_AND_BACKLOG_2026-09-13.md)).
  Drawing less geometry is not a lever at that size.
- The worst live route receipt (`.devshots/frame-solid/2026-10-21T09-15-30-938Z.json`, adventure,
  seed 4242, headed) shows **frame p50 23.2 ms, p95 53.5 ms, p99 109.4 ms, longest 324 ms**,
  142 frames over 50 ms in 66 s of flight - while drawing 130 calls/frame. The stutter is not
  the draw count.
- In the same receipt, admission spent **pipelineMs 85.2 s total (max 26.5 s per job)**, of
  which **compileMs 77.8 s (max 26.2 s)**: on this driver `renderer.compile()` returns in ~0.4 ms
  because KHR_parallel_shader_compile only *starts* the link, and the seconds are spent waiting
  for driver-side links, strictly serialized behind one `linkActive` tail
  (`src/render/pipelineReadiness.js`). `upgradeCompiling` was non-zero on 94 % of sampled frames.
- 5 of 8 of the biggest assets by primitive count are single-purpose wrecks whose 168-308
  primitives map to 10-17 materials. Merging same-material primitives would cut their draw
  groups ~10-20x - and it is already implemented in the compiler via `mergeGroups`, enabled for
  **1 of 414 packages** (`flight-static-v3.json`). It is legal work. It is not the pole.

So: reducing 130 draws to 90, or 3.5 GB of potential VRAM to 2 GB, will not turn a 23 ms p50
into 12 ms. Do not spend a sitting there and claim smoothness.

## 4. The real remaining poles, ranked

1. **Driver program-link stalls at first sight** (`PQ-198`, `PQ-197`/`PQ-202`, §8.4 of
   `build_map.md`). One link tail, one subject at a time, and every authored body the player can
   see waits behind it. The legal asset-side lever is **fewer program families**, not more
   prewarm (prewarm was measured and made the fly worse: 147 ms -> 207-219 ms).
2. **Material fragmentation per body.** Every Forge hull carries 17 material slots for 3 texture
   sets; 14 of them differ only by `baseColorFactor`. `materialShareSignature` deliberately keeps
   colour in the share key for `spacefaceFinish: 'forge-v1'` ("or every forged ship would inherit
   the first one's paint"), so those variants cannot share and cannot merge. Moving identity
   colour from `material.color` into a per-vertex `COLOR_0` attribute at release time would let
   one program family and one material serve a whole hull - and then `mergeGroups` could collapse
   ~17 primitives per hull to ~3. This is the single largest asset-attributable item left.
3. **Simulation p95 7.2-17.7 ms** leads the steady CPU ranking on all seven matrix routes; it is
   not an asset cost. See `PERF_TABLE_ANALYSIS.md` / `TABLE_AUTHORITY_PLAN.md`.
4. **Oversized place textures.** `place_works_derrick` (21 MB), `works_rover` (20 MB),
   `works_inclusion_kit` (16 MB) ship 2048x2048 UASTC while occupying a few hundred pixels at
   the gameplay camera. Clamping place/works maps to 1024 is a 4x VRAM cut on those assets and
   invisible at the chase camera - but it changes pixels, so it needs a `fleet-look` review per
   asset, not a blanket rebuild.

## 5. Traps - already tried, do not repeat

- **Shader prewarm with dummy meshes.** Measured worse. Closed.
- **Bloom off/strength down.** ~0.5 ms, 1 %. Measured. Illegal as a default fix.
- **Re-enabling the old per-frame refit `BatchedMesh`.** Lost 250-616 ms. The retained-slot
  rewrite exists and stays shipping-off until a crowded census names draw count as the pole.
- **Re-quantizing or simplifying authored hulls to "save triangles".** 15.3 M triangles across
  831 files is a library, not a frame. Nothing here is triangle-bound.
- **Deleting hidden interior triangles at runtime.** Occlusion-culling every triangle costs more
  than drawing the table.

## 6. How to measure this area

```
npm run perf:assets                          # census: tris/prims/materials/VRAM per file + tint duplicates
npm run check:asset-census                   # per-file and whole-tree budget gate
npm run check:render-package-encoding        # packages must stay quantized + meshopt, and not outgrow sources
npm run check:release-manifest-pins          # seconds; pilot pins vs disk after any release/package change
node scripts/fleet-look.mjs --file=places/place_station_trade_hub.glb --views=inspect
                                             # open the PNG: authored, or a stand-in?
```

`fleet-look` is the honest visual check and it names its own failure: `authored swap not
confirmed` or `released part has no render package` means you are looking at a stand-in, not the
model. The 2026-10-27 walk used it to confirm the re-encoded packages still load authored (the
Helios trade hub renders with its `forge-v1` materials, 1024 maps and role tags intact).

Budgets live in `scripts/check-asset-census.mjs` and are set from the measured tree with
headroom. Raise one on purpose, in the same commit that ships the asset that needs it, and say
what it buys the player.
