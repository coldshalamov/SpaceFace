<!-- LIFETIME: CAMPAIGN -->
# E7 — The renderer that knows its world: diagnosis

**Campaign:** E7 (Lane 3, RENDERER). Written before any edit, 2026-11-06.
**Measured on:** this laptop, headed Chrome, Intel integrated ANGLE/D3D11, shared checkout
(other agents running). Counter evidence from `scripts/probe-frame-solid.mjs`; render-JS timing
from an in-page wrapper around `renderFrame` (see §2).

## 1. What the player sees

The picture is right but the machine spends its frame budget rediscovering it: a busy flight
draws ~150 calls per frame through ~150 programs with ~87 program switches, and the main thread
allocates ~65 MB/s while doing it (`PERFORMANCE_HANDOFF_2026-11-05.md` §pop-in + churn). On the
Intel iGPU that shows up as GPU p50 23.7 ms in a busy Crucible round and a main thread with no
headroom left for anything else.

## 2. The measured cause chain

```
draw census (one frame near the station, after E6):
  drawables 1087, instancedMeshes 38, instances 770
  programs 150, geometries 2573, textures 125
gpu submission (flight, 1462 frames):
  drawCallsPerFrame 152.0, drawInstancedCallsPerFrame 31.2
  programSwitchesPerFrame 86.7, textureBindsPerFrame 227.4
  bufferFullUploadsPerFrame 5.0, bufferPartialUploadsPerFrame 57.0
  bufferUploadBytesPerFrame 113,602
```

Three costs, in order of certainty:

1. **Per-draw program resolution.** `WebGLRenderer.setProgram` calls
   `getProgram(material, scene, object)` → `getProgramCacheKey(parameters)` → `getParameters(...)`
   on every draw, and `getParameters` allocates its parameter object each time. With 152 draws and
   87 switches per frame this is the largest steady-state allocator in the renderer
   (`PERFORMANCE_HANDOFF` §Still open: "getProgramCacheKey memo — largest steady-state allocator").
   The program *count* has already been reduced by `programCanon.js` (one authored PBR family);
   what remains is the per-draw cost of asking three which program it is.

2. **Drawables are rediscovered every frame.** `syncEntityViews` walks the presentation world,
   classifies each row, applies visibility, and only then does the draw pass walk the scene again.
   `renderer.js` is 36,741 lines with a 10,853-line `init()`; the retained render list exists in
   pieces (`presentationWorld.js`, `persistentSubmitLanes.js`, `rigidOpaqueBatch.js`) but is not the
   default path for same-family ships.

3. **The monolith.** One file owns frame sync, shadows, LOD, residency, post and lifecycle. Every
   change risks a foreign hunk (this session had to preserve Codex perf's ship-LOD callsite), and
   review is expensive enough that small wins are not attempted.

## 3. Is the design the bottleneck?

**Yes for the per-draw cost, not yet for the architecture.** E7's finish line is render JS ≤ 4 ms
and ≤ 100 KB allocation per frame. The cheapest road to that bar is not the monolith split — it is
removing the per-draw allocation and switch cost first, then letting the retained list replace the
per-frame rediscovery. The monolith split is real work but it buys reviewability, not milliseconds;
it should follow the measured win, not lead it.

Replacing three's renderer with WebGPU is the expensive question. The spike is scoped in this
campaign and stays a spike: three's `WebGPURenderer` removes `setProgram` entirely (pipeline
caching), but it changes the material model for every authored finish in the game, and the laptop
A/B is the only thing that can justify that. It is not started in this session.

## 4. The chosen road

1. **Measure what the bar names.** Wrap `renderFrame` in-page over a settled flight sample and
   record p50/p95 render JS; record heap delta per frame as the allocation proxy. Report the host
   load with it so the number is honest.
2. **Memoise the program key.** Vendor three's `WebGLRenderer` program resolution behind one
   memo keyed by the exact (material, object) drawing pair, invalidated by `material.version` and
   the instancing flags — the same key three already computes, cached instead of rebuilt. This is
   the allocation win and it is independent of the architecture.
3. **Make the retained list the default for same-family ships.** `rigidOpaqueBatch.js` already
   exists and is default-on for the retained rigid controller; the remaining work is admitting
   same-family hulls by default rather than opt-in, with the existing visual-identity guarantees.
4. **Then split `renderer.js`** along the seams the file already has (entity sync, shadows/LOD,
   residency/prewarm, post stage, lifecycle), moving bodies unchanged with the existing digest
   checks — the M13 packet in `LANE_1_MACHINE_AND_PICTURE.md`.
5. **WebGPU spike, time-boxed, kept only on a measured laptop A/B.**

**Not done in this session, stated plainly:** E7 is sized XL and the session's work went to E6's
pop-in and brick classes, which the owner feels every few seconds. The E7 diagnosis above is the
starting point for the next session; the measurement harness in (1) is the first deliverable.
