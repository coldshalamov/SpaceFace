# DONE — tactical-ai-quiet-latch

## Summary

Production quiet flight still paid `tacticalAI.update`'s cohort stamp /
squad+fodder steps / stack update every tick while shipLike had no
non-player AI-think interest. Quiet latch short-circuits after
classify+probe finds none; wakes on spawn (no activity → needs think) or
think-interest flip. **Injected-port fixtures keep every-tick cadence**
(`productionPortDefaults` gate). Soft-GPU fps not claimed. Picture
contract ON / unchanged.

Different angle from held preStep-all-sleeping / stampNearWork-empty.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `tacticalAI.update` × 20k; player-only shipLike. Before = latch OFF;
after = latch ON. Isolated Node child processes per package rebench.
Production create (ports via helpers only).

| | median | floor minSpeedup |
|---|---:|---:|
| player-only (5× isolated 11-pair floors) | **~6.13–6.91×** | **≥4.64×** |
| primary in-process npc0 (supporting) | ~6.96× | ≥5.08× |
| dormant-npc12 with empty roster stub (informational) | ~1.04× | (stub roster already thin; not the ship KPI) |

Package floor capture (5×11-pair isolated @ 20k npc0): medians ~6.13 / 6.91 /
6.58 / 6.57 / 6.54; mins across those runs ≥4.64×. Floor across package runs
**≥4.64×** (clears ≥1.5× bar). Dirty-wake proved: membership spawn / think
interest / bench toggle (`dirtyWakeOk: true`). Focused latch + prior suites
**82/82**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): `ai/stack.js:update` / tacticalAI under registry.step residual
after #138.

### Focused tests

`node --test test/tactical-ai-quiet-latch.test.mjs test/tactical-ai-production-cadence.test.mjs test/tactical-ai-id-reuse.test.mjs test/classify-early-quiet-latch.test.mjs test/classify-frame-quiet-retain.test.mjs test/classify-rock-visit-quiet-retain.test.mjs test/docking-corridor-far-quiet-latch.test.mjs test/poi-scan-all-identified-quiet-latch.test.mjs test/asteroid-field-interact-still-quiet-latch.test.mjs test/far-empty-quiet-latch.test.mjs test/optic-far-quiet-latch.test.mjs test/decode-runway-empty-far-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/fields-idle-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs`
→ **82/82** pass (latch / dormant wake / membership wake / bench toggle +
prior latch / cadence / id-reuse suites).

## Scratch

- Branch: `vm-work/hillclimb-20260924k`
- Tip: `fbd9cadb6c0d1cba84e391ad8a24006cda337b7b`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
