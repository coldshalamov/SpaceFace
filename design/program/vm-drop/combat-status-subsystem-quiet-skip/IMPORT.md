# IMPORT — combat-status-subsystem-quiet-skip

## What

Portable CPU cut for quiet combat kernel prePhysics residual after #83:
early-out `statuses.advance` when there are no active/pending statuses and no
dirty modifier flag (skip `Object.keys().sort()` ×2 + fresh `due[]`), reuse a
service-local `dueScratch`, and skip `applyPendingSubsystemTransitions`'
sorted-subsystem walk when `pendingSubsystemTransitionCount === 0` and there
is no dirty flag. `scheduleSubsystemTransition` now optionally takes `runtime`
to keep the pending count honest.

## Live path (later, by owner)

- `src/combat/statuses.js` — `advance`
- `src/combat/subsystems.js` — `applyPendingSubsystemTransitions`, `scheduleSubsystemTransition`
- `src/combat/runtime.js` — `createCombatantRuntime` (`pendingSubsystemTransitionCount`)
- `test/seam-combat-subsystems.test.mjs` — pass `runtime` into schedule helpers

## Apply

```bash
git am design/program/vm-drop/combat-status-subsystem-quiet-skip/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
