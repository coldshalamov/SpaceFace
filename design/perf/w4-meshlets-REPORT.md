# Wave-4 Lane Report — Meshlet / Clustered LOD (Nanite-style)

Lane question: *does hierarchical meshlet culling + clustered LOD pay for
station-scale geometry?*

Branch: `devin/1790650472-w4-meshlets` off `origin/master` (9a30ffc00).

## Verdict

**REVERT — nothing implemented.** The audit fails the lane's own precondition
("meshlets only pay when single objects are huge AND partially visible"):

1. **No object is huge.** The entire authored render-package library is
   **4,965,925 triangles across 274 packages**. Heaviest single object:
   wreck-cathedral at 253,652 tris / 24 prims; heaviest station:
   helios-trade-hub 133,207 tris / 45 prims; jump-ring gate 77,833 tris / 37
   prims; heaviest ship lod0 69,776 tris. Median package is 8,750 tris (p90
   50,326). Nanite's regime is scenes of **10⁸–10¹²** triangles — SpaceFace's
   whole content library is 2–4 orders of magnitude below a single Nanite-test
   mesh. Karis (SIGGRAPH 2021) motivates clustered LOD by sub-linear scaling on
   massive unique meshes; nothing here is massive.
2. **Vertex throughput is not the pole.** The corpus's ranked poles (master
   plan §2) are the serial admission/decode chain, program links, entityList
   fat walks, DOM/HUD writes, and draw-call/program-switch count — all
   main-thread CPU. Nowhere in the corpus is triangle count named. The corpus
   already adjudicated this family: "Runtime occlusion-culling every triangle
   is more expensive than drawing the table" (PERF_WHAT_MATTERS), and
   OPEN_SOURCE_INTAKE §0 pre-rejected `clusterlod.h` verbatim: *"a Nanite-style
   hierarchy for huge unique meshes; this game is a table of complete hulls,
   not a landscape of billions of triangles."*
3. **Partial visibility is real but bounded and already covered.** Camera is a
   tilted top-down chase: fov 50°, DEFAULT_ZOOM 144 → ~172×97 WU visible at
   focus. Only wreck-cathedral (645 WU long) can substantially overfill the
   frame — worst theoretical off-frustum mass ≈72% → ~182K tri-equivalent
   verts, i.e. <0.2 ms of vertex work on any GPU that can run this game.
   Two other landmarks can overfill the window on their long axis
   (skerris-throne 217 WU, candle-fleet 197 WU, both <120K tris); every
   station and the jump-ring are ≤~125 WU — binary whole-object frustum
   culling already handles them, and the camera's group-fit minZoom
   composes near-view-size objects before they can pop. Station detail
   cost at distance is already covered:
   HLOD (`src/render/hlod.js`) hides greeble/decal/navlight/antenna surfaces at
   lod2 on the stable authored root; whole-ship lod0/lod1/lod2 packages swap
   via `lodFamily`; the `landmarks` lane demotes authored places beyond the
   decode runway; group-fit minZoom frames big objects before they can pop.
4. **WebGL2 cannot execute the technique without paying the pole.** No
   mesh/task/amplification shaders and no GPU-side draw compaction on this
   engine: cluster culling must run on the CPU — ~2,000 cluster sphere tests
   plus an index-buffer rebuild+upload every frame the object is visible —
   spending the exact resource (main-thread JS) that IS the pole to save
   vertex work that isn't. The three.js ecosystem evidence agrees: the only
   serious web meshlet renderers are WebGPU (Shade: *"The Plebs of The Web™,
   alas, have no mesh shaders"*), and its author's own finding was that
   finer-than-meshlet culling *"costs about the same as what you've saved."*
   The WebGL2 alternative (`WEBGL_multi_draw` over baked cluster GLBs, e.g.
   the community `streaming-gltf` experiment) still needs CPU cluster selection
   per frame and trades against the corpus's draw-call pole.

**What already suffices:** whole-object LOD chain end-to-end — HLOD detail-hide
(lod2), authored lod-family package swaps, residency demotion past the runway,
whole-object frustum culling. Interior-triangle waste (the only sub-object
residue the doctrine names) is an **export-time** fix per PERF_TABLE_ANALYSIS
§5/"fix at export, not a runtime occlusion system" — an art-pipeline task, not
a renderer feature. If a future asset lands ≥1M tris in one object with a real
vertex-bound measurement on owner GPU, reopen; the gate that would justify it
does not exist in the corpus.

## Research citations

- **Karis, "A Deep Dive into Nanite Virtualized Geometry," SIGGRAPH 2021
  Advances course** — cluster LOD hierarchy (parents = simplified children,
  view-dependent tree cut by projected screen-space error), software
  rasterization of small triangles, HZB two-pass occlusion, mesh shaders.
  The motivating problem is trillion-triangle scenes and pixel-size triangles;
  SpaceFace content is ~5M tris total with authored LOD already.
- **zeux/meshoptimizer `demo/clusterlod.h`** — `meshopt_buildMeshlets*` +
  partition + per-level simplify into a cluster tree; the buildable reference
  implementation this lane would have ported. Also vendored in
  nvpro-samples `vk_lod_clusters` (`src/meshopt_clusterlod.h`) — the Vulkan
  mesh-shader path; no WebGL2 equivalent exists.
- **three.js forum, "Shade — WebGPU graphics" (#92, Usnul)** — the reference
  web meshlet renderer runs on WebGPU compute; explicitly notes WebGL has no
  mesh shaders and that per-triangle culling costs ≈ what it saves.
- **`AnEntrypoint/streaming-gltf`** — three.js WebGL cluster-LOD via a baked
  GLB extension + `WEBGL_multi_draw`; demonstrates the only WebGL2-legal shape
  (CPU picks cluster LODs, one batched draw) — still a per-frame CPU walk over
  clusters plus a renderer replacement, for content at landscape scale.
- **In-repo prior adjudication** — `docs/OPEN_SOURCE_INTAKE.md` §0:
  "`clusterlod.h`… this game is a table of complete hulls, not a landscape of
  billions of triangles"; `design/program/PERF_WHAT_MATTERS.md`: per-triangle
  runtime culling rejected, interior tris are an export fix;
  `design/program/PERF_TABLE_ANALYSIS.md` §5; `src/render/graphicsLab.js`
  prompt: "Do not runtime-cull interior triangles for performance";
  `PERF_MASTER_PLAN_2026-09-26.md` §3 "interior-triangle runtime culling" in
  the not-doing list; mixed unique-hull mega-batch REJECTED (submit cost is
  draw calls + program switches, not tri count).

## Audit numbers (GLB accessor census, all of `assets/`)

| Object | Tris | Prims | Notes |
|---|---|---|---|
| wreck-cathedral (render pkg) | 253,652 | 24 | heaviest object; 609 WU long axis |
| place_station_refinery (m5 truth) | 171,136 | 16 | heaviest station source variant |
| helios-trade-hub | 133,207 | 45 | heaviest live station |
| candle-fleet | 118,379 | 43 | landmark |
| skerris-throne | 106,880 | 49 | landmark |
| research | 104,891 | 38 | station |
| resonant-cathedral | 96,942 | 42 | landmark |
| ceres-refinery | 92,754 | 39 | station |
| blackmarket | 88,148 | 49 | station |
| military | 79,861 | 49 | station |
| jump-ring | 77,833 | 37 | heaviest gate ring |
| fab | 77,290 | 45 | station |
| heaviest ship lod0 (atlas) | 69,776 | 9 | kestrel lod0 is 37,974 |

Library totals: **274 packages, 4,965,925 tris; median 8,750; p90 50,326.**

Spatial granularity check (POSITION accessor min/max per prim): every prim's
bounding sphere covers effectively the whole object (e.g. helios 45 prims all
centered ~origin, r≈80–86 over a 125 WU span; wreck 24 prims all r≈300–330
over 645 WU) — prims are material splits, so partial-visibility culling does
not exist today below whole-object granularity; meshlets would be the only
sub-object lever, at the costs above.

Real extents (unquantized source GLBs): wreck-cathedral 645×287×531,
skerris-throne 217×87×190, candle-fleet 197×58×213, resonant-cathedral
109×139×180, trade-hub 125×55×111, blackmarket 106×124×33, research
101×102×75, refinery 99×57×89, jump-ring 19×105×101, military 76×79×43.

Camera math: `tan(25°)×144×0.72` → halfV ≈ 48 WU, halfH ≈ 86 WU at 16:9 →
~172×97 WU window; only the 645 WU wreck can substantially overfill it
(≤72% theoretical max off-frustum ⇒ ~182K tri-equiv verts ≪ 0.2 ms GPU).

## Patch

None — documentation-only lane. `git diff` empty except this report.

## Metrics

- **Golden 47a** (`node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720
  --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json
  --hash --repeat 20 --reload-at 600`, node v24.0.1): `deterministic: true`,
  `sha256 == baselineSha256 == cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`.
  Note: the task-stated baseline `f3583c50…` is **stale** — master commit
  `4d56cb9b5` re-recorded the 47a goldens; `cc941938` is the live master value
  (matches w4-jobsys's recorded baseline). Identical by construction: zero
  sim-path edits on this branch.
- **Probe A/B**: N/A — no code change to A/B. The audit itself is the
  measurement (asset census + camera/frustum math above); a live probe cannot
  name a vertex pole the corpus has never recorded.

## Zero visible quality change

No code, asset, or data change; one markdown report under `design/perf/`.
