<!-- LIFETIME: CAMPAIGN -->
# E7 — STATUS

**Lane 3 RENDERER.** Updated 2026-11-06.

## State: diagnosis only — no E7 code has landed

E7 is sized XL. This session's work went to E6 (pop-in, blinking-class counters and the
admission brick), which the owner feels every few seconds. Nothing here claims otherwise.

## Measured baseline (this laptop, contended host)

`node scripts/probe-frame-solid.mjs --cpu-profile`, V8 sample profile over 160 flight frames
(`.devshots/frame-solid/2026-11-06T17-37-11-710Z.cpuprofile`):

| Function | Inclusive per frame |
|---|---|
| `drawPreparedFrame` | 15.75 ms |
| `prepareFrame` | 8.19 ms |
| `renderBufferDirect` | 7.47 ms |
| `setProgram` | 5.72 ms |
| `syncEntityViews` | 2.25 ms |
| `getParameters` | 0.27 ms |
| `getProgramCacheKey` | 0.07 ms |

Draw census: 1087 drawables, 150 programs, 152 draw calls and 86.7 program switches per frame.

**Bars not met:** render JS ≤ 4 ms (measured ~24 ms/frame of frame work on this host), allocation
≤ 100 KB/frame (not measured — heap sampling was not run), main-thread task > 50 ms (not measured;
the host was saturated at 834 of 1446 frames over 50 ms).

## What the measurement changed

The handoff expected the win from memoising `getProgramCacheKey`. On this build that path is
already cheap (0.27 ms `getParameters` + 0.07 ms `getProgramCacheKey` per frame) because
`programCanon.js` collapsed the authored PBR family. The cost is **switching and binding** —
`setProgram` 5.72 ms — so the measured road is fewer draws and fewer switches (instancing/batching
as the default for same-family ships), then the retained render list, then the module split.

## Next session, in order

1. Same-family instancing/batching by default (the BatchedMesh path exists and is off); re-measure
   `setProgram` and `drawCallsPerFrame` in one session.
2. Retained render list: `prepareFrame` stops rediscovering unchanged rows (`syncEntityViews` 2.25 ms).
3. Allocation probe per frame (still owed).
4. `renderer.js` split along existing seams (M13), bodies moved unchanged with digest checks.
5. WebGPU spike, time-boxed, kept only on a measured laptop A/B.
