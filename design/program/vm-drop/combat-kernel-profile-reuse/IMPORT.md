# IMPORT — combat-kernel-profile-reuse

## What

Portable CPU cut for quiet combat kernel pre/post physics: stash
`heatDissipationPerTick` on the combat runtime, skip catalog
`resolveCombatProfile` inside `coolCombatHeat`, gate the prePhysics trailing
`syncCombatantBounds` on `statusChanged`, and skip postPhysics
`ensureCombatant` when the runtime already exists from prePhysics.

## Live path (later, by owner)

- `src/combat/runtime.js` — `ensureCombatant`, `createCombatantRuntime`
- `src/combat/kernel.js` — `prePhysics`, `postPhysics`, `coolCombatHeat`

## Not wired

No live `src/` merge. Soft-GPU fps not claimed. Picture contract unchanged.
