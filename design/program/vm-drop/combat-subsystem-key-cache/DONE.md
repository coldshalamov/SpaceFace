# DONE — combat-subsystem-key-cache

## Summary

Cache `Object.keys(runtime.subsystems).sort()` on `runtime._sfSortedSubsystemIds`. Subsystem id sets are fixed at `ensureCombatant()`; damage only toggles destroyed flags. `applyPendingSubsystemTransitions` + `recomputeCombatantModifiers` stop re-sorting every combat `prePhysics`.

Focused: `seam-combat-subsystems` + `seam-combat-statuses` + `orbit-cryo-reactions` + `combat-attachments.review` → **24/24** pass.

## Before / after

### Offline microbench (primary — portable CPU)

300k iterations, 12 subsystems, three sorted walks (applyPending + 2× recompute shape):

| | Before (`Object.keys().sort()` ×3) | After (cached ids) | Speedup |
|---|---:|---:|---:|
| wall | **401.5 ms** | **53.7 ms** | **~7.5×** |

Phase A cite: hitch-hillclimb-fresh-20260923 — `applyPendingSubsystemTransitions` **36.3 ms** self / 60 s settled.

### Quiet soft-GPU crucible

Not required; primary signal is the offline microbench. GPU tier: **software**.

## Evidence

- Patch: `patches/0001-perf-combat-cache-sorted-subsystem-ids-on-combat-run.patch`
- Scratch: `vm-work/combat-subsystem-key-cache` @ `947d06c700f2b6eb1ed4f006d83f5a8f33794727`
- Microbench: `artifacts/combat-subsystem-key-cache-microbench.json`
- Tests: `artifacts/combat-subsystem-key-cache-focused-tests.log`
- Raw: `/workspace/spaceface-scratch/hitch-hillclimb-fresh-20260923/`
- Measured against master `35e519ebd`

## Apply order

Independent. Complements combat kernel; no dependency on other vm-drop hitch packages.

## Risks

- If a future path adds/removes `runtime.subsystems` keys without rebuilding the combatant runtime, clear `_sfSortedSubsystemIds` (or rebuild via `ensureCombatant`). Today only `ensureCombatant` populates the map.
