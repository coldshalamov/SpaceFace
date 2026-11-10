# IMPORT — prune-evidence-cadence

## What it is

Cadence `pruneEvidence` on the grammar every-tick hot path (`PRUNE_EVIDENCE_CADENCE = 16`).
Root-create and serialize keep `force=true` so episode capacity checks and save compaction stay eager.

## How to apply

```bash
git fetch origin
git checkout -B import/prune-evidence-cadence origin/master
git am design/program/vm-drop/prune-evidence-cadence/patches/*.patch
node --test test/prune-evidence-cadence.test.mjs test/stunt-combo.test.mjs test/stunt-taxonomy.test.mjs test/pq-155-03-stunts-pay.test.mjs
```

Clean on bare master **`568d1358e`**.

## Evidence

- Portable multi-tick A/B (8000 ticks, aging journals): **~11.0×** aggregate wall; **~7.3×** worst single call
- Focused tests: **23/23** (cadence suite + stunt-combo + taxonomy + pq-155-03)
- Soft-GPU fps not claimed

## What this does not wire

- Does not change closeFieldIntervals cadence
- Does not merge to master (importer decides)
