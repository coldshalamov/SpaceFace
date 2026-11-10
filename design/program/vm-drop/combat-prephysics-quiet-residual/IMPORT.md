# IMPORT — combat-prephysics-quiet-residual

## What

Portable CPU cut for quiet combat kernel prePhysics residual after #83+#84:
warm `ensureCombatant` hit skips `ensureCombatState` + `resolveCombatProfile` +
`syncCombatantBounds` when `profileId` matches the expected type/explicit id;
gate `isDynamicPhysicsBodyEntity` / `applyMomentumSink` on scaled
`physicsResponse` or an active momentum-sink status; early-out `coolCombatHeat`
when `heat <= 0`.

## Live path (later, by owner)

- `src/combat/runtime.js` — `ensureCombatant`
- `src/combat/kernel.js` — `prePhysics`, `coolCombatHeat`

## Apply

```bash
git am design/program/vm-drop/combat-prephysics-quiet-residual/patches/*.patch
```

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
