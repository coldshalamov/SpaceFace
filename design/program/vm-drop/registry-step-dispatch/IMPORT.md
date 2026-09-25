# IMPORT — registry-step-dispatch

## What it is

Content-gate idle combat-island systems out of the production `registry.step` queue
while their wake mask is clear, and move five simTime/ambient owners to the 2 Hz
calendar. Cuts the quiet dispatcher residual that sampling attributes under
`registry.step` after classify shrinks.

## How to apply

```bash
git fetch origin
git checkout -B import/registry-step-dispatch origin/master
git am design/program/vm-drop/registry-step-dispatch/patches/*.patch
node --test test/sim-clock-catchup.test.mjs test/catchup-spiral.test.mjs
```

Clean on bare master **`37f50a70d`**.

## Evidence

- Portable fair harness (master-shaped 71 combat island → quiet queue):
  - Ceres quiet: **~1.74×**
  - Deep-space quiet: **~2.88×**
- Focused tests: **11/11** (9 sim-clock-catchup + 2 catchup-spiral)  (sim-clock-catchup 11 + catchup-spiral 2)
- Soft-GPU fps not claimed

## What this does not wire

- Does not change catch-up table-only policy
- Does not gate nemesis / surrender (spawn / readopt safety)
- Does not merge to master (importer decides)
