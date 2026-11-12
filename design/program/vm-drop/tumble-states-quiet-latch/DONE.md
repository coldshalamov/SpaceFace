# DONE — tumble-states-quiet-latch

## Summary

Production quiet flight still paid `tumbleStates.update`'s shipLike walk +
RCS provenance scan every tick while no hull had tumble / rcs / recovery /
drive-disabled drift. Quiet latch short-circuits after a quiet walk finds
none; wakes on membership, impulse provenance generation, tumble begin, or
0.5 s rescan. Soft-GPU fps not claimed. Picture contract ON / unchanged.

Different angle from held preStep-all-sleeping and from render
tumble-body-language quiet-skip (#107).

## Before / after

### Offline microbench (primary — portable CPU)

Quiet `tumbleStates.update` × 30k; 24 NPC ships + player. Before = latch OFF;
after = latch ON. Isolated Node child processes per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| npc24 quiet (5×11-pair floors) | **~5.68–5.90×** | **≥4.17×** |
| primary in-process cite | ~5.73× | ≥5.26× |

Package floor capture (5×11-pair isolated @ 30k npc24): medians ~5.85 / 5.78 /
5.90 / 5.90 / 5.68; mins across those runs ≥4.17×. Floor across package runs
**≥4.17×** (clears ≥1.5× bar). Dirty-wake proved: impulse provenance /
begin-path clear (`dirtyWakeOk: true`). Focused latch + prior suites
**90/90**. Soft-GPU fps not claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac`
(Picture ON): registry.step residual after #139; tumbleStates shipLike walk
under that residual.

### Focused tests

`node --test test/tumble-states-quiet-latch.test.mjs test/tactical-ai-quiet-latch.test.mjs test/tactical-ai-production-cadence.test.mjs test/classify-early-quiet-latch.test.mjs test/classify-frame-quiet-retain.test.mjs test/classify-rock-visit-quiet-retain.test.mjs test/docking-corridor-far-quiet-latch.test.mjs test/poi-scan-all-identified-quiet-latch.test.mjs test/asteroid-field-interact-still-quiet-latch.test.mjs test/far-empty-quiet-latch.test.mjs test/optic-far-quiet-latch.test.mjs test/decode-runway-empty-far-quiet-latch.test.mjs test/bombs-empty-quiet-latch.test.mjs test/fields-idle-quiet-latch.test.mjs test/countermeasures-quiet-empty-latch.test.mjs test/inf-027-tumble-recovery.test.mjs`
→ **90/90** pass.

Functional: `inf-027-tumble-recovery` + `pq-031-02-npc-counterplay` +
`pq-030-01-snare` → **7/7** pass.

## Scratch

- Branch: `vm-work/hillclimb-20260924k`
- Tip: `bed5a3fa9eb9f81176e16aac64770b1d856801c6`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Restacked onto `origin/master` @ `4b28a8323`
