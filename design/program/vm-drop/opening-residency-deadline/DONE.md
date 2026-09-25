# DONE — opening-residency-deadline

## Summary

Soft-GPU opening residency now stops inside the uploader at the 750 ms deadline
and still freezes the opening receipt. Focused tests **3/3** (+ drain/plan tests green on stack).

## Before / after (stack: plan-complete + drain, crucible seed 4242)

| Metric | Before (combo, no deadline) | After (`9fdb832df`) | Notes |
|---|---|---|---|
| `opening.residency` | 1254 ms resolved, textures=68 | **880 ms timeout** partial textures=4 | budget bites |
| `wait.prepareOpeningGpuResources` | 1390 ms | **974 ms** | **win** |
| hitch callbacks | 64 / 317 | **44 / 372** | **win** |
| worst frame | 317 ms | **283 ms** | mild win |
| game speed | 47.8 % | **57.0 %** | **win** |
| novelty NOVEL | 9 | 9 | flat |
| receipt | yes | **yes** (partial continue) | hole stays closed |
| launch to flight | 11.7 s | 13.4 s | mild +1.7 s (deferred uploads) |

GPU tier: **software** (SwiftShader). Owner iGPU fps not claimed.

## Evidence

- Patches: `patches/0001-perf-opening-soft-GPU-residency-deadlineMs-continue-.patch`
- Scratch: `vm-work/opening-residency-deadline` @ `9fdb832df61bc0e2f4f173d3b5eb3a086829d410`
- Before probe: combo without deadline (`artifacts/before-crucible.log`)
- After probe: `artifacts/after-crucible.log`

## Risks

- Only ~4 textures land in the bounded slice on soft-GPU; mid-flight admission
  covers the rest (same fire-and-forget policy as drain).
- Depends on opening-plan-complete (otherwise residency never reached).

## Next poles

- Mid-flight novelty (re-express thinner admission without #24 hitch regress).
- `radar.draw` / `classifyWorld` portable CPU cuts.
- Owner-GPU verify of opening receipt + partial residency.
