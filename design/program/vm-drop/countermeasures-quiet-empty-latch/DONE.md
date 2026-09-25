# DONE — countermeasures-quiet-empty-latch

## Summary

Quiet flight still walked every ship four times inside `countermeasures.update`
even with no CM/PDS fitted and no live timers. Production now quiet-latches when
interest is empty; wakes on deploy edge, membership, live cm/pds, or 0.5 s
fittings rescan. Soft-GPU fps not claimed. Picture contract ON / unchanged.

## Before / after

### Offline microbench (primary — portable CPU)

Quiet countermeasures.update × 60k; 64 ships, no CM/PDS interest. Before =
latch OFF (four ships walks); after = latch ON. Isolated Node child processes
per package rebench.

| | median | floor minSpeedup |
|---|---:|---:|
| quiet-empty-latch (primary, 11 pairs) | **~40.3–42.1×** | **≥7.17×** |

Package floor capture (5×11-pair runs @ 60k): medians ~40.3–42.1; mins
~7.17–8.02. Floor across package runs **≥7.17×** (clears ≥1.5× bar). Dirty-wake
proved: deploy edge → `quietLatched=false`; membership + fitted ECM/PDS →
unlatched. Focused quiet-latch + chaff-divert **6/6**. Soft-GPU fps not
claimed.

Phase A cite: stacked quiet profile `settled-45s-stacked-20260924ac` (Picture
ON): `countermeasures.update` **37** self under `registry.step` residual.

### Focused tests

`node --test test/countermeasures-quiet-empty-latch.test.mjs test/countermeasure-chaff-divert.test.mjs`
→ **6/6** pass (latch / deploy wake / membership wake / bench toggle / fitted
player never latches / chaff divert).

## Evidence

- Patch: `patches/0001-perf-combat-quiet-latch-countermeasures-when-no-CM-PDS.patch`
- Scratch: `vm-work/hillclimb-20260924k` @ `c6089caeb`
- Worktree: `/workspace/spaceface-scratch/hillclimb-20260924h`
- Microbench: `artifacts/countermeasures-quiet-empty-latch-microbench.json`
- Floor: `artifacts/countermeasures-quiet-empty-latch-floor-summary.json`
- Tests: `artifacts/focused-tests-countermeasures-quiet-empty-latch.log`

## Apply order

After `classify-frame-quiet-retain` (#128). Independent of classify packages;
stacks under registry.step / countermeasures residual.

## Risks

- Mid-life fitting without membership bump waits up to ~0.5 s (30 ticks) before
  rescan arms interest — deploy edge still wakes immediately.
- Bench toggle off restores always-walk for A/B; production default is latch on.
