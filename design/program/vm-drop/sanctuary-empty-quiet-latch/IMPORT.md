# IMPORT — sanctuary-empty-quiet-latch

## What it is

Quiet open flight `lawSecurity._enforceSanctuaryWithdrawals` residual after
#145 cones / #146 catch-nets: every tick still walked `aiShips`
(`isArmedNpc` / `isLawful` / target bag) while armed unlawful NPCs had no
chase/fire signal. Quiet latch short-circuits when no aggressive candidate
remains; wakes on membership, combat fire/damage seq, tactical AI wake, or
0.5 s rescan. Soft-GPU fps not claimed.

## Live path that would receive it

- `src/systems/lawSecurity.js` (sanctuary empty quiet latch + bench toggles)
- `test/sanctuary-empty-quiet-latch.test.mjs`

## How to apply

```bash
git am --ignore-space-change design/program/vm-drop/sanctuary-empty-quiet-latch/patches/*.patch
```

(`--ignore-space-change` because `lawSecurity.js` is CRLF on master; plain
`git am` can reject the hunks on whitespace alone.)

## What you did not wire

Nothing else. No bloom/default picture change. No dummy prewarm. Held
lifetimeSweep quiet-compact-skip / pose-rematch / sleeping-clocks /
dirty-publish / flying-early-latch / NPC visit / spatial stub / asteroid
settled / render-entity-frame retain / prepareFrame quiet-VFX /
applySnapshotPose / packCombatTable single-dirty / preStep-all-sleeping /
stampNearWork-empty / projectile-evidence surface-cadence / env-machinery far /
hazards far / weapons quiet residual deepen / impulseCharges empty /
updateDockRange far / spatialHash all-sleeping / customs cones (#145) /
catch-nets (#146) remain as prior. Owner applies from `patches/` in numeric
package order on master when importing. Stacks under registry.step /
lawSecurity residual after #145/#146.
