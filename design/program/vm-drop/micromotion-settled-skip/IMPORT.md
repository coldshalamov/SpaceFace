# IMPORT — micromotion-settled-skip

## What it is

Quiet parked craft no longer pay full RCS/gimbal/bell/haul spring work every
`updateCraftMicroMotion` closure tick. Zero-G idle breath (Massline UVP) stays;
observed-motion RCS still runs when `angVel`/yaw changes; turret idle sweep and
drill stay on. Bench-only `setCraftMicroMotionSettledSkipForBench(false)` restores
the always-full path for A/B.

## How to apply

```bash
git fetch origin
git checkout -B import/micromotion-settled-skip origin/master
git am design/program/vm-drop/micromotion-settled-skip/patches/*.patch
node --test \
  test/ship-micro-motion.test.mjs \
  test/advanced-micro-motion.test.mjs \
  test/ship-locomotion-presentation.test.mjs \
  test/ship-pitch-presentation.test.mjs \
  test/entity-view-sync-band.test.mjs
```

## Picture

Untouched. Portable CPU only — soft-GPU fps not claimed.

## Apply order

Independent. Prefer after #56. Stacks under prepareFrame / syncEntityViews /
updateCraftMicroMotion residual.
