# DONE — phased-explosion-quiet-active-skip

## Summary

Quiet `PhasedExplosionLifecycle.update` residual under prepareFrame / VFX after
#89: production capacity 40 still walked every frame while `activeCount===0`,
only to `continue` on inactive entries. Emit never ran for those slots, so the
scan was pure CPU with no picture effect.

Production now returns immediately when `activeCount===0`. Busy pools still
advance age/phases and release on schedule.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 40 quiet slots × 200k updates × 11 isolated
pairs. Before = capacity alive-check walk every tick; after = activeCount===0
early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-explosion-active-zero-update (primary, 11 isolated pairs) | **~7.0×** | **≥6.15×** |

Primary: **~6.96×** median (floor minSpeedup ≥6.15×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
`_explosions.update` under prepareFrame/VFX on quiet settled flight.

### Focused tests

`phased-explosion-lifecycle` + `impact-event-grammar` +
`entity-killed-presentation-receipt` → **34/34** pass.

Pre-existing unrelated: `physics-spectacle-cause-vfx` collision-rungs harness
(`_pendingDetonations` undefined on tip without this patch — same baseline).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-PhasedExplosion-active0-7x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/phased-explosion-quiet-active-skip-microbench.json`
- Tests: `artifacts/focused-tests-phased-explosion-quiet-active-skip.log`

## Apply order

Independent of combat/#88–#89 lanes. Stacks under prepareFrame / VFX residual.
Clean on stacked tip through #89.

## Risks

- Relies on `activeCount` staying accurate (start ++, `_release` --, clear).
  Existing pool invariants; no new counter paths.
- If `activeCount` were falsely 0 while entries active, those entries would
  freeze until next start — not observed; start always increments.
