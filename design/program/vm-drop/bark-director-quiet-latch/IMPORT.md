# IMPORT — bark-director-quiet-latch

## What

Quiet latch for `barkDirector.update` when no eligible bark/hail/near-miss/stunt
work remains. Short-circuits `ensureActivityClassified` + living-actor
bark/hail census; wakes on membership, ship/drone spawn (`entity:spawned` /
`noteBarkWake`), combat/stunt/body-near-miss cues, or 0.5 s rescan.
Soft-GPU fps not claimed. Picture unchanged (observer-only radio).

## Apply

```bash
git am --ignore-space-change design/program/vm-drop/bark-director-quiet-latch/patches/*.patch
```

Onto master tip `97c88f92b` (verified → `52c70d05f`).

## Claims

Fresh registry.step / radio residual after #152 flybyFocus. Abs before
~7.6–8.0 µs/call clears thin-abs band (updateDockRange / impulseCharges /
lawSecurity residual). Outside held flybyFocus / pirate* / bounty / salvage /
sanctuary / cones / catch-nets / lifetimeSweep / classify / sync / quiet-VFX /
weapons residual deepen / lawSecurity thin residual clusters.

## Owner-GPU

None required. Portable CPU microbench is the KPI.
