# W4 lane — instancing expansion sweep — 2026-09-29

Wave-4 lane on `devin/1790654647-w4-instancing` off `origin/master` (070f8215e at fetch).
Ask: find remaining non-instanced repeated geometry and convert the top candidates to
InstancedMesh with bit-identical transforms and zero visible quality change. Corpus state
read first — `PERF_CORPUS_CLOSURE_2026-09-26.md` + `PERF_MASTER_PLAN_2026-09-26.md` +
`PERF_METHODS_2026-09-26.md`; landed wave-1..3 work (common-rock variant pool, scenario-prop
merges, batched VFX/trails/parallax, progkeys) not re-done; `_opaqueBatchEnabled` stays false
(GATED, PQ-129.12); per-frame BatchedMesh repack stays rejected.

## 1. Research — where the draw-call wall is

A draw call's cost is the CPU→GPU state setup, not triangle count; hundreds of tiny submits
starve an otherwise-idle GPU (Velasquez, "Rendering 100k spheres": <https://velasquezdaniel.com/blog/rendering-100k-spheres-instantianing-and-draw-calls/>; WebGL fundamentals batching Q&A: <https://webglfundamentals.org/webgl/lessons/webgl-qna-drawing-many-different-models-in-a-single-draw-call.html>).
three.js contracts:

- **InstancedMesh** — "a large number of objects with the same geometry and material(s)
  but different world transformations … reduce the number of draw calls" — one
  `gl.drawElementsInstanced` per (geometry, material) pair
  (<https://threejs.org/docs/pages/InstancedMesh.html>; instancing example logs "GPU draw
  calls: 1" for N instances — `examples/webgl_instancing_performance.html`).
- **BatchedMesh** — same material but *different* geometries in one draw
  (<https://threejs.org/docs/pages/BatchedMesh.html>). Rules of thumb (three.js forum
  <https://discourse.threejs.org/t/81221>): one geometry → InstancedMesh; a few geometries ×
  many instances → one InstancedMesh each; many geometries → BatchedMesh.
- Bounds: instancing needs identical geometry *and* material — any per-instance variation
  that mutates either breaks the chunk. Transparent leaves need painter ordering, so
  instancing them reorders depth resolution — opaque-only.

That is exactly the boundary the pool already drew for common rocks; this lane extends the
same mechanism one step: key chunks by the shared (geometry, material) object pair instead
of only the five common-rock variants.

## 2. Census — what was still drawing one call per leaf

Probe route-end draw census (`.devshots/frame-solid/2026-09-29T04-11-16-292Z.json`,
headless SwiftShader — metric lines unreliable, census structural): 149 drawables,
21 instanced meshes / 538 instances, ~100.5 drawCalls/frame, 57 program switches.
Top un-instanced roots are authored ship hulls (`ship_drifter` 38 draws, `kestrel` 30,
`pelican` 15, `mule` 12) — single-owner geometry, nothing repeated → irreducible without
the rejected mixed-hull mega-batch.

The repeated-geometry residue was asteroids beyond untinted common rock:

| Candidate | Repeated? | Shared geo+mat? | Variation blocker | Verdict |
|---|---|---|---|---|
| Non-common bodies (metallic/crystalline/exotic ×5 displacement variants) | ~85% of deep-field rocks | YES — `asteroidLeafResources` cached pairs | none (same tumble transform writes) | **POOLED** |
| Ore veins (`ast:vein` capsule × 4 shared emissive colors) | 3–5 per veined rock | YES | none | **POOLED** |
| Crystal shards (`ast:shard` × shared emissive) | 6 per crystalline rock | YES | none | **POOLED** |
| Optic cell bodies (stone/metal/diamond/spent shared mats) | lattice ~40 cells | YES | kind swap → migrate bucket | **POOLED** |
| Prism inclusions (`optic:inclusion` × live/dead facet mats) | 5 per diamond/spent | YES | facet reskin → migrate | **POOLED** |
| Gas-cloud hulls | 15/110 tier-3 | yes, but `transparent: true` | painter order | excluded — stays direct |
| Unique authored hulls (drifter/kestrel/…) | singletons | no | — | irreducible |
| Scenario props / station modules / place meshes | merged by `staticBatches`/`scenarioPropBatching` already | — | — | already landed |
| VFX: sprites, trails, parallax, plumes | instanced pools already | — | — | already landed |

## 3. Implementation

`src/render/asteroidInstancePool.js` — generalized from "5 variant buckets" to variant
buckets **plus keyed buckets**: `keyedBucketFor(pool, geometry.uuid|material.uuid, leaf)`
creates a chunk bound to the exact shared pair the leaf already carries, so instance
transforms reproduce the original draws bit-for-bit (the same `leaf.matrixWorld` the
renderer would have drawn is the matrix uploaded). Stamped detail children
(`userData.asteroidInstanceDetail` — veins, shards, inclusions) adopt as per-leaf detail
records under `entityId#leafUuid`, kept out of `byEntity` so the classified dirty check
stays 1:1 with presentation rows. LOD-hidden details ride `poolLeafVisible` (hlod writes
the proxy for adopted leaves; submit gate skips them); release/clear/direct-fallback
restore real `visible` and delete the flag. Optic kind swaps (diamond↔spent, bare-stone
reskin) release + re-register through the `updateAsteroidMotion` syncOpticCellSkin seam,
migrating body and detail records to the swapped material's bucket. Same frustum/shadow
per-record culling, same dynamic-buffer retirement fallback (draws leaves directly, never
nothing), same warm path — `warmAsteroidInstanceKeys` publishes every possible keyed chunk
behind the shell, sized by the field census (`asteroidPoolCensusKeys`).

Files: `src/render/asteroidInstancePool.js` (keyed buckets + detail records + keyed warm +
generalized sync/clear/dispose/abandon), `src/render/visualFactory.js` (body stamp for all
asteroids, `asteroidInstanceDetail` on veins/shards, `asteroidPoolWarmResources`,
`asteroidPoolCensusKeys`), `src/render/opticCellPresentation.js` (inclusion stamp +
`opticCellPoolResources`), `src/render/hlod.js` (proxy visibility for adopted leaves),
`src/render/asteroidMotionPresentation.js` (reskin migration seam), `src/render/renderer.js`
(census counts keyed keys, keyed warm at opening + post-decode re-warm, abandon covers
keyed buckets), `scripts/probe-asteroid-pool-census.mjs` (deterministic A/B harness).

## 4. Verification

- Golden sim: `sha256 = cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`
  — identical to baseline (repeat 20, reload-at 600). Render-only change; sim untouched.
- Draw A/B (node census, tier-3 field 110 rocks + optic lattice 40 cells, all in frustum):
  **765 direct leaf draws → 54 draws** (39 live instanced chunks + 15 gas hulls that stay
  direct). 750 adopted leaves submit 750 instances — every record draws.
  Body buckets: 20 keyed (4 non-common types × 5 variants) + 5 variant chunks;
  details: 3 vein-color chunks, 1 shard, 2 facet (live/dead);
  optic: stone ×5 variants + metal + diamond + spent.
- Reskin migration A/B: 5 diamond→spent flips through `syncOpticCellSkin` moved
  `o:diamond` 20→15, `o:spent` 10→15, `o:facet:live` 100→75, `o:facet:dead` 50→75.
- Full-scene probe (`probe-frame-solid`): draw census frame is station-side (no asteroid
  roots in frame either run) — confounded by ship-mix delta (149→176 drawables,
  100.5→114.4 calls); instanced mesh count 21→25 with the keyed chunks live.
- Focused tests: `asteroid-instance-structure`, `asteroid-pool-admission`,
  `asteroid-pool-rekey`, `asteroid-pool-retired-owner`, `instance-chunk-submit-policy`,
  `hlod-projected-detail`, `asteroid-motion-presentation`, `optic-materials`,
  `optic-stamps`, `asteroid-field`, `render-pool-disposal` — all green.
  (`context-loss-nonasteroid-regression` fails on a missing `.campaign/` evidence file —
  preexisting, never in the repo.)

## 5. Verdict

KEEP — every opaque asteroid leaf now instanced; a 150-rock field slice pays 54 draw calls
instead of 765 (-93% of asteroid-attributable draws). Remaining non-instanced repeated
geometry is a single gas-hull family excluded by transparency ordering, and singleton
authored hulls already adjudicated irreducible. No quality change: pooled leaves draw
their own shared geometry/material pair with their own world matrix — the instanced pixel
is the same pixel.
