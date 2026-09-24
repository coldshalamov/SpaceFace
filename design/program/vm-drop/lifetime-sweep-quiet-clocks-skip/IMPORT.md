# IMPORT — lifetime-sweep-quiet-clocks-skip

## What it is

Quiet Ceres `registry.step` → `lifetimeSweep` residual after held pose-rematch /
sleeping-clocks / compact-skip probes: when short-lived index lanes
(projectiles/fx/bombs/charges/pickups/payloads/mines/vectorMines/snares) are
empty and no shipLike carries `despawnAt`, the clocks walk only re-checks
Infinity-ttl movers whose POSE `preStep` already published. Skip that walk;
dirty publish + corpse compact still run. Dirty-wake on any short-lived lane
occupancy or shipLike `despawnAt` restores the full clocks path. Soft-GPU fps
not claimed.

## Live path that would receive it

- `src/core/coreSystem.js` (quiet short-lived-lane clocks skip + bench toggles)
- `test/lifetime-sweep-quiet-clocks-skip.test.mjs`

## How to apply

```bash
git am design/program/vm-drop/lifetime-sweep-quiet-clocks-skip/patches/*.patch
```

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
pose-rematch / sleeping-clocks / compact-skip / dirty-publish fair /
flying-early-latch / asteroid-motion sticky settled-skip / render-entity-frame
unchanged retain / prepareFrame quiet-VFX / applySnapshotPose / packCombatTable
single-dirty / asteroid-field empty / hazards / env-machinery / zoneAt /
preStep-all-sleeping remain held. Owner applies from `patches/` in numeric
package order on master when importing. Stacks under registry.step /
lifetimeSweep residual after #88+#140.
