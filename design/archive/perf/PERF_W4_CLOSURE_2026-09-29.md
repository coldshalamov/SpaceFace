# Wave-4 Closure Ledger — 2026-09-29

Continuation of `PERF_CORPUS_CLOSURE_2026-09-26.md`. Wave 4 was the external-science
frontier plus the owner's exhaustive lane list (geometry/draw, sim/CPU, memory/loading,
shading/post, spatial/query, meta). Every listed lane ran a child session with the same
contract: zero visible quality change, sim golden `cc9419388b2608d697345bb94a786c4120cfc21e04365f437e15c4c4c0a4e885`
bit-identical (720-tick 47a ×20, reload@600), A/B evidence on this box, KEEP or
REVERT/DOCUMENTED with citations. Per-lane reports live beside this file (`w4-*-REPORT.md`).

## Verdicts — the owner-listed lanes

| Lane | Verdict | Evidence |
|---|---|---|
| Meshlet/clustered LOD | DOCUMENTED (REVERT) | Whole-object LOD already suffices; meshlet re-chunking can't beat authored `lod2` culling without quality loss. `w4-meshlets-REPORT.md` |
| Frame-graph/pass scheduler | KEEP | 18 dead clears/frame eliminated on the render-graph route. `aa6e6be97`, `w4-framegraph-REPORT.md` |
| Portals/PVS interiors | DOCUMENTED | All interiors are single-room — nothing to portal. Adjacent win landed: authored-stage `shadow.autoUpdate` latch. `87ee6140d`, `w4-portals-REPORT.md` |
| Vertex-cache reorder + quantization | DOCUMENTED (own PR #176) | meshoptimizer post-transform already applied to all 276 parts / 274 packages; only a package repin remained. |
| Instancing expansion | KEEP | Asteroid pool keyed by exact (geometry,material): 765 → 54 leaf draws. `5da962d4e`, `PERF_W4_INSTANCING_2026-09-29.md` |
| Depth-prepass/early-Z | KEEP (own PR #177) | Overdraw measured first (D 3.3–6.2 layers/px, S 1.9–2.4 at station poses) → partial z-prepass on 41 bulky station occluders; wasted shaded layers −50…−98%, 0-px render diff, `depthWrite` shells share source buffers. `w4-depthprepass-REPORT.md` |
| Rapier tuning | KEEP | FFI elision in island/sleep bookkeeping: isSleeping 44,820→0 calls, wakeUp 12,288→3, resetForces/Torques 12,285→4,314, timestep 720→1. `9fac5883b`, `w4-rapier-REPORT.md` |
| Catch-up batching | DOCUMENTED | Per-tick semantics forbid fusing; virtualized domains already batch. Probe: `scripts/probe-catchup-cost.mjs`. `w4-catchup-REPORT.md` |
| V8 deopt audit | KEEP (own PR #175) | `?? ''` megamorphic sentinel in `classifyWorld` deopt trap fixed. |
| Event dispatch interning | DOCUMENTED | Bus is 0.136% self-time — interning can't move the needle. `w4-eventintern-REPORT.md` |
| Heap-residency audit | KEEP | Per-craft-tick literal allocations → module scratches in `flightDynamics` (11→3 allocs). `2cf61d33e`, `w4-heapaudit-REPORT.md` |
| Worker-side sim partition | DOCUMENTED | Answers PQ-067: no kernel clears cost×isolation. `w4-workersim-REPORT.md` |
| Bake pipelines | KEEP | Foundry IBL decode+transforms baked to Float32 artifact (sha256-verified, byte-identical pixels): ~114→50 ms boot decode. `77380b2d2`, `w4-bakepipes-REPORT.md` |
| Startup/parse time | KEEP | V8 compile cache armed pre-module-graph: compile 165.5→48.4 ms (−71%), warm boot −14%, golden identical on node20+24. `b38bc77e1` cherry-pick |
| Save/load streaming | KEEP | Redundant stringify+checksum passes elided from pre-load rollback capture: −8.9 ms/save+reload. `0184d74f4` cherry-pick, `w4-saveload-REPORT.md` |
| Shader surgery | KEEP | Uniform-gated livery/albedo chain in `illustratedSurface.js` patched shaders: ~10 ALU + smoothstep + mix saved per fragment on non-liveried pixels; screenshots byte-identical. `3549c4e37` cherry-pick |
| PostFX consolidation | KEEP | Pass cardinality already minimal (3 quads/3 RTs vs stock ~13); landed the remaining legal win: bloom pyramid alloc/resize gated on disable flag — 9→5 live RTs with bloom off, ~2.3 MB GPU mem freed at 720p. `e6340bcdc`, `w4-postfx-REPORT.md` |
| Texture atlas/batching | DOCUMENTED | 1.08 binds/draw post-dedupe, ~26 unique programs/frame = structural floor; only residue on a documented Intel-TDR-fragile path. `4aab9a5f1`, `w4-texatlas-REPORT.md` + `scratch-w4-texatlas-audit.mjs` |
| Quality governor (rate-scaling) | KEEP | Asteroid pool shadow latch scoped to ortho-intersecting uploads: view-only rock churn no longer repaints the 1024² shadow map (dirty flag 100%→0% of upload frames). Ported onto keyed-pool structure. `58288a456` → `a8c2ddd6e` |
| three-mesh-bvh | DOCUMENTED | Zero mesh raycasts exist; all spatial queries on in-repo SpatialHash (121,905 queries = 1.82% wall); camera clearance already `MeshBVH.shapecast`. `w4-bvh-REPORT.md` |
| Transparent-sort + A2C | DOCUMENTED | Sort p50 5 µs (~0.03% of frame); no binary-alpha surfaces to convert; latent transmission-pass triggers named for follow-up. `e0c6c82` → `e8d311db4`, `scripts/probe-transparent-sort.mjs` |
| Literature sweep | KEEP | 18 candidates adjudicated (SIGGRAPH 2025 AoRTR, three.js tracker, Electron docs); 17 rejected-with-reason; landed V8 nursery pin `min=max-semi-space=64MB`: scavenges 20→2 on identical 720k-object burst. `9547c970e` + `98fd2f0cb`, `w4-litsweep-REPORT.md` |
| Electron IPC/context-isolation | DOCUMENTED | 4 organic IPC crossings/session, 0.29 ms total handler time; webPreferences already optimal. `4549413e0` → `d6db21f6d`, `w4-electron-ipc-REPORT.md` |

## Verdicts — wave-4 frontier lanes (earlier batch)

| Lane | Verdict | Evidence |
|---|---|---|
| SoA entity storage | KEEP | `poseTable` SoA layout for the classify discovery-authority scan. `0edf3b7e4` |
| Temporal amortization | KEEP | Observational proximity scans amortized to 30 Hz: −5.4% world.update. `25e521199`, `W4_TEMPORAL_AMORTIZATION_2026-09-28.md` |
| Culled-root matrix freeze | KEEP | `matrixAutoUpdate` frozen on culled entity roots. `7d43925aa` |
| WASM hot kernel | DOCUMENTED | Structural fix kept instead: economy price-history kernel −83% self-time; wasm port measured below the bar on an init-only path (~0.6 ms). `4bbd0bbab`, `W4_WASM_KERNEL_2026-09-28.md` |
| Job scheduler | KEEP (PR #173 merged) | Admission slice pacing — the one real defect the lane found. |
| GPU-driven culling | DOCUMENTED | WebGL2 has no draw-indirect; occlusion query never merged upstream. |
| Imposters | DOCUMENTED | Authored `lod2` is the shipped imposter; quad/octahedral tier inadmissible under quality gate. `w4-imposters-REPORT.md` |
| Predictive prefetch | KEEP | Kinematics-driven sector decode warm (route/autopilot/waypoint/gate-approach). `3fcfc65aa`, `w4-predict-REPORT.md` |
| Virtual texturing | DOCUMENTED | Texture residency pipeline already minimal; census tool added (`scripts/census-texture-residency.mjs`). `w4-vtex-REPORT.md` |

## Bonus fixes landed during integration

- `check-ui-budgets` root cause found by the depth-prepass lane: `uiSourceDigest` hashed
  CRLF-smudged files, making any Windows-shot baseline unmatchable on Linux CI —
  canonicalization cherry-picked (`239f79740`), baseline re-shot headed at the merged tip
  (`cf597a565`). This was the recurring static(2) red across the whole campaign.
- `check-input-modalities` root cause: upstream `4875ab436` helm-owner rework gated
  boost/brake by movement ownership — a boot-claimed pad's boost was unreachable and a
  touch boost press could steal the helm. Fix cherry-picked (`ab76103a9`); ownership now
  gates only the drive vector.

## Remaining frontier

- Owner-GPU gated items unchanged from `PERF_CORPUS_CLOSURE_2026-09-26.md` §8: the
  merged `scripts/gpu-evidence-run.mjs` on real hardware produces the deciding evidence.
- `probe-ship-visual-stability` / `check-confirm-dialog` / `check-sector-arrival-admission`
  browser-check reds verified environment-side (SwiftShader admission window, X-server
  launch failures, master-identical timeouts).
- `depth-program-k1` tactical tests (`extend` vs `breakaway`, pitborn egress) fail on
  clean `origin/master` — upstream PB-TAC-C suite regression, outside this campaign's scope.
- `check-depth-program-k1-behavior` fails byte-identically on clean master tip:
  `faction_fulfillment must produce a canonical drive-disabled transition` — upstream.
- `check-sg06-production-ports` fails identically on clean master tip: PB-TAC-C
  `c19e77b9c` added `aimProjectileSpeed` to `aiPorts` `sensorSelf` without updating the
  SG-06 whitelist — upstream ratchet bookkeeping for that wave's author.
