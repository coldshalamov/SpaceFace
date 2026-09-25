# DONE — persistent-beams-quiet-active-skip

## Summary

Quiet `PersistentCombatBeamPool.update` residual under prepareFrame / VFX after
#89: production maxBeams 16 still walked every frame while `activeCount===0`,
plus shader uniform time/pulse writes. `group.visible` was already false after
the last `_release`, so the scan was pure CPU with no picture effect.

Production now returns immediately when `activeCount===0` (still forces
`group.visible = false`). Busy beams still timeout-release and rewrite quads.

Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 16 quiet slots × 300k updates × 11 isolated
pairs. Before = capacity walk + uniform writes; after = activeCount===0
early-out.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-beams-active-zero-update (primary, 11 isolated pairs) | **~3.7×** | **≥3.09×** |

Primary: **~3.67×** median (floor minSpeedup ≥3.09×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
combat beam update under prepareFrame/VFX on quiet settled flight.

### Focused tests

`persistent-combat-beam-pool` → **4/4** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-render-quiet-skip-PersistentBeams-active0-3.7x.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/persistent-beams-quiet-active-skip-microbench.json`
- Tests: `artifacts/focused-tests-persistent-beams-quiet-active-skip.log`

## Apply order

Independent of #90. Stacks under prepareFrame / VFX residual. Clean on stacked
tip through #89.

## Risks

- Relies on `activeCount` staying accurate (claim ++, `_release` --, clear).
  Existing pool invariants; no new counter paths.
- Shader time/pulse uniforms do not advance while idle; next start resumes —
  acceptable (nothing drawn).
