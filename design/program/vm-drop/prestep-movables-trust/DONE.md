# DONE — prestep-movables-trust

## Summary

Quiet `preStep` walked `index.movables` and re-checked `isMovableEntity` every
tick. Append already gates that lane via the same predicate; the re-check paid
`isDynamicPhysicsBodyEntity` → `authoredPhysicsBody` / `defaultDynamic` on the
quiet registry pole (profile: `authoredPhysicsBody` self under
`isMovableEntity` from `coreSystem`).

Production now trusts movables membership for the pose-snapshot walk. Mid-life
dynamic flips already require re-index for spatial/physics lanes.

## Before / after

### Offline microbench (primary — portable CPU)

220 ships + 40 fracture chunks × 80k ticks; before = `isMovableEntity` gate;
after = trust lane (alive check only). Isolated child processes.

| | Before | After | |
|---|---:|---:|---|
| wall | 181.4 ms | 79.4 ms | **~2.28×** |
| admit parity | — | match | |

Primary claim band **~2.19–2.28×** (repeated runs). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924w`
(Picture ON): idle **62.4%**, long tasks **17**; `authoredPhysicsBody` /
`isMovableEntity` under `core.preStep` / `registry.step`.

### Focused tests

entity-lifecycle-residency-recycle + core-coreSystem.review +
dynamic-physics-render-interpolation + performance-lifecycle-contracts +
pq-148-01-volatile-classes → **29/29** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-core-trust-movables-lane-in-preStep-pose-snapsh.patch`
- Scratch: `vm-work/hillclimb-20260924h` @ see `scratch-sha.txt`
- Microbench: `artifacts/prestep-movables-trust-microbench.json`
- Tests: `artifacts/focused-tests-prestep-movables-trust.log`

## Apply order

Independent. Prefer after #58. Stacks under registry.step / preStep residual.

## Risks

- An entity that flips out of movable without re-index would still receive
  prevPos snapshots (same class of staleness as spatial/physics lanes missing
  a re-index). Append/remove remain the membership authority.
