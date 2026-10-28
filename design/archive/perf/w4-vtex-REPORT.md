# w4-vtex — Texture Residency / Virtual-Texturing Lane Report

**Lane**: texture residency / virtual texturing — partial mipmap residency, texture streaming granularity.
**Branch**: `devin/1790650124-w4-vtex` (off `origin/master` @ `9a30ffc0`).
**Verdict**: **DOCUMENTED-MINIMAL — no code change.** The texture pipeline is already at the minimum expressible residency granularity for this renderer (whole-package), every remaining lever either provably cannot shrink the live working set further without a vendored-three patch + predictive scheduler, or cannot satisfy the picture contract (zero visible quality change). Evidence below.

---

## 1. Research (techniques + applicability)

| Technique | What it is | WebGL2/three r184 availability |
| --- | --- | --- |
| **Virtual texturing** (id Tech5 "MegaTexture", Mittring *Advanced Virtual Texturing*, SIGGRAPH 2008) | Sparse page-table of tiles; shader resolves which physical pages to sample; pages streamed on demand | **N/A.** Needs sparse/tiled texture objects (D3D12 tiled resources / `ARB_sparse_texture` / Vulkan sparse binding). WebGL exposes no sparse texture extension — the sampling-side page table has no backing store to page into. |
| **Partial mip-chain residency** (TEXTURE_BASE_LEVEL streaming) | Keep mips `k..M` resident, stream mip0..k-1 on approach; `TEXTURE_BASE_LEVEL`/`TEXTURE_MAX_LEVEL` (GL enums `0x813C`/`0x813D` in the WebGL2 IDL) bound which levels may be sampled — WebGL2 spec §3.8.13, Khronos conformance `textures/misc/texture-size-limit`. | **Blocked by allocator, not by GL.** WebGL2 *has* the enums, but three r184 uploads compressed textures via `texStorage2D(TEXTURE_2D, levels, internalformat, w0, h0)` (`vendor/three.module.js` uploadTexture): **immutable storage — all `levels` allocated in one shot, level payloads fixed at `compressedTexSubImage2D` time**. `TEXTURE_BASE_LEVEL` on an immutable texture can only *mask* levels, not free their storage. Real residency control needs mutable `texImage2D` per level — a vendored-three patch. |
| **KTX2 mip-level file streaming** | KTX 2.0 stores a Level Index table (`byteOffset`/`byteLength` per level) and orders payload smallest→largest level; spec §3.7: "a KTX file does not need to contain a complete mipmap pyramid" — designed for progressive fetch (stream tail first, fetch mip0 later). | File format supports it; loader/renderer do not use it. three `KTX2Loader._createTextureFrom` transcodes **all** `levelCount` levels into `texture.mipmaps` eagerly (`vendor/addons/loaders/KTX2Loader.js`). Upstream `KTX2Loader` gained multi-level mipmap return (three PR #25871) but not level-range requests. |
| **Mip-tail truncation** (ship fewer small levels) | Drop last 1–2 levels (1–2% of chain bytes) | Not expressible under `texStorage2D` (level count is fixed by `texture.mipmaps.length`); savings negligible anyway. Rejected. |
| **GPU texture memory budgeting** | Cap resident bytes; evict LRU/radius under pressure | **Already shipped**: `assetResidency.js` `textureMemoryAccounting` + `releaseUnreferencedCacheOwnersPass` (maxCacheOnlyBytes budget) + `reconcileMeshResidency` radius eviction (`renderer.js` ~13153) + exactly-once disposes verified in the texevict lane (PERF-46). |

## 2. Assessment vs landed perf work

Already landed (see PERF_CORPUS_CLOSURE_2026-09-26): `textures` lane `0f16bf3ad` (per-renderer upload-version stamps → no re-upload on re-admit); `memoff` `159f5440` (CPU mirrors `texture.mipmaps`/`source.data` freed post-upload, rehydrate on context restore); `decode` worker pool; **texevict PERF-46 REJECTED-with-plateau-evidence** (28.5 MiB live → 7.5 MiB post-rotate floor; 144 exactly-once disposes). This lane audits what remains *below* package granularity.

### Audit A — asset census (`scripts/census-texture-residency.mjs`, every `assets/**/render.glb`, KTX2 headers + glTF samplers)

- **274 packages, 1391 textures — 100% KTX2, 0 non-KTX2 embedded** (rock surfaces/sky plates/UI live outside packages; below).
- **0 textures carry a mip chain on a non-mipmap sampler** (would be pure GPU waste). All 1391 samplers: `LINEAR_MIPMAP_LINEAR` + `REPEAT` — trilinear is genuinely required: the camera is a *zooming* top-down view, so every mesh crosses its full LOD range.
- Fleet-wide GPU bytes *if everything were resident simultaneously*: **1179.78 MiB @ 16 bpb (BC7-class) / 589.89 MiB @ 8 bpb (BC1-class)** — never realized; bounded by eviction (below).
- **mip0 = 75.0% of chain bytes (884.81 / 1179.78 MiB)** — the theoretical max a partial-mip scheme could hold back.
- Largest packages: works-derrick/rover 20 MiB, inclusion-kit 16 MiB, fabricator 12 MiB (9×2048² atlases); hull-* families 5.42 MiB each.

### Audit B — live working set (`scripts/probe-renderer-info.mjs`, seed 47 flight, software GL)

- `renderer.info.memory.textures` = **130 active GPU texture objects** mid-flight (1114 frames sampled, draw calls p50=65/p95=97 — inside budget).
- Consistent with texevict plateau: live texture set floors at ~7.5–28.5 MiB. 130 objects × typical package texture ≈ 1–4 MiB ⇒ tens of MiB, not the GiB-scale fleet total — residency is already bounded.
- Always-resident non-package classes are bounded and upload-gated: deep-sky plates ≤2 × ~11.2 MiB RGBA8+mips (`deepSkyPlates.js`), 3×1024² shared rock maps ≈16 MiB (`rockSurfaceLibrary.js`), planet bakes 512² + background canvas LRU (`spaceBackground.js`), UI/probe DataTextures (1×1–512×192).

### Why no leaf survives the picture contract

1. **Partial-mip residency needs mutable storage + predictive scheduling.** Under `texStorage2D` the only lever is masking (`BASE_LEVEL`), which saves zero bytes. Doing it for real means: patch vendored three to `texImage2D` compressed paths, track per-level upload state, predict approach-rate to level-up before mip0 is sampled, and keep/re-decode CPU payloads (memoff currently *frees* them — the two systems conflict: partial-mip residency requires retaining the CPU mirror it just deleted). Effort ≥ L; payoff ≤ ~20 MiB against an already-floored ~28 MiB working set; a prediction miss = visible LOD pop = **violates zero-quality-change**. Not provably imperceptible.
2. **Whole-mesh granularity is already implemented and verified** (evict radius + prefetch hysteresis + exactly-once dispose). The next smaller unit that *is* expressible — per texture inside a package — gains nothing: a package's textures share the mesh's residency fate (all sampled or none).
3. **No unneeded chains exist to delete** (census: 0 non-mip samplers; 0 un-mipped formats where mips are required).
4. **CPU side is already handled** by memoff; extending detach to the ~38 MiB of always-resident ImageBitmaps (rock PNGs + sky plates) saves JS-side memory only, needs a new rehydrate path for context restore, and is out of this lane's GPU-residency scope — flagged for a future CPU-memory lane.
5. **KTX2-ing the 3 rock PNGs / sky plates** would save ~12–20 MiB always-resident GPU bytes but ETC1S/UASTC transcoding is lossy → needs the bake lane's quality-diff gate, not a provably-imperceptible leaf.

## 3. Implementation

**None — by design.** Candidate leaves evaluated and rejected above. Deliverable is this document plus the promoted census tool `scripts/census-texture-residency.mjs` (evidence reproducibility: `node scripts/census-texture-residency.mjs`).

## 4. Verification

- **Golden sim**: `node scripts/sf-sim.mjs run 47a --seed 47 --ticks 720 --inputs test/47a.inputs.json --expect test/47a.telemetry.expected.json --hash --repeat 20 --reload-at 600` → **PASS**, `sha256 = cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885` == `acceptanceCriteria.authoritativeHash` in the expected envelope, 20/20 repeats + reload@600 identical. (The `f3583c50` in the wave-4 brief is a stale doc-era hash; the minted envelope has since moved to `cc941938`.)
- **Probe A/B**: n/a — no code change to A/B. Baseline probe run for the record: `probe-renderer-info.mjs --duration=20` → 130 active textures, draws p50=65/p95=97 (PASS), tris p95=218,753 (PASS).
- **Texture memory audit**: census numbers in §2-A; live `renderer.info` in §2-B.
- `node --check` on the census script; no src modules touched.

## 5. Residual flags for the backlog

- **Partial-mip residency** remains the only untapped GPU lever (~75% of chain bytes theoretical). Prereqs to make it a real leaf: vendored-three mutable-storage patch, per-level residency tracking, approach-rate predictor, memoff reconciliation (retain or re-decode CPU mips). Re-estimate only if the live texture working set is ever measured binding against the GPU budget — current plateau says it isn't.
- **Rock-surface / sky-plate KTX2 bake** (~12–20 MiB always-resident): route through the bake lane with the frame-diff quality gate.
- **ImageBitmap CPU mirrors for always-resident PNGs** (~38 MiB JS-side): candidate for the next memoff-class lane; needs context-restore rehydrate for non-package textures.

## Sources

- Khronos KTX 2.0 spec — levelCount / Level Index / partial pyramids: https://github.khronos.org/KTX-Specification/ktxspec.v2.html (§3.7, §3.9.7)
- WebGL 2.0 spec — TEXTURE_BASE_LEVEL/MAX_LEVEL enums, `texStorage2D` immutable storage: https://registry.khronos.org/webgl/specs/latest/2.0/ (§3.8)
- OpenGL ES 3.0 ref — immutable vs mutable texture storage semantics: https://registry.khronos.org/OpenGL-Refpages/es3.0/html/glTexStorage2D.xhtml
- Mittring, "Advanced Virtual Texturing" (SIGGRAPH 2008 Advances in Real-Time Rendering course) — sparse page-table vtex model.
- three.js PR #25871 — KTX2Loader multi-level mipmap support (all levels eager, no range fetch): https://github.com/mrdoob/three.js/pull/25871
- Vendored evidence: `vendor/three.module.js` uploadTexture `texStorage2D`; `vendor/addons/loaders/KTX2Loader.js` `_createTextureFrom` full-chain transcode.
