# DONE — hitch-shed-floor

## Summary

`HITCH_FRAME_TICKS` **4.5 → 6.5**. Soft-GPU sustained ~10–12 fps is a slow frame rate, not
a hitch cascade. Focused tests **37/37** pass.

## Before / after (quiet soft-GPU VM, crucible seed 4242, 30 s, settle 0)

| Metric | Before (master `0612d2b9f`) | After (scratch `39861b3b5`) | Notes |
|---|---|---|---|
| hitch callbacks | **232 / 347** | **49 / 369** | **win** |
| game speed vs real time | **40.2 %** | **63.2 %** | **win (+23 pp)** |
| worst frame | 1250 ms | 1067 ms | mild win / noise |
| p99 | 333.3 ms | 166.6 ms | win |
| frames that shed sim | 179 | 192 | expected — more frames take full catch-up (may still shed 1 tick at ~12 fps) |
| typical sim / present | 7.1 / 11.6 ms | 9.7 / 10.8 ms | sim up because catch-up runs (intended) |
| fps mean | 11.0 | 11.7 | soft-GPU — **ignore** as primary KPI |

GPU tier: **software** (SwiftShader). Owner iGPU fps is not claimed.

## Evidence

- Patches: `patches/0001-perf-hitch-raise-HITCH_FRAME_TICKS-4.5-6.5.patch`
- Focused tests log: `focused-tests.log`
- Scratch (local only): `vm-work/hitch-shed-floor` @ `39861b3b5de4eb22ef59f95e3d96155764ee9ea4`
- Raw probes: `/workspace/spaceface-scratch/hitch-hillclimb-20260922/`

## Risks for the importer

- A true 90–100 ms spike that used to hitch-cap will now take full catch-up (up to 4 ticks).
  Continuity tests pin that sustained 12 fps is not a hitch and a 120 ms hole still sheds.
- Do not lower the floor back to 4.5 without re-measuring soft-GPU game speed.
