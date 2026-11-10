# IMPORT — combat-subsystem-key-cache

## What it is

Cache sorted subsystem id lists on the combat runtime so `applyPendingSubsystemTransitions` / `recomputeCombatantModifiers` skip `Object.keys().sort()` every prePhysics.

## How to apply

```bash
git fetch origin
git checkout -B import/combat-subsystem-key-cache origin/master
git am design/program/vm-drop/combat-subsystem-key-cache/patches/*.patch
node --test \
  test/seam-combat-subsystems.test.mjs \
  test/seam-combat-statuses.test.mjs \
  test/orbit-cryo-reactions.test.mjs \
  test/combat-attachments.review.test.mjs
```

## Picture

Untouched.

## Apply order

Independent.
