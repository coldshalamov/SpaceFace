# DONE — registry-step-dispatch

## Summary

Quiet production `registry.step` no longer visits idle combat-island owners every
tick. A cheap `contentWakeMask` (run / dock / wing / capital / massline sticky /
heat / cloak / machinery sector / planet / law) filters them from a reused scratch
queue; chronicler, difficultyDirector, titles, npcJobsRuntime, and traffic move to
the 2 Hz calendar. Indexed update loops in createRegistry.

## Before / after

### Portable microbench (primary KPI)

60k primary ticks; master-shaped 71-wide combat island with expensive quiet
early-outs on package-lifted owners vs content-gated quiet queue:

| scenario | master combat | quiet len | wall ms | speedup |
|---|---:|---:|---:|---:|
| Ceres quiet (`sector_ceres_belt`) | 71 | 47 | — | **~1.74×** |
| Deep-space quiet | 71 | 46 | — | **~2.88×** |

Soft-GPU fps not claimed. Hitch/worst not claimed this pass (portable dispatcher).

### Focused tests

`sim-clock-catchup` + `catchup-spiral` → **13/13** (11 sim-clock + 2 spiral).

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-sim-content-gate-idle-combat-systems-in-registr.patch`
- Scratch: `vm-work/registry-step-dispatch` @ `324ad3dd3`
- Microbench: `artifacts/registry-step-dispatch-microbench.json`
- Tests: `artifacts/focused-tests.log`
- Measured against master tip `37f50a70d`

## Apply order

Independent. Ships the digest “registry.step residual dispatcher” pole after
#37+#38 classify shrinks. Safe alone on master.

## Risks

- Heat / cloak / massline rely on sticky wake bits (telemetry `.active`, cloakToggle,
  energy < 1). A despawn path that clears heat without going through heat.update may
  leave a stale zone until the next heat event.
- environmentalMachinery stays awake on Ceres/Pallas/weather sectors by design.
- nemesis / surrenderRecovery intentionally not gated.
