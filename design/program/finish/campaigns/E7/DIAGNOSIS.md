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
CPU profile, 160 flight frames (V8 sampling, contended host):
  drawPreparedFrame  15.75 ms/frame inclusive
  prepareFrame        8.19 ms/frame inclusive
  syncEntityViews     2.25 ms/frame inclusive
  renderBufferDirect  7.47 ms/frame inclusive
  setProgram          5.72 ms/frame inclusive
  getParameters       0.27 ms/frame
  getProgramCacheKey  0.07 ms/frame
  idle is the largest bucket; frames averaged ~100 ms on this host
```

Three costs, in order of measurement:

1. **`setProgram` is the draw-path cost, at 5.72 ms/frame.** It is uniform uploads, texture/state
   binding and program switching across 152 draws and 87 switches. The per-draw *key* work that the
   handoff blamed is already small on this build — `getProgramCacheKey` 0.07 ms and `getParameters`
   0.27 ms per frame, because `programCanon.js` collapsed the authored PBR family and the program
   count sits near 150. The remaining cost is switching and binding, not key construction, so
   memoising the key would buy ~0.3 ms. **The measured road is fewer draws and fewer switches**
   (instancing/batching as the default for same-family ships), not a three.js patch.

2. **The frame's own bookkeeping is 8.19 ms/frame.** `prepareFrame` (visibility, activity frame,
   shadow/LOD policy) plus `syncEntityViews` 2.25 ms of it. This is the per-frame rediscovery the
   retained render list replaces.

3. **The monolith.** One file owns frame sync, shadows, LOD, residency, post and lifecycle —
   36,741 lines, a 10,853-line `init()`. Every change risks a foreign hunk (this session had to
   preserve Codex perf's ship-LOD callsite), and review is expensive enough that small wins are
   not attempted.

## 3. Is the design the bottleneck?

**Yes for the per-draw cost, not yet for the architecture.** E7's finish line is render JS ≤ 4 ms
and ≤ 100 KB allocation per frame. Measured today: `prepareFrame` 8.19 ms + `drawPreparedFrame`
15.75 ms per frame, so the bar is roughly 6× away and the biggest single line is `setProgram`
(5.72 ms). The cheapest road is not the monolith split and not a three.js program-key patch (that
would buy ~0.3 ms): it is **fewer draws and fewer program switches** — instancing/batching as the
default for same-family ships — then the retained list replacing the per-frame rediscovery. The
monolith split is real work but it buys reviewability, not milliseconds; it should follow the
measured win, not lead it.

Replacing three's renderer with WebGPU is the expensive question. The spike is scoped in this
campaign and stays a spike: three's `WebGPURenderer` removes `setProgram` entirely (pipeline
caching), which is exactly the line that costs 5.72 ms today, but it changes the material model
for every authored finish in the game. The laptop A/B is the only thing that can justify that.
It is not started in this session.

## 4. The chosen road

1. **Measure what the bar names.** Done for this memo: a V8 profile over 160 flight frames gives
   `prepareFrame` 8.19 ms and `drawPreparedFrame` 15.75 ms per frame, with `setProgram` 5.72 ms and
   `syncEntityViews` 2.25 ms. `scripts/probe-frame-solid.mjs --cpu-profile` reproduces it.
2. **Cut draws and switches before anything else.** Instancing/batching as the default for
   same-family ships (the BatchedMesh path exists and is off), then re-measure `setProgram` and
   `drawCallsPerFrame`. This is the measured road to the 4 ms bar; the program-key memo is measured
   at 0.07 ms and is not worth a vendor patch on this build.
3. **Make the retained list the default.** `rigidOpaqueBatch.js` is default-on for the retained
   rigid controller; the remaining work is admitting same-family hulls by default rather than
   opt-in, and letting `prepareFrame` stop rediscovering what did not change.
4. **Then split `renderer.js`** along the seams the file already has (entity sync, shadows/LOD,
   residency/prewarm, post stage, lifecycle), moving bodies unchanged with the existing digest
   checks — the M13 packet in `LANE_1_MACHINE_AND_PICTURE.md`.
5. **WebGPU spike, time-boxed, kept only on a measured laptop A/B.**

**Not done in this session, stated plainly:** E7 is sized XL and the session's work went to E6's
pop-in and brick classes, which the owner feels every few seconds. The numbers above are the
starting line for the next session; no E7 code has landed.
