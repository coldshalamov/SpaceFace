# DONE — opening-plan-complete

## Summary

Awaiting-authored resolving markers no longer poison the opening submission
plan. Soft-GPU cook now completes residency + receipt instead of skipping
`opening.plan` incomplete. Focused tests **24/24** (3 new + 21 opening-submission-plan).

## Before / after (quiet soft-GPU, crucible seed 4242)

| Metric | Before (master `59df2a08e`) | After (scratch `f69e5c849`) | Notes |
|---|---|---|---|
| `opening.plan` | **skipped** `opening-plan-incomplete` | **completes** → residency/post/receipt | **win (hole closed)** |
| `wait.prepareOpeningGpuResources` | 874 ms (early exit) | 3003 ms (full cook; planWait 2970 ms) | expected — real admission now runs |
| hitch callbacks | 65 / 342 | **51 / 342** | **win** |
| worst frame | 783 ms | **267 ms** | **win** |
| game speed | 56.9 % | **58.2 %** | mild win |
| novelty NOVEL | 15 | **10** | mild win |
| launch to flight | 13.1 s | 14.6 s | +1.5 s from full cook (pair with drain) |
| fps mean | ignore | ignore | soft-GPU |

GPU tier: **software** (SwiftShader). Owner iGPU fps not claimed.

## Evidence

- Patches: `patches/0001-perf-opening-skip-awaiting-authored-markers-so-soft-.patch`
- Scratch: `vm-work/opening-plan-complete` @ `f69e5c84969379ededf6bca22ae6cf720333a475`
- Focused tests: `focused-tests.log`
- Raw probes: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/opening-plan-*.log`

## Risks

- Ships still on resolving markers are deferred from the opening census by design;
  first picture must not depend on temporary markers. Authored GLB admission remains
  mid-flight (see shader-admission-slice).
- Bare-master planWait can still dominate once the plan completes — import
  hitch-opening-drain to skip that poll on soft-GPU.

## Next poles

- Pair measure: opening-plan-complete + hitch-opening-drain (self-build complete plan).
- Mid-flight novelty via shader-admission-slice crucible A/B.
- `radar.draw` / `classifyWorld` from cpu-profile-flight.
