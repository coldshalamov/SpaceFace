# DONE — hitch-opening-drain

## Summary

Soft-GPU opening cook no longer polls planWait/drainWait. Focused tests **4/4**.
Crucible seed 4242 on quiet soft-GPU VM.

## Before / after (quiet soft-GPU, crucible seed 4242)

| Metric | Before (master `59df2a08e`) | After (scratch `d6a1c419e`) | Notes |
|---|---|---|---|
| `wait.prepareOpeningGpuResources` | **874 ms** | **67 ms** | **win (−92%)** |
| `opening.planWait` | 818 ms resolved → plan incomplete | **0 ms skipped** (`soft-gpu-self-build`) | **win** |
| `opening.drainWait` | (not reached) | skipped `soft-gpu-no-await` when reached | defensive |
| soft-GPU residency budget | 5000 ms | **750 ms** | defensive when plan completes |
| launch to flight | 13.1 s | **11.7 s** | **win (−1.4 s)** |
| hitch callbacks | 65 / 342 | **45 / 362** | **win** |
| game speed | 56.9 % | **62.2 %** | **win** |
| worst frame | 783 ms | 800 ms | flat / noise — soft-GPU |
| fps mean | ignore | ignore | soft-GPU |

GPU tier: **software** (SwiftShader). Owner iGPU fps not claimed.

## Evidence

- Patches: `patches/0001-perf-opening-soft-GPU-skip-planWait-drainWait-tighte.patch`
- Scratch: `vm-work/hitch-opening-drain` @ `d6a1c419e96bf5e6422cbdada63615816e60e9b9`
- Focused tests: `focused-tests.log`
- Raw probes: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/opening-drain-*.log`

## Risks

- Soft-GPU receipt may freeze before the concurrent exact-plan drain finishes;
  mid-flight admission + first-draw fail-open cover the gap (same policy as
  fire-and-forget `waitForOpeningGpuResources`).
- When the self-built / published plan is incomplete, cook still early-exits
  (observed before and after); the win is not waiting 0.8s+ first.
- Hardware + KHR_parallel_shader_compile path unchanged (`shouldAwaitOpeningGpuCook`).

## Next pole

- Opening plan completeness on soft-GPU (why `opening.plan` still skips incomplete).
- Mid-flight novelty (wasp/ASHLINE) via shader-admission-slice import + measure.
- `alloc-journal-churn` (cross-tick coalesce) in parallel outbox.
