# W4 lane: vertex-cache reorder + mesh quantization — 2026-09-29

Scope: verify whether meshoptimizer post-transform vertex-cache optimization is applied at
asset build; add if missing. KHR_mesh_quantization audit. Zero visible quality change;
47a golden must reproduce.

## Verdict

**Already applied on every live draw path; no code change required.** Both post-transform
vertex-cache reorder and KHR_mesh_quantization are produced by the existing asset builds.
This lane's remaining concrete work was pipeline hygiene: the render-pilot provenance pin
had drifted behind `pilots.json`, leaving `check-render-package-pilots` red on master —
fixed by the repo-prescribed pilots rebuild (metadata-only; `render.glb` bytes verified
byte-identical).

## Pipeline audit

| Stage | Script | Transform | Post-transform opt | Quantization | Compression |
|---|---|---|---|---|---|
| Release parts (275 manifest assets: hulls, engines, places, wholeships, LOD siblings) | `scripts/build-sg04-release-assets.mjs` | `meshopt({level:'high', quantizePosition:14, quantizeNormal:12, quantizeTexcoord:13, quantizeColor:8, quantizeWeight:8, quantizeGeneric:12})` | YES — `reorder(target:'size')` inside `meshopt()` = `meshopt_optimizeVertexCacheStrip` + `optimizeVertexFetchRemap` | YES — SHORT+N POSITION, BYTE+N NORMAL/TANGENT, USHORT+N TEXCOORD | EXT_meshopt_compression FILTER + KTX2/UASTC+mips |
| Same profile, other release trees | `build-dock-release-assets.mjs`, `build-hull-release-assets.mjs`, `build-pack-release-assets.mjs`, `build-place-release-assets.mjs` | `meshopt({...RELEASE_MESHOPT_OPTIONS})` (dock/hull quantizeNormal:10) | YES (same) | YES (same) | same |
| Render packages (274 = primary flight-static draw path) | `scripts/lib/renderPackageCompiler.mjs` | `weld(overwrite) → reorder({encoder, target:'performance', cleanup:true})` | YES — `meshopt_optimizeVertexCache` + `optimizeVertexFetchRemap` (Tom-Forsyth-adaptive variant) | inherited from release sources; streams baked to float by `transformPrimitive`/`promoteDirectionalBakeStreams` stay FLOAT deliberately (collision/anchor precision) | EXT_meshopt_compression (inherited required ext; FILTER fallback for >100 MB packages) |
| Whole-ship LOD generation (intermediate sources) | `scripts/build-wholeship-lod.mjs` | `weld()` + `MeshoptSimplifier.simplify` (LockBorder) | n/a — outputs are *sources* re-optimized downstream by sg04 | n/a (source) | n/a (source) |

Accessor evidence (GLB JSON chunk, heaviest packages first):

- `render-packages/wreck-cathedral/render.glb` (11.9 MB): `extensionsRequired:
  [EXT_meshopt_compression, KHR_mesh_quantization, KHR_texture_basisu]`; 24 prims,
  252 390 verts; POSITION/NORMAL/TANGENT FLOAT (transform-baked), TEXCOORD_0 USHORT+N,
  indices USHORT.
- `render-packages/helios-trade-hub/render.glb` (5.8 MB): same required extensions; 45
  prims, 199 612 verts.
- `release/parts/wholeships/wasp.glb`: `KHR_mesh_quantization`; POSITION SHORT+N,
  NORMAL BYTE+N, TANGENT BYTE+N, TEXCOORD USHORT+N, indices USHORT.
- Coverage probe over `assets/ships/release/parts`: 276/276 GLBs require
  `KHR_mesh_quantization`; 276/276 require `EXT_meshopt_compression`; all 7693
  primitives have non-FLOAT (quantized) POSITION; all textured files require
  `KHR_texture_basisu` (245 textured; remaining are untextured collision/marker GLBs).
- Coverage probe over `assets/ships/release/render-packages`: 274/274 packages require
  both `EXT_meshopt_compression` and `KHR_mesh_quantization`; no uncovered dirs.

Runtime consumers: `isReleaseAssetMode()` defaults true → `partsLibrary` draws
`assets/ships/release/parts/**` directly for authored jobs and whole-ship files, and the
274 render packages are the compiled flight-static path. Both are covered.

## Measured reorder effectiveness (ACMR, LRU post-transform cache sim)

| Asset | Order shipped | ACMR@16/32/64/128 | after `reorder('performance')` |
|---|---|---|---|
| release wholeships/wasp.glb | CacheStrip | 1.228/1.211/1.200/1.200 | 1.205/1.202/1.201/1.200 |
| source parts/wholeships/wasp.glb | authored | 1.809/1.595/1.495/1.300 | 1.205/1.202/1.201/1.200 |
| release wholeships/pelican.glb | CacheStrip | — (LRU-32 1.248) | LRU-32 1.238 |
| release places/place_landmark_wreck_cathedral.glb | CacheStrip | LRU-32 1.026 | LRU-32 1.018 |
| release places/place_station_trade_hub.glb | CacheStrip | LRU-32 1.504 | LRU-32 1.501 |
| source parts/wholeships/ranger_production_v1.glb | authored | 1.269/1.139/1.093/1.036 | 0.966/0.956/0.953/0.947 |

Reorder is doing real work in the build (authored wasp 1.60→1.20 at LRU-32). The shipped
CacheStrip order already sits at the corpus's locality floor — explicit
`optimizeVertexCache` moves shipped assets ≤0.02 ACMR (≈1% of vertex fetches) for +0.4–0.6%
bytes. **Rejected**: switching the release `meshopt()` wrapper to `target:'performance'`
would churn 276 binaries + manifest + pilots for no measurable gain.

## Considered and rejected

- `reorder(target:'performance')` on release tree — measured no-op on this corpus (table above).
- Quantizing render-package baked-FLOAT POSITION streams — disqualified by the
  "provably imperceptible" bar: package geometry is baked into scene units (large station
  extents → decimeter error at 14-bit) and carries collision/anchor records; any
  positional shift is a golden-hash risk. Normals stay unquantized post-bake by design
  (banding; task constraint).
- `meshopt_optimizeOverdraw` — not applied anywhere (gltf-transform `reorder` does not
  expose it); out of lane scope and it trades *against* vertex-cache locality.
- `meshopt_optimizeVertexCacheFifo` — the lane names it; the shipped `CacheStrip`
  variant is its stronger sibling (per README, FIFO "generally produces less performant
  results" — on this corpus the measured difference is ~0).
- Non-indexed/points primitives — `reorder` skips non-triangle prims; none carry visible
  geometry cost here.

## Hygiene landed in this lane

- `check-render-package-pilots` was **red on master** before any lane change: all 274
  packages pinned `provenance.sourceManifest` = `pilots.json@209118B/af0b27e4`, while the
  committed `pilots.json` is 213988 B — the manifest drifted after the last rebuild inside
  commit 5201db9e8. Rebuilt pilots per the gate's own prescription: all 274
  `render-package.json` repinned (bounds shape `{min,max,size,center}` retained;
  `render.glb` verified byte-identical on recompile — toolchain deterministic).
- `check-sg04-release-assets`: green (197 assets, releaseReady).
- 47a golden: `cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885` — identical.

## Sources

- meshoptimizer README + `src/meshoptimizer.h` — `optimizeVertexCache` (adaptive post-transform
  locality), `optimizeVertexCacheFifo` ("produces inferior results… ~2x faster"),
  `optimizeVertexFetch` (vertex-buffer memory locality): https://github.com/zeux/meshoptimizer
- glTF-Transform `meshopt()` transform source (v4.4.1): thin wrapper =
  `reorder({target:'size'})` + `quantize()` + `EXT_meshopt_compression`; 'size' maps to
  `MeshoptEncoder.reorderMesh(idx, tris, optsize=true)` = `optimizeVertexCacheStrip` +
  `optimizeVertexFetchRemap`; 'performance' = `optimizeVertexCache` + fetch:
  node_modules/@gltf-transform/functions/dist/index.js:4294,
  node_modules/meshoptimizer/meshopt_encoder.js:139
- KHR_mesh_quantization spec (SHORT POSITION, BYTE NORMAL/TANGENT, normalized storage;
  dequantize via node transforms; normals need shader renormalization):
  https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_mesh_quantization/README.md
- Tom Forsyth linear-speed vertex-cache optimization (the algorithm
  `optimizeVertexCache` refines): https://tomforsyth1000.github.io/papers/fast_vert_cache_opt.html

## Notes for future lanes

- `assets/ships/release/parts/wholeships/{pelican,wasp}.glb` are compressed+quantized but
  have **no `release_manifest.json` row** (the `_production_v1` family does). Manifest
  bookkeeping gap outside this lane; flagging.
