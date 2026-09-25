# DONE — combat-status-subsystem-quiet-skip

## Summary

Quiet combat prePhysics residual under `registry.step` after #83: every tick
`statuses.advance` still paid `Object.keys(runtime.statuses).sort()` twice and
allocated a fresh `due[]` even when the combatant had no active or pending
statuses, and `applyPendingSubsystemTransitions` walked every subsystem id
looking for `pendingTransition` on quiet fleets. Cut: for-in empty-status
early-out + reused `dueScratch`; stash `pendingSubsystemTransitionCount` on
the runtime (create/schedule/consume) so quiet applyPending returns without
the walk. Soft-GPU fps not claimed.

## Before / after

### Offline microbench (primary — portable CPU)

Isolated Node child processes. 48 combatants × 6 subsystems × 50k ticks.
Before = status advance Object.keys×2 + due[] + full subsystem pending walk;
after = empty-status early-out + dueScratch + pending-count skip.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-48-combatant-status-subsystem-prephysics (primary, 9 isolated pairs) | **~6.39×** | **≥5.58×** |

Component probes (same shape): status-advance empty ~2.24× median (floor ≥2.07×);
subsystem-pending skip ~10.7× median (floor ≥8.25×). Soft-GPU fps not claimed.

Phase A cite: fresh stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON, soft-GPU; tip through #64): idle **65.2%**, long tasks **17**;
combat prePhysics / statuses.advance / applyPending under `registry.step`
after #83.

### Focused tests

seam-combat-statuses + seam-combat-subsystems + combat-attachments.review +
combat-trace-contract + orbit-cryo-reactions + mining-beam-heat-no-lockout +
inference-pic-09-starter-weapon-scar-heat + combat-attackHit.review +
combat-inertial-shunt-regression + perf-combat-count-gates +
heat-wanted-victim → **62/62** pass.

GPU tier: **software**. Owner iGPU fps not claimed.

## Evidence

- Patch: `patches/0001-perf-combat-quiet-skip-empty-status-advance-pending-.patch`
- Scratch: `vm-work/hillclimb-20260924i` @ see `scratch-sha.txt`
- Microbench: `artifacts/combat-status-subsystem-quiet-skip-microbench.json`
- Component: `artifacts/combat-status-advance-quiet-skip-microbench.json`,
  `artifacts/combat-subsystem-pending-quiet-skip-microbench.json`
- Tests: `artifacts/focused-tests-combat-status-subsystem-quiet-skip.log`

## Apply order

Stacks under registry.step / combat kernel residual after
#39+#50+#55+#56+#58+#59+#61+#66+#67+#69+#70+#82+#83. Apply after #83.

## Risks

- `scheduleSubsystemTransition` callers must pass `runtime` (6th arg) so the
  pending count stays accurate; production damage/repair paths do. Tests updated.
- Legacy callers that omit `runtime` still set `pendingTransition` but will not
  bump the count — applyPending would skip until another path arms a counted
  pending. No in-tree callers omit it after this package.
- Status early-out preserves `statusModifiersDirty` handling: dirty alone still
  enters advance and returns changed after clearing the flag.
